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

    const { documentId } = await req.json();
    if (!documentId) return json({ error: 'Missing documentId' }, 400);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, plan, subscription_status, ai_interpretations_used')
      .eq('id', userData.user.id)
      .single();
    if (profileError) throw profileError;

    const quotaUsed = Number(profile.ai_interpretations_used ?? 0);
    const isVerifiedPro = (profile.plan === 'pro' || profile.plan === 'pro_family') &&
      ['active', 'trialing', 'in_grace_period'].includes(String(profile.subscription_status ?? ''));
    const monthlyLimit = isVerifiedPro ? 100 : 3;
    if (quotaUsed >= monthlyLimit) {
      return json({ error: isVerifiedPro ? 'Monthly AI/OCR quota reached.' : 'AI quota reached. Upgrade to Pro Family for more OCR and AI features.' }, 402);
    }

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('id, user_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at')
      .eq('id', documentId)
      .eq('user_id', userData.user.id)
      .is('deleted_at', null)
      .single();
    if (documentError) throw documentError;
    if (!document.storage_path) throw new Error('Document has no storage path.');

    const { data: signedUrl, error: signedUrlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(document.storage_path, 60);
    if (signedUrlError) throw signedUrlError;

    const ocr = await scanWithGemini(geminiApiKey, signedUrl.signedUrl, document.file_type ?? 'application/octet-stream');

    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update({
        ocr_text: ocr.text,
        ocr_confidence: ocr.confidence,
        is_handwritten: ocr.isHandwritten
      })
      .eq('id', documentId)
      .select('id, user_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at')
      .single();
    if (updateError) throw updateError;

    const { error: quotaError } = await adminClient
      .from('profiles')
      .update({ ai_interpretations_used: quotaUsed + 1 })
      .eq('id', userData.user.id);
    if (quotaError) throw quotaError;

    return json(updatedDocument);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to scan document' }, 500);
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function scanWithGemini(apiKey: string, signedUrl: string, mimeType: string) {
  const fileResponse = await fetch(signedUrl);
  if (!fileResponse.ok) throw new Error('Unable to read document file for OCR.');
  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  const base64 = toBase64(bytes);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: [
              'Extract readable medical text from this document.',
              'Return JSON only with keys: text, confidence, isHandwritten.',
              'confidence must be an integer from 0 to 100.',
              'Do not diagnose or interpret; OCR only.'
            ].join('\n')
          },
          {
            inlineData: {
              mimeType,
              data: base64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json'
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Gemini OCR request failed');

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty OCR response.');

  const parsed = JSON.parse(text);
  return {
    text: String(parsed.text ?? '').trim(),
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence ?? 0))),
    isHandwritten: Boolean(parsed.isHandwritten)
  };
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
