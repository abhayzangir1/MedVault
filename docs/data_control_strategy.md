# User-Controlled Health Data Sharing Strategy

MedVault must not assume that every export, AI analysis, Doctor Packet, share link, monthly digest, or Emergency ID view includes all available health data. Users choose exactly what is included before data leaves its feature context.

## Core Principle

Default to minimum useful data, then let users expand scope.

- Export: user-selected domains, care profiles, date range, and attachments.
- AI analysis: user-selected records only, with clear consent before sending data to Gemini.
- Doctor Packet: appointment-focused selected records only.
- Doctor share links: selected records only, with expiry and revoke controls.
- Monthly Family Digest: selected care profiles only, with explicit Pro user approval.
- Emergency ID: critical, responder-safe information only, explicitly selected by the user.

## Shared Scope Model

Use `src/lib/dataScopes.ts` for every cross-feature data packet:

- `DEFAULT_EXPORT_SCOPE`
- `DEFAULT_AI_ANALYSIS_SCOPE`
- `DEFAULT_EMERGENCY_SCOPE`
- `DEFAULT_DOCTOR_PACKET_SCOPE`
- `DEFAULT_SHARE_LINK_SCOPE`
- `DEFAULT_MONTHLY_DIGEST_SCOPE`

Every future service that gathers cross-feature records must accept a `DataScopeSelection`.

Use "care profile" for the health subject, whether it is the account owner or a family member. Do not use `profile_id = null` to mean self in new code.

## Data Packet Builder

Data Packet Builder is the shared UX and service layer for Export, AI analysis, Doctor Packet, share links, Emergency ID, and Monthly Family Digest.

Users choose:

- care profile or selected family care profiles,
- domains,
- date range,
- include attachments,
- critical-only mode,
- purpose-specific options such as reason for visit or expiry.

The builder should show a plain-language preview before data leaves the app context.

## Export UX

Users should be able to choose:

- Care profile: self, one family member, or selected family care profiles.
- Domains: timeline, medications, labs, documents, symptoms, costs, emergency info.
- Date range: all time, last 30 days, last 90 days, last 1 year, custom.
- Include attachments: yes/no.
- Format: PDF, CSV/JSON bundle.

Basic user-selected export should be free. Pro Family can unlock:

- branded doctor-ready reports,
- multi-profile family bundles,
- AI-generated summaries,
- scheduled recurring exports,
- advanced layouts.

Do not paywall a user's basic access to their own records.

## AI Analysis UX

Before calling AI, show:

- selected domains,
- selected date range,
- selected care profiles,
- whether attachments/OCR text are included,
- medical disclaimer.

Only selected data should be sent to AI Edge Functions.

## Doctor Packet UX

Doctor Packet should be a first-class flow, not a hidden export option.

Users choose:

- care profile,
- reason for visit,
- date range,
- medications, labs, symptoms, costs, documents, and timeline,
- include attachments or only summaries.

Free users can generate a basic self Doctor Packet. Pro Family unlocks family packets, polished PDFs, AI summaries, attachments, scheduled packets, and share links.

## Share Link UX

Doctor share links must:

- be scoped by Data Packet Builder,
- expire automatically,
- be revocable,
- show only the selected care profile data,
- avoid exposing costs or documents unless selected.

## Emergency ID UX

Emergency ID must be opt-in and scoped.

Users choose:

- emergency contact,
- blood type,
- allergies,
- chronic conditions,
- active medications,
- critical timeline events,
- optional recent labs if they explicitly select them.

Emergency ID must not expose documents, costs, full symptom diary, non-critical timeline items, or family records unless explicitly selected.

## Monetization Decision

Do not charge for basic export or Emergency ID data control. Charging for basic data access creates trust and policy risk for a health app.

Paid Pro Family export and packet options are acceptable when they add value beyond raw access:

- advanced PDF formatting,
- doctor visit packet,
- family bundle,
- AI summary,
- recurring scheduled exports.
