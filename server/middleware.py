"""
Middleware: проверка JWT-токена в каждом запросе
"""
from fastapi import Request, HTTPException
from auth import decode_jwt_token


async def get_current_user(request: Request) -> dict:
    """
    Извлекает и проверяет JWT из заголовка Authorization.
    Возвращает payload: { user_id, telegram_id, tariff }
    Вызывает 401 если токен невалиден.
    """
    auth_header = request.headers.get('Authorization', '')

    if not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Токен не передан')

    token = auth_header[7:]  # Убираем "Bearer "
    payload = decode_jwt_token(token)

    if not payload:
        raise HTTPException(status_code=401, detail='Невалидный или просроченный токен')

    # Проверяем блокировку (через Supabase)
    from database import supabase
    user = supabase.table('users').select('is_blocked').eq('id', payload['user_id']).single().execute()
    if user.data and user.data.get('is_blocked'):
        raise HTTPException(status_code=403, detail='Аккаунт заблокирован')

    return payload
