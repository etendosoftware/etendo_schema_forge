// ETP-4735 — fetchLines() must populate real pricing (_unitPrice / _lineNetAmount)
// from the sales-order line's own `unitPrice` field, mirroring the pattern
// already used by sales-invoice/custom/ImportFromOrderModal.jsx against the
// exact same sales-order/lines endpoint. Today this file hardcodes both to 0,
// so ImportLinesModal's docTotal (sum of _lineNetAmount over
// `(l._lineNetAmount || 0)`) always renders 0.
//
// Source-contract test (node:test, no DOM): artifacts/**/custom/*.jsx files
// contain JSX and can't be imported by Node's native ESM loader, and
// artifacts/** is outside tools/app-shell/vitest.config.js's `include` scope
// — so, matching every other test under artifacts/*/custom/__tests__/, this
// asserts against the source text rather than invoking fetchLines directly.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromSalesOrderModal.jsx'), 'utf8');

describe('ImportFromSalesOrderModal fetchLines — ETP-4735 pricing', () => {
  it('computes a real unitPrice from the order line, not a hardcoded 0', () => {
    assert.match(
      src,
      /const unitPrice = Number\(l\.unitPrice\) \|\| 0;/,
      'fetchLines should read the real unitPrice off the order line',
    );
  });

  it('sets _unitPrice to the computed unitPrice, not a literal 0', () => {
    assert.match(src, /_unitPrice:\s*unitPrice,/);
  });

  it('sets _lineNetAmount to unitPrice * pending, not a literal 0', () => {
    assert.match(src, /_lineNetAmount:\s*unitPrice \* pending,/);
  });

  it('does not hardcode _unitPrice or _lineNetAmount to 0 anywhere in fetchLines', () => {
    const fnMatch = src.match(/export const fetchLines = async[\s\S]*?\n};\n/);
    assert.ok(fnMatch, 'fetchLines function should be found in source');
    const fnBody = fnMatch[0];
    assert.doesNotMatch(fnBody, /_unitPrice:\s*0,/);
    assert.doesNotMatch(fnBody, /_lineNetAmount:\s*0,/);
  });
});
