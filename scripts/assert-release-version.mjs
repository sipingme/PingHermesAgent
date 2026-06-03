#!/usr/bin/env node
/**
 * npm `version` lifecycle hook: abort if tag v{version} already exists.
 */
import { readFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageVersion() {
  const raw = readFileSync(join(root, 'package.json'), 'utf8');
  return JSON.parse(raw).version;
}

const version = process.env.npm_package_version || readPackageVersion();
const tag = `v${version}`;
const skipRemote = process.env.SKIP_RELEASE_REMOTE_CHECK === '1';

function localTagExists(t) {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${t}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function remoteTagExists(t) {
  try {
    const out = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${t}`], {
      encoding: 'utf8',
    }).trim();
    return out.length > 0;
  } catch {
    return null;
  }
}

if (localTagExists(tag)) {
  console.error(`
Release version check failed: git tag ${tag} already exists locally.

Use the next version explicitly, e.g. \`npm version 0.1.1-beta.1\`
Or delete only if created by mistake: \`git tag -d ${tag}\`
`);
  process.exit(1);
}

if (!skipRemote) {
  const onRemote = remoteTagExists(tag);
  if (onRemote === null) {
    console.error(`
Release version check failed: could not query origin for refs/tags/${tag}.

Run \`npm run preversion\` / \`git fetch origin --tags\`, then retry.
Offline only: SKIP_RELEASE_REMOTE_CHECK=1
`);
    process.exit(1);
  }
  if (onRemote) {
    console.error(`
Release version check failed: tag ${tag} already exists on origin.
Bump to a version not on the remote yet.
`);
    process.exit(1);
  }
}

console.log(`Release version OK: tag ${tag} is available.`);
