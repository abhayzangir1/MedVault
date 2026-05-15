# MedVault 2.0 Execution Plan

This is the persistent recovery checklist. Future sessions should read this file first, continue from the first unchecked item, and end with a one-sentence Save State.

## Session Rules

- [x] Work only inside `D:\abhay\mvp's\medvault\MedVault_2.0`.
- [x] Never push code publicly or expose secrets.
- [x] End every implementation session with `Save State: <completed work + next exact step>`.
- [x] Keep this file updated after every completed slice.
- [x] Every slice must compile before stopping: `npx tsc --noEmit`.

## Integration Handshake

- Supabase: ask for Project URL and anon key only when wiring live auth/data.
- Supabase SQL: provide exact SQL and dashboard steps before requiring user action.
- Google Play Billing: ask for Play Console package name, subscription product/base plan IDs, license tester account, EAS build details, and Google service-account JSON only during billing integration/testing.
- Razorpay: reserved for future web checkout or approved alternative billing only; ask for Razorpay keys only if that path is explicitly selected.
- AI/Gemini: ask for API key only when implementing Edge Functions.
- EAS: ask for Expo login/package/build details only during build phase.
- Never request service-role keys for mobile app `.env`.

## Product Positioning

- MedVault is a family care and controlled health sharing app, not just a generic record vault.
- `MedVault_Enterprise_Suite.md` is a reference quality bar, not a replacement roadmap. Keep the current native Android Expo app and Google Play Billing direction.
- Core differentiators:
  - Doctor Packet for appointment prep.
  - Data Packet Builder for user-selected export, AI, Emergency ID, doctor share links, and monthly digest.
  - Caregiver Dashboard for families managing multiple people.
  - Smart Import from OCR into reviewable draft records.

## Pricing And Limits

- Free: self care profile, 1 additional care profile, 3 AI/OCR uses/month, basic export, basic Emergency ID, one basic self Doctor Packet.
- Pro Family India: INR 299/month.
- Pro Family International: USD 9.99/month target price through Google Play regional pricing.
- Pro Family unlocks up to 5 additional active care profiles, 100 AI/OCR uses/month, caregiver dashboard, advanced Doctor Packets, family packets, scoped share links, monthly family digest, and larger storage quota.
- Family Plus is reserved for later; do not implement it in v1.
- Google Play subscription product ID: `medvault_pro_family_monthly`.

## Enterprise Guardrails

- Android Play Store subscriptions use Google Play Billing first; Stripe/Razorpay are future web or approved alternative billing only.
- AI/OCR must never silently save medical data. Smart Import suggestions stay draft until user approval, and low-confidence medical values must be visibly verified before saving.
- Every AI medical explanation must show a non-dismissible medical disclaimer and server-side safety filtering before production launch.
- Public Emergency ID/share endpoints must use cryptographically random tokens, scoped packets, access logging, and rate limiting before production launch.
- File upload production rules: server-side MIME validation, size limits, storage review, and signed URL expiry.
- Account deletion must become a hard-delete workflow across auth, database rows, and storage objects before release.
- Export, AI, Emergency ID, Doctor Packet, share links, and digest must use Data Packet Builder scopes so users control exactly what leaves the vault.

## Phases

### Phase 1: Foundation

- [x] Create `MedVault_2.0`.
- [x] Add Expo Router + TypeScript foundation files.
- [x] Add NativeWind config.
- [x] Add Supabase client shell.
- [x] Add React Query client.
- [x] Add Zustand auth/profile/UI stores.
- [x] Add theme tokens and subscription pricing constants.
- [x] Add `.env.example`.
- [x] Add `eas.json`.
- [x] Add schema migration baseline.
- [x] Install dependencies.
- [x] Run `npx tsc --noEmit`.
- [x] Confirm app can boot through Metro.

### Phase 2: Auth + Navigation

- [x] Signup, login, logout, session persistence, protected routes.
- [x] Bottom tabs and More navigation.
- [x] Profile store and profile fetch.

