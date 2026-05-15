# Supabase Edge Function Secrets

Do not put these values in the mobile app.

## Required Before Live Google Play Billing Testing

- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for purchase verification only

Google Play Billing is the default Android Play Store subscription path. Billing must be tested through EAS builds and Play internal testing; Expo Go is not enough.

## Required Before Live AI/OCR Testing

- `GEMINI_API_KEY` for lab interpretation, document OCR, Smart Import, Doctor Packet summaries, and Monthly Family Digest.

## Required Before Account Deletion Testing

- `SUPABASE_SERVICE_ROLE_KEY` for the `delete-account` function. Deploy this function with JWT verification enabled. It removes user-prefixed storage objects from `documents`, `health_photos`, and `avatars`, then deletes the Supabase Auth user so database rows cascade.

## Legacy/Future Razorpay Only

Razorpay is reserved for future web checkout, non-Play distribution, or approved alternative billing. Do not wire raw Razorpay checkout as the default Play Store app purchase path.

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PLAN_PRO_INR_MONTHLY`
- `RAZORPAY_PLAN_PRO_USD_MONTHLY`

Razorpay webhook events if that future path is selected:

- `subscription.activated`
- `subscription.authenticated`
- `subscription.charged`
- `subscription.pending`
- `subscription.halted`
- `subscription.cancelled`
- `subscription.completed`

Mobile app rule: only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` belong in app `.env`.
