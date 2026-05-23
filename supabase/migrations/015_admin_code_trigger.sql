-- Migration 015: Admin code trigger
-- Позволяет зарегистрироваться как admin, введя секретный код.
-- Код хранится в БД (не в клиентском JS) — безопасно.
-- Запустить в Supabase SQL Editor.

-- ── Таблица конфигурации приложения ──────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: никто из клиентов не может читать/писать app_config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
-- (нет политик = полный запрет для authenticated/anon, только service_role)

-- ── Установи свой секретный код ───────────────────────────────────
-- Поменяй 'ТВОЙ_СЕКРЕТНЫЙ_КОД' на что-то своё (например 'Recruit2024!')
INSERT INTO app_config (key, value)
VALUES ('admin_code', 'ТВОЙ_СЕКРЕТНЫЙ_КОД')
ON CONFLICT (key) DO NOTHING;

-- ── Триггер: проверяет код при создании профиля ───────────────────
CREATE OR REPLACE FUNCTION public.handle_profile_admin_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_code TEXT;
  user_code   TEXT;
BEGIN
  -- Берём секретный код из БД
  SELECT value INTO stored_code FROM app_config WHERE key = 'admin_code';

  -- Берём код который ввёл пользователь при регистрации (из user metadata)
  SELECT raw_user_meta_data->>'admin_code' INTO user_code
  FROM auth.users WHERE id = NEW.id;

  -- Если коды совпадают — делаем админом
  IF stored_code IS NOT NULL
     AND stored_code != ''
     AND stored_code != 'ТВОЙ_СЕКРЕТНЫЙ_КОД'
     AND user_code = stored_code
  THEN
    NEW.role := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

-- Вешаем триггер BEFORE INSERT на profiles
DROP TRIGGER IF EXISTS trg_profile_admin_code ON profiles;
CREATE TRIGGER trg_profile_admin_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_admin_code();

-- ── Как поменять код в будущем ────────────────────────────────────
-- UPDATE app_config SET value = 'НовыйКод', updated_at = now()
-- WHERE key = 'admin_code';
