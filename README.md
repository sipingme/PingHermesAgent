# PingHermesAgent

Ping 品牌定制的 **Hermes Agent Desktop 壳**（策略 A：UI fork + 官方 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) Python 后端）。

## 架构

```text
PingHermesAgent/          ← 本仓库（Electron + React）
  packages/desktop/
  packages/shared/

hermes-agent/                 ← 官方 Python 后端（单独 clone， sibling 或 HERMES_HOME）
  hermes_cli/
  run_agent.py
  …
```

Desktop 启动时 spawn：`python -m hermes_cli.main dashboard --tui`，数据目录由 `HERMES_HOME` 控制。

## 快速开始（开发）

### 1. 准备 Python 后端

任选其一：

```bash
# 方式 A：vendored 安装脚本（无需 raw.githubusercontent.com）
./scripts/install-backend.sh

# 方式 B：与 PingHermesAgent 同级 clone（开发时 bootstrap 优先用 sibling）
# Documents/2026/hermes-agent
```

### 2. 安装 UI 依赖并启动

```bash
cd PingHermesAgent
npm install
npm run dev
```

若后端不在默认 sibling 路径，指定：

```bash
HERMES_DESKTOP_HERMES_ROOT=/path/to/hermes-agent npm run dev
```

首次使用需在后端配置 API Key：

```bash
~/.hermes/hermes-agent/venv/bin/hermes setup
# 或便携目录：data/hermes/hermes-agent/venv/bin/hermes setup
```

## 构建安装包

```bash
npm install
npm run dist:mac    # macOS .dmg / .zip
npm run dist:win    # Windows .exe / .msi
```

构建 stamp 仍 pin 后端 commit；**bootstrap 优先使用本仓库 `vendor/` 内的 install 脚本**，不再依赖 GitHub raw URL。

同步 vendor：

```bash
./scripts/sync-vendor-install.sh
```

## 便携版（路线 1 — 离线 U 盘）

在有网机器上预装后端并打包；目标 Mac **无需联网**：

```bash
npm install && npm run dist:mac
./scripts/assemble-portable.sh --prebake packages/desktop/release/mac-arm64/PingHermesAgent.app
cp -R dist/PingHermesAgentPortable /Volumes/YourUSB/
```

双击 U 盘上的 `Start PingHermesAgent.command`。

完整说明：[docs/PREPARE-USB.md](docs/PREPARE-USB.md)

## 目录

| 路径 | 说明 |
|------|------|
| `packages/desktop/` | Electron 主进程 + React UI（从 hermes-agent/apps/desktop 迁出） |
| `packages/shared/` | JSON-RPC WebSocket 客户端 |
| `portable/` | U 盘启动脚本 |
| `vendor/hermes-agent/scripts/` | 内置 install.sh / install.ps1（路线 2） |
| `scripts/install-backend.sh` | 用 vendored 脚本安装后端到 `data/hermes` |
| `scripts/sync-vendor-install.sh` | 从 sibling hermes-agent 更新 vendor（路线 2） |
| `scripts/prebake-backend.sh` | 路线 1：预装后端 + bootstrap 标记 |
| `scripts/assemble-portable.sh` | 路线 1：组装 `dist/PingHermesAgentPortable/` |
| `scripts/stamp-bootstrap-marker.sh` | 写入 `.hermes-bootstrap-complete` |
| `docs/PREPARE-USB.md` | U 盘制作指南 |

## 与上游同步

- UI：本仓库独立演进，可 cherry-pick Nous `apps/desktop` 变更
- 后端：跟随官方 `hermes-agent` 版本；注意 `DESKTOP_BACKEND_CONTRACT` 协议版本
- **路线 1**：`assemble-portable.sh --prebake` — 目标机完全离线
- **路线 2**：`vendor/install.sh` — 不 curl raw GitHub，但安装时仍 git clone 后端

## License

MIT（与上游 Hermes Agent 一致）
