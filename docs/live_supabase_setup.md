# Live Supabase Setup

Project ref: `lykfqucwylxljaxqmzcc`

Project URL:

```text
https://lykfqucwylxljaxqmzcc.supabase.co
```

## Completed Locally

- Mobile `.env` has been created with the Supabase URL and publishable key.
- Combined fresh-project migration file has been generated at `supabase/apply_all_migrations.sql`.

## Dashboard Setup Choices

Use these choices for the project:

- Data API: enabled.
- Automatically expose new tables: disabled when possible.
- Automatic RLS: enabled.
- Postgres type: default Postgres.
- OrioleDB alpha: do not use.
- Storage buckets: created by migration as private `documents`, private `health_photos`, and public `avatars`.

## Apply Migrations

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

## Secrets For Edge Functions

Do not paste these into the mobile app `.env`.

Configure later in Supabase project secrets:

```text
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GOOGLE_PLAY_PACKAGE_NAME=com.medvault.app
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=medvault_pro_family_monthly
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
```

Razorpay secrets remain future-only unless approved alternative billing or web checkout is selected.

## Deploy Functions Later

Deploy after CLI login or connector access is available:

```bash
supabase functions deploy verify-google-play-purchase --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy delete-account --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy scan-document --project-ref lykfqucwylxljaxqmzcc
supabase functions deploy generate-lab-interpretation --project-ref lykfqucwylxljaxqmzcc
```

Deploy `delete-account` with JWT verification enabled.
