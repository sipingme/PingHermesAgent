#!/usr/bin/env node
/**
 * npm `version` hook: keep workspace packages in sync with root semver.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const targets = [join(root, 'packages/desktop/package.json')];

for (const path of targets) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  if (pkg.version === version) {
    console.log(`[sync-workspace-version] ${path} already ${version}`);
    continue;
  }
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[sync-workspace-version] ${path} → ${version}`);
}
