"""
Дефолтные справочники MyCash для засева нового пользователя.

Используется при регистрации (main.py) — чтобы новый пользователь сразу
получил ту же структуру, что задана в prototype_table.xlsx:
  - 4 кошелька (Счёт №1, Счёт №2, Наличка, Касса)
  - 2 направления (Направление 1, Направление 2)
  - 31 статью ДДС (с привязкой к группе и виду деятельности)

Функция seed_user_defaults() идемпотентна: добавляет только то, чего ещё нет.
"""

# 4 базовых кошелька (как в Excel)
DEFAULT_WALLETS = [
    {"name": "Счёт №1", "icon": "credit-card", "color": "#007AFF", "initial_balance": 0, "sort_order": 1},
    {"name": "Счёт №2", "icon": "credit-card", "color": "#5856D6", "initial_balance": 0, "sort_order": 2},
    {"name": "Наличка", "icon": "wallet", "color": "#34C759", "initial_balance": 0, "sort_order": 3},
    {"name": "Касса", "icon": "shopping-bag", "color": "#FF9500", "initial_balance": 0, "sort_order": 4},
]

# 2 базовых направления (пользователь может переименовать/добавить/удалить)
DEFAULT_DIRECTIONS = [
    {"name": "Направление 1", "icon": "folder", "color": "#007AFF", "sort_order": 1},
    {"name": "Направление 2", "icon": "folder", "color": "#34C759", "sort_order": 2},
]

# 31 статья ДДС: (name, description, group_code, activity_code, sort_order)
DEFAULT_ARTICLES = [
    # Операционная — Поступление (4)
    ("Выручка от продаж товаров",      "Деньги от продажи товаров клиентам",            "inflow",  "operating",  1),
    ("Выручка от услуг",               "Деньги от оказания услуг клиентам",             "inflow",  "operating",  2),
    ("Возвраты от поставщиков",        "Деньги, возвращённые поставщиками",             "inflow",  "operating",  3),
    ("Прочие операционные поступления","Прочие доходы по основной деятельности",        "inflow",  "operating",  4),
    # Операционная — Выбытие (15)
    ("Закупка товаров для перепродажи","Оплата товаров поставщикам",                    "outflow", "operating",  5),
    ("Закупка сырья и материалов",     "Оплата сырья, материалов, расходников",         "outflow", "operating",  6),
    ("Аренда помещения",               "Аренда офиса, склада, торговой точки",          "outflow", "operating",  7),
    ("Коммунальные услуги",            "Электричество, вода, отопление",                "outflow", "operating",  8),
    ("Связь и интернет",               "Мобильная связь, интернет, телефония",          "outflow", "operating",  9),
    ("Зарплата сотрудникам",           "Выплаты сотрудникам",                           "outflow", "operating", 10),
    ("Налоги и взносы",                "Налоги, страховые взносы, сборы",               "outflow", "operating", 11),
    ("Реклама и маркетинг",            "Продвижение, реклама, маркетинг",               "outflow", "operating", 12),
    ("Транспортные расходы",           "Доставка, такси, бензин, ТО",                   "outflow", "operating", 13),
    ("Командировки",                   "Перелёты, гостиницы, командировочные",          "outflow", "operating", 14),
    ("Профессиональные услуги",        "Бухгалтер, юрист, консультанты",                "outflow", "operating", 15),
    ("Канцелярия и расходники",        "Бумага, ручки, картриджи, расходники",          "outflow", "operating", 16),
    ("Банковские комиссии",            "Комиссии банков за обслуживание и операции",    "outflow", "operating", 17),
    ("Обучение и развитие",            "Курсы, книги, семинары",                        "outflow", "operating", 18),
    ("Прочие операционные расходы",    "Прочие расходы по основной деятельности",       "outflow", "operating", 19),
    # Инвестиционная (6)
    ("Продажа ОС",                     "Продажа мебели, техники, оборудования",         "inflow",  "investing", 20),
    ("Возврат кредитов и займов",      "Нам вернули кредит или займ",                   "inflow",  "investing", 21),
    ("Прочие поступления от инвест. операций", "Проценты на остаток по РС и пр.",        "inflow",  "investing", 22),
    ("Покупка ОС",                     "Покупка мебели, техники (дороже 10 т.р.)",      "outflow", "investing", 23),
    ("Ремонт ОС",                      "Капитальный ремонт техники и оборудования",     "outflow", "investing", 24),
    ("Выдача кредитов и займов",       "Мы выдали кредит или займ",                     "outflow", "investing", 25),
    # Финансовая (4)
    ("Получение кредитов и займов",    "Нам дали в долг",                               "inflow",  "financing", 26),
    ("Вклады от собственников",        "Собственник вложил деньги в бизнес",            "inflow",  "financing", 27),
    ("Оплаты по кредитам и займам",    "Мы оплатили наши кредиты и займы",              "outflow", "financing", 28),
    ("Дивиденды",                      "Выплата дивидендов собственникам",              "outflow", "financing", 29),
    # Техническая операция (2)
    ("Доход — Перевод между счетами",  "Поступление денег с нашего счёта или другого кошелька", "inflow",  "technical", 30),
    ("Расход — Перевод между счетами", "Перевод денег на другой наш счёт или кошелёк",  "outflow", "technical", 31),
]


