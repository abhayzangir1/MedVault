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
