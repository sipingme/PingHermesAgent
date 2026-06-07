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

function resolveVenvPython(hermesHome) {
  const winPy = join(hermesHome, 'hermes-agent/venv/Scripts/python.exe');
  const unixPy = join(hermesHome, 'hermes-agent/venv/bin/python');
  if (existsSync(winPy)) {
    return winPy;
  }
  if (existsSync(unixPy)) {
    return unixPy;
  }
  return null;
}

function applyStandalonePrebakeEnv(platform, arch) {
  const prevTar = process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL;
  const prevStandalone = process.env.PINGHERMESAGENT_PREBAKE_STANDALONE;
  let standaloneTemporarilyDisabled = false;

  if (process.env.PINGHERMESAGENT_PREBAKE_STANDALONE !== '1') {
    return () => {};
  }

  let chosen;
  if (platform === 'mac') {
    const armUrl = process.env.PINGHERMESAGENT_STANDALONE_PY_URL_ARM64;
    const x64Url = process.env.PINGHERMESAGENT_STANDALONE_PY_URL_X64;
    chosen = arch === 'arm64' ? armUrl : x64Url;
  } else if (platform === 'win') {
    chosen =
      process.env.PINGHERMESAGENT_STANDALONE_PY_URL_WIN_X64 ??
      process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL;
  } else if (platform === 'linux') {
    chosen =
      process.env.PINGHERMESAGENT_STANDALONE_PY_URL_LINUX_X64 ??
      process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL;
  }

  if (chosen) {
    process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL = chosen;
  } else {
    delete process.env.PINGHERMESAGENT_PREBAKE_STANDALONE;
    standaloneTemporarilyDisabled = true;
    console.warn(
      `[assemble-portable] No standalone Python tarball URL for ${platform}-${arch}; falling back to system-Python prebake`,
    );
  }

  return () => {
    if (prevTar === undefined) {
      delete process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL;
    } else {
      process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL = prevTar;
    }
    if (standaloneTemporarilyDisabled) {
      process.env.PINGHERMESAGENT_PREBAKE_STANDALONE = prevStandalone;
    }
  };
}

function runShellScript(scriptPath, { env = process.env } = {}) {
  if (process.platform === 'win32') {
    execFileSync('bash', [scriptPath], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    });
    return;
  }
  execFileSync(scriptPath, {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  });
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

  const destDir = join(outDir, 'scripts');
  mkdirSync(destDir, { recursive: true });
  for (const name of ['relocate-portable-hermes.sh', 'clear-mac-gatekeeper.sh', 'repair-portable-venv.sh']) {
    const fromPortable = join(PORTABLE_SRC, 'scripts', name);
    const fromRoot = join(ROOT, 'scripts', name);
    const src = existsSync(fromPortable) ? fromPortable : fromRoot;
    if (existsSync(src)) {
      cpSync(src, join(destDir, name));
      chmodSync(join(destDir, name), 0o755);
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
  console.log(`[assemble-portable] Prebaking backend into ${outHermesHome}...`);
  const env = {
    ...process.env,
    HERMES_HOME: outHermesHome,
  };
  // Allow CI to request a relocatable Python
  if (process.env.PINGHERMESAGENT_PREBAKE_STANDALONE === '1') {
    env.PINGHERMESAGENT_PREBAKE_STANDALONE = '1';
  }
  if (process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL) {
    env.PINGHERMESAGENT_PYTHON_TARBALL_URL = process.env.PINGHERMESAGENT_PYTHON_TARBALL_URL;
  }
  runShellScript(join(ROOT, 'scripts/prebake-backend.sh'), { env });
  runShellScript(join(ROOT, 'scripts/relocate-portable-hermes.sh'), {
    env: { ...process.env, HERMES_HOME: outHermesHome },
  });
  assertPrebakedBackend(outHermesHome);
}

function assertPrebakedBackend(outHermesHome) {
  const venvPy = resolveVenvPython(outHermesHome);
  if (!venvPy) {
    throw new Error(`[assemble-portable] Prebake failed: missing venv python under ${outHermesHome}/hermes-agent/venv`);
  }
  const hermesPython = join(outHermesHome, 'python');
  const importEnv = { ...process.env };
  if (existsSync(join(hermesPython, 'bin', 'python3'))) {
    importEnv.PYTHONHOME = hermesPython;
  }
  execFileSync(venvPy, ['-c', 'import fastapi, uvicorn, hermes_cli'], {
    stdio: 'pipe',
    env: importEnv,
  });
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

  const restoreStandaloneEnv = applyStandalonePrebakeEnv('mac', arch);

  const res = assembleBundle({
    platform: 'mac',
    arch,
    prebake,
    populate(outDir) {
      cpSync(appPath, join(outDir, 'PingHermesAgent.app'), { recursive: true });
      const resourcesDir = join(outDir, 'PingHermesAgent.app', 'Contents', 'Resources');
      const markerSrc = join(outDir, '.pinghermesagent-portable');
      if (existsSync(markerSrc)) {
        mkdirSync(resourcesDir, { recursive: true });
        cpSync(markerSrc, join(resourcesDir, 'portable.marker'));
      }
    },
  });
  restoreStandaloneEnv();
  return res;
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
  const restoreStandaloneEnv = applyStandalonePrebakeEnv('win', 'x64');
  const zipPath = assembleBundle({
    platform: 'win',
    arch: 'x64',
    prebake,
    populate(outDir) {
      cpSync(unpacked, join(outDir, 'win'), { recursive: true });
    },
  });
  restoreStandaloneEnv();
  return [zipPath];
}

function assembleLinux(prebake) {
  const appImage = resolveLinuxAppImage();
  if (!appImage) {
    throw new Error(`Linux AppImage not found under ${RELEASE}`);
  }

  mkdirSync(STAGING, { recursive: true });
  const restoreStandaloneEnv = applyStandalonePrebakeEnv('linux', 'x64');
  const zipPath = assembleBundle({
    platform: 'linux',
    arch: 'x64',
    prebake,
    populate(outDir) {
      const dest = join(outDir, 'PingHermesAgent.AppImage');
      cpSync(appImage, dest);
      chmodSync(dest, 0o755);
    },
  });
  restoreStandaloneEnv();
  return [zipPath];
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
