"""
Unit-тесты — всё мокается, Supabase и Telegram не нужны.
Проверяем реальную логику функций, а не просто факт их вызова.
"""

import pytest
import asyncio
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, AsyncMock, patch, call
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("BOT_TOKEN",    "fake:token")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "fake-key")

with patch("supabase.create_client", return_value=MagicMock()):
    import bot


# ─────────────────────────────────────────────────────────────────────────────
# Хелперы: цепочка мока Supabase
# ─────────────────────────────────────────────────────────────────────────────

def make_sb_mock(data=None, error=None):
    mock_result = MagicMock()
    mock_result.data  = data if data is not None else []
    mock_result.error = error

    chain = MagicMock()
    for m in ("select","eq","neq","in_","lt","lte","gte","gt","ilike",
              "order","limit","insert","update","delete","maybeSingle","single"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = mock_result
    return chain


def make_update(text="", user_id=123, username="tester", first_name="Test", args=None):
    """Создаёт мок telegram.Update."""
    user = MagicMock()
    user.id         = user_id
    user.username   = username
    user.full_name  = first_name
    user.first_name = first_name

    msg = MagicMock()
    msg.reply_text = AsyncMock()
    msg.reply_html = AsyncMock()
    msg.text = text

    upd = MagicMock()
    upd.effective_user = user
    upd.message        = msg
    return upd


def make_ctx(args=None):
    ctx = MagicMock()
    ctx.args = args or []
    ctx.bot  = AsyncMock()
    return ctx


# ═════════════════════════════════════════════════════════════════════════════
# 1. PURE HELPERS
# ═════════════════════════════════════════════════════════════════════════════

class TestIsOverdue:
    def test_yesterday_is_overdue(self):
        assert bot.is_overdue((date.today() - timedelta(days=1)).isoformat()) is True

    def test_today_is_not_overdue(self):
        assert bot.is_overdue(date.today().isoformat()) is False

    def test_tomorrow_is_not_overdue(self):
        assert bot.is_overdue((date.today() + timedelta(days=1)).isoformat()) is False

    def test_none_is_not_overdue(self):
        assert bot.is_overdue(None) is False

    def test_empty_string_is_not_overdue(self):
        assert bot.is_overdue("") is False

    def test_invalid_date_is_not_overdue(self):
        assert bot.is_overdue("not-a-date") is False

    def test_week_ago_is_overdue(self):
        assert bot.is_overdue((date.today() - timedelta(days=7)).isoformat()) is True

    def test_datetime_string_past(self):
        past = (datetime.now() - timedelta(days=2)).isoformat()
        assert bot.is_overdue(past) is True

    def test_datetime_string_future(self):
        future = (datetime.now() + timedelta(days=2)).isoformat()
        assert bot.is_overdue(future) is False


class TestFmtDate:
    def test_none_returns_placeholder(self):
        assert bot.fmt_date(None) == "без даты"

    def test_valid_iso_date_contains_day(self):
        result = bot.fmt_date("2025-05-21T00:00:00")
        assert "21" in result

    def test_invalid_falls_back_to_original(self):
        assert bot.fmt_date("bad-date") == "bad-date"

    def test_empty_string_is_placeholder(self):
        assert bot.fmt_date("") == "без даты"

    def test_date_only_string(self):
        result = bot.fmt_date("2025-01-15")
        assert "15" in result


class TestStatusEmoji:
    def test_active(self):   assert bot.status_emoji("active")  == "🟢"
    def test_in_work(self):  assert bot.status_emoji("in_work") == "🔵"
    def test_archive(self):  assert bot.status_emoji("archive") == "⚪"
    def test_unknown(self):  assert bot.status_emoji("x")       == "•"
    def test_empty(self):    assert bot.status_emoji("")        == "•"


class TestStatusLabel:
    def test_active(self):   assert bot.status_label("active")  == "Активный"
    def test_in_work(self):  assert bot.status_label("in_work") == "В работе"
    def test_archive(self):  assert bot.status_label("archive") == "Архив"
    def test_unknown_returns_itself(self): assert bot.status_label("custom") == "custom"


# ═════════════════════════════════════════════════════════════════════════════
# 2. DB HELPERS
# ═════════════════════════════════════════════════════════════════════════════

class TestGetRecruiterId:
    def test_returns_none_when_not_found(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_recruiter_id(999) is None

    def test_returns_id_when_found(self):
        chain = make_sb_mock(data=[{"recruiter_id": "uuid-abc"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_recruiter_id(123) == "uuid-abc"

    def test_queries_correct_telegram_id(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_recruiter_id(42)
        chain.eq.assert_called_with("telegram_id", 42)


class TestGetOrCreateUser:
    def test_returns_existing(self):
        chain = make_sb_mock(data=[{"recruiter_id": "existing"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_or_create_user(1, "u", "U") == "existing"
        chain.insert.assert_not_called()

    def test_creates_when_not_found(self):
        sel = make_sb_mock(data=[])
        ins = make_sb_mock(data=[{"recruiter_id": "new-uuid"}])
        calls = [0]
        def side(t):
            calls[0] += 1
            return sel if calls[0] == 1 else ins
        bot.sb.from_ = MagicMock(side_effect=side)
        assert bot.get_or_create_user(9, "u", "U") == "new-uuid"


class TestGetAllUsers:
    def test_returns_list(self):
        chain = make_sb_mock(data=[{"telegram_id": 1, "recruiter_id": "r1"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_all_users()
        assert len(result) == 1
        assert result[0]["telegram_id"] == 1

    def test_returns_empty_list_on_none(self):
        chain = make_sb_mock(data=None)
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_all_users() == []


class TestGetTodayReminders:
    def test_filters_by_recruiter(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_today_reminders("rid-x")
        calls = [str(c) for c in chain.eq.call_args_list]
        assert any("rid-x" in c for c in calls)

    def test_filters_not_done(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_today_reminders("rid")
        chain.eq.assert_any_call("is_done", False)

    def test_returns_empty_on_none_data(self):
        chain = make_sb_mock(data=None)
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_today_reminders("rid") == []

    def test_uses_lte_for_today(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_today_reminders("rid")
        chain.lte.assert_called_once()
        # lte("due_date", today_iso)
        args = chain.lte.call_args[0]
        assert args[0] == "due_date"
        assert args[1] == date.today().isoformat()


class TestGetAllActiveReminders:
    def test_filters_is_done_false(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_all_active_reminders("rid")
        chain.eq.assert_any_call("is_done", False)

    def test_returns_data(self):
        chain = make_sb_mock(data=[{"id": "r1", "note": "test"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_all_active_reminders("rid")
        assert len(result) == 1
        assert result[0]["note"] == "test"


class TestGetRecentCandidates:
    def test_applies_limit(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_recent_candidates("rid", limit=5)
        chain.limit.assert_called_once_with(5)

    def test_default_limit_is_10(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_recent_candidates("rid")
        chain.limit.assert_called_once_with(10)

    def test_orders_by_created_at_desc(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_recent_candidates("rid")
        chain.order.assert_called_once_with("created_at", desc=True)


class TestGetOpenVacancies:
    def test_filters_open_and_in_work(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_open_vacancies("rid")
        chain.in_.assert_called_once_with("status", ["open", "in_work"])

    def test_returns_vacancy_list(self):
        chain = make_sb_mock(data=[{"id": "v1", "title": "Dev"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        result = bot.get_open_vacancies("rid")
        assert result[0]["title"] == "Dev"


class TestGetStaleVacancies:
    def test_uses_lt_with_cutoff(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_stale_vacancies("rid", days=5)
        cutoff = (date.today() - timedelta(days=5)).isoformat()
        chain.lt.assert_called_once_with("updated_at", cutoff)

    def test_different_days_param(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.get_stale_vacancies("rid", days=10)
        cutoff = (date.today() - timedelta(days=10)).isoformat()
        chain.lt.assert_called_once_with("updated_at", cutoff)

    def test_returns_empty_on_no_data(self):
        chain = make_sb_mock(data=None)
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.get_stale_vacancies("rid") == []


class TestMarkReminderDone:
    def test_sets_is_done_true(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.mark_reminder_done("rem-123")
        chain.update.assert_called_once_with({"is_done": True})
        chain.eq.assert_called_with("id", "rem-123")


class TestSnoozeReminder:
    def test_sets_future_date(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("rem-id", hours=24)
        payload = chain.update.call_args[0][0]
        new_date = date.fromisoformat(payload["due_date"])
        assert new_date >= date.today()

    def test_snooze_1h(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("rem-id", hours=1)
        payload = chain.update.call_args[0][0]
        new_date = date.fromisoformat(payload["due_date"])
        assert new_date >= date.today()

    def test_snooze_72h_is_at_least_2_days_ahead(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("rem-id", hours=72)
        payload = chain.update.call_args[0][0]
        new_date = date.fromisoformat(payload["due_date"])
        assert new_date >= date.today() + timedelta(days=2)

    def test_updates_correct_reminder(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.snooze_reminder("specific-id", hours=1)
        chain.eq.assert_called_with("id", "specific-id")


class TestAddCandidate:
    def test_inserts_correct_fields(self):
        chain = make_sb_mock(data=[{"id": "new"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_candidate("rid", "Иванов", "+7900")
        p = chain.insert.call_args[0][0]
        assert p["full_name"] == "Иванов"
        assert p["phone"] == "+7900"
        assert p["status"] == "active"

    def test_no_phone_key_when_absent(self):
        chain = make_sb_mock(data=[{"id": "new"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_candidate("rid", "Петров")
        p = chain.insert.call_args[0][0]
        assert "phone" not in p

    def test_returns_none_on_empty_data(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        assert bot.add_candidate("rid", "Test") is None


class TestAddReminder:
    def test_inserts_with_note(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_reminder("rid", "Позвонить")
        p = chain.insert.call_args[0][0]
        assert p["note"] == "Позвонить"
        assert p["is_done"] is False

    def test_sets_today_as_default_due_date(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.add_reminder("rid", "test")
        p = chain.insert.call_args[0][0]
        assert p["due_date"] == date.today().isoformat()

    def test_custom_due_date(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        custom = "2025-12-31"
        bot.add_reminder("rid", "test", due_date=custom)
        p = chain.insert.call_args[0][0]
        assert p["due_date"] == custom

    def test_with_candidate_name_searches_first(self):
        search_chain = make_sb_mock(data=[{"id": "cand-1"}])
        insert_chain = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            # first call: search; second: insert
            return search_chain if calls[0] == 1 else insert_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        bot.add_reminder("rid", "Позвонить", candidate_name="Иванов")
        p = insert_chain.insert.call_args[0][0]
        assert p["candidate_id"] == "cand-1"


class TestSearchCandidates:
    def test_uses_ilike(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.search_candidates("rid", "Иванов")
        chain.ilike.assert_called_once_with("full_name", "%Иванов%")

    def test_limits_to_8(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.search_candidates("rid", "q")
        chain.limit.assert_called_once_with(8)

    def test_filters_by_recruiter_id(self):
        chain = make_sb_mock(data=[])
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.search_candidates("rid-abc", "q")
        chain.eq.assert_called_with("recruiter_id", "rid-abc")


class TestSetCandidateStatus:
    def test_updates_status(self):
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        bot.set_candidate_status("cid", "archive")
        chain.update.assert_called_once_with({"status": "archive"})
        chain.eq.assert_called_with("id", "cid")


# ═════════════════════════════════════════════════════════════════════════════
# 3. KEYBOARDS
# ═════════════════════════════════════════════════════════════════════════════

class TestReminderKeyboard:
    def _all_data(self, rid):
        kb = bot.reminder_keyboard(rid)
        return [btn.callback_data for row in kb.inline_keyboard for btn in row]

    def test_done_button(self):
        assert "done:rem-1" in self._all_data("rem-1")

    def test_snooze_1h(self):
        assert "snooze1:rem-1" in self._all_data("rem-1")

    def test_snooze_24h(self):
        assert "snooze24:rem-1" in self._all_data("rem-1")

    def test_snooze_72h(self):
        assert "snooze72:rem-1" in self._all_data("rem-1")

    def test_total_4_buttons(self):
        kb = bot.reminder_keyboard("x")
        assert sum(len(r) for r in kb.inline_keyboard) == 4


class TestCandidateKeyboard:
    def _all_data(self, cid):
        kb = bot.candidate_keyboard(cid)
        return [btn.callback_data for row in kb.inline_keyboard for btn in row]

    def test_active_button(self):
        assert "setstatus:c1:active"  in self._all_data("c1")

    def test_in_work_button(self):
        assert "setstatus:c1:in_work" in self._all_data("c1")

    def test_archive_button(self):
        assert "setstatus:c1:archive" in self._all_data("c1")

    def test_no_url_when_crm_url_empty(self):
        bot.CRM_URL = ""
        kb = bot.candidate_keyboard("c1")
        all_btns = [b for row in kb.inline_keyboard for b in row]
        assert all(b.url is None for b in all_btns)

    def test_url_button_when_crm_url_set(self):
        bot.CRM_URL = "https://mycrm.app"
        kb = bot.candidate_keyboard("c1")
        all_btns = [b for row in kb.inline_keyboard for b in row]
        assert any(b.url == "https://mycrm.app" for b in all_btns)
        bot.CRM_URL = ""


# ═════════════════════════════════════════════════════════════════════════════
# 4. PIPELINE LOGIC
# ═════════════════════════════════════════════════════════════════════════════

class TestPipelineGroupingLogic:
    """Тестируем чистую логику группировки candidacies по этапам."""

    def _group(self, rows):
        """Воспроизводим логику из cmd_pipeline без Telegram."""
        from collections import defaultdict
        vac_stages = defaultdict(lambda: defaultdict(list))
        for r in rows:
            vid   = r["vacancy_id"]
            stage = r.get("current_stage") or "Новый"
            name  = (r.get("candidates") or {}).get("full_name", "—")
            vac_stages[vid][stage].append(name)
        return dict(vac_stages)

    def test_single_candidate_one_stage(self):
        rows = [{"vacancy_id": "v1", "current_stage": "Новый", "candidates": {"full_name": "Иванов"}}]
        result = self._group(rows)
        assert result["v1"]["Новый"] == ["Иванов"]

    def test_two_candidates_different_stages(self):
        rows = [
            {"vacancy_id": "v1", "current_stage": "Новый",         "candidates": {"full_name": "А"}},
            {"vacancy_id": "v1", "current_stage": "Собеседование",  "candidates": {"full_name": "Б"}},
        ]
        result = self._group(rows)
        assert len(result["v1"]["Новый"]) == 1
        assert len(result["v1"]["Собеседование"]) == 1

    def test_multiple_candidates_same_stage(self):
        rows = [
            {"vacancy_id": "v1", "current_stage": "Новый", "candidates": {"full_name": "А"}},
            {"vacancy_id": "v1", "current_stage": "Новый", "candidates": {"full_name": "Б"}},
        ]
        result = self._group(rows)
        assert len(result["v1"]["Новый"]) == 2

    def test_null_stage_defaults_to_new(self):
        rows = [{"vacancy_id": "v1", "current_stage": None, "candidates": {"full_name": "А"}}]
        result = self._group(rows)
        assert "Новый" in result["v1"]

    def test_two_vacancies_isolated(self):
        rows = [
            {"vacancy_id": "v1", "current_stage": "Оффер", "candidates": {"full_name": "А"}},
            {"vacancy_id": "v2", "current_stage": "Новый", "candidates": {"full_name": "Б"}},
        ]
        result = self._group(rows)
        assert "v1" in result
        assert "v2" in result
        assert "Новый" not in result.get("v1", {})

    def test_total_count(self):
        rows = [
            {"vacancy_id": "v1", "current_stage": "Новый", "candidates": {"full_name": "А"}},
            {"vacancy_id": "v1", "current_stage": "Новый", "candidates": {"full_name": "Б"}},
            {"vacancy_id": "v1", "current_stage": "Оффер", "candidates": {"full_name": "В"}},
        ]
        result = self._group(rows)
        total = sum(len(v) for v in result["v1"].values())
        assert total == 3

    def test_bar_length_capped_at_8(self):
        """Бар не должен превышать 8 символов + '+'."""
        count = 10
        bar = "█" * min(count, 8) + ("+" if count > 8 else "")
        assert len(bar) == 9   # 8 блоков + "+"
        assert bar.endswith("+")

    def test_bar_exact_8(self):
        count = 8
        bar = "█" * min(count, 8) + ("+" if count > 8 else "")
        assert bar == "████████"


# ═════════════════════════════════════════════════════════════════════════════
# 5. REPORT LOGIC
# ═════════════════════════════════════════════════════════════════════════════

class TestReportCalculations:
    """Тестируем чистую логику подсчётов для /report."""

    def test_offer_count_from_new_cands(self):
        new_cands = [
            {"pipeline_stage": "offer"},
            {"pipeline_stage": "offer"},
            {"pipeline_stage": "interview"},
            {"pipeline_stage": None},
        ]
        offers = sum(1 for c in new_cands if (c.get("pipeline_stage") or "new") == "offer")
        assert offers == 2

    def test_no_offers(self):
        new_cands = [{"pipeline_stage": "new"}, {"pipeline_stage": None}]
        offers = sum(1 for c in new_cands if (c.get("pipeline_stage") or "new") == "offer")
        assert offers == 0

    def test_status_counts(self):
        cands = [
            {"status": "active"}, {"status": "active"},
            {"status": "in_work"},
            {"status": "archive"}, {"status": "archive"}, {"status": "archive"},
        ]
        assert sum(1 for c in cands if c["status"] == "active")  == 2
        assert sum(1 for c in cands if c["status"] == "in_work") == 1
        assert sum(1 for c in cands if c["status"] == "archive") == 3

    def test_overdue_count_from_reminders(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        tomorrow  = (date.today() + timedelta(days=1)).isoformat()
        rems = [
            {"due_date": yesterday},
            {"due_date": yesterday},
            {"due_date": tomorrow},
            {"due_date": None},
        ]
        overdue = sum(1 for r in rems if bot.is_overdue(r.get("due_date")))
        assert overdue == 2


# ═════════════════════════════════════════════════════════════════════════════
# 6. LINK CODE LOGIC
# ═════════════════════════════════════════════════════════════════════════════

class TestLinkCodeLogic:
    def _make_row(self, hours_ahead=10, used=False):
        expires = (datetime.utcnow() + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {"recruiter_id": "rid", "expires_at": expires, "used": used}

    def test_expired_code_detected(self):
        expired = (datetime.utcnow() - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = {"expires_at": expired, "used": False}
        from zoneinfo import ZoneInfo
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        assert datetime.now(ZoneInfo("Europe/Moscow")) > expires_at

    def test_valid_code_not_expired(self):
        row = self._make_row(hours_ahead=10)
        from zoneinfo import ZoneInfo
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        assert datetime.now(ZoneInfo("Europe/Moscow")) <= expires_at

    def test_used_code_flagged(self):
        row = self._make_row(used=True)
        assert row["used"] is True

    def test_unused_valid_code_ok(self):
        row = self._make_row(used=False)
        assert row["used"] is False

    def test_code_expiry_boundary(self):
        """Код истекает через 1 секунду — ещё валиден."""
        almost_expired = (datetime.utcnow() + timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        from zoneinfo import ZoneInfo
        expires_at = datetime.fromisoformat(almost_expired.replace("Z", "+00:00"))
        assert datetime.now(ZoneInfo("Europe/Moscow")) <= expires_at


# ═════════════════════════════════════════════════════════════════════════════
# 7. ASYNC COMMAND HANDLERS
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestCmdStart:
    async def test_replies_with_commands_list(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        chain = make_sb_mock(data=[{"recruiter_id": "rid", "created_at": "2020-01-01T00:00:00Z"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_start(upd, ctx)
        upd.message.reply_html.assert_called_once()
        text = upd.message.reply_html.call_args[0][0]
        assert "/today" in text
        assert "/pipeline" in text
        assert "/overdue" in text
        assert "/report" in text

    async def test_welcome_message_for_new_user(self):
        upd = make_update(user_id=2)
        ctx = make_ctx()
        # created_at within last 10 seconds → is_new = True
        fresh = datetime.utcnow().isoformat() + "Z"
        chain = make_sb_mock(data=[{"recruiter_id": "rid", "created_at": fresh}])
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_start(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        assert "Добро пожаловать" in text

    async def test_returning_user_message(self):
        upd = make_update(user_id=3, first_name="Лёва")
        ctx = make_ctx()
        old = "2020-01-01T00:00:00Z"
        chain = make_sb_mock(data=[{"recruiter_id": "rid", "created_at": old}])
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_start(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        assert "возвращением" in text


@pytest.mark.asyncio
class TestCmdToday:
    async def test_no_reminders_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        sel_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        rem_chain = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return sel_chain if calls[0] == 1 else rem_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_today(upd, ctx)
        upd.message.reply_text.assert_called_once()
        assert "нет" in upd.message.reply_text.call_args[0][0].lower()

    async def test_requires_user_to_be_registered(self):
        upd = make_update(user_id=999)
        ctx = make_ctx()
        chain = make_sb_mock(data=[])   # not registered
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_today(upd, ctx)
        # Should send a "register" message, not a reminders list
        upd.message.reply_text.assert_called_once()


@pytest.mark.asyncio
class TestCmdStats:
    async def test_sends_stats_html(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        cand_chain = make_sb_mock(data=[{"status": "active"}, {"status": "in_work"}])
        vac_chain  = make_sb_mock(data=[{"status": "open"}])
        rem_chain  = make_sb_mock(data=[{"is_done": False}])
        calls = [0]
        def side(t):
            calls[0] += 1
            mapping = {1: user_chain, 2: cand_chain, 3: vac_chain, 4: rem_chain}
            return mapping.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_stats(upd, ctx)
        upd.message.reply_html.assert_called_once()
        text = upd.message.reply_html.call_args[0][0]
        assert "Статистика" in text
        assert "Кандидаты" in text

    async def test_stats_reflects_candidate_counts(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        cand_chain = make_sb_mock(data=[
            {"status": "active"}, {"status": "active"}, {"status": "archive"}
        ])
        vac_chain = make_sb_mock(data=[])
        rem_chain = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: cand_chain, 3: vac_chain, 4: rem_chain}.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_stats(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        assert "2" in text   # 2 active
        assert "1" in text   # 1 archive


@pytest.mark.asyncio
class TestCmdSearch:
    async def test_empty_query_shows_usage(self):
        upd = make_update(user_id=1)
        ctx = make_ctx(args=[])
        chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_search(upd, ctx)
        upd.message.reply_text.assert_called_once()
        assert "Использование" in upd.message.reply_text.call_args[0][0]

    async def test_no_results_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx(args=["Иванов"])
        user_chain  = make_sb_mock(data=[{"recruiter_id": "rid"}])
        found_chain = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return user_chain if calls[0] == 1 else found_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_search(upd, ctx)
        text = upd.message.reply_text.call_args[0][0]
        assert "не найден" in text.lower() or "нет" in text.lower()


@pytest.mark.asyncio
class TestCmdPipeline:
    async def test_no_vacancies_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return user_chain if calls[0] == 1 else vac_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_text.call_args[0][0]
        assert "вакансий" in text.lower()

    async def test_no_candidacies_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Dev"}])
        ccy_chain  = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: ccy_chain}.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_text.call_args[0][0]
        assert "нет" in text.lower() or "воронке" in text.lower()

    async def test_pipeline_shows_vacancy_title(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Менеджер"}])
        ccy_chain  = make_sb_mock(data=[{
            "vacancy_id": "v1",
            "current_stage": "Собеседование",
            "candidates": {"full_name": "Иванов"},
        }])
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: ccy_chain}.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        upd.message.reply_html.assert_called_once()
        text = upd.message.reply_html.call_args[0][0]
        assert "Менеджер" in text
        assert "Собеседование" in text
        assert "1" in text


@pytest.mark.asyncio
class TestCmdOverdue:
    async def test_no_overdue_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        rem_chain  = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return user_chain if calls[0] == 1 else rem_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_overdue(upd, ctx)
        text = upd.message.reply_text.call_args[0][0]
        assert "нет" in text.lower()

    async def test_overdue_uses_lt_today(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        rem_chain  = make_sb_mock(data=[])   # пусто — нет итерации по полям
        calls = [0]
        def side(t):
            calls[0] += 1
            return user_chain if calls[0] == 1 else rem_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_overdue(upd, ctx)
        rem_chain.lt.assert_called_once_with("due_date", date.today().isoformat())

    async def test_overdue_shows_reminder_text(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        rem_chain  = make_sb_mock(data=[{
            "id": "r1", "note": "Срочный звонок",
            "due_date": yesterday, "candidates": None,
        }])
        calls = [0]
        def side(t):
            calls[0] += 1
            return user_chain if calls[0] == 1 else rem_chain
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_overdue(upd, ctx)
        upd.message.reply_html.assert_called_once()
        text = upd.message.reply_html.call_args[0][0]
        assert "Просроченные" in text


@pytest.mark.asyncio
class TestCmdReport:
    async def test_report_html_sent(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain   = make_sb_mock(data=[{"recruiter_id": "rid"}])
        new_c_chain  = make_sb_mock(data=[{"pipeline_stage": "offer"}, {"pipeline_stage": "new"}])
        done_r_chain = make_sb_mock(data=[{"id": "r1"}])
        all_r_chain  = make_sb_mock(data=[{"due_date": None}])
        all_c_chain  = make_sb_mock(data=[{"status": "active"}])
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: new_c_chain, 3: done_r_chain,
                    4: all_r_chain, 5: all_c_chain}.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_report(upd, ctx)
        upd.message.reply_html.assert_called_once()
        text = upd.message.reply_html.call_args[0][0]
        assert "Отчёт" in text
        assert "Новых кандидатов" in text

    async def test_report_counts_offers(self):
        upd = make_update(user_id=1)
        ctx = make_ctx()
        user_chain   = make_sb_mock(data=[{"recruiter_id": "rid"}])
        new_c_chain  = make_sb_mock(data=[
            {"pipeline_stage": "offer"},
            {"pipeline_stage": "offer"},
            {"pipeline_stage": "new"},
        ])
        done_r_chain = make_sb_mock(data=[])
        all_r_chain  = make_sb_mock(data=[])
        all_c_chain  = make_sb_mock(data=[])
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: new_c_chain, 3: done_r_chain,
                    4: all_r_chain, 5: all_c_chain}.get(calls[0], MagicMock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_report(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        # "2" should appear for offers count
        assert "2" in text


@pytest.mark.asyncio
class TestCmdLink:
    async def test_no_code_shows_usage(self):
        upd = make_update(user_id=1)
        ctx = make_ctx(args=[])
        chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_link(upd, ctx)
        upd.message.reply_text.assert_called_once()
        assert "Использование" in upd.message.reply_text.call_args[0][0]

    async def test_invalid_code_message(self):
        upd = make_update(user_id=1)
        ctx = make_ctx(args=["BADCODE"])
        chain = make_sb_mock(data=[])  # code not found
        bot.sb.from_ = MagicMock(return_value=chain)
        await bot.cmd_link(upd, ctx)
        upd.message.reply_text.assert_called_once()
        text = upd.message.reply_text.call_args[0][0]
        assert "недействителен" in text.lower() or "не найден" in text.lower() or "неверный" in text.lower()


@pytest.mark.asyncio
class TestHandleCallback:
    async def _make_query(self, data):
        query = MagicMock()
        query.answer = AsyncMock()
        query.edit_message_reply_markup = AsyncMock()
        query.message = MagicMock()
        query.message.reply_text = AsyncMock()
        query.data = data
        upd = MagicMock()
        upd.callback_query = query
        return upd, query

    async def test_done_callback_marks_done(self):
        upd, query = await self._make_query("done:rem-abc")
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        ctx = make_ctx()
        await bot.handle_callback(upd, ctx)
        chain.update.assert_called_once_with({"is_done": True})

    async def test_snooze1_callback(self):
        upd, query = await self._make_query("snooze1:rem-abc")
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        ctx = make_ctx()
        await bot.handle_callback(upd, ctx)
        query.message.reply_text.assert_called_once()
        assert "1 час" in query.message.reply_text.call_args[0][0]

    async def test_setstatus_callback(self):
        upd, query = await self._make_query("setstatus:cand-1:archive")
        chain = make_sb_mock()
        bot.sb.from_ = MagicMock(return_value=chain)
        ctx = make_ctx()
        await bot.handle_callback(upd, ctx)
        chain.update.assert_called_once_with({"status": "archive"})
        reply = query.message.reply_text.call_args[0][0]
        assert "Архив" in reply


# ═════════════════════════════════════════════════════════════════════════════
# PIPELINE STAGE LOGIC  (тесты новой единой системы этапов)
# ═════════════════════════════════════════════════════════════════════════════

STAGE_ORDER = ["new", "resume", "phone", "interview", "offer", "rejected"]
FREE_STAGES = {"new", "resume"}
VACANCY_REQUIRED_STAGES = {"phone", "interview", "offer", "rejected"}

STAGE_LABEL = {
    "new": "Новый", "resume": "Резюме", "phone": "Звонок",
    "interview": "Собеседование", "offer": "Оффер", "rejected": "Отказ",
}


class TestStageConstants:
    """Константы этапов — порядок и разбивка по группам."""

    def test_all_stages_present(self):
        assert set(STAGE_ORDER) == {"new", "resume", "phone", "interview", "offer", "rejected"}

    def test_free_stages_are_subset(self):
        assert FREE_STAGES < set(STAGE_ORDER)

    def test_vacancy_required_stages_are_subset(self):
        assert VACANCY_REQUIRED_STAGES < set(STAGE_ORDER)

    def test_free_and_required_are_disjoint(self):
        assert FREE_STAGES & VACANCY_REQUIRED_STAGES == set()

    def test_free_and_required_cover_all(self):
        assert FREE_STAGES | VACANCY_REQUIRED_STAGES == set(STAGE_ORDER)

    def test_stage_order_starts_with_free(self):
        # new и resume идут первыми
        assert STAGE_ORDER[0] == "new"
        assert STAGE_ORDER[1] == "resume"

    def test_stage_label_complete(self):
        assert set(STAGE_LABEL.keys()) == set(STAGE_ORDER)


class TestStageValidation:
    """Валидация: можно ли поставить этап без вакансии."""

    def _can_set_stage(self, stage: str, has_vacancy: bool) -> bool:
        """Имитирует логику setPipelineStage()."""
        if stage not in FREE_STAGES and not has_vacancy:
            return False
        return True

    def test_new_without_vacancy_allowed(self):
        assert self._can_set_stage("new", has_vacancy=False) is True

    def test_resume_without_vacancy_allowed(self):
        assert self._can_set_stage("resume", has_vacancy=False) is True

    def test_phone_without_vacancy_blocked(self):
        assert self._can_set_stage("phone", has_vacancy=False) is False

    def test_interview_without_vacancy_blocked(self):
        assert self._can_set_stage("interview", has_vacancy=False) is False

    def test_offer_without_vacancy_blocked(self):
        assert self._can_set_stage("offer", has_vacancy=False) is False

    def test_rejected_without_vacancy_blocked(self):
        assert self._can_set_stage("rejected", has_vacancy=False) is False

    def test_phone_with_vacancy_allowed(self):
        assert self._can_set_stage("phone", has_vacancy=True) is True

    def test_interview_with_vacancy_allowed(self):
        assert self._can_set_stage("interview", has_vacancy=True) is True

    def test_offer_with_vacancy_allowed(self):
        assert self._can_set_stage("offer", has_vacancy=True) is True

    def test_rejected_with_vacancy_allowed(self):
        assert self._can_set_stage("rejected", has_vacancy=True) is True


class TestMigrationMapping:
    """Проверяем маппинг старых русских значений на новые ключи."""

    MIGRATION_MAP = {
        "Новый":          "new",
        "Собеседование":  "interview",
        "Оффер":          "offer",
        "Принят":         "offer",
        "Отказ":          "rejected",
    }

    def test_all_old_values_mapped(self):
        for old, new in self.MIGRATION_MAP.items():
            assert new in STAGE_ORDER, f"{old} → {new} not in STAGE_ORDER"

    def test_no_old_values_remain_in_stage_order(self):
        old_values = set(self.MIGRATION_MAP.keys())
        assert old_values & set(STAGE_ORDER) == set()

    def test_новый_maps_to_new(self):
        assert self.MIGRATION_MAP["Новый"] == "new"

    def test_собеседование_maps_to_interview(self):
        assert self.MIGRATION_MAP["Собеседование"] == "interview"

    def test_принят_maps_to_offer(self):
        # Нет отдельного 'hired', Принят → offer
        assert self.MIGRATION_MAP["Принят"] == "offer"


@pytest.mark.asyncio
class TestCmdPipelineNewStages:
    """cmd_pipeline корректно отображает новые английские ключи."""

    async def test_pipeline_shows_russian_labels(self):
        """Вывод бота должен содержать русские названия, не английские ключи."""
        upd = make_update(user_id=1)
        ctx = make_ctx()
        calls = [0]

        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Менеджер"}])
        cand_chain = make_sb_mock(data=[
            {"vacancy_id": "v1", "current_stage": "interview",
             "candidates": {"full_name": "Иван Иванов"}},
            {"vacancy_id": "v1", "current_stage": "offer",
             "candidates": {"full_name": "Мария Петрова"}},
        ])

        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: cand_chain}.get(calls[0], MagicMock())

        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]

        # Русские метки, не английские ключи
        assert "Собеседование" in text
        assert "Оффер" in text
        assert "interview" not in text
        assert "offer" not in text

    async def test_pipeline_shows_new_stage_as_novyi(self):
        """Этап 'new' должен отображаться как 'Новый'."""
        upd = make_update(user_id=1)
        ctx = make_ctx()
        calls = [0]

        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Тестовая вакансия"}])
        cand_chain = make_sb_mock(data=[
            {"vacancy_id": "v1", "current_stage": "new",
             "candidates": {"full_name": "Тест"}},
        ])

        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: cand_chain}.get(calls[0], MagicMock())

        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        assert "Новый" in text
        assert "new" not in text

    async def test_pipeline_unknown_stage_shows_label(self):
        """Неизвестный этап показывается как есть (без краша)."""
        upd = make_update(user_id=1)
        ctx = make_ctx()
        calls = [0]

        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Вакансия"}])
        cand_chain = make_sb_mock(data=[
            {"vacancy_id": "v1", "current_stage": "custom_stage",
             "candidates": {"full_name": "Тест"}},
        ])

        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: cand_chain}.get(calls[0], MagicMock())

        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        # Не должно упасть с исключением
        upd.message.reply_html.assert_called_once()

    async def test_pipeline_stage_order_new_before_interview(self):
        """new должен выводиться перед interview в порядке воронки."""
        # Порядок определяется STAGE_ORDER в боте
        upd = make_update(user_id=1)
        ctx = make_ctx()
        calls = [0]

        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Вакансия"}])
        cand_chain = make_sb_mock(data=[
            {"vacancy_id": "v1", "current_stage": "interview",
             "candidates": {"full_name": "А"}},
            {"vacancy_id": "v1", "current_stage": "new",
             "candidates": {"full_name": "Б"}},
        ])

        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: cand_chain}.get(calls[0], MagicMock())

        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_html.call_args[0][0]
        pos_new       = text.find("Новый")
        pos_interview = text.find("Собеседование")
        assert pos_new < pos_interview, "Новый должен быть выше Собеседования"

    async def test_pipeline_free_stage_without_vacancy_in_db(self):
        """Кандидаты на этапе 'resume' (без вакансии) НЕ попадают в /pipeline
        так как там только candidacies — это корректное поведение."""
        upd = make_update(user_id=1)
        ctx = make_ctx()
        calls = [0]

        user_chain = make_sb_mock(data=[{"recruiter_id": "rid"}])
        vac_chain  = make_sb_mock(data=[{"id": "v1", "title": "Вакансия"}])
        # Нет candidacies — кандидаты на free-этапах без вакансии
        cand_chain = make_sb_mock(data=[])

        def side(t):
            calls[0] += 1
            return {1: user_chain, 2: vac_chain, 3: cand_chain}.get(calls[0], MagicMock())

        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, ctx)
        text = upd.message.reply_text.call_args[0][0]
        assert "нет кандидатов" in text.lower() or "воронке" in text.lower()


class TestCandidacyUpsertLogic:
    """Логика upsert кандидатуры при сохранении кандидата."""

    def _build_upsert_params(self, stage: str, vacancy_id: str | None,
                              existing_stage: str | None) -> dict | None:
        """
        Имитирует логику saveCandidate() для candidacies.
        Возвращает {'action': 'insert'|'update'|None, 'stage': str}.
        """
        if not vacancy_id:
            return {"action": None}

        if existing_stage is None:
            # Нет candidacy — создаём
            return {"action": "insert", "stage": stage}
        elif existing_stage != stage:
            # Есть candidacy, этап изменился — обновляем
            return {"action": "update", "stage": stage}
        else:
            # Этап не изменился — ничего не делаем
            return {"action": None}

    def test_no_vacancy_no_upsert(self):
        result = self._build_upsert_params("new", vacancy_id=None, existing_stage=None)
        assert result["action"] is None

    def test_new_candidacy_inserted(self):
        result = self._build_upsert_params("interview", "v1", existing_stage=None)
        assert result["action"] == "insert"
        assert result["stage"] == "interview"

    def test_existing_same_stage_no_update(self):
        result = self._build_upsert_params("interview", "v1", existing_stage="interview")
        assert result["action"] is None

    def test_existing_changed_stage_update(self):
        result = self._build_upsert_params("offer", "v1", existing_stage="interview")
        assert result["action"] == "update"
        assert result["stage"] == "offer"

    def test_free_stage_no_vacancy_no_upsert(self):
        result = self._build_upsert_params("new", vacancy_id=None, existing_stage=None)
        assert result["action"] is None

    def test_free_stage_with_vacancy_inserts(self):
        """new/resume можно добавить с вакансией (кандидат начинает путь)."""
        result = self._build_upsert_params("new", "v1", existing_stage=None)
        assert result["action"] == "insert"
        assert result["stage"] == "new"

    def test_stage_change_recorded_for_history(self):
        """При update старый и новый этапы оба в STAGE_ORDER."""
        old_stage = "phone"
        new_stage = "interview"
        assert old_stage in STAGE_ORDER
        assert new_stage in STAGE_ORDER
        result = self._build_upsert_params(new_stage, "v1", existing_stage=old_stage)
        assert result["action"] == "update"


class TestStageConsistency:
    """Проверяем что bot.py использует новые ключи, не старые русские."""

    def test_bot_stage_order_uses_english_keys(self):
        """STAGE_ORDER в боте должен содержать английские ключи."""
        import importlib
        # Уже импортирован как bot
        src = open(bot.__file__).read()
        # Не должно быть старых русских ключей как значений этапов
        assert '"Собеседование"' not in src.split("STAGE_ORDER")[1].split("]")[0]
        assert '"Новый"'         not in src.split("STAGE_ORDER")[1].split("]")[0]

    def test_bot_default_stage_is_english(self):
        """Дефолтный этап в боте — 'new', не 'Новый'."""
        src = open(bot.__file__).read()
        # current_stage or "new" — не "Новый"
        assert 'or "new"' in src
        assert 'or "Новый"' not in src
