# Live Supabase Setup

Project ref: `lykfqucwylxljaxqmzcc`

Project URL:

```text
https://lykfqucwylxljaxqmzcc.supabase.co
```

## Completed Locally

- Mobile `.env` has been created with the Supabase URL and publishable key.
- Combined fresh-project migration file has been generated at `supabase/apply_all_migrations.sql`.
- Supabase CLI has been linked to project `lykfqucwylxljaxqmzcc`.
- Local private `.env` and Supabase CLI cache are ignored from Git.

## Completed On Live Supabase

- Migrations through `20260515144138` have been applied with `supabase db push`.
- Live hardening migrations added:
  - `20260515143140_phase_21_live_grants_and_profile_insert_guard.sql`
  - `20260515144003_phase_21_advisor_hardening.sql`
  - `20260515144138_phase_21_data_packet_helper_invoker.sql`
- Edge Functions are deployed and active:
  - `verify-google-play-purchase`
  - `delete-account`
  - `scan-document`
  - `generate-lab-interpretation`
- Non-secret Google Play billing config has been set in Supabase secrets:
  - `GOOGLE_PLAY_PACKAGE_NAME=com.medvault.app`
  - `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=medvault_pro_family_monthly`
- DB-simulated disposable security test passed for billing-field locks, owned packet scopes, unowned packet denial, scoped public packet output, revoked/expired link denial, and access logging.
- Storage bucket configuration verified:
  - `documents`: private, 25 MB, PDF/JPEG/PNG.
  - `health_photos`: private, 5 MB, JPEG/PNG/WebP.
  - `avatars`: public, 5 MB, JPEG/PNG/WebP, with broad object listing removed.
- Supabase Security Advisor now reports only:
  - intentional public `get_public_health_packet` SECURITY DEFINER warnings.
  - leaked-password protection disabled in Auth dashboard.
  - signed-in execution warning for `get_public_health_packet`, kept so logged-in users can preview responder packets.

## Dashboard Setup Choices

Use these choices for the project:

- Data API: enabled.
- Automatically expose new tables: disabled when possible.
- Automatic RLS: enabled.
- Postgres type: default Postgres.
- OrioleDB alpha: do not use.
- Storage buckets: created by migration as private `documents`, private `health_photos`, and public `avatars`.

## Apply Migrations Manually If Needed

The live project has already been migrated through the CLI. Use this manual path only for disaster recovery or a fresh project:

1. Open Supabase Dashboard.
2. Select project `lykfqucwylxljaxqmzcc`.
3. Go to SQL Editor.
4. Open local file `supabase/apply_all_migrations.sql`.
5. Paste the full SQL into the editor.
6. Run it once on the fresh project.

If the SQL fails:

- Do not keep clicking Run repeatedly.
- Copy the first error message and line number.
- Fix the exact failed statement, then continue carefully.

## After Migrations

Verify:

- Tables exist in Table Editor.
- RLS is enabled on all app tables.
- Storage buckets exist:
  - `documents`: private.
  - `health_photos`: private.
  - `avatars`: public.
- Function `get_public_health_packet` exists.
- Table `public_packet_access_logs` exists.

## Dashboard Security Steps Still Needed

1. Go to Supabase Dashboard -> Authentication -> Settings.
2. Enable leaked password protection.
3. Keep email confirmation enabled for production. For automated true client-session tests, either confirm a disposable user manually or temporarily disable confirmation only for the test window.
4. Run Security Advisor again after the dashboard change.

## Secrets For Edge Functions

Do not paste these into the mobile app `.env`.

Already configured by Supabase or CLI:

```text
SUPABASE_SERVICE_ROLE_KEY=<managed by Supabase>
GOOGLE_PLAY_PACKAGE_NAME=com.medvault.app
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=medvault_pro_family_monthly
```

Still pending before production AI/OCR and Play Billing testing:

```text
GEMINI_API_KEY=
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
```

Razorpay secrets remain future-only unless approved alternative billing or web checkout is selected.

## Deploy Functions

Functions have already been deployed. Re-deploy after code changes with:

```bash
supabase functions deploy verify-google-play-purchase --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy delete-account --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy scan-document --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy generate-lab-interpretation --project-ref lykfqucwylxljaxqmzcc
```

Deploy `delete-account` with JWT verification enabled.
