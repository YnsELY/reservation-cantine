import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerParent } = await supabaseAdmin
      .from('parents')
      .select('is_admin')
      .eq('user_id', callerUser.id)
      .maybeSingle()

    if (!callerParent?.is_admin) {
      return new Response(JSON.stringify({ error: 'Accès refusé : réservé aux administrateurs' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { schoolName, email, password } = await req.json()

    if (!schoolName || !email || !password) {
      return new Response(JSON.stringify({ error: 'Nom, email et mot de passe requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create the auth user without sending confirmation email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    })

    if (createError) {
      const message = createError.message.includes('already registered')
        ? 'Cette adresse email est déjà utilisée'
        : createError.message
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessCode = `SCH-${Date.now().toString(36).toUpperCase()}`

    const { data: school, error: insertError } = await supabaseAdmin
      .from('schools')
      .insert({
        user_id: newUser.user.id,
        name: schoolName.trim(),
        contact_email: email.trim().toLowerCase(),
        access_code: accessCode,
        is_school_user: true,
      })
      .select()
      .single()

    if (insertError) {
      // Roll back auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(console.error)
      throw insertError
    }

    return new Response(JSON.stringify({ success: true, school }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in create-school-account:', error)
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
