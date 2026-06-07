#!/usr/bin/env bash
# One-time Gatekeeper cleanup for portable USB copies on macOS.
#
# Browser/GitHub downloads attach com.apple.quarantine; Python imports then
# trigger repeated "could not verify … is free of malware" for each .so.
#
# Use xattr -cr only — never ad-hoc codesign venv .so files (breaks pydantic_core etc).
#
# Usage: clear-mac-gatekeeper.sh /path/to/PingHermesAgentPortable
set -euo pipefail

ROOT="${1:?portable root required}"
MARKER="$ROOT/data/.mac-gatekeeper-cleared"

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi
if [[ -f "$MARKER" ]]; then
  exit 0
fi

echo "[portable] Clearing macOS quarantine (first launch only)..."

clear_quarantine() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  xattr -cr "$target" 2>/dev/null || true
}

echo "[portable]   app & launchers..."
clear_quarantine "$ROOT/PingHermesAgent.app"
for item in \
  "$ROOT/Start PingHermesAgent.command" \
  "$ROOT/Start PingHermesAgent.sh" \
  "$ROOT/Start PingHermesAgent.bat" \
  "$ROOT/.pinghermesagent-portable" \
  "$ROOT/scripts"; do
  clear_quarantine "$item"
done

HERMES="$ROOT/data/hermes"
if [[ -d "$HERMES" ]]; then
  echo "[portable]   python venv + runtime (skipping node_modules / uv cache)..."
  clear_quarantine "$HERMES/python"
  clear_quarantine "$HERMES/hermes-agent/venv"
  clear_quarantine "$HERMES/hermes-agent/hermes_cli"
  shopt -s nullglob
  for cfg in "$HERMES"/*.yaml "$HERMES"/*.json "$HERMES"/.env "$HERMES"/SOUL.md; do
    clear_quarantine "$cfg"
  done
  shopt -u nullglob
fi

mkdir -p "$ROOT/data"
touch "$MARKER"
echo "[portable] Gatekeeper cleanup done."
