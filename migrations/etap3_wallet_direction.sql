-- Этап: разделение счетов по направлениям (Бизнес / Личное / и т.д.)
-- Добавляет связь «счёт → направление» для группировки в блоке «Мои финансы».
-- Колонка nullable: существующие счета пока без направления, проставим отдельно.
-- ON DELETE SET NULL: если направление удалят, счёт не сломается (попадёт в «Без направления»).

ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS direction_id UUID
    REFERENCES business_directions(id) ON DELETE SET NULL;

-- Индекс для быстрой выборки счетов по направлению
CREATE INDEX IF NOT EXISTS idx_wallets_direction ON wallets(direction_id);
