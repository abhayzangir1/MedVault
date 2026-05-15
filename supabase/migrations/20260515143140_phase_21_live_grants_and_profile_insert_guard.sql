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
