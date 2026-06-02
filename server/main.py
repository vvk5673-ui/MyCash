"""
MyCash API Server
FastAPI + Supabase
"""
from datetime import datetime, date, timezone
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

import logging
import hmac
from contextlib import asynccontextmanager

from logger import setup_logging
# Настраиваем логирование ДО импорта остальных модулей,
# чтобы их логи тоже попали в файл
setup_logging()

from config import HOST, PORT, BOT_TOKEN, WEBHOOK_SECRET
from database import supabase
from auth import verify_telegram_init_data, create_jwt_token
from middleware import get_current_user
from demo_data import generate_demo_operations
from dds_defaults import seed_user_defaults
from bot import bot as tg_bot, dp as tg_dp, setup_webhook, setup_bot_commands, setup_scheduler, process_webhook_update

log = logging.getLogger('mycash.api')

@asynccontextmanager
async def lifespan(app):
    """Запуск и остановка бота вместе с сервером"""
    # При старте сервера
    log.info("Запуск MyCash API + Bot...")
    await setup_bot_commands()
    setup_scheduler()
    # Webhook будет установлен после деплоя на VPS
    # await setup_webhook(f"https://your-domain.com/bot/webhook")
    yield
    # При остановке сервера
    await tg_bot.session.close()
    log.info("Сервер остановлен")


app = FastAPI(title='MyCash API', version='1.0', lifespan=lifespan)

# CORS — разрешаем запросы с GitHub Pages и локального файла
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],  # На продакшене заменить на конкретные домены
    allow_methods=['*'],
    allow_headers=['*'],
)


