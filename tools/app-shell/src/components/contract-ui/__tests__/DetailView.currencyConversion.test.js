// Source-reading tests for the currency-conversion fix (ETP-4029) and the
// documentDateField generalization inside DetailView.jsx.
//
// `applyProductCurrencyConversion` is a module-private helper (not exported,
// confirmed by reading the file — no `export` keyword precedes its
// declaration and there is no re-export elsewhere in the module). DetailView.jsx
// is ~4650 lines with a very heavy dependency tree (router, many hooks,
// sub-components); importing it directly to reach this private function is not
// practical, and ES module named exports of non-exported functions are
// `undefined` on import. Per the test_strategy decision tree, this warrants a
// source-reading regression test rather than a full component render.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

function extractFunctionBody(source, functionName) {
  const startMatch = source.match(new RegExp(`function ${functionName}\\([^)]*\\)\\s*\\{`));
  assert.ok(startMatch, `expected to find function ${functionName} declaration`);
  const startIdx = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = startIdx;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(startMatch.index, i);
}

describe('applyProductCurrencyConversion (source-reading)', () => {
  it('is not exported — testability gap, verified by reading the module (no `export` keyword)', () => {
    assert.doesNotMatch(src, /export function applyProductCurrencyConversion/);
    assert.match(src, /(?<!export )function applyProductCurrencyConversion\(/);
  });

  const fnBody = extractFunctionBody(src, 'applyProductCurrencyConversion');

  // The guard "only converts when the field is the price-trigger field AND a
  // conversion is active" used to be pinned here by regex-matching the literal
  // `if (field !== 'product' || !activeCurrencyConversion) return;`. That pinned
  // syntax rather than behaviour and blocked making the trigger field
  // configurable, so it now lives as a real behavioural assertion in
  // DetailView.currencyConversionBehavior.vitest.jsx, which drives the component's
  // callout flow and fails if either half of the guard is dropped.

  it('guards the price conversion on rate !== 1 (no-op conversion is skipped)', () => {
    assert.match(fnBody, /if \(rawPrice > 0 && rate !== 1\)/);
  });

  it('converts the configured priceField using the rate', () => {
    assert.match(fnBody, /const convertedPrice = parseFloat\(\(rawPrice \* rate\)\.toFixed\(2\)\);/);
    assert.match(fnBody, /result\[lineConfig\.priceField\] = convertedPrice;/);
  });

  it('resets lineNetAmount to null immediately before calling computeLineGrossAmount (the bug fix)', () => {
    // Anchor: the reset line must appear inside the rate !== 1 branch and
    // immediately precede the computeLineGrossAmount(...) call — this is the
    // exact fix that makes the null-guard in computeLineGrossAmount recompute
    // lineNetAmount from the CONVERTED price instead of leaving it stale.
    assert.match(
      fnBody,
      /result\.lineNetAmount = null;\s*\n\s*computeLineGrossAmount\(/,
    );
  });

  it('calls computeLineGrossAmount with the converted price merged into the row/result snapshot', () => {
    assert.match(fnBody, /computeLineGrossAmount\(lineConfig\.priceField, convertedPrice, result, \{/);
    assert.match(fnBody, /\.\.\.rowValues,/);
    assert.match(fnBody, /\.\.\.result,/);
    assert.match(fnBody, /\[lineConfig\.priceField\]: convertedPrice,/);
  });

  it('propagates the converted price to standardPrice/unitPrice/listPrice only when already present', () => {
    assert.match(fnBody, /if \(result\.standardPrice != null\) result\.standardPrice = convertedPrice;/);
    assert.match(fnBody, /if \(result\.unitPrice != null\) result\.unitPrice = convertedPrice;/);
    assert.match(fnBody, /if \(result\.listPrice != null\) result\.listPrice = convertedPrice;/);
  });
});

describe('documentDateField prop (source-reading)', () => {
  it('defaults to "orderDate" for backward compatibility', () => {
    assert.match(src, /documentDateField = 'orderDate',/);
  });

  it('the saved-state currency-sync effect reads the document date dynamically (not hardcoded .orderDate)', () => {
    assert.match(src, /const orderDate = hook\.selected\?\.\[documentDateField\];/);
  });

  it('the saved-state currency-sync effect dependency array includes the dynamic date and documentDateField itself', () => {
    assert.match(
      src,
      /\[recordId, hook\.selected\?\.currency, hook\.selected\?\.eTGOCurrencyRate, hook\.selected\?\.\[documentDateField\], apiBaseUrl, token, documentDateField\]/,
    );
  });

  it('the currency-change validator reads the document date dynamically from selected or editing state', () => {
    assert.match(
      src,
      /const orderDate = hook\.selected\?\.\[documentDateField\] \?\? hook\.editing\?\.\[documentDateField\];/,
    );
  });

  it('the currency-change validator callback dependency array includes documentDateField', () => {
    assert.match(
      src,
      /\[hook\.handleChange, hook\.editing, hook\.selected, executeCallout, apiBaseUrl, token, ui, documentDateField\]/,
    );
  });

  it('does not read a hardcoded .orderDate off hook.selected or hook.editing anywhere in the module', () => {
    // The dynamic bracket-access form (hook.selected?.[documentDateField]) is
    // exempt from this check — only the literal dot-access form would indicate
    // a site that was missed when generalizing away from the orders-only assumption.
    assert.doesNotMatch(src, /hook\.selected\?\.orderDate\b/);
    assert.doesNotMatch(src, /hook\.editing\?\.orderDate\b/);
  });
});
