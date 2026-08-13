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
import { createInterface } from 'node:readline/promises';

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

// Accept plain releases (0.3.1) and prereleases, incl. preview builds whose
// prerelease carries the sanitized branch id (e.g.
// 0.3.9-preview.feature-ETP-4394.<ts>.<sha>). SemVer prerelease identifiers are
// [0-9A-Za-z-] dot-separated, so the class must include '-'.
const VERSION_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;

// Resolve the target version: prefer the CLI argument; when omitted and we have
// an interactive TTY, prompt for it (so `make bump-core-version` with no
// VERSION= asks instead of failing). Falls back to the usage error otherwise.
async function resolveVersion() {
  let version = process.argv[2];
  if (!version && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      version = (await rl.question('Core version to bump to (e.g. 0.3.1): ')).trim();
    } finally {
      rl.close();
    }
  }
  if (!version || !VERSION_RE.test(version)) {
    console.error('Usage: node scripts/bump-core-version.mjs <version>  (e.g. 0.3.1)');
    process.exit(1);
  }
  return version;
}

const version = await resolveVersion();

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// A JSON line is "lockstep" when it declares one of the lockstep packages as a
// key, e.g.  "@etendosoftware/app-shell-core": "0.3.13-...",
const isLockstepLine = (line) => LOCKSTEP_PACKAGES.some((name) => line.includes(`"${name}"`));

// Resolve git merge-conflict markers in a package.json, but ONLY when the two
// sides differ solely in lockstep-package pins — those get overwritten by the
// bump anyway, so keeping either side is safe. If a conflict block carries any
// other difference we refuse to guess and ask for a manual resolution.
// Returns { text, resolved } where `resolved` is true when markers were removed.
function resolveLockstepConflicts(raw, rel) {
  const lines = raw.split('\n');
  if (!lines.some((l) => /^<{7}/.test(l))) return { text: raw, resolved: false };

  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^<{7}/.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    // Collect "ours" until the ======= separator.
    const ours = [];
    for (i++; i < lines.length && !/^={7}/.test(lines[i]); i++) ours.push(lines[i]);
    // Collect "theirs" until the >>>>>>> terminator.
    const theirs = [];
    for (i++; i < lines.length && !/^>{7}/.test(lines[i]); i++) theirs.push(lines[i]);
    i++; // skip the >>>>>>> line

    const oursRest = ours.filter((l) => !isLockstepLine(l)).join('\n');
    const theirsRest = theirs.filter((l) => !isLockstepLine(l)).join('\n');
    if (oursRest !== theirsRest) {
      console.error(
        `${rel}: merge conflict contains non-lockstep changes — resolve it manually, then re-run the bump.`,
      );
      process.exit(1);
    }
    // Keep "ours"; the lockstep pins are about to be rewritten to VERSION.
    out.push(...ours);
  }
  return { text: out.join('\n'), resolved: true };
}

let touched = 0;

for (const rel of MANIFESTS) {
  const path = join(REPO_ROOT, rel);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue; // manifest not present in this checkout — skip
  }
  const { text, resolved } = resolveLockstepConflicts(raw, rel);
  raw = text;
  if (resolved) console.log(`${rel}: resolved merge conflict on lockstep pins.`);
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
  if (changes.length || resolved) {
    // Preserve trailing newline style of the original file.
    const trailer = raw.endsWith('\n') ? '\n' : '';
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}${trailer}`);
    touched += changes.length;
    if (changes.length) {
      console.log(`${rel}:`);
      for (const c of changes) console.log(`  ${c}`);
    }
  }
}

if (!touched) {
  console.log(`No lockstep packages needed bumping (already at ${version}).`);
} else {
  console.log(`\nBumped ${touched} pin(s) to ${version}. Run the installs to refresh lockfiles.`);
}
