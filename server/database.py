"""
Подключение к Supabase
Используем service_role ключ — полный доступ к базе
"""
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# Клиент Supabase с service_role (обходит RLS)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
