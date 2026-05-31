-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 000: Initial schema (replaces lost migrations 001–013)
-- Run this FIRST, then run 014 → 020 in order.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT        NOT NULL DEFAULT 'recruiter'
             CHECK (role IN ('recruiter', 'admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 2. candidates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  full_name          TEXT        NOT NULL,
  phone              TEXT,
  position           TEXT,
  district_residence TEXT,
  district_work      TEXT,
  has_car            TEXT,
  resume_source      TEXT,
  contact_status     TEXT,
  candidate_link     TEXT,
  resume_url         TEXT,
  salary_wish        INTEGER,
  experience         TEXT,
  notes              TEXT,
  tags               TEXT[]      DEFAULT '{}',
  status             TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'in_work', 'archive')),
  custom_data        JSONB       DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_candidates_recruiter ON candidates(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status    ON candidates(status);

-- ── 3. vacancies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacancies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'closed', 'paused')),
  max_stages   INTEGER     DEFAULT 5,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vacancies_recruiter ON vacancies(recruiter_id);

-- ── 4. candidacies (Kanban cards) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidacies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id   UUID        NOT NULL REFERENCES vacancies(id)  ON DELETE CASCADE,
  stage        INTEGER     NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (candidate_id, vacancy_id)
);

ALTER TABLE candidacies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_candidacies_vacancy   ON candidacies(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_candidacies_candidate ON candidacies(candidate_id);

-- ── 5. stage_history ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidacy_id UUID        NOT NULL REFERENCES candidacies(id) ON DELETE CASCADE,
  stage        INTEGER     NOT NULL,
  changed_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stage_history_candidacy ON stage_history(candidacy_id);

-- ── 6. comments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  author_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  text         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_comments_candidate ON comments(candidate_id);

-- ── 7. reminders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id UUID        REFERENCES candidates(id) ON DELETE CASCADE,
  text         TEXT,
  remind_at    TIMESTAMPTZ,           -- legacy name kept for bot compatibility
  due_date     TIMESTAMPTZ,           -- name used by frontend
  is_done      BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reminders_recruiter ON reminders(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);

-- ── 8. email_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  subject      TEXT,
  body         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_templates_recruiter ON email_templates(recruiter_id);

-- ── 9. interviews ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  candidate_id UUID        REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id   UUID        REFERENCES vacancies(id)  ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'done', 'cancelled', 'no_show')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_interviews_recruiter    ON interviews(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate    ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews(scheduled_at);

-- ── 10. Minimal RLS policies (overwritten properly in 014 and 016) ───────────
DROP POLICY IF EXISTS "allow own profile"         ON profiles;
DROP POLICY IF EXISTS "allow own candidates"      ON candidates;
DROP POLICY IF EXISTS "allow own vacancies"       ON vacancies;
DROP POLICY IF EXISTS "allow own interviews"      ON interviews;
DROP POLICY IF EXISTS "allow own reminders"       ON reminders;
DROP POLICY IF EXISTS "allow own email_templates" ON email_templates;
DROP POLICY IF EXISTS "allow own comments"        ON comments;
DROP POLICY IF EXISTS "allow own candidacies"     ON candidacies;
DROP POLICY IF EXISTS "allow own stage_history"   ON stage_history;

CREATE POLICY "allow own profile"    ON profiles         FOR ALL USING (id = auth.uid());
CREATE POLICY "allow own candidates" ON candidates       FOR ALL USING (recruiter_id = auth.uid());
CREATE POLICY "allow own vacancies"  ON vacancies        FOR ALL USING (recruiter_id = auth.uid());
CREATE POLICY "allow own interviews" ON interviews       FOR ALL USING (recruiter_id = auth.uid());
CREATE POLICY "allow own reminders"  ON reminders        FOR ALL USING (recruiter_id = auth.uid());
CREATE POLICY "allow own email_templates" ON email_templates FOR ALL USING (recruiter_id = auth.uid());
CREATE POLICY "allow own comments"   ON comments         FOR ALL USING (author_id = auth.uid());

CREATE POLICY "allow own candidacies" ON candidacies FOR ALL USING (
  EXISTS (SELECT 1 FROM vacancies v WHERE v.id = vacancy_id AND v.recruiter_id = auth.uid())
);

CREATE POLICY "allow own stage_history" ON stage_history FOR ALL USING (
  EXISTS (
    SELECT 1 FROM candidacies c
    JOIN vacancies v ON v.id = c.vacancy_id
    WHERE c.id = candidacy_id AND v.recruiter_id = auth.uid()
  )
);
