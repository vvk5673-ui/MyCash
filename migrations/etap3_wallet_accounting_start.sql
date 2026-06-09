-- ЭТАП 3: дата начала учёта у КАЖДОГО кошелька (вместо одной общей у пользователя)
-- Применить в Supabase → SQL Editor → Run
--
-- Что делает: добавляет в таблицу wallets поле accounting_start (дата).
-- Теперь у каждого кошелька своя дата начала учёта (по умолчанию — день создания).
-- Существующим кошелькам проставляем текущую ОБЩУЮ дату пользователя, чтобы расчёт
-- не изменился; если общая не задана — берём дату создания кошелька.

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS accounting_start DATE;

UPDATE wallets w
SET accounting_start = COALESCE(
    (SELECT u.accounting_start FROM users u WHERE u.id = w.user_id),
    w.created_at::date
)
WHERE w.accounting_start IS NULL;

-- Проверка результата
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'wallets' AND column_name = 'accounting_start';
