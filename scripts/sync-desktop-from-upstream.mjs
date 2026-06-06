#!/usr/bin/env node
/**
 * Sync packages/desktop from hermes-agent/apps/desktop (upstream).
 * Preserves Ping-specific portable runtime, vendored bootstrap, branding, zh default.
 *
 * Usage: node scripts/sync-desktop-from-upstream.mjs [path/to/hermes-agent]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = resolve(process.argv[2] || join(ROOT, '..', 'hermes-agent'), 'apps/desktop');
const DEST = join(ROOT, 'packages/desktop');
const PRESERVE_DIR = join(ROOT, 'scripts/.sync-desktop-preserve');

const PRESERVE_FILES = [
  'electron/portable-runtime.cjs',
  'electron/bootstrap-runner.cjs',
];

const RSYNC_EXCLUDES = [
  'node_modules',
  'dist',
  'release',
  'build/native-deps',
  'build/install-stamp.json',
  'tsconfig.tsbuildinfo',
  '.DS_Store',
];

function copyTree(src, dst, excludes) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (excludes.includes(name)) continue;
    const from = join(src, name);
    const to = join(dst, name);
    const st = statSync(from);
    if (st.isDirectory()) {
      copyTree(from, to, excludes);
    } else {
      cpSync(from, to);
    }
  }
}

function backupPreserve() {
  rmSync(PRESERVE_DIR, { recursive: true, force: true });
  mkdirSync(PRESERVE_DIR, { recursive: true });
  for (const rel of PRESERVE_FILES) {
    const src = join(DEST, rel);
    if (existsSync(src)) {
      const out = join(PRESERVE_DIR, rel);
      mkdirSync(dirname(out), { recursive: true });
      cpSync(src, out);
    }
  }
}

function restorePreserve() {
  for (const rel of PRESERVE_FILES) {
    const src = join(PRESERVE_DIR, rel);
    if (existsSync(src)) {
      const out = join(DEST, rel);
      mkdirSync(dirname(out), { recursive: true });
      cpSync(src, out);
    }
  }
}

function patchMainCjs() {
  const file = join(DEST, 'electron/main.cjs');
  let s = readFileSync(file, 'utf8');

  if (!s.includes('portable-runtime.cjs')) {
    s = s.replace(
      "const { canImportHermesCli, verifyHermesCli } = require('./backend-probes.cjs')",
      "const { canImportHermesCli, verifyHermesCli } = require('./backend-probes.cjs')\nconst { bootstrapPortableRuntime, isPortableMode, getPortableRuntime } = require('./portable-runtime.cjs')",
    );
  }

  const portableBootstrap = `const PORTABLE_RUNTIME = bootstrapPortableRuntime({
  execPath: process.execPath,
  resourcesPath: process.resourcesPath
})
if (PORTABLE_RUNTIME.enabled) {
  fs.mkdirSync(PORTABLE_RUNTIME.desktopUserData, { recursive: true })
  fs.mkdirSync(PORTABLE_RUNTIME.portableHome, { recursive: true })
  app.setPath('userData', PORTABLE_RUNTIME.desktopUserData)
  try {
    app.setPath('home', PORTABLE_RUNTIME.portableHome)
  } catch (error) {
    console.warn(\`[hermes] portable: could not redirect Electron home: \${error.message}\`)
  }
  console.log(
    \`[hermes] portable mode: root=\${PORTABLE_RUNTIME.root} hermes=\${PORTABLE_RUNTIME.hermesHome} userData=\${PORTABLE_RUNTIME.desktopUserData}\`
  )
} else {
  const USER_DATA_OVERRIDE = process.env.HERMES_DESKTOP_USER_DATA_DIR
  if (USER_DATA_OVERRIDE) {
    const resolvedUserData = path.resolve(USER_DATA_OVERRIDE)
    fs.mkdirSync(resolvedUserData, { recursive: true })
    app.setPath('userData', resolvedUserData)
  }
}`;

  if (!s.includes('const PORTABLE_RUNTIME = bootstrapPortableRuntime')) {
    s = s.replace(
      /const USER_DATA_OVERRIDE = process\.env\.HERMES_DESKTOP_USER_DATA_DIR\nif \(USER_DATA_OVERRIDE\) \{\n  const resolvedUserData = path\.resolve\(USER_DATA_OVERRIDE\)\n  fs\.mkdirSync\(resolvedUserData, \{ recursive: true \}\)\n  app\.setPath\('userData', resolvedUserData\)\n\}/,
      portableBootstrap,
    );
  }

  s = s.replace(
    "const SOURCE_REPO_ROOT = path.resolve(APP_ROOT, '../..')",
    `const MONOREPO_ROOT = path.resolve(APP_ROOT, '../..')
const SOURCE_REPO_ROOT = process.env.HERMES_DESKTOP_HERMES_ROOT
  ? path.resolve(process.env.HERMES_DESKTOP_HERMES_ROOT)
  : path.join(MONOREPO_ROOT, '..', 'hermes-agent')`,
  );

  if (!s.includes('isPortableMode()')) {
    s = s.replace(
      'function resolveHermesHome() {\n  if (process.env.HERMES_HOME) return path.resolve(process.env.HERMES_HOME)',
      `function resolveHermesHome() {
  if (isPortableMode()) {
    const portable = getPortableRuntime()
    if (portable?.hermesHome) {
      return portable.hermesHome
    }
    if (process.env.HERMES_HOME) {
      return path.resolve(process.env.HERMES_HOME)
    }
    throw new Error('Portable mode enabled but HERMES_HOME is not set')
  }
  if (process.env.HERMES_HOME) return path.resolve(process.env.HERMES_HOME)`,
    );

    s = s.replace(
      /if \(process\.env\.HERMES_DESKTOP_IGNORE_EXISTING !== '1'\) \{/,
      "if (!isPortableMode() && process.env.HERMES_DESKTOP_IGNORE_EXISTING !== '1') {",
    );

    s = s.replace(
      '  // 5. Last-ditch: pip-installed hermes_cli module via system Python.\n  //    Same rationale as #4 -- the user installed this; we use it but don\'t\n  //    take ownership.\n  const python = findSystemPython()',
      '  // 5. Last-ditch: pip-installed hermes_cli module via system Python (host only).\n  const python = isPortableMode() ? null : findSystemPython()',
    );

    const portableBootstrapBlock = `    if (isPortableMode() && process.env.PINGHERMESAGENT_OFFLINE === '1') {
      const portable = getPortableRuntime()
      const hint = portable?.hermesHome
        ? \`Expected pre-baked backend at \${path.join(portable.hermesHome, 'hermes-agent', 'venv')}.\`
        : 'Portable backend path is missing.'
      const message = \`Portable mode cannot install to the host machine. \${hint} Use Start PingHermesAgent.command and a Release portable zip with data/hermes/.\`
      rememberLog(\`[bootstrap] blocked in portable offline mode: \${message}\`)
      throw new Error(message)
    }
    rememberLog('[bootstrap] no Hermes install found; starting first-launch bootstrap')`;

    s = s.replace(
      "  if (backend.kind === 'bootstrap-needed') {\n    rememberLog('[bootstrap] no Hermes install found; starting first-launch bootstrap')",
      `  if (backend.kind === 'bootstrap-needed') {\n${portableBootstrapBlock}`,
    );
  }

  s = s.replace("const APP_NAME = 'Hermes'", "const APP_NAME = 'PingHermesAgent'");

  writeFileSync(file, s);
}

function patchPackageJson() {
  const pingPath = join(DEST, 'package.json');
  const upstream = JSON.parse(readFileSync(pingPath, 'utf8'));
  const pingMeta = {
    name: 'pinghermesagent-desktop',
    productName: 'PingHermesAgent',
    version: readFileSync(join(ROOT, 'package.json'), 'utf8').match(/"version":\s*"([^"]+)"/)?.[1] || upstream.version,
    description: 'PingHermesAgent desktop shell for Hermes Agent (uses official Nous Python backend).',
    author: 'Ping',
    homepage: 'https://github.com/sipingme/PingHermesAgent',
    repository: {
      type: 'git',
      url: 'https://github.com/sipingme/PingHermesAgent.git',
    },
  };

  upstream.scripts['dev:electron'] =
    "wait-on http://127.0.0.1:5174 && cross-env ELECTRON_RUN_AS_NODE= XCURSOR_SIZE=24 HERMES_DESKTOP_DEV_SERVER=http://127.0.0.1:5174 electron .";

  for (const script of ['dist:mac', 'dist:win', 'dist:linux']) {
    if (upstream.scripts[script] && !upstream.scripts[script].includes('--publish never')) {
      upstream.scripts[script] = `${upstream.scripts[script]} --publish never`;
    }
  }

  upstream.build = upstream.build || {};
  upstream.build.appId = 'app.pinghermesagent.desktop';
  upstream.build.productName = 'PingHermesAgent';
  upstream.build.executableName = 'PingHermesAgent';
  upstream.build.artifactName = 'PingHermesAgent-${version}-${os}-${arch}.${ext}';
  upstream.build.extraResources = [
    ...(upstream.build.extraResources || []).filter((e) => !String(e.to).includes('vendor/')),
    {
      from: '../../vendor/hermes-agent/scripts',
      to: 'vendor/hermes-agent/scripts',
    },
  ];
  if (upstream.build.mac?.extendInfo) {
    upstream.build.mac.extendInfo.CFBundleDisplayName = 'PingHermesAgent';
    upstream.build.mac.extendInfo.CFBundleExecutable = 'PingHermesAgent';
    upstream.build.mac.extendInfo.CFBundleName = 'PingHermesAgent';
  }
  if (upstream.build.dmg) {
    upstream.build.dmg.title = 'Install PingHermesAgent';
  }

  delete upstream.dependencies?.i18next;
  delete upstream.dependencies?.['react-i18next'];

  writeFileSync(pingPath, `${JSON.stringify({ ...upstream, ...pingMeta }, null, 2)}\n`);
}

function patchI18n() {
  const langFile = join(DEST, 'src/i18n/languages.ts');
  if (existsSync(langFile)) {
    let s = readFileSync(langFile, 'utf8');
    s = s.replace("export const DEFAULT_LOCALE: Locale = 'en'", "export const DEFAULT_LOCALE: Locale = 'zh'");
    writeFileSync(langFile, s);
  }

  const zhFile = join(DEST, 'src/i18n/zh.ts');
  if (existsSync(zhFile)) {
    let s = readFileSync(zhFile, 'utf8');
    s = s.replace(/Hermes Desktop/g, 'PingHermesAgent');
    s = s.replace(/Hermes 无法启动/g, 'PingHermesAgent 无法启动');
    s = s.replace(/Hermes 后台/g, 'PingHermesAgent 后台');
    writeFileSync(zhFile, s);
  }

  rmSync(join(DEST, 'src/i18n.ts'), { force: true });
  rmSync(join(DEST, 'src/locales'), { recursive: true, force: true });
}

function syncShared() {
  const upShared = join(dirname(UPSTREAM), 'shared');
  const destShared = join(ROOT, 'packages/shared');
  if (existsSync(upShared)) {
    copyTree(upShared, destShared, ['node_modules']);
  }
}

if (!existsSync(UPSTREAM)) {
  console.error(`Upstream not found: ${UPSTREAM}`);
  process.exit(1);
}

console.log(`[sync-desktop] upstream: ${UPSTREAM}`);
console.log(`[sync-desktop] dest:     ${DEST}`);

backupPreserve();
rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

try {
  execFileSync('rsync', ['-a', ...RSYNC_EXCLUDES.flatMap((e) => ['--exclude', e]), `${UPSTREAM}/`, `${DEST}/`], {
    stdio: 'inherit',
  });
} catch {
  console.warn('[sync-desktop] rsync failed; falling back to node copy');
  copyTree(UPSTREAM, DEST, RSYNC_EXCLUDES);
}

restorePreserve();
patchMainCjs();
patchPackageJson();
patchI18n();
syncShared();

console.log('[sync-desktop] Done. Run: npm install && npm run type-check --workspace=pinghermesagent-desktop');
