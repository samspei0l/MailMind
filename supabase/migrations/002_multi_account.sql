-- ============================================================
-- MIGRATION 002: Multi-Account Email Support
-- Run this AFTER 001_initial_schema.sql
-- ============================================================

-- Drop old unique constraint (user_id, provider) — now multiple
-- accounts per provider are allowed
ALTER TABLE public.email_connections
  DROP CONSTRAINT IF EXISTS email_connections_user_id_provider_key;

-- Add new unique constraint: one row per (user_id, email address)
-- prevents connecting the same Gmail address twice
ALTER TABLE public.email_connections
  ADD CONSTRAINT email_connections_user_id_email_key UNIQUE (user_id, email);

-- Add display nickname and sort order for the account picker
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Max 5 accounts per user — enforced in application layer
-- (Supabase RLS cannot enforce count limits directly, use a trigger)
CREATE OR REPLACE FUNCTION check_connection_limit()
RETURNS trigger AS $$
DECLARE
  connection_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO connection_count
  FROM public.email_connections
  WHERE user_id = NEW.user_id AND is_active = TRUE;

  IF connection_count >= 5 THEN
    RAISE EXCEPTION 'Maximum of 5 email accounts allowed per user.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_connection_limit ON public.email_connections;
CREATE TRIGGER enforce_connection_limit
  BEFORE INSERT ON public.email_connections
  FOR EACH ROW EXECUTE PROCEDURE check_connection_limit();

-- ============================================================
-- TABLE: composed_emails
-- Tracks AI-composed new emails (not replies)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.composed_emails (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES public.email_connections(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  cc TEXT,
  bcc TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Composition metadata
  prompt TEXT,                        -- Original user prompt
  tone TEXT DEFAULT 'professional',   -- professional | friendly | formal | assertive | concise
  ai_generated BOOLEAN DEFAULT TRUE,
  sent_message_id TEXT,               -- Gmail/Outlook message ID after send

  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: voice_transcriptions
-- Stores voice-to-text results for audit/replay
-- ============================================================
CREATE TABLE IF NOT EXISTS public.voice_transcriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  audio_duration_seconds FLOAT,
  transcript TEXT NOT NULL,
  composed_email_id UUID REFERENCES public.composed_emails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS for new tables
-- ============================================================
ALTER TABLE public.composed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own composed emails"
  ON public.composed_emails FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own transcriptions"
  ON public.voice_transcriptions FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_composed_emails_user ON public.composed_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_composed_emails_status ON public.composed_emails(status);
CREATE INDEX IF NOT EXISTS idx_connections_user_active ON public.email_connections(user_id, is_active);

-- ============================================================
-- UPDATE trigger for new tables
-- ============================================================
CREATE TRIGGER update_composed_emails_updated_at
  BEFORE UPDATE ON public.composed_emails
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
