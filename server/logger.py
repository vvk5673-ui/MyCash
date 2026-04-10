"""
Логирование MyCash сервера
Пишет логи в файл с ротацией: /opt/MyCash/logs/mycash.log
Отдельно — только ошибки в /opt/MyCash/logs/errors.log
"""

import logging
import os
from logging.handlers import RotatingFileHandler

# Папка для логов (рядом с проектом)
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

# Файлы логов
MAIN_LOG = os.path.join(LOG_DIR, 'mycash.log')      # Все события
ERROR_LOG = os.path.join(LOG_DIR, 'errors.log')     # Только ошибки

# Формат: время — уровень — модуль — сообщение
FORMAT = '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


def setup_logging():
    """
    Настраивает логирование для всего проекта.
    Вызывается один раз при старте сервера.
    """
    formatter = logging.Formatter(FORMAT, datefmt=DATE_FORMAT)

    # === Главный лог: все события (INFO и выше) ===
    # Ротация: макс 5 МБ на файл, хранить 3 старых файла
    main_handler = RotatingFileHandler(
        MAIN_LOG,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding='utf-8'
    )
    main_handler.setLevel(logging.INFO)
    main_handler.setFormatter(formatter)

    # === Лог ошибок: только ERROR и CRITICAL ===
    # Ротация: макс 2 МБ, хранить 5 старых
    error_handler = RotatingFileHandler(
        ERROR_LOG,
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)

    # === Консоль (для systemd/journalctl) ===
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # Корневой логгер — добавляем все обработчики
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Удаляем старые обработчики (если были)
    root.handlers.clear()

    root.addHandler(main_handler)
    root.addHandler(error_handler)
    root.addHandler(console_handler)

    # Настройка уровня для шумных библиотек
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('hpack').setLevel(logging.WARNING)
    logging.getLogger('apscheduler').setLevel(logging.WARNING)
    logging.getLogger('aiogram.event').setLevel(logging.WARNING)

    log = logging.getLogger('mycash')
    log.info('=' * 60)
    log.info('Логирование запущено')
    log.info(f'Главный лог: {MAIN_LOG}')
    log.info(f'Лог ошибок:  {ERROR_LOG}')
    log.info('=' * 60)


def log_exception(logger, message, exc):
    """
    Удобная функция для логирования исключений с трейсбеком.
    Использование: log_exception(log, 'Ошибка при сохранении', e)
    """
    logger.error(f'{message}: {type(exc).__name__}: {exc}', exc_info=True)
