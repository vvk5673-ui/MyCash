"""Создаёт нативную Google Sheets таблицу через API из данных _build_xlsx.

Запуск:
    "e:/Arhiv/projects/content_bot/venv/Scripts/python.exe" _gsheet_create.py
"""
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

sys.path.insert(0, str(Path(__file__).parent))
from _build_xlsx import P, COLUMNS, TRENDS, FINDINGS, SOURCES, KEY_MAP

SECRETS = Path(__file__).parent / ".secrets" / "google_sa.json"
SHARE_EMAIL = "vvk5673@gmail.com"
SHEET_TITLE = "MyCash — Анализ рынка финансового учёта РФ/СНГ, июнь 2026"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

creds = Credentials.from_service_account_file(str(SECRETS), scopes=SCOPES)
gc = gspread.authorize(creds)

print("Создаю новую таблицу...")
sh = gc.create(SHEET_TITLE)
print(f"  ID: {sh.id}")
print(f"  URL: https://docs.google.com/spreadsheets/d/{sh.id}/edit")

print(f"Расшариваю на {SHARE_EMAIL} как Редактора...")
sh.share(SHARE_EMAIL, perm_type="user", role="writer", notify=False)

# === Лист 1: Конкуренты ===
print("Заполняю «Конкуренты»...")
ws1 = sh.sheet1
ws1.update_title("Конкуренты")

header = COLUMNS
rows = [header]
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

ws1.update(values=rows, range_name="A1")
ws1.resize(rows=len(rows), cols=len(header))

# Форматирование шапки
ws1.format("A1:AB1", {
    "backgroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392},
    "textFormat": {
        "foregroundColor": {"red": 1.0, "green": 1.0, "blue": 1.0},
        "bold": True, "fontSize": 11,
    },
    "horizontalAlignment": "LEFT",
    "verticalAlignment": "MIDDLE",
    "wrapStrategy": "WRAP",
})

# Перенос текста во всех данных
ws1.format(f"A2:AB{len(rows)}", {
    "verticalAlignment": "TOP",
    "wrapStrategy": "WRAP",
    "textFormat": {"fontSize": 10},
})

# Заморозка 1-й строки + 2-х первых колонок
sh.batch_update({
    "requests": [
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": ws1.id,
                    "gridProperties": {"frozenRowCount": 1, "frozenColumnCount": 2},
                },
                "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
            }
        },
        # Автофильтр на шапке
        {
            "setBasicFilter": {
                "filter": {
                    "range": {
                        "sheetId": ws1.id,
                        "startRowIndex": 0, "endRowIndex": len(rows),
                        "startColumnIndex": 0, "endColumnIndex": len(header),
                    }
                }
            }
        },
    ]
})

# Ширина колонок
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

width_requests = []
for col_idx, col_name in enumerate(COLUMNS):
    px = COL_WIDTHS.get(col_name, 150)
    width_requests.append({
        "updateDimensionProperties": {
            "range": {
                "sheetId": ws1.id, "dimension": "COLUMNS",
                "startIndex": col_idx, "endIndex": col_idx + 1,
            },
            "properties": {"pixelSize": px},
            "fields": "pixelSize",
        }
    })

sh.batch_update({"requests": width_requests})

# Высота строк (90 px для данных)
sh.batch_update({"requests": [{
    "updateDimensionProperties": {
        "range": {
            "sheetId": ws1.id, "dimension": "ROWS",
            "startIndex": 1, "endIndex": len(rows),
        },
        "properties": {"pixelSize": 90},
        "fields": "pixelSize",
    }
}]})

# === Лист 2: Инсайты и тренды ===
print("Заполняю «Инсайты и тренды»...")
ws2 = sh.add_worksheet(title="Инсайты и тренды", rows=100, cols=2)

ws2.update(values=[["Тренды рынка финансового учёта РФ/СНГ, июнь 2026"]], range_name="A1")
ws2.format("A1:B1", {
    "textFormat": {"fontSize": 14, "bold": True,
                   "foregroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392}},
    "mergeType": "MERGE_ALL",
})
ws2.merge_cells("A1:B1")

trend_rows = []
for title, body in TRENDS:
    trend_rows.append([title, body])
    trend_rows.append(["", ""])

ws2.update(values=trend_rows, range_name="A3")

# Заголовок секции находок
findings_start = 3 + len(trend_rows) + 2
ws2.update(values=[["Что нашёл Claude, а Perplexity упустил"]], range_name=f"A{findings_start}")
ws2.merge_cells(f"A{findings_start}:B{findings_start}")

finding_rows = [[f"{i}.", text] for i, text in enumerate(FINDINGS, start=1)]
ws2.update(values=finding_rows, range_name=f"A{findings_start + 2}")

# Ширина и форматирование
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

ws2.format("A:B", {
    "wrapStrategy": "WRAP",
    "verticalAlignment": "TOP",
})

# Жирность заголовков трендов и заголовка секции
for i, (title, _) in enumerate(TRENDS):
    row = 3 + i * 2
    ws2.format(f"A{row}", {
        "textFormat": {"bold": True, "fontSize": 12,
                       "foregroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392}}
    })

ws2.format(f"A{findings_start}", {
    "textFormat": {"fontSize": 14, "bold": True,
                   "foregroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392}}
})

# === Лист 3: Источники ===
print("Заполняю «Источники»...")
ws3 = sh.add_worksheet(title="Источники", rows=200, cols=1)

ws3.update(values=[["Источники исследования"]], range_name="A1")
ws3.format("A1", {
    "textFormat": {"fontSize": 14, "bold": True,
                   "foregroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392}}
})

src_rows = [[""]]  # пустая
for group, links in SOURCES:
    src_rows.append([group])
    for link in links:
        src_rows.append([link])
    src_rows.append([""])

ws3.update(values=src_rows, range_name="A2")

# Жирность заголовков групп
row_ptr = 2
src_group_rows = []
for group, links in SOURCES:
    src_group_rows.append(row_ptr + 1)  # после пустой
    row_ptr += 1 + len(links) + 1
# fix: пересчитаем
row_ptr = 3  # начали с A2 пустой, потом A3 = первая группа
positions = []
cur = 3
for group, links in SOURCES:
    positions.append(cur)
    cur += 1 + len(links) + 1

for pos in positions:
    ws3.format(f"A{pos}", {
        "textFormat": {"bold": True, "fontSize": 12,
                       "foregroundColor": {"red": 0.122, "green": 0.220, "blue": 0.392}}
    })

# Ширина и перенос
sh.batch_update({"requests": [{
    "updateDimensionProperties": {
        "range": {"sheetId": ws3.id, "dimension": "COLUMNS",
                  "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 900}, "fields": "pixelSize",
    }
}]})
ws3.format("A:A", {"wrapStrategy": "WRAP"})

print()
print("=" * 60)
print("ГОТОВО")
print("=" * 60)
print(f"URL: https://docs.google.com/spreadsheets/d/{sh.id}/edit")
print(f"Расшарено на: {SHARE_EMAIL}")
print(f"Листов: 3 (Конкуренты, Инсайты и тренды, Источники)")
print(f"Строк в Конкуренты: {len(P)} продуктов")
