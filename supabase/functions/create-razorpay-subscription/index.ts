import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type BillingRegion = 'IN' | 'INTL';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const planEnvByRegion: Record<BillingRegion, string> = {
  IN: 'RAZORPAY_PLAN_PRO_INR_MONTHLY',
  INTL: 'RAZORPAY_PLAN_PRO_USD_MONTHLY'
};

const priceLabelByRegion: Record<BillingRegion, string> = {
  IN: 'INR 299/month',
  INTL: 'USD 9.99/month'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const razorpayKeyId = requireEnv('RAZORPAY_KEY_ID');
    const razorpayKeySecret = requireEnv('RAZORPAY_KEY_SECRET');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const body = await req.json().catch(() => ({}));
    const region: BillingRegion = body.region === 'INTL' ? 'INTL' : 'IN';
    const planId = requireEnv(planEnvByRegion[region]);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const subscription = await createRazorpaySubscription({
      keyId: razorpayKeyId,
      keySecret: razorpayKeySecret,
      planId,
      userId: userData.user.id,
      email: userData.user.email ?? undefined
    });

    return json({
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url ?? null,
      region,
      priceLabel: priceLabelByRegion[region]
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to create subscription' }, 500);
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function createRazorpaySubscription(input: {
  keyId: string;
  keySecret: string;
  planId: string;
  userId: string;
  email?: string;
}) {
  const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${input.keyId}:${input.keySecret}`)}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: {
        user_id: input.userId,
        email: input.email ?? ''
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.description ?? 'Razorpay subscription creation failed');
  return payload as { id: string; short_url?: string };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
