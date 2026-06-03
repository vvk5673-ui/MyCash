#!/usr/bin/env bash
# Умное сохранение MyCash одной командой.
#   ./save.sh "сообщение коммита"
#
# Логика (сам решает, что делать):
#   1. Коммит — если есть изменения и задано сообщение.
#   2. Push — всегда (фронт docs/ уезжает на GitHub Pages самим push'ем).
#   3. Если менялся server/ (бэк) -> на VPS git pull + restart + health.
#      Если бэк НЕ менялся -> VPS не трогаем (экономим ~10 секунд).
#   4. В конце печатает ссылку на Mini App для проверки в Telegram.
set -e

VPS="root@90.156.170.88"
REMOTE_DIR="/opt/MyCash"
SERVICE="mycash"
MINIAPP="https://t.me/mycash1233333_bot/app"   # тестировать ТОЛЬКО в Telegram, не в браузере
MSG="$1"

cd "$(dirname "$0")"

# Что изменилось (до коммита)
CHANGES="$(git status --porcelain)"
BACKEND_CHANGED=""
FRONT_CHANGED=""
echo "$CHANGES" | grep -qE 'server/'  && BACKEND_CHANGED=1
echo "$CHANGES" | grep -qE 'docs/'    && FRONT_CHANGED=1

# 1. Коммит (только если есть сообщение И есть изменения)
if [ -n "$MSG" ] && [ -n "$CHANGES" ]; then
  echo "==> Коммит изменений"
  git add -A
  git commit -q -m "$MSG"
else
  echo "==> Коммит пропущен (нет сообщения или нет изменений)"
fi

# 2. Push в GitHub (= деплой фронта на Pages)
echo "==> Push в GitHub"
git push -q origin main

# 3. Деплой бэка на VPS — только если менялся server/
if [ -n "$BACKEND_CHANGED" ]; then
  echo "==> Бэк (server/) менялся -> VPS: pull + restart + health"
  ssh "$VPS" "cd $REMOTE_DIR && git pull --ff-only origin main 2>&1 | tail -2 && systemctl restart $SERVICE && sleep 5 && echo -n 'service: ' && systemctl is-active $SERVICE && echo -n 'health:  ' && curl -s http://127.0.0.1:8000/v1/health && echo"
else
  echo "==> Бэк не менялся -> VPS не трогаем"
  [ -n "$FRONT_CHANGED" ] && echo "    (фронт обновится на GitHub Pages за ~1 минуту)"
fi

echo ""
echo "==> Готово. Проверить в Telegram: $MINIAPP"
