@echo off
setlocal

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Starting SleekFinance development server (Ctrl+C to stop).
call npm run dev -- --host 0.0.0.0

endlocal
