# MedVault Service Cross-Check

This document records the current implementation direction against official service guidance. It should be reviewed before live Supabase setup, EAS preview builds, Google Play Billing internal testing, and Play Store submission.

## Google Play Billing

Official alignment:

- Play Store Android subscriptions for digital Pro features should use Google Play Billing first.
- MedVault uses product ID `medvault_pro_family_monthly`.
- Razorpay is documented as future web checkout or approved alternative billing only.
- The app must send the Play purchase token to a backend verifier and unlock Pro only after backend verification.
- Backend verification should use the Google Play Developer API `purchases.subscriptionsv2.get`.

Current status:

- Billing constants, pricing, and docs are aligned.
- Supabase Edge Function `verify-google-play-purchase` now implements service-account OAuth and Google Play Developer API subscription lookup.
- Production purchase verification still needs live Play Console/service-account testing before it is trusted for release.
- `react-native-iap` is not installed yet because Play Billing requires EAS development/internal testing, not Expo Go.
- Client Pro gates now require a verified active/trialing/grace subscription status.

Remaining:

- Create Play Console subscription and base plan.
- Add `react-native-iap` during billing implementation.
- Implement purchase, restore, listener cleanup, offer token handling, and backend verification.
- Store verified entitlement and expiration/grace/account-hold state server-side.
- Add Real-time Developer Notifications or a periodic backend refresh before production.

## Supabase

Official alignment:

- Mobile uses only URL and anon/publishable key.
- Service-role key and provider secrets stay in Edge Function/server settings.
- RLS is enabled in migrations for new user-data tables.
- Storage should use private buckets and short-lived signed URLs for health documents/photos.

Current status:

- `.env.example` now contains only mobile-safe public values.
- `supabase/.env.example` documents server-only Edge Function secrets separately.
- Migrations define care profiles, data packets, share links, emergency/public-token contracts, monthly digests, and account deletion request tables.
- Phase 21 migration restricts mobile updates to billing/quota columns and owner-binds public packet data.
- Phase 21 migration also adds public packet access logs and rate limiting for share/Emergency tokens.
- Live advisors and storage policy review are still blocked until a real Supabase project exists.

Remaining:

- Apply migrations to live Supabase.
- Create private `documents` and `health_photos` buckets.
- Run Security Advisor and Performance Advisor.
- Verify public RPC returns only scoped packet data.
- Add rate limiting/access logging for public Emergency ID and share links.
- Deploy and test hard-delete account deletion function before production.

## Expo And EAS

Official alignment:

- Preview/internal Android builds can be APK.
- Play Store production builds should be AAB.
- EAS project ID must be configured before live builds.

Current status:

- `eas.json` uses APK for development/preview and AAB for production.
- `app.json` has Android package `com.medvault.app`, versionCode `1`, notification/camera/media permissions, icon, splash, and adaptive icon.
- Local verification passes: TypeScript, audit, Expo Doctor, Android export.

Remaining:

- Run `eas init` or add existing EAS project ID.
- Build preview APK and test on real Android device.
- Build production AAB only after live services and QA are done.

## Expo Notifications

Official alignment:

- `expo-notifications` plugin is configured in `app.json`.
- Android notification permission is declared.
- Medication reminders and refill alerts use local scheduled notifications.

Current status:

- Reminder scheduling exists for medication and refill flows.
- Other feature notifications are supported through a shared helper.

Remaining:

- Real-device Android notification channel/permission QA.
- Ensure permission prompts occur only when a reminder/notification feature is used.

## AI, OCR, And Health Safety

Current status:

- AI/OCR quota concept exists.
- OCR creates reviewable Smart Import suggestions.
- Data Packet Builder is the required sharing/AI/export scope backbone.

Remaining:

- Configure Gemini only in Edge Function secrets.
- Enforce AI/OCR quotas server-side.
- Ensure AI features show clear medical disclaimer before output.
- Send only selected Data Packet scope to AI.

## Final Release Cross-Check

Do not submit to Play Store until:

- Google Play Billing verification is production-complete.
- Supabase live RLS/storage/advisors pass.
- Emergency/share public endpoints are rate-limited and access-logged.
- Privacy Policy and Terms are hosted publicly.
- Data Safety and Health Apps declaration match actual collected data.
- Real Android preview APK QA passes.
