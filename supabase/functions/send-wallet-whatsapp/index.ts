import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { walletTemplatePayload } from '../_shared/wallet-whatsapp.ts';

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Internal scheduled worker. Never called by the payment flow or a parent client.
Deno.serve(async req => {
  if (req.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
  const workerSecret = Deno.env.get('WHATSAPP_WORKER_SECRET');
  if (!workerSecret || req.headers.get('x-whatsapp-worker-secret') !== workerSecret) return respond(401, { error: 'unauthorized' });
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const version = Deno.env.get('WHATSAPP_GRAPH_VERSION');
  const parentTemplate = Deno.env.get('WHATSAPP_PARENT_TEMPLATE');
  const providerTemplate = Deno.env.get('WHATSAPP_PROVIDER_TEMPLATE');
  const language = Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'fr';
  if (!accessToken || !phoneId || !/^\d+$/.test(phoneId) || !version || !/^v\d+\.\d+$/.test(version) ||
    !parentTemplate || !providerTemplate) return respond(503, { error: 'whatsapp_not_configured' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: jobs, error } = await db.rpc('claim_wallet_whatsapp_receipts', { p_limit: 10 });
  if (error) return respond(500, { error: 'queue_unavailable' });
  let accepted = 0;
  let failed = 0;
  let unknown = 0;
  for (const job of jobs || []) {
    // Recheck consent, account state and order immediately before network delivery.
    const [{ data: prefs, error: prefsError }, { data: order, error: orderError }, { data: config, error: configError }] = await Promise.all([
      db.from('whatsapp_preferences').select('phone, enabled').eq('user_id', job.recipient_user_id).eq('recipient_role', job.recipient_role).maybeSingle(),
      db.from('pending_payments').select('status').eq('order_id', job.order_id).maybeSingle(),
      db.from('whatsapp_notification_settings').select('delivery_enabled').eq('id', true).single(),
    ]);
    let providerValid = true;
    if (job.recipient_role === 'provider') {
      const { data, error } = await db.from('providers').select('is_active, user_id').eq('id', job.provider_id).maybeSingle();
      providerValid = !error && !!data?.is_active && data.user_id === job.recipient_user_id;
    }
    let status = 'cancelled';
    let errorCode: string | null = 'no_longer_eligible';
    let messageId: string | null = null;
    if (!prefsError && !orderError && !configError && config?.delivery_enabled && providerValid && prefs?.enabled && prefs.phone === job.phone && order?.status === 'completed') {
      let payload;
      try { payload = walletTemplatePayload(job.phone, job.recipient_role === 'parent' ? parentTemplate : providerTemplate, language, job.receipt); }
      catch { status = 'failed'; errorCode = 'invalid_receipt'; }
      if (payload) {
        try {
          const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
          });
          const body = await response.json();
          messageId = typeof body.messages?.[0]?.id === 'string' ? body.messages[0].id : null;
          if (response.ok && messageId) { status = 'accepted'; errorCode = null; }
          else if (response.status >= 400 && response.status < 500) {
            status = 'failed'; errorCode = `meta_${Number(body.error?.code) || response.status}`;
          } else { status = 'unknown'; errorCode = 'ambiguous_provider_response'; }
        } catch { status = 'unknown'; errorCode = 'ambiguous_network_result'; }
      }
    }
    // A worker crash leaves sending -> unknown, never an automatic duplicate send.
    const { error: saveError } = await db.from('wallet_whatsapp_outbox').update({ status, error_code: errorCode, message_id: messageId })
      .eq('id', job.id).eq('status', 'sending').eq('claim_token', job.claim_token);
    if (saveError) return respond(500, { error: 'delivery_result_not_saved' });
    if (status === 'accepted') accepted++;
    if (status === 'failed') failed++;
    if (status === 'unknown') unknown++;
  }
  return respond(200, { processed: jobs?.length || 0, accepted, failed, unknown });
});
