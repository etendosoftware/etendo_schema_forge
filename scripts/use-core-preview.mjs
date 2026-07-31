#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_SOURCE_PACKAGE = '@etendosoftware/schema-forge-core';
const LOCKSTEP_PACKAGES = [
  '@etendosoftware/app-shell-core',
  '@etendosoftware/etendo-go-core',
  '@etendosoftware/schema-forge-cli',
  '@etendosoftware/schema-forge-core',
];

export function sanitizeBranchId(raw) {
  const id = String(raw)
    .replace(/[^0-9A-Za-z-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) throw new Error(`Branch name "${raw}" sanitizes to an empty id`);
  return id;
}

export function selectLatestPreview(versions, branch) {
  const branchId = sanitizeBranchId(branch);
  const marker = `-preview.${branchId}.`;
  const matches = versions
    .filter((version) => version.includes(marker))
    .map((version) => {
      const suffix = version.slice(version.indexOf(marker) + marker.length);
      const [timestamp = '', shortSha = ''] = suffix.split('.');
      return { version, timestamp, shortSha };
    })
    .filter(({ timestamp, shortSha }) => /^\d{14}$/.test(timestamp) && /^[0-9a-f]{7}$/i.test(shortSha))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.version.localeCompare(a.version));
  return matches[0]?.version || null;
}

export function resolveCoreRuntime(versions, branch, exactVersion) {
  const version = exactVersion || selectLatestPreview(versions, branch);
  return version
    ? { mode: 'preview', version }
    : { mode: 'pinned', version: null };
}

export function parseVersions(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim();
}

function resolveBranch() {
  return (
    process.env.CORE_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    run('git', ['branch', '--show-current'])
  );
}

function installedVersion(packageName) {
  try {
    const manifest = join(REPO_ROOT, 'node_modules', ...packageName.split('/'), 'package.json');
    return JSON.parse(readFileSync(manifest, 'utf8')).version || null;
  } catch {
    return null;
  }
}

function installPreview(version) {
  const alreadyInstalled = LOCKSTEP_PACKAGES.every(
    (packageName) => installedVersion(packageName) === version,
  );
  if (alreadyInstalled) {
    console.log('Core preview packages are already installed.');
    return;
  }

  const result = spawnSync(
    'npm',
    [
      'install',
      '--no-save',
      '--package-lock=false',
      '--legacy-peer-deps',
      ...LOCKSTEP_PACKAGES.map((packageName) => `${packageName}@${version}`),
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`npm install failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function main() {
  const branch = resolveBranch();
  if (!branch) {
    throw new Error('Cannot resolve a branch. Set CORE_BRANCH explicitly.');
  }

  const versions = parseVersions(
    run('npm', ['view', VERSION_SOURCE_PACKAGE, 'versions', '--json']),
  );
  const runtime = resolveCoreRuntime(versions, branch, process.env.CORE_PREVIEW_VERSION);

  console.log(`Schema Forge branch : ${branch}`);
  console.log(`Core branch id      : ${sanitizeBranchId(branch)}`);
  if (runtime.mode === 'pinned') {
    console.warn(`No published Core preview found for ${branch}.`);
    console.warn('Continuing with the Core versions pinned in package.json.');
    return;
  }

  console.log(`Core preview        : ${runtime.version}`);
  installPreview(runtime.version);
  console.log('Package manifests   : unchanged (--no-save --package-lock=false)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`use-core-preview: ${error.message}`);
    process.exit(1);
  }
}
