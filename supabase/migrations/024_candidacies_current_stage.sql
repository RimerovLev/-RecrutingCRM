-- Migration 024: Add current_stage to candidacies (text field used by frontend)
-- The original schema had stage as INTEGER; frontend uses current_stage as TEXT.
-- Keep both but make stage optional — current_stage is the source of truth.

-- Add current_stage
ALTER TABLE candidacies ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- Backfill from stage
UPDATE candidacies SET current_stage = stage::TEXT WHERE current_stage IS NULL AND stage IS NOT NULL;

-- Make stage optional (current_stage is now primary)
ALTER TABLE candidacies ALTER COLUMN stage DROP NOT NULL;
ALTER TABLE candidacies ALTER COLUMN stage DROP DEFAULT;

-- Remove any previously created sync trigger (it broke inserts by overwriting current_stage)
DROP TRIGGER IF EXISTS trg_sync_candidacy_stage ON candidacies;
DROP FUNCTION IF EXISTS sync_candidacy_stage();
