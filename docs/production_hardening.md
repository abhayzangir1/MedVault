# MedVault Production Hardening Checklist

This file tracks release blockers for the native Android Play Store build. `MedVault_Enterprise_Suite.md` is a reference quality bar, but this project remains Expo React Native with Google Play Billing.

## Implemented In Phase 19

- Root error boundary catches unexpected screen crashes and shows a recoverable fallback.
- Offline banner uses `@react-native-community/netinfo` and updates TanStack Query online state.
- Android manifest permissions were tightened to camera, media images, and notifications.
- App already has icon, splash, adaptive icon, dark mode, and Android package configured.
- Reusable haptics service is available for high-value actions.

## Implemented In Phase 21

- Added pre-publish security audit document.
- Expanded `.gitignore` for release artifacts and credential files.
- Added Supabase hardening migration for billing/quota column restrictions, owned data packet scopes, and owner-bound public packet RPC output.
- Tightened client Pro gates to require verified active/trialing/grace subscription status.
- Updated AI/OCR Edge Functions to use server-side quota increments.
- Added AI and Emergency ID safety disclaimers in app screens.
- Added public packet access logs and database-level rate limiting for share/Emergency responder tokens.
- Added `delete-account` Edge Function and wired Settings to perform hard-delete through the server.

## Before Preview APK

- Replace placeholder `extra.eas.projectId` in `app.json`.
- Confirm Android package `com.medvault.app` is final before Play Console setup.
- Verify icon, adaptive icon, and splash on a real Android device.
- Run `npx expo-doctor` and resolve critical issues.
- Run `npx tsc --noEmit`.
- Run `npm audit --audit-level=moderate`.
- Run `npx expo export --platform android --output-dir dist-verify`.
- Install EAS preview APK on a real Android device and test auth, upload, notifications, QR, PDF export, and offline banner.

## Before Production Supabase

- Apply all migrations in order.
- Run Supabase security advisors after migrations.
- Confirm RLS on every user-data table.
- Confirm public token RPC returns only selected `data_packets` scope.
- Apply and verify rate limiting and access logging for public Emergency ID/share endpoints before production.
- Review Storage buckets:
  - `documents` should be private.
  - `health_photos` should be private.
  - Signed URLs should be short-lived.
- Add server-side upload validation: MIME type, image max 5 MB, PDF max 20 MB.
- Deploy and test server-side hard-delete Edge Function for account deletion.

## Before AI/Gemini Production

- Never put Gemini keys in the Android app.
- Edge Functions must show non-dismissible medical disclaimer text.
- Edge Functions must reject dangerous medical instructions and forbidden phrases.
- OCR low-confidence numeric medical fields must require manual review before saving.
- AI/OCR quota enforcement must happen server-side.
- Prefer async queue/job model for OCR and health summary generation before scale.

## Before Google Play Billing Production

- Use Google Play Billing as the Android Play Store subscription path.
- Configure product `medvault_pro_family_monthly`.
- Configure regional pricing: India INR 299/month, international target USD 9.99/month.
- Test purchase, restore, cancellation, expiry, grace period, and account hold in Play internal testing.
- Backend purchase verification must be completed before unlocking Pro Family in production.
- Keep Razorpay/Stripe out of the Play Store in-app purchase flow unless using an approved compliant alternative billing path.

## Before Play Store Data Safety

- Privacy Policy URL must be public and final.
- Terms URL must be public and final.
- Support email must be active.
- Data Safety form must declare account info, health data, documents/files, subscription identifiers, diagnostics if enabled.
- Health apps declaration must avoid claims of diagnosis, treatment, cure, or emergency reliability.
- Emergency ID must be described as user-selected, user-entered information that may be incomplete.

## Sentry And Analytics

- Add Sentry only after DSN is available.
- Do not send health record content, OCR text, lab values, symptoms, document names, or emergency contacts to analytics.
- If PostHog or analytics are added later, use privacy-safe event names and counts only.
