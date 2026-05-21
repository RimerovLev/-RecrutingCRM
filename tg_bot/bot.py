"""
Recruit CRM — Telegram Bot (мультипользовательский)
Регистрация через /start, каждый пользователь получает свой recruiter_id.
"""

import asyncio
import logging
import signal
import os
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import create_client, Client
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, ContextTypes, filters,
)

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN    = os.environ["BOT_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]   # service_role key
TIMEZONE     = os.environ.get("TIMEZONE", "Europe/Moscow")
DIGEST_HOUR  = int(os.environ.get("DIGEST_HOUR", "8"))
DIGEST_MIN   = int(os.environ.get("DIGEST_MIN", "30"))
CRM_URL      = os.environ.get("CRM_URL", "")

TZ = ZoneInfo(TIMEZONE)

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Supabase ──────────────────────────────────────────────────────────────────
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── User helpers ──────────────────────────────────────────────────────────────
def get_or_create_user(telegram_id: int, username: str | None, full_name: str | None) -> str:
    res = sb.from_("telegram_users").select("recruiter_id").eq("telegram_id", telegram_id).execute()
    if res.data:
        return res.data[0]["recruiter_id"]
    new_row = {"telegram_id": telegram_id, "username": username, "full_name": full_name}
    ins = sb.from_("telegram_users").insert(new_row).execute()
    return ins.data[0]["recruiter_id"]


def get_recruiter_id(telegram_id: int) -> str | None:
    res = sb.from_("telegram_users").select("recruiter_id").eq("telegram_id", telegram_id).execute()
    return res.data[0]["recruiter_id"] if res.data else None


def get_all_users() -> list[dict]:
    res = sb.from_("telegram_users").select("telegram_id, recruiter_id, full_name").execute()
    return res.data or []


# ── Helpers ───────────────────────────────────────────────────────────────────
def fmt_date(d: str | None) -> str:
    if not d:
        return "без даты"
    try:
        dt = datetime.fromisoformat(d)
        return dt.strftime("%-d %b %Y").lower()
    except Exception:
        return d


def is_overdue(due_date: str | None) -> bool:
    if not due_date:
        return False
    try:
        return datetime.fromisoformat(due_date).date() < date.today()
    except Exception:
        return False


def status_emoji(status: str) -> str:
    return {"active": "🟢", "in_work": "🔵", "archive": "⚪"}.get(status, "•")


def status_label(status: str) -> str:
    return {"active": "Активный", "in_work": "В работе", "archive": "Архив"}.get(status, status)


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_today_reminders(rid: str):
    today = date.today().isoformat()
    res = (sb.from_("reminders")
             .select("*, candidates(full_name)")
             .eq("recruiter_id", rid)
             .eq("is_done", False)
             .lte("due_date", today)
             .order("due_date")
             .execute())
    return res.data or []


def get_all_active_reminders(rid: str):
    res = (sb.from_("reminders")
             .select("*, candidates(full_name)")
             .eq("recruiter_id", rid)
             .eq("is_done", False)
             .order("due_date", nullsfirst=False)
             .execute())
    return res.data or []


def get_recent_candidates(rid: str, limit=10):
    res = (sb.from_("candidates")
             .select("id, full_name, phone, position, status, created_at")
             .eq("recruiter_id", rid)
             .order("created_at", desc=True)
             .limit(limit)
             .execute())
    return res.data or []


def search_candidates(rid: str, query: str):
    res = (sb.from_("candidates")
             .select("id, full_name, phone, position, status, district_residence")
             .eq("recruiter_id", rid)
             .ilike("full_name", f"%{query}%")
             .limit(8)
             .execute())
    return res.data or []


def get_open_vacancies(rid: str):
    res = (sb.from_("vacancies")
             .select("id, title, status, created_at")
             .eq("recruiter_id", rid)
             .in_("status", ["open", "in_work"])
             .order("created_at", desc=True)
             .execute())
    return res.data or []


def get_stale_vacancies(rid: str, days=5):
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    res = (sb.from_("vacancies")
             .select("id, title, status, updated_at")
             .eq("recruiter_id", rid)
             .in_("status", ["open", "in_work"])
             .lt("updated_at", cutoff)
             .execute())
    return res.data or []


def mark_reminder_done(reminder_id: str):
    sb.from_("reminders").update({"is_done": True}).eq("id", reminder_id).execute()


def snooze_reminder(reminder_id: str, hours=1):
    new_date = (datetime.now(TZ) + timedelta(hours=hours)).date().isoformat()
    sb.from_("reminders").update({"due_date": new_date}).eq("id", reminder_id).execute()


def add_candidate(rid: str, full_name: str, phone: str | None = None):
    payload = {"recruiter_id": rid, "full_name": full_name, "status": "active"}
    if phone:
        payload["phone"] = phone
    res = sb.from_("candidates").insert(payload).execute()
    return res.data[0] if res.data else None


def add_reminder(rid: str, note: str, candidate_name: str | None = None, due_date: str | None = None):
    payload = {
        "recruiter_id": rid,
        "note": note,
        "is_done": False,
        "due_date": due_date or date.today().isoformat(),
    }
    if candidate_name:
        cands = search_candidates(rid, candidate_name)
        if cands:
            payload["candidate_id"] = cands[0]["id"]
    sb.from_("reminders").insert(payload).execute()


def set_candidate_status(candidate_id: str, status: str):
    sb.from_("candidates").update({"status": status}).eq("id", candidate_id).execute()


# ── Inline keyboards ──────────────────────────────────────────────────────────
def reminder_keyboard(reminder_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Выполнено",   callback_data=f"done:{reminder_id}"),
            InlineKeyboardButton("⏩ +1 час",      callback_data=f"snooze1:{reminder_id}"),
        ],
        [
            InlineKeyboardButton("📅 На завтра",   callback_data=f"snooze24:{reminder_id}"),
            InlineKeyboardButton("📅 Через 3 дня", callback_data=f"snooze72:{reminder_id}"),
        ],
    ])


