-- ============================================================
-- MedVault Phase 8.5: Care Profiles, Data Packets, Share Links,
-- Smart Import Traceability, and Google Play Billing Contract
-- ============================================================

-- 1. Account/subscription fields stay on profiles.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'pro_family'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'manual'
    CHECK (billing_provider IN ('google_play', 'razorpay', 'manual')),
  ADD COLUMN IF NOT EXISTS google_play_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS google_play_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_play_order_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_checked_at TIMESTAMPTZ;

-- 2. Unified care profiles: self and family members use the same model.
CREATE TABLE IF NOT EXISTS public.care_profiles (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                         TEXT NOT NULL CHECK (kind IN ('self', 'family')),
  relationship                 TEXT NOT NULL CHECK (relationship IN ('self', 'spouse', 'parent', 'child', 'sibling', 'other')),
  full_name                    TEXT NOT NULL,
  date_of_birth                DATE,
  blood_type                   TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown')),
  gender                       TEXT,
  avatar_url                   TEXT,
  allergies                    TEXT[] DEFAULT '{}',
  chronic_conditions           TEXT[] DEFAULT '{}',
  emergency_contact_name       TEXT,
  emergency_contact_phone      TEXT,
  emergency_contact_relation   TEXT,
  emergency_id_enabled         BOOLEAN DEFAULT false,
  emergency_id_token           TEXT UNIQUE,
  legacy_family_profile_id     UUID UNIQUE,
  is_active                    BOOLEAN DEFAULT true,
  created_at                   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.care_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own care profiles"
  ON public.care_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = owner_user_id);

CREATE POLICY "Users can insert own care profiles"
  ON public.care_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = owner_user_id);

CREATE POLICY "Users can update own care profiles"
  ON public.care_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);

CREATE POLICY "Users can delete own care profiles"
  ON public.care_profiles FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = owner_user_id);

CREATE INDEX IF NOT EXISTS idx_care_profiles_owner_active
  ON public.care_profiles (owner_user_id, is_active, kind);

-- Backfill one self care profile per account.
INSERT INTO public.care_profiles (
  id,
  owner_user_id,
  kind,
  relationship,
  full_name,
  date_of_birth,
  blood_type,
  gender,
  avatar_url,
  allergies,
  chronic_conditions,
  emergency_contact_name,
  emergency_contact_phone,
  emergency_contact_relation,
  emergency_id_enabled,
  emergency_id_token,
  created_at
)
SELECT
  p.id,
  p.id,
  'self',
  'self',
  COALESCE(NULLIF(p.full_name, ''), 'Self'),
  p.date_of_birth,
  p.blood_type,
  p.gender,
  p.avatar_url,
  COALESCE(p.allergies, '{}'),
  COALESCE(p.chronic_conditions, '{}'),
  p.emergency_contact_name,
  p.emergency_contact_phone,
  p.emergency_contact_relation,
  p.emergency_id_enabled,
  p.emergency_id_token,
  p.created_at
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  blood_type = EXCLUDED.blood_type,
  gender = EXCLUDED.gender,
  avatar_url = EXCLUDED.avatar_url,
  allergies = EXCLUDED.allergies,
  chronic_conditions = EXCLUDED.chronic_conditions,
  emergency_contact_name = EXCLUDED.emergency_contact_name,
  emergency_contact_phone = EXCLUDED.emergency_contact_phone,
  emergency_contact_relation = EXCLUDED.emergency_contact_relation,
  emergency_id_enabled = EXCLUDED.emergency_id_enabled,
  emergency_id_token = EXCLUDED.emergency_id_token;

-- Backfill existing family profiles into care_profiles without removing family_profiles.
INSERT INTO public.care_profiles (
  owner_user_id,
  kind,
  relationship,
  full_name,
  date_of_birth,
  blood_type,
  legacy_family_profile_id,
  is_active,
  created_at
)
SELECT
  fp.owner_user_id,
  'family',
  fp.relationship,
  fp.full_name,
  fp.date_of_birth,
  fp.blood_type,
  fp.id,
  fp.is_active,
  fp.created_at
