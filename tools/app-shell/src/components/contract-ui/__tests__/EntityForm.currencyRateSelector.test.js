// Source-reading test for isCurrencyRateSelectorField (ETP-4029).
//
// The function is module-private (no `export` keyword) and EntityForm.jsx has
// a heavy dependency tree impractical to mount just to reach this predicate.
// Per the test_strategy decision tree this is a cheap, high-value regression
// guard: it locks in that sales-invoice/purchase-invoice were added to the
// window alternation alongside the pre-existing order/quotation windows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'EntityForm.jsx'), 'utf8');

describe('isCurrencyRateSelectorField (source-reading)', () => {
  it('is not exported — testability gap, verified by reading the module (no `export` keyword)', () => {
    assert.doesNotMatch(src, /export function isCurrencyRateSelectorField/);
    assert.match(src, /(?<!export )function isCurrencyRateSelectorField\(/);
  });

  it('matches only the C_Currency_ID column', () => {
    assert.match(src, /f\.column === 'C_Currency_ID'/);
  });

  it('restricts to header/quotation entities', () => {
    assert.match(src, /entity === 'header' \|\| entity === 'quotation'/);
  });

  it('the apiBaseUrl window alternation includes sales-invoice and purchase-invoice alongside the pre-existing order\\/quotation windows', () => {
    const fnMatch = src.match(/function isCurrencyRateSelectorField\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'expected to find isCurrencyRateSelectorField function body');
    const fnBody = fnMatch[0];
    assert.match(
      fnBody,
      /\/\\\/\(sales-order\|purchase-order\|sales-quotation\|sales-invoice\|purchase-invoice\)\(\\\/\|\$\)\//,
    );
  });
});
