# MedVault — Secure Personal Health Record (PHR) Vault

MedVault is a privacy-first Personal Health Record (PHR) vault and companion backend that helps users securely store, search, and share medical records, prescriptions, and photos with trusted providers. It is designed to integrate with Supabase for authentication and storage and supports serverless edge functions for critical operations like purchase verification and account deletion.

> NOTE: This repository is private. Follow the environment setup steps below to run locally.

## Features

- Encrypted document storage (Supabase Storage)
- Secure authentication & user profiles (Supabase Auth)
- Smart import & OCR powered by LLMs (Gemini/GEMINI_API_KEY)
- In-app subscriptions and purchase verification (Google Play / Razorpay legacy paths)
- Edge functions for account deletion, purchase verification, and server-side secrets

## Architecture

```mermaid
flowchart LR
  A[Mobile App / Web Client]
  B[Supabase Auth]
  C[Supabase Storage]
  D[Supabase Edge Functions]
  E[Third-party AI (Gemini) or OCR API]
  F[Google Play / Razorpay]

  A -->|Sign-in / Upload| B
  A -->|Upload files| C
  D -->|Server-side operations| C
  D -->|Verify purchases| F
  A -->|OCR / Summaries| E
```

See `supabase/functions/README.md` for function-specific secrets and notes.

## Environment Variables (.env.example)

Copy this to `.env` or your environment provider and populate values before running.

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Play (Android subscription testing)
GOOGLE_PLAY_PACKAGE_NAME=
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=

# AI / OCR
GEMINI_API_KEY=

# Razorpay (legacy / web)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_PRO_INR_MONTHLY=
RAZORPAY_PLAN_PRO_USD_MONTHLY=

# Optional
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

```

## Local Development

Prerequisites:
- Node 18+, pnpm
- Supabase project (free tier is sufficient for development)
- (Optional) Google Play service account JSON for purchase verification

Steps:

```bash
pnpm install
cp .env.example .env
# set SUPABASE variables and any service keys
pnpm dev
```

Edge functions (Supabase):
- see `supabase/functions/README.md` for required secrets and deployment notes.

## Security & Privacy

- Never commit real keys or service account JSON to git. Use `.gitignore` to exclude `.env` and any service account files.
- Only expose safe public keys in mobile app (`EXPO_PUBLIC_*`). Server-only secrets must be stored in Supabase Service Role or environment variables for edge functions.

## Code Formatting

Prettier config included (`.prettierrc`). Run `pnpm format` or configure your editor to format on save.

## Next Steps

- Add unit tests and CI for edge functions
- Harden storage encryption-at-rest and key rotation
- Provide E2E test harness for mobile upload/purchase flow

Maintainer: @abhayzangir1
