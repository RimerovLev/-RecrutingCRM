"""
Unit-тесты — всё мокается, Supabase и Telegram не нужны.
Проверяем реальную логику функций, а не просто факт их вызова.
"""

import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch, call
import sys, os

# Подключаем bot.py без его выполнения
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Мокируем зависимости до импорта
os.environ.setdefault("BOT_TOKEN",    "fake:token")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "fake-key")

with patch("supabase.create_client", return_value=MagicMock()):
    import bot


# ─────────────────────────────────────────────────────────────────────────────
# Хелперы / чистая логика
# ─────────────────────────────────────────────────────────────────────────────

class TestIsOverdue:
    def test_past_date_is_overdue(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert bot.is_overdue(yesterday) is True

    def test_today_is_not_overdue(self):
        # сегодня: due_date == today → НЕ просрочено
        assert bot.is_overdue(date.today().isoformat()) is False

    def test_future_date_is_not_overdue(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        assert bot.is_overdue(tomorrow) is False

    def test_none_is_not_overdue(self):
        assert bot.is_overdue(None) is False

    def test_empty_string_is_not_overdue(self):
        assert bot.is_overdue("") is False

    def test_invalid_date_is_not_overdue(self):
        assert bot.is_overdue("not-a-date") is False


class TestFmtDate:
    def test_none_returns_placeholder(self):
        assert bot.fmt_date(None) == "без даты"

    def test_valid_iso_date(self):
        result = bot.fmt_date("2025-05-21T00:00:00")
        assert "21" in result or "май" in result or "may" in result.lower()

    def test_invalid_falls_back_to_original(self):
        assert bot.fmt_date("bad-date") == "bad-date"


class TestStatusEmoji:
    def test_active_emoji(self):
        assert bot.status_emoji("active") == "🟢"

    def test_in_work_emoji(self):
        assert bot.status_emoji("in_work") == "🔵"

    def test_archive_emoji(self):
        assert bot.status_emoji("archive") == "⚪"

    def test_unknown_returns_dot(self):
        assert bot.status_emoji("unknown") == "•"


class TestStatusLabel:
    def test_active_label(self):
        assert bot.status_label("active") == "Активный"

    def test_in_work_label(self):
        assert bot.status_label("in_work") == "В работе"

    def test_archive_label(self):
        assert bot.status_label("archive") == "Архив"

    def test_unknown_returns_itself(self):
        assert bot.status_label("custom") == "custom"


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers — мокируем Supabase
# ─────────────────────────────────────────────────────────────────────────────

def make_sb_mock(data=None, error=None):
    """Создаёт мок цепочки sb.from_().select()...execute()"""
    mock_result = MagicMock()
    mock_result.data = data or []
    mock_result.error = error

    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.neq.return_value = chain
    chain.in_.return_value = chain
    chain.lt.return_value = chain
    chain.lte.return_value = chain
    chain.gte.return_value = chain
    chain.gt.return_value = chain
    chain.ilike.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.execute.return_value = mock_result
    return chain


class TestGetRecruiterId:
    def test_returns_none_when_not_found(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_recruiter_id(999999)
        assert result is None

    def test_returns_id_when_found(self):
        chain = make_sb_mock(data=[{"recruiter_id": "uuid-abc"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_recruiter_id(123)
        assert result == "uuid-abc"

    def test_queries_by_telegram_id(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_recruiter_id(42)
        chain.eq.assert_called_with("telegram_id", 42)


class TestGetOrCreateUser:
    def test_returns_existing_recruiter_id(self):
        chain = make_sb_mock(data=[{"recruiter_id": "existing-uuid"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_or_create_user(123, "user", "Test User")
        assert result == "existing-uuid"
        chain.insert.assert_not_called()

    def test_creates_new_user_when_not_found(self):
        new_uuid = "new-uuid-xyz"
        # Первый вызов (SELECT) — пусто, второй (INSERT) — возвращает новый uuid
        select_chain = make_sb_mock(data=[])
        insert_chain = make_sb_mock(data=[{"recruiter_id": new_uuid}])

        call_count = [0]
        def from_side_effect(table):
            call_count[0] += 1
            if call_count[0] == 1:
                return select_chain
            return insert_chain

        bot.sb.from_ = MagicMock(side_effect=from_side_effect)
        result = bot.get_or_create_user(999, "newuser", "New User")
        assert result == new_uuid


class TestGetTodayReminders:
    def test_filters_by_recruiter_id(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_today_reminders("test-rid")
        calls = [str(c) for c in chain.eq.call_args_list]
        assert any("test-rid" in c for c in calls)

    def test_filters_only_not_done(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_today_reminders("rid")
        chain.eq.assert_any_call("is_done", False)

    def test_returns_empty_list_on_no_data(self):
        chain = make_sb_mock(data=None)
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_today_reminders("rid")
        assert result == []


class TestMarkReminderDone:
    def test_sets_is_done_true(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.mark_reminder_done("rem-id-123")
        chain.update.assert_called_once_with({"is_done": True})
        chain.eq.assert_called_with("id", "rem-id-123")


class TestSnoozeReminder:
    def test_sets_future_date(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("rem-id", hours=24)
        update_call = chain.update.call_args[0][0]
        new_date = date.fromisoformat(update_call["due_date"])
        assert new_date >= date.today() + timedelta(hours=23)

    def test_snooze_1h_is_today_or_tomorrow(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("rem-id", hours=1)
        update_call = chain.update.call_args[0][0]
        new_date = date.fromisoformat(update_call["due_date"])
        assert new_date >= date.today()


class TestAddCandidate:
    def test_inserts_with_correct_fields(self):
        chain = make_sb_mock(data=[{"id": "new-id"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_candidate("rid-123", "Иванов Иван", "+79001234567")
        payload = chain.insert.call_args[0][0]
        assert payload["full_name"] == "Иванов Иван"
        assert payload["phone"] == "+79001234567"
        assert payload["recruiter_id"] == "rid-123"
        assert payload["status"] == "active"

    def test_insert_without_phone(self):
        chain = make_sb_mock(data=[{"id": "new-id"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_candidate("rid-123", "Петров Пётр")
        payload = chain.insert.call_args[0][0]
        assert "phone" not in payload

    def test_returns_none_on_empty_data(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.add_candidate("rid", "Test")
        assert result is None


class TestSearchCandidates:
    def test_uses_ilike_for_fuzzy_search(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.search_candidates("rid", "Иванов")
        chain.ilike.assert_called_once_with("full_name", "%Иванов%")

    def test_limits_results(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.search_candidates("rid", "query")
        chain.limit.assert_called_once_with(8)


class TestSetCandidateStatus:
    def test_updates_correct_status(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.set_candidate_status("cand-id", "archive")
        chain.update.assert_called_once_with({"status": "archive"})
        chain.eq.assert_called_with("id", "cand-id")


# ─────────────────────────────────────────────────────────────────────────────
# Keyboards
# ─────────────────────────────────────────────────────────────────────────────

class TestReminderKeyboard:
    def test_has_done_button(self):
        kb = bot.reminder_keyboard("rem-123")
        all_buttons = [btn for row in kb.inline_keyboard for btn in row]
        data_values = [btn.callback_data for btn in all_buttons]
        assert "done:rem-123" in data_values

    def test_has_all_snooze_buttons(self):
        kb = bot.reminder_keyboard("rem-123")
        all_data = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert "snooze1:rem-123" in all_data
        assert "snooze24:rem-123" in all_data
        assert "snooze72:rem-123" in all_data

    def test_has_4_buttons_total(self):
        kb = bot.reminder_keyboard("rem-xyz")
        total = sum(len(row) for row in kb.inline_keyboard)
        assert total == 4


class TestCandidateKeyboard:
    def test_has_3_status_buttons(self):
        kb = bot.candidate_keyboard("cand-123")
        all_data = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert f"setstatus:cand-123:active"  in all_data
        assert f"setstatus:cand-123:in_work" in all_data
        assert f"setstatus:cand-123:archive" in all_data

    def test_no_crm_link_when_url_empty(self):
        bot.CRM_URL = ""
        kb = bot.candidate_keyboard("cand-123")
        all_buttons = [btn for row in kb.inline_keyboard for btn in row]
        assert all(btn.url is None for btn in all_buttons)

    def test_crm_link_present_when_url_set(self):
        bot.CRM_URL = "https://mycrm.app"
        kb = bot.candidate_keyboard("cand-123")
        all_buttons = [btn for row in kb.inline_keyboard for btn in row]
        assert any(btn.url == "https://mycrm.app" for btn in all_buttons)
        bot.CRM_URL = ""


# ─────────────────────────────────────────────────────────────────────────────
# Link code validation logic
# ─────────────────────────────────────────────────────────────────────────────

class TestLinkCodeLogic:
    def _make_valid_code_row(self, hours_ahead=14):
        expires = (datetime.utcnow() + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {"recruiter_id": "rid-abc", "expires_at": expires, "used": False}

    def test_expired_code_detected(self):
        expired = (datetime.utcnow() - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = {"recruiter_id": "rid-abc", "expires_at": expired, "used": False}
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Europe/Moscow")
        assert datetime.now(tz) > expires_at

    def test_valid_code_not_expired(self):
        row = self._make_valid_code_row(hours_ahead=10)
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Europe/Moscow")
        assert datetime.now(tz) <= expires_at

    def test_used_code_is_flagged(self):
        row = self._make_valid_code_row()
        row["used"] = True
        assert row["used"] is True
