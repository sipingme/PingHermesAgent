#!/usr/bin/env node
/**
 * electron-builder wrapper — raises macOS file descriptor limit (PingClaw pattern).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'packages/desktop');
const require = createRequire(join(desktop, 'package.json'));
const builderBin = require.resolve('electron-builder/cli.js');
const args = process.argv.slice(2);

if (process.platform === 'darwin') {
  try {
    spawnSync('ulimit', ['-n', '65536'], { shell: true, stdio: 'inherit' });
  } catch {
    // best-effort
  }
}

const result = spawnSync(process.execPath, [builderBin, ...args], {
  cwd: desktop,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
