#!/usr/bin/env bash
# Write .hermes-bootstrap-complete so PingHermesAgent skips first-launch install.
#
# Usage:
#   HERMES_HOME=/path/to/data/hermes ./scripts/stamp-bootstrap-marker.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES="${HERMES_HOME:-$ROOT/data/hermes}"
ACTIVE_ROOT="$HERMES/hermes-agent"
MARKER="$ACTIVE_ROOT/.hermes-bootstrap-complete"

resolve_venv_python() {
  if [[ -x "$ACTIVE_ROOT/venv/Scripts/python.exe" ]]; then
    echo "$ACTIVE_ROOT/venv/Scripts/python.exe"
  elif [[ -x "$ACTIVE_ROOT/venv/bin/python" ]]; then
    echo "$ACTIVE_ROOT/venv/bin/python"
  else
    return 1
  fi
}

if [[ ! -f "$ACTIVE_ROOT/hermes_cli/main.py" ]]; then
  echo "Not a Hermes install: $ACTIVE_ROOT" >&2
  exit 1
fi
if ! VENV_PY="$(resolve_venv_python)"; then
  echo "Missing venv python under $ACTIVE_ROOT/venv" >&2
  exit 1
fi

COMMIT=""
if [[ -d "$ACTIVE_ROOT/.git" ]] && command -v git >/dev/null 2>&1; then
  COMMIT="$(git -C "$ACTIVE_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$COMMIT" && -f "$ROOT/vendor/VERSION" ]]; then
  COMMIT="$(tr -d '[:space:]' < "$ROOT/vendor/VERSION")"
fi
if [[ -z "$COMMIT" ]]; then
  COMMIT="prebaked"
fi

DESKTOP_VER="0.1.0"
if [[ -f "$ROOT/packages/desktop/package.json" ]]; then
  DESKTOP_VER="$(python3 -c "import json; print(json.load(open('$ROOT/packages/desktop/package.json'))['version'])" 2>/dev/null || echo "$DESKTOP_VER")"
fi

mkdir -p "$ACTIVE_ROOT"
cat > "$MARKER" <<EOF
{
  "schemaVersion": 1,
  "pinnedCommit": "$COMMIT",
  "pinnedBranch": null,
  "adopted": true,
  "completedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "desktopVersion": "$DESKTOP_VER",
  "prebaked": true,
  "source": "PingHermesAgent/stamp-bootstrap-marker.sh"
}
EOF

echo "Wrote bootstrap marker: $MARKER"
echo "  pinnedCommit: $COMMIT"
