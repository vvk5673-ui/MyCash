"""
MyCash Bot — Telegram-бот для VPS
Webhook-режим, админ-панель, уведомления
Работает вместе с FastAPI в одном процессе
"""

import logging
from datetime import datetime, timedelta, timezone
from aiogram import Bot, Dispatcher, Router, types, F
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, MenuButtonWebApp, BotCommand
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import BOT_TOKEN, ADMIN_TELEGRAM_ID
from database import supabase

log = logging.getLogger(__name__)

# ==========================================
# ИНИЦИАЛИЗАЦИЯ
# ==========================================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()
dp.include_router(router)

# URL Mini App (GitHub Pages)
WEBAPP_URL = "https://vvk5673-ui.github.io/MyCash/?v=10"

# Планировщик задач (напоминания, отчёты)
scheduler = AsyncIOScheduler(timezone="Europe/Moscow")


# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==========================================

def is_admin(user_id: int) -> bool:
    """Проверка: это админ?"""
    return user_id == ADMIN_TELEGRAM_ID


def format_money(amount) -> str:
    """Форматирование суммы: 1234.5 → 1 234 ₽"""
    if amount is None:
        return "0 ₽"
    num = float(amount)
    if num == int(num):
        return f"{int(num):,} ₽".replace(",", " ")
    return f"{num:,.2f} ₽".replace(",", " ")


def format_date(iso_string: str) -> str:
    """ISO дата → читаемый формат"""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y")
    except Exception:
        return iso_string[:10] if iso_string else "—"


# ==========================================
# КОМАНДЫ ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
# ==========================================

