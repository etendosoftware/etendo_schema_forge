import { describe, it, expect } from 'vitest';

import {
  computeDocumentTotals,
  resolveTotalDiscountPct,
  ETGO_DTO_PRODUCT_ID,
} from '../documentTotals.js';

// ─── resolveTotalDiscountPct ────────────────────────────────────────────────
//
// Pure helper that decides whether the panel should apply the
// etgoTotalDiscount factor client-side or use 0 because the ETGO_DTO line
// is already in the line set (ETP-4015 double-discount guard).

describe('resolveTotalDiscountPct', () => {
  it('returns the header discount pct when no ETGO_DTO line is present', () => {
    const data = { etgoTotalDiscount: 5 };
    const lines = [
      { id: '1', product: 'prod-a', lineNetAmount: 44 },
    ];
    expect(resolveTotalDiscountPct(data, lines)).toBe(5);
  });

  it('returns 0 when the ETGO_DTO line is materialised in the line set', () => {
    // Regression guard for ETP-4015: applying the factor on top of a line
    // that already carries the discount would double-count the reduction.
    const data = { etgoTotalDiscount: 5 };
    const lines = [
      { id: '1', product: 'prod-a', lineNetAmount: 44 },
      { id: '2', product: ETGO_DTO_PRODUCT_ID, lineNetAmount: -2.2 },
    ];
    expect(resolveTotalDiscountPct(data, lines)).toBe(0);
  });

  it('returns 0 when there is no discount in the header and no lines', () => {
    expect(resolveTotalDiscountPct({}, [])).toBe(0);
    expect(resolveTotalDiscountPct({}, null)).toBe(0);
    expect(resolveTotalDiscountPct(null, null)).toBe(0);
    expect(resolveTotalDiscountPct(undefined, undefined)).toBe(0);
  });

  it('falls back to the explicit fallback when the header has no discount field', () => {
    // The parent component may pass a different prop when totalsField is empty.
    expect(resolveTotalDiscountPct({}, [], 7)).toBe(7);
  });

  it('prefers the header value over the fallback', () => {
    expect(resolveTotalDiscountPct({ etgoTotalDiscount: 10 }, [], 7)).toBe(10);
  });

  it('honours a custom totalsField', () => {
    const data = { customDiscount: 3 };
    expect(resolveTotalDiscountPct(data, [], 0, 'customDiscount')).toBe(3);
  });

  it('coerces string discount values to a number', () => {
    expect(resolveTotalDiscountPct({ etgoTotalDiscount: '12.5' }, [])).toBe(12.5);
  });

  it('treats null line entries defensively (does not throw)', () => {
    const data = { etgoTotalDiscount: 5 };
    const lines = [null, undefined, { id: '1', product: 'prod-x' }];
    expect(resolveTotalDiscountPct(data, lines)).toBe(5);
  });

  it('matches the ETGO_DTO line by exact id (not by substring)', () => {
    // Defensive: the guard uses === so a product id that merely contains the
    // ETGO_DTO uuid as a substring (or vice versa) must NOT trigger the skip.
    const data = { etgoTotalDiscount: 5 };
    const lines = [
      { id: '1', product: `${ETGO_DTO_PRODUCT_ID}-suffix` },
      { id: '2', product: `prefix-${ETGO_DTO_PRODUCT_ID}` },
    ];
    expect(resolveTotalDiscountPct(data, lines)).toBe(5);
  });

  it('triggers the guard even when the ETGO_DTO line is not first', () => {
    const data = { etgoTotalDiscount: 5 };
    const lines = [
      { id: '1', product: 'prod-a' },
      { id: '2', product: 'prod-b' },
      { id: '3', product: ETGO_DTO_PRODUCT_ID },
    ];
    expect(resolveTotalDiscountPct(data, lines)).toBe(0);
  });
});

// ─── computeDocumentTotals — selected scenarios ─────────────────────────────
//
// Light coverage of the main computation paths. The full behavioural suite
// lives in documentTotals.test.js (node:test runner); this Vitest copy exists
// so the file shows up in the v8 coverage report.

const ORDER_CONFIG = {
  qtyField: 'orderedQuantity',
  priceField: 'listPrice',
  discountField: 'discount',
  grossField: 'lineGrossAmount',
};

