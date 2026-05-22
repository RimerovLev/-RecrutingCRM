# Recruit CRM

CRM для рекрутеров: веб-клиент (Supabase) + Telegram-бот.

## Структура

| Путь | Описание |
|------|----------|
| `index.html`, `js/`, `css/` | Веб-приложение (ES modules) |
| `tg_bot/` | Telegram-бот (Python) |
| `supabase/migrations/` | SQL-миграции (009–014) |
| `supabase/functions/send-email/` | Edge Function → Resend |

## Быстрый старт (веб)

1. Создайте проект в [Supabase](https://supabase.com).
2. Выполните SQL из комментария в `index.html` (базовая схема) и миграции по порядку в `supabase/migrations/README.md`.
3. Скопируйте конфиг:
   ```bash
   cp js/config.local.example.js js/config.local.js
   ```
   Укажите `SUPABASE_URL` и `SUPABASE_ANON_KEY`.
4. Откройте `index.html` через локальный сервер (не `file://`):
   ```bash
   python3 -m http.server 8080
   ```
5. Edge Function `send-email`: задеплойте и задайте секреты `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, опционально `ALLOWED_ORIGIN`.

## Telegram-бот

```bash
cd tg_bot
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY (service_role)
python bot.py
```

Команды: `/today`, `/candidates`, `/interviews`, `/link КОД`, …

## Тесты

```bash
cd tg_bot
python tests/run_stage_tests.py          # без сети
pytest tests/test_unit.py -q             # unit
pytest tests/test_integration.py -q      # нужен .env + Supabase
python tests/test_rls.py                 # RLS (stub или live с env)
```

## Роли

- `recruiter` — полный доступ к своим данным
- `viewer` — только чтение (RLS + CSS)
- `admin` — чтение всех данных (RLS), запись своих

Миграция `014_security_roles_link_codes.sql` обязательна для корректных политик.

## Деплой

- **Фронт**: GitHub Pages, Netlify, Vercel — статика из корня репо; не забудьте `config.local.js` в CI secrets или env injection.
- **Бот**: Fly.io (`tg_bot/fly.toml`)
