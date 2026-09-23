import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers })
const terminalFailures = ['DECLINED', 'CANCELLED', 'ERROR', 'AUTH_REVERSED']
async function sign(key: string, message: string) {
  const encoder = new TextEncoder()
  const signingKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(message))))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || ''
    if (!token) return reply(401, { error: 'Authentification requise' })
    const { data: identity, error: authError } = await db.auth.getUser(token)
    if (authError || !identity.user) return reply(401, { error: 'Session expirée' })
    const { orderId } = await req.json()
    if (typeof orderId !== 'string' || orderId.length > 100) return reply(400, { error: 'Référence invalide' })
    const { data: parent } = await db.from('parents').select('id,is_admin').eq('user_id', identity.user.id).maybeSingle()
    if (!parent) return reply(403, { error: 'Compte parent requis' })
    const { data: payment, error: lookupError } = await db.from('pending_payments').select('*').eq('order_id', orderId).single()
    if (lookupError || !payment || (!parent.is_admin && payment.parent_id !== parent.id)) return reply(404, { error: 'Paiement introuvable' })
    let checked = false
    // Existing completed/failed callbacks already provide an authenticated final state.
    if (terminalFailures.includes(payment.payzone_status) && !payment.released_at && payment.status === 'failed') {
      const { error } = await db.rpc('release_failed_checkout', { p_order_id: orderId, p_transaction_id: payment.charge_id, p_status: payment.payzone_status })
      if (error) return reply(409, { error: 'Le paiement et la cagnotte doivent être rapprochés par le support.' })
      checked = true
    } else if (!['completed', 'refunded'].includes(payment.status) && !payment.released_at) {
      const caller = Deno.env.get('PAYZONE_API_CALLER_NAME')
      const secret = Deno.env.get('PAYZONE_API_CALLER_PASSWORD')
      const merchant = Deno.env.get('PAYZONE_MERCHANT_ACCOUNT')
      const callbackKey = Deno.env.get('PAYZONE_NOTIFICATION_KEY')
      if (caller && secret && merchant && callbackKey) {
        const base = new URL(Deno.env.get('PAYZONE_URL') || 'https://payment.payzone.ma/pwthree/launch').origin
        if (!['https://payment.payzone.ma', 'https://payment-sandbox.payzone.ma'].includes(base)) throw new Error('Invalid PayZone host')
        const path = `/api/v3/charges/${encodeURIComponent(payment.charge_id)}`
        const timestamp = String(Math.floor(Date.now() / 1000))
        const response = await fetch(base + path, { headers: {
          'X-MerchantAccount': merchant, 'X-CallerName': caller, 'X-HMAC-Timestamp': timestamp,
          'X-HMAC-Signature': await sign(secret, caller + merchant + timestamp + path),
        }, signal: AbortSignal.timeout(10000) })
        // A missing charge is not proof that an old paywall cannot still be paid.
        if (!response.ok) return reply(200, { success: true, payment, checked: false, message: 'La banque ne confirme pas encore un résultat définitif. Conservez cette référence et contactez le support si le paiement reste bloqué.' })
        const charge = await response.json()
        if (charge.id !== payment.charge_id || charge.merchantAccount !== merchant ||
            charge.lineItem?.currency !== 'MAD' || !Number.isFinite(Number(charge.lineItem?.amount)) ||
            Math.round(Number(charge.lineItem.amount) * 100) !== Math.round(Number(payment.total_amount) * 100)) {
          return reply(409, { error: 'Réponse bancaire incohérente. Rapprochement manuel requis.' })
        }
        if (['CHARGED', 'REFUNDED', ...terminalFailures].includes(charge.status)) {
          // Use the same idempotent completion/refund/notification path as a webhook.
          const body = JSON.stringify({ ...charge, orderId })
          const result = await fetch(`${url}/functions/v1/payzone-callback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-callback-signature': await sign(callbackKey, body) }, body,
          })
          if (!result.ok) return reply(409, { error: 'Résultat bancaire reçu. La commande doit être rapprochée par le support avant un nouveau paiement.' })
        }
        checked = true
        await db.from('pending_payments').update({ last_checked_at: new Date().toISOString() }).eq('order_id', orderId)
      }
    } else checked = true
    const { data: latest, error: refreshError } = await db.from('pending_payments').select('*').eq('order_id', orderId).single()
    if (refreshError) throw refreshError
    return reply(200, { success: true, payment: latest, checked,
      message: checked ? undefined : 'Le résultat bancaire n’est pas encore confirmé. Vous pouvez reprendre ce même paiement avant la clôture des commandes. Sinon, contactez le support avec sa référence.' })
  } catch {
    return reply(503, { error: 'Vérification bancaire indisponible. Le résultat reste à vérifier avant de relancer un paiement.' })
  }
})
