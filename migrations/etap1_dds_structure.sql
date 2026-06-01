-- ============================================================================
-- MyCash — Миграция Этап 1: структура ДДС по prototype_table.xlsx
-- Дата: 2026-06-01
-- ============================================================================
-- Что делает миграция:
--   1. Создаёт справочники: dds_groups (2 строки), dds_activity_kinds (4 строки)
--   2. Создаёт пользовательские таблицы: dds_articles, contragents
--   3. Расширяет operations и business_directions
--   4. Включает RLS и политики для service_role
--   5. Засевает глобальные справочники
-- ============================================================================
-- Применение:
--   1. Supabase Dashboard → SQL Editor → New Query
--   2. Вставь весь файл
--   3. Run
-- ============================================================================

-- ===========================================================================
-- 1. ГРУППЫ (фиксированный справочник)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS dds_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO dds_groups (code, name, sort_order) VALUES
    ('inflow', 'Поступление', 1),
    ('outflow', 'Выбытие', 2)
ON CONFLICT (code) DO NOTHING;

-- ===========================================================================
-- 2. ВИДЫ ДЕЯТЕЛЬНОСТИ (фиксированный справочник)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS dds_activity_kinds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO dds_activity_kinds (code, name, sort_order) VALUES
    ('operating', 'Операционная', 1),
    ('investing', 'Инвестиционная', 2),
    ('financing', 'Финансовая', 3),
    ('technical', 'Техническая операция', 4)
ON CONFLICT (code) DO NOTHING;

-- ===========================================================================
-- 3. СТАТЬИ ДДС (пользовательские)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS dds_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    group_id UUID REFERENCES dds_groups(id) NOT NULL,
    activity_kind_id UUID REFERENCES dds_activity_kinds(id) NOT NULL,
    icon TEXT DEFAULT 'tag',
    color TEXT DEFAULT '#F2F2F7',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dds_articles_user ON dds_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_dds_articles_group ON dds_articles(group_id);
CREATE INDEX IF NOT EXISTS idx_dds_articles_activity ON dds_articles(activity_kind_id);

-- ===========================================================================
-- 4. КОНТРАГЕНТЫ
-- ===========================================================================
CREATE TABLE IF NOT EXISTS contragents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contragents_user ON contragents(user_id);

-- ===========================================================================
-- 5. РАСШИРЕНИЕ operations
-- ===========================================================================
ALTER TABLE operations
    ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES dds_articles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS direction_id UUID REFERENCES business_directions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contragent_id UUID REFERENCES contragents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_operations_article ON operations(article_id);
CREATE INDEX IF NOT EXISTS idx_operations_direction ON operations(direction_id);
CREATE INDEX IF NOT EXISTS idx_operations_contragent ON operations(contragent_id);

-- ===========================================================================
-- 6. РАСШИРЕНИЕ business_directions
-- ===========================================================================
ALTER TABLE business_directions
    ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'folder',
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#F2F2F7',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- ===========================================================================
-- 7. RLS — Row Level Security для новых таблиц
-- ===========================================================================
ALTER TABLE dds_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE dds_activity_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE dds_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contragents ENABLE ROW LEVEL SECURITY;

-- Глобальные справочники — чтение для всех (через anon тоже доступны)
DROP POLICY IF EXISTS "dds_groups SELECT all" ON dds_groups;
CREATE POLICY "dds_groups SELECT all" ON dds_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "dds_activity_kinds SELECT all" ON dds_activity_kinds;
CREATE POLICY "dds_activity_kinds SELECT all" ON dds_activity_kinds FOR SELECT USING (true);

-- Пользовательские таблицы — service_role полный доступ (через FastAPI)
DROP POLICY IF EXISTS "dds_articles SELECT" ON dds_articles;
CREATE POLICY "dds_articles SELECT" ON dds_articles FOR SELECT USING (true);
DROP POLICY IF EXISTS "dds_articles INSERT" ON dds_articles;
CREATE POLICY "dds_articles INSERT" ON dds_articles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "dds_articles UPDATE" ON dds_articles;
CREATE POLICY "dds_articles UPDATE" ON dds_articles FOR UPDATE USING (true);
DROP POLICY IF EXISTS "dds_articles DELETE" ON dds_articles;
CREATE POLICY "dds_articles DELETE" ON dds_articles FOR DELETE USING (true);

DROP POLICY IF EXISTS "contragents SELECT" ON contragents;
CREATE POLICY "contragents SELECT" ON contragents FOR SELECT USING (true);
DROP POLICY IF EXISTS "contragents INSERT" ON contragents;
CREATE POLICY "contragents INSERT" ON contragents FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "contragents UPDATE" ON contragents;
CREATE POLICY "contragents UPDATE" ON contragents FOR UPDATE USING (true);
DROP POLICY IF EXISTS "contragents DELETE" ON contragents;
CREATE POLICY "contragents DELETE" ON contragents FOR DELETE USING (true);

-- ===========================================================================
-- ПРОВЕРКА — посчитать что получилось
-- ===========================================================================
SELECT 'dds_groups' AS table_name, COUNT(*) AS rows FROM dds_groups
UNION ALL SELECT 'dds_activity_kinds', COUNT(*) FROM dds_activity_kinds
UNION ALL SELECT 'dds_articles', COUNT(*) FROM dds_articles
UNION ALL SELECT 'contragents', COUNT(*) FROM contragents
UNION ALL SELECT 'business_directions', COUNT(*) FROM business_directions
UNION ALL SELECT 'wallets', COUNT(*) FROM wallets
UNION ALL SELECT 'operations', COUNT(*) FROM operations
UNION ALL SELECT 'users', COUNT(*) FROM users;
