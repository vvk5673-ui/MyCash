"""
MyCash Bot — ЛОКАЛЬНАЯ версия (polling)
Используется для разработки и тестирования без VPS.

Для продакшена (VPS) используется server/bot.py (webhook).
"""

import asyncio
import logging
import os
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, MenuButtonWebApp
)

# Загружаем токен из .env
load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Адрес Mini App (пока GitHub Pages). ?v= для сброса кеша Telegram
WEBAPP_URL = "https://vvk5673-ui.github.io/MyCash/?v=8"

# Логирование
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# Создаём бота и диспетчер
bot = Bot(token=TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    """Обработка команды /start"""
    # Кнопка открытия Mini App
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="📊 Открыть MyCash",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )],
        [InlineKeyboardButton(
            text="🎤 Голосовой ввод",
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


async def setup_menu_button():
    """Устанавливаем кнопку Mini App в меню бота"""
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="📊 MyCash",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        )
        log.info("Кнопка меню Mini App установлена")
    except Exception as e:
        log.warning(f"Не удалось установить кнопку меню: {e}")


async def main():
    """Запуск бота"""
    log.info("Бот MyCash запускается...")
    # Сброс старой сессии перед запуском
    await bot.delete_webhook(drop_pending_updates=True)
    log.info("Старая сессия сброшена")
    await setup_menu_button()
    await dp.start_polling(bot, drop_pending_updates=True)


if __name__ == "__main__":
    asyncio.run(main())
