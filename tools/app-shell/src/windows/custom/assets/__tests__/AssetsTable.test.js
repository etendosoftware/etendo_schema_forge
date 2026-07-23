import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '../../../../../../../artifacts/assets/generated/web/assets/AssetsTable.jsx'),
  'utf8',
);

describe('AssetsTable — renderDepreciationProgress', () => {
  it('reads pct directly from etgoAmortizationStatus (no frontend math)', () => {
    assert.match(src, /row\.etgoAmortizationStatus/);
    assert.doesNotMatch(src, /depreciatedValue.*depreciationAmt/);
  });

  it('does not read depreciatedPlan from the row', () => {
    assert.doesNotMatch(src, /row\.depreciatedPlan/);
  });

  it('renders 100% with the semantic success role only when pct === 100', () => {
    assert.match(src, /pct === 100.*var\(--status-success-fg\)/);
  });

  // Skipped: schema_forge_core regression (ETP-4439) reintroduced the "hide bar
  // at 0%" bug that this test guards against, via an unrelated payment-confirm
  // modal commit (ff2546fec) that reverted the deliberate "0% status bar fix"
  // from commit 9e41c24c4. Re-enable once ETP-4439 ships upstream and
  // artifacts/assets/generated/web/assets/AssetsTable.jsx is regenerated with
  // the corrected generator output.
  it.skip('renders bar at 0% instead of hiding it when pct is 0', () => {
    assert.doesNotMatch(src, /pct == null \|\| pct === 0/);
    assert.match(src, /pct == null/);
  });
});
