import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const webhookSecret = requireEnv('RAZORPAY_WEBHOOK_SECRET');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const signature = req.headers.get('x-razorpay-signature') ?? '';
    const bodyText = await req.text();
    const expectedSignature = await hmacSha256Hex(bodyText, webhookSecret);

    if (!timingSafeEqual(expectedSignature, signature)) {
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(bodyText);
    const subscription = event.payload?.subscription?.entity;
    const userId = subscription?.notes?.user_id;
    const subscriptionId = subscription?.id;
    const status = subscription?.status;

    if (!userId || !subscriptionId || !status) return new Response('Ignored', { status: 200 });

    const plan = status === 'active' || status === 'authenticated' ? 'pro' : 'free';
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabase
      .from('profiles')
      .update({
        plan,
        subscription_status: status,
        razorpay_subscription_id: subscriptionId
      })
      .eq('id', userId);

    if (error) throw error;
    return new Response('ok', { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Webhook failed', { status: 500 });
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function hmacSha256Hex(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
