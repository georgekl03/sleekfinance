#!/usr/bin/env bash
set -euo pipefail

if command -v python3 >/dev/null 2>&1; then
  python3 launch.py
else
  echo "python3 is required to use the enhanced launcher. Falling back to npm directly." >&2
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
  fi
  npm run dev -- --host 0.0.0.0
fi
