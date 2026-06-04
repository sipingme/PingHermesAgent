#!/bin/bash
# PingHermesAgent Portable launcher (Linux)
# Run from USB: ./Start PingHermesAgent.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$ROOT/data"
HERMES="$DATA/hermes"
DESKTOP_UD="$DATA/desktop"
HOME_DIR="$HERMES/home"
APP=""

mkdir -p "$HERMES/home" "$HERMES/logs" "$DESKTOP_UD"

for candidate in \
  "$ROOT/PingHermesAgent.AppImage" \
  "$ROOT"/PingHermesAgent-*-linux-*.AppImage; do
  if [[ -f "$candidate" ]]; then
    APP="$candidate"
    break
  fi
done

if [[ -z "$APP" || ! -f "$APP" ]]; then
  echo "Error: PingHermesAgent AppImage not found in $ROOT" >&2
  echo "Copy the Linux AppImage next to this script." >&2
  exit 1
fi

chmod +x "$APP" 2>/dev/null || true

VENV_PY="$HERMES/hermes-agent/venv/bin/python"
if [[ ! -x "$VENV_PY" ]] || ! "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
  echo "Warning: pre-baked backend missing at $HERMES/hermes-agent/venv" >&2
  echo "For offline use, prebake data/hermes on a build machine. See docs/PREPARE-USB.md" >&2
fi

export PINGHERMESAGENT_PORTABLE=1
export PINGHERMESAGENT_OFFLINE=1
export PINGHERMESAGENT_PORTABLE_ROOT="$ROOT"
export HERMES_HOME="$HERMES"
export HERMES_DESKTOP_USER_DATA_DIR="$DESKTOP_UD"
export HOME="$HOME_DIR"
export XDG_CONFIG_HOME="$HOME_DIR/.config"
export XDG_CACHE_HOME="$HOME_DIR/.cache"
export XDG_DATA_HOME="$HOME_DIR/.local/share"
export UV_CACHE_DIR="$HERMES/cache/uv"

exec "$APP" "$@"
