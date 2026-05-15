# MedVault Android Build + Release Runbook

This project is a native Android Expo React Native app. Play Store subscriptions must use Google Play Billing first. Razorpay/Stripe are not the default in-app Android payment path.

## Current Local Build Status

- Expo app config exists in `app.json`.
- EAS profiles exist in `eas.json`.
- Development and preview builds output APK.
- Production build outputs Android App Bundle (`.aab`).
- Local verification commands have been used after every slice:
  - `npx tsc --noEmit`
  - `npm audit --audit-level=moderate`
  - `npx expo export --platform android --output-dir dist-verify`

## Values Needed From You Before Real Build

Detailed step-by-step handoff is tracked in `docs/service_handoff_checklist.md`.

Provide these only when we are ready to wire live services:

- Expo account login access.
- EAS project ID, or permission to run `eas init`.
- Final Android package name. Current: `com.medvault.app`.
- Supabase project URL and anon key.
- Public Privacy Policy URL.
- Public Terms and Conditions URL.
- Support email.
- Public app/web URL for responder links, if available.
- Google Play Console app access.
- Google Play subscription product/base plan:
  - Product ID: `medvault_pro_family_monthly`
  - India price: INR 299/month
  - International target: USD 9.99/month
- Google Play license tester account.
- Google Play service-account JSON for backend verification only. Never put it in mobile `.env`.
- Gemini API key for Edge Functions only, when AI production wiring starts.

## Local Preflight

Run:

```bash
npx tsc --noEmit
npm audit --audit-level=moderate
npx expo export --platform android --output-dir dist-verify
```

Remove `dist-verify` after export check.

Recommended extra check before a real EAS build:

```bash
npx expo-doctor
```

## Environment Setup

Create a local mobile `.env` from `.env.example`.

Mobile-safe public values:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_APP_PUBLIC_URL=
EXPO_PUBLIC_PRIVACY_POLICY_URL=
EXPO_PUBLIC_TERMS_URL=
EXPO_PUBLIC_SUPPORT_EMAIL=
EXPO_PUBLIC_SENTRY_DSN=
```

Server-only values are documented in `supabase/.env.example` and must stay out of the Android app:

```bash
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
GEMINI_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

## Supabase Production Setup

1. Create/choose Supabase project.
2. Apply migrations in order from `supabase/migrations`.
3. Deploy Edge Functions only after secrets are configured.
4. Run Supabase Security Advisor and Performance Advisor.
5. Confirm all health data tables have RLS enabled.
6. Confirm `documents` and `health_photos` storage buckets are private.
7. Confirm public token RPC returns only scoped packet data.
8. Add public endpoint rate limiting and access logging before production.

## Google Play Billing Setup

1. Create app in Google Play Console with package `com.medvault.app` unless changed.
2. Create subscription product `medvault_pro_family_monthly`.
3. Configure regional pricing:
   - India: INR 299/month.
   - International target: USD 9.99/month.
4. Configure license testers.
5. Complete backend purchase verification in `verify-google-play-purchase`.
6. Test purchase, restore, cancellation, expiry, grace period, and account hold in Play internal testing.
7. Do not unlock Pro Family in production until backend verification is complete.

## EAS Build Commands

After `eas init` and credentials are ready:

```bash
npx eas build --platform android --profile development
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

Expected outputs:

- `development`: internal APK with development client.
- `preview`: internal APK for real-device QA.
- `production`: AAB for Play Console.

## Real Device QA

Install preview APK and test:

- Signup/login/logout.
- Dashboard loads.
- Care profile add/switch/deactivate.
- Medication reminder permission and scheduling.
- Refill notifications.
- Timeline CRUD.
- Labs CRUD and AI quota gate behavior.
- Document upload and OCR flow.
- Smart Import draft/approve/reject flow.
- Symptoms and Costs CRUD.
- Doctor Packet PDF generation and share.
- Share Links and Emergency QR.
- Public responder link.
- Export PDF and JSON.
- Monthly Digest Pro gate.
- Settings profile update, legal links, deletion request.
- Offline banner appears when network is disabled.

## Play Store Listing Checklist

- App name: MedVault.
- Short description: family health records, medication reminders, emergency ID.
- Full description must avoid diagnosis/treatment claims.
- Screenshots from real Android device.
- Feature graphic.
- Privacy Policy URL.
- Data Safety form aligned with actual app behavior.
- Health apps declaration completed.
- Subscription disclosure mentions Google Play Billing and regional price.

## Release Blockers

Do not submit production until:

- Supabase live migrations are applied.
- Purchase verification actually verifies Google Play purchases.
- Account deletion hard-delete Edge Function exists.
- Emergency/share public endpoints are rate-limited and access-logged.
- Privacy Policy and Terms are hosted publicly with legal entity/contact details.
- Real-device preview APK QA passes.
