import assert from 'node:assert/strict';
import test from 'node:test';
import { isMergeBlock, selectTests } from '../test-selection.mjs';

test('documentation-only changes select no functional tests', () => {
  const plan = selectTests(['docs/architecture.md', 'README.md']);
  assert.equal(plan.profile, 'none');
  assert.deepEqual(plan.sections, ['docs']);
  assert.deepEqual(plan.commands, []);
});

test('locale changes select locale tests and build', () => {
  const plan = selectTests(['tools/app-shell/src/locales/es_ES.json']);
  assert.equal(plan.profile, 'affected');
  assert.deepEqual(plan.sections, ['build', 'locales']);
  assert.ok(plan.commands.some((command) => command.label === 'Locale tests'));
  assert.ok(plan.commands.some((command) => command.label === 'App-shell build'));
});

test('modified tests run with their native runners', () => {
  const plan = selectTests([
    'tools/app-shell/src/hooks/__tests__/useEntity.vitest.jsx',
    'e2e/tests/flows/purchase-order.mocked.spec.js',
  ]);
  assert.notEqual(plan.profile, 'full');
  assert.equal(plan.e2e, 'e2e-mocked');
  assert.ok(plan.sections.includes('app-shell-vitest'));
  assert.ok(plan.sections.includes('e2e-mocked'));
  assert.equal(plan.commands.some((command) => command.label.includes('Playwright')), false);
});

test('backend contracts require integration Playwright', () => {
  const plan = selectTests(['artifacts/sales-order/decisions.json']);
  assert.equal(plan.e2e, 'e2e-integration');
});

test('repository infrastructure changes use the full fallback', () => {
  const plan = selectTests(['.github/workflows/test.yml']);
  assert.equal(plan.profile, 'full');
  assert.deepEqual(plan.sections, ['full']);
});

test('four broad functional roots use the full fallback', () => {
  const plan = selectTests([
    'tools/app-shell/src/locales/es_ES.json',
    'cli/src/generate-frontend.js',
    'artifacts/sales-order/decisions.json',
    'e2e/tests/flows/sales-order.mocked.spec.js',
  ]);
  assert.equal(plan.profile, 'full');
});

test('merge blocks are detected by label or defensive title', () => {
  assert.equal(isMergeBlock({ title: 'Feature', labels: [{ name: 'merge-block' }] }), true);
  assert.equal(isMergeBlock({ title: 'Feature ETP-4739: Merge Block 30/07', labels: [] }), true);
  assert.equal(isMergeBlock({ title: 'Feature ETP-4739', labels: [] }), false);
});
