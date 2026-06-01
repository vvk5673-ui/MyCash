"""Засеять всем существующим пользователям MyCash:
- 31 базовую статью ДДС (с привязкой к группе и виду деятельности)
- 2 направления (Направление 1, Направление 2)
- При наличии менее 4 кошельков — дополнить до 4 (Счёт №1, Счёт №2, Наличка, Касса)

Запуск:
    cd e:/Arhiv/projects/MyCash
    "e:/Arhiv/projects/content_bot/venv/Scripts/python.exe" migrations/seed_existing_users.py

ВАЖНО: запускать ПОСЛЕ применения etap1_dds_structure.sql.
"""
import sys
from pathlib import Path

# Загружаем .env вручную из корня MyCash
env_path = Path(__file__).parent.parent / ".env"
env = {}
for line in env_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")

from supabase import create_client

SUPABASE_URL = env["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = env["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# === Базовые данные ===

DEFAULT_WALLETS = [
    {"name": "Счёт №1", "icon": "credit-card", "color": "#007AFF", "initial_balance": 0, "sort_order": 1},
    {"name": "Счёт №2", "icon": "credit-card", "color": "#5856D6", "initial_balance": 0, "sort_order": 2},
    {"name": "Наличка", "icon": "wallet", "color": "#34C759", "initial_balance": 0, "sort_order": 3},
    {"name": "Касса", "icon": "shopping-bag", "color": "#FF9500", "initial_balance": 0, "sort_order": 4},
]

DEFAULT_DIRECTIONS = [
    {"name": "Направление 1", "icon": "folder", "color": "#007AFF", "sort_order": 1},
    {"name": "Направление 2", "icon": "folder", "color": "#34C759", "sort_order": 2},
]

# 31 статья: (name, description, group_code, activity_code, sort_order)
DEFAULT_ARTICLES = [
    # Операционная — Поступление (4)
    ("Выручка от продаж товаров",     "Деньги от продажи товаров клиентам",           "inflow",  "operating",  1),
    ("Выручка от услуг",              "Деньги от оказания услуг клиентам",            "inflow",  "operating",  2),
    ("Возвраты от поставщиков",       "Деньги, возвращённые поставщиками",             "inflow",  "operating",  3),
    ("Прочие операционные поступления","Прочие доходы по основной деятельности",       "inflow",  "operating",  4),
    # Операционная — Выбытие (15)
    ("Закупка товаров для перепродажи","Оплата товаров поставщикам",                   "outflow", "operating",  5),
    ("Закупка сырья и материалов",    "Оплата сырья, материалов, расходников",        "outflow", "operating",  6),
    ("Аренда помещения",              "Аренда офиса, склада, торговой точки",         "outflow", "operating",  7),
    ("Коммунальные услуги",           "Электричество, вода, отопление",                "outflow", "operating",  8),
    ("Связь и интернет",              "Мобильная связь, интернет, телефония",         "outflow", "operating",  9),
    ("Зарплата сотрудникам",          "Выплаты сотрудникам",                            "outflow", "operating", 10),
    ("Налоги и взносы",               "Налоги, страховые взносы, сборы",               "outflow", "operating", 11),
    ("Реклама и маркетинг",           "Продвижение, реклама, маркетинг",               "outflow", "operating", 12),
    ("Транспортные расходы",          "Доставка, такси, бензин, ТО",                   "outflow", "operating", 13),
    ("Командировки",                  "Перелёты, гостиницы, командировочные",         "outflow", "operating", 14),
    ("Профессиональные услуги",       "Бухгалтер, юрист, консультанты",                "outflow", "operating", 15),
    ("Канцелярия и расходники",       "Бумага, ручки, картриджи, расходники",          "outflow", "operating", 16),
    ("Банковские комиссии",           "Комиссии банков за обслуживание и операции",   "outflow", "operating", 17),
    ("Обучение и развитие",           "Курсы, книги, семинары",                        "outflow", "operating", 18),
    ("Прочие операционные расходы",   "Прочие расходы по основной деятельности",      "outflow", "operating", 19),
    # Инвестиционная (6)
    ("Продажа ОС",                    "Продажа мебели, техники, оборудования",        "inflow",  "investing", 20),
    ("Возврат кредитов и займов",     "Нам вернули кредит или займ",                  "inflow",  "investing", 21),
    ("Прочие поступления от инвест. операций", "Проценты на остаток по РС и пр.",       "inflow",  "investing", 22),
    ("Покупка ОС",                    "Покупка мебели, техники (дороже 10 т.р.)",     "outflow", "investing", 23),
    ("Ремонт ОС",                     "Капитальный ремонт техники и оборудования",    "outflow", "investing", 24),
    ("Выдача кредитов и займов",      "Мы выдали кредит или займ",                    "outflow", "investing", 25),
    # Финансовая (4)
    ("Получение кредитов и займов",   "Нам дали в долг",                              "inflow",  "financing", 26),
    ("Вклады от собственников",       "Собственник вложил деньги в бизнес",           "inflow",  "financing", 27),
    ("Оплаты по кредитам и займам",   "Мы оплатили наши кредиты и займы",             "outflow", "financing", 28),
    ("Дивиденды",                     "Выплата дивидендов собственникам",             "outflow", "financing", 29),
    # Техническая операция (2)
    ("Доход — Перевод между счетами", "Поступление денег с нашего счёта или другого кошелька", "inflow",  "technical", 30),
    ("Расход — Перевод между счетами","Перевод денег на другой наш счёт или кошелёк", "outflow", "technical", 31),
]


def main():
    # 1. Получаем глобальные справочники
    groups = {g["code"]: g["id"] for g in sb.table("dds_groups").select("code, id").execute().data}
    kinds = {k["code"]: k["id"] for k in sb.table("dds_activity_kinds").select("code, id").execute().data}

    assert groups, "Справочник dds_groups пуст. Сначала примените миграцию etap1_dds_structure.sql"
    assert kinds,  "Справочник dds_activity_kinds пуст. Сначала примените миграцию etap1_dds_structure.sql"
    print(f"Справочники: groups={list(groups)}, kinds={list(kinds)}")

    # 2. Получаем всех пользователей
    users = sb.table("users").select("id, telegram_id, first_name").execute().data
    print(f"Пользователей в базе: {len(users)}")

    for user in users:
        uid = user["id"]
        print(f"\n=== Пользователь {user.get('first_name', '')} (TG {user['telegram_id']}) ===")

        # 2.1. Кошельки — добавить недостающие
        existing_wallets = sb.table("wallets").select("name").eq("user_id", uid).execute().data
        existing_names = {w["name"] for w in existing_wallets}
        to_add_wallets = [w for w in DEFAULT_WALLETS if w["name"] not in existing_names]
        if to_add_wallets:
            payload = [{**w, "user_id": uid} for w in to_add_wallets]
            sb.table("wallets").insert(payload).execute()
            print(f"  + кошельки: {[w['name'] for w in to_add_wallets]}")
        else:
            print(f"  кошельки: уже все 4 есть")

        # 2.2. Направления — добавить если меньше 2
        existing_dirs = sb.table("business_directions").select("name").eq("user_id", uid).execute().data
        existing_dir_names = {d["name"] for d in existing_dirs}
        to_add_dirs = [d for d in DEFAULT_DIRECTIONS if d["name"] not in existing_dir_names]
        if to_add_dirs:
            payload = [{**d, "user_id": uid} for d in to_add_dirs]
            sb.table("business_directions").insert(payload).execute()
            print(f"  + направления: {[d['name'] for d in to_add_dirs]}")
        else:
            print(f"  направления: уже все есть")

        # 2.3. Статьи ДДС — добавить только отсутствующие
        existing_articles = sb.table("dds_articles").select("name").eq("user_id", uid).execute().data
        existing_article_names = {a["name"] for a in existing_articles}
        to_add_articles = []
        for name, descr, group_code, activity_code, order in DEFAULT_ARTICLES:
            if name in existing_article_names:
                continue
            to_add_articles.append({
                "user_id": uid,
                "name": name,
                "description": descr,
                "group_id": groups[group_code],
                "activity_kind_id": kinds[activity_code],
                "sort_order": order,
            })
        if to_add_articles:
            # Вставляем чанками по 25, чтобы не упереться в лимиты
            for i in range(0, len(to_add_articles), 25):
                chunk = to_add_articles[i:i + 25]
                sb.table("dds_articles").insert(chunk).execute()
            print(f"  + статьи ДДС: {len(to_add_articles)} шт.")
        else:
            print(f"  статьи: уже все 31 есть")

    print("\n=== Seed завершён ===")


if __name__ == "__main__":
    main()
