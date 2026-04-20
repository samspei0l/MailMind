-- ============================================================
-- 006_user_ai_keys.sql
-- Per-user AI provider configuration. Each user brings their
-- own LLM API key so MailMind has no shared-account cost and
-- each beta tester is billed on their own provider quota.
--
-- The key is encrypted at rest with AES-256-GCM before reaching
-- this column (see src/lib/crypto.ts); we never store plaintext.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_provider TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT,        -- For "Custom" OpenAI-compatible endpoints only
  ADD COLUMN IF NOT EXISTS ai_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ai_configured_at TIMESTAMPTZ;

-- Whitelist of provider identifiers that the app understands.
-- 'custom' is any OpenAI-compatible endpoint the user points us at.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ai_provider_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ai_provider_check
    CHECK (ai_provider IS NULL OR ai_provider IN (
      'openai', 'anthropic', 'google', 'groq', 'mistral',
      'nvidia', 'deepseek', 'xai', 'custom'
    ));
