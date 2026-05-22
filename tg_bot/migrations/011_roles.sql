-- Migration 011: роли пользователей (admin / recruiter / viewer)
-- recruiter — стандартная роль (по умолчанию, как было)
-- admin     — может управлять пользователями, видит всех кандидатов
-- viewer    — только чтение, не может добавлять/редактировать/удалять

-- Обновляем DEFAULT на более явный
ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'recruiter';

-- Добавляем CHECK чтобы не было мусорных значений
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'recruiter', 'viewer'));

-- Комментарий
COMMENT ON COLUMN profiles.role IS 'admin | recruiter | viewer';
