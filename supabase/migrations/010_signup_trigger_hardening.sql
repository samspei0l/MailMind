-- ============================================================
-- MIGRATION 010: Harden the signup trigger
-- Run AFTER 009_attachments.sql
-- ============================================================
--
-- A user hit a 500 on signup because the metadata sent
-- `sync_frequency_minutes` as something that cast to 0, which
-- violates `profiles_sync_frequency_minutes_check (> 0)` and
-- aborts the auth.users insert. We now:
--
--   1. Sanitize the value: anything not a positive integer
--      becomes NULL (= manual sync), instead of throwing.
--   2. Wrap the profile insert in EXCEPTION so a future column
--      mismatch can't take down auth signup again.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  raw_freq TEXT;
  parsed_freq INTEGER;
BEGIN
  raw_freq := NULLIF(NEW.raw_user_meta_data->>'sync_frequency_minutes', '');

  -- Best-effort parse; non-numeric → NULL. Non-positive → NULL.
  BEGIN
    parsed_freq := raw_freq::integer;
    IF parsed_freq IS NOT NULL AND parsed_freq <= 0 THEN
      parsed_freq := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    parsed_freq := NULL;
  END;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, sync_frequency_minutes)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url',
      parsed_freq
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block auth signup on a profile-row issue. The user can
    -- complete onboarding and a profile row can be backfilled later.
    RAISE WARNING 'handle_new_user: profile insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
