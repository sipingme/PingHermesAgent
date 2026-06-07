#!/usr/bin/env bash
# Rewrite portable venv paths so data/hermes works when the folder moves (e.g. USB).
#
# CI prebake leaves pyvenv.cfg + editable-install metadata pointing at the staging dir.
# This script retargets them to the current HERMES_HOME (idempotent).
#
# Usage:
#   HERMES_HOME=/path/to/data/hermes ./scripts/relocate-portable-hermes.sh
#
set -euo pipefail

HERMES="${HERMES_HOME:?HERMES_HOME required}"
VENV="$HERMES/hermes-agent/venv"
PYVENV="$VENV/pyvenv.cfg"

if [[ ! -d "$VENV" ]]; then
  exit 0
fi

if [[ -f "$PYVENV" ]]; then
  # uv/pyvenv: home must point at bundled standalone Python on the drive.
  if [[ -x "$HERMES/python/bin/python3" ]]; then
    sed -i.bak "s|^home = .*|home = $HERMES/python/bin|" "$PYVENV"
    rm -f "$PYVENV.bak"
  elif [[ -x "$HERMES/python/python.exe" ]]; then
    sed -i.bak "s|^home = .*|home = $HERMES/python|" "$PYVENV"
    rm -f "$PYVENV.bak"
  fi
fi

shopt -s nullglob
for finder in "$VENV"/lib/python*/site-packages/__editable___hermes_agent_*_finder.py; do
  [[ -f "$finder" ]] || continue
  if grep -q "/data/hermes" "$finder" && ! grep -Fq "'$HERMES" "$finder"; then
    python3 - "$finder" "$HERMES" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
hermes = sys.argv[2]
text = path.read_text()
text2 = re.sub(r"'[^']*/data/hermes", f"'{hermes}", text)
if text2 != text:
    path.write_text(text2)
PY
  fi
done
