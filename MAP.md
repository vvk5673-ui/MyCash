# MAP.md — карта кода MyCash

Навигатор «где что лежит». Цель — быстро находить нужное место без поиска по всему проекту.
Номера строк приблизительны (смещаются при правках) — для точного перехода ищи **маркер-секцию** `// === НАЗВАНИЕ ===` (в app.js) или имя функции.

## Структура проекта

```
docs/        ← ФРОНТ (Telegram Mini App, отдаётся с GitHub Pages)
  index.html   разметка + модалки (~570 строк)
  style.css    стили, Apple-минимализм (~1000 строк)
  app-core.js        логика UI 1/6: Telegram, хранилище, данные, справочники, статьи (~648)
  app-data.js        логика UI 2/6: демо, синхронизация, инициализация, баланс, итоги, ДДС (~476)
  app-operations.js  логика UI 3/6: список, свайп, окно ввода, быстрые категории, форма (~549)
  app-dashboard.js   логика UI 4/6: дашборд, очистка демо, карусель, таблица расходов (~373)
  app-wallets.js     логика UI 5/6: счета, drag, тариф, редактирование операции (~474)
  app-main.js        логика UI 6/6: утилиты, вкладки, старт, оффер, экспорт в window (~226)
  api.js       связь с сервером + offline-fallback (~640 строк)
  logo/avatar/banner.png

  ⚠️ Все app-*.js делят ОДНУ общую область видимости (классические <script>, без модулей).
     Подключаются по порядку в index.html — порядок менять нельзя. Общие переменные
     (operations, Refs, selectedWallet...) видны во всех файлах. Функции для onclick
     экспортируются в window в конце app-main.js.

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

## Карта логики UI (по секциям `// === ... ===`)

Номера строк — внутри указанного файла (ищи маркер `// === НАЗВАНИЕ ===` или имя функции).

| Файл | Секция | Что |
|---|---|---|
| **app-core.js** | TELEGRAM WEB APP | инициализация tg, haptic |
| app-core.js | ХРАНИЛИЩЕ | localStorage/CloudStorage |
| app-core.js | ДАННЫЕ | глобальные переменные, `operations` |
| app-core.js | СПРАВОЧНИКИ С СЕРВЕРА | `loadReferences()`, `Refs` (wallets/articles/directions/contragents) |
| app-core.js | ВНЕШНИЙ ВИД СТАТЕЙ | `articleVisual()` иконка+цвет статьи |
| app-core.js | (счета) | `getActiveWallets`, `computeWalletBalances`, `renderWalletsRow` (группировка по направлениям), `walletLineHtml` |
| app-core.js | СПРАВОЧНИКИ: УПРАВЛЕНИЕ | CRUD статей/направлений/контрагентов в Профиле |
| **app-data.js** | ДЕМО-ДАННЫЕ | `generateDemoData` |
| app-data.js | СИНХРОНИЗАЦИЯ С СЕРВЕРОМ | `loadServerOperations`, `mapServerOp` |
| app-data.js | ИНИЦИАЛИЗАЦИЯ | `init()`, `renderAll()` |
| app-data.js | БАЛАНС / ИТОГИ | `updateBalance`, `updateSummary` |
| app-data.js | ОТЧЁТ ДДС | `renderDdsReport`, виды деятельности, `isWithinAccounting` (дата начала учёта) |
| **app-operations.js** | ОПЕРАЦИИ — ОТОБРАЖЕНИЕ | `renderOperations`, сортировка |
| app-operations.js | СВАЙП ДЛЯ УДАЛЕНИЯ | свайп операции |
| app-operations.js | МОДАЛКА БЫСТРЫЙ ВВОД | `openModal`, `populateFormSelects` |
| app-operations.js | БЫСТРЫЕ КАТЕГОРИИ | плитки статей в окне операции |
| app-operations.js | РАСШИРЕННАЯ ФОРМА | полная форма операции |
| app-operations.js | СТЕППЕР + ЕДИНОЕ СОХРАНЕНИЕ | `stepOpen/stepReset/stepMarkDone`, `stepFillFromState`, `commitOp` (создать/обновить), `deleteFromModal` — окно `modalOverlay` работает в 2 режимах: новая / правка (флаг `editingOpId`) |
| **app-dashboard.js** | ДАШБОРД | графики аналитики |
| app-dashboard.js | ОЧИСТКА ДЕМО | clearDemo/clearAll |
| app-dashboard.js | КАРУСЕЛЬ АНАЛИТИКИ | свайп страниц аналитики |
| app-dashboard.js | ТАБЛИЦА РАСХОДОВ | Pro-таблица (заблюрена) |
| **app-wallets.js** | РЕДАКТИРОВАНИЕ КОШЕЛЬКА | `openWalletEdit`, `openNewWallet`, `saveWalletEdit`, `populateWalletDirectionSelect` |
| app-wallets.js | ПЕРЕТАСКИВАНИЕ СЧЕТОВ | drag `walletDragStart/Move/End` |
| app-wallets.js | МОДАЛКА «ОБНОВИТЬ ТАРИФ» | `showUpgrade`, `closeUpgrade` |
| app-wallets.js | РЕДАКТИРОВАНИЕ ОПЕРАЦИИ | `openEdit` — открывает окно-степпер в режиме правки (предзаполняет шаги). Старое окно `editOverlay` и его функции — в `<template>` (index.html) и `/* */` (тут), не используются |
| **app-main.js** | УТИЛИТЫ / ТАБ-БАР | `esc`, `fmt`, переключение вкладок |
| app-main.js | СТАРТ / ОФФЕР | первичная загрузка, `init()`, экран-оффер |
| app-main.js | ЭКСПОРТ ФУНКЦИЙ В WINDOW | `Object.assign(window, {...})` для onclick |

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
