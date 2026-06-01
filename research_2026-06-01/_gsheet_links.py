"""Делает ссылки в колонке Сайт кликабельными через HYPERLINK."""
from pathlib import Path
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

# Найдём колонку "Сайт"
header = ws1.row_values(1)
site_col = header.index("Сайт") + 1  # 1-based
print(f"Колонка «Сайт» — индекс {site_col} ({gspread.utils.rowcol_to_a1(1, site_col).rstrip('1')})")

n_rows = ws1.row_count
site_letter = gspread.utils.rowcol_to_a1(1, site_col).rstrip("1")

# Читаем текущие значения
current_urls = ws1.col_values(site_col)[1:]  # пропускаем шапку
print(f"Найдено URL: {len(current_urls)}")

# Превращаем в формулы HYPERLINK
# Google Sheets с локалью RU использует ; как разделитель — но HYPERLINK обычно работает и с запятой.
# Безопаснее — точка с запятой.
formula_rows = []
for url in current_urls:
    url = url.strip()
    if url.startswith("http"):
        # Экранируем кавычки в URL (на всякий случай)
        url_escaped = url.replace('"', '""')
        formula_rows.append([f'=HYPERLINK("{url_escaped}";"{url_escaped}")'])
    else:
        formula_rows.append([url])

# Записываем как формулы (USER_ENTERED интерпретирует = как формулу)
range_name = f"{site_letter}2:{site_letter}{len(formula_rows) + 1}"
ws1.update(values=formula_rows, range_name=range_name, value_input_option="USER_ENTERED")
print(f"Обновлено {len(formula_rows)} ячеек в диапазоне {range_name}")

# Форматируем как ссылку — синий цвет, подчёркивание
ws1.format(f"{site_letter}2:{site_letter}{n_rows}", {
    "textFormat": {
        "foregroundColor": {"red": 0.0, "green": 0.4, "blue": 0.8},
        "underline": True,
        "fontSize": 10,
    },
    "verticalAlignment": "TOP",
    "wrapStrategy": "WRAP",
})

# Также сделаем кликабельными URL на листе «Источники»
ws3 = sh.worksheet("Источники")
src_urls = ws3.col_values(1)
print(f"\nОбработка листа «Источники» — {len(src_urls)} строк")

src_formulas = []
for v in src_urls:
    v = v.strip()
    if v.startswith("http"):
        url_escaped = v.replace('"', '""')
        src_formulas.append([f'=HYPERLINK("{url_escaped}";"{url_escaped}")'])
    elif ": http" in v:
        # формат "Описание: https://url ..."
        label, rest = v.split(": ", 1)
        url = rest.split(" ", 1)[0]
        url_escaped = url.replace('"', '""')
        text_escaped = v.replace('"', '""')
        src_formulas.append([f'=HYPERLINK("{url_escaped}";"{text_escaped}")'])
    else:
        src_formulas.append([v])

ws3.update(values=src_formulas, range_name=f"A1:A{len(src_formulas)}",
           value_input_option="USER_ENTERED")
print(f"Обновлено {len(src_formulas)} строк в «Источники»")

print()
print("=" * 60)
print("ГОТОВО")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")
