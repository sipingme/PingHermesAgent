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
AGENT="$HERMES/hermes-agent"
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
      echo "  PINGHERMESAGENT_PYTHON_TARBALL_URL    tarball URL of standalone Python"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

export HERMES_HOME="$HERMES"
mkdir -p "$HERMES/home" "$HERMES/logs" "$HERMES/cache/uv"

is_windows_bash() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  return 1
}

resolve_venv_python() {
  if [[ -x "$AGENT/venv/Scripts/python.exe" ]]; then
    echo "$AGENT/venv/Scripts/python.exe"
  elif [[ -x "$AGENT/venv/bin/python" ]]; then
    echo "$AGENT/venv/bin/python"
  else
    return 1
  fi
}

standalone_python_bin() {
  if [[ -x "$HERMES/python/python.exe" ]]; then
    echo "$HERMES/python/python.exe"
  elif [[ -x "$HERMES/python/bin/python3" ]]; then
    echo "$HERMES/python/bin/python3"
  else
    return 1
  fi
}

run_install_backend() {
  if is_windows_bash; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/install-backend.ps1"
  else
    "$ROOT/scripts/install-backend.sh"
  fi
}

VENV_PY="$(resolve_venv_python 2>/dev/null || true)"

resolve_uv() {
  local candidate
  for candidate in "$HERMES/bin/uv" "$(command -v uv 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

pip_install() {
  local uv
  if uv="$(resolve_uv)"; then
    "$uv" pip install --python "$VENV_PY" "$@"
  elif "$VENV_PY" -m pip --version >/dev/null 2>&1; then
    "$VENV_PY" -m pip install "$@"
  else
    echo "Prebake failed: need uv ($HERMES/bin/uv) or pip in venv" >&2
    exit 1
  fi
}

ensure_standalone_python() {
  local pybin
  if pybin="$(standalone_python_bin 2>/dev/null)"; then
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
      if tar -tf "$tarpath" >/dev/null 2>&1; then
        tar -xf "$tarpath" -C "$HERMES/python" --strip-components=1
      else
        echo "Unsupported tarball format: $tarpath" >&2
        exit 1
      fi
      ;;
  esac
  if ! pybin="$(standalone_python_bin)"; then
    echo "Standalone Python missing executable under $HERMES/python" >&2
    exit 1
  fi
  echo "$pybin"
}

if [[ "$SKIP_INSTALL" == false ]]; then
  if [[ -n "$VENV_PY" ]] && "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
    echo "Backend already present at $AGENT — skipping install"
  else
    if [[ "$USE_STANDALONE_PYTHON" == 1 ]]; then
      echo "==> Installing backend with relocatable standalone Python (via vendored installer)..."
      PYBIN="$(ensure_standalone_python)"
      PATH_PREV="$PATH"
      export PATH="$HERMES/python/bin:$HERMES/python:$PATH"
      run_install_backend
      export PATH="$PATH_PREV"
      VENV_PY="$(resolve_venv_python)"
      pip_install -U pip wheel setuptools >/dev/null 2>&1 || true
      "$VENV_PY" -c 'import hermes_cli' >/dev/null
    else
      echo "==> Installing backend with system Python (requires network: git + PyPI)..."
      run_install_backend
      VENV_PY="$(resolve_venv_python)"
    fi
  fi
fi

if [[ -z "$VENV_PY" ]] || [[ ! -x "$VENV_PY" ]]; then
  echo "Prebake failed: venv python not found under $AGENT/venv" >&2
  exit 1
fi

if ! "$VENV_PY" -c "import hermes_cli" 2>/dev/null; then
  echo "Prebake failed: hermes_cli not importable in venv" >&2
  exit 1
fi

echo "==> Installing desktop web stack (fastapi + uvicorn + pty)..."
(
  cd "$AGENT"
  pip_install --no-cache -e '.[web,pty]'
)
"$VENV_PY" -c "import fastapi, uvicorn, hermes_cli; print('web deps OK')"

echo "==> Stamping bootstrap marker (skip first-launch installer)..."
HERMES_HOME="$HERMES" "$ROOT/scripts/stamp-bootstrap-marker.sh"

echo ""
echo "Prebake complete: $HERMES"
echo "  Python: $VENV_PY"
echo "  Hermes:  $AGENT/venv/bin/hermes (or venv/Scripts/hermes.exe on Windows)"
echo ""
echo "Optional (configure API keys before copying to USB):"
echo "  HERMES_HOME=\"$HERMES\" HOME=\"$HERMES/home\" \"$VENV_PY\" -m hermes_cli setup"
echo ""
echo "Next: ./scripts/assemble-portable.sh --data-source \"$HERMES\" /path/to/PingHermesAgent.app"
