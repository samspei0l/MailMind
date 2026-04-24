-- ============================================================
-- 009_attachments.sql
--
-- Adds an `attachments` JSONB column to the emails table so we can
-- render Gmail-style attachment chips in the UI without re-fetching
-- the whole message from Gmail each time the detail panel opens.
--
-- Shape stored per row (array of records):
--   [
--     {
--       "filename":   "invoice-2026-04.pdf",
--       "mimeType":   "application/pdf",
--       "size":       184320,
--       "attachmentId": "ANGjdJ8...",   -- Gmail API handle (NOT the bytes)
--       "partId":       "1.2"           -- path inside the MIME tree
--     },
--     ...
--   ]
--
-- We deliberately do NOT store the attachment bytes here — they'd
-- blow up the row size and most users never open most attachments.
-- The download API route streams bytes on demand via the Gmail
-- attachments.get endpoint using the attachmentId we saved.
-- ============================================================

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Index for queries that filter on "has attachments" or count them.
-- Using jsonb_array_length keeps the index small — we only need to
-- distinguish 0 / >0 for the inbox "paperclip" badge.
CREATE INDEX IF NOT EXISTS idx_emails_has_attachments
  ON public.emails ((jsonb_array_length(attachments)))
  WHERE attachments IS NOT NULL AND attachments <> '[]'::jsonb;
