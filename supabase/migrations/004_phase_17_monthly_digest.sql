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
