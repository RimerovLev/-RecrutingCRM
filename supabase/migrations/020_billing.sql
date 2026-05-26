-- ── Migration 020: Billing · Sessions · Error Logs ──────────────────────────
--
-- SETUP AFTER RUNNING THIS MIGRATION:
--   1. In Supabase SQL Editor run:
--        INSERT INTO admin_config (key, value)
--        VALUES ('admin_token', 'ВАШ_СЕКРЕТНЫЙ_ТОКЕН_ЗДЕСЬ');
--      (придумай длинный случайный строки — это пароль панели владельца)
--   2. Откройте /owner в браузере и введите этот токен.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan       TEXT        NOT NULL DEFAULT 'trial'
             CHECK (plan IN ('trial','monthly','semi_annual','annual','lifetime','free')),
  status     TEXT        NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','suspended','cancelled')),
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,          -- NULL = never expires (lifetime / free)
  granted_by TEXT        DEFAULT 'trial',
  notes      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Single-device sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  device_hint TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Admin secret (no direct reads — only via SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS admin_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 4. Error logs
CREATE TABLE IF NOT EXISTS error_logs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID,
  org_id     UUID,
  message    TEXT,
  stack      TEXT,
  url        TEXT,
  severity   TEXT        DEFAULT 'error',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs    ENABLE ROW LEVEL SECURITY;

-- Подписки: члены организации могут читать свою
DROP POLICY IF EXISTS "org members read subscription" ON subscriptions;
CREATE POLICY "org members read subscription" ON subscriptions FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- user_sessions / admin_config — только через SECURITY DEFINER функции
-- error_logs — только вставка (аутентифицированные)
DROP POLICY IF EXISTS "insert error logs" ON error_logs;
CREATE POLICY "insert error logs" ON error_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Получить подписку организации
CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v subscriptions%ROWTYPE; v_active BOOL;
BEGIN
  SELECT * INTO v FROM subscriptions WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found',false,'is_active',true,'plan','trial',
                              'expires_at',null,'days_remaining',null);
  END IF;
  v_active := v.status = 'active' AND (v.expires_at IS NULL OR v.expires_at > now());
  RETURN jsonb_build_object(
    'found',         true,
    'plan',          v.plan,
    'status',        v.status,
    'expires_at',    v.expires_at,
    'is_active',     v_active,
    'days_remaining',
      CASE WHEN v.expires_at IS NULL THEN NULL::INT
           ELSE GREATEST(0, EXTRACT(DAY FROM v.expires_at - now())::INT) END
  );
END $$;

-- Выдать / обновить подписку (только с admin_token)
CREATE OR REPLACE FUNCTION grant_subscription(
  p_admin_token TEXT, p_org_id UUID, p_plan TEXT, p_months INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token TEXT; v_expires TIMESTAMPTZ;
BEGIN
  SELECT value INTO v_token FROM admin_config WHERE key = 'admin_token';
  IF v_token IS DISTINCT FROM p_admin_token THEN
    RETURN jsonb_build_object('success',false,'error','Invalid token');
  END IF;
  v_expires := CASE
    WHEN p_months IS NULL OR p_plan IN ('lifetime','free') THEN NULL
    ELSE now() + make_interval(months => p_months)
  END;
  INSERT INTO subscriptions(org_id,plan,status,started_at,expires_at,granted_by,updated_at)
  VALUES (p_org_id,p_plan,'active',now(),v_expires,'admin',now())
  ON CONFLICT (org_id) DO UPDATE SET
    plan=EXCLUDED.plan, status='active', started_at=now(),
    expires_at=EXCLUDED.expires_at, granted_by='admin', updated_at=now();
  RETURN jsonb_build_object('success',true,'expires_at',v_expires);
END $$;

-- Список всех организаций (только с admin_token)
CREATE OR REPLACE FUNCTION list_orgs_admin(p_admin_token TEXT)
RETURNS TABLE(org_id UUID, org_name TEXT, plan TEXT, sub_status TEXT,
              expires_at TIMESTAMPTZ, days_remaining INT, is_active BOOL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_config WHERE key='admin_token' AND value=p_admin_token) THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;
  RETURN QUERY
    SELECT o.id, o.name,
           COALESCE(s.plan,'—'), COALESCE(s.status,'—'),
           s.expires_at,
           CASE WHEN s.expires_at IS NULL THEN NULL::INT
                ELSE GREATEST(0, EXTRACT(DAY FROM s.expires_at - now())::INT) END,
           s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > now())
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.name;
END $$;

-- Установить session-токен (при входе)
CREATE OR REPLACE FUNCTION set_session_token(p_token TEXT, p_device_hint TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO user_sessions(user_id,token,device_hint,updated_at)
  VALUES(auth.uid(),p_token,p_device_hint,now())
  ON CONFLICT(user_id) DO UPDATE SET
    token=EXCLUDED.token, device_hint=EXCLUDED.device_hint, updated_at=now();
$$;

-- Проверить session-токен
CREATE OR REPLACE FUNCTION validate_session_token(p_token TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM user_sessions WHERE user_id=auth.uid() AND token=p_token);
$$;

-- Логировать ошибку
CREATE OR REPLACE FUNCTION log_error(
  p_message TEXT, p_stack TEXT DEFAULT NULL,
  p_url TEXT DEFAULT NULL, p_severity TEXT DEFAULT 'error'
) RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO error_logs(user_id,org_id,message,stack,url,severity)
  SELECT auth.uid(),
         (SELECT org_id FROM profiles WHERE id=auth.uid()),
         p_message, p_stack, p_url, p_severity;
$$;

-- Список ошибок (только с admin_token)
CREATE OR REPLACE FUNCTION list_errors_admin(p_admin_token TEXT, p_limit INT DEFAULT 100)
RETURNS TABLE(id UUID, user_id UUID, org_id UUID, message TEXT,
              stack TEXT, url TEXT, severity TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_config WHERE key='admin_token' AND value=p_admin_token) THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;
  RETURN QUERY SELECT * FROM error_logs ORDER BY created_at DESC LIMIT p_limit;
END $$;

-- ── Автоматический триал при создании организации ────────────────────────────
CREATE OR REPLACE FUNCTION fn_create_trial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscriptions(org_id,plan,status,expires_at,granted_by)
  VALUES(NEW.id,'trial','active',now() + INTERVAL '14 days','auto_trial')
  ON CONFLICT(org_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_trial ON organizations;
CREATE TRIGGER trg_create_trial
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION fn_create_trial();

-- ── Существующие организации: дать 30-дневный grace period ───────────────────
INSERT INTO subscriptions(org_id,plan,status,expires_at,granted_by)
SELECT id,'trial','active', now() + INTERVAL '30 days','backfill'
FROM organizations
WHERE id NOT IN (SELECT org_id FROM subscriptions WHERE org_id IS NOT NULL)
ON CONFLICT(org_id) DO NOTHING;
