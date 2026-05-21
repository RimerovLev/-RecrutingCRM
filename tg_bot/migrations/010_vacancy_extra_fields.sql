-- Migration 010: добавить поля deadline, headcount, department в vacancies
-- + notes (если ещё не добавлено предыдущими миграциями)

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS deadline    DATE,
  ADD COLUMN IF NOT EXISTS headcount   INTEGER,
  ADD COLUMN IF NOT EXISTS department  TEXT,
  ADD COLUMN IF NOT EXISTS notes       TEXT;
