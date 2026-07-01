import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '..', 'web', 'financial-account', 'TransactionTable.jsx'),
  'utf8'
);

// Parse the columns array literal from source so we can do structural assertions
// without executing the module (which has aliased imports that Node can't resolve).
function extractPostedColumn(source) {
  // Find the line containing key: 'posted'
  const line = source.split('\n').find((l) => l.includes("key: 'posted'"));
  return line ?? null;
}

describe('TransactionTable — posted badge column', () => {
  it('declares a posted column with badge: true', () => {
    const line = extractPostedColumn(src);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /badge:\s*true/);
  });

  it('declares badgeLabels with both true and false keys', () => {
    const line = extractPostedColumn(src);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /"true"\s*:/);
    assert.match(line, /"false"\s*:/);
  });

  it('declares badgeVariants with true: "green" and false: "orange"', () => {
    const line = extractPostedColumn(src);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /"true"\s*:\s*"green"/);
    assert.match(line, /"false"\s*:\s*"orange"/);
  });
});
