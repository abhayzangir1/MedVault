-- MedVault combined migration bundle
-- Generated from supabase/migrations in filename order.


-- ============================================================
-- 001_complete_schema.sql
-- ============================================================

-- ============================================================
-- MedVault — Complete Database Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================================

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                   TEXT,
  date_of_birth               DATE,
  blood_type                  TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown')),
  gender                      TEXT,
  country                     TEXT DEFAULT 'IN',
  avatar_url                  TEXT,
  allergies                   TEXT[] DEFAULT '{}',
  chronic_conditions          TEXT[] DEFAULT '{}',
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  emergency_id_enabled        BOOLEAN DEFAULT false,
  emergency_id_token          TEXT UNIQUE,
  ai_interpretations_used     INTEGER DEFAULT 0,
  ai_quota_reset_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  plan                        TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  billing_region              TEXT DEFAULT 'IN' CHECK (billing_region IN ('IN', 'INTL')),
  razorpay_subscription_id    TEXT,
  subscription_status         TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. ONBOARDING PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_first_event      BOOLEAN DEFAULT false,
  added_first_medication BOOLEAN DEFAULT false,
  uploaded_first_document BOOLEAN DEFAULT false,
  checklist_dismissed    BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding"
  ON public.onboarding_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding"
  ON public.onboarding_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. FAMILY PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL CHECK (relationship IN ('self', 'spouse', 'parent', 'child', 'sibling', 'other')),
  full_name       TEXT NOT NULL,
  date_of_birth   DATE,
  blood_type      TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown')),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.family_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own family profiles"
  ON public.family_profiles FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can insert own family profiles"
  ON public.family_profiles FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own family profiles"
  ON public.family_profiles FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete own family profiles"
  ON public.family_profiles FOR DELETE
  USING (auth.uid() = owner_user_id);

-- ============================================================
-- 4. HEALTH EVENTS (Timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.health_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  category        TEXT CHECK (category IN (
    'diagnosis', 'medication', 'surgery', 'vaccination', 'allergy',
    'injury', 'lab_test', 'imaging', 'consultation', 'hospitalization', 'other'
  )),
  event_date      DATE NOT NULL,
  description     TEXT,
  is_critical     BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health events"
  ON public.health_events FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own health events"
  ON public.health_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health events"
  ON public.health_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health events"
  ON public.health_events FOR DELETE
  USING (auth.uid() = user_id);

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_health_events_user_date
  ON public.health_events (user_id, event_date DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 5. HEALTH EVENT PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.health_event_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.health_events(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.health_event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event photos"
  ON public.health_event_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.health_events
      WHERE id = health_event_photos.event_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own event photos"
  ON public.health_event_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.health_events
      WHERE id = health_event_photos.event_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own event photos"
  ON public.health_event_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.health_events
      WHERE id = health_event_photos.event_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. MEDICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  drug_name       TEXT NOT NULL,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  notes           TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discontinued', 'completed')),
  refill_date     DATE,
  reminder_time   TIME,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own medications"
  ON public.medications FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own medications"
  ON public.medications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own medications"
  ON public.medications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_medications_user_status
  ON public.medications (user_id, status)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 7. MEDICATION PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medication_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id   UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  photo_url       TEXT NOT NULL,
  storage_path    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medication_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own medication photos"
  ON public.medication_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medications
      WHERE id = medication_photos.medication_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own medication photos"
  ON public.medication_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications
      WHERE id = medication_photos.medication_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own medication photos"
  ON public.medication_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.medications
      WHERE id = medication_photos.medication_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 8. MEDICATION CHECK-INS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medication_checkins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id     UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'skipped')),
  checkin_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (medication_id, checkin_date)
);

ALTER TABLE public.medication_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins"
  ON public.medication_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checkins"
  ON public.medication_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkins"
  ON public.medication_checkins FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_checkins_med_date
  ON public.medication_checkins (medication_id, checkin_date DESC);

