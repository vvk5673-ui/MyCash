"""Перезаписывает существующую Google Sheets через API из данных _build_xlsx.

Запуск:
    "e:/Arhiv/projects/content_bot/venv/Scripts/python.exe" _gsheet_update.py
"""
import sys
import time
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

sys.path.insert(0, str(Path(__file__).parent))
from _build_xlsx import P, COLUMNS, TRENDS, FINDINGS, SOURCES, KEY_MAP

SECRETS = Path(__file__).parent / ".secrets" / "google_sa.json"
SHEET_ID = "1NKoeKQHDO40KoYYGF0lLKAqosWruRNjcOwlJujl9L_Q"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

NAVY = {"red": 0.122, "green": 0.220, "blue": 0.392}
WHITE = {"red": 1.0, "green": 1.0, "blue": 1.0}

creds = Credentials.from_service_account_file(str(SECRETS), scopes=SCOPES)
gc = gspread.authorize(creds)

print("Открываю таблицу...")
sh = gc.open_by_key(SHEET_ID)
print(f"  Заголовок: {sh.title}")
print(f"  Текущие листы: {[ws.title for ws in sh.worksheets()]}")
print()

# === Шаг 1: подготовка листов ===
print("Подготовка листов...")
existing = {ws.title: ws for ws in sh.worksheets()}
target_titles = ["Конкуренты", "Инсайты и тренды", "Источники"]

# Гарантируем нужные листы (создаём отсутствующие)
for title in target_titles:
    if title not in existing:
        ws_new = sh.add_worksheet(title=title, rows=100, cols=30)
        existing[title] = ws_new
        print(f"  Создан лист: {title}")

# Удаляем все лишние
for title, ws in list(existing.items()):
    if title not in target_titles:
        sh.del_worksheet(ws)
        print(f"  Удалён лишний лист: {title}")
        del existing[title]

# Очищаем целевые листы
for title in target_titles:
    existing[title].clear()
print("  Очистка выполнена.")
print()

ws1 = existing["Конкуренты"]
ws2 = existing["Инсайты и тренды"]
ws3 = existing["Источники"]

# === Лист 1: Конкуренты ===
print("Заполняю «Конкуренты»...")

rows = [list(COLUMNS)]
for i, prod in enumerate(P, start=1):
    row = []
    for col_name in COLUMNS:
        if col_name == "№":
            row.append(i)
        elif col_name == "Сайт":
            row.append(prod.get("site", ""))
        else:
            key = KEY_MAP.get(col_name)
            row.append(prod.get(key, "") if key else "")
    rows.append(row)

ws1.resize(rows=len(rows), cols=len(COLUMNS))
ws1.update(values=rows, range_name="A1")

last_col_letter = gspread.utils.rowcol_to_a1(1, len(COLUMNS)).rstrip("1")
end_col = len(COLUMNS)

# Форматирование шапки
ws1.format(f"A1:{last_col_letter}1", {
    "backgroundColor": NAVY,
    "textFormat": {"foregroundColor": WHITE, "bold": True, "fontSize": 11},
    "horizontalAlignment": "LEFT",
    "verticalAlignment": "MIDDLE",
    "wrapStrategy": "WRAP",
})

# Перенос текста во всех данных
ws1.format(f"A2:{last_col_letter}{len(rows)}", {
    "verticalAlignment": "TOP",
    "wrapStrategy": "WRAP",
    "textFormat": {"fontSize": 10},
})

# Заморозка + автофильтр + ширина + высота — batch
COL_WIDTHS = {
    "№": 50, "Название": 180, "Сайт": 250, "Сегмент": 90,
    "Страна": 170, "Год запуска": 90, "Платформы": 270,
    "Целевая аудитория": 280, "Тарифы (сводка)": 400, "Бесплатный тариф": 220,
    "Мин. цена ₽/мес": 110, "Макс. цена ₽/мес": 110, "Бизнес-модель": 200,
    "Ключевые функции": 400, "Уникальные фичи": 400, "Число клиентов": 230,
    "Выручка / MRR": 270, "Рейтинг App Store": 180, "Рейтинг Google Play": 180,
    "Интеграции": 350, "Голосовой ввод": 110, "OCR чеков": 110,
    "Оффлайн": 110, "Синхронизация устройств": 150,
    "Сильные стороны": 400, "Слабые стороны": 400,
    "Инвесторы / раунды": 300, "Активные обновления": 150,
}

requests = [
    # Заморозка
    {
        "updateSheetProperties": {
            "properties": {
                "sheetId": ws1.id,
                "gridProperties": {"frozenRowCount": 1, "frozenColumnCount": 2},
            },
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }
    },
    # Автофильтр
    {
        "setBasicFilter": {
            "filter": {
                "range": {
                    "sheetId": ws1.id,
                    "startRowIndex": 0, "endRowIndex": len(rows),
                    "startColumnIndex": 0, "endColumnIndex": end_col,
                }
            }
        }
    },
    # Высота строк данных
    {
        "updateDimensionProperties": {
            "range": {
                "sheetId": ws1.id, "dimension": "ROWS",
                "startIndex": 1, "endIndex": len(rows),
            },
            "properties": {"pixelSize": 90}, "fields": "pixelSize",
        }
    },
    # Высота шапки
    {
        "updateDimensionProperties": {
            "range": {
                "sheetId": ws1.id, "dimension": "ROWS",
                "startIndex": 0, "endIndex": 1,
            },
            "properties": {"pixelSize": 50}, "fields": "pixelSize",
        }
    },
]

