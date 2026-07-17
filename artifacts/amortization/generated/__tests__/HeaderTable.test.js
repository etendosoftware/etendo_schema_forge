import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tableSrc = readFileSync(
  join(__dirname, '..', 'web', 'amortization', 'HeaderTable.jsx'),
  'utf8'
);

const pageSrc = readFileSync(
  join(__dirname, '..', 'web', 'amortization', 'HeaderPage.jsx'),
  'utf8'
);

function extractPostedColumn(source) {
  return source.split('\n').find((l) => l.includes("key: 'posted'")) ?? null;
}

describe('Amortization HeaderTable — posted badge column', () => {
  it('declares a posted column with badge: true', () => {
    const line = extractPostedColumn(tableSrc);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /badge:\s*true/);
  });

  it('declares badgeLabels with both true and false keys', () => {
    const line = extractPostedColumn(tableSrc);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /"true"\s*:/);
    assert.match(line, /"false"\s*:/);
  });

  it('declares badgeVariants with true: "green" and false: "orange"', () => {
    const line = extractPostedColumn(tableSrc);
    assert.ok(line !== null, 'Expected a column with key: "posted"');
    assert.match(line, /"true"\s*:\s*"green"/);
    assert.match(line, /"false"\s*:\s*"orange"/);
  });
});

describe('Amortization HeaderPage — post menuAction', () => {
  it('declares a post menu action with neoAction: "post"', () => {
    assert.match(pageSrc, /neoAction:\s*'post'/);
  });

  it('conditions post visibility on posted being false/unset', () => {
    assert.match(pageSrc, /data\?\.posted/);
  });

  it('does not generate the legacy unpost action', () => {
    assert.doesNotMatch(pageSrc, /key:\s*'unpost'/);
    assert.doesNotMatch(pageSrc, /neoAction:\s*'unpost'/);
  });

  it('reactivate is visible for processed documents and pre-unposts when needed', () => {
    const reactivateLine = pageSrc
      .split('\n')
      .find((l) => l.includes("key: 'reactivate'"));
    assert.ok(reactivateLine, "Expected a menuAction with key: 'reactivate'");
    assert.match(reactivateLine, /preUnpost:\s*true/);
    assert.match(reactivateLine, /columnName:\s*'Processed'/);
    assert.doesNotMatch(reactivateLine, /data\?\.posted/);
    assert.match(reactivateLine, /data\?\.processed === 'Y'\s*\|\|\s*data\?\.processed === true/);
  });

  it('post action is gated on !posted && processed', () => {
    const postLine = pageSrc
      .split('\n')
      .find((l) => l.includes("key: 'post'"));
    assert.ok(postLine, "Expected a menuAction with key: 'post'");
    assert.match(postLine, /neoAction:\s*'post'/);
    assert.match(postLine, /!\(data\?\.posted === 'Y'\s*\|\|\s*data\?\.posted === true\)/);
    assert.match(postLine, /data\?\.processed === 'Y'\s*\|\|\s*data\?\.processed === true/);
  });
});
