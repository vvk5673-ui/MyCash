"""
MyCash API Server
FastAPI + Supabase
"""
from datetime import datetime, date, timezone
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from config import HOST, PORT
from database import supabase
from auth import verify_telegram_init_data, create_jwt_token
from middleware import get_current_user
from demo_data import generate_demo_operations

app = FastAPI(title='MyCash API', version='1.0')

# CORS — разрешаем запросы с GitHub Pages и локального файла
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],  # На продакшене заменить на конкретные домены
    allow_methods=['*'],
    allow_headers=['*'],
)


# ==========================================
# МОДЕЛИ ЗАПРОСОВ
# ==========================================

class AuthRequest(BaseModel):
    init_data: str

class OperationCreate(BaseModel):
    type: str = Field(..., pattern='^(expense|income|transfer)$')
    amount: float = Field(..., gt=0, le=10000000)
    category: Optional[str] = None
    wallet_id: Optional[str] = None
    wallet_from_id: Optional[str] = None
    wallet_to_id: Optional[str] = None
    comment: str = ''
    date: str  # ISO формат

class OperationUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    wallet_id: Optional[str] = None
    comment: Optional[str] = None
    date: Optional[str] = None

class WalletCreate(BaseModel):
    name: str
    icon: str = 'credit-card'
    color: str = '#F2F2F7'
    initial_balance: float = 0

class WalletUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    initial_balance: Optional[float] = None

class SetBalances(BaseModel):
    card_balance: float = 0
    cash_balance: float = 0


# ==========================================
# 1. АВТОРИЗАЦИЯ
# ==========================================

