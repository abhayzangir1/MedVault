# MedVault 2.0 Play Store Compliance Checklist

Use this file before preview APK, closed testing, and production release.

## Required App Features

- [x] Privacy Policy link in Settings.
- [x] Terms and Conditions link in Settings.
- [x] Delete Account request flow in Settings.
- [x] User-selected data scopes for export, AI analysis, Doctor Packet, share links, and Emergency ID.
- [x] Clear subscription price shown before checkout through Google Play Billing: India INR 299/month, International target USD 9.99/month.
- [x] Clear free-tier limits shown before upgrade: 1 additional care profile, 3 AI/OCR uses/month.
- [x] Clear Pro Family limits shown before upgrade: 5 additional active care profiles, 100 AI/OCR uses/month.
- [x] Medical disclaimer visible near AI features: AI output is informational and not medical advice.
- [x] Emergency ID disclaimer: responder view depends on user-entered data and may be incomplete.

## Google Play Data Safety

Declare collected data:

- Account info: name, email.
- Health and fitness: health records, medications, labs, symptoms, emergency profile.
- Files and documents: uploaded reports, prescriptions, images, receipts.
- Financial info: Google Play subscription status and purchase identifiers, not full card numbers.
- App activity: optional diagnostics if Sentry/analytics are enabled later.

For each collected data type:

- Purpose: app functionality.
- Shared with third parties: no, except payment processing with Google Play Billing, optional future approved alternative billing where implemented, and backend infrastructure with Supabase.
- Encrypted in transit: yes.
- User deletion available: yes, through Delete Account.
- Data selling: no.

## Permissions Review

- Camera: document/photo upload and OCR.
- Photos/media images: medical documents, reports, receipts, profile images.
- Notifications: medication reminders and refill alerts.

Only request permissions at the moment the feature needs them.

Current Android manifest intentionally avoids broad legacy storage permissions. Document and photo access should go through system pickers and scoped media permissions.

## Subscription Review

- Google Play Billing must show the active plan price before purchase.
- App must not unlock Pro Family until backend purchase verification confirms entitlement.
- App must downgrade/lock Pro-only actions when subscription status becomes cancelled, expired, revoked, paused, or grace-period expired.
- Mobile app must never contain Google service-account JSON, Razorpay secret key, webhook secret, or Supabase service-role key.
- Expo Go is not enough for billing testing; use EAS development/preview builds and Play internal testing.

## Health App Review Risks

- Do not claim diagnosis, treatment, cure, emergency reliability, or doctor replacement.
- AI lab interpretation must say it is informational and should be reviewed by a qualified clinician.
- Emergency ID must display user-provided data only and avoid guaranteeing accuracy.
- Export, AI analysis, Doctor Packet, share links, Monthly Family Digest, and Emergency ID must use only the data scope the user selected.

## Data Control

- Basic export of user-owned records should remain free.
- Pro may charge for advanced export packaging, AI-generated summaries, family bundles, and scheduled exports.
- Basic Doctor Packet for the account owner's own records should remain free; Pro may charge for polished PDFs, family packets, attachments, AI summaries, and scheduled packets.
- Do not send all health data to AI by default; show selected scope and request confirmation first.
- Do not expose all health data through Emergency ID by default; Emergency ID must be opt-in and scoped.

## Pre-Submission Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm audit --audit-level=moderate`
- [ ] EAS preview APK installed on real Android device.
- [ ] Signup/login works against production Supabase.
- [ ] Delete Account works.
- [ ] Privacy Policy URL opens publicly without login.
- [ ] Terms URL opens publicly without login.
- [ ] Data Safety answers match actual app behavior.
- [ ] Google Play Billing purchase, restore, cancellation, and expiry states are tested in Play internal testing.
