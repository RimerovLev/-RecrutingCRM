-- Migration 022: Add due_date column as alias for remind_at
-- The frontend code uses due_date everywhere; the initial schema used remind_at.
-- Add due_date as a real column and keep both in sync via trigger.

-- 1. Add the column (safe if already exists)
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- 2. Backfill existing rows
UPDATE reminders SET due_date = remind_at WHERE due_date IS NULL AND remind_at IS NOT NULL;

-- 3. Keep them in sync going forward
CREATE OR REPLACE FUNCTION sync_reminder_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If due_date was set, mirror to remind_at (and vice versa)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.due_date IS NOT NULL AND NEW.remind_at IS NULL THEN
      NEW.remind_at := NEW.due_date;
    ELSIF NEW.remind_at IS NOT NULL AND NEW.due_date IS NULL THEN
      NEW.due_date := NEW.remind_at;
    ELSIF NEW.due_date IS NOT NULL AND NEW.remind_at IS NOT NULL THEN
      -- prefer due_date (frontend source)
      NEW.remind_at := NEW.due_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reminder_dates ON reminders;
CREATE TRIGGER trg_sync_reminder_dates
BEFORE INSERT OR UPDATE ON reminders
FOR EACH ROW EXECUTE FUNCTION sync_reminder_dates();