@app.post('/v1/auth/telegram')
async def auth_telegram(body: AuthRequest):
    """
    Авторизация через Telegram initData.
    Проверяет подпись, создаёт/находит пользователя, возвращает JWT.
    """
    # Проверяем подпись Telegram
    user_data = verify_telegram_init_data(body.init_data)

    if not user_data:
        raise HTTPException(status_code=401, detail='Невалидная подпись Telegram')

    telegram_id = user_data.get('id')
    first_name = user_data.get('first_name', '')

    # Ищем пользователя в базе
    result = supabase.table('users').select('*').eq('telegram_id', telegram_id).execute()

    if result.data:
        # Пользователь найден — обновляем имя
        user = result.data[0]
        supabase.table('users').update({
            'first_name': first_name,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', user['id']).execute()
    else:
        # Новый пользователь — создаём
        user_result = supabase.table('users').insert({
            'telegram_id': telegram_id,
            'first_name': first_name
        }).execute()
        user = user_result.data[0]

        # Создаём 2 кошелька по умолчанию
        card = supabase.table('wallets').insert({
            'user_id': user['id'],
            'name': 'Карта',
            'icon': 'credit-card',
            'color': '#F2F2F7',
            'sort_order': 0
        }).execute()

        cash = supabase.table('wallets').insert({
            'user_id': user['id'],
            'name': 'Наличка',
            'icon': 'banknote',
            'color': '#F2F2F7',
            'sort_order': 1
        }).execute()

        # Создаём демо-данные
        demo_ops = generate_demo_operations(
            user['id'],
            card.data[0]['id'],
            cash.data[0]['id']
        )
        if demo_ops:
            supabase.table('operations').insert(demo_ops).execute()

    # Генерируем JWT
    token = create_jwt_token(user['id'], telegram_id, user.get('tariff', 'free'))

    return {
        'token': token,
        'user': {
            'id': user['id'],
            'first_name': first_name,
            'tariff': user.get('tariff', 'free'),
            'tariff_until': user.get('tariff_until'),
            'is_demo': user.get('is_demo', True)
        }
    }


# ==========================================
# 2. ОПЕРАЦИИ
# ==========================================

@app.get('/v1/operations')
async def get_operations(
    period: str = 'month',
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Список операций за период + итоги"""
    user_id = current_user['user_id']
    now = datetime.now()

    # Определяем диапазон дат
    if period == 'today':
        start = datetime(now.year, now.month, now.day)
        end = start.replace(hour=23, minute=59, second=59)
    elif period == 'week':
        start = now - __import__('datetime').timedelta(days=7)
        end = now
    elif period == 'year':
        y = year or now.year
        start = datetime(y, 1, 1)
        end = datetime(y, 12, 31, 23, 59, 59)
    else:  # month
        y = year or now.year
        m = month or now.month
        start = datetime(y, m, 1)
        # Последний день месяца
        if m == 12:
            end = datetime(y + 1, 1, 1) - __import__('datetime').timedelta(seconds=1)
        else:
            end = datetime(y, m + 1, 1) - __import__('datetime').timedelta(seconds=1)

    # Запрос операций
    result = supabase.table('operations') \
        .select('*') \
        .eq('user_id', user_id) \
        .gte('date', start.isoformat()) \
        .lte('date', end.isoformat()) \
        .order('date', desc=True) \
        .execute()

    operations = result.data or []

    # Считаем итоги
    income = sum(op['amount'] for op in operations if op['type'] == 'income')
    expense = sum(op['amount'] for op in operations if op['type'] == 'expense')

    return {
        'operations': operations,
        'summary': {
            'income': income,
            'expense': expense,
            'balance': income - expense
        }
    }


@app.post('/v1/operations')
async def create_operation(body: OperationCreate, current_user: dict = Depends(get_current_user)):
    """Создать операцию (с проверкой лимита)"""
    user_id = current_user['user_id']
    tariff = current_user['tariff']

    # Проверяем лимит для бесплатного тарифа
    if tariff == 'free':
        today = date.today().isoformat()
        today_ops = supabase.table('operations') \
            .select('id', count='exact') \
            .eq('user_id', user_id) \
            .eq('is_demo', False) \
            .gte('created_at', today + 'T00:00:00') \
            .execute()

        limits = supabase.table('tariff_limits').select('max_daily_operations').eq('tariff', 'free').single().execute()
        max_ops = limits.data['max_daily_operations'] if limits.data else 10

        if today_ops.count and today_ops.count >= max_ops:
            raise HTTPException(
                status_code=429,
                detail=f'Лимит {max_ops} операций в день. Обновите тариф для безлимита.'
            )

    # Создаём операцию
    op_data = {
        'user_id': user_id,
        'type': body.type,
        'amount': body.amount,
        'category': body.category,
        'wallet_id': body.wallet_id,
        'wallet_from_id': body.wallet_from_id,
        'wallet_to_id': body.wallet_to_id,
        'comment': body.comment,
        'date': body.date,
        'is_demo': False
    }

    result = supabase.table('operations').insert(op_data).execute()
    return result.data[0]


@app.put('/v1/operations/{op_id}')
async def update_operation(op_id: str, body: OperationUpdate, current_user: dict = Depends(get_current_user)):
    """Редактировать операцию"""
    user_id = current_user['user_id']

    # Проверяем что операция принадлежит пользователю
    existing = supabase.table('operations').select('id').eq('id', op_id).eq('user_id', user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail='Операция не найдена')

    # Обновляем только переданные поля
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='Нечего обновлять')

    result = supabase.table('operations').update(update_data).eq('id', op_id).execute()
    return result.data[0]


@app.delete('/v1/operations/{op_id}')
async def delete_operation(op_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить операцию"""
    user_id = current_user['user_id']
    result = supabase.table('operations').delete().eq('id', op_id).eq('user_id', user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail='Операция не найдена')
    return {'ok': True}


# ==========================================
# 3. КОШЕЛЬКИ
# ==========================================

@app.get('/v1/wallets')
async def get_wallets(current_user: dict = Depends(get_current_user)):
    """Список кошельков с балансами"""
    user_id = current_user['user_id']

    wallets = supabase.table('wallets').select('*').eq('user_id', user_id).order('sort_order').execute()
    operations = supabase.table('operations').select('type,amount,wallet_id,wallet_from_id,wallet_to_id').eq('user_id', user_id).execute()

    wallet_list = []
    total_balance = 0

    for w in (wallets.data or []):
        balance = float(w.get('initial_balance', 0) or 0)

        for op in (operations.data or []):
            if op['type'] == 'income' and op.get('wallet_id') == w['id']:
                balance += float(op['amount'])
            elif op['type'] == 'expense' and op.get('wallet_id') == w['id']:
                balance -= float(op['amount'])
            elif op['type'] == 'transfer':
                if op.get('wallet_to_id') == w['id']:
                    balance += float(op['amount'])
                if op.get('wallet_from_id') == w['id']:
                    balance -= float(op['amount'])

        total_balance += balance
        wallet_list.append({**w, 'balance': balance})

    return {
        'wallets': wallet_list,
        'total_balance': total_balance
    }


@app.post('/v1/wallets')
async def create_wallet(body: WalletCreate, current_user: dict = Depends(get_current_user)):
    """Создать кошелёк (Pro/Макс)"""
    user_id = current_user['user_id']
    tariff = current_user['tariff']

    # Проверяем лимит кошельков
    existing = supabase.table('wallets').select('id', count='exact').eq('user_id', user_id).execute()
    limits = supabase.table('tariff_limits').select('max_wallets').eq('tariff', tariff).single().execute()
    max_wallets = limits.data['max_wallets'] if limits.data else 2

    if existing.count and existing.count >= max_wallets:
        raise HTTPException(status_code=429, detail=f'Лимит {max_wallets} кошельков для тарифа {tariff}')

    result = supabase.table('wallets').insert({
        'user_id': user_id,
        'name': body.name,
        'icon': body.icon,
        'color': body.color,
        'initial_balance': body.initial_balance,
        'sort_order': existing.count or 0
    }).execute()
    return result.data[0]


@app.put('/v1/wallets/{wallet_id}')
async def update_wallet(wallet_id: str, body: WalletUpdate, current_user: dict = Depends(get_current_user)):
    """Обновить кошелёк"""
    user_id = current_user['user_id']
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='Нечего обновлять')

    result = supabase.table('wallets').update(update_data).eq('id', wallet_id).eq('user_id', user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail='Кошелёк не найден')
    return result.data[0]


# ==========================================
# 4. ДАШБОРД
# ==========================================

@app.get('/v1/dashboard')
async def get_dashboard(
    period: str = 'month',
    type: str = 'expense',
    current_user: dict = Depends(get_current_user)
):
    """Суммы по категориям за период"""
    user_id = current_user['user_id']
    now = datetime.now()

    # Диапазон дат (аналогично get_operations)
    if period == 'today':
        start = datetime(now.year, now.month, now.day)
    elif period == 'week':
        start = now - __import__('datetime').timedelta(days=7)
    elif period == 'year':
        start = datetime(now.year, 1, 1)
    else:
        start = datetime(now.year, now.month, 1)

    result = supabase.table('operations') \
        .select('category,amount') \
        .eq('user_id', user_id) \
        .eq('type', type) \
        .gte('date', start.isoformat()) \
        .execute()

    # Группируем по категориям
    categories = {}
    for op in (result.data or []):
        cat = op.get('category', 'Прочее') or 'Прочее'
        categories[cat] = categories.get(cat, 0) + float(op['amount'])

    # Сортируем по сумме
    sorted_cats = sorted(categories.items(), key=lambda x: x[1], reverse=True)

    return {
        'by_category': [{'category': cat, 'total': total} for cat, total in sorted_cats],
        'total': sum(categories.values())
    }


# ==========================================
# 5. ПОЛЬЗОВАТЕЛЬ
# ==========================================

@app.get('/v1/user/profile')
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Профиль пользователя + лимиты тарифа"""
    user_id = current_user['user_id']

    user = supabase.table('users').select('*').eq('id', user_id).single().execute()
    tariff = user.data.get('tariff', 'free')
    limits = supabase.table('tariff_limits').select('*').eq('tariff', tariff).single().execute()

    # Считаем операции за сегодня
    today = date.today().isoformat()
    today_ops = supabase.table('operations') \
        .select('id', count='exact') \
        .eq('user_id', user_id) \
        .eq('is_demo', False) \
        .gte('created_at', today + 'T00:00:00') \
        .execute()

    return {
        'user': user.data,
        'limits': limits.data,
        'today_operations': today_ops.count or 0
    }


@app.post('/v1/user/clear-demo')
async def clear_demo(current_user: dict = Depends(get_current_user)):
    """Очистить демо-данные"""
    user_id = current_user['user_id']

    supabase.table('operations').delete().eq('user_id', user_id).eq('is_demo', True).execute()
    supabase.table('users').update({'is_demo': False}).eq('id', user_id).execute()

    return {'ok': True}


@app.post('/v1/user/set-balances')
async def set_balances(body: SetBalances, current_user: dict = Depends(get_current_user)):
    """Установить начальные остатки (онбординг)"""
    user_id = current_user['user_id']

    wallets = supabase.table('wallets').select('id,name').eq('user_id', user_id).order('sort_order').execute()

    for w in (wallets.data or []):
        if w['name'] == 'Карта':
            supabase.table('wallets').update({'initial_balance': body.card_balance}).eq('id', w['id']).execute()
        elif w['name'] == 'Наличка':
            supabase.table('wallets').update({'initial_balance': body.cash_balance}).eq('id', w['id']).execute()

    return {'ok': True}


@app.delete('/v1/user/account')
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Полное удаление аккаунта и всех данных"""
    user_id = current_user['user_id']
    # CASCADE удалит все связанные данные (кошельки, операции, категории, платежи)
    supabase.table('users').delete().eq('id', user_id).execute()
    return {'ok': True, 'message': 'Аккаунт и все данные удалены'}


# ==========================================
# 6. ЗДОРОВЬЕ СЕРВЕРА
# ==========================================

@app.get('/v1/health')
async def health():
    """Проверка что сервер работает"""
    return {'status': 'ok', 'version': '1.0'}


# ==========================================
# ЗАПУСК
# ==========================================

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
