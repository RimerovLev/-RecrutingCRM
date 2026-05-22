# Миграции Supabase

Выполняйте в SQL Editor **по порядку** (после базовой схемы из `index.html`):

| Файл | Содержание |
|------|------------|
| `009_unify_stage_keys.sql` | Единые ключи этапов воронки |
| `010_vacancy_extra_fields.sql` | Доп. поля вакансий |
| `011_roles.sql` | Роли admin / recruiter / viewer |
| `012_interviews.sql` | Таблица собеседований |
| `013_email_templates.sql` | Шаблоны писем |
| `014_security_roles_link_codes.sql` | RLS для ролей, `link_codes`, `telegram_users` |

После 014 включите Realtime для таблиц `candidates`, `vacancies`, `reminders`, `interviews` (Database → Replication).
