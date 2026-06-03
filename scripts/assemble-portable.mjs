#!/usr/bin/env node
/**
 * Assemble PingHermesAgentPortable USB zips after electron-builder (PingClaw-style).
 *
 * Usage:
 *   node scripts/assemble-portable.mjs mac
 *   node scripts/assemble-portable.mjs mac --prebake
 *
 * Output: packages/desktop/release/PingHermesAgentPortable-{version}-mac-{arch}.zip
 */
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = join(ROOT, 'packages/desktop/release');
const STAGING = join(RELEASE, '.portable-staging');
const PORTABLE_TEMPLATE = join(ROOT, '../PingHermesAgentPortable');
const PORTABLE_SRC = existsSync(join(PORTABLE_TEMPLATE, 'Start PingHermesAgent.command'))
  ? PORTABLE_TEMPLATE
  : join(ROOT, 'portable');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

function bundleName(platform, arch) {
  return `PingHermesAgentPortable-${VERSION}-${platform}-${arch}`;
}

function copyPortableTemplate(outDir) {
  mkdirSync(join(outDir, 'data/desktop'), { recursive: true });
  mkdirSync(join(outDir, 'data/hermes/home'), { recursive: true });

  for (const name of ['Start PingHermesAgent.command', 'Start PingHermesAgent.bat', 'README.txt']) {
    const src = join(PORTABLE_SRC, name);
    if (existsSync(src)) {
      cpSync(src, join(outDir, name));
    }
  }

  const marker = join(PORTABLE_TEMPLATE, '.pinghermesagent-portable');
  const markerFallback = join(ROOT, '.pinghermesagent-portable');
  if (existsSync(marker)) {
    cpSync(marker, join(outDir, '.pinghermesagent-portable'));
  } else if (existsSync(markerFallback)) {
    cpSync(markerFallback, join(outDir, '.pinghermesagent-portable'));
  } else {
    writeFileSync(join(outDir, '.pinghermesagent-portable'), 'portable\n');
  }

  writeFileSync(join(outDir, 'VERSION'), `${VERSION}\n`, 'utf8');
  chmodSync(join(outDir, 'Start PingHermesAgent.command'), 0o755);
}

function zipDirectory(sourceDir, zipPath) {
  rmSync(zipPath, { force: true });
  const folderName = basename(sourceDir);
  const parentDir = dirname(sourceDir);

  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    return;
  }

  execFileSync('zip', ['-r', zipPath, folderName], {
    cwd: parentDir,
    stdio: 'inherit',
  });
}

function resolveMacAppPath(arch) {
  const folder = arch === 'arm64' ? 'mac-arm64' : 'mac';
  const candidates = [
    join(RELEASE, folder, 'PingHermesAgent.app'),
    join(RELEASE, folder, 'Ping Hermes.app'),
    join(RELEASE, `mac-${arch}`, 'PingHermesAgent.app'),
    join(RELEASE, `mac-${arch}`, 'Ping Hermes.app'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function prebakeBackend(outHermesHome) {
  console.log(`[assemble-portable] Prebaking backend into ${outHermesHome}...`);
  execFileSync(join(ROOT, 'scripts/prebake-backend.sh'), {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      HERMES_HOME: outHermesHome,
    },
  });
}

function assembleMacArch(arch, prebake) {
  const appPath = resolveMacAppPath(arch);
  if (!appPath) {
    console.warn(`[assemble-portable] Skip mac-${arch}: PingHermesAgent.app not found under ${RELEASE}`);
    return null;
  }

  const name = bundleName('mac', arch);
  const outDir = join(STAGING, name);
  const zipPath = join(RELEASE, `${name}.zip`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyPortableTemplate(outDir);

  if (prebake) {
    prebakeBackend(join(outDir, 'data/hermes'));
  }

  // Launcher expects PingHermesAgent.app at bundle root.
  cpSync(appPath, join(outDir, 'PingHermesAgent.app'), { recursive: true });
  zipDirectory(outDir, zipPath);
  console.log(`[assemble-portable] Created ${zipPath}`);
  return zipPath;
}

function assembleMac(prebake) {
  mkdirSync(STAGING, { recursive: true });
  const created = [];
  for (const arch of ['arm64', 'x64']) {
    const zipPath = assembleMacArch(arch, prebake);
    if (zipPath) {
      created.push(zipPath);
    }
  }
  if (created.length === 0) {
    throw new Error(`No macOS app bundles found under ${RELEASE}`);
  }
  return created;
}

function main() {
  const args = process.argv.slice(2);
  const platform = args[0];
  const prebake = args.includes('--prebake') || process.env.PINGHERMESAGENT_PREBAKE_PORTABLE === '1';

  if (!existsSync(join(PORTABLE_SRC, 'Start PingHermesAgent.command'))) {
    throw new Error(`Portable launcher missing: ${join(PORTABLE_SRC, 'Start PingHermesAgent.command')}`);
  }

  if (platform === 'mac') {
    assembleMac(prebake);
    return;
  }

  throw new Error('Usage: node scripts/assemble-portable.mjs <mac> [--prebake]');
}

try {
  main();
} catch (error) {
  console.error(`[assemble-portable] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
