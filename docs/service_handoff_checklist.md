# MedVault Service Handoff Checklist

Use this checklist when moving from local development to live Android, Supabase, AI, and Google Play Billing setup. Do not put backend secrets in the mobile app or `.env` values prefixed with `EXPO_PUBLIC_`.

## 1. Expo And EAS

Needed from the owner:

- Expo account login access.
- Permission to run `npx eas init`, or an existing EAS project ID.
- Final Android package name. Current planned value: `com.medvault.app`.
- Preferred app display name. Current: `MedVault 2.0`.
- Whether production builds should use Expo-managed Android credentials.

Codex/developer steps after access:

1. Run `npx eas init` if the EAS project is not created.
2. Confirm `extra.eas.projectId` in `app.json`.
3. Build preview APK with `npx eas build --platform android --profile preview`.
4. Install preview APK on a real Android device and run QA.
5. Build production AAB with `npx eas build --platform android --profile production`.

## 2. Supabase

Needed from the owner when live data wiring starts:

- Supabase Project URL.
- Supabase anon/publishable key.
- Supabase project reference ID.

Do not provide a service-role key for the mobile app. Mobile-safe values belong in `.env`; Edge Function/server-only values are documented separately in `supabase/.env.example` and should be configured as Supabase project secrets.

Codex/developer steps after access:

1. Add mobile-safe values to local `.env`.
2. Apply migrations from `supabase/migrations` in numeric order.
3. Create private storage buckets for documents and health photos.
4. Deploy Edge Functions only after their server-side secrets exist.
5. Run Supabase Security Advisor and Performance Advisor.
6. Verify Row Level Security on all health, packet, emergency, share, billing, and deletion-request tables.
7. Deploy `delete-account` with JWT verification enabled after `SUPABASE_SERVICE_ROLE_KEY` is configured as a Supabase secret.
8. Verify public packet access logs and rate limiting from `006_phase_21_security_hardening.sql`.

## 3. Google Play Billing

Needed from the owner during billing/testing:

- Google Play Console app access.
- Confirmed package name matching the Android app.
- Subscription product ID: `medvault_pro_family_monthly`.
- Base plan ID selected in Play Console.
- Regional prices:
  - India: INR 299/month.
  - International target: USD 9.99/month.
- License tester Gmail account.
- Google Play service-account JSON for backend purchase verification only.

Important:

- The service-account JSON must never go into the Android app or Expo public env.
- The app must not unlock Pro Family in production until backend purchase verification is complete.
- Razorpay remains future web checkout or approved alternative billing only.

Codex/developer steps after access:

1. Add `react-native-iap` only in an EAS development build flow.
2. Implement Android subscription purchase and restore.
3. Send purchases to Supabase Edge Function `verify-google-play-purchase`.
4. Store verified entitlement on backend subscription tables.
5. Test purchase, restore, cancellation, expiry, grace period, and account hold.

## 4. AI And OCR

Needed from the owner when production AI starts:

- Gemini API key for Supabase Edge Functions.
- Final medical disclaimer text, if legal review changes the draft.

Codex/developer steps after access:

1. Configure `GEMINI_API_KEY` as a Supabase Edge Function secret.
2. Keep AI/OCR quota checks server-enforced.
3. Ensure AI analysis only receives selected Data Packet scopes.
4. Keep Smart Import review-required before saving any extracted health record.

## 5. Legal And Public URLs

Needed before Play Store submission:

- Public Privacy Policy URL.
- Public Terms and Conditions URL.
- Support email.
- Legal entity/developer name.
- Public app or responder URL for Emergency ID/share links, if available.

Codex/developer steps after access:

1. Add URLs to `.env` and Play Console listing.
2. Confirm Settings opens the exact public legal links.
3. Complete the Google Play Data Safety form from the final data inventory.
4. Complete the Health apps declaration.

## 6. Release Blockers

Do not publish until all are done:

- Preview APK passes real-device QA.
- Supabase migrations, RLS, storage privacy, advisors, and public token RPC are verified.
- Google Play Billing purchase verification is live and server-backed.
- Account deletion hard-delete workflow exists.
- Emergency/share links have expiry, revocation, access logging, and rate limiting.
- Privacy Policy and Terms are hosted publicly.
- Data Safety and Health apps declaration match the actual app behavior.
