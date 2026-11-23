// @covers tools/app-shell/vite-plugins/report-api.js
// ETP-6239: the dev engine's `ids` lookup mirrors ReportSelectorsServlet (the middleware needs a DB, so this reads the source).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../vite-plugins/report-api.js', import.meta.url), 'utf8');

test('ids: invalid ids are dropped one by one with the servlet charset, not the whole list', () => {
  assert.match(src, /\.filter\(\(i\) => \/\^\[0-9A-Fa-f-\]\{1,36\}\$\/\.test\(i\)\)\.slice\(0, 100\)/);
  assert.doesNotMatch(src, /idList\.some\(/);
});

test('ids: ignores isactive like the servlet, and only for bpartner/product', () => {
  assert.match(src, /byIds \? queryCfg\.fromWhere\.replace\("isactive='Y'", '1=1'\)/);
  assert.match(src, /type !== 'bpartner' && type !== 'product' && type !== 'product-all'/);
});

// ETP-6080: product-all is the product query without the stock clause, which stays product-only.
test('product-all shares the product query and skips the stock EXISTS block', () => {
  assert.match(src, /'product': productQuery,/);
  assert.match(src, /'product-all': productQuery,/);
  assert.match(src, /if \(type === 'product'\) \{/);
  assert.doesNotMatch(src, /type === 'product-all'/);
});
