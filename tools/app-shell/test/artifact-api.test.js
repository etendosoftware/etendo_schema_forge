import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ARTIFACTS_DIR = resolve(import.meta.dirname, '../../../artifacts');
const SAFE_WINDOW_RE = /^[a-z0-9-]+$/;
const SAFE_REF_RE = /^[a-f0-9]{7,40}$/;
const ALLOWED_ARTIFACT_FILES = ['decisions.json', 'contract.json'];

describe('artifact-api validation', () => {
  it('SAFE_WINDOW_RE accepts valid window names', () => {
    assert.ok(SAFE_WINDOW_RE.test('sales-order'));
    assert.ok(SAFE_WINDOW_RE.test('business-partner'));
    assert.ok(SAFE_WINDOW_RE.test('uom'));
    assert.ok(SAFE_WINDOW_RE.test('chart-of-accounts'));
  });

  it('SAFE_WINDOW_RE rejects dangerous window names', () => {
    assert.ok(!SAFE_WINDOW_RE.test('../etc'));
    assert.ok(!SAFE_WINDOW_RE.test('foo;rm -rf'));
    assert.ok(!SAFE_WINDOW_RE.test('sales order'));
    assert.ok(!SAFE_WINDOW_RE.test('Sales_Order'));
    assert.ok(!SAFE_WINDOW_RE.test(''));
  });

  it('SAFE_REF_RE accepts valid git hashes', () => {
    assert.ok(SAFE_REF_RE.test('abc1234'));
    assert.ok(SAFE_REF_RE.test('deadbeef'));
    assert.ok(SAFE_REF_RE.test('a'.repeat(40)));
  });

  it('SAFE_REF_RE rejects invalid git refs', () => {
    assert.ok(!SAFE_REF_RE.test('abc123'));   // too short (6 chars)
    assert.ok(!SAFE_REF_RE.test('ABCDEF0'));  // uppercase
    assert.ok(!SAFE_REF_RE.test('abc;rm'));   // injection
    assert.ok(!SAFE_REF_RE.test('main'));     // branch name
    assert.ok(!SAFE_REF_RE.test(''));
  });

  it('ALLOWED_ARTIFACT_FILES whitelist contains exactly 2 files', () => {
    assert.equal(ALLOWED_ARTIFACT_FILES.length, 2);
    assert.ok(ALLOWED_ARTIFACT_FILES.includes('decisions.json'));
    assert.ok(ALLOWED_ARTIFACT_FILES.includes('contract.json'));
  });

  it('ALLOWED_ARTIFACT_FILES rejects unauthorized files', () => {
    assert.ok(!ALLOWED_ARTIFACT_FILES.includes('rules-raw.json'));
    assert.ok(!ALLOWED_ARTIFACT_FILES.includes('processes.json'));
    assert.ok(!ALLOWED_ARTIFACT_FILES.includes('../../../etc/passwd'));
  });
});

describe('artifact-api filesystem', () => {
  it('artifacts directory exists', () => {
    assert.ok(existsSync(ARTIFACTS_DIR), 'artifacts/ dir must exist');
  });

  it('at least one window has artifact files', () => {
    const entries = readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
    const windowsWithArtifacts = entries
      .filter((e) => e.isDirectory())
      .filter((e) => {
        const dir = join(ARTIFACTS_DIR, e.name);
        return ALLOWED_ARTIFACT_FILES.some((f) => existsSync(join(dir, f)));
      });

    assert.ok(windowsWithArtifacts.length > 0, 'Should have at least one window with artifacts');
  });

  it('sales-order has all artifact files', () => {
    const windowDir = join(ARTIFACTS_DIR, 'sales-order');
    for (const f of ALLOWED_ARTIFACT_FILES) {
      assert.ok(existsSync(join(windowDir, f)), `sales-order should have ${f}`);
    }
  });

  it('artifact files are valid JSON', () => {
    const windowDir = join(ARTIFACTS_DIR, 'sales-order');
    for (const f of ALLOWED_ARTIFACT_FILES) {
      const content = readFileSync(join(windowDir, f), 'utf-8');
      assert.doesNotThrow(() => JSON.parse(content), `${f} should be valid JSON`);
    }
  });

  it('window names match SAFE_WINDOW_RE pattern', () => {
    const entries = readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
    // Skip directories starting with _ — those are test fixtures created by parallel test runs.
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('_'));
    for (const d of dirs) {
      assert.ok(SAFE_WINDOW_RE.test(d.name), `Window "${d.name}" should match safe pattern`);
    }
  });
});
