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
