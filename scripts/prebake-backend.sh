#!/usr/bin/env bash
# Route 1: Pre-install Python backend for offline portable use (needs network once).
#
# Creates a self-contained data/hermes/ with venv + hermes-agent checkout + bootstrap
# marker so Desktop never runs install/bootstrap on the target machine.
#
# Usage:
#   ./scripts/prebake-backend.sh
#   HERMES_HOME=/path/to/data/hermes ./scripts/prebake-backend.sh
#   ./scripts/prebake-backend.sh --skip-install   # only stamp existing tree
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES="${HERMES_HOME:-$ROOT/data/hermes}"
SKIP_INSTALL=false
USE_STANDALONE_PYTHON="${PINGHERMESAGENT_PREBAKE_STANDALONE:-}"  # set to 1 to use relocatable Python
PY_TARBALL_URL="${PINGHERMESAGENT_PYTHON_TARBALL_URL:-}"         # optional override for standalone Python tarball URL

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=true; shift ;;
    --standalone-python) USE_STANDALONE_PYTHON=1; shift ;;
    -h|--help)
      echo "Usage: $0 [--skip-install]"
      echo "  HERMES_HOME  target data dir (default: $ROOT/data/hermes)"
      echo "  PINGHERMESAGENT_PREBAKE_STANDALONE=1  use relocatable standalone Python"
      echo "  PINGHERMESAGENT_PYTHON_TARBALL_URL    tarball URL of standalone Python (macOS arch-specific)"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

export HERMES_HOME="$HERMES"
mkdir -p "$HERMES/home" "$HERMES/logs" "$HERMES/cache/uv"

VENV_PY="$HERMES/hermes-agent/venv/bin/python"

ensure_standalone_python() {
  # Provision a relocatable standalone Python into $HERMES/python if requested
  local pybin="$HERMES/python/bin/python3"
  if [[ -x "$pybin" ]]; then
    echo "==> Using existing standalone Python at $HERMES/python"
    echo "$pybin"
    return 0
  fi
  if [[ -z "$PY_TARBALL_URL" ]]; then
    local ARCH="$(uname -m)"
    echo "==> No PINGHERMESAGENT_PYTHON_TARBALL_URL provided; cannot auto-provision standalone Python for $ARCH" >&2
    echo "    Please set PINGHERMESAGENT_PYTHON_TARBALL_URL to a relocatable CPython tarball (e.g. python-build-standalone)" >&2
    exit 1
  fi
  echo "==> Fetching standalone Python..."
  mkdir -p "$HERMES/cache/python" "$HERMES/python"
  local filename
  filename="$(basename "$PY_TARBALL_URL" | sed 's/[?].*$//')"
  local tarpath="$HERMES/cache/python/$filename"
  curl -fsSL "$PY_TARBALL_URL" -o "$tarpath"
  echo "==> Extracting standalone Python..."
  case "$tarpath" in
    *.tar.zst|*.tzst)
      if command -v unzstd >/dev/null 2>&1; then
        unzstd -c "$tarpath" | tar -x -C "$HERMES/python" --strip-components=1
      elif tar --help 2>&1 | grep -q -- '--zstd'; then
        tar --zstd -xf "$tarpath" -C "$HERMES/python" --strip-components=1
      else
        echo "zstd not available to extract $tarpath. Install 'zstd' or provide a .tar.gz tarball." >&2
        exit 1
      fi
      ;;
    *.tar|*.tar.gz|*.tgz|*.tar.xz)
      tar -xf "$tarpath" -C "$HERMES/python" --strip-components=1
      ;;
    *)
      # Try generic tar probing
      if tar -tf "$tarpath" >/dev/null 2>&1; then
        tar -xf "$tarpath" -C "$HERMES/python" --strip-components=1
      else
        echo "Unsupported tarball format: $tarpath" >&2
        exit 1
      fi
      ;;
  esac
  if [[ ! -x "$HERMES/python/bin/python3" ]]; then
    echo "Standalone Python missing python3 under $HERMES/python/bin" >&2
    exit 1
  fi
  echo "$HERMES/python/bin/python3"
}

if [[ "$SKIP_INSTALL" == false ]]; then
  if [[ -x "$VENV_PY" ]] && "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
    echo "Backend already present at $HERMES/hermes-agent — skipping install"
  else
    if [[ "$USE_STANDALONE_PYTHON" == 1 ]]; then
      echo "==> Installing backend with relocatable standalone Python (via vendored installer)..."
      PYBIN="$(ensure_standalone_python)"
      # Ensure vendored installer picks our standalone python when creating venv
      PATH_PREV="$PATH"
      export PATH="$HERMES/python/bin:$PATH"
      "$ROOT/scripts/install-backend.sh"
      export PATH="$PATH_PREV"
      VENV_PY="$HERMES/hermes-agent/venv/bin/python"
      "$VENV_PY" -m pip install -U pip wheel setuptools >/dev/null 2>&1 || true
      "$VENV_PY" -c 'import hermes_cli' >/dev/null
    else
      echo "==> Installing backend with system Python (requires network: git + PyPI)..."
      "$ROOT/scripts/install-backend.sh"
    fi
  fi
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "Prebake failed: $VENV_PY not found" >&2
  exit 1
fi

if ! "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
  echo "Prebake failed: hermes_cli not importable in venv" >&2
  exit 1
fi

echo "==> Installing desktop web stack (fastapi + uvicorn + pty)..."
(
  cd "$HERMES/hermes-agent"
  "$VENV_PY" -m pip install --no-cache-dir -e '.[web,pty]'
)
"$VENV_PY" -c "import fastapi, uvicorn, hermes_cli; print('web deps OK')"

echo "==> Stamping bootstrap marker (skip first-launch installer)..."
HERMES_HOME="$HERMES" "$ROOT/scripts/stamp-bootstrap-marker.sh"

echo ""
echo "Prebake complete: $HERMES"
echo "  Python: $VENV_PY"
echo "  Hermes:  $HERMES/hermes-agent/venv/bin/hermes"
echo ""
echo "Optional (configure API keys before copying to USB):"
echo "  HERMES_HOME=\"$HERMES\" HOME=\"$HERMES/home\" \"$HERMES/hermes-agent/venv/bin/hermes\" setup"
echo ""
echo "Next: ./scripts/assemble-portable.sh --data-source \"$HERMES\" /path/to/PingHermesAgent.app"
