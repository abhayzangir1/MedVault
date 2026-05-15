# MedVault Phase 21 Security Audit

Status: pre-publish security gate in progress. Local fixes are implemented, live Supabase migrations/functions are deployed, DB-simulated disposable security tests pass, and storage bucket privacy is verified. True client-session testing, leaked-password protection, and production-only secrets are still pending. Do not publish, share APKs publicly, upload production AABs, or enable live paid subscriptions until the remaining manual checks pass.

## Threat Model

Primary assets:

- Account identity, Supabase sessions, profile data, family care profile data, health records, documents, OCR text, emergency contacts, share links, Emergency ID tokens, billing entitlements, and AI/OCR quotas.

Trust boundaries:

- Mobile app to Supabase Auth/PostgREST/Storage.
- Mobile app to Supabase Edge Functions.
- Public responder route to scoped public packet RPC.
- Supabase Edge Functions to Gemini, Google Play Developer API, and legacy/future Razorpay.
- Local project files to any future private source control or build service.

Attacker-controlled inputs:

- Signup/login fields, profile settings, care profile data, health records, uploaded file names/content, OCR source files, Data Packet scopes, share link labels, Emergency ID QR tokens, public responder tokens, purchase tokens, and all mobile-originated database writes.

Security invariants:

- Mobile clients must never contain server-only secrets.
- Users must not self-grant Pro Family or mutate billing/quota counters.
- Public share/Emergency responses must expose only explicitly selected records owned by the packet owner.
- AI/OCR must process only selected or user-owned data and must not silently save medical interpretations as verified facts.
- Source code and build credentials must remain private until a deliberate private-repo/release process exists.

## Findings

### Blocker: Authenticated users could mutate billing entitlement fields

- Evidence: `profiles` RLS allowed users to update their own row, and billing fields such as `plan`, `subscription_status`, provider IDs, and quota counters lived on that row.
- Impact: A malicious or modified mobile client could self-upgrade to Pro Family before Google Play verification is implemented.
- Validation: Static trace from `profiles` policy and mobile Supabase update capability. No live Supabase project is required to confirm the policy shape.
- Fix: Added migration `006_phase_21_security_hardening.sql` to revoke authenticated/anon updates for billing, subscription, and quota columns, plus a trigger guard that rejects authenticated client changes to billing/quota fields even when table-level grants are broad. Also restricted `profileService.updateProfile` to settings-safe fields only.
- Status: Migration applied to live Supabase and verified with a disposable DB-simulated authenticated user. True client-session verification is pending because email confirmation is enabled.

### High: Public packet RPC needed explicit owner binding

- Evidence: `get_public_health_packet` is `SECURITY DEFINER` and originally filtered records by `care_profile_id` arrays without repeating `user_id = packet_record.user_id` on every returned table.
- Impact: If a care profile UUID ever leaked and was inserted into a packet scope, the public RPC could become a cross-account disclosure path because SECURITY DEFINER bypasses RLS.
- Validation: Static trace through Data Packet creation, public token RPC, and returned record queries.
- Fix: Added migration `006_phase_21_security_hardening.sql` with `data_packet_scope_is_owned`, stricter `data_packets` RLS, and a recreated public RPC that owner-binds care profiles and all returned records.
- Status: Migration applied to live Supabase and verified with disposable DB-simulated owned, unowned, expired, and revoked packet tests.

### High: Client-side Pro gates trusted plan strings too loosely

- Evidence: `isProProfile` treated `plan = pro/pro_family` as Pro unless status was cancelled, expired, or revoked.
- Impact: Legacy/manual rows or accidental backend writes with missing status could unlock Pro-only client flows.
- Validation: Static trace through feature gates for family, AI/OCR, Doctor Packet, share links, digest, and export.
- Fix: `isProProfile` now requires `subscription_status` to be `active`, `trialing`, or `in_grace_period`.
- Status: Fixed locally; production still requires Google Play backend verification.

### Medium: AI/OCR quota counters need server-side privileged update

- Evidence: Phase 21 revokes mobile updates for quota columns, so Edge Functions must update counters with server privileges.
- Impact: Without server-side quota updates, AI/OCR quota enforcement could fail open or break after applying hardening.
- Validation: Static trace through `generate-lab-interpretation` and `scan-document`.
- Fix: Both functions now require `SUPABASE_SERVICE_ROLE_KEY` server-side and increment counters through an admin client after user ownership checks.
- Status: Functions deployed. `SUPABASE_SERVICE_ROLE_KEY` is available as a managed Supabase secret; `GEMINI_API_KEY` is still pending before production AI/OCR use.

### Medium: Health safety disclaimers were incomplete at action time

- Evidence: Lab AI output showed a disclaimer after generation, but the AI action itself did not require a clear pre-generation warning. Emergency ID had scoped sharing language but not an explicit incompleteness disclaimer.
- Impact: Play Store health review and user trust risk.
- Fix: Labs screen now displays persistent AI medical disclaimer and shows a confirmation before AI summary generation. Share + Emergency screen now states responder data is user-entered, scoped, and may be incomplete.
- Status: Fixed locally.

### Low: Future source-control safety needed stronger ignore rules

- Evidence: `.gitignore` blocked `.env` and keystores, but did not explicitly block APK/AAB/APKS, service-account JSON naming patterns, PEM/P12 files, or nested env examples.
- Impact: Accidental credential/build artifact commits if private source control is created later.
- Fix: Expanded `.gitignore` with release artifact and credential patterns while preserving root and nested `.env.example`.
- Status: Fixed locally.

