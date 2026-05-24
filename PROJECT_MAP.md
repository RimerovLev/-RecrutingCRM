# Recruit CRM — Полная карта проекта

> Документ для быстрого восстановления контекста. Обновлять при каждом крупном изменении.

---

## Стек

| Слой | Технология |
|------|-----------|
| Фронтенд | React 18 + Vite 6 |
| Стейт | Zustand v5 (только примитивы в store — без объектов!) |
| Стили | Tailwind CSS v3 |
| База данных | Supabase (PostgreSQL + Auth + RLS) |
| Деплой фронта | Vercel (auto-deploy при git push) |
| Telegram-бот | Python (aiogram), деплой на Fly.io |

---

## Структура файлов

```
RecrutingCRM/
├── src/
│   ├── main.jsx                  — точка входа React
│   ├── App.jsx                   — роутинг через Zustand activeView, auth-инициализация
│   ├── index.css                 — глобальные стили, Tailwind директивы
│   ├── store/
│   │   └── index.js              — Zustand store (весь глобальный стейт)
│   ├── lib/
│   │   ├── supabase.js           — createClient, экспорт sb
│   │   ├── config.js             — STAGES, STAGE_LABELS, STATUS_LABELS, PAGE_SIZE=100
│   │   └── apiErrors.js          — хелпер isMissingTableError
│   ├── hooks/
│   │   ├── useCanWrite.js        — role === 'recruiter' || 'admin'
│   │   └── useOffline.js         — isOnline, cacheSet/Get, queueOp, syncPendingOps
│   └── components/
│       ├── Auth/
│       │   ├── AuthPage.jsx      — логин + регистрация (с полем admin_code)
│       │   └── TelegramLinkModal.jsx — генерация кода для привязки Telegram
│       ├── Layout/
│       │   ├── Sidebar.jsx       — десктоп-навигация, имя/роль юзера, выход
│       │   ├── MobileNav.jsx     — мобильная навигация снизу
│       │   └── OfflineBanner.jsx — баннер "нет интернета"
│       ├── common/
│       │   ├── Modal.jsx         — универсальная модалка
│       │   └── Toast.jsx         — уведомления (ok/err/warn)
│       ├── Dashboard/
│       │   └── DashboardPage.jsx — воронка, статистика, ближайшие интервью, напоминания
│       ├── Candidates/
│       │   └── CandidatesPage.jsx — таблица кандидатов, поиск, сортировка, пагинация
│       ├── Drawer/
│       │   └── CandidateDrawer.jsx — боковая панель кандидата, комментарии, история этапов
│       ├── Vacancies/
│       │   └── VacanciesPage.jsx — список вакансий, создание/редактирование
│       ├── Kanban/
│       │   └── KanbanPage.jsx    — канбан-доска по вакансии, drag&drop этапов
│       ├── Reminders/
│       │   └── RemindersPage.jsx — напоминания с датой/временем, сортировка, группировка
│       ├── Interviews/
│       │   └── InterviewsPage.jsx — список + календарь интервью, форматы (звонок/видео/офис)
│       └── Admin/
│           └── AdminPage.jsx     — обзор всех рекрутёров, кандидаты, активность, отчёты
├── public/
│   ├── favicon.svg               — иконка приложения
│   └── sw.js                     — Service Worker (CACHE_NAME='recruit-crm-v7', network-first)
├── supabase/
│   ├── migrations/
│   │   ├── 014_security_roles_link_codes.sql  — RLS политики, роли, link_codes, telegram_users
│   │   ├── 015_admin_code_trigger.sql          — триггер назначения admin через секретный код
│   │   ├── 20240601_admin.sql                  — views: admin_hr_stats, admin_all_candidates, admin_activity_log
│   │   └── 20240602_candidates_extra_fields.sql — доп. поля кандидата (experience, notes, tags и др.)
│   └── functions/
│       └── send-email/index.ts   — Edge Function отправки email через Resend
├── tg_bot/
│   ├── bot.py                    — Telegram-бот (aiogram), мультипользовательский режим
│   ├── Dockerfile                — контейнер для деплоя
│   ├── fly.toml                  — конфиг Fly.io
│   └── requirements.txt
├── index.html                    — точка входа HTML, favicon, title
├── vite.config.js                — алиас @→src, Cache-Control: no-store в dev
├── vercel.json                   — SPA rewrite rules, кэш sw.js и assets
└── .env                          — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (не в git!)
```

---

## База данных — таблицы

