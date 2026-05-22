-- Migration 013: editable email templates
-- Позволяет рекрутеру хранить свои HTML-шаблоны писем в БД

CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID  REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT  NOT NULL,          -- 'invite' | 'rejection' | 'offer' | custom key
  name         TEXT  NOT NULL,
  subject      TEXT  NOT NULL,
  body_html    TEXT  NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_recruiter_type_name
  ON email_templates(recruiter_id, type, name);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY et_select ON email_templates FOR SELECT USING (recruiter_id = auth.uid());
CREATE POLICY et_insert ON email_templates FOR INSERT WITH CHECK (recruiter_id = auth.uid());
CREATE POLICY et_update ON email_templates FOR UPDATE USING (recruiter_id = auth.uid());
CREATE POLICY et_delete ON email_templates FOR DELETE USING (recruiter_id = auth.uid());

COMMENT ON TABLE email_templates IS 'Recruiter editable email templates';
