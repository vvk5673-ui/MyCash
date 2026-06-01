"""Проверка авторизации Google Sheets через Service Account.

Запуск:
    "e:/Arhiv/projects/content_bot/venv/Scripts/python.exe" _gsheet_check.py

Что делает:
1. Читает JSON-ключ Service Account из .secrets/google_sa.json
2. Подключается к таблице 30_merged по её ID
3. Печатает первые 3 строки листа «Конкуренты» — если получилось, доступ есть
4. При ошибке доступа показывает email Service Account, который нужно
   добавить в "Поделиться" → Редактор на таблице.
"""
from pathlib import Path
import json
import sys
import gspread
from google.oauth2.service_account import Credentials

SECRETS = Path(__file__).parent / ".secrets" / "google_sa.json"
SHEET_ID = "1EkbrcDyccwOYDCSIOOxtbPWB90Kt6r6F"  # из ссылки Виктора

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

if not SECRETS.exists():
    print(f"[ERR] Не найден JSON-ключ Service Account: {SECRETS}")
    print(f"      Сохрани скачанный ключ из Google Cloud сюда.")
    sys.exit(1)

# Покажем email service account из ключа (для шага "Поделиться")
with SECRETS.open(encoding="utf-8") as f:
    sa_info = json.load(f)
sa_email = sa_info.get("client_email", "не найден")
print(f"Service Account email: {sa_email}")
print()

creds = Credentials.from_service_account_file(str(SECRETS), scopes=SCOPES)
gc = gspread.authorize(creds)

try:
    sh = gc.open_by_key(SHEET_ID)
    print(f"[OK] Открыл таблицу: {sh.title}")
    print(f"     Листы: {[ws.title for ws in sh.worksheets()]}")
    ws = sh.worksheet("Конкуренты")
    print()
    print(f"[OK] Лист «Конкуренты» — {ws.row_count} строк × {ws.col_count} колонок")
    print()
    print("Первые 3 строки (название + сайт + сегмент):")
    rows = ws.get("A1:D4")
    for r in rows:
        print("  ", " | ".join(r))
    print()
    print("=" * 60)
    print("[SUCCESS] Я могу читать и редактировать твою таблицу.")
    print("=" * 60)
except gspread.exceptions.APIError as e:
    if "PERMISSION_DENIED" in str(e) or "permission" in str(e).lower():
        print("[ERR] Нет доступа к таблице.")
        print()
        print(f"Нужно добавить этот email в \"Поделиться\" таблицы как Редактор:")
        print()
        print(f"     >>> {sa_email} <<<")
        print()
        print("Шаги:")
        print("1. Открой таблицу в браузере")
        print("2. Кнопка «Поделиться» вверху справа")
        print("3. В поле «Добавить пользователей и группы» вставь email выше")
        print("4. Роль — «Редактор»")
        print("5. Сними галочку «Уведомить пользователей»")
        print("6. Нажми «Поделиться»")
        sys.exit(2)
    raise
