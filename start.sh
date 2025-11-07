#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting SleekFinance development server..."
npm run dev -- --host 0.0.0.0
