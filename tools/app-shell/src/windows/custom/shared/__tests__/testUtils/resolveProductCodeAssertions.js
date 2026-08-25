// Shared node:test assertions for the ETP-4941 fix ("CÓD." column must show
// the product SKU, never the line number/index). Reused across
// useInvoicePdf.test.js, useQuotationPdf.test.js, useOrderPdf.test.js and
// usePurchaseOrderPdf.test.js — all read the same shared documentPdf.js
// source (`sharedSrc`) and must lock the same resolveProductCode() contract.
// Centralized here instead of duplicated per file (flagged by Copilot review
// on PR #1191 as duplicated blocks across those four files).

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