describe('computeDocumentTotals (vitest coverage)', () => {
  it('returns NULL_TOTALS when lineConfig is missing', () => {
    const result = computeDocumentTotals([], null, null, null, 0);
    expect(result).toEqual({
      grossSubtotal: null,
      netSubtotal: null,
      grandTotal: null,
      discountAmt: null,
      taxAmt: null,
      totalDiscountAmt: null,
    });
  });

  it('computes the ETP-4015 fixture: 44.00 line + 5% discount → 45.98 grand total', () => {
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 44, discount: 0, lineGrossAmount: 48.40 },
    ];
    const result = computeDocumentTotals(lines, null, null, ORDER_CONFIG, 5);
    expect(result.netSubtotal).toBeCloseTo(44, 2);
    // Subtotal (after total discount) = 44 × 0.95 = 41.80
    // Tax = (48.40 - 44) × 0.95 = 4.18
    // Total = 41.80 + 4.18 = 45.98
    expect(result.grandTotal).toBeCloseTo(45.98, 2);
    expect(result.taxAmt).toBeCloseTo(4.18, 2);
    expect(result.totalDiscountAmt).toBeCloseTo(2.20, 2);
  });

  it('computes correctly when the discount line is already in the line set', () => {
    // pct=0 (the guard caller does this) — discount line carries the reduction.
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 44,   discount: 0, lineGrossAmount: 48.40 },
      { id: '2', orderedQuantity: 1, listPrice: -2.2, discount: 0, lineGrossAmount: -2.42 },
    ];
    const result = computeDocumentTotals(lines, null, null, ORDER_CONFIG, 0);
    expect(result.netSubtotal).toBeCloseTo(41.80, 2);
    expect(result.grandTotal).toBeCloseTo(45.98, 2);
  });

  it('clamps totalDiscountPct to the [0, 100] range', () => {
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 100, discount: 0, lineGrossAmount: 121 },
    ];
    // 200% → clamped to 100% → factor 0 → grandTotal 0 (lines × 0 + tax × 0)
    const overflow = computeDocumentTotals(lines, null, null, ORDER_CONFIG, 200);
    expect(overflow.grandTotal).toBe(0);
    // Negative pct → clamped to 0% → no discount applied → grandTotal = 121
    const negative = computeDocumentTotals(lines, null, null, ORDER_CONFIG, -10);
    expect(negative.grandTotal).toBeCloseTo(121, 2);
  });

  it('respects per-line discount field when computing the net subtotal', () => {
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 100, discount: 10, lineGrossAmount: 108.9 },
    ];
    const result = computeDocumentTotals(lines, null, null, ORDER_CONFIG, 0);
    expect(result.grossSubtotal).toBeCloseTo(100, 2);
    expect(result.netSubtotal).toBeCloseTo(90, 2);
    expect(result.discountAmt).toBeCloseTo(10, 2);
  });

  it('includes the pending line in the live totals', () => {
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 100, discount: 0, lineGrossAmount: 121 },
    ];
    const pending = { orderedQuantity: 2, listPrice: 50, discount: 0, lineGrossAmount: 121 };
    const result = computeDocumentTotals(lines, pending, null, ORDER_CONFIG, 0);
    expect(result.grossSubtotal).toBeCloseTo(200, 2);
    expect(result.netSubtotal).toBeCloseTo(200, 2);
  });

  it('applies the editing line in place of the original (live edit mode)', () => {
    const lines = [
      { id: '1', orderedQuantity: 1, listPrice: 100, discount: 0, lineGrossAmount: 121 },
    ];
    const editing = { id: '1', orderedQuantity: 3, listPrice: 100, discount: 0, lineGrossAmount: 363 };
    const result = computeDocumentTotals(lines, null, editing, ORDER_CONFIG, 0);
    expect(result.grossSubtotal).toBeCloseTo(300, 2);
  });

  it('handles missing optional fields gracefully (no NPE)', () => {
    const lines = [
      { id: '1' /* no qty, no price, no gross */ },
    ];
    const result = computeDocumentTotals(lines, null, null, ORDER_CONFIG, 0);
    // All numbers default to 0 when the field is missing.
    expect(result.grossSubtotal).toBe(0);
    expect(result.netSubtotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });
});
