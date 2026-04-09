"""
Авторизация через Telegram initData
Проверка HMAC-подписи + генерация JWT
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote
from datetime import datetime, timedelta, timezone

import jwt
from config import BOT_TOKEN, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS


def verify_telegram_init_data(init_data: str) -> dict | None:
    """
    Проверяет подпись Telegram initData.
    Возвращает данные пользователя или None если подпись невалидна.

    Как работает:
    1. Telegram подписывает данные через HMAC-SHA256 с секретным ключом
    2. Секретный ключ = HMAC-SHA256(BOT_TOKEN, "WebAppData")
    3. Мы вычисляем подпись и сравниваем с переданной
    """
    try:
        # Парсим строку initData
        parsed = parse_qs(init_data)

        # Извлекаем hash (подпись от Telegram)
        received_hash = parsed.get('hash', [None])[0]
        if not received_hash:
            return None

        # Собираем строку для проверки (все параметры кроме hash, отсортированные)
        data_check_pairs = []
        for key, values in parsed.items():
            if key == 'hash':
                continue
            data_check_pairs.append(f"{key}={values[0]}")
        data_check_pairs.sort()
        data_check_string = '\n'.join(data_check_pairs)

        # Вычисляем секретный ключ: HMAC-SHA256(BOT_TOKEN, "WebAppData")
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()

        # Вычисляем подпись данных
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        # Сравниваем подписи
        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        # Проверяем что данные не старше 1 часа
        auth_date = int(parsed.get('auth_date', [0])[0])
        if time.time() - auth_date > 3600:
            return None

        # Извлекаем данные пользователя
        user_data = parsed.get('user', [None])[0]
        if user_data:
            return json.loads(unquote(user_data))

        return None

    except Exception:
        return None


def create_jwt_token(user_id: str, telegram_id: int, tariff: str) -> str:
    """
    Создаёт JWT-токен для авторизации API-запросов.
    Payload: user_id, telegram_id, tariff, exp
    """
    payload = {
        'user_id': user_id,
        'telegram_id': telegram_id,
        'tariff': tariff,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt_token(token: str) -> dict | None:
    """
    Декодирует JWT-токен. Возвращает payload или None если невалиден.
    """
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
