// Supabase Edge Function: payzone-callback
// Cette fonction reçoit les notifications de PayZone et valide les paiements

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-signature',
}

// Configuration PayZone
const PAYZONE_NOTIFICATION_KEY = Deno.env.get('PAYZONE_NOTIFICATION_KEY') || ''

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const messageData = encoder.encode(message)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Récupérer le body brut pour la vérification de signature
    const rawBody = await req.text()

    // Logger tous les headers pour debug
    console.log('=== PayZone Callback Debug ===')
    console.log('Headers received:')
    for (const [key, value] of req.headers.entries()) {
      console.log(`  ${key}: ${value}`)
    }
    console.log('Raw body:', rawBody)

    // Récupérer la signature - PayZone peut utiliser différents noms d'header
    const receivedSignature =
      req.headers.get('x-callback-signature') ||
      req.headers.get('x-signature') ||
      req.headers.get('signature') ||
      req.headers.get('x-payzone-signature') ||
      ''

    console.log('Received signature:', receivedSignature)

    // Vérifier la signature si la clé de notification est configurée ET si une signature est reçue
    if (PAYZONE_NOTIFICATION_KEY && receivedSignature) {
      const calculatedSignature = await hmacSha256(PAYZONE_NOTIFICATION_KEY, rawBody)
      console.log('Calculated signature:', calculatedSignature)

      if (calculatedSignature.toLowerCase() !== receivedSignature.toLowerCase()) {
        console.error('Signature mismatch! Rejecting callback.')
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        console.log('Signature validated successfully')
      }
    } else if (!receivedSignature) {
      console.warn('No signature header received from PayZone - rejecting')
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parser la notification
    const notification = JSON.parse(rawBody)

    console.log('PayZone notification received:', JSON.stringify(notification, null, 2))

    const {
      id,
      orderId,
      status,
      lineItem,
      transactions,
      paymentType,
      paymentMethod,
    } = notification

    // Initialiser Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Récupérer le paiement en attente
    const { data: pendingPayment, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('order_id', orderId)
      .single()

    if (fetchError || !pendingPayment) {
      console.error('Pending payment not found for orderId:', orderId)
      // On retourne 200 pour éviter les retries inutiles de PayZone
      return new Response(
        JSON.stringify({ success: true, message: 'Order not found but acknowledged' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Traiter selon le statut
    if (status === 'CHARGED') {
      // Paiement réussi - créer les réservations
      const cartItems = pendingPayment.cart_items

      const reservations = cartItems.map((item: any) => ({
        parent_id: pendingPayment.parent_id,
        child_id: item.child_id,
        menu_id: item.menu_id,
        date: item.date,
        supplements: item.supplements || [],
        annotations: item.annotations,
        total_price: item.total_price,
        payment_status: 'paid',
        payment_intent_id: id, // ID de transaction PayZone
      }))

      // Insérer les réservations
      const { error: insertError } = await supabase
        .from('reservations')
        .insert(reservations)

      if (insertError) {
        console.error('Error creating reservations:', insertError)
        return new Response(
          JSON.stringify({ error: 'Erreur lors de la création des réservations' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Supprimer les articles du panier
      const cartItemIds = cartItems.map((item: any) => item.id)
      await supabase
        .from('cart_items')
        .delete()
        .in('id', cartItemIds)

      // Mettre à jour le statut du paiement en attente
      await supabase
        .from('pending_payments')
        .update({
          status: 'completed',
          payzone_transaction_id: id,
          payzone_status: status,
          completed_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)

      console.log(`Payment ${orderId} completed successfully`)

    } else if (status === 'DECLINED' || status === 'CANCELLED' || status === 'ERROR') {
      // Paiement échoué
      await supabase
        .from('pending_payments')
        .update({
          status: 'failed',
          payzone_transaction_id: id,
          payzone_status: status,
          failed_at: new Date().toISOString(),
          failure_reason: transactions?.[0]?.responseText || status,
        })
        .eq('order_id', orderId)

      console.log(`Payment ${orderId} failed with status: ${status}`)

    } else if (status === 'REFUNDED') {
      // Remboursement
      await supabase
        .from('pending_payments')
        .update({
          status: 'refunded',
          payzone_status: status,
          refunded_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)

      // Mettre à jour les réservations si elles existent
      await supabase
        .from('reservations')
        .update({ payment_status: 'cancelled' })
        .eq('payment_intent_id', id)

      console.log(`Payment ${orderId} refunded`)
    }

    // Toujours retourner 200 pour acquitter la notification
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in payzone-callback:', error)
    // Retourner 200 pour éviter les retries en cas d'erreur de parsing
    return new Response(
      JSON.stringify({ success: false, error: 'Processing error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
