#!/usr/bin/env bash
# One-time Gatekeeper cleanup for portable USB copies on macOS.
#
# Browser/GitHub downloads attach com.apple.quarantine; Python imports then
# trigger repeated "could not verify … is free of malware" for each .so.
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

echo "[portable] Clearing macOS quarantine (first launch only, may take a minute)..."

xattr -cr "$ROOT" 2>/dev/null || true

if command -v codesign >/dev/null 2>&1; then
  if [[ -d "$ROOT/PingHermesAgent.app" ]]; then
    codesign --force --deep --sign - "$ROOT/PingHermesAgent.app" 2>/dev/null || true
  fi

  HERMES="$ROOT/data/hermes"
  if [[ -d "$HERMES" ]]; then
    while IFS= read -r -d '' f; do
      codesign --force --sign - "$f" 2>/dev/null || true
    done < <(find "$HERMES" \( -name '*.so' -o -name '*.dylib' \) -print0 2>/dev/null || true)

    for bindir in "$HERMES/python/bin" "$HERMES/hermes-agent/venv/bin"; do
      [[ -d "$bindir" ]] || continue
      while IFS= read -r -d '' f; do
        codesign --force --sign - "$f" 2>/dev/null || true
      done < <(find "$bindir" -type f -print0 2>/dev/null || true)
    done
  fi
fi

mkdir -p "$ROOT/data"
touch "$MARKER"
echo "[portable] Gatekeeper cleanup done."