### Phase 3: Subscription Core

- [x] Plan/quota types, upgrade banner, subscription service.
- [x] Razorpay Edge Function design for INR/USD plans.
- [x] Gate family expansion and AI usage.
- [ ] Replace default Android billing path with Google Play Billing.
- [x] Add Google Play purchase verification Edge Function contract.
- [ ] Gate Pro Family by verified Play entitlement.

### Phase 4: Dashboard

- [x] Connected summary cards, active profile awareness, recent activity, refills, onboarding.

### Phase 5: Timeline

- [x] CRUD events, filters, critical flag, soft delete.
- [ ] Timeline photo upload to `health_photos` storage.

### Phase 6: Medications

- [x] CRUD meds, check-ins, adherence, refill alerts.
- [x] Native scheduled medication reminder notifications.
- [x] Native scheduled refill alert notifications.
- [x] Reusable local notification helper for AI, documents, emergency, and general future feature alerts.

### Phase 7: Labs + AI

- [x] Lab CRUD, marker flags, AI interpretation, quota enforcement.
- [ ] Apply user-selected Data Packet scope before broad AI analysis summaries.

### Phase 8: Documents + OCR

- [x] Upload files, OCR, confidence state, search.
- [ ] Document share/download viewer.

### Phase 8.5: Roadmap Refactor

- [x] Update persistent planning/docs for Google Play Billing, Doctor Packet, Data Packet Builder, Pro Family limits, Smart Import, share links, and caregiver dashboard.
- [x] Split account/subscription data from health care profiles.
- [x] Add `care_profiles` migration and compatibility path from existing `profiles`/`family_profiles`.
- [x] Retrofit existing Dashboard, Timeline, Medications, Labs, and Documents to use care profile IDs consistently.
- [x] Deprecate Razorpay as the default Play Store mobile checkout path.
- [x] Verify `npx tsc --noEmit`.
- [x] Verify `npm audit --audit-level=moderate`.
- [x] Verify Android Metro export with `npx expo export --platform android --output-dir dist-verify`.

### Phase 9: Symptoms

- [x] Symptom CRUD, severity, resolved state, photos.
- [x] Use `symptom_entries`.
- [x] Link each symptom to a care profile.
- [x] Add native Symptoms route reachable from More.
- [x] Keep old `profile_id` fallback while writing new `care_profile_id` when available.

### Phase 10: Costs

- [x] Cost CRUD, monthly totals, trend chart, receipts.
- [x] Use `healthcare_costs`.
- [x] Link each cost to a care profile and optional source document.
- [x] Add native Costs route reachable from More.
- [x] Keep old `profile_id` fallback while writing new `care_profile_id` when available.

### Phase 11: Family

- [x] Add/switch/deactivate care profiles.
- [x] Free gate: self plus 1 additional active care profile.
- [x] Pro Family gate: self plus 5 additional active care profiles.
- [x] Caregiver Dashboard for medicines due today, missed meds, refills, abnormal labs, follow-ups, missing emergency info, and recent family activity.
- [x] Connect active care profile filtering across all features.
- [x] Add native Care Profiles route reachable from More.

### Phase 12: Data Packet Builder

- [x] Shared scope builder for AI analysis, Emergency ID, export, Doctor Packet, share links, and monthly digest.
- [x] User-selected care profiles, domains, date range, attachments, and critical-only mode.
- [x] Default to minimum useful data; never share or send all records automatically.
- [x] Add native Data Packet Builder route reachable from More.
- [x] Add preview service that counts selected records, critical records, attachments, and warnings before saving.
- [x] Save packet scope drafts into `data_packets` for downstream Doctor Packet, Export, Share Link, Emergency ID, AI, and Monthly Digest flows.

### Phase 13: Doctor Packet