@router.message(CommandStart())
async def cmd_start(message: types.Message):
    """Команда /start — приветствие и кнопка Mini App"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="📊 Открыть MyCash",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )]
    ])

    await message.answer(
        "👋 Привет! Я **MyCash** — твой финансовый помощник.\n\n"
        "📊 Веди учёт доходов и расходов\n"
        "🎤 Записывай голосом — просто скажи сумму\n"
        "📈 Смотри итоги за любой период\n\n"
        "Нажми кнопку ниже, чтобы начать 👇",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )
    log.info(f"Пользователь {message.from_user.id} ({message.from_user.full_name}) запустил бота")


@router.message(Command("help"))
async def cmd_help(message: types.Message):
    """Команда /help"""
    text = (
        "📖 **Помощь MyCash**\n\n"
        "📊 Открой приложение кнопкой в меню\n"
        "🎤 Голосовой ввод — нажми микрофон в приложении\n"
        "📈 Аналитика — вкладка \"Аналитика\"\n\n"
        "Вопросы? Напиши @vvk5673"
    )
    await message.answer(text, parse_mode="Markdown")


# ==========================================
# АДМИН-КОМАНДЫ (только для ADMIN_TELEGRAM_ID)
# ==========================================

@router.message(Command("admin"))
async def cmd_admin(message: types.Message):
    """Главное меню админки"""
    if not is_admin(message.from_user.id):
        return

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
        [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin_users")],
        [InlineKeyboardButton(text="💳 Платежи", callback_data="admin_payments")],
        [InlineKeyboardButton(text="📋 Лимиты тарифов", callback_data="admin_limits")],
    ])

    await message.answer("🔧 **Админ-панель MyCash**", reply_markup=keyboard, parse_mode="Markdown")


@router.message(Command("stats"))
async def cmd_stats(message: types.Message):
    """Статистика: пользователи, операции, платежи"""
    if not is_admin(message.from_user.id):
        return
    text = await get_stats_text()
    await message.answer(text, parse_mode="Markdown")


@router.callback_query(F.data == "admin_stats")
async def cb_admin_stats(callback: types.CallbackQuery):
    """Кнопка статистики из админ-меню"""
    if not is_admin(callback.from_user.id):
        return
    text = await get_stats_text()
    await callback.message.edit_text(text, parse_mode="Markdown")


async def get_stats_text() -> str:
    """Формирует текст статистики"""
    try:
        # Общее количество пользователей
        users_res = supabase.table("users").select("id, tariff", count="exact").execute()
        total_users = users_res.count or 0

        # Подсчёт по тарифам
        free_count = sum(1 for u in (users_res.data or []) if u.get("tariff") == "free")
        pro_count = sum(1 for u in (users_res.data or []) if u.get("tariff") == "pro")
        max_count = sum(1 for u in (users_res.data or []) if u.get("tariff") == "max")

        # Сегодня
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")

        # Новые за сегодня
        new_today = supabase.table("users").select("id", count="exact") \
            .gte("created_at", today).execute()
        new_today_count = new_today.count or 0

        # Новые за неделю
        new_week = supabase.table("users").select("id", count="exact") \
            .gte("created_at", week_ago).execute()
        new_week_count = new_week.count or 0

        # Операции за сегодня
        ops_today = supabase.table("operations").select("id", count="exact") \
            .gte("created_at", today).execute()
        ops_today_count = ops_today.count or 0

        # Операции за неделю
        ops_week = supabase.table("operations").select("id", count="exact") \
            .gte("created_at", week_ago).execute()
        ops_week_count = ops_week.count or 0

        text = (
            f"📊 **Статистика MyCash**\n\n"
            f"Пользователей: **{total_users}**\n"
            f"  Free: {free_count} | Pro: {pro_count} | Макс: {max_count}\n\n"
            f"**Сегодня:**\n"
            f"  Новых: {new_today_count}\n"
            f"  Операций: {ops_today_count}\n\n"
            f"**Неделя:**\n"
            f"  Новых: {new_week_count}\n"
            f"  Операций: {ops_week_count}"
        )
        return text
    except Exception as e:
        log.error(f"Ошибка получения статистики: {e}")
        return f"❌ Ошибка: {e}"


@router.message(Command("users"))
async def cmd_users(message: types.Message):
    """Последние 10 зарегистрированных пользователей"""
    if not is_admin(message.from_user.id):
        return
    text = await get_users_text()
    await message.answer(text, parse_mode="Markdown")


@router.callback_query(F.data == "admin_users")
async def cb_admin_users(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id):
        return
    text = await get_users_text()
    await callback.message.edit_text(text, parse_mode="Markdown")


async def get_users_text() -> str:
    """Последние 10 пользователей"""
    try:
        res = supabase.table("users").select("telegram_id, first_name, tariff, created_at") \
            .order("created_at", desc=True).limit(10).execute()

        if not res.data:
            return "👥 Пользователей пока нет"

        lines = ["👥 **Последние 10 пользователей**\n"]
        for u in res.data:
            name = u.get("first_name", "—")
            tariff = u.get("tariff", "free")
            date = format_date(u.get("created_at", ""))
            tid = u.get("telegram_id", "?")
            lines.append(f"• **{name}** ({tariff}) — {date}\n  ID: `{tid}`")

        return "\n".join(lines)
    except Exception as e:
        return f"❌ Ошибка: {e}"


@router.message(Command("user"))
async def cmd_user_info(message: types.Message):
    """Информация о пользователе: /user {telegram_id}"""
    if not is_admin(message.from_user.id):
        return

    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("Использование: `/user {telegram_id}`", parse_mode="Markdown")
        return

    try:
        tid = int(parts[1])
    except ValueError:
        await message.answer("❌ telegram\\_id должен быть числом")
        return

    try:
        # Данные пользователя
        user_res = supabase.table("users").select("*") \
            .eq("telegram_id", tid).single().execute()
        user = user_res.data

        if not user:
            await message.answer(f"❌ Пользователь {tid} не найден")
            return

        user_id = user["id"]

        # Количество операций
        ops_res = supabase.table("operations").select("id", count="exact") \
            .eq("user_id", user_id).execute()
        ops_count = ops_res.count or 0

        # Количество кошельков
        wallets_res = supabase.table("wallets").select("id", count="exact") \
            .eq("user_id", user_id).execute()
        wallets_count = wallets_res.count or 0

        tariff = user.get("tariff", "free")
        tariff_until = user.get("tariff_until")
        tariff_str = tariff
        if tariff_until:
            tariff_str += f" (до {format_date(tariff_until)})"

        blocked = "🚫 ЗАБЛОКИРОВАН" if user.get("is_blocked") else ""

        text = (
            f"👤 **Пользователь #{tid}**\n\n"
            f"Имя: {user.get('first_name', '—')}\n"
            f"Тариф: {tariff_str}\n"
            f"Зарегистрирован: {format_date(user.get('created_at', ''))}\n"
            f"Кошельков: {wallets_count}\n"
            f"Операций: {ops_count}\n"
            f"{blocked}"
        )
        await message.answer(text, parse_mode="Markdown")

    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("set_tariff"))
async def cmd_set_tariff(message: types.Message):
    """Установить тариф: /set_tariff {telegram_id} {tariff}"""
    if not is_admin(message.from_user.id):
        return

    parts = message.text.split()
    if len(parts) < 3:
        await message.answer(
            "Использование: `/set_tariff {telegram_id} {free|pro|max}`",
            parse_mode="Markdown"
        )
        return

    try:
        tid = int(parts[1])
    except ValueError:
        await message.answer("❌ telegram\\_id должен быть числом")
        return

    tariff = parts[2].lower()
    if tariff not in ("free", "pro", "max"):
        await message.answer("❌ Тариф должен быть: free, pro или max")
        return

    try:
        # Находим пользователя
        user_res = supabase.table("users").select("id") \
            .eq("telegram_id", tid).single().execute()

        if not user_res.data:
            await message.answer(f"❌ Пользователь {tid} не найден")
            return

        # Обновляем тариф
        update_data = {"tariff": tariff}
        if tariff in ("pro", "max"):
            # +30 дней от сейчас
            until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            update_data["tariff_until"] = until
        else:
            update_data["tariff_until"] = None

        supabase.table("users").update(update_data) \
            .eq("telegram_id", tid).execute()

        await message.answer(f"✅ Тариф пользователя {tid} изменён на **{tariff}**", parse_mode="Markdown")

        # Уведомляем пользователя
        try:
            await bot.send_message(
                tid,
                f"🎉 Ваш тариф изменён на **{tariff.upper()}**!",
                parse_mode="Markdown"
            )
        except Exception:
            pass  # Пользователь мог заблокировать бота

    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("block"))
async def cmd_block(message: types.Message):
    """Заблокировать пользователя: /block {telegram_id}"""
    if not is_admin(message.from_user.id):
        return

    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("Использование: `/block {telegram_id}`", parse_mode="Markdown")
        return

    try:
        tid = int(parts[1])
        supabase.table("users").update({"is_blocked": True}) \
            .eq("telegram_id", tid).execute()
        await message.answer(f"🚫 Пользователь {tid} заблокирован")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("unblock"))
async def cmd_unblock(message: types.Message):
    """Разблокировать пользователя: /unblock {telegram_id}"""
    if not is_admin(message.from_user.id):
        return

    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("Использование: `/unblock {telegram_id}`", parse_mode="Markdown")
        return

    try:
        tid = int(parts[1])
        supabase.table("users").update({"is_blocked": False}) \
            .eq("telegram_id", tid).execute()
        await message.answer(f"✅ Пользователь {tid} разблокирован")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("broadcast"))
async def cmd_broadcast(message: types.Message):
    """Рассылка: /broadcast {текст}"""
    if not is_admin(message.from_user.id):
        return

    text = message.text.replace("/broadcast", "", 1).strip()
    if not text:
        await message.answer("Использование: `/broadcast {текст сообщения}`", parse_mode="Markdown")
        return

    # Получаем всех пользователей
    try:
        res = supabase.table("users").select("telegram_id") \
            .eq("is_blocked", False).execute()

        users = res.data or []
        sent = 0
        failed = 0

        await message.answer(f"📤 Отправляю {len(users)} пользователям...")

        for user in users:
            try:
                await bot.send_message(user["telegram_id"], text, parse_mode="Markdown")
                sent += 1
            except Exception:
                failed += 1

        await message.answer(
            f"✅ Рассылка завершена\n"
            f"Отправлено: {sent}\n"
            f"Ошибки: {failed}"
        )
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("limits"))
async def cmd_limits(message: types.Message):
    """Показать лимиты тарифов"""
    if not is_admin(message.from_user.id):
        return
    text = await get_limits_text()
    await message.answer(text, parse_mode="Markdown")


@router.callback_query(F.data == "admin_limits")
async def cb_admin_limits(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id):
        return
    text = await get_limits_text()
    await callback.message.edit_text(text, parse_mode="Markdown")


async def get_limits_text() -> str:
    """Лимиты тарифов"""
    try:
        res = supabase.table("tariff_limits").select("*") \
            .order("price_rub").execute()

        if not res.data:
            return "📋 Тарифы не найдены"

        lines = ["📋 **Лимиты тарифов**\n"]
        for t in res.data:
            lines.append(
                f"**{t['tariff'].upper()}** ({t['price_rub']} ₽/мес)\n"
                f"  Кошельков: {t['max_wallets']}\n"
                f"  Операций/день: {t['max_daily_operations']}\n"
                f"  Свои категории: {'да' if t.get('custom_categories') else 'нет'}\n"
                f"  Экспорт Excel: {'да' if t.get('export_excel') else 'нет'}\n"
                f"  Таблица аналитики: {'да' if t.get('table_analytics') else 'нет'}\n"
            )

        return "\n".join(lines)
    except Exception as e:
        return f"❌ Ошибка: {e}"


@router.message(Command("set_limit"))
async def cmd_set_limit(message: types.Message):
    """Изменить лимит: /set_limit {tariff} {поле} {значение}"""
    if not is_admin(message.from_user.id):
        return

    parts = message.text.split()
    if len(parts) < 4:
        await message.answer(
            "Использование: `/set_limit {free|pro|max} {поле} {значение}`\n\n"
            "Поля: max\\_wallets, max\\_daily\\_operations, "
            "custom\\_categories, export\\_excel, price\\_rub",
            parse_mode="Markdown"
        )
        return

    tariff = parts[1].lower()
    field = parts[2]
    value = parts[3]

    allowed_fields = [
        "max_wallets", "max_daily_operations", "custom_categories",
        "export_excel", "business_directions", "table_analytics", "price_rub"
    ]

    if tariff not in ("free", "pro", "max"):
        await message.answer("❌ Тариф: free, pro или max")
        return

    if field not in allowed_fields:
        await message.answer(f"❌ Допустимые поля: {', '.join(allowed_fields)}")
        return

    # Конвертация значения
    if field in ("custom_categories", "export_excel", "business_directions", "table_analytics"):
        value = value.lower() in ("true", "1", "да", "yes")
    else:
        try:
            value = int(value)
        except ValueError:
            await message.answer("❌ Значение должно быть числом")
            return

    try:
        supabase.table("tariff_limits").update({field: value}) \
            .eq("tariff", tariff).execute()
        await message.answer(f"✅ {tariff}.{field} = {value}")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.callback_query(F.data == "admin_payments")
async def cb_admin_payments(callback: types.CallbackQuery):
    """Последние платежи"""
    if not is_admin(callback.from_user.id):
        return

    try:
        res = supabase.table("payments").select("*") \
            .order("created_at", desc=True).limit(10).execute()

        if not res.data:
            await callback.message.edit_text("💳 Платежей пока нет")
            return

        lines = ["💳 **Последние 10 платежей**\n"]
        for p in res.data:
            status_icon = "✅" if p.get("status") == "paid" else "⏳"
            lines.append(
                f"{status_icon} {format_money(p.get('amount'))} — "
                f"{p.get('method', '?')} — {format_date(p.get('created_at', ''))}"
            )

        await callback.message.edit_text("\n".join(lines), parse_mode="Markdown")
    except Exception as e:
        await callback.message.edit_text(f"❌ Ошибка: {e}")


# ==========================================
# УВЕДОМЛЕНИЯ (по расписанию)
# ==========================================

async def send_daily_reminder():
    """Напоминание в 20:00 МСК — если 0 операций за день"""
    log.info("Запуск ежедневного напоминания...")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        # Все незаблокированные пользователи
        users_res = supabase.table("users").select("id, telegram_id") \
            .eq("is_blocked", False).execute()

        for user in (users_res.data or []):
            try:
                # Считаем операции за сегодня
                ops_res = supabase.table("operations").select("id", count="exact") \
                    .eq("user_id", user["id"]).gte("created_at", today).execute()

                if (ops_res.count or 0) == 0:
                    await bot.send_message(
                        user["telegram_id"],
                        "📝 Не забудьте записать расходы за сегодня!\n"
                        "Откройте MyCash и добавьте операции 👇",
                        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                            [InlineKeyboardButton(
                                text="📊 Открыть MyCash",
                                web_app=WebAppInfo(url=WEBAPP_URL)
                            )]
                        ])
                    )
            except Exception as e:
                log.debug(f"Не удалось отправить напоминание {user['telegram_id']}: {e}")

        log.info("Ежедневные напоминания отправлены")
    except Exception as e:
        log.error(f"Ошибка ежедневных напоминаний: {e}")


async def send_weekly_report():
    """Еженедельный отчёт в воскресенье 10:00 МСК"""
    log.info("Запуск еженедельного отчёта...")

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    try:
        users_res = supabase.table("users").select("id, telegram_id") \
            .eq("is_blocked", False).execute()

        for user in (users_res.data or []):
            try:
                # Операции за неделю
                ops_res = supabase.table("operations").select("type, amount, category") \
                    .eq("user_id", user["id"]).gte("date", week_ago) \
                    .eq("is_demo", False).execute()

                ops = ops_res.data or []
                if not ops:
                    continue  # Нет операций — не отправляем

                income = sum(float(o["amount"]) for o in ops if o["type"] == "income")
                expense = sum(float(o["amount"]) for o in ops if o["type"] == "expense")

                # Топ-3 категории расходов
                categories = {}
                for o in ops:
                    if o["type"] == "expense" and o.get("category"):
                        categories[o["category"]] = categories.get(o["category"], 0) + float(o["amount"])

                top3 = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:3]
                top3_text = ""
                if top3:
                    top3_lines = [f"  • {cat}: {format_money(amt)}" for cat, amt in top3]
                    top3_text = "\n📌 Топ расходов:\n" + "\n".join(top3_lines)

                text = (
                    f"📊 **Итоги недели**\n\n"
                    f"💰 Доходы: {format_money(income)}\n"
                    f"💸 Расходы: {format_money(expense)}\n"
                    f"📈 Баланс: {format_money(income - expense)}"
                    f"{top3_text}"
                )

                await bot.send_message(user["telegram_id"], text, parse_mode="Markdown")
            except Exception as e:
                log.debug(f"Не удалось отправить отчёт {user['telegram_id']}: {e}")

        log.info("Еженедельные отчёты отправлены")
    except Exception as e:
        log.error(f"Ошибка еженедельных отчётов: {e}")


async def check_expiring_subscriptions():
    """Предупреждение за 3 дня до окончания подписки"""
    log.info("Проверка истекающих подписок...")

    three_days = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        # Подписки, истекающие через 3 дня
        expiring = supabase.table("users").select("telegram_id, tariff, tariff_until") \
            .neq("tariff", "free") \
            .gte("tariff_until", today) \
            .lte("tariff_until", three_days) \
            .execute()

        for user in (expiring.data or []):
            try:
                until = format_date(user.get("tariff_until", ""))
                await bot.send_message(
                    user["telegram_id"],
                    f"⚠️ Ваша подписка **{user['tariff'].upper()}** "
                    f"заканчивается {until}.\n\n"
                    f"Обновите тариф, чтобы не потерять доступ к функциям!",
                    parse_mode="Markdown"
                )
            except Exception:
                pass

        # Подписки, истекшие сегодня — сбрасываем на free
        expired = supabase.table("users").select("telegram_id, tariff") \
            .neq("tariff", "free") \
            .lt("tariff_until", today) \
            .execute()

        for user in (expired.data or []):
            try:
                supabase.table("users").update({"tariff": "free", "tariff_until": None}) \
                    .eq("telegram_id", user["telegram_id"]).execute()

                await bot.send_message(
                    user["telegram_id"],
                    "😔 Ваша подписка закончилась.\n"
                    "Тариф изменён на **Free**.\n\n"
                    "Обновите тариф, чтобы вернуть все функции!",
                    parse_mode="Markdown"
                )
            except Exception:
                pass

        log.info("Проверка подписок завершена")
    except Exception as e:
        log.error(f"Ошибка проверки подписок: {e}")


# ==========================================
# НАСТРОЙКА И ЗАПУСК
# ==========================================

def setup_scheduler():
    """Настраиваем расписание уведомлений"""
    # Ежедневное напоминание в 20:00 МСК
    scheduler.add_job(send_daily_reminder, "cron", hour=20, minute=0)
    # Еженедельный отчёт: воскресенье 10:00 МСК
    scheduler.add_job(send_weekly_report, "cron", day_of_week="sun", hour=10, minute=0)
    # Проверка подписок: каждый день в 9:00 МСК
    scheduler.add_job(check_expiring_subscriptions, "cron", hour=9, minute=0)

    scheduler.start()
    log.info("Планировщик уведомлений запущен")


async def setup_bot_commands():
    """Устанавливаем команды бота в меню Telegram"""
    commands = [
        BotCommand(command="start", description="Запустить бота"),
        BotCommand(command="help", description="Помощь"),
    ]
    await bot.set_my_commands(commands)

    # Кнопка Mini App в меню
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="📊 MyCash",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        )
    except Exception as e:
        log.warning(f"Не удалось установить кнопку меню: {e}")

    log.info("Команды бота установлены")


async def setup_webhook(webhook_url: str):
    """Устанавливаем webhook для Telegram"""
    await bot.delete_webhook(drop_pending_updates=True)
    await bot.set_webhook(webhook_url)
    log.info(f"Webhook установлен: {webhook_url}")


async def process_webhook_update(update_data: dict):
    """Обрабатываем входящий webhook от Telegram"""
    update = types.Update(**update_data)
    await dp.feed_update(bot, update)
