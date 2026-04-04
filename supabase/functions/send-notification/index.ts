// Supabase Edge Function: send-notification
// Sends push notifications via Expo Push API
// Can be called from other Edge Functions or directly

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface NotificationRequest {
  // Target: either specify userId+userType, or directly provide tokens
  userId?: string
  userIds?: string[]
  userType?: string
  tokens?: string[]

  // Content
  title: string
  body: string
  data?: Record<string, unknown>
  notificationType: string

  // Options
  sound?: string
  badge?: number
  priority?: 'default' | 'normal' | 'high'
  channelId?: string
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: string
  badge?: number
  priority?: 'default' | 'normal' | 'high'
  channelId?: string
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<any[]> {
  // Expo API accepts batches of up to 100 messages
  const results: any[] = []
  const batchSize = 100

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    })

    const result = await response.json()
    results.push(...(result.data || []))
  }

  return results
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: NotificationRequest = await req.json()
    const { title, body, data, notificationType, sound, badge, priority, channelId } = payload

    if (!title || !body || !notificationType) {
      return new Response(
        JSON.stringify({ error: 'title, body, and notificationType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let tokens: string[] = payload.tokens || []

    // If no direct tokens provided, look up by userId
    if (tokens.length === 0) {
      const userIds = payload.userIds || (payload.userId ? [payload.userId] : [])

      if (userIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Must provide userId, userIds, or tokens' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch active tokens for these users
      let query = supabase
        .from('user_push_tokens')
        .select('push_token, user_id')
        .in('user_id', userIds)
        .eq('is_active', true)

      if (payload.userType) {
        query = query.eq('user_type', payload.userType)
      }

      const { data: tokenRows, error: tokenError } = await query

      if (tokenError) {
        console.error('Error fetching tokens:', tokenError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch push tokens' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      tokens = (tokenRows || []).map(t => t.push_token)
    }

    if (tokens.length === 0) {
      console.log('No active push tokens found for the specified users')
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No active tokens' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = tokens
      .filter(token => token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
      .map(token => ({
        to: token,
        title,
        body,
        data: { ...data, notificationType },
        sound: sound || 'default',
        badge: badge,
        priority: priority || 'high',
        channelId: channelId || 'default',
      }))

    if (messages.length === 0) {
      console.log('No valid Expo push tokens found')
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No valid Expo tokens' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via Expo Push API
    const results = await sendExpoPushNotifications(messages)

    // Log notifications
    const userIds = payload.userIds || (payload.userId ? [payload.userId] : [])
    for (const uid of userIds) {
      await supabase.from('notification_logs').insert({
        user_id: uid,
        user_type: payload.userType || 'parent',
        notification_type: notificationType,
        title,
        body,
        data: data || {},
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    }

    // Check for errors in results
    const failed = results.filter(r => r.status === 'error')
    if (failed.length > 0) {
      console.error('Some notifications failed:', failed)

      // Deactivate invalid tokens
      for (const f of failed) {
        if (f.details?.error === 'DeviceNotRegistered') {
          await supabase
            .from('user_push_tokens')
            .update({ is_active: false })
            .eq('push_token', f.details?.expoPushToken || '')
        }
      }
    }

    const sent = results.filter(r => r.status === 'ok').length

    console.log(`Notifications sent: ${sent}/${messages.length}, failed: ${failed.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed: failed.length,
        total: messages.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-notification:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
