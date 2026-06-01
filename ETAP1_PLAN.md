# Этап 1 — расширение MyCash под структуру prototype_table.xlsx

**Дата начала:** 2026-06-01
**Цель этапа:** довести базу данных и логику MyCash до полного соответствия Excel-таблице, на которой основан продукт. Без AI, без голоса, без банков — только клики и ввод с клавиатуры.

---

## Что сейчас в Supabase

Существующие таблицы:
1. **users** — пользователи (Telegram ID, тариф)
2. **tariff_limits** — настраиваемые лимиты тарифов
3. **wallets** — кошельки (name, icon, color, initial_balance)
4. **operations** — операции (type, amount, category, wallet_id, date)
5. **custom_categories** — пользовательские категории (плоские)
6. **business_directions** — направления бизнеса (только name)
7. **payments** — история оплат
8. **sync_queue** — очередь синхронизации

## Чего нет, но нужно по prototype_table.xlsx

| Сущность | Сейчас в БД | Нужно сделать |
|----------|-------------|---------------|
| Виды деятельности (4: Операционная / Инвестиционная / Финансовая / Техническая) | НЕТ | Новая таблица **dds_activity_kinds** с 4 фиксированными строками |
| Группы (Поступление / Выбытие) | type 'expense'/'income' в операциях | Новая таблица **dds_groups** с 2 фиксированными строками |
| Статьи ДДС с привязкой к виду и группе | плоское поле `category` + custom_categories | Новая таблица **dds_articles** (user_id, name, group_id, activity_kind_id) |
| Субстатьи ДДС (как в листе «ДДС статьи») | НЕТ | Новая таблица **dds_subarticles** (article_id, name) |
| Контрагенты | НЕТ | Новая таблица **contragents** (user_id, name, type, notes) |
| Назначение платежа в операции | поле `comment` (общее) | Отдельное поле `purpose` в operations |
| Направление в операции | direction_id отсутствует | Новое поле `direction_id` в operations |
| Статья в операции | category TEXT | Новое поле `article_id` в operations |
| Контрагент в операции | НЕТ | Новое поле `contragent_id` в operations |
| Усиленные направления (icon, color, sort_order, archive) | только name | ALTER TABLE business_directions |

---

## Структура новых таблиц

### dds_activity_kinds — Виды деятельности (фиксированный справочник)
```sql
CREATE TABLE dds_activity_kinds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);
INSERT INTO dds_activity_kinds (code, name, sort_order) VALUES
    ('operating', 'Операционная', 1),
    ('investing', 'Инвестиционная', 2),
    ('financing', 'Финансовая', 3),
    ('technical', 'Техническая', 4);
```
Глобальный справочник для всех пользователей. 4 строки, не пользователь меняет.

### dds_groups — Группы (Поступление/Выбытие)
```sql
CREATE TABLE dds_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);
INSERT INTO dds_groups (code, name, sort_order) VALUES
    ('inflow', 'Поступление', 1),
    ('outflow', 'Выбытие', 2);
```
Глобально 2 строки.

### dds_articles — Статьи ДДС (пользовательские)
```sql
CREATE TABLE dds_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    group_id UUID REFERENCES dds_groups(id) NOT NULL,
    activity_kind_id UUID REFERENCES dds_activity_kinds(id) NOT NULL,
    icon TEXT DEFAULT 'tag',
    color TEXT DEFAULT '#F2F2F7',
    sort_order INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);
```
Каждый пользователь имеет свой набор. При регистрации можно засеивать дефолтным набором (см. ниже).

### dds_subarticles — Субстатьи (опционально)
```sql
CREATE TABLE dds_subarticles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES dds_articles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(article_id, name)
);
```

### contragents — Контрагенты
```sql
CREATE TABLE contragents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);
```

---

## Изменения существующих таблиц

### operations — добавить поля
```sql
ALTER TABLE operations ADD COLUMN article_id UUID REFERENCES dds_articles(id);
ALTER TABLE operations ADD COLUMN subarticle_id UUID REFERENCES dds_subarticles(id);
ALTER TABLE operations ADD COLUMN direction_id UUID REFERENCES business_directions(id);
ALTER TABLE operations ADD COLUMN contragent_id UUID REFERENCES contragents(id);
ALTER TABLE operations ADD COLUMN purpose TEXT DEFAULT '';
```
Старое поле `category TEXT` оставляем как fallback для совместимости со старыми операциями.

