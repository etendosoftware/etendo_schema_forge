// Shared node:test assertions for the ETP-4941 fix ("CÓD." column must show
// the product SKU, never the line number/index). Reused across
// useInvoicePdf.test.js, useQuotationPdf.test.js, useOrderPdf.test.js and
// usePurchaseOrderPdf.test.js — all read the same shared documentPdf.js
// source (`sharedSrc`) and must lock the same resolveProductCode() contract.
// Centralized here instead of duplicated per file (flagged by Copilot review
// on PR #1191 as duplicated blocks across those four files).
//
// Copilot re-flagged duplication AFTER that first extraction because the
// `it(...)` test-case wrappers themselves (title + leading comment) were
// still copy-pasted verbatim in every file, even though the assertion
// *bodies* were shared. `registerResolveProductCodeHookTests` /
// `registerResolveProductCodeSharedTests` below register the full `it(...)`
// blocks directly (mirroring the `sendActionGatingCases.js` precedent, which
// does the same for vitest), so each call site now has ONE line instead of a
// duplicated 2-3 test block.
import { it } from 'node:test';

// Asserts that the hook's own source maps productCode through the shared
// resolveProductCode() helper (imported from documentPdf.js). Used by
// useInvoicePdf.test.js and useQuotationPdf.test.js, whose hooks build lines
// inline (unlike useOrderPdf/usePurchaseOrderPdf, which delegate entirely to
// the shared buildOrderData() — see assertProductCodeMappedInSharedSource).
export function assertProductCodeMappedInHookSource(assert, src) {
  assert.match(src, /productCode: resolveProductCode\(l\)/);
  assert.match(src, /resolveProductCode/, 'imports resolveProductCode from documentPdf.js');
}

// Asserts that productCode is mapped via the shared resolveProductCode()
// helper inside the shared documentPdf.js source (`sharedSrc`). Used by
// useOrderPdf.test.js and usePurchaseOrderPdf.test.js, which delegate line
// building entirely to buildOrderData() in documentPdf.js.
export function assertProductCodeMappedInSharedSource(assert, sharedSrc) {
  assert.match(sharedSrc, /productCode: resolveProductCode\(l\)/);
}

// Asserts the resolveProductCode() implementation itself: falls back to '—'
// (never the line index/position) when neither productCode nor
// product$_value is available — the core AC of ETP-4941. Pass
// `checkNoLineIndexFallback: true` to also assert the old buggy
// `String(idx...)` fallback is gone from the vicinity of the function.
export function assertResolveProductCodeFallsBackToDash(assert, sharedSrc, { checkNoLineIndexFallback = false } = {}) {
  assert.match(
    sharedSrc,
    /function resolveProductCode\(line\)\s*\{\s*return line\.productCode \|\| line\['product\$_value'\] \|\| '—';/
  );
  if (checkNoLineIndexFallback) {
    assert.doesNotMatch(sharedSrc, /resolveProductCode[\s\S]{0,120}String\(idx/);
  }
}

// Asserts the printed template's "CÓD." column renders productCode, not
// lineNo. Used by useOrderPdf.test.js and usePurchaseOrderPdf.test.js, which
// both assert against the shared DOCUMENT_TEMPLATE in documentPdf.js.
export function assertCodeColumnRendersProductCode(assert, sharedSrc) {
  assert.match(sharedSrc, /<td class="code">\{\{this\.productCode\}\}<\/td>/);
  assert.doesNotMatch(sharedSrc, /<td class="code">\{\{this\.lineNo\}\}<\/td>/);
}

// Registers the 2-test ETP-4941 block for hooks that build lines inline
// (useInvoicePdf, useQuotationPdf): "maps productCode via the shared helper"
// (asserted against the hook's own source) + "falls back to dash" (asserted
// against the shared documentPdf.js source). Call once, at the same spot the
// two duplicated `it()` blocks used to sit, inside the enclosing
// `describe('discount breakdown', ...)`.
export function registerResolveProductCodeHookTests(assert, src, sharedSrc) {
  // ETP-4941 — the printed "CÓD." column must show the product SKU
  // (product$_value), not the line number.
  it('ETP-4941: maps productCode via the shared resolveProductCode helper', () => {
    assertProductCodeMappedInHookSource(assert, src);
  });

  it('ETP-4941: resolveProductCode falls back to "—" (never the line index) when no SKU is available', () => {
    // AC: a product with no SKU must render an empty/em-dash cell, not a digit
    // indistinguishable from the original line-number bug.
    assertResolveProductCodeFallsBackToDash(assert, sharedSrc);
  });
}

// Registers the 3-test ETP-4941 block for hooks that delegate line building
// entirely to the shared buildOrderData() (useOrderPdf, usePurchaseOrderPdf):
// "maps productCode" + "falls back to dash" (with the line-index-fallback
// check enabled) + "renders productCode, not lineNo, in the code column" —
// all asserted against the shared documentPdf.js source. Call once, at the
// same spot the three duplicated `it()` blocks used to sit.
export function registerResolveProductCodeSharedTests(assert, sharedSrc) {
  // ETP-4941 — the printed "CÓD." column must show the product SKU
  // (product$_value), not the line number. Shared buildOrderData/template.
  it('ETP-4941: maps productCode via the shared resolveProductCode helper', () => {
    assertProductCodeMappedInSharedSource(assert, sharedSrc);
  });

  it('ETP-4941: resolveProductCode falls back to "—" (never the line index) when no SKU is available', () => {
    // AC: a product with no SKU must render an empty/em-dash cell, not a digit
    // indistinguishable from the original line-number bug.
    assertResolveProductCodeFallsBackToDash(assert, sharedSrc, { checkNoLineIndexFallback: true });
  });

  it('ETP-4941: renders productCode (not lineNo) in the code column', () => {
    assertCodeColumnRendersProductCode(assert, sharedSrc);
  });
}