-- ============================================================
-- 9. LAB RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lab_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id          UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  test_name           TEXT NOT NULL,
  test_date           DATE NOT NULL,
  results             JSONB DEFAULT '[]'::jsonb,
  -- results format: [{ "marker": "Hemoglobin", "value": 13.8, "unit": "g/dL", "reference_low": 12.0, "reference_high": 17.5, "flag": "normal" }]
  ai_interpretation   TEXT,
  ai_interpreted_at   TIMESTAMPTZ,
  translations        JSONB DEFAULT '{}'::jsonb,
  -- translations format: { "hi": "Hindi translation...", "ta": "Tamil translation..." }
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lab results"
  ON public.lab_results FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own lab results"
  ON public.lab_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lab results"
  ON public.lab_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_lab_results_user_date
  ON public.lab_results (user_id, test_date DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 10. DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id          UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  file_name           TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  storage_path        TEXT,
  file_type           TEXT,
  file_size           INTEGER,
  document_category   TEXT CHECK (document_category IN (
    'lab_report', 'prescription', 'insurance', 'imaging', 'discharge_summary', 'other'
  )),
  ocr_text            TEXT,
  ocr_confidence      INTEGER,
  is_handwritten      BOOLEAN DEFAULT false,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_user
  ON public.documents (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 11. SYMPTOM ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.symptom_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  symptom_name    TEXT NOT NULL,
  severity        INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 10),
  onset_date      DATE NOT NULL,
  notes           TEXT,
  resolved        BOOLEAN DEFAULT false,
  resolved_date   DATE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.symptom_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own symptoms"
  ON public.symptom_entries FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own symptoms"
  ON public.symptom_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own symptoms"
  ON public.symptom_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 12. SYMPTOM PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.symptom_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom_id    UUID NOT NULL REFERENCES public.symptom_entries(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.symptom_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own symptom photos"
  ON public.symptom_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.symptom_entries
      WHERE id = symptom_photos.symptom_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own symptom photos"
  ON public.symptom_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.symptom_entries
      WHERE id = symptom_photos.symptom_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own symptom photos"
  ON public.symptom_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.symptom_entries
      WHERE id = symptom_photos.symptom_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 13. HEALTHCARE COSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.healthcare_costs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id            UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  amount                DECIMAL(10,2) NOT NULL,
  cost_date             DATE NOT NULL,
  category              TEXT CHECK (category IN (
    'consultation', 'medication', 'lab', 'imaging', 'surgery', 'insurance_premium', 'other'
  )),
  description           TEXT,
  provider_name         TEXT,
  reimbursement_status  TEXT DEFAULT 'not_applicable' CHECK (reimbursement_status IN (
    'pending', 'submitted', 'reimbursed', 'not_applicable'
  )),
  reimbursement_amount  DECIMAL(10,2),
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.healthcare_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own costs"
  ON public.healthcare_costs FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own costs"
  ON public.healthcare_costs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own costs"
  ON public.healthcare_costs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_costs_user_date
  ON public.healthcare_costs (user_id, cost_date DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 14. COST PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cost_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_id       UUID NOT NULL REFERENCES public.healthcare_costs(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cost_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cost photos"
  ON public.cost_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.healthcare_costs
      WHERE id = cost_photos.cost_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cost photos"
  ON public.cost_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.healthcare_costs
      WHERE id = cost_photos.cost_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cost photos"
  ON public.cost_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.healthcare_costs
      WHERE id = cost_photos.cost_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 15. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  type        TEXT CHECK (type IN ('refill', 'checkin', 'ai_complete', 'subscription', 'system')),
  data        JSONB DEFAULT '{}'::jsonb,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;


-- ============================================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.onboarding_progress (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ============================================================
-- RPC: Get emergency profile (public access — no auth needed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_emergency_profile(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'full_name', p.full_name,
    'date_of_birth', p.date_of_birth,
    'blood_type', p.blood_type,
    'gender', p.gender,
    'allergies', p.allergies,
    'chronic_conditions', p.chronic_conditions,
    'emergency_contact_name', p.emergency_contact_name,
    'emergency_contact_phone', p.emergency_contact_phone,
    'emergency_contact_relation', p.emergency_contact_relation,
    'active_medications', (
      SELECT COALESCE(json_agg(json_build_object(
        'drug_name', m.drug_name,
        'dosage', m.dosage,
        'frequency', m.frequency
      )), '[]'::json)
      FROM public.medications m
      WHERE m.user_id = p.id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
    ),
    'critical_events', (
      SELECT COALESCE(json_agg(json_build_object(
        'title', he.title,
        'category', he.category,
        'event_date', he.event_date,
        'description', he.description
      ) ORDER BY he.event_date DESC), '[]'::json)
      FROM public.health_events he
      WHERE he.user_id = p.id
        AND he.is_critical = true
        AND he.deleted_at IS NULL
      LIMIT 10
    )
  ) INTO result
  FROM public.profiles p
  WHERE p.emergency_id_token = p_token
    AND p.emergency_id_enabled = true;

  IF result IS NULL THEN
    RETURN json_build_object('error', 'Emergency profile not found or disabled');
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- STORAGE BUCKETS
-- Run these in separate SQL statements or via Supabase Dashboard
-- ============================================================

-- Create storage buckets (run each INSERT separately if needed)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('documents', 'documents', false, 26214400, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
  ('health_photos', 'health_photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for 'documents' bucket
CREATE POLICY "Users can upload own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for 'health_photos' bucket
CREATE POLICY "Users can upload own health photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'health_photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own health photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'health_photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own health photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'health_photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for 'avatars' bucket (public read)
CREATE POLICY "Users can upload own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 002_phase_8_5_care_profiles_packets_billing.sql
-- ============================================================

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

-- ============================================================
-- 003_phase_15_share_links_emergency.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 15: Scoped Share Links and Emergency ID
-- ============================================================

CREATE TABLE IF NOT EXISTS public.emergency_profile_scopes (
  care_profile_id UUID PRIMARY KEY REFERENCES public.care_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_packet_id UUID NOT NULL REFERENCES public.data_packets(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.emergency_profile_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own emergency scopes"
  ON public.emergency_profile_scopes FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_emergency_profile_scopes_token_enabled
  ON public.emergency_profile_scopes (token, enabled);

CREATE OR REPLACE FUNCTION public.get_public_health_packet(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  packet_record public.data_packets%ROWTYPE;
  token_type TEXT;
  share_record public.share_links%ROWTYPE;
  emergency_record public.emergency_profile_scopes%ROWTYPE;
BEGIN
  SELECT *
  INTO share_record
  FROM public.share_links
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > NOW()
  LIMIT 1;

  IF FOUND THEN
    token_type := 'share_link';

    UPDATE public.share_links
    SET access_count = COALESCE(access_count, 0) + 1
    WHERE id = share_record.id;

    SELECT *
    INTO packet_record
    FROM public.data_packets
    WHERE id = share_record.data_packet_id;
  ELSE
    SELECT *
    INTO emergency_record
    FROM public.emergency_profile_scopes
    WHERE token = p_token
      AND enabled = true
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Packet not found or expired.');
    END IF;

    token_type := 'emergency_id';

    SELECT *
    INTO packet_record
    FROM public.data_packets
    WHERE id = emergency_record.data_packet_id;
  END IF;

  IF packet_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Packet scope is unavailable.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'token_type', token_type,
    'expires_at', CASE WHEN token_type = 'share_link' THEN share_record.expires_at ELSE NULL END,
    'scope', jsonb_build_object(
      'purpose', packet_record.purpose,
      'domains', packet_record.domains,
      'date_range', packet_record.date_range,
      'include_attachments', packet_record.include_attachments,
      'include_critical_only', packet_record.include_critical_only,
      'reason_for_visit', packet_record.reason_for_visit
    ),
    'care_profiles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'full_name', cp.full_name,
        'relationship', cp.relationship,
        'date_of_birth', cp.date_of_birth,
        'blood_type', cp.blood_type,
        'allergies', cp.allergies,
        'chronic_conditions', cp.chronic_conditions,
        'emergency_contact_name', cp.emergency_contact_name,
        'emergency_contact_phone', cp.emergency_contact_phone,
        'emergency_contact_relation', cp.emergency_contact_relation
      )), '[]'::jsonb)
      FROM public.care_profiles cp
      WHERE cp.id = ANY(packet_record.care_profile_ids)
        AND cp.is_active = true
    ),
    'records', jsonb_build_object(
      'timeline', CASE WHEN 'timeline' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'title', he.title,
          'category', he.category,
          'event_date', he.event_date,
          'description', he.description,
          'is_critical', he.is_critical,
          'care_profile_id', he.care_profile_id
        ) ORDER BY he.event_date DESC), '[]'::jsonb)
        FROM public.health_events he
        WHERE he.care_profile_id = ANY(packet_record.care_profile_ids)
          AND he.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR he.is_critical = true)
          AND (packet_record.custom_start_date IS NULL OR he.event_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR he.event_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'medications', CASE WHEN 'medications' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'drug_name', m.drug_name,
          'dosage', m.dosage,
          'frequency', m.frequency,
          'status', m.status,
          'refill_date', m.refill_date,
          'notes', m.notes,
          'care_profile_id', m.care_profile_id
        ) ORDER BY m.drug_name ASC), '[]'::jsonb)
        FROM public.medications m
        WHERE m.care_profile_id = ANY(packet_record.care_profile_ids)
          AND m.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR (m.status = 'active' AND (m.reminder_time IS NOT NULL OR m.refill_date IS NOT NULL)))
      ) ELSE '[]'::jsonb END,
      'labs', CASE WHEN 'labs' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'test_name', lr.test_name,
          'test_date', lr.test_date,
          'results', lr.results,
          'care_profile_id', lr.care_profile_id
        ) ORDER BY lr.test_date DESC), '[]'::jsonb)
        FROM public.lab_results lr
        WHERE lr.care_profile_id = ANY(packet_record.care_profile_ids)
          AND lr.deleted_at IS NULL
          AND (packet_record.custom_start_date IS NULL OR lr.test_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR lr.test_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'documents', CASE WHEN 'documents' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'file_name', d.file_name,
          'document_category', d.document_category,
          'ocr_text', d.ocr_text,
          'ocr_confidence', d.ocr_confidence,
          'file_url', CASE WHEN packet_record.include_attachments THEN d.file_url ELSE NULL END,
          'care_profile_id', d.care_profile_id,
          'created_at', d.created_at
        ) ORDER BY d.created_at DESC), '[]'::jsonb)
        FROM public.documents d
        WHERE d.care_profile_id = ANY(packet_record.care_profile_ids)
          AND d.deleted_at IS NULL
      ) ELSE '[]'::jsonb END,
      'symptoms', CASE WHEN 'symptoms' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'symptom_name', se.symptom_name,
          'severity', se.severity,
          'onset_date', se.onset_date,
          'notes', se.notes,
          'resolved', se.resolved,
          'care_profile_id', se.care_profile_id
        ) ORDER BY se.onset_date DESC), '[]'::jsonb)
        FROM public.symptom_entries se
        WHERE se.care_profile_id = ANY(packet_record.care_profile_ids)
          AND se.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR se.severity >= 8)
          AND (packet_record.custom_start_date IS NULL OR se.onset_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR se.onset_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'costs', CASE WHEN 'costs' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'amount', hc.amount,
          'cost_date', hc.cost_date,
          'category', hc.category,
          'description', hc.description,
          'provider_name', hc.provider_name,
          'care_profile_id', hc.care_profile_id
        ) ORDER BY hc.cost_date DESC), '[]'::jsonb)
        FROM public.healthcare_costs hc
        WHERE hc.care_profile_id = ANY(packet_record.care_profile_ids)
          AND hc.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR hc.amount >= 10000)
          AND (packet_record.custom_start_date IS NULL OR hc.cost_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR hc.cost_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_health_packet(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_health_packet(TEXT) TO anon, authenticated;

-- ============================================================
-- 004_phase_17_monthly_digest.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 17: Monthly Family Digest
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_family_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_packet_id  UUID NOT NULL REFERENCES public.data_packets(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  digest_text     TEXT NOT NULL,
  ai_summary      TEXT,
  status          TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'failed')),
  month_key       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.monthly_family_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own monthly family digests"
  ON public.monthly_family_digests FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_monthly_family_digests_user_month
  ON public.monthly_family_digests (user_id, month_key, created_at DESC);

-- ============================================================
-- 005_phase_18_settings_compliance.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 18: Settings, Compliance, and Delete Requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'cancelled', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own deletion requests"
  ON public.account_deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can view own deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_status
  ON public.account_deletion_requests (user_id, status, requested_at DESC);

-- Production hard-delete is intentionally handled by an authenticated Edge Function
-- with service-role privileges so mobile never stores admin credentials.

-- ============================================================
-- 006_phase_21_security_hardening.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 21: Pre-Publish Security Hardening
-- ============================================================

-- 1. Authenticated mobile clients may update profile demographics/settings,
-- but must not self-grant paid plans or mutate billing entitlement fields.
REVOKE UPDATE (
  plan,
  billing_provider,
  google_play_subscription_id,
  google_play_purchase_token,
  google_play_order_id,
  subscription_product_id,
  subscription_checked_at,
  razorpay_subscription_id,
  subscription_status,
  ai_interpretations_used,
  ai_quota_reset_at
) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (select auth.uid()) = NEW.id THEN
    NEW.plan := 'free';
    NEW.billing_provider := 'manual';
    NEW.google_play_subscription_id := NULL;
    NEW.google_play_purchase_token := NULL;
    NEW.google_play_order_id := NULL;
    NEW.subscription_product_id := NULL;
    NEW.subscription_checked_at := NULL;
    NEW.razorpay_subscription_id := NULL;
    NEW.subscription_status := NULL;
    NEW.ai_interpretations_used := COALESCE(NEW.ai_interpretations_used, 0);
    NEW.ai_quota_reset_at := COALESCE(NEW.ai_quota_reset_at, NOW() + INTERVAL '30 days');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (select auth.uid()) = NEW.id THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.billing_provider IS DISTINCT FROM OLD.billing_provider
      OR NEW.google_play_subscription_id IS DISTINCT FROM OLD.google_play_subscription_id
      OR NEW.google_play_purchase_token IS DISTINCT FROM OLD.google_play_purchase_token
      OR NEW.google_play_order_id IS DISTINCT FROM OLD.google_play_order_id
      OR NEW.subscription_product_id IS DISTINCT FROM OLD.subscription_product_id
      OR NEW.subscription_checked_at IS DISTINCT FROM OLD.subscription_checked_at
      OR NEW.razorpay_subscription_id IS DISTINCT FROM OLD.razorpay_subscription_id
      OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
      OR NEW.ai_interpretations_used IS DISTINCT FROM OLD.ai_interpretations_used
      OR NEW.ai_quota_reset_at IS DISTINCT FROM OLD.ai_quota_reset_at THEN
      RAISE EXCEPTION 'Billing and quota fields can only be changed by trusted server-side flows.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_billing_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_billing_fields_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_billing_fields();

-- 2. Data Packet scopes must only contain care profiles owned by the packet user.
-- This prevents a SECURITY DEFINER public packet function from becoming a
-- cross-account disclosure path if a care_profile UUID is ever leaked.
CREATE OR REPLACE FUNCTION public.data_packet_scope_is_owned(
  p_user_id UUID,
  p_care_profile_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(cp.id IS NOT NULL AND cp.owner_user_id = p_user_id), true)
  FROM unnest(COALESCE(p_care_profile_ids, '{}'::uuid[])) AS selected(care_profile_id)
  LEFT JOIN public.care_profiles cp ON cp.id = selected.care_profile_id;
$$;

REVOKE ALL ON FUNCTION public.data_packet_scope_is_owned(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_packet_scope_is_owned(UUID, UUID[]) TO authenticated;

DROP POLICY IF EXISTS "Users can manage own data packets" ON public.data_packets;

CREATE POLICY "Users can manage own data packets"
  ON public.data_packets FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND public.data_packet_scope_is_owned(user_id, care_profile_ids)
  );

-- 3. Public packet access logs are written only by the SECURITY DEFINER
-- responder RPC. They are intentionally not readable from mobile clients.
CREATE TABLE IF NOT EXISTS public.public_packet_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('share_link', 'emergency_id', 'unknown')),
  share_link_id UUID REFERENCES public.share_links(id) ON DELETE SET NULL,
  emergency_care_profile_id UUID REFERENCES public.care_profiles(id) ON DELETE SET NULL,
  token_prefix TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.public_packet_access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_public_packet_access_logs_share_recent
  ON public.public_packet_access_logs (share_link_id, accessed_at DESC)
  WHERE share_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_packet_access_logs_emergency_recent
  ON public.public_packet_access_logs (emergency_care_profile_id, accessed_at DESC)
  WHERE emergency_care_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_packet_access_logs_user_recent
  ON public.public_packet_access_logs (user_id, accessed_at DESC);

