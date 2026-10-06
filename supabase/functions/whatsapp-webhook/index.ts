import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const reply = (status: number, text: string) => new Response(text, { status });
const encoder = new TextEncoder();

Deno.serve(async req => {
  const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    return verifyToken && query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === verifyToken
      ? reply(200, query.get('hub.challenge') || '') : reply(403, 'forbidden');
  }
  if (req.method !== 'POST') return reply(405, 'method_not_allowed');
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!secret || !phoneId) return reply(503, 'not_configured');
  const signature = req.headers.get('x-hub-signature-256') || '';
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return reply(401, 'invalid_signature');
  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g)!, byte => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(raw))) return reply(401, 'invalid_signature');
  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, 'invalid_json'); }
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return reply(200, 'ignored');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  for (const entry of body.entry) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value;
      if (change.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId) continue;
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const text = String(message.text?.body || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (/^(STOP|ARRET|DESABONNER|DESABONNEMENT|UNSUBSCRIBE)$/.test(text) && /^[1-9]\d{7,14}$/.test(message.from || '')) {
          const { error } = await db.from('whatsapp_preferences').update({ enabled: false, consent_at: null, updated_at: new Date().toISOString() }).eq('phone', '+' + message.from);
          if (error) return reply(500, 'optout_failed');
        }
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (typeof status.id !== 'string' || !['sent','delivered','read','failed'].includes(status.status)) continue;
        const allowedPrevious = { sent: ['sent'], delivered: ['sent','delivered'], read: ['sent','delivered','read'], failed: ['sent','failed'] }[status.status as 'sent' | 'delivered' | 'read' | 'failed'];
        const { error } = await db.from('wallet_whatsapp_outbox').update({ delivery_status: status.status })
          .eq('message_id', status.id).or(`delivery_status.is.null,delivery_status.in.(${allowedPrevious.join(',')})`);
        if (error) return reply(500, 'status_update_failed');
      }
    }
  }
  return reply(200, 'ok');
});
