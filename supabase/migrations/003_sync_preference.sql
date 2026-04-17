-- ============================================================
-- MIGRATION 003: Sync preference + bump connection limit to 10
-- Run AFTER 002_multi_account.sql
-- ============================================================

-- 1. Increase per-user connection limit from 5 to 10
CREATE OR REPLACE FUNCTION check_connection_limit()
RETURNS trigger AS $$
DECLARE
  connection_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO connection_count
  FROM public.email_connections
  WHERE user_id = NEW.user_id AND is_active = TRUE;

  IF connection_count >= 10 THEN
    RAISE EXCEPTION 'Maximum of 10 email accounts allowed per user.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add sync-preference column to profiles.
--    NULL = manual sync only; otherwise minutes between auto-syncs.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sync_frequency_minutes INTEGER
    CHECK (sync_frequency_minutes IS NULL OR sync_frequency_minutes IN (5, 15, 30, 60));

-- 3. Rewrite the new-user trigger so signup metadata flows into the profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, sync_frequency_minutes)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NULLIF(NEW.raw_user_meta_data->>'sync_frequency_minutes', '')::integer
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Helps the cron filter to just users who opted in
CREATE INDEX IF NOT EXISTS idx_profiles_sync_frequency
  ON public.profiles(sync_frequency_minutes)
  WHERE sync_frequency_minutes IS NOT NULL;
