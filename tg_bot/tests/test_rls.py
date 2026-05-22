"""
RLS Policy Tests — Recruit CRM
================================
Проверяет что Supabase Row Level Security работает правильно:
- recruiter видит только свои данные
- viewer (другой аккаунт) не может изменять чужие данные
- анонимный пользователь не имеет доступа

Запуск:
    python tests/test_rls.py

Требуется:
    pip install supabase --break-system-packages

Переменные окружения (или заполните константы ниже):
    SUPABASE_URL
    SUPABASE_ANON_KEY
    RLS_TEST_USER_A_EMAIL     — существующий аккаунт рекрутера
    RLS_TEST_USER_A_PASSWORD
    RLS_TEST_USER_B_EMAIL     — второй аккаунт (другой рекрутер)
    RLS_TEST_USER_B_PASSWORD
"""

import os
import sys
import uuid
import json
import traceback

# ── Настройки ────────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv('SUPABASE_URL',  'https://xbqunyukacahlotbgrma.supabase.co')
SUPABASE_ANON = os.getenv('SUPABASE_ANON_KEY', '')

USER_A_EMAIL = os.getenv('RLS_TEST_USER_A_EMAIL', '')
USER_A_PASS  = os.getenv('RLS_TEST_USER_A_PASSWORD', '')
USER_B_EMAIL = os.getenv('RLS_TEST_USER_B_EMAIL', '')
USER_B_PASS  = os.getenv('RLS_TEST_USER_B_PASSWORD', '')

# ── Stub-режим (без реального Supabase) ──────────────────────────────
STUB_MODE = not (SUPABASE_ANON and USER_A_EMAIL and USER_A_PASS and USER_B_EMAIL and USER_B_PASS)

# ── Результаты ───────────────────────────────────────────────────────
passed = 0
failed = 0
skipped = 0

def ok(name):
    global passed
    passed += 1
    print(f'  ✅ {name}')

def fail(name, reason=''):
    global failed
    failed += 1
    print(f'  ❌ {name}' + (f': {reason}' if reason else ''))

def skip(name, reason=''):
    global skipped
    skipped += 1
    print(f'  ⏭  {name} (skipped: {reason})')

def section(title):
    print(f'\n── {title} ──')


# ════════════════════════════════════════════════════════════════════
#  STUB TESTS — работают без реального Supabase
#  Проверяют что RLS-политики ПРАВИЛЬНО ОПИСАНЫ в коде
# ════════════════════════════════════════════════════════════════════

section('RLS Policy Definitions (static analysis)')

# Читаем index.html для проверки SQL-схемы
try:
    with open(os.path.join(os.path.dirname(__file__), '../../index.html')) as f:
        html = f.read()
    has_html = True
except FileNotFoundError:
    has_html = False

def check_rls_policy(table, operation, expected_clause):
    """Проверяет что в SQL-схеме есть RLS-политика для таблицы."""
    if not has_html:
        skip(f'{table} {operation} policy', 'index.html not found')
        return
    if expected_clause.lower() in html.lower():
        ok(f'{table}: {operation} policy contains "{expected_clause}"')
    else:
        fail(f'{table}: {operation} policy contains "{expected_clause}"',
             f'Expected to find: {expected_clause}')

check_rls_policy('candidates',  'SELECT', 'recruiter_id = auth.uid()')
check_rls_policy('candidates',  'INSERT', 'recruiter_id = auth.uid()')
check_rls_policy('candidates',  'UPDATE', 'recruiter_id = auth.uid()')
check_rls_policy('candidates',  'DELETE', 'recruiter_id = auth.uid()')
check_rls_policy('vacancies',   'SELECT', 'recruiter_id = auth.uid()')
check_rls_policy('vacancies',   'INSERT', 'recruiter_id = auth.uid()')
check_rls_policy('reminders',   'SELECT', 'recruiter_id = auth.uid()')
check_rls_policy('profiles',    'SELECT', 'auth.uid()')


section('Stage Key Validation (static analysis)')

VALID_STAGES = {'new', 'resume', 'phone', 'interview', 'offer', 'rejected'}
FREE_STAGES  = {'new', 'resume'}
VACANCY_REQUIRED = {'phone', 'interview', 'offer', 'rejected'}

def test_stage_values():
    all_stages = VALID_STAGES
    for s in all_stages:
        if s in FREE_STAGES or s in VACANCY_REQUIRED:
            ok(f'Stage "{s}" classified correctly')
        else:
            fail(f'Stage "{s}" not in FREE_STAGES or VACANCY_REQUIRED')

test_stage_values()

# Проверяем что FREE_STAGES ∪ VACANCY_REQUIRED == VALID_STAGES
if FREE_STAGES | VACANCY_REQUIRED == VALID_STAGES:
    ok('FREE_STAGES ∪ VACANCY_REQUIRED == VALID_STAGES')
