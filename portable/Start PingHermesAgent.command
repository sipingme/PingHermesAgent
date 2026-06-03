#!/bin/bash
# PingHermesAgent Portable launcher (macOS)
# Double-click this file on your USB drive to start with data stored locally.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$ROOT/data"
HERMES="$DATA/hermes"
DESKTOP_UD="$DATA/desktop"
HOME_DIR="$HERMES/home"
APP="$ROOT/PingHermesAgent.app/Contents/MacOS/PingHermesAgent"
VENV_PY="$HERMES/hermes-agent/venv/bin/python"

mkdir -p "$HERMES/home" "$HERMES/logs" "$DESKTOP_UD"

if [[ ! -x "$APP" ]]; then
  osascript -e 'display alert "PingHermesAgent 未找到" message "请将 PingHermesAgent.app 放在与本脚本同一目录下。\n\n详见 README.txt"' as critical 2>/dev/null || {
    echo "Error: PingHermesAgent.app not found in $ROOT" >&2
    echo "Copy PingHermesAgent.app next to this script." >&2
  }
  exit 1
fi

if [[ ! -x "$VENV_PY" ]] || ! "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
  osascript -e 'display alert "后端未预装" message "此便携包缺少预装的 Python 后端（data/hermes/）。\n\n请在有网电脑运行 assemble 脚本预装后端，或从 Release 下载完整便携 zip。\n\n详见 docs/PREPARE-USB.md"' as critical 2>/dev/null || {
    echo "Error: pre-baked backend missing at $HERMES/hermes-agent/venv" >&2
    echo "See docs/PREPARE-USB.md" >&2
  }
  exit 1
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
