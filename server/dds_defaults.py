"""
Дефолтные справочники MyCash для засева нового пользователя.

Используется при регистрации (main.py) — чтобы новый пользователь сразу
получил ту же структуру, что задана в prototype_table.xlsx:
  - 4 кошелька (Кошелёк №1, Кошелёк №2, Наличка, Касса)
  - 2 направления (Направление 1, Направление 2)
  - 31 статью ДДС (с привязкой к группе и виду деятельности)

Функция seed_user_defaults() идемпотентна: добавляет только то, чего ещё нет.
"""

# 4 базовых кошелька (как в Excel).
# "direction" — имя направления по умолчанию (привязка счёта к направлению).
DEFAULT_WALLETS = [
    {"name": "Кошелёк №1", "icon": "credit-card", "color": "#007AFF", "initial_balance": 0, "sort_order": 1, "direction": "Направление 1"},
    {"name": "Кошелёк №2", "icon": "credit-card", "color": "#5856D6", "initial_balance": 0, "sort_order": 2, "direction": "Направление 1"},
    {"name": "Наличка", "icon": "wallet", "color": "#34C759", "initial_balance": 0, "sort_order": 3, "direction": "Направление 2"},
    {"name": "Касса", "icon": "shopping-bag", "color": "#FF9500", "initial_balance": 0, "sort_order": 4, "direction": "Направление 2"},
]

# 2 базовых направления (пользователь может переименовать/добавить/удалить)
DEFAULT_DIRECTIONS = [
    {"name": "Направление 1", "icon": "folder", "color": "#007AFF", "sort_order": 1},
    {"name": "Направление 2", "icon": "folder", "color": "#34C759", "sort_order": 2},
]

# Статьи ДДС по умолчанию: (name, description, group_code, activity_code, sort_order)
# По решению Виктора оставлены ТОЛЬКО служебные статьи переводов между счетами.
# Все статьи доходов и расходов пользователь заводит сам.
DEFAULT_ARTICLES = [
    # Техническая операция (2) — служебные для переводов между кошельками (неудаляемые)
    ("Доход — Перевод между кошельками",  "Поступление денег с другого нашего кошелька", "inflow",  "technical", 30),
    ("Расход — Перевод между кошельками", "Перевод денег на другой наш кошелёк",  "outflow", "technical", 31),
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

    # --- Направления (создаём ДО кошельков, чтобы привязать счёт к направлению) ---
    existing_dirs = supabase.table("business_directions").select("id, name").eq("user_id", user_id).execute().data
    existing_dir_names = {d["name"] for d in existing_dirs}
    dir_id_by_name = {d["name"]: d["id"] for d in existing_dirs}
    to_add_dirs = [d for d in DEFAULT_DIRECTIONS if d["name"] not in existing_dir_names]
    if to_add_dirs:
        payload = [{**d, "user_id": user_id} for d in to_add_dirs]
        inserted_dirs = supabase.table("business_directions").insert(payload).execute().data
        for d in inserted_dirs:
            dir_id_by_name[d["name"]] = d["id"]

    # --- Кошельки (с привязкой к направлению по имени) ---
    existing_wallets = supabase.table("wallets").select("id, name").eq("user_id", user_id).execute().data
    existing_wallet_names = {w["name"] for w in existing_wallets}
    wallet_id_by_name = {w["name"]: w["id"] for w in existing_wallets}
    to_add_wallets = [w for w in DEFAULT_WALLETS if w["name"] not in existing_wallet_names]
    if to_add_wallets:
        payload = []
        for w in to_add_wallets:
            item = {k: v for k, v in w.items() if k != "direction"}
            item["user_id"] = user_id
            item["direction_id"] = dir_id_by_name.get(w.get("direction"))
            payload.append(item)
        inserted = supabase.table("wallets").insert(payload).execute().data
        for w in inserted:
            wallet_id_by_name[w["name"]] = w["id"]

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
