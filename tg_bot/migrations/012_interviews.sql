-- Migration 012: таблица собеседований
-- Хранит запланированные/проведённые интервью по кандидатурам

CREATE TABLE IF NOT EXISTS interviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidacy_id  UUID        REFERENCES candidacies(id) ON DELETE CASCADE,
  recruiter_id  UUID        REFERENCES profiles(id)    ON DELETE CASCADE,
  candidate_id  UUID        REFERENCES candidates(id)  ON DELETE CASCADE,
  vacancy_id    UUID        REFERENCES vacancies(id)   ON DELETE SET NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  format        TEXT        NOT NULL DEFAULT 'online' CHECK (format IN ('online','office','phone')),
  location      TEXT,
  notes         TEXT,
  status        TEXT        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS interviews_recruiter_id_idx  ON interviews(recruiter_id);
CREATE INDEX IF NOT EXISTS interviews_candidate_id_idx  ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS interviews_scheduled_at_idx  ON interviews(scheduled_at);

-- RLS
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY interviews_select ON interviews FOR SELECT
  USING (recruiter_id = auth.uid());

CREATE POLICY interviews_insert ON interviews FOR INSERT
  WITH CHECK (recruiter_id = auth.uid());

CREATE POLICY interviews_update ON interviews FOR UPDATE
  USING (recruiter_id = auth.uid());

CREATE POLICY interviews_delete ON interviews FOR DELETE
  USING (recruiter_id = auth.uid());

COMMENT ON TABLE interviews IS 'Scheduled and completed interviews';