### business_directions — усилить
```sql
ALTER TABLE business_directions ADD COLUMN icon TEXT DEFAULT 'folder';
ALTER TABLE business_directions ADD COLUMN color TEXT DEFAULT '#F2F2F7';
ALTER TABLE business_directions ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE business_directions ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
```

---

## Что засеивать новому пользователю при регистрации

### 4 базовых кошелька (как в Excel)
- Счёт №1
- Счёт №2
- Наличка
- Касса

(Сейчас засеиваются 2 — расширить до 4.)

### Базовый набор направлений
- Личное
- Бизнес

(Пользователь может переименовать/добавить/удалить.)

### Базовые статьи ДДС
Минимальный набор из 8-12 статей покрывающий типичные сценарии. Финальный список можно достать из реальных данных prototype_table.xlsx (есть лист «ДДС статьи»). На текущем этапе примерный:

**Поступления (inflow):**
- Выручка от продаж — Операционная
- Прочие поступления — Операционная
- Доход — Перевод между счетами — Техническая

**Выбытия (outflow):**
- Аренда — Операционная
- Зарплата — Операционная
- Реклама и маркетинг — Операционная
- Налоги — Операционная
- Закупка товара — Операционная
- Прочие расходы — Операционная
- Покупка оборудования — Инвестиционная
- Выплата кредита — Финансовая
- Расход — Перевод между счетами — Техническая

(Конкретный список согласуем — можно вытащить точные статьи из листа «ДДС статьи».)

---

## Что НЕ делаем в этом этапе

- ❌ Голосовой ввод и AI-парсер — Этап 3 позже
- ❌ AI-категоризация — Этап 4
- ❌ Напоминания и советы — Этап 5
- ❌ SMS-парсинг и QR ФНС — Этап 6
- ❌ Лендинг и цены — после MVP
- ❌ Любая смена позиционирования — после MVP

---

## Чек-лист по подзадачам Этапа 1

- [x] **1.1** Применить SQL-миграцию к Supabase (новые таблицы + ALTER операций) — ✅ 01.06
- [x] **1.2** Засеивание глобальных справочников (4 вида деятельности + 2 группы) + seed существующих пользователей — ✅ 01.06
- [x] **1.3** Обновить FastAPI (`server/main.py`): — ✅ 01.06, протестировано локально
  - [x] Эндпоинты GET справочников: `/v1/refs` (виды+группы), `/v1/articles`, `/v1/directions`, `/v1/contragents`
  - [x] Эндпоинты CRUD статей ДДС / контрагентов / направлений (POST/PUT/DELETE)
  - [x] Обновить эндпоинт POST /operations: принимать article_id, direction_id, contragent_id, purpose (+ в OperationUpdate)
  - [x] Обновить регистрацию: новый модуль `server/dds_defaults.py` (seed_user_defaults) — 4 кошелька + 2 направления + 31 статья
- [ ] **1.4** Обновить фронтенд (`docs/index.html`, `docs/app.js`):
  - [ ] Управление справочниками: статьи, направления, контрагенты (CRUD)
  - [ ] Новая форма ввода операции: дата, сумма, кошелёк, направление, контрагент, статья, назначение
  - [ ] Список операций со всеми полями
- [ ] **1.5** Тестирование локально (без VPS): 3-5 сценариев типа «приход выручки», «расход на аренду», «перевод между счетами»
- [ ] **1.6** Записать в `memory/project_moykash.md` обновления статуса

---

## Сроки (ориентировочные)

- Подзадачи 1.1-1.2 (миграция БД): **1 день**
- Подзадачи 1.3 (API): **3-5 дней**
- Подзадачи 1.4 (фронт): **5-7 дней**
- Подзадача 1.5 (тестирование локально): **1-2 дня**
- **Итого: 10-15 дней работы**

---

## Что делать ДАЛЬШЕ (Этап 2 — после согласования)

1. Отчёты по образцу таблицы:
   - ДДС Сводный (помесячно по кошелькам, как лист «ДДС Сводный»)
   - Сводная по направлениям (как лист «Сводная по направлениям»)
   - Журнал всех операций с фильтрами (как лист «ДДС месяц»)
2. Стартовое сальдо при первом запуске (UI настройки на лист «ДДС настройки»)
3. Экспорт в Excel
