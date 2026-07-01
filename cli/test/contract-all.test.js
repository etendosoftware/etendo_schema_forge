// Contract tests for all artifact windows.
// Discovers artifacts/*/contract.json and runs each assertion as a node:test case.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTestAssertions } from '../src/run-contract-tests.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, '../../artifacts');

// Discover all windows with contract.json.
// Skip `_`-prefixed dirs: those are transient fixtures created by other test
// files (e.g. check-version.test.js uses `_test-check-version`) and can appear
// or vanish mid-run, racing this discovery scan.
const windows = readdirSync(artifactsDir).filter(dir => {
  if (dir.startsWith('_')) return false;
  try {
    readFileSync(resolve(artifactsDir, dir, 'contract.json'));
    return true;
  } catch { return false; }
});

for (const window of windows) {
  describe(`contract: ${window}`, () => {
    const contractPath = resolve(artifactsDir, window, 'contract.json');
    const contract = JSON.parse(readFileSync(contractPath, 'utf-8'));
    const results = generateTestAssertions(contract);

    for (const result of results) {
      it(`[${result.category}] ${result.description}`, () => {
        assert.ok(result.passed, result.reason || `Test ${result.id} failed`);
      });
    }
  });
}
