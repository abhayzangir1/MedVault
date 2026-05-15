import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const secret = requireEnv('RAZORPAY_KEY_SECRET');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const body = await req.json();
    const paymentId = String(body.razorpay_payment_id ?? '');
    const subscriptionId = String(body.razorpay_subscription_id ?? '');
    const signature = String(body.razorpay_signature ?? '');

    if (!paymentId || !subscriptionId || !signature) {
      return json({ error: 'Missing Razorpay verification fields' }, 400);
    }

    const expectedSignature = await hmacSha256Hex(`${paymentId}|${subscriptionId}`, secret);
    const verified = timingSafeEqual(expectedSignature, signature);
    if (!verified) return json({ verified: false }, 400);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const { error } = await supabase
      .from('profiles')
      .update({
        plan: 'pro',
        subscription_status: 'active',
        razorpay_subscription_id: subscriptionId
      })
      .eq('id', userData.user.id);

    if (error) throw error;
    return json({ verified: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to verify payment' }, 500);
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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
