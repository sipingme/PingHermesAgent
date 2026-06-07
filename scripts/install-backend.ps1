# Install the Hermes Python backend using the vendored install.ps1 (Windows).
param()

$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$HERMES = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $ROOT 'data\hermes' }
$INSTALL_SCRIPT = Join-Path $ROOT 'vendor\hermes-agent\scripts\install.ps1'

function Ensure-ManagedUv {
    param([string]$HermesHome)

    $binDir = Join-Path $HermesHome 'bin'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    $managedUv = Join-Path $binDir 'uv.exe'
    if (Test-Path -LiteralPath $managedUv) {
        return
    }

    $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
    if ($uvCmd) {
        Copy-Item -LiteralPath $uvCmd.Source -Destination $managedUv -Force
        Write-Host "Seeded managed uv at $managedUv"
        return
    }

    throw "uv not found on PATH. Add astral-sh/setup-uv to CI or install uv before prebake."
}

New-Item -ItemType Directory -Force -Path (Join-Path $HERMES 'home') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HERMES 'logs') | Out-Null

if (-not (Test-Path -LiteralPath $INSTALL_SCRIPT)) {
    throw "Missing vendored installer: $INSTALL_SCRIPT`nRun: ./scripts/sync-vendor-install.sh"
}

$env:HERMES_HOME = $HERMES
$env:HERMES_INSTALL_DIR = Join-Path $HERMES 'hermes-agent'
$env:HOME = Join-Path $HERMES 'home'
$env:USERPROFILE = $env:HOME
$env:UV_CACHE_DIR = Join-Path $HERMES 'cache\uv'

Write-Host "Installing Hermes backend to: $HERMES"
Write-Host "Using vendored: $INSTALL_SCRIPT"

Ensure-ManagedUv -HermesHome $HERMES

& $INSTALL_SCRIPT `
    -NonInteractive `
    -SkipSetup `
    -HermesHome $HERMES `
    -InstallDir (Join-Path $HERMES 'hermes-agent')

$venvPy = Join-Path $HERMES 'hermes-agent\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPy)) {
    throw "Install failed: missing $venvPy"
}

Write-Host ''
Write-Host 'Backend ready. Next steps:'
Write-Host "  1. $(Join-Path $HERMES 'hermes-agent\venv\Scripts\hermes.exe') setup"
Write-Host '  2. Double-click Start PingHermesAgent.bat (after building PingHermesAgent.exe)"
