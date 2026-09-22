// Supabase Edge Function: payzone-init
// Cette fonction initialise un paiement PayZone et retourne l'URL de redirection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration PayZone (à configurer dans les secrets Supabase)
const PAYZONE_MERCHANT_ACCOUNT = Deno.env.get('PAYZONE_MERCHANT_ACCOUNT') || ''
const PAYZONE_SECRET_KEY = Deno.env.get('PAYZONE_SECRET_KEY') || ''
const PAYZONE_URL = Deno.env.get('PAYZONE_URL') || 'https://payment.payzone.ma/pwthree/launch'
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://childrens-kitchen.netlify.app'

interface PaymentRequest {
  parentId: string
  cartItems: Array<{
    id: string
    child_id: string
    menu_id: string
    date: string
    supplements: any[]
    annotations: string | null
    total_price: number
    child: { first_name: string; last_name: string }
    menu: { meal_name: string }
  }>
  totalAmount: number
  customerEmail?: string
  customerName?: string
  appliedCredits?: Array<{ credit_id: string; amount: number }>
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { parentId, cartItems, totalAmount, appliedCredits = [] }: PaymentRequest = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '')
    if (!token) return new Response(JSON.stringify({ error: 'Authentification requise' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: identity, error: authError } = await supabase.auth.getUser(token)
    if (authError || !identity.user) return new Response(JSON.stringify({ error: 'Session expirée' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: parent, error: parentError } = await supabase.from('parents')
      .select('id, email, first_name, last_name').eq('user_id', identity.user.id).eq('id', parentId).single()
    if (parentError || !parent) return new Response(JSON.stringify({ error: 'Compte parent introuvable' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!Array.isArray(cartItems) || !cartItems.length || !Number.isFinite(totalAmount) || totalAmount < 0) {
      return new Response(JSON.stringify({ error: 'Panier ou montant invalide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (totalAmount > 0 && (!PAYZONE_MERCHANT_ACCOUNT || !PAYZONE_SECRET_KEY)) {
      throw new Error('Configuration PayZone manquante')
    }
    // The database validates prices/consent and reserves credit + child/day slots
    // in one transaction. A retry returns the original checkout and charge ID.
    const { data: payment, error: prepareError } = await supabase.rpc('prepare_meal_checkout', {
      p_parent_id: parent.id, p_items: cartItems, p_bank_amount: totalAmount, p_credits: appliedCredits,
    })
    if (prepareError) return new Response(JSON.stringify({ error: prepareError.message }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!payment) throw new Error('Commande non enregistrée')
    const orderId = payment.order_id
    if (payment.payzone_status === 'REFUNDED') return new Response(JSON.stringify({ error: 'Ce paiement a été remboursé. Contactez le support si votre cagnotte doit être régularisée.' }), { status: 409, headers: corsHeaders })
    if (payment.status === 'completed') return new Response(JSON.stringify({
      success: true, completed: true, orderId, totalAmount: payment.total_amount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (payment.payzone_status === 'CHARGED') return new Response(JSON.stringify({
      error: 'Ce paiement a déjà été reçu. Consultez vos commandes ou contactez le support avant de recommencer.',
    }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!PAYZONE_MERCHANT_ACCOUNT || !PAYZONE_SECRET_KEY) throw new Error('Configuration PayZone manquante')
    const chargeId = payment.charge_id
    const timestamp = Math.floor(Date.now() / 1000)
    const description = payment.cart_items
      .map((item: any) => `${item.menu.meal_name} - ${item.child.first_name}`)
      .join(', ').substring(0, 250)

    // Construire le payload PayZone selon la documentation
    const payload = {
      // Authentication parameters
      merchantAccount: PAYZONE_MERCHANT_ACCOUNT,
      timestamp: timestamp,
      skin: 'vps-1-vue',

      // Customer parameters
      customerId: parentId,
      customerCountry: 'MA',
      customerLocale: 'fr_FR',
      ...(parent.email && { customerEmail: parent.email }),
      customerName: `${parent.first_name} ${parent.last_name}`,

      // Charge parameters
      chargeId: chargeId,
      orderId: orderId,
      price: String(payment.total_amount),
      currency: 'MAD',
      description: description,

      // Deep linking mode
      mode: 'DEEP_LINK',
      paymentMethod: 'CREDIT_CARD',
      showPaymentProfiles: false,

      // URLs de retour
      // Le callback va directement vers la Edge Function Supabase
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payzone-callback`,
      // Les URLs de succès/échec/annulation redirigent vers l'app
      successUrl: `${APP_BASE_URL}/payment-success?orderId=${orderId}`,
      failureUrl: `${APP_BASE_URL}/payment-failure?orderId=${orderId}`,
      cancelUrl: `${APP_BASE_URL}/payment-cancel?orderId=${orderId}`,
    }

    // Encoder et signer le payload
    const jsonPayload = JSON.stringify(payload)
    const signature = await sha256(PAYZONE_SECRET_KEY + jsonPayload)

    // Retourner les données pour le POST vers PayZone
    return new Response(
      JSON.stringify({
        success: true,
        paywallUrl: PAYZONE_URL,
        payload: jsonPayload,
        signature: signature,
        orderId: orderId,
        reused: payment.reused,
        totalAmount: Number(payment.total_amount),
        creditAmount: (payment.applied_credits || []).reduce((sum: number, c: any) => sum + Number(c.amount), 0),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in payzone-init:', error)
    return new Response(
      JSON.stringify({ error: 'Erreur lors de l\'initialisation du paiement' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
