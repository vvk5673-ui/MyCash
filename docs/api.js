/**
 * MyCash API — модуль связи фронтенда с сервером
 *
 * Логика:
 * 1. Пытается работать через сервер (FastAPI)
 * 2. Если сервер недоступен — работает через localStorage (оффлайн)
 * 3. При появлении интернета — синхронизирует данные
 */

const API = (function() {
'use strict';

// URL API сервера на VPS (Beget)
// Можно переопределить через localStorage.setItem('mycash_api_url', '...')
const BASE_URL = localStorage.getItem('mycash_api_url') || 'https://mycash-app.ru';
// JWT-токен (хранится в памяти, не в localStorage)
let authToken = null;
// Режим работы: 'online' или 'offline'
let mode = 'offline';
// Кэш данных (5 минут)
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// ==========================================
// ВНУТРЕННИЕ ФУНКЦИИ
// ==========================================

// HTTP-запрос к серверу
async function request(method, endpoint, body) {
    // Блокируем запросы если нет BASE_URL или если мы в offline И это не auth
    // (auth должен иметь возможность переключить mode в online)
    if (!BASE_URL) {
        throw new Error('offline');
    }
    if (mode === 'offline' && endpoint !== '/v1/auth/telegram') {
        throw new Error('offline');
    }

    const headers = {
        'Content-Type': 'application/json'
    };
    if (authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(BASE_URL + endpoint, options);

        if (response.status === 401) {
            authToken = null;
            throw new Error('unauthorized');
        }
        if (response.status === 429) {
            const data = await response.json();
            throw new Error('limit:' + (data.detail || 'Лимит превышен'));
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.detail || 'Ошибка сервера');
        }

        return await response.json();
    } catch (e) {
        if (e.message === 'unauthorized' || e.message.startsWith('limit:')) {
            throw e;
        }
        // Сеть недоступна — переключаемся в оффлайн
        mode = 'offline';
        throw new Error('offline');
    }
}

// Кэширование
function getCached(key) {
    const item = cache[key];
    if (item && Date.now() - item.time < CACHE_TTL) {
        return item.data;
    }
    return null;
}

function setCache(key, data) {
    cache[key] = { data, time: Date.now() };
}

function clearCache() {
    Object.keys(cache).forEach(k => delete cache[k]);
}

// localStorage обёртка (из текущего app.js)
function localLoad(key) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
    } catch (e) {
        return null;
    }
}

