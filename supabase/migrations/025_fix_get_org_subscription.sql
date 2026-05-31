-- Migration 025: Fix get_org_subscription — return safe JSON instead of throwing
-- When the caller is not yet a member (e.g. during onboarding race), return
-- an active-trial fallback instead of raising an exception that causes a 400.

CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v subscriptions%ROWTYPE; v_active BOOL;
BEGIN
  -- Authorization: caller must belong to this org.
  -- Return safe fallback instead of throwing so the frontend doesn't get a 400.
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = p_org_id
  ) THEN
    RETURN jsonb_build_object(
      'found', false, 'is_active', true, 'plan', 'trial',
      'expires_at', null, 'days_remaining', null
    );
  END IF;

  SELECT * INTO v FROM subscriptions WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false, 'is_active', true, 'plan', 'trial',
      'expires_at', null, 'days_remaining', null
    );
  END IF;

  v_active := v.status = 'active' AND (v.expires_at IS NULL OR v.expires_at > now());
  RETURN jsonb_build_object(
    'found',          true,
    'plan',           v.plan,
    'status',         v.status,
    'expires_at',     v.expires_at,
    'is_active',      v_active,
    'days_remaining',
      CASE WHEN v.expires_at IS NULL THEN NULL::INT
           ELSE GREATEST(0, EXTRACT(DAY FROM v.expires_at - now())::INT) END
  );
END $$;
