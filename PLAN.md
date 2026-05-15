# MedVault 2.0 Persistent Execution Plan

**Summary**
Build MedVault 2.0 in `D:\abhay\mvp's\medvault\MedVault_2.0` as atomic vertical slices. Maintain `execution_plan.md` as the recovery file so any future Codex session can resume from the latest checked item.

**Session Rules**
- Work only inside `MedVault_2.0`.
- Never push code publicly or expose secrets.
- End every implementation session with: `Save State: <completed work + next exact step>`.
- Keep `execution_plan.md` updated after every completed slice.
- Every slice must compile before stopping: `npx tsc --noEmit`.

**Integration Handshake**
- Supabase: ask for Project URL and anon key only when wiring live auth/data.
- Supabase SQL: provide exact SQL and dashboard steps before requiring user action.
- Google Play Billing: ask for Play Console package name, subscription product/base plan IDs, license tester account, EAS build details, and Google service-account JSON only during billing integration/testing.
- Razorpay: reserved for future web checkout or approved alternative billing, not the default Play Store mobile checkout.
- AI/Gemini: ask for API key only when implementing Edge Functions.
- EAS: ask for Expo login/package/build details only during build phase.
- Never request service-role keys for mobile app `.env`.

**Pricing**
- Free: self care profile, 1 additional care profile, 3 AI/OCR uses/month, basic export, basic Emergency ID, one basic self Doctor Packet.
- Pro Family India: INR 299/month.
- Pro Family International: USD 9.99/month target price through Google Play regional pricing.
- Pro Family unlocks up to 5 additional active care profiles, 100 AI/OCR uses/month, caregiver dashboard, advanced Doctor Packets, family packets, scoped share links, monthly family digest, and larger storage quota.
- Google Play product ID: `medvault_pro_family_monthly`.

**Roadmap Revision**
- Keep the current native Android Expo app; do not rebuild from scratch.
- Use `MedVault_Enterprise_Suite.md` as a reference quality bar only; do not switch this project to web/Vite/Stripe.
- Split account/subscription data from health care profiles.
- Make Doctor Packet and Data Packet Builder core systems.
- Use Google Play Billing first for Play Store subscriptions.
- Keep Razorpay only for future web checkout or approved alternative billing.
- Keep basic access, basic export, and basic Emergency ID free.
- Add Smart Import, share links with expiry, Emergency Scope Builder, Caregiver Dashboard, and Monthly Family Digest.

**Enterprise Guardrails**
- Native Android and Google Play Billing remain the production path.
- Public health data access must use scoped packets, cryptographically random tokens, rate limiting, and access logging before release.
- AI/OCR output must be reviewed, safety-filtered, and explicitly confirmed before medical records are saved.
- Account deletion, storage validation, RLS/storage review, and Play Store health declarations are production blockers.

**Next Execution**
- Continue from `execution_plan.md`, starting with pasting `supabase/apply_all_migrations.sql` into the live Supabase SQL Editor for project `lykfqucwylxljaxqmzcc`, then deploy Supabase functions before EAS preview APK or Google Play Billing testing.

**Latest Save State**
- Phase 21 Security And Privacy Audit is complete locally with live Supabase public env wired, combined migration SQL generated, secret scan, audit doc, no-public-push safeguards, Supabase security hardening migration, public packet access logs/rate limiting, hard-delete account Edge Function, Google Play backend verifier, verified-subscription gates, server-side AI/OCR quota updates, user-facing health disclaimers, TypeScript passing, audit clean, Expo Doctor passing, and Android export passing. Next exact step: paste `supabase/apply_all_migrations.sql` into the Supabase SQL Editor for project `lykfqucwylxljaxqmzcc`.
