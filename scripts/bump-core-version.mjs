#!/usr/bin/env node
// Bump the pinned version of the schema_forge_core lockstep packages across
// every package.json in this repo, then let the Makefile run the installs.
//
// Usage: node scripts/bump-core-version.mjs <version>
//   e.g. node scripts/bump-core-version.mjs 0.3.1
//
// These packages are published in lockstep from schema_forge_core (see
// docs/repo-topology.md) and all move together on every core release.
// Only these names are touched — unrelated @etendosoftware deps keep their
// own version.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lockstep packages whose pin must move together with the core release.
const LOCKSTEP_PACKAGES = [
  '@etendosoftware/app-shell-core',
  '@etendosoftware/etendo-go-core',
  '@etendosoftware/schema-forge-agent-context',
  '@etendosoftware/schema-forge-cli',
  '@etendosoftware/schema-forge-core',
  '@etendosoftware/schema-forge-stack',
];

// package.json files that may declare any of the lockstep packages.
const MANIFESTS = ['package.json', 'tools/app-shell/package.json'];

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: node scripts/bump-core-version.mjs <version>  (e.g. 0.3.1)');
  process.exit(1);
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
let touched = 0;

for (const rel of MANIFESTS) {
  const path = join(REPO_ROOT, rel);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue; // manifest not present in this checkout — skip
  }
  const pkg = JSON.parse(raw);
  const changes = [];
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const name of LOCKSTEP_PACKAGES) {
      if (deps[name] && deps[name] !== version) {
        changes.push(`${name}: ${deps[name]} -> ${version}`);
        deps[name] = version;
      }
    }
  }
  if (changes.length) {
    // Preserve trailing newline style of the original file.
    const trailer = raw.endsWith('\n') ? '\n' : '';
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}${trailer}`);
    touched += changes.length;
    console.log(`${rel}:`);
    for (const c of changes) console.log(`  ${c}`);
  }
}

if (!touched) {
  console.log(`No lockstep packages needed bumping (already at ${version}).`);
} else {
  console.log(`\nBumped ${touched} pin(s) to ${version}. Run the installs to refresh lockfiles.`);
}
