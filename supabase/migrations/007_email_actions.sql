-- ============================================================
-- 007_email_actions.sql
-- Mailbox actions (trash / spam / archive) + sender-block list.
--
-- Design notes:
--   - Trash/spam/archive are tracked as soft-delete columns on emails so
--     the inbox query can hide them by default while the audit row stays
--     intact (status changes mirror Gmail labels — TRASH, SPAM, INBOX
--     removal). Permanent delete still removes the DB row.
--   - blocked_senders mirrors Gmail's user-level filters. We store the
--     gmail_filter_id so unblocking can revoke the filter on the provider
--     side too — otherwise the user would be confused why their inbox is
--     still being scrubbed.
-- ============================================================

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS is_trashed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_spam      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_emails_user_status
  ON public.emails(user_id, is_trashed, is_spam, is_archived);

-- ============================================================
-- TABLE: blocked_senders
-- One row per (user, connection, sender). connection_id NULL means
-- "block on every connected account" — the action layer fans the
-- filter out per provider when applying.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocked_senders (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES public.email_connections(id) ON DELETE CASCADE,
  sender_email    TEXT NOT NULL,
  -- Provider-side filter id so we can revoke the filter when the user
  -- unblocks. NULL means "block lives only in our DB" (e.g. provider
  -- didn't accept the create call).
  gmail_filter_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connection_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_blocked_senders_lookup
  ON public.blocked_senders(user_id, sender_email);

ALTER TABLE public.blocked_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.blocked_senders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blocks" ON public.blocked_senders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own blocks" ON public.blocked_senders
  FOR DELETE USING (auth.uid() = user_id);
