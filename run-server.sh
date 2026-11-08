#!/usr/bin/env bash
set -euo pipefail

# ESL Writing をローカルで起動する（project-manager の projects.yaml の起動コマンドもこれ）。
#
# - `.env` の PORT（無ければ 3016）を見て、**そのポートを掴んでいるプロセスがいれば止めてから**起動する
#   （前回の起動が残っていても、そのまま立ち上げ直せるようにするため）
# - `dist/` が無い / `src/`・`web/` の方が新しいときはビルドしてから起動する
# - 開く名前は http://esl-writing.localhost:<PORT>/（127.0.0.1 でも開ける）
#
# daily-note の run-dailynote.sh にならった。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
DEFAULT_PORT=3016
TAG="[run-server]"

# ポートの決まり方はアプリ本体と同じ順序にする: 環境変数 > .env > 既定値
resolve_port() {
  if [[ -n "${PORT:-}" ]]; then
    echo "$PORT"
    return
  fi
  if [[ -f "$ENV_FILE" ]]; then
    local value
    value="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([^#[:space:]]*\).*/\1/p' "$ENV_FILE" |
      tail -1 | tr -d "\"'")"
    if [[ -n "$value" ]]; then
      echo "$value"
      return
    fi
  fi
  echo "$DEFAULT_PORT"
}

# そのポートで listen しているプロセスの pid（無ければ何も出さない）。
listening_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
  else
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

free_port() {
  local port="$1" pids pid deadline
  pids="$(listening_pids "$port")"
  [[ -z "$pids" ]] && return 0

  for pid in $pids; do
    # 何を止めるのかは必ず見せる（無関係なプロセスを黙って殺さないため）
    echo "$TAG ポート $port を使用中: pid $pid（$(ps -p "$pid" -o args= 2>/dev/null | cut -c1-70)）"
    kill "$pid" 2>/dev/null || true
  done

  # 行儀よく終わるのを 5 秒待ち、それでも残っていれば SIGKILL
  deadline=$((SECONDS + 5))
  while [[ -n "$(listening_pids "$port")" && $SECONDS -lt $deadline ]]; do
    sleep 0.2
  done
  for pid in $(listening_pids "$port"); do
    echo "$TAG pid $pid が終わらないので強制終了します"
    kill -9 "$pid" 2>/dev/null || true
  done
  sleep 0.3

  if [[ -n "$(listening_pids "$port")" ]]; then
    echo "$TAG ポート $port を空けられませんでした" >&2
    exit 1
  fi
  echo "$TAG ポート $port を空けました"
}

if [[ ! -d node_modules ]]; then
  echo "$TAG node_modules が無いため npm install を実行します..."
  npm install
fi

if [[ ! -f dist/main.js || ! -f dist/browser/app.js ]] ||
  [[ -n "$(find src -name '*.ts' -newer dist/main.js -print -quit)" ]]; then
  echo "$TAG ビルドします..."
  npm run build
fi

PORT_TO_USE="$(resolve_port)"
free_port "$PORT_TO_USE"

echo "$TAG 起動します: http://esl-writing.localhost:$PORT_TO_USE/"
exec node --env-file-if-exists=.env dist/main.js
