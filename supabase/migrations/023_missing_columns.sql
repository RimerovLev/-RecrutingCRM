-- Migration 023: Add columns missing from initial schema reconstruction
-- Safe to run multiple times (IF NOT EXISTS).

-- candidates: pipeline_stage used by Kanban / ImportModal
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;

-- reminders: due_date (frontend name) — remind_at is the DB name from 000
-- covered by 022, but add here too for safety
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
UPDATE reminders SET due_date = remind_at WHERE due_date IS NULL AND remind_at IS NOT NULL;
