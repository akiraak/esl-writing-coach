#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"

# ポートの決定: PORT 環境変数 > backend/.env > 3013
if [ -z "${PORT:-}" ] && [ -f .env ]; then
  PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 || true)"
fi
PORT="${PORT:-3013}"

# 既存プロセスがポートを掴んでいれば停止してから起動する
PIDS="$(lsof -ti "tcp:${PORT}" 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  echo "port ${PORT} を使用中のプロセス (${PIDS}) を停止します"
  kill $PIDS 2>/dev/null || true
  sleep 1
  PIDS="$(lsof -ti "tcp:${PORT}" 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null || true
  fi
fi

# 第 1 引数に dev を渡すと tsx watch で起動する（例: ./run-server.sh dev）
if [ "${1:-}" = "dev" ]; then
  exec npm run dev
fi
exec npm start