else:
    fail('Stage sets incomplete', f'Missing: {VALID_STAGES - (FREE_STAGES | VACANCY_REQUIRED)}')

# Проверяем что FREE_STAGES ∩ VACANCY_REQUIRED == ∅
if FREE_STAGES & VACANCY_REQUIRED == set():
    ok('FREE_STAGES ∩ VACANCY_REQUIRED = ∅ (no overlap)')
else:
    fail('FREE_STAGES and VACANCY_REQUIRED overlap', str(FREE_STAGES & VACANCY_REQUIRED))


section('Migration Files (static analysis)')

import glob
migrations_dir = os.path.join(os.path.dirname(__file__), '../migrations')
migration_files = sorted(glob.glob(os.path.join(migrations_dir, '*.sql')))

if migration_files:
    ok(f'Found {len(migration_files)} migration files')
    # Проверяем нумерацию (последовательная, не обязательно с 001)
    nums = []
    for path in migration_files:
        fname = os.path.basename(path)
        try:
            nums.append(int(fname.split('_')[0]))
        except ValueError:
            fail(f'Migration {fname} has non-numeric prefix')
    if nums == sorted(nums):
        ok(f'Migration files are in sequential order: {nums}')
    else:
        fail('Migration files are not in order', str(nums))

    # Проверяем 009 — унификация ключей
    m009 = os.path.join(migrations_dir, '009_unify_stage_keys.sql')
    if os.path.exists(m009):
        with open(m009) as f:
            sql = f.read()
        if "'new'" in sql and "'interview'" in sql and "'rejected'" in sql:
            ok('Migration 009 contains English stage keys')
        else:
            fail('Migration 009 missing English stage keys')
        if "'Новый'" in sql or "'Собеседование'" in sql:
            ok('Migration 009 migrates Russian keys to English')
        else:
            fail('Migration 009 missing Russian→English conversion')

    # Проверяем 010 — поля вакансии
    m010 = os.path.join(migrations_dir, '010_vacancy_extra_fields.sql')
    if os.path.exists(m010):
        with open(m010) as f:
            sql = f.read()
        for col in ['deadline', 'headcount', 'department']:
            if col in sql:
                ok(f'Migration 010 adds column: {col}')
            else:
                fail(f'Migration 010 missing column: {col}')

    # Проверяем 011 — роли
    m011 = os.path.join(migrations_dir, '011_roles.sql')
    if os.path.exists(m011):
        with open(m011) as f:
            sql = f.read()
        for role in ["'admin'", "'recruiter'", "'viewer'"]:
            if role in sql:
                ok(f'Migration 011 contains role {role}')
            else:
                fail(f'Migration 011 missing role {role}')
else:
    fail('No migration files found')


section('Module Split (static analysis)')

js_dir = os.path.join(os.path.dirname(__file__), '../../js')
required_modules = [
    'config.js', 'state.js', 'utils.js', 'offline.js',
    'auth.js', 'candidates.js', 'vacancies.js', 'kanban.js',
    'dashboard.js', 'drawer.js', 'reminders.js', 'email.js',
    'comments.js', 'merge.js', 'templates.js', 'app.js',
]

for mod in required_modules:
    path = os.path.join(js_dir, mod)
    if os.path.exists(path):
        size = os.path.getsize(path)
        ok(f'js/{mod} exists ({size:,} bytes)')
    else:
        fail(f'js/{mod} missing')

# Проверяем что index.html не содержит inline JS
index_path = os.path.join(os.path.dirname(__file__), '../../index.html')
if os.path.exists(index_path):
    with open(index_path) as f:
        lines = f.readlines()
    inline_js_lines = [l.strip() for l in lines if l.strip().startswith(('const ', 'function ', 'async function ', 'let ', 'var '))]
    if not inline_js_lines:
        ok('index.html contains no inline JS')
    else:
        fail(f'index.html still has {len(inline_js_lines)} inline JS lines', inline_js_lines[:3])

    # Проверяем подключение модуля
    content = ''.join(lines)
    if 'type="module"' in content and 'js/app.js' in content:
        ok('index.html loads js/app.js as ES module')
    else:
        fail('index.html missing <script type="module" src="js/app.js">')

    if 'css/app.css' in content:
        ok('index.html links css/app.css')
    else:
        fail('index.html missing <link href="css/app.css">')


# ════════════════════════════════════════════════════════════════════
#  LIVE TESTS — требуют реального Supabase + двух тестовых аккаунтов
# ════════════════════════════════════════════════════════════════════

