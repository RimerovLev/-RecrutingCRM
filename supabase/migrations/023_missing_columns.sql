-- Migration 023: Add all columns missing from initial schema reconstruction
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).

-- ── candidates ────────────────────────────────────────────────────
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email              TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_pinned          BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pipeline_stage     TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_expectation INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_wish        INTEGER;

-- ── vacancies ─────────────────────────────────────────────────────
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS requirements TEXT;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS salary_min   INTEGER;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS salary_max   INTEGER;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS department   TEXT;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS headcount    INTEGER;
ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS deadline     DATE;

-- ── candidacies ───────────────────────────────────────────────────
ALTER TABLE candidacies ADD COLUMN IF NOT EXISTS current_stage TEXT;
UPDATE candidacies SET current_stage = stage::TEXT WHERE current_stage IS NULL;

-- ── stage_history ────────────────────────────────────────────────
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS from_stage TEXT;
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS to_stage   TEXT;
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── reminders ─────────────────────────────────────────────────────
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS note     TEXT;
UPDATE reminders SET due_date = remind_at WHERE due_date IS NULL;
