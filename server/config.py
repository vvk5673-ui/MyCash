"""
Конфигурация сервера MyCash
Все секреты загружаются из .env
"""
import os
from dotenv import load_dotenv

# Загружаем .env из корня проекта
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Telegram
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
ADMIN_TELEGRAM_ID = int(os.getenv('ADMIN_TELEGRAM_ID', '0'))

# Секретный токен вебхука. Telegram присылает его в заголовке
# X-Telegram-Bot-Api-Secret-Token — так мы отличаем настоящие запросы от чужих.
WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET')

# Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

# JWT — отдельный секрет для подписи токенов API (НЕ токен бота).
# Обязателен: задаётся в .env. Если не задан — приложение не должно стартовать.
JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24

if not JWT_SECRET:
    raise RuntimeError(
        'JWT_SECRET не задан в .env. Сгенерируйте его: '
        'python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )

# Сервер
HOST = os.getenv('API_HOST', '0.0.0.0')
PORT = int(os.getenv('API_PORT', '8000'))