def candidate_keyboard(candidate_id: str) -> InlineKeyboardMarkup:
    btns = [[
        InlineKeyboardButton("🟢 Активный", callback_data=f"setstatus:{candidate_id}:active"),
        InlineKeyboardButton("🔵 В работе", callback_data=f"setstatus:{candidate_id}:in_work"),
        InlineKeyboardButton("⚪ Архив",    callback_data=f"setstatus:{candidate_id}:archive"),
    ]]
    if CRM_URL:
        btns.append([InlineKeyboardButton("🌐 Открыть в CRM", url=CRM_URL)])
    return InlineKeyboardMarkup(btns)


# ── Auth guard ────────────────────────────────────────────────────────────────
async def require_user(update: Update) -> str | None:
    tg_id = update.effective_user.id
    rid = get_recruiter_id(tg_id)
    if not rid:
        await update.message.reply_text(
            "👋 Привет! Сначала зарегистрируйся — отправь /start"
        )
    return rid


# ── Commands ──────────────────────────────────────────────────────────────────
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    get_or_create_user(
        telegram_id=user.id,
        username=user.username,
        full_name=user.full_name,
    )
    res = sb.from_("telegram_users").select("created_at").eq("telegram_id", user.id).execute()
    is_new = False
    if res.data:
        created = res.data[0]["created_at"]
        delta = datetime.now(TZ) - datetime.fromisoformat(created.replace("Z", "+00:00"))
        is_new = delta.total_seconds() < 10

    if is_new:
        text = (
            f"🎉 <b>Добро пожаловать в Recruit CRM Bot!</b>\n\n"
            f"Твой аккаунт создан. Управляй кандидатами и вакансиями прямо из Telegram.\n\n"
        )
    else:
        text = f"👋 <b>С возвращением, {user.first_name}!</b>\n\n"

    text += (
        "📋 <b>Команды:</b>\n"
        "/today — напоминания на сегодня\n"
        "/reminders — все активные напоминания\n"
        "/candidates — последние 10 кандидатов\n"
        "/search &lt;имя&gt; — найти кандидата\n"
        "/vac — открытые вакансии\n"
        "/add &lt;ФИО&gt; [телефон] — добавить кандидата\n"
        "/note &lt;заметка&gt; — добавить напоминание\n"
        "/note &lt;имя&gt; | &lt;заметка&gt; — привязать к кандидату\n"
        "/link &lt;код&gt; — привязать аккаунт CRM\n"
        "/stats — статистика по базе"
    )
    await update.message.reply_html(text)


