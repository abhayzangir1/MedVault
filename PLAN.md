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
- Continue from `execution_plan.md`, starting with local verification and safe private GitHub commit after live Supabase setup. Do not start EAS preview APK, Play Billing internal testing, or production AI/OCR until the remaining production-only secrets and live test-user checks are complete.

**Latest Save State**
- Phase 21 live Supabase hardening is verified with migrations through `20260515144138` applied, Edge Functions deployed, non-secret Google Play package/product secrets configured, DB-simulated disposable security tests passing, storage bucket privacy verified, Supabase Security Advisor reduced to intentional public packet warnings plus leaked-password dashboard setting, TypeScript passing, audit clean, Expo Doctor passing, Android export passing, and `.env`/Supabase CLI cache ignored from Git. Next exact step: commit and push the safe migration/docs updates, then enable leaked-password protection in Supabase Auth and run true client-session tests with a confirmed disposable user.
