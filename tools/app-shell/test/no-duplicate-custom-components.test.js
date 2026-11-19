// @covers tools/app-shell/src/windows/custom
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5280 guardrail — a window's custom component lives in exactly one tree.
 *
 * The module a window loads is always the one under `artifacts/<window>/custom/` (the generated
 * page's relative import, or the `@generated` alias used by `customLoaders`). A same-named file
 * under `tools/app-shell/src/windows/custom/<window>/` is dead code: its tests report coverage
 * for something that never runs, and the two copies drift apart (ETP-5101's token registration
 * reached only the live one). Put the file where it runs, and point its tests at it through
 * `@generated/<window>/custom/<file>`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL_CUSTOM = join(__dirname, '..', 'src', 'windows', 'custom');
const ARTIFACTS = join(__dirname, '..', '..', '..', 'artifacts');

function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectFiles(full, acc);
      continue;
    }
    if (/\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

function duplicatedFiles() {
  const duplicates = [];
  for (const windowName of readdirSync(APP_SHELL_CUSTOM)) {
    const shellDir = join(APP_SHELL_CUSTOM, windowName);
    if (!statSync(shellDir).isDirectory() || windowName === '__tests__') continue;
    const artifactDir = join(ARTIFACTS, windowName, 'custom');
    if (!existsSync(artifactDir)) continue;
    for (const file of collectFiles(shellDir)) {
      const rel = relative(shellDir, file);
      if (existsSync(join(artifactDir, rel))) duplicates.push(`${windowName}/${rel}`);
    }
  }
  return duplicates;
}

describe('no duplicated custom components (ETP-5280)', () => {
  it('no file name exists under both app-shell windows/custom and artifacts/*/custom for the same window', () => {
    const duplicates = duplicatedFiles();
    assert.equal(
      duplicates.length,
      0,
      `these files exist in BOTH trees; the artifacts copy is the one that runs — delete the app-shell copy and import the live module in its tests: ${duplicates.join(', ')}`,
    );
  });
});
