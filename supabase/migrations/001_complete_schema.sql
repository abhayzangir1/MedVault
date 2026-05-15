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
