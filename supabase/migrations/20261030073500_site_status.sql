-- Sites can be 진행 (active) or 종료 (closed). Closing keeps every log, progress sheet and photo;
-- the app only hides closed sites from the header picker and shows them read-only.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS closed_at date;

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_status_check,
  ADD CONSTRAINT sites_status_check CHECK (status IN ('active', 'closed')),
  DROP CONSTRAINT IF EXISTS sites_closed_at_check,
  ADD CONSTRAINT sites_closed_at_check CHECK ((status = 'closed') = (closed_at IS NOT NULL));
