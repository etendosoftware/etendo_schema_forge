import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyE2E } from '../e2e-selection-rules.mjs';

const pr = (title, files, extra = {}) => ({ title, files, base: 'epic/ETP-3504', ...extra });

test('docs, dependencies, locales and unit tests do not require E2E', () => {
  assert.equal(classifyE2E(pr('Document behavior', ['docs/guide.md'])).classification, 'no-e2e');
  assert.equal(classifyE2E(pr('Bump package', ['package.json', 'package-lock.json'])).classification, 'no-e2e');
  assert.equal(classifyE2E(pr('Rename labels', ['tools/app-shell/src/locales/es_ES.json'])).classification, 'no-e2e');
});

test('mocked and integration specs keep their native E2E class', () => {
  assert.equal(classifyE2E(pr('Change test', ['e2e/tests/flows/order.mocked.spec.js'])).classification, 'e2e-mocked');
  assert.equal(classifyE2E(pr('Change test', ['e2e/tests/flows/order.integration.spec.js'])).classification, 'e2e-integration');
});

test('observable form changes require mocked E2E', () => {
  assert.equal(classifyE2E(pr('Fix modal visibility', ['tools/app-shell/src/windows/custom/order/EditModal.jsx'])).classification, 'e2e-mocked');
});

test('persistence and backend-dependent changes require integration E2E', () => {
  assert.equal(classifyE2E(pr('Save backend defaults', ['artifacts/order/decisions.json'])).classification, 'e2e-integration');
  assert.equal(classifyE2E(pr('', ['artifacts/order/decisions.json'])).classification, 'e2e-integration');
});

test('E2E infrastructure, develop boundaries and broad diffs require full E2E', () => {
  assert.equal(classifyE2E(pr('Helpers', ['e2e/tests/helpers/auth.js'])).classification, 'e2e-full');
  assert.equal(classifyE2E(pr('Rollup', ['README.md'], { base: 'develop' })).classification, 'e2e-full');
  assert.equal(classifyE2E(pr('Broad', Array.from({ length: 100 }, (_, index) => `docs/${index}.md`))).classification, 'e2e-full');
});
