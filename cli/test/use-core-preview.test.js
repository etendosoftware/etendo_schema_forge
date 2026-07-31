import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseVersions,
  sanitizeBranchId,
  selectLatestPreview,
} from '../../scripts/use-core-preview.mjs';

test('sanitizeBranchId matches the Core preview publisher convention', () => {
  assert.equal(sanitizeBranchId('feature/ETP-4730'), 'feature-ETP-4730');
  assert.equal(sanitizeBranchId('feature/foo.bar_baz'), 'feature-foo-bar-baz');
});

test('selectLatestPreview selects the newest timestamp for the current branch', () => {
  const versions = [
    '0.3.24-preview.feature-ETP-4730.20260730110000.1111111',
    '0.3.24-preview.feature-ETP-4752.20260731180000.2222222',
    '0.3.24-preview.feature-ETP-4730.20260731171859.7e5b670',
    '0.3.24',
  ];
  assert.equal(
    selectLatestPreview(versions, 'feature/ETP-4730'),
    '0.3.24-preview.feature-ETP-4730.20260731171859.7e5b670',
  );
});

test('selectLatestPreview returns null when the branch has no published preview', () => {
  assert.equal(selectLatestPreview(['0.3.24'], 'feature/ETP-9999'), null);
});

test('parseVersions accepts npm view array and scalar output', () => {
  assert.deepEqual(parseVersions('["0.3.23","0.3.24"]'), ['0.3.23', '0.3.24']);
  assert.deepEqual(parseVersions('"0.3.24"'), ['0.3.24']);
});