- [x] First-class Doctor Packet flow.
- [x] User selects member, reason for visit, date range, meds, labs, symptoms, costs, documents, and timeline.
- [x] Generate clean PDF summary from selected records only.
- [x] Free: one basic self Doctor Packet.
- [x] Pro Family: family packets and attachment-enabled packet scope.
- [x] Save Doctor Packet metadata and link it to the exact `data_packets` scope used for generation.
- [x] Add native Doctor Packet route reachable from More.
- [ ] AI summary for Doctor Packet.
- [ ] Scheduled/recurring Doctor Packets.

### Phase 14: Smart Import

- [x] OCR produces reviewable draft records for medications, labs, timeline events, costs, and document metadata.
- [x] User approves each suggested record before saving.
- [x] Imported records keep a source document link.
- [x] Add native Smart Import route reachable from More.
- [x] Approvals reuse existing Timeline, Medication, Lab, and Cost services so imported records stay connected to care profiles and dashboards.
- [x] Rejections mark suggestions without creating health records.

### Phase 15: Share Links + Emergency ID

- [x] Time-limited doctor share links backed by selected Data Packet scope.
- [x] Free: one short-lived basic share link.
- [x] Pro Family: multiple active links, longer expiry, family packet links.
- [x] QR token, enable/disable, share, public responder page.
- [x] Emergency Scope Builder; never expose all records by default.
- [x] Emergency ID works per care profile.
- [x] Add Supabase public-token RPC contract so responder pages use scoped data without exposing private tables.
- [x] Add native Share + Emergency route reachable from More.

### Phase 16: Export

- [x] Export profile, family, timeline, meds, labs, docs, symptoms, costs, emergency data through Data Packet Builder.
- [x] PDF plus machine-readable bundle.
- [x] Keep basic export free; reserve advanced PDFs, family bundles, scheduled exports, and AI summaries for Pro Family.
- [x] Add shared scoped data collection to `dataPacketService` so Export, AI, Doctor Packet, Emergency ID, and future Digest use one selection backbone.
- [x] Add native Export route reachable from More.

### Phase 17: Monthly Family Digest

- [x] Pro Family digest of important changes across selected care profiles.
- [x] Uses Data Packet Builder scope and explicit user approval.
- [x] Add `monthly_family_digests` migration with RLS.
- [x] Add native Monthly Digest route reachable from More.
- [x] Save digest output and exact `data_packets` scope used for generation.
- [ ] Upgrade deterministic digest to Gemini AI summary during AI/Gemini Edge Function phase.

### Phase 18: Settings + Compliance

- [x] Profile, emergency contacts, privacy policy link, delete account request.
- [x] Play Store compliance checklist draft.
- [x] Privacy Policy draft.
- [x] Terms and Conditions draft.
- [x] User-controlled data sharing/export strategy.
- [x] Settings screen shows free/Pro limits and Google Play Billing direction.
- [x] Add `account_deletion_requests` migration with RLS.
- [x] Add configurable public legal/support URLs to `.env.example`.
- [ ] Google Play Billing live purchase compliance checklist after Play Console setup.
- [ ] Health apps declaration checklist after final feature/data inventory.

### Phase 19: Production Hardening

- [x] Offline state banner and React Query online awareness.
- [x] Root error boundary for recoverable screen failures.
- [x] Reusable haptics helper.
- [x] Icons/splash/adaptive icon config reviewed.
- [x] Android permissions tightened for Play Store review.
- [x] Dependency audit.
- [x] Production hardening checklist for RLS/storage, Sentry, EAS, Play Billing, AI safety, and Data Safety.
- [ ] Sentry integration after DSN is available.
- [ ] Supabase RLS/storage advisor review after live project migrations.
- [ ] Real-device EAS preview APK verification.

### Phase 20: Build + Release