def seed_user_defaults(supabase, user_id: str) -> dict:
    """
    Засеять пользователю дефолтные кошельки, направления и статьи ДДС.
    Идемпотентно: добавляет только отсутствующие записи (по имени).

    Возвращает словарь с количеством добавленного и id первых двух кошельков
    (для генерации демо-данных).
    """
    # --- Глобальные справочники ---
    groups = {g["code"]: g["id"] for g in supabase.table("dds_groups").select("code, id").execute().data}
    kinds = {k["code"]: k["id"] for k in supabase.table("dds_activity_kinds").select("code, id").execute().data}

    # --- Кошельки ---
    existing_wallets = supabase.table("wallets").select("id, name").eq("user_id", user_id).execute().data
    existing_wallet_names = {w["name"] for w in existing_wallets}
    wallet_id_by_name = {w["name"]: w["id"] for w in existing_wallets}
    to_add_wallets = [w for w in DEFAULT_WALLETS if w["name"] not in existing_wallet_names]
    if to_add_wallets:
        payload = [{**w, "user_id": user_id} for w in to_add_wallets]
        inserted = supabase.table("wallets").insert(payload).execute().data
        for w in inserted:
            wallet_id_by_name[w["name"]] = w["id"]

    # --- Направления ---
    existing_dirs = supabase.table("business_directions").select("name").eq("user_id", user_id).execute().data
    existing_dir_names = {d["name"] for d in existing_dirs}
    to_add_dirs = [d for d in DEFAULT_DIRECTIONS if d["name"] not in existing_dir_names]
    if to_add_dirs:
        payload = [{**d, "user_id": user_id} for d in to_add_dirs]
        supabase.table("business_directions").insert(payload).execute()

    # --- Статьи ДДС ---
    existing_articles = supabase.table("dds_articles").select("name").eq("user_id", user_id).execute().data
    existing_article_names = {a["name"] for a in existing_articles}
    to_add_articles = []
    for name, descr, group_code, activity_code, order in DEFAULT_ARTICLES:
        if name in existing_article_names:
            continue
        to_add_articles.append({
            "user_id": user_id,
            "name": name,
            "description": descr,
            "group_id": groups[group_code],
            "activity_kind_id": kinds[activity_code],
            "sort_order": order,
        })
    if to_add_articles:
        for i in range(0, len(to_add_articles), 25):
            supabase.table("dds_articles").insert(to_add_articles[i:i + 25]).execute()

    return {
        "wallets_added": len(to_add_wallets),
        "directions_added": len(to_add_dirs),
        "articles_added": len(to_add_articles),
        "wallet_id_by_name": wallet_id_by_name,
    }
