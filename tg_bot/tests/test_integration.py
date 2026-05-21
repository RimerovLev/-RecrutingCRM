"""
Интеграционные тесты — работаем с реальной Supabase БД.
Все тестовые данные имеют префикс TEST_ и удаляются в teardown.
"""

import pytest
import os
import sys
import uuid
from datetime import date, timedelta, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or "fake" in SUPABASE_URL:
    pytest.skip("Нет реального Supabase подключения", allow_module_level=True)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Тестовый telegram_id — достаточно большой чтобы не конфликтовать с реальными
TEST_TG_ID = 9_000_000_001
TEST_PREFIX = "TEST_INTEGRATION_"


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Удаляем всё тестовое до и после тестов."""
    _purge_test_data()
    yield
    _purge_test_data()


def _purge_test_data():
    sb.from_("telegram_users").delete().eq("telegram_id", TEST_TG_ID).execute()
    res = sb.from_("candidates").select("id").ilike("full_name", f"{TEST_PREFIX}%").execute()
    if res.data:
        ids = [r["id"] for r in res.data]
        sb.from_("reminders").delete().in_("candidate_id", ids).execute()
        sb.from_("candidates").delete().in_("id", ids).execute()
    sb.from_("link_codes").delete().ilike("code", "TST%").execute()
    sb.from_("link_codes").delete().ilike("code", "EXP%").execute()


REAL_RECRUITER_ID = os.environ.get("RECRUITER_ID", "")


@pytest.fixture
def test_recruiter_id():
    """
    Использует реальный RECRUITER_ID из .env (уже есть в auth.users + profiles).
    Все тестовые данные помечаются префиксом TEST_ и удаляются после теста.
    Telegram user создаётся с тестовым TG_ID.
    """
    if not REAL_RECRUITER_ID:
        pytest.skip("RECRUITER_ID не задан в .env")

    rid = REAL_RECRUITER_ID

    # Чистим тестовый tg user если остался с прошлого раза
    sb.from_("telegram_users").delete().eq("telegram_id", TEST_TG_ID).execute()

    # Создаём тестового telegram user привязанного к реальному recruiter_id
    sb.from_("telegram_users").insert({
        "telegram_id": TEST_TG_ID,
        "recruiter_id": rid,
        "username": "test_bot_user",
        "full_name": "Test Integration User",
    }).execute()

    yield rid

    # Удаляем только данные с TEST_ префиксом
    cands = sb.from_("candidates").select("id").ilike("full_name", f"{TEST_PREFIX}%").eq("recruiter_id", rid).execute()
    if cands.data:
        ids = [c["id"] for c in cands.data]
        sb.from_("reminders").delete().in_("candidate_id", ids).execute()
        sb.from_("candidates").delete().in_("id", ids).execute()
    sb.from_("reminders").delete().eq("recruiter_id", rid).ilike("note", f"{TEST_PREFIX}%").execute()
    sb.from_("bot_notifications").delete().eq("recruiter_id", rid).execute()
    sb.from_("link_codes").delete().ilike("code", "TST%").execute()
    sb.from_("link_codes").delete().ilike("code", "EXP%").execute()
    sb.from_("message_templates").delete().eq("recruiter_id", rid).ilike("title", f"{TEST_PREFIX}%").execute()
    sb.from_("telegram_users").delete().eq("telegram_id", TEST_TG_ID).execute()


# ─────────────────────────────────────────────────────────────────────────────
# Импортируем bot с реальным подключением
# ─────────────────────────────────────────────────────────────────────────────
import bot as bot_module
bot_module.sb = sb  # подменяем клиент на тестовый


# ─────────────────────────────────────────────────────────────────────────────
# Тесты telegram_users
# ─────────────────────────────────────────────────────────────────────────────

class TestUserRegistration:
    def test_get_recruiter_id_returns_none_for_unknown_user(self):
        result = bot_module.get_recruiter_id(TEST_TG_ID + 999)
        assert result is None

    def test_get_or_create_creates_new_user(self, test_recruiter_id):
        # Удаляем и пересоздаём
        sb.from_("telegram_users").delete().eq("telegram_id", TEST_TG_ID).execute()
        rid = bot_module.get_or_create_user(TEST_TG_ID, "testuser", "Test User")
        assert rid is not None
        assert len(rid) == 36  # UUID формат

    def test_get_or_create_returns_existing(self, test_recruiter_id):
        # Вызываем дважды — должен вернуть тот же recruiter_id
        rid1 = bot_module.get_recruiter_id(TEST_TG_ID)
        rid2 = bot_module.get_or_create_user(TEST_TG_ID, "user", "User")
        assert rid1 == rid2

    def test_recruiter_id_is_stored_in_db(self, test_recruiter_id):
        res = sb.from_("telegram_users").select("recruiter_id").eq("telegram_id", TEST_TG_ID).execute()
        assert len(res.data) == 1
        assert res.data[0]["recruiter_id"] == test_recruiter_id


# ─────────────────────────────────────────────────────────────────────────────
# Тесты кандидатов
# ─────────────────────────────────────────────────────────────────────────────

class TestCandidates:
    def test_add_candidate_appears_in_db(self, test_recruiter_id):
        result = bot_module.add_candidate(test_recruiter_id, f"{TEST_PREFIX}Иванов Иван", "+79001234567")
        assert result is not None
        assert result["full_name"] == f"{TEST_PREFIX}Иванов Иван"

    def test_add_candidate_has_active_status(self, test_recruiter_id):
        result = bot_module.add_candidate(test_recruiter_id, f"{TEST_PREFIX}Петров Пётр")
        assert result["status"] == "active"

    def test_get_recent_candidates_returns_created(self, test_recruiter_id):
        name = f"{TEST_PREFIX}Сидоров Сидор"
        bot_module.add_candidate(test_recruiter_id, name)
        cands = bot_module.get_recent_candidates(test_recruiter_id, limit=20)
        names = [c["full_name"] for c in cands]
        assert name in names

    def test_get_recent_candidates_only_own_data(self, test_recruiter_id):
        # Добавляем своего кандидата
        bot_module.add_candidate(test_recruiter_id, f"{TEST_PREFIX}Свой Кандидат")
        cands = bot_module.get_recent_candidates(test_recruiter_id, limit=50)
        # Все кандидаты должны принадлежать нашему recruiter_id
        # Проверяем через select с recruiter_id
        ids = [c["id"] for c in cands]
        if ids:
            res = sb.from_("candidates").select("recruiter_id").in_("id", ids).execute()
            for row in res.data:
                assert row["recruiter_id"] == test_recruiter_id, \
                    f"Найден кандидат чужого рекрутера: {row['recruiter_id']}"

    def test_search_candidates_finds_by_name(self, test_recruiter_id):
        bot_module.add_candidate(test_recruiter_id, f"{TEST_PREFIX}Уникальный Кандидат")
        results = bot_module.search_candidates(test_recruiter_id, "Уникальный")
        assert len(results) > 0
        assert any("Уникальный" in c["full_name"] for c in results)

    def test_search_candidates_not_found(self, test_recruiter_id):
        results = bot_module.search_candidates(test_recruiter_id, "ХZЯ_не_существует_123")
        assert results == []

    def test_set_candidate_status(self, test_recruiter_id):
        cand = bot_module.add_candidate(test_recruiter_id, f"{TEST_PREFIX}Статус Тест")
        bot_module.set_candidate_status(cand["id"], "archive")
        res = sb.from_("candidates").select("status").eq("id", cand["id"]).execute()
        assert res.data[0]["status"] == "archive"

    def test_pipeline_stage_saved(self, test_recruiter_id):
        """Проверяем что pipeline_stage реально сохраняется в БД."""
        res = sb.from_("candidates").insert({
            "recruiter_id": test_recruiter_id,
            "full_name": f"{TEST_PREFIX}Pipeline Тест",
            "status": "active",
            "pipeline_stage": "interview",
        }).execute()
        cand_id = res.data[0]["id"]
        check = sb.from_("candidates").select("pipeline_stage").eq("id", cand_id).execute()
        assert check.data[0]["pipeline_stage"] == "interview"

    def test_tags_saved_as_array(self, test_recruiter_id):
        """Проверяем что теги сохраняются как массив."""
        res = sb.from_("candidates").insert({
            "recruiter_id": test_recruiter_id,
            "full_name": f"{TEST_PREFIX}Tags Тест",
            "status": "active",
            "tags": ["🔥 Срочно", "⭐ Топ"],
        }).execute()
        cand_id = res.data[0]["id"]
        check = sb.from_("candidates").select("tags").eq("id", cand_id).execute()
        assert "🔥 Срочно" in check.data[0]["tags"]
        assert "⭐ Топ" in check.data[0]["tags"]


# ─────────────────────────────────────────────────────────────────────────────
# Тесты напоминаний
# ─────────────────────────────────────────────────────────────────────────────

class TestReminders:
    def _create_reminder(self, rid, note, due_date, is_done=False):
        res = sb.from_("reminders").insert({
            "recruiter_id": rid,
            "note": f"{TEST_PREFIX}{note}",
            "due_date": due_date,
            "is_done": is_done,
        }).execute()
        return res.data[0]

    def test_today_reminders_includes_today(self, test_recruiter_id):
        self._create_reminder(test_recruiter_id, "Задача сегодня", date.today().isoformat())
        rems = bot_module.get_today_reminders(test_recruiter_id)
        notes = [r["note"] for r in rems]
        assert f"{TEST_PREFIX}Задача сегодня" in notes

    def test_today_reminders_includes_overdue(self, test_recruiter_id):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        self._create_reminder(test_recruiter_id, "Просрочена", yesterday)
        rems = bot_module.get_today_reminders(test_recruiter_id)
        notes = [r["note"] for r in rems]
        assert f"{TEST_PREFIX}Просрочена" in notes

    def test_today_reminders_excludes_future(self, test_recruiter_id):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        self._create_reminder(test_recruiter_id, "Завтра", tomorrow)
        rems = bot_module.get_today_reminders(test_recruiter_id)
        notes = [r["note"] for r in rems]
        assert f"{TEST_PREFIX}Завтра" not in notes

    def test_today_reminders_excludes_done(self, test_recruiter_id):
        self._create_reminder(test_recruiter_id, "Уже сделано", date.today().isoformat(), is_done=True)
        rems = bot_module.get_today_reminders(test_recruiter_id)
        notes = [r["note"] for r in rems]
        assert f"{TEST_PREFIX}Уже сделано" not in notes

    def test_mark_reminder_done(self, test_recruiter_id):
        rem = self._create_reminder(test_recruiter_id, "Пометить как выполненное", date.today().isoformat())
        bot_module.mark_reminder_done(rem["id"])
        res = sb.from_("reminders").select("is_done").eq("id", rem["id"]).execute()
        assert res.data[0]["is_done"] is True

    def test_mark_done_does_not_affect_other_reminders(self, test_recruiter_id):
        rem1 = self._create_reminder(test_recruiter_id, "Выполнить", date.today().isoformat())
        rem2 = self._create_reminder(test_recruiter_id, "Не трогать", date.today().isoformat())
        bot_module.mark_reminder_done(rem1["id"])
        res = sb.from_("reminders").select("is_done").eq("id", rem2["id"]).execute()
        assert res.data[0]["is_done"] is False

    def test_snooze_updates_due_date(self, test_recruiter_id):
        rem = self._create_reminder(test_recruiter_id, "Отложить", date.today().isoformat())
        bot_module.snooze_reminder(rem["id"], hours=24)
        res = sb.from_("reminders").select("due_date").eq("id", rem["id"]).execute()
        new_date = date.fromisoformat(res.data[0]["due_date"])
        assert new_date >= date.today()

    def test_get_all_active_excludes_done(self, test_recruiter_id):
        self._create_reminder(test_recruiter_id, "Активная задача", date.today().isoformat())
        self._create_reminder(test_recruiter_id, "Завершённая задача", date.today().isoformat(), is_done=True)
        rems = bot_module.get_all_active_reminders(test_recruiter_id)
        notes = [r["note"] for r in rems]
        assert f"{TEST_PREFIX}Активная задача" in notes
        assert f"{TEST_PREFIX}Завершённая задача" not in notes

    def test_get_all_active_only_own_data(self, test_recruiter_id):
        # Создаём своё напоминание
        self._create_reminder(test_recruiter_id, "Только моё напоминание", date.today().isoformat())
        rems = bot_module.get_all_active_reminders(test_recruiter_id)
        # Проверяем что все напоминания принадлежат нашему recruiter_id
        ids = [r["id"] for r in rems]
        if ids:
            res = sb.from_("reminders").select("recruiter_id").in_("id", ids).execute()
            for row in res.data:
                assert row["recruiter_id"] == test_recruiter_id, \
                    f"Найдено напоминание чужого рекрутера: {row['recruiter_id']}"


# ─────────────────────────────────────────────────────────────────────────────
# Тесты link codes
# ─────────────────────────────────────────────────────────────────────────────

class TestLinkCodes:
    def _create_code(self, rid, minutes_valid=15, used=False):
        code = f"TST{uuid.uuid4().hex[:3].upper()}"
        expires = (datetime.utcnow() + timedelta(minutes=minutes_valid)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sb.from_("link_codes").insert({
            "code": code,
            "recruiter_id": rid,
            "expires_at": expires,
            "used": used,
        }).execute()
        return code

    def test_valid_code_exists_in_db(self, test_recruiter_id):
        code = self._create_code(test_recruiter_id)
        res = sb.from_("link_codes").select("*").eq("code", code).execute()
        assert len(res.data) == 1
        assert res.data[0]["used"] is False

    def test_expired_code_has_past_timestamp(self, test_recruiter_id):
        expired = (datetime.utcnow() - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        code = f"EXP{uuid.uuid4().hex[:3].upper()}"
        sb.from_("link_codes").insert({
            "code": code,
            "recruiter_id": test_recruiter_id,
            "expires_at": expired,
            "used": False,
        }).execute()
        res = sb.from_("link_codes").select("expires_at").eq("code", code).execute()
        expires_at = datetime.fromisoformat(res.data[0]["expires_at"].replace("Z", "+00:00"))
        assert datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at

    def test_code_marked_used_after_linking(self, test_recruiter_id):
        code = self._create_code(test_recruiter_id)
        sb.from_("link_codes").update({"used": True}).eq("code", code).execute()
        res = sb.from_("link_codes").select("used").eq("code", code).execute()
        assert res.data[0]["used"] is True

    def test_link_updates_recruiter_id_in_telegram_users(self, test_recruiter_id):
        new_rid = str(uuid.uuid4())
        sb.from_("telegram_users").update({"recruiter_id": new_rid}).eq("telegram_id", TEST_TG_ID).execute()
        res = sb.from_("telegram_users").select("recruiter_id").eq("telegram_id", TEST_TG_ID).execute()
        assert res.data[0]["recruiter_id"] == new_rid
        # Восстанавливаем
        sb.from_("telegram_users").update({"recruiter_id": test_recruiter_id}).eq("telegram_id", TEST_TG_ID).execute()


# ─────────────────────────────────────────────────────────────────────────────
# Тесты шаблонов сообщений
# ─────────────────────────────────────────────────────────────────────────────

class TestMessageTemplates:
    def test_template_saved_and_retrievable(self, test_recruiter_id):
        sb.from_("message_templates").insert({
            "recruiter_id": test_recruiter_id,
            "title": f"{TEST_PREFIX}Приглашение",
            "body": "Здравствуйте! Приглашаем вас на собеседование.",
        }).execute()
        res = sb.from_("message_templates").select("*").eq("recruiter_id", test_recruiter_id).execute()
        assert len(res.data) >= 1
        titles = [t["title"] for t in res.data]
        assert f"{TEST_PREFIX}Приглашение" in titles

    def test_template_deleted(self, test_recruiter_id):
        res = sb.from_("message_templates").insert({
            "recruiter_id": test_recruiter_id,
            "title": f"{TEST_PREFIX}Удалить меня",
            "body": "Test body",
        }).execute()
        tid = res.data[0]["id"]
        sb.from_("message_templates").delete().eq("id", tid).execute()
        check = sb.from_("message_templates").select("id").eq("id", tid).execute()
        assert len(check.data) == 0

    def test_template_body_preserved(self, test_recruiter_id):
        body = "Уважаемый {имя}, мы рады предложить вам должность {должность}."
        res = sb.from_("message_templates").insert({
            "recruiter_id": test_recruiter_id,
            "title": f"{TEST_PREFIX}Оффер",
            "body": body,
        }).execute()
        tid = res.data[0]["id"]
        check = sb.from_("message_templates").select("body").eq("id", tid).execute()
        assert check.data[0]["body"] == body


# ─────────────────────────────────────────────────────────────────────────────
# Тесты bot_notifications
# ─────────────────────────────────────────────────────────────────────────────

class TestBotNotifications:
    def test_notification_created(self, test_recruiter_id):
        res = sb.from_("bot_notifications").insert({
            "recruiter_id": test_recruiter_id,
            "type": "status_changed",
            "payload": {"candidate_name": f"{TEST_PREFIX}Кандидат", "old_status": "active", "new_status": "archive"},
            "sent": False,
        }).execute()
        nid = res.data[0]["id"]
        check = sb.from_("bot_notifications").select("*").eq("id", nid).execute()
        assert check.data[0]["sent"] is False
        assert check.data[0]["type"] == "status_changed"

    def test_notification_marked_sent(self, test_recruiter_id):
        res = sb.from_("bot_notifications").insert({
            "recruiter_id": test_recruiter_id,
            "type": "status_changed",
            "payload": {"candidate_name": "Test", "old_status": "active", "new_status": "in_work"},
            "sent": False,
        }).execute()
        nid = res.data[0]["id"]
        sb.from_("bot_notifications").update({"sent": True}).eq("id", nid).execute()
        check = sb.from_("bot_notifications").select("sent").eq("id", nid).execute()
        assert check.data[0]["sent"] is True

    def test_unsent_notifications_query(self, test_recruiter_id):
        # Добавляем отправленное и неотправленное
        sb.from_("bot_notifications").insert({
            "recruiter_id": test_recruiter_id,
            "type": "status_changed",
            "payload": {"x": 1},
            "sent": True,
        }).execute()
        res = sb.from_("bot_notifications").insert({
            "recruiter_id": test_recruiter_id,
            "type": "status_changed",
            "payload": {"x": 2},
            "sent": False,
        }).execute()
        nid = res.data[0]["id"]

        unsent = sb.from_("bot_notifications").select("id").eq("sent", False).eq("recruiter_id", test_recruiter_id).execute()
        ids = [n["id"] for n in unsent.data]
        assert nid in ids


# ─────────────────────────────────────────────────────────────────────────────
# Тесты get_all_users
# ─────────────────────────────────────────────────────────────────────────────

class TestGetAllUsers:
    def test_returns_registered_user(self, test_recruiter_id):
        users = bot_module.get_all_users()
        tg_ids = [u["telegram_id"] for u in users]
        assert TEST_TG_ID in tg_ids

    def test_returns_recruiter_id_for_user(self, test_recruiter_id):
        users = bot_module.get_all_users()
        user = next((u for u in users if u["telegram_id"] == TEST_TG_ID), None)
        assert user is not None
        assert user["recruiter_id"] == test_recruiter_id
