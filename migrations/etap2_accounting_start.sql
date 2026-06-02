-- ЭТАП 2: дата начала учёта (с какого месяца считать остатки и операции)
-- Применить в Supabase → SQL Editor → Run
--
-- Что делает: добавляет в таблицу users поле accounting_start (дата).
-- Это «учёт ведётся с …». Операции и начальные остатки до этой даты
-- приложение не учитывает. NULL = дата не задана (учитывается всё, как раньше).

ALTER TABLE users ADD COLUMN IF NOT EXISTS accounting_start DATE;

-- Проверка результата
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'accounting_start';
