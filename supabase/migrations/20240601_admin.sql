-- ============================================================
-- Admin views for AdminPage
-- NOTE: RLS policies are already handled in 014_security_roles_link_codes.sql
-- This file ONLY adds helper views.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Helper function: get email from auth.users (needs SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO authenticated;

-- ── View: HR stats for AdminPage ─────────────────────────────────
DROP VIEW IF EXISTS admin_hr_stats;

CREATE VIEW admin_hr_stats AS
SELECT
  p.id                                                           AS recruiter_id,
  p.full_name,
  public.get_user_email(p.id)                                    AS email,
  p.role,
  COUNT(DISTINCT c.id)                                           AS total_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'active'  THEN c.id END)  AS active_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'in_work' THEN c.id END)  AS in_work_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'archive' THEN c.id END)  AS archive_candidates,
  COUNT(DISTINCT v.id)                                           AS total_vacancies,
  COUNT(DISTINCT CASE WHEN v.status = 'open'    THEN v.id END)  AS open_vacancies,
  COUNT(DISTINCT r.id)                                           AS total_reminders,
  COUNT(DISTINCT CASE WHEN r.is_done = false    THEN r.id END)  AS pending_reminders,
  COUNT(DISTINCT iv.id)                                          AS total_interviews,
  COUNT(DISTINCT CASE WHEN iv.status = 'scheduled' THEN iv.id END) AS scheduled_interviews,
  MAX(c.created_at)                                              AS last_candidate_added
FROM profiles p
LEFT JOIN candidates  c  ON c.recruiter_id  = p.id
LEFT JOIN vacancies   v  ON v.recruiter_id  = p.id
LEFT JOIN reminders   r  ON r.recruiter_id  = p.id
LEFT JOIN interviews  iv ON iv.recruiter_id = p.id
WHERE p.role IN ('recruiter', 'admin')
GROUP BY p.id, p.full_name, p.role;

GRANT SELECT ON admin_hr_stats TO authenticated;

-- ── View: all candidates with recruiter info ──────────────────────
DROP VIEW IF EXISTS admin_all_candidates;

CREATE VIEW admin_all_candidates AS
SELECT
  c.*,
  p.full_name                     AS recruiter_name,
  public.get_user_email(p.id)     AS recruiter_email
FROM candidates c
JOIN profiles p ON p.id = c.recruiter_id;

GRANT SELECT ON admin_all_candidates TO authenticated;

-- ── View: activity log (last 30 days) ────────────────────────────
DROP VIEW IF EXISTS admin_activity_log;

CREATE VIEW admin_activity_log AS

SELECT
  'candidate_added'               AS event_type,
  c.recruiter_id,
  p.full_name                     AS recruiter_name,
  c.full_name                     AS object_name,
  c.created_at                    AS event_at
FROM candidates c
JOIN profiles p ON p.id = c.recruiter_id
WHERE c.created_at > NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'stage_changed'                 AS event_type,
  v.recruiter_id,
  p.full_name                     AS recruiter_name,
  cand.full_name                  AS object_name,
  sh.changed_at                   AS event_at
FROM stage_history sh
JOIN candidacies cy   ON cy.id   = sh.candidacy_id
JOIN vacancies   v    ON v.id    = cy.vacancy_id
JOIN candidates  cand ON cand.id = cy.candidate_id
JOIN profiles    p    ON p.id    = v.recruiter_id
WHERE sh.changed_at > NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'interview_created'             AS event_type,
  iv.recruiter_id,
  p.full_name                     AS recruiter_name,
  cand.full_name                  AS object_name,
  iv.created_at                   AS event_at
FROM interviews  iv
JOIN candidates  cand ON cand.id = iv.candidate_id
JOIN profiles    p    ON p.id    = iv.recruiter_id
WHERE iv.created_at > NOW() - INTERVAL '30 days'

ORDER BY event_at DESC;

GRANT SELECT ON admin_activity_log TO authenticated;

-- ── Allow admin to update profiles (change roles) ─────────────────
-- Drop old conflicting policies first, then add permissive admin one
DROP POLICY IF EXISTS profiles_update ON profiles;

CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR public.current_user_role() = 'admin'
  );
