#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BUNDLE="$ROOT_DIR/dist/Hagibis Dashboard.app"
EXECUTABLE_NAME="HagibisDashboard"

pkill -x "$EXECUTABLE_NAME" >/dev/null 2>&1 || true

if [[ -d "$APP_BUNDLE" ]]; then
  /usr/bin/open "$APP_BUNDLE"
  exit 0
fi

echo "No Hagibis Dashboard app bundle found. Build one first with native-shell/package_test_build.sh." >&2
exit 1
