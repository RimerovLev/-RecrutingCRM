-- Migration 014: RLS helpers, viewer/admin roles, link_codes, telegram_users

-- ── Helpers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'recruiter');
$$;

CREATE OR REPLACE FUNCTION public.can_write_data()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('recruiter', 'admin');
$$;

-- ── link_codes (CRM → Telegram binding) ─────────────────────────────
CREATE TABLE IF NOT EXISTS link_codes (
  code         TEXT PRIMARY KEY,
  recruiter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_codes_recruiter_id_idx ON link_codes(recruiter_id);

ALTER TABLE link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_codes_select ON link_codes;
DROP POLICY IF EXISTS link_codes_insert ON link_codes;

CREATE POLICY link_codes_select ON link_codes FOR SELECT
  USING (recruiter_id = auth.uid());

CREATE POLICY link_codes_insert ON link_codes FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

-- ── telegram_users (bot uses service_role; block anon/authenticated API) ──
CREATE TABLE IF NOT EXISTS telegram_users (
  telegram_id   BIGINT PRIMARY KEY,
  recruiter_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username      TEXT,
  full_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_users_recruiter_id_idx ON telegram_users(recruiter_id);

ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated users → only service_role (bot) can access

-- ── profiles ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own profile select" ON profiles;
DROP POLICY IF EXISTS "own profile insert" ON profiles;
DROP POLICY IF EXISTS "own profile update" ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid() AND public.can_write_data());

-- ── candidates ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own candidates select" ON candidates;
DROP POLICY IF EXISTS "own candidates insert" ON candidates;
DROP POLICY IF EXISTS "own candidates update" ON candidates;
DROP POLICY IF EXISTS "own candidates delete" ON candidates;

CREATE POLICY candidates_select ON candidates FOR SELECT
  USING (recruiter_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY candidates_insert ON candidates FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY candidates_update ON candidates FOR UPDATE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY candidates_delete ON candidates FOR DELETE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

-- ── vacancies ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own vacancies select" ON vacancies;
DROP POLICY IF EXISTS "own vacancies insert" ON vacancies;
DROP POLICY IF EXISTS "own vacancies update" ON vacancies;
DROP POLICY IF EXISTS "own vacancies delete" ON vacancies;

CREATE POLICY vacancies_select ON vacancies FOR SELECT
  USING (recruiter_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY vacancies_insert ON vacancies FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY vacancies_update ON vacancies FOR UPDATE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY vacancies_delete ON vacancies FOR DELETE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

-- ── candidacies ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own candidacies select" ON candidacies;
DROP POLICY IF EXISTS "own candidacies insert" ON candidacies;
DROP POLICY IF EXISTS "own candidacies update" ON candidacies;
DROP POLICY IF EXISTS "own candidacies delete" ON candidacies;

CREATE POLICY candidacies_select ON candidacies FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = candidacies.vacancy_id AND v.recruiter_id = auth.uid()
    )
  );

CREATE POLICY candidacies_insert ON candidacies FOR INSERT
  WITH CHECK (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = vacancy_id AND v.recruiter_id = auth.uid()
    )
  );

CREATE POLICY candidacies_update ON candidacies FOR UPDATE
  USING (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = candidacies.vacancy_id AND v.recruiter_id = auth.uid()
    )
  );

CREATE POLICY candidacies_delete ON candidacies FOR DELETE
  USING (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = candidacies.vacancy_id AND v.recruiter_id = auth.uid()
    )
  );

-- ── stage_history ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "own stage_history select" ON stage_history;
DROP POLICY IF EXISTS "own stage_history insert" ON stage_history;

CREATE POLICY stage_history_select ON stage_history FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM candidacies c
      JOIN vacancies v ON v.id = c.vacancy_id
      WHERE c.id = stage_history.candidacy_id AND v.recruiter_id = auth.uid()
    )
  );

CREATE POLICY stage_history_insert ON stage_history FOR INSERT
  WITH CHECK (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM candidacies c
      JOIN vacancies v ON v.id = c.vacancy_id
      WHERE c.id = candidacy_id AND v.recruiter_id = auth.uid()
    )
  );

-- ── comments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own comments select" ON comments;
DROP POLICY IF EXISTS "own comments insert" ON comments;
DROP POLICY IF EXISTS "own comments delete" ON comments;

CREATE POLICY comments_select ON comments FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = comments.candidate_id AND c.recruiter_id = auth.uid()
    )
  );

CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()
    )
  );

CREATE POLICY comments_delete ON comments FOR DELETE
  USING (author_id = auth.uid() AND public.can_write_data());

-- ── reminders ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own reminders select" ON reminders;
DROP POLICY IF EXISTS "own reminders insert" ON reminders;
DROP POLICY IF EXISTS "own reminders update" ON reminders;
DROP POLICY IF EXISTS "own reminders delete" ON reminders;

CREATE POLICY reminders_select ON reminders FOR SELECT
  USING (recruiter_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY reminders_insert ON reminders FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY reminders_update ON reminders FOR UPDATE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY reminders_delete ON reminders FOR DELETE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

-- ── email_templates (migration 013) — tighten write for viewer ──────
DROP POLICY IF EXISTS et_select ON email_templates;
DROP POLICY IF EXISTS et_insert ON email_templates;
DROP POLICY IF EXISTS et_update ON email_templates;
DROP POLICY IF EXISTS et_delete ON email_templates;

CREATE POLICY et_select ON email_templates FOR SELECT
  USING (recruiter_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY et_insert ON email_templates FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY et_update ON email_templates FOR UPDATE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY et_delete ON email_templates FOR DELETE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

-- ── interviews (migration 012) ──────────────────────────────────────
DROP POLICY IF EXISTS interviews_select ON interviews;
DROP POLICY IF EXISTS interviews_insert ON interviews;
DROP POLICY IF EXISTS interviews_update ON interviews;
DROP POLICY IF EXISTS interviews_delete ON interviews;

CREATE POLICY interviews_select ON interviews FOR SELECT
  USING (recruiter_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY interviews_insert ON interviews FOR INSERT
  WITH CHECK (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY interviews_update ON interviews FOR UPDATE
  USING (recruiter_id = auth.uid() AND public.can_write_data());

CREATE POLICY interviews_delete ON interviews FOR DELETE
  USING (recruiter_id = auth.uid() AND public.can_write_data());
