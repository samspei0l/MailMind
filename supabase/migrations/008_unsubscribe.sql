-- ============================================================
-- 008_unsubscribe.sql
-- Parsed List-Unsubscribe target stored alongside each email so
-- the UI can offer a one-click "Unsubscribe" and the chat action
-- layer can honour "unsubscribe from these newsletters" without
-- re-fetching the message headers from Gmail.
--
-- Column split rationale:
--   unsubscribe_url    — https URL (one-click unsubscribe landing page)
--   unsubscribe_mailto — mailto: target (RFC 8058 unsubscribe-by-email)
-- Many senders provide both; we keep both so the action layer can
-- prefer mailto (works in-app) and fall back to opening the URL
-- client-side.
-- ============================================================

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS unsubscribe_url    TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribe_mailto TEXT;