CREATE OR REPLACE FUNCTION public.log_public_packet_access(
  p_user_id UUID,
  p_token_type TEXT,
  p_share_link_id UUID,
  p_emergency_care_profile_id UUID,
  p_token_prefix TEXT,
  p_success BOOLEAN,
  p_error_code TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.public_packet_access_logs (
    user_id,
    token_type,
    share_link_id,
    emergency_care_profile_id,
    token_prefix,
    success,
    error_code
  )
  VALUES (
    p_user_id,
    p_token_type,
    p_share_link_id,
    p_emergency_care_profile_id,
    LEFT(COALESCE(p_token_prefix, ''), 24),
    p_success,
    p_error_code
  );
$$;

REVOKE ALL ON FUNCTION public.log_public_packet_access(UUID, TEXT, UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;

-- 4. Recreate the public packet RPC with explicit owner binding on every
-- returned table. RLS is bypassed by SECURITY DEFINER, so owner checks must be
-- repeated inside the function body.
CREATE OR REPLACE FUNCTION public.get_public_health_packet(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  packet_record public.data_packets%ROWTYPE;
  token_type TEXT;
  share_record public.share_links%ROWTYPE;
  emergency_record public.emergency_profile_scopes%ROWTYPE;
  recent_access_count INTEGER;
  access_limit INTEGER := 60;
BEGIN
  SELECT *
  INTO share_record
  FROM public.share_links
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > NOW()
  LIMIT 1;

  IF FOUND THEN
    token_type := 'share_link';

    UPDATE public.share_links
    SET access_count = COALESCE(access_count, 0) + 1
    WHERE id = share_record.id;

    SELECT COUNT(*)
    INTO recent_access_count
    FROM public.public_packet_access_logs
    WHERE share_link_id = share_record.id
      AND accessed_at > NOW() - INTERVAL '1 minute';

    IF recent_access_count >= access_limit THEN
      PERFORM public.log_public_packet_access(
        share_record.user_id,
        token_type,
        share_record.id,
        NULL,
        p_token,
        false,
        'rate_limited'
      );
      RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Try again later.');
    END IF;

    SELECT *
    INTO packet_record
    FROM public.data_packets
    WHERE id = share_record.data_packet_id
      AND user_id = share_record.user_id;
  ELSE
    SELECT *
    INTO emergency_record
    FROM public.emergency_profile_scopes
    WHERE token = p_token
      AND enabled = true
    LIMIT 1;

    IF NOT FOUND THEN
      PERFORM public.log_public_packet_access(
        NULL,
        'unknown',
        NULL,
        NULL,
        p_token,
        false,
        'not_found'
      );
      RETURN jsonb_build_object('ok', false, 'error', 'Packet not found or expired.');
    END IF;

    token_type := 'emergency_id';

    SELECT COUNT(*)
    INTO recent_access_count
    FROM public.public_packet_access_logs
    WHERE emergency_care_profile_id = emergency_record.care_profile_id
      AND accessed_at > NOW() - INTERVAL '1 minute';

    IF recent_access_count >= access_limit THEN
      PERFORM public.log_public_packet_access(
        emergency_record.user_id,
        token_type,
        NULL,
        emergency_record.care_profile_id,
        p_token,
        false,
        'rate_limited'
      );
      RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Try again later.');
    END IF;

    SELECT *
    INTO packet_record
    FROM public.data_packets
    WHERE id = emergency_record.data_packet_id
      AND user_id = emergency_record.user_id;
  END IF;

  IF packet_record.id IS NULL THEN
    PERFORM public.log_public_packet_access(
      COALESCE(share_record.user_id, emergency_record.user_id),
      COALESCE(token_type, 'unknown'),
      share_record.id,
      emergency_record.care_profile_id,
      p_token,
      false,
      'scope_unavailable'
    );
    RETURN jsonb_build_object('ok', false, 'error', 'Packet scope is unavailable.');
  END IF;

  IF NOT public.data_packet_scope_is_owned(packet_record.user_id, packet_record.care_profile_ids) THEN
    PERFORM public.log_public_packet_access(
      packet_record.user_id,
      COALESCE(token_type, 'unknown'),
      share_record.id,
      emergency_record.care_profile_id,
      p_token,
      false,
      'invalid_scope'
    );
    RETURN jsonb_build_object('ok', false, 'error', 'Packet scope is invalid.');
  END IF;

  PERFORM public.log_public_packet_access(
    packet_record.user_id,
    token_type,
    share_record.id,
    emergency_record.care_profile_id,
    p_token,
    true,
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'token_type', token_type,
    'expires_at', CASE WHEN token_type = 'share_link' THEN share_record.expires_at ELSE NULL END,
    'scope', jsonb_build_object(
      'purpose', packet_record.purpose,
      'domains', packet_record.domains,
      'date_range', packet_record.date_range,
      'include_attachments', packet_record.include_attachments,
      'include_critical_only', packet_record.include_critical_only,
      'reason_for_visit', packet_record.reason_for_visit
    ),
    'care_profiles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'full_name', cp.full_name,
        'relationship', cp.relationship,
        'date_of_birth', cp.date_of_birth,
        'blood_type', cp.blood_type,
        'allergies', cp.allergies,
        'chronic_conditions', cp.chronic_conditions,
        'emergency_contact_name', cp.emergency_contact_name,
        'emergency_contact_phone', cp.emergency_contact_phone,
        'emergency_contact_relation', cp.emergency_contact_relation
      )), '[]'::jsonb)
      FROM public.care_profiles cp
      WHERE cp.owner_user_id = packet_record.user_id
        AND cp.id = ANY(packet_record.care_profile_ids)
        AND cp.is_active = true
    ),
    'records', jsonb_build_object(
      'timeline', CASE WHEN 'timeline' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'title', he.title,
          'category', he.category,
          'event_date', he.event_date,
          'description', he.description,
          'is_critical', he.is_critical,
          'care_profile_id', he.care_profile_id
        ) ORDER BY he.event_date DESC), '[]'::jsonb)
        FROM public.health_events he
        WHERE he.user_id = packet_record.user_id
          AND he.care_profile_id = ANY(packet_record.care_profile_ids)
          AND he.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR he.is_critical = true)
          AND (packet_record.custom_start_date IS NULL OR he.event_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR he.event_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'medications', CASE WHEN 'medications' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'drug_name', m.drug_name,
          'dosage', m.dosage,
          'frequency', m.frequency,
          'status', m.status,
          'refill_date', m.refill_date,
          'notes', m.notes,
          'care_profile_id', m.care_profile_id
        ) ORDER BY m.drug_name ASC), '[]'::jsonb)
        FROM public.medications m
        WHERE m.user_id = packet_record.user_id
          AND m.care_profile_id = ANY(packet_record.care_profile_ids)
          AND m.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR (m.status = 'active' AND (m.reminder_time IS NOT NULL OR m.refill_date IS NOT NULL)))
      ) ELSE '[]'::jsonb END,
      'labs', CASE WHEN 'labs' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'test_name', lr.test_name,
          'test_date', lr.test_date,
          'results', lr.results,
          'care_profile_id', lr.care_profile_id
        ) ORDER BY lr.test_date DESC), '[]'::jsonb)
        FROM public.lab_results lr
        WHERE lr.user_id = packet_record.user_id
          AND lr.care_profile_id = ANY(packet_record.care_profile_ids)
          AND lr.deleted_at IS NULL
          AND (packet_record.custom_start_date IS NULL OR lr.test_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR lr.test_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'documents', CASE WHEN 'documents' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'file_name', d.file_name,
          'document_category', d.document_category,
          'ocr_text', d.ocr_text,
          'ocr_confidence', d.ocr_confidence,
          'file_url', CASE WHEN packet_record.include_attachments THEN d.file_url ELSE NULL END,
          'care_profile_id', d.care_profile_id,
          'created_at', d.created_at
        ) ORDER BY d.created_at DESC), '[]'::jsonb)
        FROM public.documents d
        WHERE d.user_id = packet_record.user_id
          AND d.care_profile_id = ANY(packet_record.care_profile_ids)
          AND d.deleted_at IS NULL
      ) ELSE '[]'::jsonb END,
      'symptoms', CASE WHEN 'symptoms' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'symptom_name', se.symptom_name,
          'severity', se.severity,
          'onset_date', se.onset_date,
          'notes', se.notes,
          'resolved', se.resolved,
          'care_profile_id', se.care_profile_id
        ) ORDER BY se.onset_date DESC), '[]'::jsonb)
        FROM public.symptom_entries se
        WHERE se.user_id = packet_record.user_id
          AND se.care_profile_id = ANY(packet_record.care_profile_ids)
          AND se.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR se.severity >= 8)
          AND (packet_record.custom_start_date IS NULL OR se.onset_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR se.onset_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END,
      'costs', CASE WHEN 'costs' = ANY(packet_record.domains) THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'amount', hc.amount,
          'cost_date', hc.cost_date,
          'category', hc.category,
          'description', hc.description,
          'provider_name', hc.provider_name,
          'care_profile_id', hc.care_profile_id
        ) ORDER BY hc.cost_date DESC), '[]'::jsonb)
        FROM public.healthcare_costs hc
        WHERE hc.user_id = packet_record.user_id
          AND hc.care_profile_id = ANY(packet_record.care_profile_ids)
          AND hc.deleted_at IS NULL
          AND (packet_record.include_critical_only = false OR hc.amount >= 10000)
          AND (packet_record.custom_start_date IS NULL OR hc.cost_date >= packet_record.custom_start_date)
          AND (packet_record.custom_end_date IS NULL OR hc.cost_date <= packet_record.custom_end_date)
      ) ELSE '[]'::jsonb END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_health_packet(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_health_packet(TEXT) TO anon, authenticated;

-- ============================================================
-- 20260515143140_phase_21_live_grants_and_profile_insert_guard.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 21: Live Data API Grants And Insert Guard Fix
-- ============================================================

-- Supabase Data API requires table privileges in addition to RLS policies.
-- Keep RLS as the row-level authority, but grant authenticated clients access
-- to the app tables they are already constrained to by policies.

GRANT SELECT, INSERT ON public.profiles TO authenticated;

GRANT UPDATE (
  full_name,
  date_of_birth,
  blood_type,
  gender,
  country,
  avatar_url,
  allergies,
  chronic_conditions,
  emergency_contact_name,
  emergency_contact_phone,
  emergency_contact_relation,
  emergency_id_enabled,
  emergency_id_token
) ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.onboarding_progress,
  public.family_profiles,
  public.health_events,
  public.health_event_photos,
  public.medications,
  public.medication_photos,
  public.medication_checkins,
  public.lab_results,
  public.documents,
  public.symptom_entries,
  public.symptom_photos,
  public.healthcare_costs,
  public.cost_photos,
  public.notifications,
  public.care_profiles,
  public.data_packets,
  public.doctor_packets,
  public.share_links,
  public.smart_import_suggestions,
  public.emergency_profile_scopes,
  public.monthly_family_digests,
  public.account_deletion_requests
TO authenticated;

-- Public packet access logs are intentionally not granted to mobile roles.
REVOKE ALL ON public.public_packet_access_logs FROM anon, authenticated;

-- Tighten the profile insert trigger: a malicious first profile insert should
-- not preserve forged AI usage counters.
CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (select auth.uid()) = NEW.id THEN
    NEW.plan := 'free';
    NEW.billing_provider := 'manual';
    NEW.google_play_subscription_id := NULL;
    NEW.google_play_purchase_token := NULL;
    NEW.google_play_order_id := NULL;
    NEW.subscription_product_id := NULL;
    NEW.subscription_checked_at := NULL;
    NEW.razorpay_subscription_id := NULL;
    NEW.subscription_status := NULL;
    NEW.ai_interpretations_used := 0;
    NEW.ai_quota_reset_at := NOW() + INTERVAL '30 days';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (select auth.uid()) = NEW.id THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.billing_provider IS DISTINCT FROM OLD.billing_provider
      OR NEW.google_play_subscription_id IS DISTINCT FROM OLD.google_play_subscription_id
      OR NEW.google_play_purchase_token IS DISTINCT FROM OLD.google_play_purchase_token
      OR NEW.google_play_order_id IS DISTINCT FROM OLD.google_play_order_id
      OR NEW.subscription_product_id IS DISTINCT FROM OLD.subscription_product_id
      OR NEW.subscription_checked_at IS DISTINCT FROM OLD.subscription_checked_at
      OR NEW.razorpay_subscription_id IS DISTINCT FROM OLD.razorpay_subscription_id
      OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
      OR NEW.ai_interpretations_used IS DISTINCT FROM OLD.ai_interpretations_used
      OR NEW.ai_quota_reset_at IS DISTINCT FROM OLD.ai_quota_reset_at THEN
      RAISE EXCEPTION 'Billing and quota fields can only be changed by trusted server-side flows.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 20260515144003_phase_21_advisor_hardening.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 21: Supabase Advisor Hardening
-- ============================================================

-- Keep auth-created profile setup as a trigger-only function. It should not be
-- directly callable through the Data API, and it should use a fixed search_path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.onboarding_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- The original v1 emergency RPC exposed a fixed emergency payload. Emergency ID
-- now uses get_public_health_packet() with explicit user-selected scopes.
DROP FUNCTION IF EXISTS public.get_emergency_profile(TEXT);

-- Trigger and automatic-RLS helper functions are internal only.
REVOKE ALL ON FUNCTION public.protect_profile_billing_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Keep avatars public by bucket setting, but avoid broad object listing through
-- storage.objects. Public object URLs still work for known avatar paths.
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

CREATE POLICY "Users can view own avatars"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars' AND
    (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 20260515144138_phase_21_data_packet_helper_invoker.sql
-- ============================================================

-- ============================================================
-- MedVault Phase 21: Data Packet Helper Privilege Narrowing
-- ============================================================

-- This helper is used by the data_packets RLS policy to ensure selected care
-- profiles belong to the packet owner. It does not need SECURITY DEFINER for
-- mobile writes; as SECURITY INVOKER, direct calls cannot inspect care profiles
-- hidden by RLS.
CREATE OR REPLACE FUNCTION public.data_packet_scope_is_owned(
  p_user_id UUID,
  p_care_profile_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(cp.id IS NOT NULL AND cp.owner_user_id = p_user_id), true)
  FROM unnest(COALESCE(p_care_profile_ids, '{}'::uuid[])) AS selected(care_profile_id)
  LEFT JOIN public.care_profiles cp ON cp.id = selected.care_profile_id;
$$;

REVOKE ALL ON FUNCTION public.data_packet_scope_is_owned(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.data_packet_scope_is_owned(UUID, UUID[]) TO authenticated;
