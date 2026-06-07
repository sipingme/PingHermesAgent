#!/usr/bin/env bash
# Verify offline portable staging contains a working prebaked backend.
#
# Usage: verify-portable-prebake.sh /path/to/PingHermesAgentPortable-{version}-{platform}-{arch}
set -euo pipefail

ROOT="${1:?portable staging dir required}"
HERMES="$ROOT/data/hermes"
AGENT="$HERMES/hermes-agent"

PY=""
if [[ -x "$AGENT/venv/Scripts/python.exe" ]]; then
  PY="$AGENT/venv/Scripts/python.exe"
elif [[ -x "$AGENT/venv/bin/python" ]]; then
  PY="$AGENT/venv/bin/python"
else
  echo "ERROR: missing venv python under $AGENT/venv" >&2
  exit 1
fi

"$PY" -c "import fastapi, uvicorn, hermes_cli; print('IMPORT_OK')"
test -f "$AGENT/.hermes-bootstrap-complete"
echo "OK: offline backend in $(basename "$ROOT")"
