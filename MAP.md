# MAP.md — карта кода MyCash

Навигатор «где что лежит». Цель — быстро находить нужное место без поиска по всему проекту.
Номера строк приблизительны (смещаются при правках) — для точного перехода ищи **маркер-секцию** `// === НАЗВАНИЕ ===` (в app.js) или имя функции.

## Структура проекта

```
docs/        ← ФРОНТ (Telegram Mini App, отдаётся с GitHub Pages)
  index.html   разметка + модалки (~570 строк)
  style.css    стили, Apple-минимализм (~1000 строк)
  app.js       вся логика UI (~2860 строк) — см. карту секций ниже
  api.js       связь с сервером + offline-fallback (~640 строк)
  logo/avatar/banner.png

server/      ← БЭК (FastAPI + бот, на VPS 90.156.170.88)
  main.py        FastAPI, все эндпоинты (~900) — см. список ниже
  bot.py         aiogram, webhook, админ-команды, WEBAPP_URL, напоминания
  auth.py        Telegram initData (HMAC) + JWT (окно initData = 24ч)
  middleware.py  достаёт JWT из заголовка
  database.py    клиент Supabase (service_role)
  dds_defaults.py засев нового юзера (счета/направления/статьи)
  demo_data.py   генерация демо-операций
  config.py      загрузка .env
  logger.py      логи с ротацией

migrations/  ← SQL-миграции (применяются вручную в Supabase SQL Editor)
PLAN.md      ← живой план задач
project.md   ← описание проекта, ЦА, функции
DEPLOYMENT.md← инструкция по деплою
```

## Карта app.js (по секциям `// === ... ===`)

| Секция | ~строка | Что |
|---|---|---|
| TELEGRAM WEB APP | 4 | инициализация tg, haptic |
| ХРАНИЛИЩЕ | 37 | localStorage/CloudStorage |
| ДАННЫЕ | 59 | глобальные переменные, `operations` |
| СПРАВОЧНИКИ С СЕРВЕРА | 128 | `loadReferences()`, `Refs` (wallets/articles/directions/contragents) |
| ВНЕШНИЙ ВИД СТАТЕЙ | 200 | `articleVisual()` иконка+цвет статьи |
| (счета) | 316 | `getActiveWallets`, `computeWalletBalances`, `renderWalletsRow` (группировка по направлениям), `walletLineHtml` |
| СПРАВОЧНИКИ: УПРАВЛЕНИЕ | 426 | CRUD статей/направлений/контрагентов в Профиле |
| ДЕМО-ДАННЫЕ | 647 | `generateDemoData` |
| СИНХРОНИЗАЦИЯ С СЕРВЕРОМ | 704 | `loadServerOperations`, `mapServerOp` |
| ИНИЦИАЛИЗАЦИЯ | 758 | `init()`, `renderAll()` |
| БАЛАНС / ИТОГИ | 800 | `updateBalance`, `updateSummary` |
| ОТЧЁТ ДДС | 861 | `renderDdsReport`, виды деятельности, `isWithinAccounting` (дата начала учёта) |
| ОПЕРАЦИИ — ОТОБРАЖЕНИЕ | 1118 | `renderOperations`, сортировка |
| СВАЙП ДЛЯ УДАЛЕНИЯ | 1189 | свайп операции |
| МОДАЛКА БЫСТРЫЙ ВВОД | 1260 | `openModal`, `populateFormSelects` |
| БЫСТРЫЕ КАТЕГОРИИ | 1345 | плитки статей в окне операции |
| РАСШИРЕННАЯ ФОРМА | 1424 | полная форма операции |
| ДАШБОРД | 1662 | графики аналитики |
| ОЧИСТКА ДЕМО | 1893 | clearDemo/clearAll |
| ГОЛОСОВОЙ ВВОД + ПАРСЕР | 1910 | ⚠️ возможно мёртвый код (голоса на MVP нет) |
| КАРУСЕЛЬ АНАЛИТИКИ | 2046 | свайп страниц аналитики |
| ТАБЛИЦА РАСХОДОВ | 2075 | Pro-таблица (заблюрена) |
| РЕДАКТИРОВАНИЕ КОШЕЛЬКА | 2166 | `openWalletEdit`, `openNewWallet`, `saveWalletEdit`, `populateWalletDirectionSelect` |
| ПЕРЕТАСКИВАНИЕ СЧЕТОВ | 2329 | drag `walletDragStart/Move/End` |
| РЕДАКТИРОВАНИЕ ОПЕРАЦИИ | 2456 | правка операции |
| УТИЛИТЫ / ТАБ-БАР / СТАРТ | 2635+ | `esc`, `fmt`, переключение вкладок, запуск |
| ЭКСПОРТ ФУНКЦИЙ В WINDOW | 2825 | привязка функций для onclick |

## Эндпоинты server/main.py

- **Auth:** POST `/v1/auth/telegram`
- **Операции:** GET/POST `/v1/operations`, PUT/DELETE `/v1/operations/{id}`
- **Счета:** GET/POST `/v1/wallets`, PUT/DELETE `/v1/wallets/{id}` (есть `direction_id`)
- **Справочники:** GET `/v1/refs` (группы+виды), GET/POST/PUT/DELETE `/v1/articles`, `/v1/contragents`, `/v1/directions`
- **Аналитика:** GET `/v1/dashboard`
- **Пользователь:** GET `/v1/user/profile`, POST `/v1/user/clear-demo`, `/clear-all`, `/set-balances`, `/accounting-start`, DELETE `/v1/user/account`
- **Служебное:** GET `/v1/health`, POST `/bot/webhook` (защищён secret-token)

## Команды бота (bot.py)

- Пользователь: `/start`, `/help`
- Админ (ADMIN_TELEGRAM_ID): `/admin`, `/stats`, `/users`, `/user {id}`, `/set_tariff`, `/block`, `/unblock`, `/broadcast`, `/limits`, `/set_limit`

## База данных (Supabase)

`users` · `wallets` (+direction_id) · `operations` (+article_id, direction_id, contragent_id, purpose) · `dds_groups` · `dds_activity_kinds` · `dds_articles` · `business_directions` · `contragents` · `tariff_limits` · `payments`

## Ключевые правила (важно при правках)

- **Кэш Telegram:** при изменении фронта бампить `?v=N` в `docs/index.html` (3 места: style/api/app) + `WEBAPP_URL` в `server/bot.py`. Иначе Telegram отдаёт старую версию.
- **Деплой фронта** = `git push` (GitHub Pages). **Деплой бэка** = push + на VPS `git pull` + `systemctl restart mycash`. См. скрипт `deploy.sh` / DEPLOYMENT.md.
- **Источник правды** = сервер. Фронт грузит операции/справочники при старте (`loadReferences`, `loadServerOperations`).
- **Направление счёта** (`wallets.direction_id`) — для группировки в блоке «Мои финансы». **Направление операции** — отдельное поле, для отчёта ДДС/аналитики.
- **«Пропали данные»** в приложении = почти всегда сбой авторизации (HTTP 401), а НЕ потеря. Проверять лог сервера и БД напрямую.
