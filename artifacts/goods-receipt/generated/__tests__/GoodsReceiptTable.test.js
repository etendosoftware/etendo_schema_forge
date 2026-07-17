import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tableSrc = readFileSync(
  join(__dirname, '..', 'web', 'goods-receipt', 'GoodsReceiptTable.jsx'),
  'utf8'
);

const pageSrc = readFileSync(
  join(__dirname, '..', 'web', 'goods-receipt', 'GoodsReceiptPage.jsx'),
  'utf8'
);

function extractPostedColumn(source) {
  return source.split('\n').find((l) => l.includes("key: 'posted'")) ?? null;
}

describe('Goods Receipt GoodsReceiptTable — posted badge column', () => {
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

describe('Goods Receipt GoodsReceiptPage — post and unpost menuActions', () => {
  it('declares a post menu action with neoAction: "post"', () => {
    assert.match(pageSrc, /neoAction:\s*'post'/);
  });

  it('conditions post visibility on posted being false/unset', () => {
    assert.match(pageSrc, /data\?\.posted/);
  });

  it('declares an independent unpost action with neoAction: "unpost"', () => {
    assert.match(pageSrc, /neoAction:\s*'unpost'/);
  });

  it('unpost action has key: "unpost"', () => {
    assert.match(pageSrc, /key:\s*'unpost'/);
  });
});
