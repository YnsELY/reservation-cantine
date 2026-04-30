import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildOrderConfirmationTemplate,
  buildSignupConfirmationTemplate,
  type OrderConfirmationItem,
} from '../_shared/email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JwtPayload = {
  sub?: string;
  role?: string;
};

type TransactionalEmailRequest =
  | {
      type: 'signup_confirmation';
      parentId?: string;
    }
  | {
      type: 'order_confirmation';
      parentId?: string;
      orderId: string;
      totalAmount: number;
      paidAt?: string;
      paymentReference?: string | null;
      items: OrderConfirmationItem[];
    };

function decodeJwtPayload(token: string): JwtPayload {
  const [, payload = ''] = token.split('.');
  const normalizedPayload = payload.replaceAll('-', '+').replaceAll('_', '/');
  const paddedPayload = normalizedPayload.padEnd(
    normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
    '='
  );

  return JSON.parse(atob(paddedPayload));
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error ${response.status}: ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization manquante' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const callerRole = jwtPayload.role;

    if (callerRole !== 'authenticated' && callerRole !== 'service_role') {
      return new Response(JSON.stringify({ error: 'Acces refuse' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || '';
    const resendReplyToEmail = Deno.env.get('RESEND_REPLY_TO_EMAIL') || '';
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || '';

    if (!resendApiKey || !resendFromEmail) {
      return new Response(
        JSON.stringify({ error: 'Secrets ReSend manquants: RESEND_API_KEY ou RESEND_FROM_EMAIL' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload = (await req.json()) as TransactionalEmailRequest;
    if (!payload?.type) {
      return new Response(JSON.stringify({ error: 'type requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const parentLookupField =
      callerRole === 'service_role' ? 'id' : 'user_id';
    const parentLookupValue =
      callerRole === 'service_role' ? payload.parentId : jwtPayload.sub;

    if (!parentLookupValue) {
      return new Response(JSON.stringify({ error: 'parentId requis pour cet appel' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: parent, error: parentError } = await supabase
      .from('parents')
      .select('id, email, first_name, last_name')
      .eq(parentLookupField, parentLookupValue)
      .maybeSingle();

    if (parentError || !parent) {
      return new Response(JSON.stringify({ error: 'Parent introuvable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!parent.email) {
      return new Response(JSON.stringify({ error: 'Adresse email parent manquante' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let emailTemplate;

    if (payload.type === 'signup_confirmation') {
      emailTemplate = buildSignupConfirmationTemplate({
        parentFirstName: parent.first_name,
        appBaseUrl,
      });
    } else {
      if (!payload.orderId || !payload.items?.length) {
        return new Response(JSON.stringify({ error: 'orderId et items requis' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      emailTemplate = buildOrderConfirmationTemplate({
        parentFirstName: parent.first_name,
        orderId: payload.orderId,
        totalAmount: payload.totalAmount,
        paidAt: payload.paidAt,
        paymentReference: payload.paymentReference,
        items: payload.items,
        appBaseUrl,
      });
    }

    const resendResult = await sendResendEmail({
      apiKey: resendApiKey,
      from: resendFromEmail,
      to: parent.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
      replyTo: resendReplyToEmail || undefined,
    });

    return new Response(JSON.stringify({ success: true, resendResult }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-transactional-email:', error);
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
