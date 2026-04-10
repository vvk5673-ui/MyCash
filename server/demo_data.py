"""
Демо-данные для новых пользователей
17 операций — как в текущем фронтенде
"""
from datetime import datetime, timedelta


def generate_demo_operations(user_id: str, card_wallet_id: str, cash_wallet_id: str) -> list:
    """
    Генерирует 17 демо-операций для нового пользователя.
    Даты — в текущем месяце, до вчерашнего дня (чтобы фильтр "месяц"
    их показывал, а новые операции пользователя с датой "сегодня"
    попадали в самый верх списка).
    Если сегодня 1-2 число месяца — демо уходят в прошлый месяц целиком.
    """
    now = datetime.now()
    today = now.day
    if today >= 3:
        y = now.year
        m = now.month
        max_day = today - 1
    elif now.month == 1:
        y = now.year - 1
        m = 12
        max_day = 28
    else:
        y = now.year
        m = now.month - 1
        max_day = 28

    demo = [
        {'type': 'income', 'amount': 80000, 'category': 'Зарплата', 'wallet_id': card_wallet_id, 'comment': '', 'day': 1},
        {'type': 'expense', 'amount': 25000, 'category': 'ЖКХ', 'wallet_id': card_wallet_id, 'comment': 'Аренда квартиры', 'day': 2},
        {'type': 'expense', 'amount': 5600, 'category': 'ЖКХ', 'wallet_id': card_wallet_id, 'comment': 'Коммуналка', 'day': 3},
        {'type': 'expense', 'amount': 1200, 'category': 'Связь', 'wallet_id': card_wallet_id, 'comment': 'Телефон + интернет', 'day': 3},
        {'type': 'expense', 'amount': 8500, 'category': 'Продукты', 'wallet_id': card_wallet_id, 'comment': 'Пятёрочка', 'day': 4},
        {'type': 'expense', 'amount': 3200, 'category': 'Продукты', 'wallet_id': cash_wallet_id, 'comment': 'Рынок', 'day': 5},
        {'type': 'expense', 'amount': 2500, 'category': 'Транспорт', 'wallet_id': card_wallet_id, 'comment': 'Метро', 'day': 5},
        {'type': 'expense', 'amount': 3500, 'category': 'Транспорт', 'wallet_id': card_wallet_id, 'comment': 'Бензин', 'day': 7},
        {'type': 'expense', 'amount': 1800, 'category': 'Кафе', 'wallet_id': cash_wallet_id, 'comment': 'Обед с другом', 'day': 8},
        {'type': 'expense', 'amount': 4500, 'category': 'Одежда', 'wallet_id': card_wallet_id, 'comment': 'Кроссовки', 'day': 10},
        {'type': 'expense', 'amount': 950, 'category': 'Здоровье', 'wallet_id': cash_wallet_id, 'comment': 'Аптека', 'day': 12},
        {'type': 'expense', 'amount': 799, 'category': 'Подписки', 'wallet_id': card_wallet_id, 'comment': 'Кинопоиск', 'day': 15},
        {'type': 'expense', 'amount': 2000, 'category': 'Развлечения', 'wallet_id': cash_wallet_id, 'comment': 'Кино', 'day': 18},
        {'type': 'expense', 'amount': 1500, 'category': 'Продукты', 'wallet_id': card_wallet_id, 'comment': 'Магнит', 'day': 20},
        {'type': 'income', 'amount': 1200, 'category': 'Кэшбек', 'wallet_id': card_wallet_id, 'comment': 'Кэшбек за месяц', 'day': 22},
        {'type': 'expense', 'amount': 2000, 'category': 'Прочее', 'wallet_id': cash_wallet_id, 'comment': 'Подарок маме', 'day': 25},
        {'type': 'income', 'amount': 15000, 'category': 'Подработка', 'wallet_id': cash_wallet_id, 'comment': 'Фриланс', 'day': 28},
    ]

    operations = []
    for i, d in enumerate(demo):
        # Дата: текущий месяц, указанный день
        day = min(d['day'], 28)  # Защита от февраля
        op_date = datetime(y, m, day, 10 + i % 12, (i * 7) % 60)

        operations.append({
            'user_id': user_id,
            'type': d['type'],
            'amount': d['amount'],
            'category': d['category'],
            'wallet_id': d['wallet_id'],
            'comment': d['comment'],
            'date': op_date.isoformat(),
            'is_demo': True,
            'synced': True
        })

    return operations
