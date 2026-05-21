"""
Standalone runner для тестов логики этапов воронки.
Не требует установки pytest/supabase/telegram — создаёт стабы в памяти.
"""

import sys, os, types, asyncio, unittest
from unittest.mock import MagicMock, AsyncMock, patch

# ── Стабы внешних зависимостей ────────────────────────────────────────────────

def _make_stub(name):
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod

# supabase
if "supabase" not in sys.modules:
    sub = _make_stub("supabase")
    sub.create_client = MagicMock(return_value=MagicMock())
    sub.Client = MagicMock

# telegram
for pkg in ["telegram", "telegram.ext", "telegram.constants"]:
    if pkg not in sys.modules:
        _make_stub(pkg)
tg = sys.modules["telegram"]
tg.Update = MagicMock
tg.InlineKeyboardButton = MagicMock
tg.InlineKeyboardMarkup = MagicMock
tg.BotCommand = MagicMock

tg_ext = sys.modules["telegram.ext"]
tg_ext.Application = MagicMock()
tg_ext.Application.builder = MagicMock(return_value=MagicMock())
tg_ext.CommandHandler = MagicMock
tg_ext.CallbackQueryHandler = MagicMock
tg_ext.MessageHandler = MagicMock
tg_ext.filters = MagicMock()
tg_ext.ContextTypes = MagicMock()
tg_ext.ContextTypes.DEFAULT_TYPE = MagicMock

# telegram.constants
tg_const = sys.modules["telegram.constants"]
tg_const.ParseMode = MagicMock()

# dotenv
if "dotenv" not in sys.modules:
    dotenv = _make_stub("dotenv")
    dotenv.load_dotenv = MagicMock()
if "python_dotenv" not in sys.modules:
    _make_stub("python_dotenv")

# ── Импортируем bot ───────────────────────────────────────────────────────────

os.environ.setdefault("BOT_TOKEN",    "fake:token")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "fake-key")

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

with patch("supabase.create_client", return_value=MagicMock()):
    import bot

# ── Вспомогательные константы (дублируем логику CRM/bot) ─────────────────────

STAGE_ORDER   = ["new", "resume", "phone", "interview", "offer", "rejected"]
FREE_STAGES   = {"new", "resume"}
VACANCY_REQ   = {"phone", "interview", "offer", "rejected"}
STAGE_LABEL   = {
    "new": "Новый", "resume": "Резюме", "phone": "Звонок",
    "interview": "Собеседование", "offer": "Оффер", "rejected": "Отказ",
}
MIGRATION_MAP = {
    "Новый": "new", "Собеседование": "interview",
    "Оффер": "offer", "Принят": "offer", "Отказ": "rejected",
}


# ─────────────────────────────────────────────────────────────────────────────
# Вспомогательные mock-строители
# ─────────────────────────────────────────────────────────────────────────────

