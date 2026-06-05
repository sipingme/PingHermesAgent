# Prepare USB bundle (Route 1 — offline)

Route 1 ships a **pre-baked Python backend** inside `data/hermes/` so the target
machine never runs `install.sh` or bootstrap (no GitHub, no git clone on USB).

## Host machine isolation

Portable mode must **never** install or write to the host `~/.hermes` or
`~/Library/Application Support/PingHermesAgent`. Always launch via
`Start PingHermesAgent.command` (not by double-clicking `PingHermesAgent.app`
alone). From **0.1.8** onward the app blocks host bootstrap and ignores the
host `hermes` CLI when the portable marker is detected.

## Requirements (build machine only)

- Network once (git + PyPI + npm for app build)
- macOS for `.app` / `.dmg` assembly (or adjust for Windows)
- **≥ 8 GB free** on USB (venv + app; grows with sessions)

## Steps

### 1. Build PingHermesAgent.app

```bash
cd PingHermesAgent
npm install
npm run dist:mac
# App: packages/desktop/release/mac-arm64/PingHermesAgent.app
```

### 2. Assemble portable folder

**Option A — prebake during assemble (recommended first time):**

```bash
./scripts/assemble-portable.sh --prebake packages/desktop/release/mac-arm64/PingHermesAgent.app
```

**Option B — copy an existing Hermes home:**

```bash
./scripts/prebake-backend.sh                    # fills ./data/hermes
# optional: HERMES_HOME=./data/hermes ./data/hermes/hermes-agent/venv/bin/hermes setup

./scripts/assemble-portable.sh --data-source ./data/hermes packages/desktop/release/mac-arm64/PingHermesAgent.app
```

**Option C — copy from system install:**

```bash
./scripts/assemble-portable.sh --data-source ~/.hermes /path/to/PingHermesAgent.app
```

### 3. Copy to USB

```bash
diskutil eraseDisk exFAT PINGHERMESAGENT MBRFormat /dev/diskN   # optional
cp -R dist/PingHermesAgentPortable /Volumes/PINGHERMESAGENT/
chmod +x "/Volumes/PINGHERMESAGENT/PingHermesAgentPortable/Start PingHermesAgent.command"
```

### 4. First run on target Mac

1. Double-click `Start PingHermesAgent.command`
2. If Gatekeeper blocks: **Right-click → Open**
3. API keys: configure once while online via Settings, or pre-run `hermes setup` on build machine before copying `data/hermes`

## USB layout

```text
PingHermesAgentPortable/
├── PingHermesAgent.app
├── Start PingHermesAgent.command
├── .pinghermesagent-portable
├── VERSION
├── README.txt
└── data/
    ├── hermes/              ← pre-baked backend + config + sessions
    │   ├── hermes-agent/
    │   │   ├── venv/
    │   │   └── .hermes-bootstrap-complete
    │   ├── config.yaml
    │   └── home/
    └── desktop/             ← Electron settings (created/used on run)
```

## Verify offline

On build machine after assemble:

```bash
# Should exist:
test -x dist/PingHermesAgentPortable/data/hermes/hermes-agent/venv/bin/python
test -f dist/PingHermesAgentPortable/data/hermes/hermes-agent/.hermes-bootstrap-complete
```

Disconnect network on target Mac; launch should **not** open bootstrap installer.

## Size tips

- Exclude `data/hermes/logs/` when copying (assemble script skips large logs)
- Do not commit `data/hermes/` to git (in `.gitignore`)
