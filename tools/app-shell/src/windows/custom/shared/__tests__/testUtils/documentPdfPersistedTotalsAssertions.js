// Shared node:test assertion for the ETP-4777 fix, reused by useOrderPdf.test.js
// and usePurchaseOrderPdf.test.js — both read the same shared documentPdf.js
// source (`sharedSrc`) and must lock the same persisted-header tax derivation
// in buildOrderData(). Centralized here instead of duplicated in both files.
export function assertPersistedTaxDerivation(assert, sharedSrc) {
  // taxAmt from computeDocumentTotals is a live client-side recompute that can
  // diverge from the backend-persisted grandTotal/summedLineAmount (rounding
  // differences between the frontend and the C_ORDERLINE_TRG2 trigger). The
  // printed PDF must match what the Form panel and Grid show, so it derives
  // tax from the persisted header fields instead.
  assert.match(sharedSrc, /const taxAmount = grandTotal - netAmount/);
}
