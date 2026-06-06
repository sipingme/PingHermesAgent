#!/usr/bin/env bash
# One-time Gatekeeper cleanup for portable USB copies on macOS.
#
# Browser/GitHub downloads attach com.apple.quarantine; Python imports then
# trigger repeated "could not verify … is free of malware" for each .so.
#
# IMPORTANT: Do NOT xattr -cr the whole portable root on USB — data/hermes/cache
# can be 8+ GB on exFAT and appears hung for 15+ minutes. Target only runtime paths.
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

sign_if_present() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  codesign --force --sign - "$target" 2>/dev/null || true
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
  # Editable-install metadata (small; avoids scanning 7GB node_modules under hermes-agent).
  clear_quarantine "$HERMES/hermes-agent/hermes_cli"
  shopt -s nullglob
  for cfg in "$HERMES"/*.yaml "$HERMES"/*.json "$HERMES"/.env "$HERMES"/SOUL.md; do
    clear_quarantine "$cfg"
  done
  shopt -u nullglob
fi

if command -v codesign >/dev/null 2>&1; then
  echo "[portable]   ad-hoc signing binaries..."
  if [[ -d "$ROOT/PingHermesAgent.app" ]]; then
    codesign --force --deep --sign - "$ROOT/PingHermesAgent.app" 2>/dev/null || true
  fi

  if [[ -d "$HERMES" ]]; then
    while IFS= read -r -d '' f; do
      sign_if_present "$f"
    done < <(
      find "$HERMES/hermes-agent/venv" "$HERMES/python" \
        \( -name '*.so' -o -name '*.dylib' \) -print0 2>/dev/null || true
    )

    for bindir in "$HERMES/python/bin" "$HERMES/hermes-agent/venv/bin"; do
      [[ -d "$bindir" ]] || continue
      while IFS= read -r -d '' f; do
        sign_if_present "$f"
      done < <(find "$bindir" -type f -print0 2>/dev/null || true)
    done
  fi
fi

mkdir -p "$ROOT/data"
touch "$MARKER"
echo "[portable] Gatekeeper cleanup done."
