
-- Hazard quality improvements
ALTER TABLE public.hazard_reports
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS confirm_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_count integer NOT NULL DEFAULT 0;

-- Default expiry based on hazard_type / severity (set on insert via trigger)
CREATE OR REPLACE FUNCTION public.set_hazard_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + CASE
      WHEN NEW.severity = 'high'   THEN interval '24 hours'
      WHEN NEW.severity = 'medium' THEN interval '12 hours'
      ELSE interval '6 hours'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hazard_reports_set_expiry ON public.hazard_reports;
CREATE TRIGGER hazard_reports_set_expiry
  BEFORE INSERT ON public.hazard_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_hazard_expiry();

-- Votes table
CREATE TABLE IF NOT EXISTS public.hazard_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id uuid NOT NULL REFERENCES public.hazard_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL CHECK (vote IN ('confirm','dispute')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hazard_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hazard_votes TO authenticated;
GRANT ALL ON public.hazard_votes TO service_role;

ALTER TABLE public.hazard_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes readable by all auth"
  ON public.hazard_votes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "users insert own votes"
  ON public.hazard_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own votes"
  ON public.hazard_votes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own votes"
  ON public.hazard_votes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Maintain confirm/dispute counts on hazard_reports
CREATE OR REPLACE FUNCTION public.sync_hazard_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  h_id uuid;
BEGIN
  h_id := COALESCE(NEW.hazard_id, OLD.hazard_id);
  UPDATE public.hazard_reports SET
    confirm_count = (SELECT count(*) FROM public.hazard_votes WHERE hazard_id = h_id AND vote = 'confirm'),
    dispute_count = (SELECT count(*) FROM public.hazard_votes WHERE hazard_id = h_id AND vote = 'dispute')
  WHERE id = h_id;
  -- Auto-expire if disputes overwhelm confirms (3+ disputes and disputes > confirms)
  UPDATE public.hazard_reports
    SET status = 'disputed', expires_at = LEAST(expires_at, now())
    WHERE id = h_id
      AND status = 'active'
      AND dispute_count >= 3
      AND dispute_count > confirm_count;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hazard_votes_sync_counts ON public.hazard_votes;
CREATE TRIGGER hazard_votes_sync_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.hazard_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_hazard_vote_counts();

-- Index for proximity dedup + expiry filtering
CREATE INDEX IF NOT EXISTS hazard_reports_active_idx
  ON public.hazard_reports (status, expires_at);
CREATE INDEX IF NOT EXISTS hazard_reports_reporter_recent_idx
  ON public.hazard_reports (reporter_id, created_at DESC);
