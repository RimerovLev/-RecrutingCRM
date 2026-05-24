-- Migration 016: Multi-tenancy — organizations, org_invites, shared team data
-- Run this in Supabase SQL Editor

-- ── 1. organizations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ── 2. org_invites ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email      TEXT,
  token      TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  role       TEXT NOT NULL DEFAULT 'recruiter',
  used       BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days')
);
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

-- ── 3. Add org_id to existing tables ────────────────────────────────
ALTER TABLE profiles        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE candidates      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE vacancies        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE interviews       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE reminders        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE email_templates  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_org       ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_candidates_org     ON candidates(org_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_org       ON vacancies(org_id);
CREATE INDEX IF NOT EXISTS idx_interviews_org      ON interviews(org_id);
CREATE INDEX IF NOT EXISTS idx_reminders_org       ON reminders(org_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON email_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token   ON org_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_org     ON org_invites(org_id);

-- ── 4. Helper: get current user's org_id ────────────────────────────
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$;

-- ── 5. RLS: organizations ────────────────────────────────────────────
DROP POLICY IF EXISTS org_select ON organizations;
DROP POLICY IF EXISTS org_update ON organizations;

CREATE POLICY org_select ON organizations FOR SELECT
  USING (id = auth_org_id());

CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id = auth_org_id() AND public.current_user_role() = 'admin');

-- ── 6. RLS: org_invites ──────────────────────────────────────────────
DROP POLICY IF EXISTS invites_select ON org_invites;
DROP POLICY IF EXISTS invites_insert ON org_invites;
DROP POLICY IF EXISTS invites_delete ON org_invites;

CREATE POLICY invites_select ON org_invites FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY invites_insert ON org_invites FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.current_user_role() = 'admin');

CREATE POLICY invites_delete ON org_invites FOR DELETE
  USING (org_id = auth_org_id() AND public.current_user_role() = 'admin');

-- ── 7. RLS: profiles — org members see each other ───────────────────
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (id = auth.uid() OR org_id = auth_org_id());

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ── 8. RLS: candidates — all org members see all org candidates ──────
DROP POLICY IF EXISTS candidates_select ON candidates;
DROP POLICY IF EXISTS candidates_insert ON candidates;
DROP POLICY IF EXISTS candidates_update ON candidates;
DROP POLICY IF EXISTS candidates_delete ON candidates;

CREATE POLICY candidates_select ON candidates FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY candidates_insert ON candidates FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY candidates_update ON candidates FOR UPDATE
  USING (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY candidates_delete ON candidates FOR DELETE
  USING (org_id = auth_org_id() AND public.can_write_data());

-- ── 9. RLS: vacancies ────────────────────────────────────────────────
DROP POLICY IF EXISTS vacancies_select ON vacancies;
DROP POLICY IF EXISTS vacancies_insert ON vacancies;
DROP POLICY IF EXISTS vacancies_update ON vacancies;
DROP POLICY IF EXISTS vacancies_delete ON vacancies;

CREATE POLICY vacancies_select ON vacancies FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY vacancies_insert ON vacancies FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY vacancies_update ON vacancies FOR UPDATE
  USING (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY vacancies_delete ON vacancies FOR DELETE
  USING (org_id = auth_org_id() AND public.can_write_data());

-- ── 10. RLS: interviews ──────────────────────────────────────────────
DROP POLICY IF EXISTS interviews_select ON interviews;
DROP POLICY IF EXISTS interviews_insert ON interviews;
DROP POLICY IF EXISTS interviews_update ON interviews;
DROP POLICY IF EXISTS interviews_delete ON interviews;

CREATE POLICY interviews_select ON interviews FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY interviews_insert ON interviews FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY interviews_update ON interviews FOR UPDATE
  USING (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY interviews_delete ON interviews FOR DELETE
  USING (org_id = auth_org_id() AND public.can_write_data());

-- ── 11. RLS: reminders ───────────────────────────────────────────────
DROP POLICY IF EXISTS reminders_select ON reminders;
DROP POLICY IF EXISTS reminders_insert ON reminders;
DROP POLICY IF EXISTS reminders_update ON reminders;
DROP POLICY IF EXISTS reminders_delete ON reminders;

CREATE POLICY reminders_select ON reminders FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY reminders_insert ON reminders FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY reminders_update ON reminders FOR UPDATE
  USING (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY reminders_delete ON reminders FOR DELETE
  USING (org_id = auth_org_id() AND public.can_write_data());

-- ── 12. RLS: email_templates ─────────────────────────────────────────
DROP POLICY IF EXISTS et_select ON email_templates;
DROP POLICY IF EXISTS et_insert ON email_templates;
DROP POLICY IF EXISTS et_update ON email_templates;
DROP POLICY IF EXISTS et_delete ON email_templates;

CREATE POLICY et_select ON email_templates FOR SELECT
  USING (org_id = auth_org_id());

CREATE POLICY et_insert ON email_templates FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY et_update ON email_templates FOR UPDATE
  USING (org_id = auth_org_id() AND public.can_write_data());

CREATE POLICY et_delete ON email_templates FOR DELETE
  USING (org_id = auth_org_id() AND public.can_write_data());

-- ── 13. RLS: comments — via org candidates ───────────────────────────
DROP POLICY IF EXISTS comments_select ON comments;
DROP POLICY IF EXISTS comments_insert ON comments;
DROP POLICY IF EXISTS comments_delete ON comments;

CREATE POLICY comments_select ON comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM candidates c
    WHERE c.id = comments.candidate_id AND c.org_id = auth_org_id()
  ));

CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_id AND c.org_id = auth_org_id()
    )
  );

