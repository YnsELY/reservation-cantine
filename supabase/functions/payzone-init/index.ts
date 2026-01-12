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
const PAYZONE_URL = Deno.env.get('PAYZONE_URL') || 'https://payment-sandbox.payzone.ma/pwthree/launch'
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
    const { parentId, cartItems, totalAmount, customerEmail, customerName }: PaymentRequest = await req.json()

    // Validation
    if (!parentId || !cartItems || cartItems.length === 0 || !totalAmount) {
      return new Response(
        JSON.stringify({ error: 'Paramètres manquants' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Vérifier que les credentials sont configurés
    if (!PAYZONE_MERCHANT_ACCOUNT || !PAYZONE_SECRET_KEY) {
      console.error('PayZone credentials not configured')
      return new Response(
        JSON.stringify({ error: 'Configuration PayZone manquante' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Créer un ID de commande unique
    const orderId = `CK_${Date.now()}_${parentId.substring(0, 8)}`
    const chargeId = `CHG_${Date.now()}`
    const timestamp = Math.floor(Date.now() / 1000)

    // Construire la description des articles
    const description = cartItems
      .map(item => `${item.menu.meal_name} - ${item.child.first_name}`)
      .join(', ')
      .substring(0, 250)

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
      ...(customerEmail && { customerEmail }),
      ...(customerName && { customerName }),

      // Charge parameters
      chargeId: chargeId,
      orderId: orderId,
      price: totalAmount.toString(),
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

    // Initialiser Supabase pour sauvegarder la transaction en attente
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Sauvegarder la transaction en attente
    const { error: insertError } = await supabase
      .from('pending_payments')
      .insert({
        order_id: orderId,
        charge_id: chargeId,
        parent_id: parentId,
        cart_items: cartItems,
        total_amount: totalAmount,
        status: 'pending',
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Error saving pending payment:', insertError)
      // On continue quand même car le paiement peut être récupéré via le callback
    }

    // Retourner les données pour le POST vers PayZone
    return new Response(
      JSON.stringify({
        success: true,
        paywallUrl: PAYZONE_URL,
        payload: jsonPayload,
        signature: signature,
        orderId: orderId,
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
