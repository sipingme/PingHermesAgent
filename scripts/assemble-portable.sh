#!/usr/bin/env bash
# Assemble an offline-ready portable folder for USB (Route 1).
#
# Usage:
#   ./scripts/assemble-portable.sh /path/to/PingHermesAgent.app
#   ./scripts/assemble-portable.sh --prebake /path/to/PingHermesAgent.app
#   ./scripts/assemble-portable.sh --data-source ~/.hermes /path/to/PingHermesAgent.app
#   ./scripts/assemble-portable.sh --prebake /path/to/PingHermesAgent-0.1.0-mac-arm64.dmg
#
# Output: dist/PingHermesAgentPortable/  — copy entire folder to USB (exFAT recommended)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/dist/PingHermesAgentPortable"
PORTABLE_TEMPLATE="${ROOT}/../PingHermesAgentPortable"
PREBAKE=false
DATA_SOURCE=""
APP_SOURCE=""
MOUNT=""

cleanup() {
  if [[ -n "$MOUNT" ]]; then
    hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
  fi
}
trap cleanup EXIT

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prebake) PREBAKE=true; shift ;;
    --data-source) DATA_SOURCE="${2:-}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *)
      if [[ -z "$APP_SOURCE" ]]; then
        APP_SOURCE="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        usage 1
      fi
      ;;
  esac
done

if [[ -z "$APP_SOURCE" ]]; then
  echo "Error: PingHermesAgent.app or .dmg path required" >&2
  usage 1
fi

resolve_app() {
  local src="$1"
  if [[ "$src" == *.dmg ]]; then
    MOUNT=$(hdiutil attach "$src" -nobrowse | awk '/\/Volumes\// {print $3; exit}')
    for name in PingHermesAgent.app "Ping Hermes.app"; do
      if [[ -d "$MOUNT/$name" ]]; then
        echo "$MOUNT/$name"
        return 0
      fi
    done
    echo "DMG does not contain PingHermesAgent.app: $src" >&2
    exit 1
  elif [[ -d "$src" && ("$(basename "$src")" == "PingHermesAgent.app" || "$(basename "$src")" == "Ping Hermes.app") ]]; then
    echo "$src"
  else
    echo "Expected PingHermesAgent.app or .dmg: $src" >&2
    exit 1
  fi
}

APP_PATH="$(resolve_app "$APP_SOURCE")"

echo "==> Preparing $OUT"
rm -rf "$OUT"

if [[ -d "$PORTABLE_TEMPLATE" ]]; then
  echo "==> Using template $PORTABLE_TEMPLATE"
  rsync -a \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'data/hermes/*' \
    --exclude 'data/desktop/*' \
    --exclude 'PingHermesAgent.app' \
    "$PORTABLE_TEMPLATE/" "$OUT/"
  mkdir -p "$OUT/data/hermes/home" "$OUT/data/desktop"
else
  mkdir -p "$OUT/data/desktop"
fi

if [[ "$PREBAKE" == true ]]; then
  echo "==> Prebaking backend into $OUT/data/hermes (network required)..."
  HERMES_HOME="$OUT/data/hermes" "$ROOT/scripts/prebake-backend.sh"
elif [[ -n "$DATA_SOURCE" ]]; then
  echo "==> Copying backend from $DATA_SOURCE"
  mkdir -p "$OUT/data/hermes"
  rsync -a \
    --exclude 'logs/*.log' \
    "$DATA_SOURCE/" "$OUT/data/hermes/"
  HERMES_HOME="$OUT/data/hermes" "$ROOT/scripts/stamp-bootstrap-marker.sh"
elif [[ -d "$ROOT/data/hermes/hermes-agent/venv" ]]; then
  echo "==> Using existing $ROOT/data/hermes"
  mkdir -p "$OUT/data/hermes"
  rsync -a "$ROOT/data/hermes/" "$OUT/data/hermes/"
  HERMES_HOME="$OUT/data/hermes" "$ROOT/scripts/stamp-bootstrap-marker.sh" 2>/dev/null || true
else
  echo "Warning: no prebaked backend. Use --prebake or --data-source." >&2
  mkdir -p "$OUT/data/hermes/home"
fi

echo "==> Copying PingHermesAgent.app"
APP_BASENAME="$(basename "$APP_PATH")"
if [[ "$APP_BASENAME" == "Ping Hermes.app" ]]; then
  cp -R "$APP_PATH" "$OUT/PingHermesAgent.app"
else
  cp -R "$APP_PATH" "$OUT/"
fi

if [[ ! -f "$OUT/Start PingHermesAgent.command" ]]; then
  cp "$ROOT/portable/Start PingHermesAgent.command" "$OUT/"
fi
if [[ ! -f "$OUT/README.txt" ]]; then
  cp "$ROOT/portable/README.txt" "$OUT/"
fi
if [[ ! -f "$OUT/.pinghermesagent-portable" ]]; then
  cp "$ROOT/.pinghermesagent-portable" "$OUT/" 2>/dev/null || echo "portable" > "$OUT/.pinghermesagent-portable"
fi

DESKTOP_VER="0.1.0"
if [[ -f "$ROOT/package.json" ]]; then
  DESKTOP_VER="$(python3 -c "import json; print(json.load(open('$ROOT/package.json'))['version'])" 2>/dev/null || echo "$DESKTOP_VER")"
fi
echo "$DESKTOP_VER" > "$OUT/VERSION"

chmod +x "$OUT/Start PingHermesAgent.command"

VENV="$OUT/data/hermes/hermes-agent/venv/bin/python"
if [[ -x "$VENV" ]]; then
  SIZE="$(du -sh "$OUT" | awk '{print $1}')"
  echo ""
  echo "Assembled (offline-ready): $OUT  (~$SIZE)"
else
  echo ""
  echo "Assembled (UI only — backend NOT included): $OUT"
fi
echo "Copy to USB:  cp -R \"$OUT\" /Volumes/YourUSB/"
