"""
Recruit CRM — Telegram Bot Assistant
Команды, утренний дайджест 8:30, inline-кнопки для напоминаний.
"""

import os
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import create_client, Client
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand,
)
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, ContextTypes, filters,
)

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN      = os.environ["BOT_TOKEN"]
SUPABASE_URL   = os.environ["SUPABASE_URL"]
SUPABASE_KEY   = os.environ["SUPABASE_KEY"]       # service_role key
RECRUITER_ID   = os.environ["RECRUITER_ID"]        # ваш UUID из Supabase
CHAT_ID        = int(os.environ["CHAT_ID"])        # ваш Telegram chat_id
TIMEZONE       = os.environ.get("TIMEZONE", "Europe/Moscow")
DIGEST_HOUR    = int(os.environ.get("DIGEST_HOUR", "8"))
DIGEST_MIN     = int(os.environ.get("DIGEST_MIN", "30"))
CRM_URL        = os.environ.get("CRM_URL", "")     # https://yoursite.com (опционально)

TZ = ZoneInfo(TIMEZONE)

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Supabase ──────────────────────────────────────────────────────────────────
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def rid() -> str:
    return RECRUITER_ID


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
def get_today_reminders():
    today = date.today().isoformat()
    res = (sb.from_("reminders")
             .select("*, candidates(full_name)")
             .eq("recruiter_id", rid())
             .eq("is_done", False)
             .lte("due_date", today)
             .order("due_date")
             .execute())
    return res.data or []


def get_all_active_reminders():
    res = (sb.from_("reminders")
             .select("*, candidates(full_name)")
             .eq("recruiter_id", rid())
             .eq("is_done", False)
             .order("due_date", nullsfirst=False)
             .execute())
    return res.data or []


def get_recent_candidates(limit=10):
    res = (sb.from_("candidates")
             .select("id, full_name, phone, position, status, created_at")
             .eq("recruiter_id", rid())
             .order("created_at", desc=True)
             .limit(limit)
             .execute())
    return res.data or []


def search_candidates(query: str):
    res = (sb.from_("candidates")
             .select("id, full_name, phone, position, status, district_residence")
             .eq("recruiter_id", rid())
             .ilike("full_name", f"%{query}%")
             .limit(8)
             .execute())
    return res.data or []


def get_open_vacancies():
    res = (sb.from_("vacancies")
             .select("id, title, status, created_at")
             .eq("recruiter_id", rid())
             .in_("status", ["open", "in_work"])
             .order("created_at", desc=True)
             .execute())
    return res.data or []


