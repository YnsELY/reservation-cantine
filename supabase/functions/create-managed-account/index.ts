import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || ''
    const { data: identity, error: authError } = await db.auth.getUser(token)
    if (authError || !identity.user) return reply(401, { error: 'Session expirée' })
    const { data: admin, error: roleError } = await db.from('parents').select('is_admin').eq('user_id', identity.user.id).maybeSingle()
    if (roleError || !admin?.is_admin) return reply(403, { error: 'Accès administrateur requis' })
    const input = await req.json()
    const { accountType, pin } = input
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    if (!['school', 'provider'].includes(accountType) || !name || name.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        (accountType === 'provider' && !/^\d{4}$/.test(pin || ''))) {
      return reply(400, { error: 'Vérifiez le nom, l’email et le PIN du prestataire.' })
    }
    // generateLink creates the invited identity without sending an email. The admin
    // communicates the one-time link; the account owner chooses their own password.
    const { data: invitation, error: inviteError } = await db.auth.admin.generateLink({
      type: 'invite', email,
      options: { redirectTo: `${Deno.env.get('APP_BASE_URL') || 'https://childrens-kitchen.netlify.app'}/reset-password` },
    })
    if (inviteError || !invitation?.user?.id || !invitation.properties?.action_link) {
      return reply(400, { error: 'Impossible de créer ce compte. Vérifiez si cet email est déjà utilisé.' })
    }
    const userId = invitation.user.id
    const record: Record<string, unknown> = accountType === 'provider'
      ? { user_id: userId, company_name: name, name, email, contact_email: email, pin, is_active: true, must_change_credentials: true }
      : { user_id: userId, name, contact_email: email, access_code: `SCH-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`, is_school_user: true }
    const { error: profileError } = await db.from(accountType === 'provider' ? 'providers' : 'schools').insert(record)
    if (profileError) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(userId)
      if (cleanupError) console.error('Managed account cleanup required', { userId })
      return reply(500, { error: 'Création du profil impossible. Contactez le support avant de réessayer.' })
    }
    return reply(200, { success: true, activationLink: invitation.properties.action_link })
  } catch {
    return reply(500, { error: 'Création du compte indisponible. Réessayez plus tard.' })
  }
})
