"""
Демо-данные для новых пользователей.

Пример месяца небольшого бизнеса: операции привязаны к реальным статьям
ДДС (article_id) и распределены по 4 кошелькам, поэтому корректно попадают
в Отчёт ДДС и аналитику по статьям/видам деятельности.
"""
from datetime import datetime


# Шаблон демо-операций. Поле "article" — точное название статьи из
# DEFAULT_ARTICLES (dds_defaults.py): по нему находим article_id пользователя.
# "wallet" — логический счёт: 'card' = Счёт №1, 'cash' = Наличка.
# "day" — день месяца (ставится в текущий месяц, не позже сегодня).
DEMO_TEMPLATE = [
    # Операционная — поступления
    {'type': 'income',  'article': 'Выручка от продаж товаров', 'amount': 180000, 'wallet': 'card', 'comment': 'Продажи за неделю',     'day': 3},
    {'type': 'income',  'article': 'Выручка от услуг',          'amount': 60000,  'wallet': 'card', 'comment': 'Оказанные услуги',       'day': 6},
    # Операционная — выбытия
    {'type': 'expense', 'article': 'Закупка товаров для перепродажи', 'amount': 70000, 'wallet': 'card', 'comment': 'Партия товара',     'day': 4},
    {'type': 'expense', 'article': 'Аренда помещения',          'amount': 35000,  'wallet': 'card', 'comment': 'Аренда за месяц',        'day': 5},
    {'type': 'expense', 'article': 'Зарплата сотрудникам',      'amount': 90000,  'wallet': 'card', 'comment': 'Зарплата команде',       'day': 10},
    {'type': 'expense', 'article': 'Налоги и взносы',           'amount': 25000,  'wallet': 'card', 'comment': 'Налоги и страховые',      'day': 12},
    {'type': 'expense', 'article': 'Реклама и маркетинг',       'amount': 15000,  'wallet': 'card', 'comment': 'Таргет и реклама',        'day': 8},
    {'type': 'expense', 'article': 'Коммунальные услуги',       'amount': 6000,   'wallet': 'card', 'comment': 'Электричество, вода',     'day': 9},
    {'type': 'expense', 'article': 'Связь и интернет',          'amount': 2000,   'wallet': 'card', 'comment': 'Интернет и телефония',    'day': 9},
    {'type': 'expense', 'article': 'Банковские комиссии',       'amount': 1500,   'wallet': 'card', 'comment': 'Обслуживание счёта',      'day': 11},
    {'type': 'expense', 'article': 'Канцелярия и расходники',   'amount': 3000,   'wallet': 'cash', 'comment': 'Расходники для офиса',    'day': 7},
    # Инвестиционная
    {'type': 'expense', 'article': 'Покупка ОС',               'amount': 40000,  'wallet': 'card', 'comment': 'Новый ноутбук',          'day': 13},
    # Финансовая
    {'type': 'income',  'article': 'Получение кредитов и займов', 'amount': 100000, 'wallet': 'card', 'comment': 'Кредит на развитие',  'day': 2},
]


def generate_demo_operations(user_id: str, card_wallet_id: str, cash_wallet_id: str,
                             article_id_by_name: dict | None = None) -> list:
    """
    Генерирует демо-операции (пример месяца бизнеса) для нового пользователя.

    Даты — всегда в ТЕКУЩЕМ месяце, на дни с 1-го по сегодняшний
    (день = min(день_шаблона, сегодня, 28)). Демо видны в списке сразу,
    без дат в будущем.

    article_id_by_name — карта «название статьи → id» статей пользователя
    (из засеянных DEFAULT_ARTICLES). Если передана — у операции проставляется
    article_id, и она корректно попадает в Отчёт ДДС и аналитику по статьям.
    """
    now = datetime.now()
    y = now.year
    m = now.month
    today = now.day
    article_id_by_name = article_id_by_name or {}

    wallet_by_key = {'card': card_wallet_id, 'cash': cash_wallet_id}

    operations = []
    for i, d in enumerate(DEMO_TEMPLATE):
        day = min(d['day'], today, 28)
        op_date = datetime(y, m, day, 10 + i % 12, (i * 7) % 60)

        operations.append({
            'user_id': user_id,
            'type': d['type'],
            'amount': d['amount'],
            'category': d['article'],  # текстовое название (для иконки в списке)
            'article_id': article_id_by_name.get(d['article']),  # привязка к статье ДДС
            'wallet_id': wallet_by_key.get(d['wallet'], card_wallet_id),
            'comment': d['comment'],
            'date': op_date.isoformat(),
            'is_demo': True,
            'synced': True
        })

    return operations
