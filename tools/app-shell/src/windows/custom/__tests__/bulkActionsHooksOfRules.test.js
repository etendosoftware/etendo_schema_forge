import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ETP-5209 production bug: PurchaseInvoiceBulkAction / SalesInvoiceBulkAction /
// GoodsReceiptBulkAction / GoodsShipmentBulkActions are passed as the
// `bulkActions` render-prop to ListView — but ListView.jsx invokes it as a
// PLAIN FUNCTION CALL (`bulkActions({...})`, inside its own render body, gated
// by `selectedRows.length > 0`), not as JSX (`<bulkActions />`). Any hook
// called inside such a wrapper is dispatched to whichever component is
// CURRENTLY rendering (ListView), but only conditionally — exactly a Rules of
// Hooks violation. That crashed the app to a blank screen ("Rendered more
// hooks than during the previous render") the instant a user selected a row,
// because each of these 4 wrappers used to call `useUI()` itself to build
// `createPostRowFilter(ui)`.
//
// This guard grep-checks each wrapper function's source body for a bare
// `use[A-Z]...(` call and fails if one is found — regardless of whether it
// would be a direct statement or embedded in a JSX expression, since both
// execute synchronously as part of the wrapper's own function body. It is a
// cheap, reliable regression check against this exact bug class re-appearing
// in any of the 4 windows (or a future 5th one copying the pattern).
const WRAPPERS = [
  { file: '../purchase-invoice/index.jsx', fnName: 'PurchaseInvoiceBulkAction' },
  { file: '../sales-invoice/index.jsx', fnName: 'SalesInvoiceBulkAction' },
  { file: '../goods-receipt/index.jsx', fnName: 'GoodsReceiptBulkAction' },
  { file: '../goods-shipment/index.jsx', fnName: 'GoodsShipmentBulkActions' },
];

function extractFunctionBody(src, fnName) {
  const startMatch = src.match(new RegExp(`function ${fnName}\\([^)]*\\)\\s*\\{`));
  assert.ok(startMatch, `could not locate "function ${fnName}(...)" in source`);
  const start = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  assert.ok(depth === 0, `unbalanced braces while scanning function ${fnName}`);
  return src.slice(start, i - 1);
}

describe('ETP-5209 regression guard — bulkActions wrapper functions call no hooks', () => {
  for (const { file, fnName } of WRAPPERS) {
    it(`${fnName} does not call any hook directly (it is invoked by ListView.jsx as a plain function, not JSX)`, () => {
      const src = readFileSync(join(__dirname, file), 'utf8');
      const body = extractFunctionBody(src, fnName);
      const hookCalls = body.match(/\buse[A-Z]\w*\(/g) || [];
      assert.deepEqual(
        hookCalls,
        [],
        `${fnName} must not call hooks directly (ETP-5209) — found: ${hookCalls.join(', ')}. ` +
        'Move any hook call up into the window component and pass the result down as a prop instead.',
      );
    });
  }

  // Sanity check on the guard itself: the extractor must actually find real
  // content, not silently match an empty/adjacent function due to a typo in
  // the WRAPPERS table above.
  it('sanity: each extracted wrapper body is non-trivial (renders at least one BulkDocumentAction)', () => {
    for (const { file, fnName } of WRAPPERS) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      const body = extractFunctionBody(src, fnName);
      assert.match(body, /BulkDocumentAction/, `${fnName} body did not contain BulkDocumentAction — extractor likely mismatched`);
    }
  });
});