### Fixed: Public share/Emergency access needed logs and throttling

- Evidence: Public packet reads incremented share-link `access_count`, but did not preserve an audit log or enforce a rate limit.
- Impact: Abuse or scraping attempts would be harder to investigate and could repeatedly hit public packet tokens.
- Fix: Phase 21 migration now creates `public_packet_access_logs`, logs successful and failed packet reads, and rate-limits valid share/Emergency tokens to 60 reads per minute inside `get_public_health_packet`.
- Status: Migration applied to live Supabase; access logging and rate limiting still need live token tests before release.

### Fixed: Account deletion needed a hard-delete backend

- Evidence: Settings created deletion requests, but production hard-delete was deferred.
- Impact: Play Store account deletion expectations and user trust require an actual backend deletion path.
- Fix: Added `delete-account` Edge Function and wired Settings to call it. It requires the signed-in user session, `confirmation: "DELETE"`, service-role secret on the server, removes user-prefixed storage objects, then deletes the Auth user so database rows cascade.
- Status: Function deployed; JWT protection and hard-delete still need testing against a disposable live user.

### Fixed: Authenticated Data API grants were missing

- Evidence: A live DB simulation as the `authenticated` role failed with permission denied on `profiles`, despite RLS policies existing.
- Impact: Live mobile clients would fail to create/read core app data after signup.
- Fix: Added migration `20260515143140_phase_21_live_grants_and_profile_insert_guard.sql` to grant authenticated Data API privileges to RLS-protected app tables and safe column-level profile updates.
- Status: Applied to live Supabase and verified by disposable DB-simulated app writes.

### Fixed: Profile insert guard preserved forged AI usage

- Evidence: The Phase 21 trigger used `COALESCE(NEW.ai_interpretations_used, 0)`, which would preserve a malicious inserted usage count.
- Impact: A modified client could potentially exhaust or manipulate AI/OCR counters on first profile insert.
- Fix: Migration `20260515143140_phase_21_live_grants_and_profile_insert_guard.sql` now forces `ai_interpretations_used = 0` and resets `ai_quota_reset_at` on authenticated profile insert.
- Status: Applied and verified in live DB simulation.

### Fixed: Obsolete public emergency RPC remained exposed

- Evidence: Supabase Security Advisor flagged `get_emergency_profile` as public SECURITY DEFINER; this was the older v1 emergency access path.
- Impact: Keeping two emergency access paths increases disclosure risk and review complexity.
- Fix: Migration `20260515144003_phase_21_advisor_hardening.sql` drops the obsolete RPC. Emergency ID now uses scoped `get_public_health_packet`.
- Status: Applied to live Supabase.

### Fixed: Internal SECURITY DEFINER functions were RPC-executable

- Evidence: Supabase Security Advisor flagged trigger/helper functions such as `handle_new_user`, `protect_profile_billing_fields`, and `rls_auto_enable` as executable by app roles.
- Impact: Internal functions should not be exposed as callable RPC endpoints.
- Fix: Migration `20260515144003_phase_21_advisor_hardening.sql` revokes direct execution, sets a fixed search path on `handle_new_user`, and removes broad avatar listing. Migration `20260515144138_phase_21_data_packet_helper_invoker.sql` narrows `data_packet_scope_is_owned` to SECURITY INVOKER.
- Status: Applied to live Supabase.

### Fixed: Google Play purchase verifier was a non-unlocking contract stub

- Evidence: `verify-google-play-purchase` previously stored purchase metadata as `pending` and returned `verified: false`.
- Impact: Production billing could not safely unlock Pro Family, and an unfinished verifier would block Play Store subscription testing.
- Fix: The function now signs a Google service-account JWT, exchanges it for an OAuth token, calls Android Publisher `purchases.subscriptionsv2.get`, requires the expected product ID, maps Google subscription states conservatively, and only writes `pro_family` for active or in-grace subscriptions.
- Status: Function deployed. `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` and Play Console internal testing are still pending before production billing can unlock Pro.

## Secret Scan

Result: no live secrets found in tracked project files during pattern scan. Matches were placeholders, documentation references, function environment variable names, or the public Supabase project URL only. The live publishable key and legacy anon JWT are not tracked.

Checked for:

- Supabase service-role references.
- Google Play service-account JSON references.
- Gemini keys.
- Razorpay secrets.
- Stripe-like keys.
- Google API key-shaped values.
- JWT-like tokens.
- Private key blocks.
- Keystore and service-account files.

## Remaining Release Blockers

- Enable leaked-password protection in Supabase Auth dashboard.
- Run true client-session tests with a confirmed disposable user.
- Verify `delete-account` JWT protection and hard-delete against that disposable live user.
- Verify signed URL creation from a true client session for private `documents` and `health_photos`.
- Load-test or script public share/Emergency rate limiting before production.
- Add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to Supabase secrets when Play Console service account is ready.
- Test production Google Play purchase verification with Play Console internal testing.
- Add Real-time Developer Notifications or a periodic entitlement refresh.
- Review Supabase Performance Advisor auth-initplan warnings and optimize legacy RLS policies before scale testing.
- Complete real-device notification/upload/QR/PDF/offline QA from preview APK.
- Host final Privacy Policy and Terms before Play submission.

## Verification Commands

Run after every security change:

```bash
npm run typecheck
npm run audit:moderate
npm run doctor
npm run verify:android-export
```
