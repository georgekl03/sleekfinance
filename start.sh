#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-5173}
if command -v python3 >/dev/null 2>&1; then
  echo "Starting SleekFinance shell on http://localhost:${PORT}"
  python3 -m http.server "${PORT}"
else
  echo "python3 is required to run the local server" >&2
  exit 1
fi
