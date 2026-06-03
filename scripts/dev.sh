#!/usr/bin/env bash
# Start PingHermesAgent in dev mode.
#
# Default: isolated data under ./data/ — does NOT touch ~/.hermes.
# Reuses ~/.hermes/hermes-agent/venv for Python only (read/run, no config writes there).
#
# To share your system Hermes install instead:
#   PINGHERMESAGENT_USE_SYSTEM_HERMES=1 npm run dev
#
# Cursor sets ELECTRON_RUN_AS_NODE=1 which breaks Electron — we unset it below.
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DATA="$ROOT/data"
ISOLATED_HERMES="$DATA/hermes"
ISOLATED_DESKTOP="$DATA/desktop"

if [[ "${PINGHERMESAGENT_USE_SYSTEM_HERMES:-}" == "1" ]]; then
  export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
  export HERMES_DESKTOP_USER_DATA_DIR="${HERMES_DESKTOP_USER_DATA_DIR:-}"
else
  export HERMES_HOME="${HERMES_HOME:-$ISOLATED_HERMES}"
  export HERMES_DESKTOP_USER_DATA_DIR="${HERMES_DESKTOP_USER_DATA_DIR:-$ISOLATED_DESKTOP}"
  mkdir -p "$HERMES_HOME/home" "$HERMES_HOME/logs" "$ISOLATED_DESKTOP"
fi

SIBLING_HERMES="$(cd "$ROOT/.." && pwd)/hermes-agent"
SYSTEM_HERMES="${HOME}/.hermes/hermes-agent"
LOCAL_HERMES="$ROOT/data/hermes/hermes-agent"

hermes_supports_desktop_session_token() {
  [[ -f "$1/hermes_cli/web_server.py" ]] &&
    grep -q 'HERMES_DASHBOARD_SESSION_TOKEN' "$1/hermes_cli/web_server.py" 2>/dev/null
}

# Python checkout — fully isolated data/hermes/ wins when prebaked/installed.
# Otherwise prefer sibling ../hermes-agent (new source) + system venv, or ~/.hermes.
if [[ -z "${HERMES_DESKTOP_HERMES_ROOT:-}" ]]; then
  if [[ -x "$LOCAL_HERMES/venv/bin/python" ]] &&
    "$LOCAL_HERMES/venv/bin/python" -c "import hermes_cli" 2>/dev/null &&
    hermes_supports_desktop_session_token "$LOCAL_HERMES"; then
    export HERMES_DESKTOP_HERMES_ROOT="$LOCAL_HERMES"
  elif [[ -d "$SIBLING_HERMES/hermes_cli" ]] && hermes_supports_desktop_session_token "$SIBLING_HERMES"; then
    export HERMES_DESKTOP_HERMES_ROOT="$SIBLING_HERMES"
    if [[ -x "$SYSTEM_HERMES/venv/bin/python" ]]; then
      export HERMES_DESKTOP_PYTHON="${HERMES_DESKTOP_PYTHON:-$SYSTEM_HERMES/venv/bin/python}"
    fi
  else
    export HERMES_DESKTOP_HERMES_ROOT="$SYSTEM_HERMES"
  fi
fi

if [[ ! -d node_modules ]]; then
  echo "Run: npm install" >&2
  exit 1
fi

PYTHON_BIN="${HERMES_DESKTOP_PYTHON:-$HERMES_DESKTOP_HERMES_ROOT/venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python backend not found (need venv at $HERMES_DESKTOP_HERMES_ROOT or HERMES_DESKTOP_PYTHON)" >&2
  echo "Install Hermes first, or: ./scripts/install-backend.sh" >&2
  exit 1
fi

echo "PingHermesAgent dev"
echo "  HERMES_HOME (data):     $HERMES_HOME"
echo "  Backend (code):         $HERMES_DESKTOP_HERMES_ROOT"
echo "  Backend (python):       $PYTHON_BIN"
if [[ -n "${HERMES_DESKTOP_USER_DATA_DIR:-}" ]]; then
  echo "  Desktop userData:       $HERMES_DESKTOP_USER_DATA_DIR"
fi
if [[ "${PINGHERMESAGENT_USE_SYSTEM_HERMES:-}" != "1" && "$HERMES_HOME" != "$HOME/.hermes" ]]; then
  echo "  (isolated from ~/.hermes — set PINGHERMESAGENT_USE_SYSTEM_HERMES=1 to share system install)"
fi
if ! hermes_supports_desktop_session_token "$HERMES_DESKTOP_HERMES_ROOT"; then
  echo "  WARNING: backend lacks HERMES_DASHBOARD_SESSION_TOKEN support — desktop API calls will 401." >&2
  echo "           Run: hermes update   OR clone a newer hermes-agent beside this repo." >&2
fi

exec env -u ELECTRON_RUN_AS_NODE npm run dev --workspace=pinghermesagent-desktop
