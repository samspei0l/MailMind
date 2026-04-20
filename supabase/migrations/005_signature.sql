-- ============================================================
-- 005_signature.sql
-- Per-connection email signature. Extracted from the user's
-- recent sent mail by GPT and stored as plain text (with line
-- breaks preserved). Appended to outgoing replies by default;
-- the composer exposes a toggle to omit it.
-- ============================================================

ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signature_extracted_at TIMESTAMPTZ;