CREATE POLICY comments_delete ON comments FOR DELETE
  USING (author_id = auth.uid() AND public.can_write_data());

-- ── 14. RLS: candidacies — via org vacancies ─────────────────────────
DROP POLICY IF EXISTS candidacies_select ON candidacies;
DROP POLICY IF EXISTS candidacies_insert ON candidacies;
DROP POLICY IF EXISTS candidacies_update ON candidacies;
DROP POLICY IF EXISTS candidacies_delete ON candidacies;

CREATE POLICY candidacies_select ON candidacies FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vacancies v
    WHERE v.id = candidacies.vacancy_id AND v.org_id = auth_org_id()
  ));

CREATE POLICY candidacies_insert ON candidacies FOR INSERT
  WITH CHECK (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = vacancy_id AND v.org_id = auth_org_id()
    )
  );

CREATE POLICY candidacies_update ON candidacies FOR UPDATE
  USING (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = candidacies.vacancy_id AND v.org_id = auth_org_id()
    )
  );

CREATE POLICY candidacies_delete ON candidacies FOR DELETE
  USING (
    public.can_write_data()
    AND EXISTS (
      SELECT 1 FROM vacancies v
      WHERE v.id = candidacies.vacancy_id AND v.org_id = auth_org_id()
    )
  );

-- ── 15. RPC: create_org_and_join ─────────────────────────────────────
-- Creates a new organization and sets the calling user as admin
CREATE OR REPLACE FUNCTION create_org_and_join(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org organizations%ROWTYPE;
BEGIN
  IF trim(p_name) = '' THEN
    RETURN json_build_object('error', 'Название не может быть пустым');
  END IF;

  -- Check user doesn't already have an org
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id IS NOT NULL) THEN
    RETURN json_build_object('error', 'Вы уже состоите в организации');
  END IF;

  INSERT INTO organizations (name) VALUES (trim(p_name)) RETURNING * INTO new_org;

  UPDATE profiles
  SET org_id = new_org.id, role = 'admin'
  WHERE id = auth.uid();

  RETURN json_build_object(
    'ok', true,
    'org_id',   new_org.id,
    'org_name', new_org.name
  );
END;
$$;

