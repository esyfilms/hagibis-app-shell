#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_PORT="${1:-4184}"
PORT="$START_PORT"
MAX_PORT_ATTEMPTS=20

cd "$SCRIPT_DIR"

find_available_port() {
  local candidate="$1"
  local attempts=0

  while lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
    candidate=$((candidate + 1))
    attempts=$((attempts + 1))

    if [ "$attempts" -ge "$MAX_PORT_ATTEMPTS" ]; then
      echo "Could not find an open port starting from ${START_PORT}." >&2
      exit 1
    fi
  done

  echo "$candidate"
}

PORT="$(find_available_port "$PORT")"
URL="http://127.0.0.1:${PORT}"

if [ "$PORT" != "$START_PORT" ]; then
  echo "Port ${START_PORT} was busy, using ${PORT} instead."
fi

echo "Hagibis app shell starting at ${URL}"
echo "The page will open automatically in your browser."

(sleep 1; open "$URL" >/dev/null 2>&1 || true) &

if [ -f "$SCRIPT_DIR/.env.local" ]; then
  set -a
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

PORT="$PORT" node "$SCRIPT_DIR/server.js"
