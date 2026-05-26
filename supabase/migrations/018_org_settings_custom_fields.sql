-- ══════════════════════════════════════════════════════════════════
-- Migration 018: org_settings + custom candidate fields
-- ══════════════════════════════════════════════════════════════════

-- 1. org_settings — per-org configuration (field layout, visibility, custom fields)
CREATE TABLE IF NOT EXISTS org_settings (
  org_id           UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_fields JSONB DEFAULT NULL,   -- NULL = use system defaults
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- 2. custom_data on candidates — stores values for custom (non-system) fields
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

-- Members of the org can read settings
CREATE POLICY "org_settings_select" ON org_settings
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins can write
CREATE POLICY "org_settings_insert" ON org_settings
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "org_settings_update" ON org_settings
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Helper: upsert org_settings (called from client)
CREATE OR REPLACE FUNCTION upsert_org_settings(
  p_org_id           UUID,
  p_candidate_fields JSONB
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Only admins of the org may call this
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND org_id = p_org_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO org_settings (org_id, candidate_fields, updated_at)
  VALUES (p_org_id, p_candidate_fields, now())
  ON CONFLICT (org_id) DO UPDATE
    SET candidate_fields = EXCLUDED.candidate_fields,
        updated_at       = now();
END;
$$;
