"""Полировка существующей таблицы — компактность, авто-высота, читаемость.

Не пересоздаёт данные — только форматирование.
"""
from pathlib import Path
import sys

import gspread
from google.oauth2.service_account import Credentials

SECRETS = Path(__file__).parent / ".secrets" / "google_sa.json"
SHEET_ID = "1NKoeKQHDO40KoYYGF0lLKAqosWruRNjcOwlJujl9L_Q"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

creds = Credentials.from_service_account_file(str(SECRETS), scopes=SCOPES)
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)

ws1 = sh.worksheet("Конкуренты")
ws2 = sh.worksheet("Инсайты и тренды")
ws3 = sh.worksheet("Источники")

print(f"Лист 1: {ws1.row_count} строк x {ws1.col_count} колонок")
print(f"Лист 2: {ws2.row_count} строк")
print(f"Лист 3: {ws3.row_count} строк")
print()

# === Лист 1: Конкуренты ===
print("Полирую «Конкуренты»...")

n_rows = ws1.row_count
n_cols = ws1.col_count
last_col = gspread.utils.rowcol_to_a1(1, n_cols).rstrip("1")

# 1. Уменьшаем шапку до 40px
# 2. Авто-высота для строк данных (сами подстроятся под контент)
# 3. Расширяем некоторые узкие колонки чтобы текст влез в 2-3 строки
# 4. Заголовок: меньше шрифт чтобы умещался в 40px

requests = [
    # Шапка — 40 px, шрифт 11, тонкое выравнивание
    {
        "updateDimensionProperties": {
            "range": {
                "sheetId": ws1.id, "dimension": "ROWS",
                "startIndex": 0, "endIndex": 1,
            },
            "properties": {"pixelSize": 40}, "fields": "pixelSize",
        }
    },
    # Авто-высота для всех строк данных
    {
        "autoResizeDimensions": {
            "dimensions": {
                "sheetId": ws1.id, "dimension": "ROWS",
                "startIndex": 1, "endIndex": n_rows,
            }
        }
    },
]

sh.batch_update({"requests": requests})

# Также — переустановим вертикальное выравнивание в TOP и шрифт 10
ws1.format(f"A2:{last_col}{n_rows}", {
    "verticalAlignment": "TOP",
    "wrapStrategy": "WRAP",
    "textFormat": {"fontSize": 10},
    "padding": {"top": 4, "right": 4, "bottom": 4, "left": 4},
})

# Шапка — горизонтальное выравнивание по центру для коротких столбцов с да/нет
short_cols_indices = []
COLUMNS_LOCAL = ws1.row_values(1)
SHORT_NAMES = {"№", "Год запуска", "Мин. цена ₽/мес", "Макс. цена ₽/мес",
               "Голосовой ввод", "OCR чеков", "Оффлайн", "Синхронизация устройств",
               "Активные обновления"}
for i, c in enumerate(COLUMNS_LOCAL):
    if c in SHORT_NAMES:
        short_cols_indices.append(i)

center_format_requests = []
for idx in short_cols_indices:
    col_letter = gspread.utils.rowcol_to_a1(1, idx + 1).rstrip("1")
    ws1.format(f"{col_letter}2:{col_letter}{n_rows}", {
        "horizontalAlignment": "CENTER",
        "verticalAlignment": "MIDDLE",
    })

# Авто-высота ещё раз после переформатирования (Google Sheets иногда требует второго прохода)
sh.batch_update({"requests": [
    {
        "autoResizeDimensions": {
            "dimensions": {
                "sheetId": ws1.id, "dimension": "ROWS",
                "startIndex": 1, "endIndex": n_rows,
            }
        }
    }
]})

# === Лист 2: Инсайты ===
print("Полирую «Инсайты и тренды»...")
sh.batch_update({"requests": [
    {
        "autoResizeDimensions": {
            "dimensions": {
                "sheetId": ws2.id, "dimension": "ROWS",
                "startIndex": 1, "endIndex": ws2.row_count,
            }
        }
    }
]})

# === Лист 3: Источники ===
print("Полирую «Источники»...")
sh.batch_update({"requests": [
    {
        "autoResizeDimensions": {
            "dimensions": {
                "sheetId": ws3.id, "dimension": "ROWS",
                "startIndex": 0, "endIndex": ws3.row_count,
            }
        }
    }
]})

print()
print("=" * 60)
print("ГОТОВО")
print("=" * 60)
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")
