#!/usr/bin/env bash
# Repair a broken portable venv on USB (missing .so, web deps, bad codesign).
# Requires network once. Safe to re-run.
#
# Usage: repair-portable-venv.sh /path/to/PingHermesAgentPortable
set -euo pipefail

ROOT="${1:?portable root required}"
HERMES="$ROOT/data/hermes"
AGENT="$HERMES/hermes-agent"
PY="$AGENT/venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "Missing venv python: $PY" >&2
  exit 1
fi

export HERMES_HOME="$HERMES"
export HOME="$HERMES/home"
export UV_CACHE_DIR="$HERMES/cache/uv"
# Do not set PYTHONHOME here — it breaks ensurepip/uv on relocated trees.

UV=""
for candidate in "$HERMES/bin/uv" "$(command -v uv 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    UV="$candidate"
    break
  fi
done
if [[ -z "$UV" ]]; then
  echo "Missing uv (expected $HERMES/bin/uv or uv on PATH)" >&2
  exit 1
fi

pip_install() {
  "$UV" pip install --python "$PY" "$@"
}

echo "[repair] Removing broken ad-hoc signatures on venv .so (if any)..."
if command -v codesign >/dev/null 2>&1; then
  while IFS= read -r -d '' f; do
    codesign --remove-signature "$f" 2>/dev/null || true
  done < <(find "$AGENT/venv" -name '*.so' -print0 2>/dev/null || true)
fi

echo "[repair] Clearing quarantine on venv..."
xattr -cr "$AGENT/venv" 2>/dev/null || true

echo "[repair] Reinstalling pydantic-core (fixes missing _pydantic_core.so)..."
pip_install --reinstall --no-cache 'pydantic-core>=2.0' 'pydantic>=2.0'

echo "[repair] Installing desktop web stack (fastapi + uvicorn)..."
# exFAT/USB can leave AppleDouble "._*" files that break editable rebuilds.
find "$AGENT" -name '._*' -delete 2>/dev/null || true
cd "$AGENT"
if ! pip_install -e '.[web,pty]' 2>/dev/null; then
  echo "[repair] Editable reinstall skipped (often fine on USB) — installing web deps directly..."
  pip_install 'fastapi==0.133.1' 'uvicorn[standard]==0.41.0' 'starlette==1.0.1'
fi

echo "[repair] Verifying imports..."
"$PY" -c "import pydantic_core; import fastapi; import uvicorn; import hermes_cli; print('REPAIR_OK')"

if [[ -x "$ROOT/scripts/relocate-portable-hermes.sh" ]]; then
  HERMES_HOME="$HERMES" bash "$ROOT/scripts/relocate-portable-hermes.sh"
fi

echo "[repair] Done. Launch Start PingHermesAgent.command again."