def make_sb_mock(data=None):
    chain = MagicMock()
    result = MagicMock()
    result.data = data if data is not None else []
    result.error = None
    for m in ("select","eq","neq","in_","lt","lte","gte","gt",
              "order","limit","insert","update","maybeSingle","single"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = result
    return chain

def make_update(user_id=1):
    user = MagicMock(); user.id = user_id; user.first_name = "Test"
    msg  = MagicMock(); msg.reply_text = AsyncMock(); msg.reply_html = AsyncMock()
    upd  = MagicMock(); upd.effective_user = user; upd.message = msg
    return upd

def make_ctx():
    ctx = MagicMock(); ctx.args = []; ctx.bot = AsyncMock()
    return ctx


# ═════════════════════════════════════════════════════════════════════════════
# TEST CLASSES
# ═════════════════════════════════════════════════════════════════════════════

class TestStageConstants(unittest.TestCase):

    def test_all_stages_present(self):
        self.assertEqual(set(STAGE_ORDER),
                         {"new","resume","phone","interview","offer","rejected"})

    def test_stage_count(self):
        self.assertEqual(len(STAGE_ORDER), 6)

    def test_free_stages_subset(self):
        self.assertTrue(FREE_STAGES < set(STAGE_ORDER))

    def test_vacancy_req_subset(self):
        self.assertTrue(VACANCY_REQ < set(STAGE_ORDER))

    def test_groups_disjoint(self):
        self.assertEqual(FREE_STAGES & VACANCY_REQ, set())

    def test_groups_cover_all(self):
        self.assertEqual(FREE_STAGES | VACANCY_REQ, set(STAGE_ORDER))

    def test_order_starts_with_free(self):
        self.assertEqual(STAGE_ORDER[0], "new")
        self.assertEqual(STAGE_ORDER[1], "resume")

    def test_labels_complete(self):
        self.assertEqual(set(STAGE_LABEL.keys()), set(STAGE_ORDER))

    def test_no_russian_keys_in_stage_order(self):
        old = {"Новый","Собеседование","Оффер","Принят","Отказ","Резюме","Звонок"}
        self.assertEqual(old & set(STAGE_ORDER), set())


class TestStageValidation(unittest.TestCase):
    """Валидация: можно ли поставить этап без вакансии."""

    @staticmethod
    def can_set(stage: str, has_vacancy: bool) -> bool:
        if stage not in FREE_STAGES and not has_vacancy:
            return False
        return True

    def test_new_no_vacancy(self):      self.assertTrue(self.can_set("new",       False))
    def test_resume_no_vacancy(self):   self.assertTrue(self.can_set("resume",    False))
    def test_phone_no_vacancy(self):    self.assertFalse(self.can_set("phone",    False))
    def test_interview_no_vacancy(self):self.assertFalse(self.can_set("interview",False))
    def test_offer_no_vacancy(self):    self.assertFalse(self.can_set("offer",    False))
    def test_rejected_no_vacancy(self): self.assertFalse(self.can_set("rejected", False))
    def test_phone_with_vacancy(self):  self.assertTrue(self.can_set("phone",     True))
    def test_interview_with_vac(self):  self.assertTrue(self.can_set("interview", True))
    def test_offer_with_vacancy(self):  self.assertTrue(self.can_set("offer",     True))
    def test_rejected_with_vac(self):   self.assertTrue(self.can_set("rejected",  True))

    def test_all_free_stages_allowed_without_vacancy(self):
        for s in FREE_STAGES:
            with self.subTest(stage=s):
                self.assertTrue(self.can_set(s, False))

    def test_all_req_stages_blocked_without_vacancy(self):
        for s in VACANCY_REQ:
            with self.subTest(stage=s):
                self.assertFalse(self.can_set(s, False))

    def test_all_stages_allowed_with_vacancy(self):
        for s in STAGE_ORDER:
            with self.subTest(stage=s):
                self.assertTrue(self.can_set(s, True))


class TestMigrationMapping(unittest.TestCase):

    def test_all_old_values_map_to_valid_stages(self):
        for old, new in MIGRATION_MAP.items():
            with self.subTest(old=old):
                self.assertIn(new, STAGE_ORDER)

    def test_no_old_value_is_a_new_key(self):
        self.assertEqual(set(MIGRATION_MAP) & set(STAGE_ORDER), set())

    def test_новый_to_new(self):
        self.assertEqual(MIGRATION_MAP["Новый"], "new")

    def test_собеседование_to_interview(self):
        self.assertEqual(MIGRATION_MAP["Собеседование"], "interview")

    def test_принят_to_offer(self):
        self.assertEqual(MIGRATION_MAP["Принят"], "offer")

    def test_отказ_to_rejected(self):
        self.assertEqual(MIGRATION_MAP["Отказ"], "rejected")

    def test_миграция_полная_без_потерь(self):
        # Все 5 старых значений замаплены
        self.assertEqual(len(MIGRATION_MAP), 5)


class TestCandidacyUpsertLogic(unittest.TestCase):
    """Логика upsert candidacy при saveCandidate."""

    @staticmethod
    def upsert_action(stage, vacancy_id, existing_stage):
        """Имитация логики saveCandidate() для candidacies."""
        if not vacancy_id:
            return {"action": None}
        if existing_stage is None:
            return {"action": "insert", "stage": stage}
        elif existing_stage != stage:
            return {"action": "update", "stage": stage}
        return {"action": None}

    def test_no_vacancy_no_action(self):
        r = self.upsert_action("new", None, None)
        self.assertIsNone(r["action"])

    def test_new_candidacy_insert(self):
        r = self.upsert_action("interview", "v1", None)
        self.assertEqual(r["action"], "insert")
        self.assertEqual(r["stage"],  "interview")

    def test_same_stage_no_action(self):
        r = self.upsert_action("interview", "v1", "interview")
        self.assertIsNone(r["action"])

    def test_changed_stage_update(self):
        r = self.upsert_action("offer", "v1", "interview")
        self.assertEqual(r["action"], "update")
        self.assertEqual(r["stage"],  "offer")

    def test_free_stage_with_vacancy_inserts(self):
        r = self.upsert_action("new", "v1", None)
        self.assertEqual(r["action"], "insert")

    def test_all_stage_transitions_valid(self):
        """Любой переход между известными этапами корректен."""
        for from_s in STAGE_ORDER:
            for to_s in STAGE_ORDER:
                if from_s != to_s:
                    r = self.upsert_action(to_s, "v1", from_s)
                    self.assertEqual(r["action"], "update", f"{from_s}→{to_s}")


class TestBotPipelineStages(unittest.IsolatedAsyncioTestCase):
    """cmd_pipeline отображает новые английские ключи как русские метки."""

    def _side_factory(self, user_data, vac_data, cand_data):
        calls = [0]
        chains = {
            1: make_sb_mock(user_data),
            2: make_sb_mock(vac_data),
            3: make_sb_mock(cand_data),
        }
        def side(t):
            calls[0] += 1
            return chains.get(calls[0], make_sb_mock())
        return side

    async def test_interview_shows_sobese(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Менеджер"}],
            [{"vacancy_id": "v1", "current_stage": "interview",
              "candidates": {"full_name": "Иванов"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Собеседование", text)
        self.assertNotIn("interview", text)

    async def test_offer_shows_offer_ru(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Аналитик"}],
            [{"vacancy_id": "v1", "current_stage": "offer",
              "candidates": {"full_name": "Петрова"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Оффер", text)
        self.assertNotIn('"offer"', text)

    async def test_new_shows_novyi(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [{"vacancy_id": "v1", "current_stage": "new",
              "candidates": {"full_name": "Тест"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Новый", text)
        # "new" может встретиться в имени вакансии — проверяем что нет как ключа
        self.assertNotIn("🆕 new", text)

    async def test_phone_shows_zvonok(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [{"vacancy_id": "v1", "current_stage": "phone",
              "candidates": {"full_name": "Тест"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Звонок", text)
        self.assertNotIn("📞 phone", text)

    async def test_resume_shows_rezyume(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [{"vacancy_id": "v1", "current_stage": "resume",
              "candidates": {"full_name": "Тест"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Резюме", text)

    async def test_rejected_shows_otkaz(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [{"vacancy_id": "v1", "current_stage": "rejected",
              "candidates": {"full_name": "Тест"}}],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertIn("Отказ", text)

    async def test_stage_order_new_before_interview(self):
        """new должен появиться в тексте раньше interview."""
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [
                {"vacancy_id": "v1", "current_stage": "interview",
                 "candidates": {"full_name": "А"}},
                {"vacancy_id": "v1", "current_stage": "new",
                 "candidates": {"full_name": "Б"}},
            ],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        self.assertLess(text.find("Новый"), text.find("Собеседование"))

    async def test_multiple_stages_all_present(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [
                {"vacancy_id": "v1", "current_stage": "new",       "candidates": {"full_name": "A"}},
                {"vacancy_id": "v1", "current_stage": "phone",     "candidates": {"full_name": "B"}},
                {"vacancy_id": "v1", "current_stage": "interview", "candidates": {"full_name": "C"}},
                {"vacancy_id": "v1", "current_stage": "offer",     "candidates": {"full_name": "D"}},
                {"vacancy_id": "v1", "current_stage": "rejected",  "candidates": {"full_name": "E"}},
            ],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        text = upd.message.reply_html.call_args[0][0]
        for label in ["Новый", "Звонок", "Собеседование", "Оффер", "Отказ"]:
            with self.subTest(label=label):
                self.assertIn(label, text)

    async def test_no_vacancies_returns_text(self):
        upd = make_update()
        calls = [0]
        def side(t):
            calls[0] += 1
            return {1: make_sb_mock([{"recruiter_id":"r1"}]),
                    2: make_sb_mock([])}.get(calls[0], make_sb_mock())
        bot.sb.from_ = MagicMock(side_effect=side)
        await bot.cmd_pipeline(upd, make_ctx())
        upd.message.reply_text.assert_called_once()

    async def test_empty_pipeline_returns_text(self):
        upd = make_update()
        bot.sb.from_ = MagicMock(side_effect=self._side_factory(
            [{"recruiter_id": "r1"}],
            [{"id": "v1", "title": "Вакансия"}],
            [],
        ))
        await bot.cmd_pipeline(upd, make_ctx())
        upd.message.reply_text.assert_called_once()


class TestBotSourceCode(unittest.TestCase):
    """Статический анализ bot.py — проверяем ключевые изменения."""

    def setUp(self):
        self.src = open(bot.__file__).read()

    def _get_stage_order_block(self):
        start = self.src.find("STAGE_ORDER")
        end   = self.src.find("]", start)
        return self.src[start:end]

    def test_stage_order_contains_english_keys(self):
        block = self._get_stage_order_block()
        for key in ["new", "resume", "phone", "interview", "offer", "rejected"]:
            self.assertIn(f'"{key}"', block, f'"{key}" not in STAGE_ORDER')

    def test_stage_order_no_russian_values(self):
        block = self._get_stage_order_block()
        for ru in ["Новый", "Собеседование", "Оффер", "Принят", "Отказ"]:
            self.assertNotIn(ru, block, f'Russian value "{ru}" still in STAGE_ORDER')

    def test_default_stage_is_new(self):
        self.assertIn('or "new"', self.src)
        self.assertNotIn('or "Новый"', self.src)

    def test_stage_label_dict_exists(self):
        self.assertIn("STAGE_LABEL", self.src)

    def test_stage_label_has_russian_display_values(self):
        # Русские метки должны быть в STAGE_LABEL, не в STAGE_ORDER
        start = self.src.find("STAGE_LABEL")
        end   = self.src.find("}", start)
        block = self.src[start:end]
        for ru in ["Новый", "Звонок", "Собеседование", "Оффер", "Отказ"]:
            self.assertIn(ru, block, f'Russian label "{ru}" missing from STAGE_LABEL')

    def test_emoji_uses_english_keys(self):
        start = self.src.find("STAGE_EMOJI")
        end   = self.src.find("}", start)
        block = self.src[start:end]
        self.assertIn('"new"',       block)
        self.assertIn('"interview"', block)
        self.assertNotIn('"Новый"',  block)


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()

    for cls in [
        TestStageConstants,
        TestStageValidation,
        TestMigrationMapping,
        TestCandidacyUpsertLogic,
        TestBotPipelineStages,
        TestBotSourceCode,
    ]:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
