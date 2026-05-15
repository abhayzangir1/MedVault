import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface VerifyPurchaseRequest {
  productId: string;
  purchaseToken: string;
  packageName: string;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleSubscriptionV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
    };
    offerDetails?: {
      basePlanId?: string;
      offerId?: string;
    };
  }>;
}

const jsonHeaders = {
  'Content-Type': 'application/json'
};

const activeGoogleStates = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
]);

const inactiveGoogleStates = new Set([
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_PENDING',
  'SUBSCRIPTION_STATE_UNSPECIFIED'
]);

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const body = await req.json() as VerifyPurchaseRequest;
    const expectedProductId = Deno.env.get('GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID') ?? 'medvault_pro_family_monthly';
    const expectedPackageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') ?? 'com.medvault.app';

    if (body.productId !== expectedProductId || body.packageName !== expectedPackageName || !body.purchaseToken) {
      return json({ error: 'Invalid purchase verification payload' }, 400);
    }

    const serviceAccountJson = requireEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'Invalid user session' }, 401);
    }

    const serviceAccount = parseServiceAccount(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const subscription = await getGoogleSubscription(body.packageName, body.purchaseToken, accessToken);
    const entitlement = mapSubscriptionEntitlement(subscription, body.productId);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        plan: entitlement.verified ? 'pro_family' : 'free',
        billing_provider: 'google_play',
        google_play_purchase_token: body.purchaseToken,
        google_play_order_id: subscription.latestOrderId ?? null,
        subscription_product_id: body.productId,
        subscription_status: entitlement.subscriptionStatus,
        subscription_checked_at: new Date().toISOString()
      })
      .eq('id', userData.user.id);

    if (updateError) throw updateError;

    return json({
      verified: entitlement.verified,
      plan: entitlement.verified ? 'pro_family' : 'free',
      subscriptionStatus: entitlement.subscriptionStatus,
      productId: body.productId,
      expiresAt: entitlement.expiresAt,
      googleState: subscription.subscriptionState ?? null,
      basePlanId: entitlement.basePlanId,
      orderId: subscription.latestOrderId ?? null
    }, entitlement.verified ? 200 : 202);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Unknown verification error'
    }, 500);
  }
});

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function parseServiceAccount(rawJson: string): GoogleServiceAccount {
  const parsed = JSON.parse(rawJson) as Partial<GoogleServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google Play service account JSON must include client_email and private_key.');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key
  };
}

async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    },
    serviceAccount.private_key
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const payload = await response.json() as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to authenticate with Google Play.');
  }

  return payload.access_token;
}

async function getGoogleSubscription(packageName: string, purchaseToken: string, accessToken: string): Promise<GoogleSubscriptionV2> {
  const url = [
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications',
    encodeURIComponent(packageName),
    'purchases/subscriptionsv2/tokens',
    encodeURIComponent(purchaseToken)
  ].join('/');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? 'Google Play purchase lookup failed.';
    throw new Error(message);
  }

  return payload as GoogleSubscriptionV2;
}

function mapSubscriptionEntitlement(subscription: GoogleSubscriptionV2, expectedProductId: string) {
  const matchingLineItem = subscription.lineItems?.find((item) => item.productId === expectedProductId);
  const googleState = subscription.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';
  const productMatches = Boolean(matchingLineItem);
  const stateAllowsPro = activeGoogleStates.has(googleState);
  const stateKnownInactive = inactiveGoogleStates.has(googleState);
  const verified = productMatches && stateAllowsPro;

  return {
    verified,
    subscriptionStatus: verified
      ? googleState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ? 'in_grace_period' : 'active'
      : stateKnownInactive ? mapInactiveStatus(googleState) : 'pending',
    expiresAt: matchingLineItem?.expiryTime ?? null,
    basePlanId: matchingLineItem?.offerDetails?.basePlanId ?? null
  };
}

function mapInactiveStatus(googleState: string) {
  if (googleState === 'SUBSCRIPTION_STATE_CANCELED') return 'cancelled';
  if (googleState === 'SUBSCRIPTION_STATE_EXPIRED') return 'expired';
  if (googleState === 'SUBSCRIPTION_STATE_ON_HOLD') return 'on_hold';
  if (googleState === 'SUBSCRIPTION_STATE_PAUSED') return 'paused';
  return 'pending';
}

async function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function importPrivateKey(privateKeyPem: string) {
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = Uint8Array.from(atob(pemBody), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  });
}