# Ширина колонок
for col_idx, col_name in enumerate(COLUMNS):
    requests.append({
        "updateDimensionProperties": {
            "range": {
                "sheetId": ws1.id, "dimension": "COLUMNS",
                "startIndex": col_idx, "endIndex": col_idx + 1,
            },
            "properties": {"pixelSize": COL_WIDTHS.get(col_name, 150)},
            "fields": "pixelSize",
        }
    })

# Чередование строк
requests.append({
    "addBanding": {
        "bandedRange": {
            "range": {
                "sheetId": ws1.id,
                "startRowIndex": 0, "endRowIndex": len(rows),
                "startColumnIndex": 0, "endColumnIndex": end_col,
            },
            "rowProperties": {
                "headerColor": NAVY,
                "firstBandColor": WHITE,
                "secondBandColor": {"red": 0.957, "green": 0.965, "blue": 0.980},
            }
        }
    }
})

sh.batch_update({"requests": requests})

# === Лист 2: Инсайты и тренды ===
print("Заполняю «Инсайты и тренды»...")

data2 = [["Тренды рынка финансового учёта РФ/СНГ, июнь 2026", ""]]
data2.append(["", ""])  # пустая строка

for title, body in TRENDS:
    data2.append([title, body])
    data2.append(["", ""])

data2.append(["", ""])
findings_header_row = len(data2) + 1  # 1-based для format()
data2.append(["Что нашёл Claude, а Perplexity упустил", ""])
data2.append(["", ""])

for i, text in enumerate(FINDINGS, start=1):
    data2.append([f"{i}.", text])

ws2.resize(rows=len(data2) + 5, cols=2)
ws2.update(values=data2, range_name="A1")

# Форматирование
ws2.format("A1:B1", {
    "textFormat": {"fontSize": 14, "bold": True, "foregroundColor": NAVY},
})
ws2.merge_cells("A1:B1")

# Заголовки трендов (жирный) — строки 3, 5, 7, 9, ...
for i in range(len(TRENDS)):
    row_num = 3 + i * 2
    ws2.format(f"A{row_num}", {
        "textFormat": {"bold": True, "fontSize": 12, "foregroundColor": NAVY},
    })

ws2.format(f"A{findings_header_row}:B{findings_header_row}", {
    "textFormat": {"fontSize": 14, "bold": True, "foregroundColor": NAVY},
})
ws2.merge_cells(f"A{findings_header_row}:B{findings_header_row}")

# Перенос + вертикальное выравнивание
ws2.format("A:B", {
    "wrapStrategy": "WRAP",
    "verticalAlignment": "TOP",
})

sh.batch_update({"requests": [
    {"updateDimensionProperties": {
        "range": {"sheetId": ws2.id, "dimension": "COLUMNS",
                  "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 350}, "fields": "pixelSize",
    }},
    {"updateDimensionProperties": {
        "range": {"sheetId": ws2.id, "dimension": "COLUMNS",
                  "startIndex": 1, "endIndex": 2},
        "properties": {"pixelSize": 700}, "fields": "pixelSize",
    }},
]})

# === Лист 3: Источники ===
print("Заполняю «Источники»...")

data3 = [["Источники исследования"], [""]]
group_positions = []
for group, links in SOURCES:
    group_positions.append(len(data3) + 1)
    data3.append([group])
    for link in links:
        data3.append([link])
    data3.append([""])

ws3.resize(rows=len(data3) + 5, cols=1)
ws3.update(values=data3, range_name="A1")

ws3.format("A1", {
    "textFormat": {"fontSize": 14, "bold": True, "foregroundColor": NAVY},
})

for pos in group_positions:
    ws3.format(f"A{pos}", {
        "textFormat": {"bold": True, "fontSize": 12, "foregroundColor": NAVY},
    })

ws3.format("A:A", {"wrapStrategy": "WRAP"})

sh.batch_update({"requests": [{
    "updateDimensionProperties": {
        "range": {"sheetId": ws3.id, "dimension": "COLUMNS",
                  "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 900}, "fields": "pixelSize",
    }
}]})

print()
print("=" * 60)
print("ГОТОВО")
print("=" * 60)
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")
print(f"Листов: 3 (Конкуренты, Инсайты и тренды, Источники)")
print(f"Продуктов в Конкуренты: {len(P)}")
print(f"Трендов в Инсайты: {len(TRENDS)} + {len(FINDINGS)} находок")
print(f"Групп источников: {len(SOURCES)}")