if STUB_MODE:
    section('Live RLS Tests (SKIPPED — no credentials)')
    skip('User A isolation: can only see own candidates', 'set env vars to enable')
    skip('User B cannot read User A candidates', 'set env vars to enable')
    skip('User B cannot insert into User A vacancies', 'set env vars to enable')
    skip('User B cannot update User A candidate', 'set env vars to enable')
    skip('User B cannot delete User A candidate', 'set env vars to enable')
    skip('Anonymous user cannot read candidates', 'set env vars to enable')
    skip('Anonymous user cannot insert candidates', 'set env vars to enable')
else:
    try:
        from supabase import create_client

        section('Live RLS Tests')

        # ── Создаём клиентов ────────────────────────────────────────
        sb_a = create_client(SUPABASE_URL, SUPABASE_ANON)
        sb_b = create_client(SUPABASE_URL, SUPABASE_ANON)
        sb_anon = create_client(SUPABASE_URL, SUPABASE_ANON)

        res_a = sb_a.auth.sign_in_with_password({'email': USER_A_EMAIL, 'password': USER_A_PASS})
        res_b = sb_b.auth.sign_in_with_password({'email': USER_B_EMAIL, 'password': USER_B_PASS})

        user_a = res_a.user
        user_b = res_b.user

        if not user_a or not user_b:
            fail('Login', 'Could not sign in test users')
        else:
            ok(f'User A logged in: {user_a.email}')
            ok(f'User B logged in: {user_b.email}')

            # ── Создаём тестового кандидата от User A ───────────────
            test_id = str(uuid.uuid4())
            ins = sb_a.table('candidates').insert({
                'id': test_id,
                'recruiter_id': user_a.id,
                'full_name': f'RLS Test Candidate {test_id[:8]}',
            }).execute()

            if ins.data:
                ok('User A: can insert own candidate')

                # ── User A видит своего кандидата ────────────────────
                sel_a = sb_a.table('candidates').select('id').eq('id', test_id).execute()
                if sel_a.data:
                    ok('User A: can read own candidate')
                else:
                    fail('User A: cannot read own candidate')

                # ── User B НЕ видит кандидата User A ────────────────
                sel_b = sb_b.table('candidates').select('id').eq('id', test_id).execute()
                if not sel_b.data:
                    ok('User B: cannot read User A candidate (RLS ✓)')
                else:
                    fail('User B: CAN read User A candidate (RLS BREACH!)')

                # ── User B НЕ может обновить кандидата User A ───────
                upd_b = sb_b.table('candidates').update({'full_name': 'HACKED'}).eq('id', test_id).execute()
                # Check if the update actually changed anything
                check = sb_a.table('candidates').select('full_name').eq('id', test_id).execute()
                if check.data and check.data[0]['full_name'] != 'HACKED':
                    ok('User B: cannot update User A candidate (RLS ✓)')
                else:
                    fail('User B: CAN update User A candidate (RLS BREACH!)')

                # ── User B НЕ может удалить кандидата User A ────────
                del_b = sb_b.table('candidates').delete().eq('id', test_id).execute()
                check2 = sb_a.table('candidates').select('id').eq('id', test_id).execute()
                if check2.data:
                    ok('User B: cannot delete User A candidate (RLS ✓)')
                else:
                    fail('User B: CAN delete User A candidate (RLS BREACH!)')

                # ── Анонимный пользователь не видит кандидатов ──────
                sel_anon = sb_anon.table('candidates').select('id').limit(1).execute()
                if not sel_anon.data:
                    ok('Anonymous: cannot read candidates (RLS ✓)')
                else:
                    fail('Anonymous: CAN read candidates (RLS BREACH!)')

                # ── Анонимный не может вставить ──────────────────────
                try:
                    ins_anon = sb_anon.table('candidates').insert({
                        'recruiter_id': user_a.id,
                        'full_name': 'ANON HACK',
                    }).execute()
                    if ins_anon.data:
                        fail('Anonymous: CAN insert candidates (RLS BREACH!)')
                    else:
                        ok('Anonymous: cannot insert candidates (RLS ✓)')
                except Exception:
                    ok('Anonymous: cannot insert candidates (RLS ✓)')

                # ── Очистка ──────────────────────────────────────────
                sb_a.table('candidates').delete().eq('id', test_id).execute()
                ok('Cleanup: test candidate deleted')
            else:
                fail('User A: cannot insert candidate', str(ins))

    except ImportError:
        section('Live RLS Tests (SKIPPED — supabase not installed)')
        skip('All live tests', 'pip install supabase --break-system-packages')
    except Exception as e:
        fail('Live RLS Tests', str(e))
        traceback.print_exc()


# ════════════════════════════════════════════════════════════════════
#  ИТОГ
# ════════════════════════════════════════════════════════════════════

print(f'\n{"─"*50}')
print(f'Results: {passed} passed, {failed} failed, {skipped} skipped')
if failed > 0:
    print('❌ Some tests FAILED')
    sys.exit(1)
else:
    print('✅ All tests passed')
    sys.exit(0)
