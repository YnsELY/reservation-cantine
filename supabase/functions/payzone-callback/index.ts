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

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Récupérer le body brut pour la vérification de signature
    const rawBody = await req.text()

    // Récupérer la signature - PayZone peut utiliser différents noms d'header
    const receivedSignature =
      req.headers.get('x-callback-signature') ||
      req.headers.get('x-signature') ||
      req.headers.get('signature') ||
      req.headers.get('x-payzone-signature') ||
      ''


    if (!PAYZONE_NOTIFICATION_KEY) {
      console.error('PayZone notification key is not configured')
      return new Response(JSON.stringify({ error: 'Callback unavailable' }), { status: 503, headers: corsHeaders })
    }
    if (receivedSignature) {
      const calculatedSignature = await hmacSha256(PAYZONE_NOTIFICATION_KEY, rawBody)

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

    if (fetchError && fetchError.code !== 'PGRST116') {
      return new Response(JSON.stringify({ error: 'Payment lookup unavailable' }), { status: 500, headers: corsHeaders })
    }
    if (!pendingPayment) {
      console.error('Pending payment not found for orderId:', orderId)
      // On retourne 200 pour éviter les retries inutiles de PayZone
      return new Response(
        JSON.stringify({ success: true, message: 'Order not found but acknowledged' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (id !== pendingPayment.charge_id) return new Response(JSON.stringify({ error: 'Payment reference mismatch' }), { status: 409, headers: corsHeaders })

    // Traiter selon le statut
    if (status === 'CHARGED' && pendingPayment.payzone_status === 'REFUNDED') {
      return new Response(JSON.stringify({ success: true, message: 'Refund already received' }), { headers: corsHeaders })
    }
    if (status === 'CHARGED') {
      // The database locks this payment and commits reservations, credits and
      // cart removal together. Repeated callbacks cannot repeat these effects.
      const { data: completedNow, error: completionError } = await supabase.rpc(
        'complete_payzone_payment',
        { p_order_id: orderId, p_transaction_id: id }
      )

      if (completionError) {
        console.error('Error completing paid order:', completionError)
        // Keep evidence that the bank charged the payment. Do not mislabel it as
        // a card refusal or silently discard paid lines when a conflict occurs.
        await supabase.from('pending_payments').update({
          payzone_transaction_id: id,
          payzone_status: 'CHARGED',
          failure_reason: `Reservation completion: ${completionError.message}`,
        }).eq('order_id', orderId).not('status', 'in', '(completed,refunded)')
        return new Response(
          JSON.stringify({ error: 'Paiement reçu, enregistrement de la commande à vérifier' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!completedNow) {
        return new Response(
          JSON.stringify({ success: true, message: 'Payment already processed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const cartItems = pendingPayment.cart_items

      console.log(`Payment ${orderId} completed successfully`)

      const totalAmount = Number(pendingPayment.total_amount)

      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'order_confirmation',
            parentId: pendingPayment.parent_id,
            orderId,
            totalAmount,
            paidAt: new Date().toISOString(),
            paymentReference: id,
            items: cartItems.map((item: any) => ({
              childFirstName: item.child?.first_name || item.child_first_name || '',
              childLastName: item.child?.last_name || item.child_last_name || '',
              mealName: item.menu?.meal_name || item.menu_name || '',
              date: item.date,
              totalPrice: Number(item.total_price || 0),
              supplements: item.supplements || [],
              annotations: item.annotations || null,
            })),
          }),
        })

        if (!emailResponse.ok) {
          console.error('Order confirmation email failed:', await emailResponse.text())
        }
      } catch (emailError) {
        console.error('Error sending order confirmation email:', emailError)
      }

      // === PUSH NOTIFICATIONS ===
      try {
        // P4: Notify parent - payment confirmed
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId: pendingPayment.parent_id,
            userType: 'parent',
            title: 'Paiement confirmé ✓',
            body: `Votre paiement de ${totalAmount.toFixed(2)} MAD a été confirmé. Les réservations sont enregistrées.`,
            notificationType: 'payment_confirmed',
            data: { orderId, amount: totalAmount },
          }),
        })

        // S6: Notify schools about new reservations
        const schoolIds = [...new Set(cartItems.map((item: any) => item.school_id).filter(Boolean))]
        if (schoolIds.length > 0) {
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              userIds: schoolIds,
              userType: 'school',
              title: 'Nouvelles réservations',
              body: `${cartItems.length} nouvelle(s) réservation(s) enregistrée(s).`,
              notificationType: 'new_reservation_school',
              data: { orderId, count: cartItems.length },
            }),
          })
        }

        // Pr7: Notify providers about new orders
        const menuIds = [...new Set(cartItems.map((item: any) => item.menu_id).filter(Boolean))]
        if (menuIds.length > 0) {
          const { data: menus } = await supabase
            .from('menus')
            .select('provider_id')
            .in('id', menuIds)
          const providerIds = [...new Set((menus || []).map(m => m.provider_id).filter(Boolean))]
          if (providerIds.length > 0) {
            await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                userIds: providerIds,
                userType: 'provider',
                title: 'Nouvelles commandes',
                body: `${cartItems.length} nouvelle(s) commande(s) reçue(s).`,
                notificationType: 'new_order_provider',
                data: { orderId, count: cartItems.length },
              }),
            })
          }
        }
      } catch (notifError) {
        console.error('Error sending payment notifications:', notifError)
        // Don't fail the callback for notification errors
      }

    } else if (status === 'DECLINED' || status === 'CANCELLED' || status === 'ERROR' || status === 'AUTH_REVERSED') {
      const { data: failedPayment, error: failureError } = await supabase.rpc('release_failed_checkout', {
        p_order_id: orderId, p_transaction_id: id, p_status: status,
      })

      if (failureError) {
        return new Response(JSON.stringify({ error: 'Payment update failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!failedPayment) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log(`Payment ${orderId} failed with status: ${status}`)

      // P5: Notify parent - payment failed
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId: pendingPayment.parent_id,
            userType: 'parent',
            title: 'Échec du paiement',
            body: 'Votre paiement n\'a pas abouti. Veuillez réessayer.',
            notificationType: 'payment_failed',
            data: { orderId, reason: status },
          }),
        })
      } catch (notifError) {
        console.error('Error sending payment failed notification:', notifError)
      }

    } else if (status === 'REFUNDED') {
      const { error: refundError } = await supabase.rpc('refund_payzone_payment', {
        p_order_id: orderId, p_transaction_id: id,
      })
      if (refundError) {
        await supabase.from('pending_payments').update({
          payzone_status: 'REFUNDED',
          failure_reason: `Refund reconciliation: ${refundError.message}`,
        }).eq('order_id', orderId).neq('status', 'refunded')
        return new Response(JSON.stringify({ error: 'Remboursement bancaire reçu, cagnotte à rapprocher' }),
          { status: 500, headers: corsHeaders })
      }
      console.log(`Payment ${orderId} refunded`)
    }

    // Toujours retourner 200 pour acquitter la notification
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in payzone-callback:', error)
    // Do not acknowledge a callback whose processing failed.
    return new Response(
      JSON.stringify({ success: false, error: 'Processing error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
