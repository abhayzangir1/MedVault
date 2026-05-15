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
