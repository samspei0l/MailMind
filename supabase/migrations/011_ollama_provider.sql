-- ============================================================
-- MIGRATION 011: Whitelist 'ollama' as an AI provider
-- Run AFTER 010_signup_trigger_hardening.sql
-- ============================================================
--
-- Adds Ollama Cloud (OpenAI-compatible chat at https://ollama.com/v1)
-- to the allowed provider check on profiles.ai_provider. The setup
-- flow stores the user's Ollama Cloud API key + selected cloud-hosted
-- model the same way every other BYOK provider does.
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ai_provider_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ai_provider_check
    CHECK (ai_provider IS NULL OR ai_provider IN (
      'openai', 'anthropic', 'google', 'groq', 'mistral',
      'nvidia', 'deepseek', 'xai', 'ollama', 'custom'
    ));