FROM public.family_profiles fp
ON CONFLICT (legacy_family_profile_id) DO UPDATE SET
  relationship = EXCLUDED.relationship,
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  blood_type = EXCLUDED.blood_type,
  is_active = EXCLUDED.is_active;

-- 3. Add care_profile_id beside legacy profile_id. Do not drop profile_id yet.
ALTER TABLE public.health_events
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.symptom_entries
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.healthcare_costs
  ADD COLUMN IF NOT EXISTS care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

-- Self rows used profile_id IS NULL; family rows used family_profiles.id.
UPDATE public.health_events he
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = he.profile_id),
  he.user_id
)
WHERE he.care_profile_id IS NULL;

UPDATE public.medications m
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = m.profile_id),
  m.user_id
)
WHERE m.care_profile_id IS NULL;

UPDATE public.lab_results lr
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = lr.profile_id),
  lr.user_id
)
WHERE lr.care_profile_id IS NULL;

UPDATE public.documents d
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = d.profile_id),
  d.user_id
)
WHERE d.care_profile_id IS NULL;

UPDATE public.symptom_entries se
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = se.profile_id),
  se.user_id
)
WHERE se.care_profile_id IS NULL;

UPDATE public.healthcare_costs hc
SET care_profile_id = COALESCE(
  (SELECT cp.id FROM public.care_profiles cp WHERE cp.legacy_family_profile_id = hc.profile_id),
  hc.user_id
)
WHERE hc.care_profile_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_events_care_profile_date
  ON public.health_events (care_profile_id, event_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medications_care_profile_status
  ON public.medications (care_profile_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_results_care_profile_date
  ON public.lab_results (care_profile_id, test_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_care_profile_created
  ON public.documents (care_profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_symptoms_care_profile_date
  ON public.symptom_entries (care_profile_id, onset_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_costs_care_profile_date
  ON public.healthcare_costs (care_profile_id, cost_date DESC)
  WHERE deleted_at IS NULL;

-- 4. Data Packet Builder, Doctor Packets, and share links.
CREATE TABLE IF NOT EXISTS public.data_packets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose               TEXT NOT NULL CHECK (purpose IN ('export', 'ai_analysis', 'emergency_id', 'doctor_packet', 'share_link', 'monthly_digest')),
  care_profile_ids      UUID[] NOT NULL DEFAULT '{}',
  domains               TEXT[] NOT NULL DEFAULT '{}',
  date_range            TEXT NOT NULL DEFAULT 'last_90_days',
  custom_start_date     DATE,
  custom_end_date       DATE,
  include_attachments   BOOLEAN DEFAULT false,
  include_critical_only BOOLEAN DEFAULT false,
  reason_for_visit      TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.data_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own data packets"
  ON public.data_packets FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_data_packets_user_purpose
  ON public.data_packets (user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS public.doctor_packets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_packet_id   UUID NOT NULL REFERENCES public.data_packets(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  pdf_storage_path TEXT,
  ai_summary       TEXT,
  status           TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'failed')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.doctor_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own doctor packets"
  ON public.doctor_packets FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.share_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_packet_id  UUID NOT NULL REFERENCES public.data_packets(id) ON DELETE CASCADE,
  token           TEXT UNIQUE NOT NULL,
  label           TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  access_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own share links"
  ON public.share_links FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_share_links_user_active
  ON public.share_links (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- 5. Smart Import review queue. Extracted suggestions stay drafts until user approves.
CREATE TABLE IF NOT EXISTS public.smart_import_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  care_profile_id     UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  source_document_id  UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  target_domain       TEXT NOT NULL CHECK (target_domain IN ('medications', 'labs', 'timeline', 'costs', 'documents')),
  suggested_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence          INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_record_id   UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.smart_import_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own smart import suggestions"
  ON public.smart_import_suggestions FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_smart_import_user_status
  ON public.smart_import_suggestions (user_id, status, created_at DESC);
