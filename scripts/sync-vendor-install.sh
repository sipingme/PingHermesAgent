#!/usr/bin/env bash
# Copy install.sh / install.ps1 from a hermes-agent checkout into vendor/.
#
# Usage:
#   ./scripts/sync-vendor-install.sh
#   ./scripts/sync-vendor-install.sh /path/to/hermes-agent
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$(cd "$ROOT/../hermes-agent" 2>/dev/null && pwd || true)}"

if [[ -z "$SOURCE" || ! -f "$SOURCE/scripts/install.sh" ]]; then
  echo "Usage: $0 /path/to/hermes-agent" >&2
  echo "  or place hermes-agent as a sibling of PingHermesAgent" >&2
  exit 1
fi

DEST="$ROOT/vendor/hermes-agent/scripts"
mkdir -p "$DEST"

cp "$SOURCE/scripts/install.sh" "$SOURCE/scripts/install.ps1" "$DEST/"

if command -v git >/dev/null 2>&1 && git -C "$SOURCE" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$SOURCE" rev-parse HEAD > "$ROOT/vendor/VERSION"
else
  date -u +%Y%m%d > "$ROOT/vendor/VERSION"
fi

echo "Synced vendor install scripts from: $SOURCE"
echo "Version: $(cat "$ROOT/vendor/VERSION")"
echo "Files:"
ls -la "$DEST"