function localSave(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================

async function auth(initData) {
    if (!BASE_URL) {
        mode = 'offline';
        return null;
    }

    try {
        const result = await request('POST', '/v1/auth/telegram', { init_data: initData });
        authToken = result.token;
        mode = 'online';
        return result.user;
    } catch (e) {
        mode = 'offline';
        return null;
    }
}

// ==========================================
// ОПЕРАЦИИ
// ==========================================

async function getOperations(period, year, month) {
    // Пробуем из кэша
    const cacheKey = 'ops_' + period + '_' + year + '_' + month;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    // Пробуем с сервера
    if (mode === 'online') {
        try {
            let url = '/v1/operations?period=' + period;
            if (year) url += '&year=' + year;
            if (month) url += '&month=' + month;
            const result = await request('GET', url);
            setCache(cacheKey, result);
            // Сохраняем копию в localStorage
            localSave('mycash_ops_cache', result.operations);
            return result;
        } catch (e) {
            // Фоллбек на localStorage
        }
    }

    // Оффлайн: берём из localStorage
    const ops = localLoad('mycash_ops') || [];
    const filtered = filterByPeriodLocal(ops, period);
    let income = 0, expense = 0;
    filtered.forEach(op => {
        if (op.type === 'income') income += op.amount;
        else if (op.type === 'expense') expense += op.amount;
    });

    return {
        operations: filtered,
        summary: { income, expense, balance: income - expense }
    };
}

async function createOperation(opData) {
    clearCache();

    if (mode === 'online') {
        try {
            const result = await request('POST', '/v1/operations', opData);
            return result;
        } catch (e) {
            if (e.message.startsWith('limit:')) {
                throw e; // Пробрасываем ошибку лимита
            }
            // Фоллбек на localStorage
        }
    }

    // Оффлайн: сохраняем локально
    const ops = localLoad('mycash_ops') || [];
    const localOp = {
        ...opData,
        id: 'local_' + Date.now(),
        synced: false,
        created_at: new Date().toISOString()
    };
    ops.unshift(localOp);
    localSave('mycash_ops', ops);

    // Добавляем в очередь синхронизации
    addToSyncQueue('create', 'operation', localOp.id, localOp);

    return localOp;
}

async function updateOperation(opId, opData) {
    clearCache();

    if (mode === 'online') {
        try {
            return await request('PUT', '/v1/operations/' + opId, opData);
        } catch (e) {
            // Фоллбек
        }
    }

    // Оффлайн
    const ops = localLoad('mycash_ops') || [];
    const idx = ops.findIndex(op => op.id === opId);
    if (idx >= 0) {
        Object.assign(ops[idx], opData, { synced: false });
        localSave('mycash_ops', ops);
        addToSyncQueue('update', 'operation', opId, opData);
    }
    return ops[idx];
}

async function deleteOperation(opId) {
    clearCache();

    if (mode === 'online') {
        try {
            return await request('DELETE', '/v1/operations/' + opId);
        } catch (e) {
            // Фоллбек
        }
    }

    // Оффлайн
    const ops = localLoad('mycash_ops') || [];
    const filtered = ops.filter(op => op.id !== opId);
    localSave('mycash_ops', filtered);
    addToSyncQueue('delete', 'operation', opId, {});
    return { ok: true };
}

// ==========================================
// КОШЕЛЬКИ
// ==========================================

async function getWallets() {
    const cached = getCached('wallets');
    if (cached) return cached;

    if (mode === 'online') {
        try {
            const result = await request('GET', '/v1/wallets');
            setCache('wallets', result);
            return result;
        } catch (e) {
            // Фоллбек
        }
    }

    // Оффлайн: вычисляем из localStorage
    return null; // app.js использует свою логику
}

async function updateWallet(walletId, data) {
    clearCache();
    if (mode === 'online') {
        try {
            return await request('PUT', '/v1/wallets/' + walletId, data);
        } catch (e) {}
    }
    return null;
}

// ==========================================
// ДАШБОРД
// ==========================================

async function getDashboard(period, type) {
    const cacheKey = 'dash_' + period + '_' + type;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    if (mode === 'online') {
        try {
            const result = await request('GET', '/v1/dashboard?period=' + period + '&type=' + type);
            setCache(cacheKey, result);
            return result;
        } catch (e) {}
    }

    return null; // app.js использует свою логику
}

// ==========================================
// ПОЛЬЗОВАТЕЛЬ
// ==========================================

async function getProfile() {
    if (mode === 'online') {
        try {
            return await request('GET', '/v1/user/profile');
        } catch (e) {}
    }
    return null;
}

async function clearDemo() {
    clearCache();
    if (mode === 'online') {
        try {
            return await request('POST', '/v1/user/clear-demo');
        } catch (e) {}
    }
    return null;
}

async function setBalances(cardBalance, cashBalance) {
    clearCache();
    if (mode === 'online') {
        try {
            return await request('POST', '/v1/user/set-balances', {
                card_balance: cardBalance,
                cash_balance: cashBalance
            });
        } catch (e) {}
    }
    return null;
}

async function deleteAccount() {
    if (mode === 'online') {
        try {
            return await request('DELETE', '/v1/user/account');
        } catch (e) {}
    }
    return null;
}

// ==========================================
// СИНХРОНИЗАЦИЯ (оффлайн → сервер)
// ==========================================

function addToSyncQueue(action, entity, entityId, data) {
    const queue = localLoad('mycash_sync_queue') || [];
    queue.push({
        action,
        entity,
        entity_id: entityId,
        data,
        created_at: new Date().toISOString()
    });
    localSave('mycash_sync_queue', queue);
}

async function syncOfflineData() {
    if (mode !== 'online') return;

    const queue = localLoad('mycash_sync_queue') || [];
    if (queue.length === 0) return;

    let synced = 0;
    const remaining = [];

    for (const item of queue) {
        try {
            if (item.entity === 'operation') {
                if (item.action === 'create') {
                    await request('POST', '/v1/operations', item.data);
                } else if (item.action === 'update') {
                    await request('PUT', '/v1/operations/' + item.entity_id, item.data);
                } else if (item.action === 'delete') {
                    await request('DELETE', '/v1/operations/' + item.entity_id);
                }
            }
            synced++;
        } catch (e) {
            remaining.push(item);
        }
    }

    localSave('mycash_sync_queue', remaining);

    if (synced > 0) {
        clearCache();
        console.log('Синхронизировано: ' + synced + ' операций');
    }
}

// Проверяем соединение каждые 30 секунд
setInterval(async function() {
    if (mode === 'offline' && BASE_URL) {
        try {
            await fetch(BASE_URL + '/v1/health');
            mode = 'online';
            await syncOfflineData();
        } catch (e) {}
    }
}, 30000);

// ==========================================
// УТИЛИТЫ
// ==========================================

function filterByPeriodLocal(ops, period) {
    const now = new Date();
    return ops.filter(op => {
        const d = new Date(op.date);
        if (period === 'today') return d.toDateString() === now.toDateString();
        if (period === 'week') {
            const week = new Date(now);
            week.setDate(week.getDate() - 7);
            return d >= week;
        }
        if (period === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (period === 'year') {
            return d.getFullYear() === now.getFullYear();
        }
        return true;
    });
}

function isOnline() {
    return mode === 'online';
}

function getMode() {
    return mode;
}

// ==========================================
// ПУБЛИЧНЫЙ ИНТЕРФЕЙС
// ==========================================

return {
    auth,
    getOperations,
    createOperation,
    updateOperation,
    deleteOperation,
    getWallets,
    updateWallet,
    getDashboard,
    getProfile,
    clearDemo,
    setBalances,
    deleteAccount,
    syncOfflineData,
    isOnline,
    getMode,
    clearCache
};

})();
