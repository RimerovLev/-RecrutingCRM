-- Migration 024: Add current_stage to candidacies
-- Frontend uses current_stage (text), DB has stage (integer).
-- Add current_stage as a text column and keep in sync.

ALTER TABLE candidacies ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- Backfill
UPDATE candidacies SET current_stage = stage::TEXT WHERE current_stage IS NULL;

-- Keep in sync: when stage changes, update current_stage too
CREATE OR REPLACE FUNCTION sync_candidacy_stage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS NOT NULL AND (NEW.current_stage IS NULL OR NEW.stage::TEXT != NEW.current_stage) THEN
    NEW.current_stage := NEW.stage::TEXT;
  END IF;
  IF NEW.current_stage IS NOT NULL AND (NEW.stage IS NULL) THEN
    NEW.stage := NEW.current_stage::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_candidacy_stage ON candidacies;
CREATE TRIGGER trg_sync_candidacy_stage
BEFORE INSERT OR UPDATE ON candidacies
FOR EACH ROW EXECUTE FUNCTION sync_candidacy_stage();