- [x] Confirm native Android release direction with Google Play Billing first.
- [x] Review `app.json` Android package, permissions, icons, splash, and EAS project placeholder.
- [x] Review `eas.json` profiles for development/preview APK and production AAB.
- [x] Add build and release runbook.
- [x] Add service handoff checklist for Expo/EAS, Supabase, Google Play Billing, AI, and legal URLs.
- [x] Add service cross-check doc for Supabase, Google Play Billing, EAS, notifications, and AI/OCR.
- [x] Split mobile-safe `.env.example` from server-only `supabase/.env.example`.
- [x] Add package scripts for typecheck, audit, Android export verification, and Expo Doctor.
- [x] Align Expo SDK 54 dependency set for release checks (`expo-constants`, Skia, Babel preset, worklets).
- [x] Run local Phase 20 verification: TypeScript, npm audit, Expo Doctor, and Android export.
- [ ] EAS preview APK after Expo/EAS project access.
- [ ] Real-device testing after preview APK.
- [ ] Production AAB after live service setup and QA.
- [ ] Play Store listing, Data Safety, and Health apps declaration after public legal URLs and final data inventory.

### Phase 21: Security And Privacy Audit

- [x] Run repository-wide secret scan for service keys, API keys, JWT-like tokens, private keys, keystores, and accidental env files.
- [x] Review `.gitignore`, env examples, package config, EAS config, Supabase functions, migrations, auth flows, share links, Emergency ID, export, AI/OCR, and billing code.
- [x] Add `docs/security_audit.md` with Blocker, High, Medium, Low, and Fixed findings.
- [x] Add no-public-push safeguards to `.gitignore`.
- [x] Add Supabase security hardening migration for billing/quota column restrictions, owned Data Packet scopes, and owner-bound public packet RPC results.
- [x] Tighten Pro feature checks so plan strings do not unlock paid features without an active verified subscription status.
- [x] Update AI/OCR Edge Functions so quota counters are server-updated after mobile quota columns are locked down.
- [x] Add visible AI medical disclaimer and Emergency ID incompleteness disclaimer.
- [x] Run Phase 21 verification: TypeScript, npm audit, Expo Doctor, Android export, and final secret-pattern scan.
- [x] Add public share/Emergency access logging and database-level rate limiting to the public packet RPC.
- [x] Add hard-delete `delete-account` Edge Function and wire Settings to call it.
- [x] Replace Google Play verification stub with service-account OAuth and Android Publisher `subscriptionsv2` verification.
- [x] Wire local mobile `.env` to live Supabase project URL and publishable key.
- [x] Generate combined fresh-project migration SQL at `supabase/apply_all_migrations.sql`.
- [x] Add live Supabase setup checklist.
- [ ] Apply Phase 21 migration to live Supabase and verify restrictions.
- [ ] Deploy `delete-account` with JWT verification enabled and test against live Supabase.
- [ ] Test Google Play purchase verification in Play Console internal testing.

## Save State

Phase 21 Security And Privacy Audit is complete locally with live Supabase public env wired, combined migration SQL generated, secret scan, audit doc, no-public-push safeguards, Supabase security hardening migration, public packet access logs/rate limiting, hard-delete account Edge Function, Google Play backend verifier, verified-subscription gates, server-side AI/OCR quota updates, user-facing health disclaimers, TypeScript passing, audit clean, Expo Doctor passing, and Android export passing; next exact step is pasting `supabase/apply_all_migrations.sql` into the Supabase SQL Editor for project `lykfqucwylxljaxqmzcc`.

## Deferred Unchecked Items

These are intentionally still unchecked and should be handled in their later slices or hardening passes:

- Google Play Billing native purchase flow and verified entitlement gating require Play Console subscription setup, EAS development builds, backend service-account verification, and internal testing.
- Timeline photo upload and document viewer/share are older backlog enhancements, not prerequisites for the current sharing/export backbone.
- Broad AI analysis scoped by Data Packet, Doctor Packet AI summaries, scheduled packets, Gemini upgrade for Monthly Digest, and advanced export automation are later feature phases.
- Live Sentry setup, Supabase advisor review, real-device EAS builds, and Play Store release require service/project credentials and are handled in build/release phases.
- Real Google Play Billing entitlement gating requires Play Console subscription setup, EAS development builds, backend service-account verification, and internal testing.
