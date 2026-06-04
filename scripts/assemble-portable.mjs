#!/usr/bin/env node
/**
 * Assemble PingHermesAgentPortable USB zips after electron-builder.
 *
 * Usage:
 *   node scripts/assemble-portable.mjs mac|win|linux|all [--prebake]
 *
 * Output: packages/desktop/release/PingHermesAgentPortable-{version}-{platform}-{arch}.zip
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

const LAUNCHERS = [
  'Start PingHermesAgent.command',
  'Start PingHermesAgent.bat',
  'Start PingHermesAgent.sh',
  'README.txt',
];

function bundleName(platform, arch) {
  return `PingHermesAgentPortable-${VERSION}-${platform}-${arch}`;
}

function copyPortableTemplate(outDir) {
  mkdirSync(join(outDir, 'data/desktop'), { recursive: true });
  mkdirSync(join(outDir, 'data/hermes/home'), { recursive: true });

  for (const name of LAUNCHERS) {
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

  for (const launcher of ['Start PingHermesAgent.command', 'Start PingHermesAgent.sh']) {
    const path = join(outDir, launcher);
    if (existsSync(path)) {
      chmodSync(path, 0o755);
    }
  }
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

function prebakeBackend(outHermesHome) {
  if (process.platform === 'win32') {
    console.warn('[assemble-portable] Skip prebake on Windows — run on macOS/Linux or copy data/hermes');
    return;
  }
  console.log(`[assemble-portable] Prebaking backend into ${outHermesHome}...`);
  execFileSync(join(ROOT, 'scripts/prebake-backend.sh'), {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      HERMES_HOME: outHermesHome,
    },
    shell: process.platform === 'win32',
  });
  assertPrebakedBackend(outHermesHome);
}

function assertPrebakedBackend(outHermesHome) {
  const venvPy = join(outHermesHome, 'hermes-agent/venv/bin/python');
  if (!existsSync(venvPy)) {
    throw new Error(`[assemble-portable] Prebake failed: missing ${venvPy}`);
  }
  execFileSync(venvPy, ['-c', 'import hermes_cli'], { stdio: 'pipe' });
  const marker = join(outHermesHome, 'hermes-agent/.hermes-bootstrap-complete');
  if (!existsSync(marker)) {
    throw new Error(`[assemble-portable] Prebake failed: missing ${marker}`);
  }
  console.log(`[assemble-portable] Verified offline backend at ${outHermesHome}`);
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

function resolveWinUnpackedDir() {
  const dir = join(RELEASE, 'win-unpacked');
  if (existsSync(join(dir, 'PingHermesAgent.exe'))) {
    return dir;
  }
  return null;
}

function resolveLinuxAppImage() {
  if (!existsSync(RELEASE)) {
    return null;
  }
  for (const name of readdirSync(RELEASE)) {
    if (name.endsWith('.AppImage') && name.includes('PingHermesAgent')) {
      return join(RELEASE, name);
    }
  }
  return null;
}

function assembleBundle({ platform, arch, prebake, populate }) {
  const name = bundleName(platform, arch);
  const outDir = join(STAGING, name);
  const zipPath = join(RELEASE, `${name}.zip`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyPortableTemplate(outDir);

  if (prebake) {
    prebakeBackend(join(outDir, 'data/hermes'));
  }

  populate(outDir);

  zipDirectory(outDir, zipPath);
  console.log(`[assemble-portable] Created ${zipPath}`);
  return zipPath;
}

function assembleMacArch(arch, prebake) {
  const appPath = resolveMacAppPath(arch);
  if (!appPath) {
    console.warn(`[assemble-portable] Skip mac-${arch}: PingHermesAgent.app not found under ${RELEASE}`);
    return null;
  }

  return assembleBundle({
    platform: 'mac',
    arch,
    prebake,
    populate(outDir) {
      cpSync(appPath, join(outDir, 'PingHermesAgent.app'), { recursive: true });
    },
  });
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

function assembleWin(prebake) {
  const unpacked = resolveWinUnpackedDir();
  if (!unpacked) {
    throw new Error(`Windows win-unpacked/PingHermesAgent.exe not found under ${RELEASE}`);
  }

  mkdirSync(STAGING, { recursive: true });
  return [
    assembleBundle({
      platform: 'win',
      arch: 'x64',
      prebake,
      populate(outDir) {
        cpSync(unpacked, join(outDir, 'win'), { recursive: true });
      },
    }),
  ];
}

function assembleLinux(prebake) {
  const appImage = resolveLinuxAppImage();
  if (!appImage) {
    throw new Error(`Linux AppImage not found under ${RELEASE}`);
  }

  mkdirSync(STAGING, { recursive: true });
  return [
    assembleBundle({
      platform: 'linux',
      arch: 'x64',
      prebake,
      populate(outDir) {
        const dest = join(outDir, 'PingHermesAgent.AppImage');
        cpSync(appImage, dest);
        chmodSync(dest, 0o755);
      },
    }),
  ];
}

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((arg) => !arg.startsWith('-')) ?? '';
  const prebake = args.includes('--prebake') || process.env.PINGHERMESAGENT_PREBAKE_PORTABLE === '1';

  if (platform === 'mac') {
    assembleMac(prebake);
    return;
  }
  if (platform === 'win') {
    assembleWin(prebake);
    return;
  }
  if (platform === 'linux') {
    assembleLinux(prebake);
    return;
  }
  if (platform === 'all') {
    assembleMac(prebake);
    assembleWin(prebake);
    assembleLinux(prebake);
    return;
  }

  throw new Error('Usage: node scripts/assemble-portable.mjs <mac|win|linux|all> [--prebake]');
}

try {
  main();
} catch (error) {
  console.error(`[assemble-portable] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
