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

  it('renders 100% in green only when pct === 100', () => {
    assert.match(src, /pct === 100.*#10b981/);
  });

  it('renders bar at 0% instead of hiding it when pct is 0', () => {
    assert.doesNotMatch(src, /pct == null \|\| pct === 0/);
    assert.match(src, /pct == null/);
  });
});