async def cmd_today(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    rems = get_today_reminders(rid)
    if not rems:
        await update.message.reply_text("🎉 На сегодня напоминаний нет!")
        return
    await update.message.reply_html(f"📋 <b>Напоминания на сегодня</b> ({len(rems)}):")
    for r in rems:
        overdue = is_overdue(r.get("due_date"))
        cand = r.get("candidates")
        cand_str = f"\n👤 {cand['full_name']}" if cand else ""
        prefix = "⚠️" if overdue else "🔔"
        text = f"{prefix} {r['note']}{cand_str}\n📅 {fmt_date(r.get('due_date'))}"
        await update.message.reply_text(text, reply_markup=reminder_keyboard(r["id"]))


async def cmd_reminders(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    rems = get_all_active_reminders(rid)
    if not rems:
        await update.message.reply_text("✅ Нет активных напоминаний!")
        return
    lines = [f"🔔 <b>Активные напоминания</b> ({len(rems)}):"]
    for i, r in enumerate(rems[:15], 1):
        overdue = is_overdue(r.get("due_date"))
        cand = r.get("candidates")
        cand_str = f" | 👤 {cand['full_name']}" if cand else ""
        mark = "⚠️" if overdue else "•"
        lines.append(f"{mark} <b>{i}.</b> {r['note']}{cand_str} — {fmt_date(r.get('due_date'))}")
    await update.message.reply_html("\n".join(lines))
    for r in rems[:5]:
        cand = r.get("candidates")
        cand_str = f" (👤 {cand['full_name']})" if cand else ""
        await update.message.reply_text(
            f"🔔 {r['note']}{cand_str}",
            reply_markup=reminder_keyboard(r["id"])
        )


async def cmd_candidates(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    cands = get_recent_candidates(rid)
    if not cands:
        await update.message.reply_text("База кандидатов пуста.")
        return
    lines = [f"👥 <b>Последние {len(cands)} кандидатов:</b>"]
    for c in cands:
        emoji = status_emoji(c.get("status", "active"))
        phone = f" | 📞 {c['phone']}" if c.get("phone") else ""
        pos   = f" | 💼 {c['position']}" if c.get("position") else ""
        lines.append(f"{emoji} <b>{c['full_name']}</b>{phone}{pos}")
    await update.message.reply_html("\n".join(lines))


async def cmd_search(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    query = " ".join(ctx.args).strip()
    if not query:
        await update.message.reply_text("Использование: /search Иванов")
        return
    cands = search_candidates(rid, query)
    if not cands:
        await update.message.reply_text(f"❌ Кандидаты по запросу «{query}» не найдены.")
        return
    for c in cands:
        emoji  = status_emoji(c.get("status", "active"))
        slabel = status_label(c.get("status", "active"))
        text = (
            f"{emoji} <b>{c['full_name']}</b>\n"
            f"📞 {c.get('phone') or '—'}\n"
            f"💼 {c.get('position') or '—'}\n"
            f"🏠 {c.get('district_residence') or '—'}\n"
            f"Статус: {slabel}"
        )
        await update.message.reply_html(text, reply_markup=candidate_keyboard(c["id"]))


async def cmd_vac(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    vacs = get_open_vacancies(rid)
    if not vacs:
        await update.message.reply_text("Нет открытых вакансий.")
        return
    lines = [f"💼 <b>Открытые вакансии</b> ({len(vacs)}):"]
    status_map = {"open": "🟢 Открыта", "in_work": "🔵 В работе"}
    for v in vacs:
        slabel = status_map.get(v.get("status", "open"), "•")
        lines.append(f"• <b>{v['title']}</b> — {slabel}")
    await update.message.reply_html("\n".join(lines))


async def cmd_add(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    args = ctx.args
    if not args:
        await update.message.reply_text(
            "Использование:\n/add Иванов Иван Иванович\n/add Иванов Иван +79001234567"
        )
        return
    phone = None
    name_parts = args
    if args[-1].startswith("+") or args[-1].replace("-", "").isdigit():
        phone = args[-1]
        name_parts = args[:-1]
    full_name = " ".join(name_parts)
    if not full_name:
        await update.message.reply_text("Укажите ФИО кандидата.")
        return
    result = add_candidate(rid, full_name, phone)
    if result:
        phone_str = f"\n📞 {phone}" if phone else ""
        await update.message.reply_html(
            f"✅ Кандидат добавлен!\n\n👤 <b>{full_name}</b>{phone_str}\nСтатус: 🟢 Активный"
        )
    else:
        await update.message.reply_text("❌ Ошибка при добавлении. Попробуй ещё раз.")


async def cmd_note(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    text_raw = " ".join(ctx.args).strip()
    if not text_raw:
        await update.message.reply_text(
            "Использование:\n/note Перезвонить Иванову\n/note Иванов | Перезвонить ← привязать к кандидату"
        )
        return
    candidate_name = None
    note_text = text_raw
    if "|" in text_raw:
        parts = text_raw.split("|", 1)
        candidate_name = parts[0].strip()
        note_text = parts[1].strip()
    add_reminder(rid, note_text, candidate_name)
    cand_str = f" (привязано к «{candidate_name}»)" if candidate_name else ""
    await update.message.reply_html(f"✅ Напоминание добавлено{cand_str}:\n📝 {note_text}")


async def cmd_stats(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return
    cands = (sb.from_("candidates").select("status").eq("recruiter_id", rid).execute()).data or []
    vacs  = (sb.from_("vacancies").select("status").eq("recruiter_id", rid).execute()).data or []
    rems  = (sb.from_("reminders").select("is_done").eq("recruiter_id", rid).execute()).data or []

    text = (
        f"📊 <b>Статистика Recruit CRM</b>\n\n"
        f"👥 <b>Кандидаты</b> — {len(cands)}\n"
        f"  🟢 Активных: {sum(1 for c in cands if c['status'] == 'active')}\n"
        f"  🔵 В работе: {sum(1 for c in cands if c['status'] == 'in_work')}\n"
        f"  ⚪ Архив: {sum(1 for c in cands if c['status'] == 'archive')}\n\n"
        f"💼 <b>Вакансии</b>\n"
        f"  🟢 Открытых: {sum(1 for v in vacs if v['status'] in ('open','in_work'))}\n"
        f"  ✅ Закрытых: {sum(1 for v in vacs if v['status'] not in ('open','in_work'))}\n\n"
        f"🔔 <b>Напоминания</b>\n"
        f"  ⏳ Активных: {sum(1 for r in rems if not r['is_done'])}\n"
        f"  ✅ Выполненных: {sum(1 for r in rems if r['is_done'])}"
    )
    await update.message.reply_html(text)


# ── Pipeline command ─────────────────────────────────────────────────────────
async def cmd_pipeline(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return

    vacs = get_open_vacancies(rid)
    if not vacs:
        await update.message.reply_text("Нет открытых вакансий.")
        return

    STAGES = ["new", "resume", "phone", "interview", "offer", "rejected"]
    STAGE_EMOJI = {"new": "🆕", "resume": "📄", "phone": "📞", "interview": "🤝", "offer": "🎉", "rejected": "❌"}
    STAGE_NAME  = {"new": "Новые", "resume": "Резюме", "phone": "Звонок",
                   "interview": "Собес", "offer": "Оффер", "rejected": "Отказ"}

    cands_res = (sb.from_("candidates")
                   .select("id, full_name, pipeline_stage, status")
                   .eq("recruiter_id", rid)
                   .neq("status", "archive")
                   .execute())
    cands = cands_res.data or []

    lines = ["📊 <b>Воронка кандидатов</b>\n"]
    for stage in STAGES:
        count = sum(1 for c in cands if (c.get("pipeline_stage") or "new") == stage)
        if count:
            bar = "█" * min(count, 10) + ("+" if count > 10 else "")
            lines.append(f"{STAGE_EMOJI[stage]} <b>{STAGE_NAME[stage]}</b>: {count}  {bar}")

    lines.append(f"\n👥 Всего активных: {len(cands)}")
    await update.message.reply_html("\n".join(lines))


# ── Overdue command ───────────────────────────────────────────────────────────
async def cmd_overdue(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return

    today = date.today().isoformat()
    res = (sb.from_("reminders")
             .select("*, candidates(full_name)")
             .eq("recruiter_id", rid)
             .eq("is_done", False)
             .lt("due_date", today)
             .order("due_date")
             .execute())
    rems = res.data or []

    if not rems:
        await update.message.reply_text("✅ Просроченных напоминаний нет!")
        return

    await update.message.reply_html(f"⚠️ <b>Просроченные напоминания</b> ({len(rems)}):")
    for r in rems[:10]:
        cand = r.get("candidates")
        cand_str = f"\n👤 {cand['full_name']}" if cand else ""
        text = f"⚠️ {r['note']}{cand_str}\n📅 {fmt_date(r.get('due_date'))}"
        await update.message.reply_text(text, reply_markup=reminder_keyboard(r["id"]))


# ── Report command ────────────────────────────────────────────────────────────
async def cmd_report(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rid = await require_user(update)
    if not rid:
        return

    week_ago = (date.today() - timedelta(days=7)).isoformat()

    new_cands = (sb.from_("candidates")
                   .select("id, full_name, status, pipeline_stage")
                   .eq("recruiter_id", rid)
                   .gte("created_at", week_ago)
                   .execute()).data or []

    done_rems = (sb.from_("reminders")
                   .select("id")
                   .eq("recruiter_id", rid)
                   .eq("is_done", True)
                   .gte("updated_at", week_ago)
                   .execute()).data or []

    all_rems = get_all_active_reminders(rid)
    overdue  = sum(1 for r in all_rems if is_overdue(r.get("due_date")))

    cands_res = (sb.from_("candidates")
                   .select("status")
                   .eq("recruiter_id", rid)
                   .execute()).data or []

    offers = sum(1 for c in new_cands if (c.get("pipeline_stage") or "new") == "offer")

    text = (
        f"📈 <b>Отчёт за неделю</b>\n\n"
        f"👥 Новых кандидатов: <b>{len(new_cands)}</b>\n"
        f"🎉 Дошли до оффера: <b>{offers}</b>\n"
        f"✅ Задач выполнено: <b>{len(done_rems)}</b>\n"
        f"⚠️ Просроченных задач: <b>{overdue}</b>\n\n"
        f"📊 <b>База сейчас:</b>\n"
        f"  🟢 Активных: {sum(1 for c in cands_res if c['status']=='active')}\n"
        f"  🔵 В работе: {sum(1 for c in cands_res if c['status']=='in_work')}\n"
        f"  ⚪ Архив: {sum(1 for c in cands_res if c['status']=='archive')}"
    )
    await update.message.reply_html(text)


# ── Link command ──────────────────────────────────────────────────────────────
async def cmd_link(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    tg_user = update.effective_user
    code = " ".join(ctx.args).strip().upper()

    if not code:
        await update.message.reply_text(
            "Использование: /link КОД\n\n"
            "Код можно получить в CRM → Привязать Telegram"
        )
        return

    res = (sb.from_("link_codes")
             .select("recruiter_id, expires_at, used")
             .eq("code", code)
             .execute())

    if not res.data:
        await update.message.reply_text("❌ Код не найден. Проверь правильность или сгенерируй новый в CRM.")
        return

    row = res.data[0]

    if row["used"]:
        await update.message.reply_text("❌ Этот код уже использован. Сгенерируй новый в CRM.")
        return

    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(TZ) > expires_at:
        await update.message.reply_text("❌ Код истёк. Сгенерируй новый в CRM.")
        return

    recruiter_id = row["recruiter_id"]

    existing = (sb.from_("telegram_users")
                  .select("telegram_id")
                  .eq("telegram_id", tg_user.id)
                  .execute())

    if existing.data:
        sb.from_("telegram_users").update({"recruiter_id": recruiter_id}).eq("telegram_id", tg_user.id).execute()
    else:
        sb.from_("telegram_users").insert({
            "telegram_id": tg_user.id,
            "recruiter_id": recruiter_id,
            "username": tg_user.username,
            "full_name": tg_user.full_name,
        }).execute()

    sb.from_("link_codes").update({"used": True}).eq("code", code).execute()

    await update.message.reply_html(
        "✅ <b>Аккаунт успешно привязан!</b>\n\n"
        "Теперь бот работает с твоей базой из CRM.\n"
        "Попробуй /candidates или /stats"
    )


# ── Callback handlers ─────────────────────────────────────────────────────────
async def handle_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("done:"):
        mark_reminder_done(data.split(":", 1)[1])
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("✅ Напоминание выполнено!")
    elif data.startswith("snooze1:"):
        snooze_reminder(data.split(":", 1)[1], hours=1)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("⏩ Отложено на 1 час.")
    elif data.startswith("snooze24:"):
        snooze_reminder(data.split(":", 1)[1], hours=24)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("📅 Отложено на завтра.")
    elif data.startswith("snooze72:"):
        snooze_reminder(data.split(":", 1)[1], hours=72)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("📅 Отложено на 3 дня.")
    elif data.startswith("setstatus:"):
        _, cand_id, status = data.split(":", 2)
        set_candidate_status(cand_id, status)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"{status_emoji(status)} Статус изменён: {status_label(status)}")


# ── Unknown command ───────────────────────────────────────────────────────────
async def unknown(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Не понимаю эту команду. Напиши /start чтобы увидеть список команд."
    )


# ── Morning digest (all users) ────────────────────────────────────────────────
async def send_morning_digest(context: ContextTypes.DEFAULT_TYPE):
    users = get_all_users()
    log.info(f"Morning digest: sending to {len(users)} users")

    for user in users:
        tg_id = user["telegram_id"]
        rid   = user["recruiter_id"]
        try:
            rems     = get_today_reminders(rid)
            stale    = get_stale_vacancies(rid, days=5)
            all_rems = get_all_active_reminders(rid)

            yesterday = (datetime.now(TZ) - timedelta(hours=24)).isoformat()
            new_cands = (sb.from_("candidates")
                           .select("full_name")
                           .eq("recruiter_id", rid)
                           .gt("created_at", yesterday)
                           .execute()).data or []

            parts = ["🌅 <b>Доброе утро! Дайджест Recruit CRM</b>\n"]

            if rems:
                parts.append(f"🔔 <b>Напоминания на сегодня</b> — {len(rems)}:")
                for r in rems[:5]:
                    cand = r.get("candidates")
                    cand_str = f" (👤 {cand['full_name']})" if cand else ""
                    mark = "⚠️" if is_overdue(r.get("due_date")) else "•"
                    parts.append(f"  {mark} {r['note']}{cand_str}")
                if len(rems) > 5:
                    parts.append(f"  ... и ещё {len(rems)-5}")
            else:
                parts.append("✅ Напоминаний на сегодня нет")

            if new_cands:
                parts.append(f"\n👥 <b>Новые кандидаты за ночь</b> — {len(new_cands)}:")
                for c in new_cands[:3]:
                    parts.append(f"  • {c['full_name']}")

            if stale:
                parts.append(f"\n💤 <b>Вакансии без движения 5+ дней</b> — {len(stale)}:")
                for v in stale[:3]:
                    parts.append(f"  • {v['title']}")

            overdue_count = sum(1 for r in all_rems if is_overdue(r.get("due_date")))
            if overdue_count:
                parts.append(f"\n⚠️ Просроченных напоминаний: <b>{overdue_count}</b>")

            parts.append("\nХорошего дня! 🎯")

            await context.bot.send_message(
                chat_id=tg_id,
                text="\n".join(parts),
                parse_mode="HTML",
            )
            for r in rems[:3]:
                cand = r.get("candidates")
                cand_str = f"\n👤 {cand['full_name']}" if cand else ""
                await context.bot.send_message(
                    chat_id=tg_id,
                    text=f"🔔 {r['note']}{cand_str}\n📅 {fmt_date(r.get('due_date'))}",
                    reply_markup=reminder_keyboard(r["id"]),
                )
        except Exception as e:
            log.error(f"Digest error for user {tg_id}: {e}")


# ── Push notifications ───────────────────────────────────────────────────────
async def check_notifications(context: ContextTypes.DEFAULT_TYPE):
    """Проверяет таблицу bot_notifications и рассылает непрочитанные."""
    try:
        res = (sb.from_("bot_notifications")
                 .select("*")
                 .eq("sent", False)
                 .order("created_at")
                 .limit(20)
                 .execute())
        notifs = res.data or []
        if not notifs:
            return

        for n in notifs:
            rid = n["recruiter_id"]
            # Найти telegram_id пользователя
            tg_res = (sb.from_("telegram_users")
                        .select("telegram_id")
                        .eq("recruiter_id", rid)
                        .execute())
            if not tg_res.data:
                sb.from_("bot_notifications").update({"sent": True}).eq("id", n["id"]).execute()
                continue

            tg_id = tg_res.data[0]["telegram_id"]
            payload = n.get("payload", {})

            if n["type"] == "status_changed":
                cand = payload.get("candidate_name", "Кандидат")
                old  = payload.get("old_status", "")
                new  = payload.get("new_status", "")
                msg  = f"🔄 <b>{cand}</b>\nСтатус изменён: {old} → {new}"
                await context.bot.send_message(chat_id=tg_id, text=msg, parse_mode="HTML")
            elif n["type"] == "reminder_due":
                note = payload.get("note", "Напоминание")
                msg  = f"🔔 Напоминание: <b>{note}</b>"
                await context.bot.send_message(chat_id=tg_id, text=msg, parse_mode="HTML")

            sb.from_("bot_notifications").update({"sent": True}).eq("id", n["id"]).execute()

    except Exception as e:
        log.error(f"check_notifications error: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────
async def async_main():
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start",      cmd_start))
    app.add_handler(CommandHandler("today",      cmd_today))
    app.add_handler(CommandHandler("reminders",  cmd_reminders))
    app.add_handler(CommandHandler("candidates", cmd_candidates))
    app.add_handler(CommandHandler("search",     cmd_search))
    app.add_handler(CommandHandler("vac",        cmd_vac))
    app.add_handler(CommandHandler("add",        cmd_add))
    app.add_handler(CommandHandler("note",       cmd_note))
    app.add_handler(CommandHandler("stats",      cmd_stats))
    app.add_handler(CommandHandler("link",       cmd_link))
    app.add_handler(CommandHandler("pipeline",   cmd_pipeline))
    app.add_handler(CommandHandler("overdue",    cmd_overdue))
    app.add_handler(CommandHandler("report",     cmd_report))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.COMMAND, unknown))

    async def post_init(application: Application):
        await application.bot.set_my_commands([
            BotCommand("today",      "Напоминания на сегодня"),
            BotCommand("reminders",  "Все активные напоминания"),
            BotCommand("candidates", "Последние кандидаты"),
            BotCommand("search",     "Найти кандидата"),
            BotCommand("vac",        "Открытые вакансии"),
            BotCommand("add",        "Добавить кандидата"),
            BotCommand("note",       "Добавить напоминание"),
            BotCommand("stats",      "Статистика"),
            BotCommand("link",       "Привязать аккаунт CRM"),
            BotCommand("pipeline",   "Воронка кандидатов"),
            BotCommand("overdue",    "Просроченные напоминания"),
            BotCommand("report",     "Отчёт за неделю"),
        ])
        application.job_queue.run_daily(
            send_morning_digest,
            time=dtime(hour=DIGEST_HOUR, minute=DIGEST_MIN, tzinfo=TZ),
        )
        application.job_queue.run_repeating(
            check_notifications, interval=120, first=10
        )
        log.info(f"Morning digest scheduled at {DIGEST_HOUR}:{DIGEST_MIN:02d} {TIMEZONE}")

    app.post_init = post_init

    log.info("Bot starting (multi-user mode)...")

    async with app:
        await app.initialize()
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        log.info("Bot is running. Press Ctrl+C to stop.")

        stop_event = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop_event.set)

        await stop_event.wait()

        log.info("Shutting down...")
        await app.updater.stop()
        await app.stop()


if __name__ == "__main__":
    asyncio.run(async_main())
