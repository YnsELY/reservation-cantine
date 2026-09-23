import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: corsHeaders })

async function deliver(db: any, payload: any) {
  const { title, body, notificationType, data = {}, userType } = payload
  const userIds = payload.userIds || (payload.userId ? [payload.userId] : [])
  if (!title || !body || !notificationType || !Array.isArray(userIds) || userIds.length > 1000 || payload.tokens) {
    throw new Error('Invalid server notification')
  }
  const { data: rows, error } = await db.rpc('active_push_recipients', { p_user_ids: userIds, p_user_type: userType || null })
  if (error) throw error
  const tokens = [...new Set<string>((rows || []).map((row: any) => row.push_token))]
  const messages = tokens.filter(t => /^(ExponentPushToken|ExpoPushToken)\[/.test(t)).map(to => ({
    to, title, body, data: { ...data, notificationType }, sound: 'default', priority: 'high', channelId: 'default',
  }))
  let sent = 0
  for (let offset = 0; offset < messages.length; offset += 100) {
    const batch = messages.slice(offset, offset + 100)
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch),
    })
    if (!response.ok) throw new Error('Push delivery unavailable')
    const result = await response.json()
    for (const [index, ticket] of (result.data || []).entries()) {
      if (ticket.status === 'ok') sent++
      if (ticket.details?.error === 'DeviceNotRegistered' && batch[index]) {
        await db.from('user_push_tokens').update({ is_active: false }).eq('push_token', batch[index].to)
      }
    }
  }
  for (const uid of userIds) {
    await db.from('notification_logs').insert({
      user_id: uid, user_type: userType || 'parent', notification_type: notificationType,
      title, body, data, status: sent > 0 ? 'sent' : 'failed', sent_at: sent > 0 ? new Date().toISOString() : null,
    })
  }
  return { sent, total: messages.length }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' })
  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || ''
    if (!token || !key) return reply(401, { error: 'Authentication required' })
    const db = createClient(Deno.env.get('SUPABASE_URL')!, key)
    // Only the actual server credential permits server-composed messages. Merely
    // possessing a signed user JWT (or claiming role=service_role) is insufficient.
    if (token === key) return reply(200, { success: true, ...await deliver(db, await req.json()) })
    const { data: identity, error: authError } = await db.auth.getUser(token)
    if (authError || !identity.user) return reply(401, { error: 'Session expired' })
    const payload = await req.json()
    if (Object.keys(payload).some(k => k !== 'menuIds') || !Array.isArray(payload.menuIds) || !payload.menuIds.length ||
        payload.menuIds.length > 50 || payload.menuIds.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
      return reply(403, { error: 'Only recorded menu events can be requested by the application' })
    }
    const { data: provider } = await db.from('providers').select('is_active').eq('user_id', identity.user.id).maybeSingle()
    const { data: admin } = await db.from('parents').select('is_admin').eq('user_id', identity.user.id).maybeSingle()
    if ((!provider?.is_active && !admin?.is_admin) || provider?.is_active === false) return reply(403, { error: 'Access denied' })
    const { data: events, error } = await db.rpc('claim_menu_notification_events', { p_menu_ids: payload.menuIds, p_actor: identity.user.id })
    if (error) throw error
    let sent = 0
    for (const event of events || []) {
      try {
        const result = await deliver(db, {
          userId: event.school_id, userType: 'school', title: event.title, body: event.body,
          data: event.data, notificationType: 'menu_deleted_school',
        })
        sent += result.sent
        await db.from('menu_notification_events').update({ state: 'sent' }).eq('id', event.id)
      } catch {
        await db.from('menu_notification_events').update({ state: 'failed' }).eq('id', event.id)
        return reply(502, { error: 'Notification delivery unavailable' })
      }
    }
    return reply(200, { success: true, sent })
  } catch {
    return reply(500, { error: 'Notification unavailable' })
  }
})
