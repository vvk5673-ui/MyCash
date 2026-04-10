# Деплой MyCash на VPS

Пошаговая инструкция по развёртыванию MyCash с нуля на VPS (Beget Cloud + Ubuntu 24.04). Проверена на реальном деплое 10.04.2026.

Стек:
- **Frontend:** HTML + CSS + JS, GitHub Pages
- **Backend:** FastAPI (Python) + Supabase (PostgreSQL)
- **Bot:** aiogram (webhook-режим)
- **VPS:** Ubuntu 24.04 с nginx + certbot
- **Запуск:** systemd-сервис

---

## 1. Что нужно заранее

| Что | Зачем | Где |
|-----|-------|-----|
| VPS с Ubuntu 24.04 | Сервер для API + бота | [cloud.beget.com](https://cloud.beget.com) |
| Домен (например, mycash-app.ru) | Для HTTPS и webhook | Там же или любой регистратор |
| GitHub-репозиторий | Для `git clone` на VPS | github.com |
| Telegram-бот | `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) |
| Supabase-проект | База данных | [supabase.com](https://supabase.com) |
| Свой Telegram ID | `ADMIN_TELEGRAM_ID` | [@userinfobot](https://t.me/userinfobot) |

---

## 2. Создание VPS на Beget

1. Зайти в [cloud.beget.com](https://cloud.beget.com) → **Виртуальные серверы**
2. **Создать сервис**
3. Параметры:
   - **ОС:** Ubuntu 24.04
   - **Тариф:** минимальный Simple (1 vCPU / 1 ГБ RAM / 10 ГБ SSD) — хватает для старта
   - **Сеть:** Новый IPv4 (обязательно, +150 ₽/мес)
   - **Аутентификация:** задать пароль (запомнить!) ИЛИ SSH-ключ
4. Создать сервис

**Что получим:**
- IP-адрес (например `213.139.211.12`)
- Пароль root
- Стоимость: ~330 ₽/мес

---

## 3. Подключение по SSH

**С Windows (Git Bash, уже есть в составе Git for Windows):**

```bash
ssh root@<IP_СЕРВЕРА>
```

При первом подключении ответить `yes` на вопрос про fingerprint. Ввести пароль.

**Смена пароля root (рекомендуется сразу):**

```bash
passwd
```

**Настройка SSH-ключа (чтобы не вводить пароль каждый раз):**

На локальном компьютере:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

На сервере:

```bash
mkdir -p ~/.ssh
echo "<содержимое id_ed25519.pub>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

После этого `ssh root@<IP>` будет работать без пароля.

---

## 4. Установка пакетов

```bash
apt update && apt upgrade -y
apt install -y python3 python3-pip python3-venv git nginx certbot python3-certbot-nginx
```

**Что ставим:**
- `python3` + `python3-venv` — для запуска FastAPI и бота
- `git` — для клонирования репозитория
- `nginx` — reverse proxy для HTTPS
- `certbot` — Let's Encrypt SSL-сертификаты

Установка может занять 1-3 минуты. Если после `apt upgrade` SSH отключится — это нормально, просто переподключиться.

---

## 5. Настройка домена

### 5.1 Купить домен

На Beget: **Домены → Зарегистрировать домен**. Выбрать зону `.ru` (~200 ₽/год).

### 5.2 Добавить A-записи

**Beget → DNS → выбрать домен → Управление записями:**

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` (пусто) | IP сервера |
| A | `www` | IP сервера |

**Важно:** если Beget автоматически создал A-записи на свой хостинг (`5.101.X.X`) — **удалить их**, оставить только наши.

### 5.3 Проверка распространения

DNS для только что зарегистрированного домена распространяется 30-60 минут (иногда до суток). Проверка:

```bash
# На сервере
host mycash-app.ru 8.8.8.8
host mycash-app.ru 1.1.1.1
```

Ожидаемый ответ:
```
mycash-app.ru has address 213.139.211.12
```

Если `NXDOMAIN` — подождать и проверить снова.

---

## 6. Клонирование репозитория

```bash
cd /opt
git clone https://github.com/<username>/MyCash.git
cd /opt/MyCash
```

Результат: вся структура проекта в `/opt/MyCash/`.

---

## 7. Создание .env с секретами

**Важно:** `.env` НЕ должен попадать в git (проверить `.gitignore`).

```bash
cat > /opt/MyCash/.env << 'EOF'
TELEGRAM_BOT_TOKEN=<токен_от_BotFather>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_KEY=<service_role_key>
ADMIN_TELEGRAM_ID=<ваш_telegram_id>
EOF

chmod 600 /opt/MyCash/.env
```

`chmod 600` — права только для root, никто другой не прочитает.

---

## 8. Python venv и зависимости

```bash
cd /opt/MyCash
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r server/requirements.txt
```

Установка занимает 1-3 минуты. Проверка:

```bash
./venv/bin/python -c "from server.main import app; print('OK')"
```

Если `OK` — всё установилось, импорты работают.

---

## 9. Systemd-сервис

Создаёт автозапуск + автоматический рестарт при падении.

```bash
cat > /etc/systemd/system/mycash.service << 'EOF'
[Unit]
Description=MyCash API + Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/MyCash/server
Environment="PATH=/opt/MyCash/venv/bin"
ExecStart=/opt/MyCash/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mycash
systemctl start mycash
```

**Проверка:**

```bash
systemctl status mycash
```

Должно быть `active (running)`.

**Если сервис падает при первом запуске** с ошибкой `TelegramNetworkError: Request timeout error` — это нормально (первое подключение к Telegram API может тайм-аутиться). Systemd автоматически перезапустит через 5 секунд, и второй запуск будет успешным.

---

## 10. Настройка nginx (HTTP)

```bash
cat > /etc/nginx/sites-available/mycash << 'EOF'
server {
    listen 80;
    server_name mycash-app.ru www.mycash-app.ru;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/mycash /etc/nginx/sites-enabled/mycash
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

**Проверка:**

```bash
curl http://127.0.0.1:8000/v1/health
curl http://<IP_сервера>/v1/health
```

Оба должны вернуть `{"status":"ok","version":"1.0"}`.

---

## 11. SSL через certbot

**Требование:** DNS должен уже разойтись (шаг 5.3).

```bash
certbot --nginx -d mycash-app.ru -d www.mycash-app.ru \
    --non-interactive --agree-tos \
    --email <ваш_email> --redirect
```

**Что делает certbot:**
- Запрашивает сертификат у Let's Encrypt
- Автоматически прописывает конфиг в nginx
- Добавляет редирект HTTP → HTTPS
- Настраивает автообновление (раз в 3 месяца)

**Проверка:**

```bash
curl https://mycash-app.ru/v1/health
```

Должно вернуть `{"status":"ok","version":"1.0"}`. Сертификат действует 90 дней, обновится сам.

---

## 12. Установка webhook бота

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://mycash-app.ru/bot/webhook&drop_pending_updates=true"
```

Ожидаемый ответ:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Проверка статуса:**

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

В ответе должно быть `"url":"https://mycash-app.ru/bot/webhook"`.

**Если ошибка `Failed to resolve host`** — Telegram закешировал старый NXDOMAIN-ответ для свежезарегистрированного домена. Подождать 10-30 минут и повторить.

---

## 13. Обновление фронтенда

### 13.1 URL API в api.js

В файле `docs/api.js` указать домен API:

```js
const BASE_URL = localStorage.getItem('mycash_api_url') || 'https://mycash-app.ru';
```

### 13.2 Версии ресурсов для сброса кеша

Telegram кеширует Mini App по URL. При любом изменении кода нужно:

**В `docs/index.html`** — поднять версию:
```html
<script src="api.js?v=11"></script>
<script src="app.js?v=11"></script>
```

**В `server/bot.py`** — обновить `WEBAPP_URL`:
```python
WEBAPP_URL = "https://vvk5673-ui.github.io/MyCash/?v=11"
```

Закоммитить и запушить на GitHub. GitHub Pages обновится за 1-2 минуты.

---

## 14. Проверка работы

### 14.1 API-сервер

```bash
# На VPS
curl https://mycash-app.ru/v1/health
# Ожидаемо: {"status":"ok","version":"1.0"}
```

### 14.2 Бот

В Telegram:
1. Открыть [@<bot_username>](https://t.me/) → `/start`
2. Должно прийти приветствие с кнопкой **"📊 Открыть MyCash"**

### 14.3 Mini App

1. Нажать кнопку "Открыть MyCash"
2. Должны появиться демо-операции за текущий месяц
3. Добавить новую операцию — появится в самом верху списка

### 14.4 Данные в Supabase

В логах сервера должны быть успешные запросы:

```bash
grep 'POST /v1/operations' /var/log/nginx/access.log | tail -5
# Должны быть ответы с кодом 200
```

В панели Supabase (Table Editor → operations) появится новая запись.

---

## 15. Обновление кода (после первого деплоя)

```bash
ssh root@<IP>
cd /opt/MyCash
git pull origin main
systemctl restart mycash
```

**Если изменились `requirements.txt`:**

```bash
./venv/bin/pip install -r server/requirements.txt
systemctl restart mycash
```

**Если изменился фронтенд** — GitHub Pages обновится автоматически после `git push`. При необходимости — поднять версию `?v=N` (см. 13.2).

---

## 16. Мониторинг и логи

| Что смотреть | Команда |
|-------------|---------|
| Статус сервиса | `systemctl status mycash` |
| Логи systemd (старт/остановка/крэши) | `journalctl -u mycash -n 50 --no-pager` |
| Все события API | `tail -50 /opt/MyCash/logs/mycash.log` |
| Только ошибки | `tail -50 /opt/MyCash/logs/errors.log` |
| HTTP-запросы | `tail -50 /var/log/nginx/access.log` |
| Ошибки nginx | `tail -50 /var/log/nginx/error.log` |

**Логи API ротируются автоматически:**
- `mycash.log` — 5 МБ × 3 файла (максимум 15 МБ)
- `errors.log` — 2 МБ × 5 файлов (максимум 10 МБ)

---

## 17. Типичные проблемы и решения

### 17.1 Сервис не стартует

```bash
journalctl -u mycash -n 50 --no-pager
```

**Частые причины:**
- Ошибка в `.env` (неверный ключ) → проверить переменные
- Неправильный Python-путь в `ExecStart` → проверить `/opt/MyCash/venv/bin/uvicorn`
- Ошибка импорта в `main.py` → `./venv/bin/python -c "from main import app"`

### 17.2 API не отвечает извне

```bash
# Проверить что сервис слушает порт 8000
ss -tlnp | grep 8000

# Проверить nginx
nginx -t
systemctl status nginx
```

### 17.3 Certbot ошибка DNS NXDOMAIN

DNS ещё не разошёлся. Проверить `host mycash-app.ru 8.8.8.8`. Подождать и повторить `certbot ...`.

### 17.4 Webhook падает с "Failed to resolve host"

Telegram закешировал NXDOMAIN. Подождать 15-30 минут и повторить `setWebhook`.

### 17.5 Mini App не обновляется после изменений кода

Telegram кеширует по URL. **Решение:** поднять `?v=N` в `index.html` И в `WEBAPP_URL` (bot.py), задеплоить, перезапустить сервис, в Telegram смахнуть Mini App вниз и открыть заново.

### 17.6 Операции не сохраняются на сервер (401 Unauthorized)

Проверить что:
- `API.auth()` успешно вызывается при старте (в DevTools консоли: "API: онлайн-режим")
- `authToken` установлен после auth
- Изначальный `mode` в `api.js` не блокирует auth-endpoint (см. коммит "api.auth() не мог переключить mode из offline в online")

### 17.7 Операции добавляются, но попадают в середину списка

Это значит демо-данные сгенерированы с датами в будущем. Проверить `server/demo_data.py` и `docs/app.js generateDemoData()` — даты должны быть в текущем месяце до вчерашнего дня.

### 17.8 SSH-сессия отключается после `apt upgrade`

Это нормально. Просто переподключиться: `ssh root@<IP>`.

### 17.9 Имена кошельков не совпадают фронт ↔ сервер

На фронте может быть с эмодзи (`"💳 Карта"`), на сервере без (`"Карта"`). Решение — функция `cleanWalletName()` в `app.js` (убирает эмодзи и пробелы в начале).

---

## Чек-лист первого деплоя

- [ ] VPS арендован, root-доступ получен
- [ ] Домен куплен, A-записи указывают на IP VPS
- [ ] DNS распространился (`host` отвечает правильно)
- [ ] Пакеты установлены (python3, nginx, certbot, git)
- [ ] Репозиторий склонирован в `/opt/MyCash`
- [ ] `.env` создан с `chmod 600`
- [ ] Python venv создан, зависимости установлены
- [ ] Systemd-сервис `mycash` запущен (`active (running)`)
- [ ] Nginx настроен, проксирует на порт 8000
- [ ] SSL-сертификат получен (certbot)
- [ ] `curl https://<домен>/v1/health` возвращает OK
- [ ] Webhook бота установлен, `getWebhookInfo` показывает наш URL
- [ ] URL API обновлён в `docs/api.js`
- [ ] Версия `?v=N` обновлена в `index.html` и `bot.py`
- [ ] В Telegram бот отвечает на `/start`
- [ ] Mini App открывается и показывает демо-данные
- [ ] Новая операция появляется в Supabase

---

## Стоимость владения (месяц)

| Что | ₽/мес |
|-----|-------|
| VPS Beget Simple | 330 |
| IPv4-адрес | 150 |
| Домен .ru | ~17 (200 ₽/год ÷ 12) |
| Supabase Free Tier | 0 |
| GitHub Pages | 0 |
| Let's Encrypt SSL | 0 |
| **Итого** | **~497 ₽/мес** |

---

## Полезные ссылки

- [FastAPI docs](https://fastapi.tiangolo.com/)
- [aiogram docs](https://docs.aiogram.dev/)
- [Supabase Python client](https://supabase.com/docs/reference/python/introduction)
- [Let's Encrypt / certbot](https://certbot.eff.org/)
- [Beget VPS docs](https://beget.com/ru/kb/vps)
- [Telegram Bot API](https://core.telegram.org/bots/api)
