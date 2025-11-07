#!/usr/bin/env python3
"""One-command launcher with crash-safe logging."""

import datetime
import pathlib
import subprocess
import sys
from typing import Iterable

ROOT = pathlib.Path(__file__).parent
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "sleekfinance-dev.log"


def log(message: str) -> None:
  timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
  print(f"[{timestamp}] {message}")


def ensure_dependencies() -> None:
  node_modules = ROOT / "node_modules"
  if node_modules.exists():
    log("Dependencies already installed. Skipping npm install.")
    return
  log("Installing dependencies with npm install …")
  result = subprocess.run(["npm", "install"], cwd=ROOT)
  if result.returncode != 0:
    raise RuntimeError("npm install failed. Check the log for details.")


def stream_process(command: Iterable[str]) -> int:
  LOG_DIR.mkdir(parents=True, exist_ok=True)
  with LOG_FILE.open("a", encoding="utf-8") as log_handle:
    log_handle.write("\n" + "=" * 80 + "\n")
    log_handle.write(f"Launch at {datetime.datetime.now().isoformat()}\n")
    log_handle.write("Command: " + " ".join(command) + "\n\n")
    process = subprocess.Popen(
      command,
      cwd=ROOT,
      stdout=subprocess.PIPE,
      stderr=subprocess.STDOUT,
      text=True
    )
    assert process.stdout is not None
    for line in process.stdout:
      sys.stdout.write(line)
      log_handle.write(line)
      log_handle.flush()
    process.wait()
    log_handle.write(f"\nProcess exited with code {process.returncode}\n")
    return process.returncode


def main() -> int:
  log("Starting SleekFinance launcher…")
  try:
    ensure_dependencies()
  except Exception as exc:  # noqa: BLE001 - we want to show failure details
    log(f"Dependency installation failed: {exc}")
    return 1

  command = ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
  exit_code = stream_process(command)
  if exit_code == 0:
    log(f"Development server exited cleanly. Full log written to {LOG_FILE}.")
  else:
    log(
      "Development server exited with errors. Review the log file at "
      f"{LOG_FILE.resolve()} for diagnostics."
    )
  return exit_code


if __name__ == "__main__":
  raise SystemExit(main())
