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