def get_stale_vacancies(days=5):
    """Вакансии без движения N дней."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    res = (sb.from_("vacancies")
             .select("id, title, status, updated_at")
             .eq("recruiter_id", rid())
             .in_("status", ["open", "in_work"])
             .lt("updated_at", cutoff)
             .execute())
    return res.data or []


def mark_reminder_done(reminder_id: str):
    sb.from_("reminders").update({"is_done": True}).eq("id", reminder_id).execute()


def snooze_reminder(reminder_id: str, hours=1):
    new_date = (datetime.now(TZ) + timedelta(hours=hours)).date().isoformat()
    sb.from_("reminders").update({"due_date": new_date}).eq("id", reminder_id).execute()


def add_candidate(full_name: str, phone: str | None = None):
    payload = {"recruiter_id": rid(), "full_name": full_name, "status": "active"}
    if phone:
        payload["phone"] = phone
    res = sb.from_("candidates").insert(payload).execute()
    return res.data[0] if res.data else None


def add_reminder(note: str, candidate_name: str | None = None, due_date: str | None = None):
    payload = {
        "recruiter_id": rid(),
        "note": note,
        "is_done": False,
        "due_date": due_date or date.today().isoformat(),
    }
    if candidate_name:
        # Find candidate by name
        cands = search_candidates(candidate_name)
        if cands:
            payload["candidate_id"] = cands[0]["id"]
    sb.from_("reminders").insert(payload).execute()


def set_candidate_status(candidate_id: str, status: str):
    sb.from_("candidates").update({"status": status}).eq("id", candidate_id).execute()


# ── Inline keyboards ──────────────────────────────────────────────────────────
def reminder_keyboard(reminder_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Выполнено",        callback_data=f"done:{reminder_id}"),
            InlineKeyboardButton("⏩ +1 час",           callback_data=f"snooze1:{reminder_id}"),
        ],
        [
            InlineKeyboardButton("📅 На завтра",        callback_data=f"snooze24:{reminder_id}"),
            InlineKeyboardButton("📅 Через 3 дня",      callback_data=f"snooze72:{reminder_id}"),
        ],
    ])


def candidate_keyboard(candidate_id: str) -> InlineKeyboardMarkup:
    btns = [
        [
            InlineKeyboardButton("🟢 Активный",  callback_data=f"setstatus:{candidate_id}:active"),
            InlineKeyboardButton("🔵 В работе",  callback_data=f"setstatus:{candidate_id}:in_work"),
            InlineKeyboardButton("⚪ Архив",     callback_data=f"setstatus:{candidate_id}:archive"),
        ],
    ]
    if CRM_URL:
        btns.append([InlineKeyboardButton("🌐 Открыть в CRM", url=CRM_URL)])
    return InlineKeyboardMarkup(btns)


# ── Commands ──────────────────────────────────────────────────────────────────
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text = (
        "👋 <b>Recruit CRM Bot</b>\n\n"
        "Доступные команды:\n"
        "/today — напоминания на сегодня\n"
        "/reminders — все активные напоминания\n"
        "/candidates — последние 10 кандидатов\n"
        "/search &lt;имя&gt; — найти кандидата\n"
        "/vac — открытые вакансии\n"
        "/add &lt;ФИО&gt; [телефон] — добавить кандидата\n"
        "/note &lt;заметка&gt; — добавить напоминание\n"
        "/note &lt;имя кандидата&gt; | &lt;заметка&gt; — привязать к кандидату\n"
        "/stats — статистика по базе"
    )
    await update.message.reply_html(text)


async def cmd_today(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rems = get_today_reminders()
    if not rems:
        await update.message.reply_text("🎉 На сегодня напоминаний нет!")
        return

    await update.message.reply_html(f"📋 <b>Напоминания на сегодня</b> ({len(rems)}):")
    for r in rems:
        overdue = is_overdue(r.get("due_date"))
        cand = r.get("candidates")
        cand_str = f"\n👤 {cand['full_name']}" if cand else ""
        date_str = fmt_date(r.get("due_date"))
        prefix = "⚠️" if overdue else "🔔"

        text = f"{prefix} {r['note']}{cand_str}\n📅 {date_str}"
        await update.message.reply_text(text, reply_markup=reminder_keyboard(r["id"]))


async def cmd_reminders(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    rems = get_all_active_reminders()
    if not rems:
        await update.message.reply_text("✅ Нет активных напоминаний!")
        return

    lines = [f"🔔 <b>Активные напоминания</b> ({len(rems)}):"]
    for i, r in enumerate(rems[:15], 1):
        overdue = is_overdue(r.get("due_date"))
        cand = r.get("candidates")
        cand_str = f" | 👤 {cand['full_name']}" if cand else ""
        date_str = fmt_date(r.get("due_date"))
        mark = "⚠️" if overdue else "•"
        lines.append(f"{mark} <b>{i}.</b> {r['note']}{cand_str} — {date_str}")

    await update.message.reply_html("\n".join(lines))

    # Send first 5 with action buttons
    for r in rems[:5]:
        cand = r.get("candidates")
        cand_str = f" (👤 {cand['full_name']})" if cand else ""
        await update.message.reply_text(
            f"🔔 {r['note']}{cand_str}",
            reply_markup=reminder_keyboard(r["id"])
        )


async def cmd_candidates(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    cands = get_recent_candidates()
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
    query = " ".join(ctx.args).strip()
    if not query:
        await update.message.reply_text("Использование: /search Иванов")
        return

    cands = search_candidates(query)
    if not cands:
        await update.message.reply_text(f"❌ Кандидаты по запросу «{query}» не найдены.")
        return

    for c in cands:
        emoji  = status_emoji(c.get("status", "active"))
        slabel = status_label(c.get("status", "active"))
        phone  = c.get("phone") or "—"
        pos    = c.get("position") or "—"
        dist   = c.get("district_residence") or "—"

        text = (
            f"{emoji} <b>{c['full_name']}</b>\n"
            f"📞 {phone}\n"
            f"💼 {pos}\n"
            f"🏠 {dist}\n"
            f"Статус: {slabel}"
        )
        await update.message.reply_html(text, reply_markup=candidate_keyboard(c["id"]))


async def cmd_vac(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    vacs = get_open_vacancies()
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
    args = ctx.args
    if not args:
        await update.message.reply_text(
            "Использование:\n"
            "/add Иванов Иван Иванович\n"
            "/add Иванов Иван +79001234567"
        )
        return

    # Last arg is phone if starts with + or is digits
    phone = None
    name_parts = args
    if args[-1].startswith("+") or args[-1].replace("-", "").isdigit():
        phone = args[-1]
        name_parts = args[:-1]

    full_name = " ".join(name_parts)
    if not full_name:
        await update.message.reply_text("Укажите ФИО кандидата.")
        return

    result = add_candidate(full_name, phone)
    if result:
        phone_str = f"\n📞 {phone}" if phone else ""
        await update.message.reply_html(
            f"✅ Кандидат добавлен!\n\n"
            f"👤 <b>{full_name}</b>{phone_str}\n"
            f"Статус: 🟢 Активный"
        )
    else:
        await update.message.reply_text("❌ Ошибка при добавлении. Попробуй ещё раз.")


async def cmd_note(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text_raw = " ".join(ctx.args).strip()
    if not text_raw:
        await update.message.reply_text(
            "Использование:\n"
            "/note Перезвонить Иванову завтра\n"
            "/note Иванов | Перезвонить завтра  ← привязать к кандидату"
        )
        return

    candidate_name = None
    note_text = text_raw

    if "|" in text_raw:
        parts = text_raw.split("|", 1)
        candidate_name = parts[0].strip()
        note_text = parts[1].strip()

    add_reminder(note_text, candidate_name)

    cand_str = f" (привязано к кандидату «{candidate_name}»)" if candidate_name else ""
    await update.message.reply_html(
        f"✅ Напоминание добавлено{cand_str}:\n"
        f"📝 {note_text}"
    )


async def cmd_stats(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    cands_res = sb.from_("candidates").select("status").eq("recruiter_id", rid()).execute()
    cands = cands_res.data or []

    vacs_res = sb.from_("vacancies").select("status").eq("recruiter_id", rid()).execute()
    vacs = vacs_res.data or []

    rems_res = sb.from_("reminders").select("is_done").eq("recruiter_id", rid()).execute()
    rems = rems_res.data or []

    total_c  = len(cands)
    active_c = sum(1 for c in cands if c["status"] == "active")
    inwork_c = sum(1 for c in cands if c["status"] == "in_work")
    arch_c   = sum(1 for c in cands if c["status"] == "archive")

    open_v   = sum(1 for v in vacs if v["status"] in ("open", "in_work"))
    closed_v = sum(1 for v in vacs if v["status"] not in ("open", "in_work"))

    active_r = sum(1 for r in rems if not r["is_done"])
    done_r   = sum(1 for r in rems if r["is_done"])

    text = (
        f"📊 <b>Статистика Recruit CRM</b>\n\n"
        f"👥 <b>Кандидаты</b> — {total_c}\n"
        f"  🟢 Активных: {active_c}\n"
        f"  🔵 В работе: {inwork_c}\n"
        f"  ⚪ Архив: {arch_c}\n\n"
        f"💼 <b>Вакансии</b>\n"
        f"  🟢 Открытых: {open_v}\n"
        f"  ✅ Закрытых: {closed_v}\n\n"
        f"🔔 <b>Напоминания</b>\n"
        f"  ⏳ Активных: {active_r}\n"
        f"  ✅ Выполненных: {done_r}"
    )
    await update.message.reply_html(text)


# ── Callback handlers ─────────────────────────────────────────────────────────
async def handle_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("done:"):
        reminder_id = data.split(":", 1)[1]
        mark_reminder_done(reminder_id)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("✅ Напоминание выполнено!")

    elif data.startswith("snooze1:"):
        reminder_id = data.split(":", 1)[1]
        snooze_reminder(reminder_id, hours=1)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("⏩ Отложено на 1 час.")

    elif data.startswith("snooze24:"):
        reminder_id = data.split(":", 1)[1]
        snooze_reminder(reminder_id, hours=24)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("📅 Отложено на завтра.")

    elif data.startswith("snooze72:"):
        reminder_id = data.split(":", 1)[1]
        snooze_reminder(reminder_id, hours=72)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("📅 Отложено на 3 дня.")

    elif data.startswith("setstatus:"):
        _, cand_id, status = data.split(":", 2)
        set_candidate_status(cand_id, status)
        label = status_label(status)
        emoji = status_emoji(status)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"{emoji} Статус изменён: {label}")


# ── Morning digest ────────────────────────────────────────────────────────────
async def send_morning_digest(context: ContextTypes.DEFAULT_TYPE):
    app = context.application
    try:
        rems      = get_today_reminders()
        stale     = get_stale_vacancies(days=5)
        all_rems  = get_all_active_reminders()

        # New candidates last 24h
        yesterday = (datetime.now(TZ) - timedelta(hours=24)).isoformat()
        new_res   = (sb.from_("candidates")
                       .select("full_name")
                       .eq("recruiter_id", rid())
                       .gt("created_at", yesterday)
                       .execute())
        new_cands = new_res.data or []

        parts = ["🌅 <b>Доброе утро! Дайджест Recruit CRM</b>\n"]

        if rems:
            parts.append(f"🔔 <b>Напоминания на сегодня</b> — {len(rems)}:")
            for r in rems[:5]:
                cand = r.get("candidates")
                cand_str = f" (👤 {cand['full_name']})" if cand else ""
                overdue  = is_overdue(r.get("due_date"))
                mark     = "⚠️" if overdue else "•"
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

        total_active = sum(1 for r in all_rems if not is_overdue(r.get("due_date")))
        total_overdue = len(all_rems) - total_active
        if total_overdue:
            parts.append(f"\n⚠️ Просроченных напоминаний: <b>{total_overdue}</b>")

        parts.append(f"\nХорошего дня! 🎯")

        await app.bot.send_message(
            chat_id=CHAT_ID,
            text="\n".join(parts),
            parse_mode="HTML",
        )

        # Send actionable reminders with buttons
        for r in rems[:3]:
            cand = r.get("candidates")
            cand_str = f"\n👤 {cand['full_name']}" if cand else ""
            await app.bot.send_message(
                chat_id=CHAT_ID,
                text=f"🔔 {r['note']}{cand_str}\n📅 {fmt_date(r.get('due_date'))}",
                reply_markup=reminder_keyboard(r["id"]),
            )

        log.info("Morning digest sent successfully.")
    except Exception as e:
        log.error(f"Morning digest error: {e}")


# ── Unknown command ───────────────────────────────────────────────────────────
async def unknown(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Не понимаю эту команду. Напиши /start чтобы увидеть список доступных команд."
    )


# ── Main ──────────────────────────────────────────────────────────────────────
import asyncio
import signal

async def async_main():
    app = Application.builder().token(BOT_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start",      cmd_start))
    app.add_handler(CommandHandler("today",      cmd_today))
    app.add_handler(CommandHandler("reminders",  cmd_reminders))
    app.add_handler(CommandHandler("candidates", cmd_candidates))
    app.add_handler(CommandHandler("search",     cmd_search))
    app.add_handler(CommandHandler("vac",        cmd_vac))
    app.add_handler(CommandHandler("add",        cmd_add))
    app.add_handler(CommandHandler("note",       cmd_note))
    app.add_handler(CommandHandler("stats",      cmd_stats))

    # Callbacks
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Unknown
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
        ])
        from datetime import time as dtime
        application.job_queue.run_daily(
            send_morning_digest,
            time=dtime(hour=DIGEST_HOUR, minute=DIGEST_MIN, tzinfo=TZ),
        )
        log.info(f"Morning digest scheduled at {DIGEST_HOUR}:{DIGEST_MIN:02d} {TIMEZONE}")

    app.post_init = post_init

    log.info(f"Bot starting. Digest at {DIGEST_HOUR}:{DIGEST_MIN:02d} {TIMEZONE}")

    async with app:
        await app.initialize()
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        log.info("Bot is running. Press Ctrl+C to stop.")

        # Wait until Ctrl+C
        stop_event = asyncio.Event()
        loop = asyncio.get_running_loop()

        def _stop():
            stop_event.set()

        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _stop)

        await stop_event.wait()

        log.info("Shutting down...")
        await app.updater.stop()
        await app.stop()


if __name__ == "__main__":
    asyncio.run(async_main())
