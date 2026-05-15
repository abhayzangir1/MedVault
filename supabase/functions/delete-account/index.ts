import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const USER_BUCKETS = ['documents', 'health_photos', 'avatars'] as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== 'DELETE') {
      return json({ error: 'Account deletion requires confirmation.' }, 400);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const userId = userData.user.id;

    await adminClient
      .from('account_deletion_requests')
      .insert({
        user_id: userId,
        reason: typeof body?.reason === 'string' ? body.reason.trim() || null : null,
        status: 'processing',
        requested_at: new Date().toISOString()
      });

    const storageResults = [];
    for (const bucket of USER_BUCKETS) {
      const removed = await removeUserStoragePrefix(adminClient, bucket, userId);
      storageResults.push({ bucket, removed });
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      await adminClient
        .from('account_deletion_requests')
        .update({ status: 'failed' })
        .eq('user_id', userId);
      throw deleteUserError;
    }

    return json({
      deleted: true,
      storage: storageResults
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to delete account' }, 500);
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function removeUserStoragePrefix(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  userId: string
) {
  const paths = await listStoragePaths(adminClient, bucket, userId);
  if (paths.length === 0) return 0;

  const { error } = await adminClient.storage.from(bucket).remove(paths);
  if (error) throw error;
  return paths.length;
}

async function listStoragePaths(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await adminClient.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;

  const paths: string[] = [];
  for (const item of data ?? []) {
    const childPath = `${prefix}/${item.name}`;
    if (item.id) {
      paths.push(childPath);
    } else {
      const childPaths = await listStoragePaths(adminClient, bucket, childPath);
      paths.push(...childPaths);
    }
  }

  return paths;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