-- ── 16. RPC: accept_invite ───────────────────────────────────────────
-- Joins an org using an invite token (bypasses RLS — SECURITY DEFINER)
CREATE OR REPLACE FUNCTION accept_invite(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv org_invites%ROWTYPE;
  org_name TEXT;
BEGIN
  -- Find valid invite
  SELECT * INTO inv FROM org_invites
  WHERE token = p_token AND used = false AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Приглашение не найдено или истекло');
  END IF;

  -- Check user doesn't already have an org
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id IS NOT NULL) THEN
    RETURN json_build_object('error', 'Вы уже состоите в организации');
  END IF;

  SELECT name INTO org_name FROM organizations WHERE id = inv.org_id;

  -- Update profile
  UPDATE profiles
  SET org_id = inv.org_id, role = inv.role
  WHERE id = auth.uid();

  -- Mark invite as used
  UPDATE org_invites SET used = true WHERE id = inv.id;

  RETURN json_build_object(
    'ok', true,
    'org_id',   inv.org_id,
    'org_name', org_name
  );
END;
$$;

-- ── 17. RPC: create_invite ───────────────────────────────────────────
-- Admin creates an invite token for a new team member
CREATE OR REPLACE FUNCTION create_invite(p_role TEXT DEFAULT 'recruiter')
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv      org_invites%ROWTYPE;
  prof     profiles%ROWTYPE;
BEGIN
  SELECT * INTO prof FROM profiles WHERE id = auth.uid();

  IF prof.role != 'admin' THEN
    RETURN json_build_object('error', 'Только администратор может создавать приглашения');
  END IF;

  IF prof.org_id IS NULL THEN
    RETURN json_build_object('error', 'Вы не состоите в организации');
  END IF;

  IF p_role NOT IN ('recruiter', 'viewer', 'admin') THEN
    RETURN json_build_object('error', 'Недопустимая роль');
  END IF;

  INSERT INTO org_invites (org_id, role, created_by)
  VALUES (prof.org_id, p_role, auth.uid())
  RETURNING * INTO inv;

  RETURN json_build_object(
    'ok',         true,
    'token',      inv.token,
    'role',       inv.role,
    'expires_at', inv.expires_at
  );
END;
$$;

-- ── 18. RPC: get_org_members ─────────────────────────────────────────
-- Returns all profiles in current user's org
CREATE OR REPLACE FUNCTION get_org_members()
RETURNS TABLE (
  id         UUID,
  full_name  TEXT,
  role       TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.role, p.created_at
  FROM profiles p
  WHERE p.org_id = auth_org_id()
  ORDER BY p.created_at;
$$;

-- ── 19. RPC: update_member_role ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_member_role(p_user_id UUID, p_role TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM profiles WHERE id = auth.uid();

  IF caller.role != 'admin' THEN
    RETURN json_build_object('error', 'Только администратор');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN json_build_object('error', 'Нельзя изменить свою роль');
  END IF;

  IF p_role NOT IN ('recruiter', 'viewer', 'admin') THEN
    RETURN json_build_object('error', 'Недопустимая роль');
  END IF;

  UPDATE profiles SET role = p_role
  WHERE id = p_user_id AND org_id = caller.org_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ── 20. Grant execute on RPCs to authenticated users ─────────────────
GRANT EXECUTE ON FUNCTION create_org_and_join(TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite(TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION create_invite(TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_members()                TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_role(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION auth_org_id()                    TO authenticated;

-- ── NOTE for existing data ────────────────────────────────────────────
-- Existing users have org_id = NULL and will see the onboarding screen.
-- To migrate your own account, run in SQL Editor after creating your org
-- via the UI (onboarding will create the org automatically).
-- All existing data rows (candidates, vacancies, etc.) also have org_id = NULL.
-- After you go through onboarding, the data won't be visible until you
-- backfill org_id on existing rows. Run this after onboarding:
--
-- UPDATE candidates      SET org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) WHERE org_id IS NULL;
-- UPDATE vacancies        SET org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) WHERE org_id IS NULL;
-- UPDATE interviews       SET org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) WHERE org_id IS NULL;
-- UPDATE reminders        SET org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) WHERE org_id IS NULL;
-- UPDATE email_templates  SET org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) WHERE org_id IS NULL;
--
-- Or use the "Перенести данные" button in the Onboarding screen (implemented in UI).
