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
