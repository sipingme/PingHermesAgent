# PingHermesAgent

PingAI 品智定制的 **Hermes Agent Desktop**

## 架构

- **本仓库**：Electron + React（`packages/desktop`、`packages/shared`）
- **后端**：官方 Hermes Python（`hermes_cli`、`run_agent.py` 等），通过 `HERMES_HOME` 连接

## 开发

**默认与 `~/.hermes` 隔离**：配置、会话、技能写在 `./data/hermes/`。

**Python 后端**（三选一，按优先级）：

| 方式 | 命令 | 是否借用本机 |
|------|------|--------------|
| 完全自包含（推荐） | `./scripts/install-backend.sh` 后再 `npm run dev` | 否，venv 在 `data/hermes/hermes-agent/venv` |
| 开发混合 | 有 `../hermes-agent` 时自动用其源码 + 本机 venv | 只借 venv |
| 便携预装 | `./scripts/prebake-backend.sh` | 否 |

完全自包含示例：

```bash
./scripts/install-backend.sh          # 安装到 data/hermes/（需联网一次）
HERMES_HOME="$(pwd)/data/hermes" HOME="$(pwd)/data/hermes/home" \
  ./data/hermes/hermes-agent/venv/bin/hermes setup
npm run dev                           # dev.sh 会自动用 data/hermes 的 venv
```

**关于端口**：`5174` 只是 **开发模式 Vite 前端** 用的，Hermes Python 后端由 Desktop 自动选 **9120–9199** 空闲端口；便携版 `.app` **不用 5174**。本机 Hermes 默认 dashboard 一般是 **9119**，与 5174 不冲突。若 5174 被别的 Vite 占用，改 `packages/desktop/package.json` 里 `dev:renderer` / `dev:electron` 的端口即可。

```bash
npm install
npm run dev
```

首次在隔离目录使用，需配置 API Key（不影响 `~/.hermes`）：

```bash
HERMES_HOME="$(pwd)/data/hermes" HOME="$(pwd)/data/hermes/home" \
  ~/.hermes/hermes-agent/venv/bin/hermes setup
```

若要**共用**本机已有 Hermes（读写同一个 `~/.hermes`）：

```bash
PINGHERMESAGENT_USE_SYSTEM_HERMES=1 npm run dev
```

指定其它 Python 后端路径：

```bash
HERMES_DESKTOP_HERMES_ROOT=/path/to/hermes-agent npm run dev
```

## 便携版

U 盘目录模板在 sibling 仓库 **`PingHermesAgentPortable/`**。CI 会为 **macOS / Windows / Linux** 分别产出便携 zip：

| 平台 | Release 产物 | 含 `data/hermes/` 离线后端 |
|------|----------------|---------------------------|
| macOS | `PingHermesAgentPortable-{version}-mac-{arm64\|x64}.zip` | **是**（CI 自动 prebake） |
| Windows | `PingHermesAgentPortable-{version}-win-x64.zip` | 否（需本地 prebake） |
| Linux | `PingHermesAgentPortable-{version}-linux-x64.zip` | 否（可用 `package:portable:linux:offline`） |

```bash
npm install
npm run package:mac && npm run package:portable:mac:offline   # mac 便携 zip（含 Python 后端）
npm run package:win && npm run package:portable:win
npm run package:linux && npm run package:portable:linux
# 本地再打含后端的 linux 便携包：
npm run package:portable:linux:offline
```

或本地文件夹方式：

```bash
./scripts/assemble-portable.sh --prebake "packages/desktop/release/mac-arm64/PingHermesAgent.app"
cp -R dist/PingHermesAgentPortable /Volumes/YourUSB/
```

目标机器双击 `Start PingHermesAgent.command`，**无需**访问 GitHub / 运行 install.sh。

详细步骤：[docs/PREPARE-USB.md](docs/PREPARE-USB.md)

## 发版（与 PingClaw 相同流程）

版本号以**根目录** `package.json` 为准；打 tag 后 GitHub Actions 自动构建并发布 Release。

```bash
git fetch origin --tags
npm run version:patch          # 或 version:minor / version:prerelease-beta
# 等价于：npm version patch → 校验 tag → 同步 packages/desktop → push + 打 tag v*
```

手动触发：GitHub → Actions → **Release** → Run workflow，填写版本号。

CI 产出（与 PingClaw 对齐）：

| 产物 | 文件名示例 |
|------|------------|
| macOS 安装包 | `PingHermesAgent-0.1.0-mac-arm64.dmg` |
| macOS 便携 zip | `PingHermesAgentPortable-0.1.0-mac-arm64.zip` |
| Windows | `PingHermesAgent-0.1.0-win-x64.exe` |
| Linux | `PingHermesAgent-0.1.0-linux-x86_64.AppImage` 等 |

### 脚本

| 脚本 | 作用 |
|------|------|
| `scripts/prebake-backend.sh` | 安装后端到 `data/hermes` + 写入 bootstrap 标记 |
| `scripts/assemble-portable.mjs` | CI/本地：打便携 zip；Release mac 使用 `--prebake` |
| `scripts/assemble-portable.sh` | 本地：组装 `dist/PingHermesAgentPortable/` 文件夹 |
| `scripts/stamp-bootstrap-marker.sh` | 让 Desktop 跳过首次安装向导 |

## 说明

- **路线 1（便携）**：`assemble-portable.sh --prebake` 预装 `data/hermes/venv`，目标机零安装
- 配置与会话在 `HERMES_HOME`（默认 `~/.hermes`，便携版为 `data/hermes`）
- 完整说明见 [README.md](README.md)
