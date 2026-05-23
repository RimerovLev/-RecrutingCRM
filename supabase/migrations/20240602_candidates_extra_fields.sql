-- Migration: добавить расширенные поля кандидата
-- Используем IF NOT EXISTS — безопасно запускать повторно.
-- Запустить в Supabase SQL Editor.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS experience       TEXT,
  ADD COLUMN IF NOT EXISTS district_work    TEXT,
  ADD COLUMN IF NOT EXISTS has_car          TEXT,
  ADD COLUMN IF NOT EXISTS resume_source    TEXT,
  ADD COLUMN IF NOT EXISTS contact_status   TEXT,
  ADD COLUMN IF NOT EXISTS candidate_link   TEXT,
  ADD COLUMN IF NOT EXISTS resume_url       TEXT,
  ADD COLUMN IF NOT EXISTS salary_wish      INTEGER,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS tags             TEXT[]  DEFAULT '{}';
