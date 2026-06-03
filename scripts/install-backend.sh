#!/usr/bin/env bash
# Install the Hermes Python backend using the vendored install.sh (Route 2).
#
# Usage:
#   ./scripts/install-backend.sh
#   HERMES_HOME=/Volumes/USB/data/hermes ./scripts/install-backend.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES="${HERMES_HOME:-$ROOT/data/hermes}"
INSTALL_SCRIPT="$ROOT/vendor/hermes-agent/scripts/install.sh"

mkdir -p "$HERMES/home" "$HERMES/logs"

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  echo "Missing vendored installer: $INSTALL_SCRIPT" >&2
  echo "Run: ./scripts/sync-vendor-install.sh" >&2
  exit 1
fi

export HERMES_HOME="$HERMES"
export HERMES_INSTALL_DIR="$HERMES/hermes-agent"
export HOME="$HERMES/home"
export UV_CACHE_DIR="$HERMES/cache/uv"

echo "Installing Hermes backend to: $HERMES"
echo "Using vendored: $INSTALL_SCRIPT"

bash "$INSTALL_SCRIPT" \
  --non-interactive \
  --skip-setup \
  --hermes-home "$HERMES" \
  --dir "$HERMES/hermes-agent"

echo ""
echo "Backend ready. Next steps:"
echo "  1. $HERMES/hermes-agent/venv/bin/hermes setup"
echo "  2. Double-click Start PingHermesAgent.command (after building PingHermesAgent.app)"