# Глобальный обработчик: ловим все необработанные исключения и пишем в лог
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Логируем все необработанные ошибки с полным трейсбеком"""
    log.error(
        f'Необработанная ошибка в {request.method} {request.url.path}: '
        f'{type(exc).__name__}: {exc}',
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={'detail': 'Внутренняя ошибка сервера'}
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Логируем HTTP-ошибки (400, 401, 404, 429 и т.д.)"""
    if exc.status_code >= 500:
        log.error(f'HTTP {exc.status_code} в {request.method} {request.url.path}: {exc.detail}')
    elif exc.status_code >= 400:
        log.warning(f'HTTP {exc.status_code} в {request.method} {request.url.path}: {exc.detail}')
    return JSONResponse(
        status_code=exc.status_code,
        content={'detail': exc.detail}
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
    # Новые поля Этапа 1 (структура ДДС)
    article_id: Optional[str] = None      # статья ДДС
    direction_id: Optional[str] = None    # направление
    contragent_id: Optional[str] = None   # контрагент
    purpose: str = ''                     # назначение платежа

class OperationUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    wallet_id: Optional[str] = None
    comment: Optional[str] = None
    date: Optional[str] = None
    article_id: Optional[str] = None
    direction_id: Optional[str] = None
    contragent_id: Optional[str] = None
    purpose: Optional[str] = None

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

class AccountingStart(BaseModel):
    date: Optional[str] = None   # 'YYYY-MM-01' или null (учитывать всё)

# --- Статьи ДДС ---
class ArticleCreate(BaseModel):
    name: str
    group_id: str                      # ссылка на dds_groups
    activity_kind_id: str              # ссылка на dds_activity_kinds
    description: str = ''
    icon: str = 'tag'
    color: str = '#F2F2F7'

class ArticleUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[str] = None
    activity_kind_id: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_archived: Optional[bool] = None

# --- Контрагенты ---
class ContragentCreate(BaseModel):
    name: str
    type: str = ''
    notes: str = ''

class ContragentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None

# --- Направления ---
class DirectionCreate(BaseModel):
    name: str
    icon: str = 'folder'
    color: str = '#F2F2F7'

class DirectionUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_archived: Optional[bool] = None


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

        # Засеваем структуру ДДС: 4 кошелька + 2 направления + 31 статью
        seed_result = seed_user_defaults(supabase, user['id'])
        wallet_ids = seed_result['wallet_id_by_name']

        # Карта «название статьи → id» — чтобы демо-операции привязались
        # к реальным статьям ДДС (для Отчёта ДДС и аналитики по статьям)
        user_articles = supabase.table('dds_articles') \
            .select('id, name').eq('user_id', user['id']).execute().data
        article_id_by_name = {a['name']: a['id'] for a in (user_articles or [])}

        # Создаём демо-данные на первых двух кошельках (Счёт №1 + Наличка)
        demo_ops = generate_demo_operations(
            user['id'],
            wallet_ids.get('Счёт №1'),
            wallet_ids.get('Наличка'),
            article_id_by_name
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

    # Базовый запрос
    query = supabase.table('operations').select('*').eq('user_id', user_id)

    # period='all' — без фильтра дат (нужно фронту для полной синхронизации).
    # Иначе фильтруем по выбранному диапазону.
    if period != 'all':
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
        query = query.gte('date', start.isoformat()).lte('date', end.isoformat())

    result = query.order('date', desc=True).execute()

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
        # Новые поля структуры ДДС
        'article_id': body.article_id,
        'direction_id': body.direction_id,
        'contragent_id': body.contragent_id,
        'purpose': body.purpose,
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
    user_row = supabase.table('users').select('accounting_start').eq('id', user_id).single().execute()
    accounting_start = user_row.data.get('accounting_start') if user_row.data else None

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
        'total_balance': total_balance,
        'accounting_start': accounting_start
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
# 3.5 СПРАВОЧНИКИ ДДС (статьи, контрагенты, направления, виды/группы)
# ==========================================

@app.get('/v1/refs')
async def get_refs(current_user: dict = Depends(get_current_user)):
    """
    Глобальные справочники: группы (Поступление/Выбытие) и виды деятельности.
    Они одинаковы для всех пользователей.
    """
    groups = supabase.table('dds_groups').select('*').order('sort_order').execute()
    kinds = supabase.table('dds_activity_kinds').select('*').order('sort_order').execute()
    return {
        'groups': groups.data or [],
        'activity_kinds': kinds.data or []
    }


# --- Статьи ДДС ---

@app.get('/v1/articles')
async def get_articles(current_user: dict = Depends(get_current_user)):
    """Список статей ДДС пользователя (не архивных — в начале)"""
    user_id = current_user['user_id']
    result = supabase.table('dds_articles') \
        .select('*') \
        .eq('user_id', user_id) \
        .order('is_archived') \
        .order('sort_order') \
        .execute()
    return {'articles': result.data or []}


@app.post('/v1/articles')
async def create_article(body: ArticleCreate, current_user: dict = Depends(get_current_user)):
    """Создать статью ДДС"""
    user_id = current_user['user_id']

    # Определяем sort_order = max + 1
    existing = supabase.table('dds_articles').select('sort_order').eq('user_id', user_id).order('sort_order', desc=True).limit(1).execute()
    next_order = (existing.data[0]['sort_order'] + 1) if existing.data else 1

    try:
        result = supabase.table('dds_articles').insert({
            'user_id': user_id,
            'name': body.name,
            'description': body.description,
            'group_id': body.group_id,
            'activity_kind_id': body.activity_kind_id,
            'icon': body.icon,
            'color': body.color,
            'sort_order': next_order
        }).execute()
    except Exception:
        raise HTTPException(status_code=400, detail='Статья с таким названием уже есть')
    return result.data[0]


@app.put('/v1/articles/{article_id}')
async def update_article(article_id: str, body: ArticleUpdate, current_user: dict = Depends(get_current_user)):
    """Редактировать статью ДДС"""
    user_id = current_user['user_id']
    existing = supabase.table('dds_articles').select('id').eq('id', article_id).eq('user_id', user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail='Статья не найдена')

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='Нечего обновлять')

    result = supabase.table('dds_articles').update(update_data).eq('id', article_id).execute()
    return result.data[0]


@app.delete('/v1/articles/{article_id}')
async def delete_article(article_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить статью ДДС (операции с этой статьёй сохранятся, ссылка обнулится)"""
    user_id = current_user['user_id']
    result = supabase.table('dds_articles').delete().eq('id', article_id).eq('user_id', user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail='Статья не найдена')
    return {'ok': True}


# --- Контрагенты ---

@app.get('/v1/contragents')
async def get_contragents(current_user: dict = Depends(get_current_user)):
    """Список контрагентов пользователя"""
    user_id = current_user['user_id']
    result = supabase.table('contragents') \
        .select('*') \
        .eq('user_id', user_id) \
        .order('is_archived') \
        .order('name') \
        .execute()
    return {'contragents': result.data or []}


@app.post('/v1/contragents')
async def create_contragent(body: ContragentCreate, current_user: dict = Depends(get_current_user)):
    """Создать контрагента"""
    user_id = current_user['user_id']
    try:
        result = supabase.table('contragents').insert({
            'user_id': user_id,
            'name': body.name,
            'type': body.type,
            'notes': body.notes
        }).execute()
    except Exception:
        raise HTTPException(status_code=400, detail='Контрагент с таким названием уже есть')
    return result.data[0]


@app.put('/v1/contragents/{contragent_id}')
async def update_contragent(contragent_id: str, body: ContragentUpdate, current_user: dict = Depends(get_current_user)):
    """Редактировать контрагента"""
    user_id = current_user['user_id']
    existing = supabase.table('contragents').select('id').eq('id', contragent_id).eq('user_id', user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail='Контрагент не найден')

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='Нечего обновлять')

    result = supabase.table('contragents').update(update_data).eq('id', contragent_id).execute()
    return result.data[0]


@app.delete('/v1/contragents/{contragent_id}')
async def delete_contragent(contragent_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить контрагента"""
    user_id = current_user['user_id']
    result = supabase.table('contragents').delete().eq('id', contragent_id).eq('user_id', user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail='Контрагент не найден')
    return {'ok': True}


# --- Направления ---

@app.get('/v1/directions')
async def get_directions(current_user: dict = Depends(get_current_user)):
    """Список направлений пользователя"""
    user_id = current_user['user_id']
    result = supabase.table('business_directions') \
        .select('*') \
        .eq('user_id', user_id) \
        .order('is_archived') \
        .order('sort_order') \
        .execute()
    return {'directions': result.data or []}


@app.post('/v1/directions')
async def create_direction(body: DirectionCreate, current_user: dict = Depends(get_current_user)):
    """Создать направление"""
    user_id = current_user['user_id']
    existing = supabase.table('business_directions').select('sort_order').eq('user_id', user_id).order('sort_order', desc=True).limit(1).execute()
    next_order = (existing.data[0]['sort_order'] + 1) if existing.data else 1

    try:
        result = supabase.table('business_directions').insert({
            'user_id': user_id,
            'name': body.name,
            'icon': body.icon,
            'color': body.color,
            'sort_order': next_order
        }).execute()
    except Exception:
        raise HTTPException(status_code=400, detail='Направление с таким названием уже есть')
    return result.data[0]


@app.put('/v1/directions/{direction_id}')
async def update_direction(direction_id: str, body: DirectionUpdate, current_user: dict = Depends(get_current_user)):
    """Редактировать направление"""
    user_id = current_user['user_id']
    existing = supabase.table('business_directions').select('id').eq('id', direction_id).eq('user_id', user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail='Направление не найдено')

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='Нечего обновлять')

    result = supabase.table('business_directions').update(update_data).eq('id', direction_id).execute()
    return result.data[0]


@app.delete('/v1/directions/{direction_id}')
async def delete_direction(direction_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить направление (операции сохранятся, ссылка обнулится)"""
    user_id = current_user['user_id']
    result = supabase.table('business_directions').delete().eq('id', direction_id).eq('user_id', user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail='Направление не найдено')
    return {'ok': True}


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


@app.post('/v1/user/clear-all')
async def clear_all(current_user: dict = Depends(get_current_user)):
    """Полный сброс данных к пустому старту.

    Удаляет ВСЕ операции (демо и реальные) и обнуляет остатки всех счетов.
    Сами счета, статьи, направления и аккаунт сохраняются — остаётся
    чистая структура без данных. Снимает метку «демо».
    """
    user_id = current_user['user_id']

    # Удаляем все операции пользователя
    supabase.table('operations').delete().eq('user_id', user_id).execute()
    # Обнуляем начальные остатки всех счетов
    supabase.table('wallets').update({'initial_balance': 0}).eq('user_id', user_id).execute()
    # Снимаем метку демо
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


@app.post('/v1/user/accounting-start')
async def set_accounting_start(body: AccountingStart, current_user: dict = Depends(get_current_user)):
    """Установить дату начала учёта (операции и остатки до неё не учитываются)"""
    user_id = current_user['user_id']
    supabase.table('users').update({'accounting_start': body.date}).eq('id', user_id).execute()
    return {'ok': True, 'accounting_start': body.date}


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
# 7. TELEGRAM WEBHOOK
# ==========================================

@app.post('/bot/webhook')
async def telegram_webhook(request: Request):
    """Принимаем обновления от Telegram.

    Сверяем секретный токен из заголовка X-Telegram-Bot-Api-Secret-Token.
    Если он не совпадает с нашим WEBHOOK_SECRET — это чужой запрос, отбрасываем.
    """
    received_secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
    if not hmac.compare_digest(received_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail='Неверный секрет вебхука')

    update_data = await request.json()
    await process_webhook_update(update_data)
    return {'ok': True}


# ==========================================
# ЗАПУСК
# ==========================================

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
