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
    const geminiApiKey = requireEnv('GEMINI_API_KEY');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { labId } = await req.json();
    if (!labId) return json({ error: 'Missing labId' }, 400);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, plan, subscription_status, ai_interpretations_used, ai_quota_reset_at')
      .eq('id', userData.user.id)
      .single();
    if (profileError) throw profileError;

    const quotaUsed = Number(profile.ai_interpretations_used ?? 0);
    const isVerifiedPro = (profile.plan === 'pro' || profile.plan === 'pro_family') &&
      ['active', 'trialing', 'in_grace_period'].includes(String(profile.subscription_status ?? ''));
    const monthlyLimit = isVerifiedPro ? 100 : 3;
    if (quotaUsed >= monthlyLimit) {
      return json({ error: isVerifiedPro ? 'Monthly AI quota reached.' : 'AI quota reached. Upgrade to Pro Family for more AI features.' }, 402);
    }

    const { data: lab, error: labError } = await supabase
      .from('lab_results')
      .select('id, user_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at')
      .eq('id', labId)
      .eq('user_id', userData.user.id)
      .is('deleted_at', null)
      .single();
    if (labError) throw labError;

    const interpretation = await generateGeminiInterpretation(geminiApiKey, lab);

    const { data: updatedLab, error: updateError } = await supabase
      .from('lab_results')
      .update({
        ai_interpretation: interpretation,
        ai_interpreted_at: new Date().toISOString()
      })
      .eq('id', labId)
      .select('id, user_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at')
      .single();
    if (updateError) throw updateError;

    const { error: quotaError } = await adminClient
      .from('profiles')
      .update({ ai_interpretations_used: quotaUsed + 1 })
      .eq('id', userData.user.id);
    if (quotaError) throw quotaError;

    return json(updatedLab);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to generate lab interpretation' }, 500);
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function generateGeminiInterpretation(apiKey: string, lab: Record<string, unknown>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: [
            'You are helping summarize lab results for a personal health record app.',
            'Write a concise, plain-English explanation.',
            'Do not diagnose. Do not prescribe treatment. Tell the user to review abnormal values with a qualified clinician.',
            `Lab result JSON: ${JSON.stringify(lab)}`
          ].join('\n')
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Gemini request failed');

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  return String(text).trim();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
