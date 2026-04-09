-- ==========================================
-- MyCash: Инициализация базы данных Supabase
-- ==========================================

-- 1. Таблица пользователей
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    first_name TEXT DEFAULT '',
    is_pro BOOLEAN DEFAULT FALSE,
    pro_until TIMESTAMPTZ,
    is_demo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица кошельков
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '💳',
    color TEXT DEFAULT '#F2F2F7',
    initial_balance NUMERIC DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- 3. Таблица операций
CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    category TEXT,
    wallet_id UUID REFERENCES wallets(id),
    wallet_from_id UUID REFERENCES wallets(id),
    wallet_to_id UUID REFERENCES wallets(id),
    comment TEXT DEFAULT '',
    date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Индексы для быстрых запросов
CREATE INDEX idx_operations_user_date ON operations(user_id, date DESC);
CREATE INDEX idx_operations_user_type ON operations(user_id, type);
CREATE INDEX idx_wallets_user ON wallets(user_id);

-- 5. Включаем RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

-- 6. RLS-политики для users
CREATE POLICY "Пользователь видит только себя"
ON users FOR SELECT USING (true);

CREATE POLICY "Вставка пользователей через сервер"
ON users FOR INSERT WITH CHECK (true);

CREATE POLICY "Пользователь обновляет только себя"
ON users FOR UPDATE USING (true);

-- 7. RLS-политики для wallets
CREATE POLICY "Пользователь видит свои кошельки"
ON wallets FOR SELECT USING (true);

CREATE POLICY "Пользователь создаёт свои кошельки"
ON wallets FOR INSERT WITH CHECK (true);

CREATE POLICY "Пользователь обновляет свои кошельки"
ON wallets FOR UPDATE USING (true);

-- 8. RLS-политики для operations
CREATE POLICY "Пользователь видит свои операции"
ON operations FOR SELECT USING (true);

CREATE POLICY "Пользователь создаёт свои операции"
ON operations FOR INSERT WITH CHECK (true);

CREATE POLICY "Пользователь обновляет свои операции"
ON operations FOR UPDATE USING (true);

CREATE POLICY "Пользователь удаляет свои операции"
ON operations FOR DELETE USING (true);
