-- ==========================================
-- MyCash: Инициализация базы данных Supabase v2
-- Дата: 09.04.2026
-- ==========================================

-- =====================
-- 1. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
-- =====================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    first_name TEXT DEFAULT '',
    tariff TEXT DEFAULT 'free' CHECK (tariff IN ('free', 'pro', 'max')),
    tariff_until TIMESTAMPTZ,
    tariff_payment_method TEXT CHECK (tariff_payment_method IN ('yukassa', 'stars', 'robokassa')),
    is_demo BOOLEAN DEFAULT TRUE,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 2. ЛИМИТЫ ТАРИФОВ (настраиваемые без изменения кода)
-- =====================
CREATE TABLE tariff_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff TEXT UNIQUE NOT NULL,
    max_wallets INTEGER NOT NULL,
    max_daily_operations INTEGER NOT NULL,
    custom_categories BOOLEAN NOT NULL,
    export_excel BOOLEAN NOT NULL,
    business_directions BOOLEAN NOT NULL,
    table_analytics BOOLEAN NOT NULL,
    price_rub INTEGER NOT NULL
);

-- Заполняем лимиты тарифов
INSERT INTO tariff_limits (tariff, max_wallets, max_daily_operations, custom_categories, export_excel, business_directions, table_analytics, price_rub)
VALUES
    ('free', 2, 10, false, false, false, false, 0),
    ('pro', 10, 9999, true, true, false, true, 149),
    ('max', 50, 9999, true, true, true, true, 500);

-- =====================
-- 3. КОШЕЛЬКИ
-- =====================
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'credit-card',
    color TEXT DEFAULT '#F2F2F7',
    initial_balance NUMERIC DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- =====================
-- 4. ОПЕРАЦИИ
-- =====================
CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
    amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 10000000),
    category TEXT,
    wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    wallet_from_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    wallet_to_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    comment TEXT DEFAULT '',
    date TIMESTAMPTZ NOT NULL,
    is_demo BOOLEAN DEFAULT FALSE,
    synced BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 5. ПОЛЬЗОВАТЕЛЬСКИЕ КАТЕГОРИИ (Pro/Макс)
-- =====================
CREATE TABLE custom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 6. НАПРАВЛЕНИЯ БИЗНЕСА (Макс)
-- =====================
CREATE TABLE business_directions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 7. ИСТОРИЯ ОПЛАТ
-- =====================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('yukassa', 'stars', 'robokassa')),
    tariff TEXT NOT NULL CHECK (tariff IN ('pro', 'max')),
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'RUB',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    external_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 8. ОЧЕРЕДЬ СИНХРОНИЗАЦИИ (оффлайн)
-- =====================
CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    entity TEXT NOT NULL CHECK (entity IN ('operation', 'wallet')),
    entity_id UUID NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- =====================
-- 9. ИНДЕКСЫ
-- =====================
CREATE INDEX idx_operations_user_date ON operations(user_id, date DESC);
CREATE INDEX idx_operations_user_type ON operations(user_id, type);
CREATE INDEX idx_operations_user_demo ON operations(user_id, is_demo);
CREATE INDEX idx_operations_user_created ON operations(user_id, date);
CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_custom_categories_user ON custom_categories(user_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_sync_queue_user ON sync_queue(user_id, processed_at);

-- =====================
-- 10. RLS (Row Level Security)
-- =====================

-- Включаем RLS на всех таблицах
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_limits ENABLE ROW LEVEL SECURITY;

-- tariff_limits — чтение для всех (публичная таблица)
CREATE POLICY "Лимиты тарифов доступны всем" ON tariff_limits FOR SELECT USING (true);

-- Остальные таблицы — доступ через service_role ключ (API на VPS)
-- Фронтенд НЕ обращается к Supabase напрямую
-- Все запросы идут через FastAPI → Supabase (service_role)
-- Поэтому RLS-политики разрешают всё для service_role

CREATE POLICY "Service role: users SELECT" ON users FOR SELECT USING (true);
CREATE POLICY "Service role: users INSERT" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: users UPDATE" ON users FOR UPDATE USING (true);
CREATE POLICY "Service role: users DELETE" ON users FOR DELETE USING (true);

CREATE POLICY "Service role: wallets SELECT" ON wallets FOR SELECT USING (true);
CREATE POLICY "Service role: wallets INSERT" ON wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: wallets UPDATE" ON wallets FOR UPDATE USING (true);
CREATE POLICY "Service role: wallets DELETE" ON wallets FOR DELETE USING (true);

CREATE POLICY "Service role: operations SELECT" ON operations FOR SELECT USING (true);
CREATE POLICY "Service role: operations INSERT" ON operations FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: operations UPDATE" ON operations FOR UPDATE USING (true);
CREATE POLICY "Service role: operations DELETE" ON operations FOR DELETE USING (true);

CREATE POLICY "Service role: custom_categories SELECT" ON custom_categories FOR SELECT USING (true);
CREATE POLICY "Service role: custom_categories INSERT" ON custom_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: custom_categories UPDATE" ON custom_categories FOR UPDATE USING (true);
CREATE POLICY "Service role: custom_categories DELETE" ON custom_categories FOR DELETE USING (true);

CREATE POLICY "Service role: business_directions SELECT" ON business_directions FOR SELECT USING (true);
CREATE POLICY "Service role: business_directions INSERT" ON business_directions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: business_directions UPDATE" ON business_directions FOR UPDATE USING (true);
CREATE POLICY "Service role: business_directions DELETE" ON business_directions FOR DELETE USING (true);

CREATE POLICY "Service role: payments SELECT" ON payments FOR SELECT USING (true);
CREATE POLICY "Service role: payments INSERT" ON payments FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role: sync_queue SELECT" ON sync_queue FOR SELECT USING (true);
CREATE POLICY "Service role: sync_queue INSERT" ON sync_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role: sync_queue UPDATE" ON sync_queue FOR UPDATE USING (true);
CREATE POLICY "Service role: sync_queue DELETE" ON sync_queue FOR DELETE USING (true);
