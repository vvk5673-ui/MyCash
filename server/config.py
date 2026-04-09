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

# Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

# JWT
JWT_SECRET = os.getenv('JWT_SECRET', BOT_TOKEN)  # Используем BOT_TOKEN как секрет для JWT
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24

# Сервер
HOST = os.getenv('API_HOST', '0.0.0.0')
PORT = int(os.getenv('API_PORT', '8000'))
