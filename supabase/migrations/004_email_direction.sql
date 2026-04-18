-- ============================================================
-- 004_email_direction.sql
-- Adds `direction` column so the emails table can hold both
-- received mail (from inbox) and sent mail (from the user's own
-- Sent folder). The History view groups by thread_id so the user
-- can see full conversations without leaving MailMind.
-- ============================================================

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS direction TEXT
    CHECK (direction IN ('received', 'sent'))
    DEFAULT 'received';

-- Backfill existing rows (no-op if default already applied)
UPDATE public.emails SET direction = 'received' WHERE direction IS NULL;

-- Thread lookups are the hot path for the History page
CREATE INDEX IF NOT EXISTS idx_emails_thread_received
  ON public.emails(user_id, thread_id, received_at DESC);
