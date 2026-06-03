#!/usr/bin/env bash
# Route 1: Pre-install Python backend for offline portable use (needs network once).
#
# Creates a self-contained data/hermes/ with venv + hermes-agent checkout + bootstrap
# marker so Desktop never runs install/bootstrap on the target machine.
#
# Usage:
#   ./scripts/prebake-backend.sh
#   HERMES_HOME=/path/to/data/hermes ./scripts/prebake-backend.sh
#   ./scripts/prebake-backend.sh --skip-install   # only stamp existing tree
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES="${HERMES_HOME:-$ROOT/data/hermes}"
SKIP_INSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--skip-install]"
      echo "  HERMES_HOME  target data dir (default: $ROOT/data/hermes)"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

export HERMES_HOME="$HERMES"
mkdir -p "$HERMES/home" "$HERMES/logs" "$HERMES/cache/uv"

VENV_PY="$HERMES/hermes-agent/venv/bin/python"

if [[ "$SKIP_INSTALL" == false ]]; then
  if [[ -x "$VENV_PY" ]] && "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
    echo "Backend already present at $HERMES/hermes-agent — skipping install"
  else
    echo "==> Installing backend (requires network: git + PyPI)..."
    "$ROOT/scripts/install-backend.sh"
  fi
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "Prebake failed: $VENV_PY not found" >&2
  exit 1
fi

if ! "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
  echo "Prebake failed: hermes_cli not importable in venv" >&2
  exit 1
fi

echo "==> Stamping bootstrap marker (skip first-launch installer)..."
HERMES_HOME="$HERMES" "$ROOT/scripts/stamp-bootstrap-marker.sh"

echo ""
echo "Prebake complete: $HERMES"
echo "  Python: $VENV_PY"
echo "  Hermes:  $HERMES/hermes-agent/venv/bin/hermes"
echo ""
echo "Optional (configure API keys before copying to USB):"
echo "  HERMES_HOME=\"$HERMES\" HOME=\"$HERMES/home\" \"$HERMES/hermes-agent/venv/bin/hermes\" setup"
echo ""
echo "Next: ./scripts/assemble-portable.sh --data-source \"$HERMES\" /path/to/PingHermesAgent.app"