| Таблица | Ключевые поля | Примечания |
|---------|--------------|-----------|
| `profiles` | `id` (= auth.uid), `full_name`, `role` (recruiter/admin/viewer) | Создаётся автоматически при первом входе |
| `candidates` | `recruiter_id`, `full_name`, `phone`, `email`, `position`, `status`, `pipeline_stage`, `tags[]`, + 10 доп. полей | RLS: видит только owner + admin |
| `vacancies` | `recruiter_id`, `title`, `status` (open/in_work/closed/archive), `pipeline_stage_limit` | Лимит этапа воронки |
| `candidacies` | `candidate_id`, `vacancy_id`, `current_stage` | Связь кандидата с вакансией на канбане |
| `stage_history` | `candidacy_id`, `from_stage`, `to_stage`, `changed_by`, `changed_at` | История движения по воронке |
| `comments` | `candidate_id`, `recruiter_id`, `author_id`, `content` | Комментарии в drawer кандидата |
| `reminders` | `recruiter_id`, `candidate_id?`, `note`, `due_date` (timestamp), `is_done` | Дата+время в одном поле due_date |
| `interviews` | `recruiter_id`, `candidate_id`, `scheduled_at` (UTC ISO), `format`, `status`, `notes` | scheduled_at создаётся через new Date(y,m,d,h,min).toISOString() |
| `email_templates` | `recruiter_id`, `name`, `subject`, `body` | Шаблоны писем |
| `link_codes` | `code`, `recruiter_id`, `expires_at`, `used` | Одноразовые коды для привязки Telegram |
| `telegram_users` | `telegram_id`, `recruiter_id`, `username` | Доступ только через service_role (бот) |
| `app_config` | `key`, `value` | Хранит admin_code для триггера |

**Views:** `admin_hr_stats`, `admin_all_candidates`, `admin_activity_log`

**Functions:** `current_user_role()`, `can_write_data()`, `get_user_email()`, `handle_profile_admin_code()`

---

## Zustand Store — структура

```js
// AUTH (только примитивы — объекты вызывают infinite re-render через Object.is)
currentUserId:      null,   // UUID
currentUserEmail:   null,   // string
currentProfileRole: 'recruiter',  // 'recruiter' | 'admin' | 'viewer'
currentProfileName: null,   // string

// CANDIDATES
allCandidates, candidatesTotal, candidatesOffset, searchQ, sortField, sortDir, selectedIds

// VACANCIES
allVacancies

// KANBAN
currentVacId, currentVacTitle

// UI
activeView,          // 'dashboard'|'candidates'|'vacancies'|'kanban'|'reminders'|'interviews'|'admin'
drawerCandidateId, drawerOpen,
emailModalOpen, pendingEmailCandidateId,
toasts
```

---

## Важные архитектурные решения

**Auth flow в App.jsx:**
1. `sb.auth.getSession()` читает из localStorage → быстро и надёжно
2. `markReady()` вызывается ДО `await loadProfile()` — иначе зависнет на загрузке
3. `onAuthStateChange` слушает только SIGNED_IN и SIGNED_OUT (не INITIAL_SESSION)
4. Safety timeout 5 секунд — страница всегда покажется

**Timezone в интервью:**
```js
// ПРАВИЛЬНО — создаём локальное время, JS сам конвертирует в UTC
const localDt = new Date(year, month-1, day, hours, minutes, 0);
const scheduledAt = localDt.toISOString();

// НЕПРАВИЛЬНО — строка без timezone = Supabase хранит как UTC → сдвиг +3ч
const scheduledAt = `${date}T${time}:00`;
```

**Офлайн-кэш:**
- `cacheSet/cacheGet` → localStorage с ключами из `LS` объекта
- `queueOp` → очередь операций при офлайне, синхронизируется при reconnect
- SW в dev-режиме отключён (App.jsx разрегистрирует все SW при DEV)

**RLS роли:**
- `viewer` — только чтение, не может создавать/редактировать
- `recruiter` — полный доступ к своим данным
- `admin` — видит всё (через `current_user_role() = 'admin'` в политиках)

---

## Роли пользователей

| Роль | Назначается | Права |
|------|------------|-------|
| `recruiter` | Автоматически при регистрации | Свои данные — полный доступ |
| `admin` | При регистрации с секретным кодом ИЛИ через SQL UPDATE | Все данные всех рекрутёров |
| `viewer` | Через AdminPage → вкладка Рекрутёры | Только просмотр |

**Стать админом (уже зарегистрированному):**
```sql
UPDATE profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'email@example.com');
```

**Секретный код для admin при регистрации:**
```sql
-- Посмотреть текущий код
SELECT value FROM app_config WHERE key = 'admin_code';
-- Поменять код
UPDATE app_config SET value = 'НовыйКод' WHERE key = 'admin_code';
```

---

## Деплой

**Фронтенд:** Vercel, auto-deploy при `git push`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- После добавления vars → Redeploy обязателен

**Telegram-бот:** Fly.io
- `.env` в `tg_bot/` с токеном бота и Supabase service_role ключом

**Supabase:**
- URL Configuration → добавить домен Vercel в Site URL и Redirect URLs

---

## Известные баги и их решения

| Баг | Причина | Решение |
|-----|---------|---------|
| Данные пропадают на refresh | Browser кэширует старый JS | `Cache-Control: no-store` в vite.config.js server.headers |
| SW кэширует dev JS | Service Worker в dev | App.jsx разрегистрирует SW в DEV режиме |
| Время интервью сдвигается +3ч | Строка без timezone → UTC | `new Date(y,m,d,h,min).toISOString()` |
| Кандидат не создаётся 400 | Отсутствующие колонки в БД | Миграция 20240602_candidates_extra_fields.sql |
| Загрузка зависает навсегда | markReady после await loadProfile | markReady вызывается ДО await |
| Объекты в store = infinite loop | Zustand Object.is сравнение | Только примитивы в store |
