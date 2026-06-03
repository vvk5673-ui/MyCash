#!/usr/bin/env bash
# Деплой MyCash одной командой.
#   ./deploy.sh "сообщение коммита"   — закоммитить все изменения, запушить и развернуть на VPS
#   ./deploy.sh                        — без коммита: только pull+restart на VPS (если уже запушено)
#
# Что делает: commit (если есть изменения и задан текст) -> push -> на VPS git pull -> restart mycash -> health.
# Фронт (docs/) едет на GitHub Pages самим push'ем; рестарт нужен только для server/.
set -e

VPS="root@90.156.170.88"
REMOTE_DIR="/opt/MyCash"
SERVICE="mycash"
MSG="$1"

cd "$(dirname "$0")"

# 1. Коммит (только если заданы сообщение И есть изменения)
if [ -n "$MSG" ] && [ -n "$(git status --porcelain)" ]; then
  echo "==> Коммит изменений"
  git add -A
  git commit -q -m "$MSG"
else
  echo "==> Коммит пропущен (нет сообщения или нет изменений)"
fi

# 2. Push в GitHub (= деплой фронта на Pages)
echo "==> Push в GitHub"
git push -q origin main

# 3. Деплой бэка на VPS: pull + restart + health
echo "==> VPS: pull + restart + health"
ssh "$VPS" "cd $REMOTE_DIR && git pull --ff-only origin main 2>&1 | tail -2 && systemctl restart $SERVICE && sleep 5 && echo -n 'service: ' && systemctl is-active $SERVICE && echo -n 'health:  ' && curl -s http://127.0.0.1:8000/v1/health && echo"

echo "==> Готово"
