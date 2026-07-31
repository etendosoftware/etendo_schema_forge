import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSelectionSummary } from '../print-test-selection-summary.mjs';

test('prints the classification and resulting Playwright action prominently', () => {
  const output = formatSelectionSummary({
    profile: 'affected',
    e2e: 'e2e-integration',
    files: ['artifacts/order/decisions.json'],
    sections: ['artifact-contract'],
    reasons: ['A backend contract changed.'],
    mergeAnalysis: {
      count: 1,
      targetMerges: [],
      foreignMerges: [{ commit: 'merge-sha', parent: 'foreign-sha' }],
    },
  }, { base: 'origin/epic/ETP-3504', head: 'HEAD' });

  assert.match(output, /PRE-PUSH TEST CLASSIFICATION/);
  assert.match(output, /E2E classification: e2e-integration/);
  assert.match(output, /Playwright action:  Run Playwright project: integration/);
  assert.match(output, /Prepared Etendo environment required at BASE_URL/);
  assert.match(output, /Changed files:\s+1/);
  assert.match(output, /Merge analysis:\s+1 foreign\/unknown parent\(s\) -> e2e-full/);
});
