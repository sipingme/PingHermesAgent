#!/usr/bin/env node
/**
 * npm `postversion`: push branch + the new version tag only.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageVersion() {
  const raw = readFileSync(join(root, 'package.json'), 'utf8');
  return JSON.parse(raw).version;
}

const version = process.env.npm_package_version || readPackageVersion();
const tag = `v${version}`;

execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
