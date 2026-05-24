-- Migration 017: Fix admin views — add org_id filtering
-- Views in Supabase run as the owner (superuser) and bypass RLS,
-- so we must add explicit auth_org_id() filters to each view.

-- ── admin_hr_stats ────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin_hr_stats;

CREATE OR REPLACE VIEW admin_hr_stats AS
SELECT
  p.id                                                             AS recruiter_id,
  p.full_name,
  public.get_user_email(p.id)                                      AS email,
  p.role,
  COUNT(DISTINCT c.id)                                             AS total_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'active'     THEN c.id END) AS active_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'in_work'    THEN c.id END) AS in_work_candidates,
  COUNT(DISTINCT CASE WHEN c.status = 'archive'    THEN c.id END) AS archive_candidates,
  COUNT(DISTINCT v.id)                                             AS total_vacancies,
  COUNT(DISTINCT CASE WHEN v.status = 'open'       THEN v.id END) AS open_vacancies,
  COUNT(DISTINCT r.id)                                             AS total_reminders,
  COUNT(DISTINCT CASE WHEN r.is_done = false        THEN r.id END) AS pending_reminders,
  COUNT(DISTINCT iv.id)                                            AS total_interviews,
  COUNT(DISTINCT CASE WHEN iv.status = 'scheduled' THEN iv.id END) AS scheduled_interviews,
  MAX(c.created_at)                                                AS last_candidate_added
FROM profiles p
LEFT JOIN candidates c  ON c.recruiter_id  = p.id AND c.org_id  = public.auth_org_id()
LEFT JOIN vacancies  v  ON v.recruiter_id  = p.id AND v.org_id  = public.auth_org_id()
LEFT JOIN reminders  r  ON r.recruiter_id  = p.id AND r.org_id  = public.auth_org_id()
LEFT JOIN interviews iv ON iv.recruiter_id = p.id AND iv.org_id = public.auth_org_id()
WHERE p.org_id = public.auth_org_id()
  AND p.role IN ('recruiter', 'admin', 'viewer')
GROUP BY p.id, p.full_name, p.role;

GRANT SELECT ON admin_hr_stats TO authenticated;

-- ── admin_all_candidates ──────────────────────────────────────────────
DROP VIEW IF EXISTS admin_all_candidates;

CREATE OR REPLACE VIEW admin_all_candidates AS
SELECT
  c.*,
  p.full_name                   AS recruiter_name,
  public.get_user_email(p.id)   AS recruiter_email
FROM candidates c
JOIN profiles p ON p.id = c.recruiter_id
WHERE c.org_id = public.auth_org_id();

GRANT SELECT ON admin_all_candidates TO authenticated;

-- ── admin_activity_log ────────────────────────────────────────────────
DROP VIEW IF EXISTS admin_activity_log;

CREATE OR REPLACE VIEW admin_activity_log AS

SELECT
  'candidate_added'         AS event_type,
  c.recruiter_id,
  p.full_name               AS recruiter_name,
  c.full_name               AS object_name,
  c.created_at              AS event_at
FROM candidates c
JOIN profiles p ON p.id = c.recruiter_id
WHERE c.org_id = public.auth_org_id()
  AND c.created_at > NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'vacancy_added'           AS event_type,
  v.recruiter_id,
  p.full_name               AS recruiter_name,
  v.title                   AS object_name,
  v.created_at              AS event_at
FROM vacancies v
JOIN profiles p ON p.id = v.recruiter_id
WHERE v.org_id = public.auth_org_id()
  AND v.created_at > NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'interview_scheduled'     AS event_type,
  iv.recruiter_id,
  p.full_name               AS recruiter_name,
  ca.full_name              AS object_name,
  iv.created_at             AS event_at
FROM interviews iv
JOIN profiles p  ON p.id  = iv.recruiter_id
JOIN candidates ca ON ca.id = iv.candidate_id
WHERE iv.org_id = public.auth_org_id()
  AND iv.created_at > NOW() - INTERVAL '30 days'

ORDER BY event_at DESC;

GRANT SELECT ON admin_activity_log TO authenticated;
