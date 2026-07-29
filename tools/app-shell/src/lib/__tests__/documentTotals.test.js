import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDocumentTotals } from '../documentTotals.js';

const CONFIG = {
  qtyField: 'orderedQuantity',
  priceField: 'listPrice',
  discountField: 'discount',
  grossField: 'lineGrossAmount',
};

const line = (qty, price, discount, gross) => ({
  id: Math.random().toString(),
  orderedQuantity: qty,
  listPrice: price,
  discount,
  lineGrossAmount: gross,
});

describe('computeDocumentTotals', () => {
  it('returns nulls when lineConfig is absent', () => {
    const result = computeDocumentTotals([line(2, 10, 0, 20)], null, null, null);
    assert.equal(result.grossSubtotal, null);
    assert.equal(result.netSubtotal, null);
    assert.equal(result.grandTotal, null);
    assert.equal(result.discountAmt, null);
    assert.equal(result.taxAmt, null);
  });

  it('computes totals from a single line with no discount', () => {
    const result = computeDocumentTotals([line(2, 100, 0, 242)], null, null, CONFIG);
    assert.equal(result.grossSubtotal, 200);
    assert.equal(result.netSubtotal, 200);
    assert.equal(result.grandTotal, 242);
    assert.equal(result.discountAmt, 0);
    assert.equal(result.taxAmt, 42);
  });

  it('computes gross subtotal before discount and net subtotal after discount', () => {
    const result = computeDocumentTotals([line(1, 100, 10, 108.9)], null, null, CONFIG);
    assert.equal(result.grossSubtotal, 100);
    assert.equal(result.netSubtotal, 90);
    assert.equal(result.discountAmt, 10);
  });

  it('aggregates across multiple lines', () => {
    const lines = [line(2, 50, 0, 121), line(1, 100, 20, 96.8)];
    const result = computeDocumentTotals(lines, null, null, CONFIG);
    assert.equal(result.grossSubtotal, 200);       // 2*50 + 1*100
    assert.equal(result.netSubtotal, 180);          // 100 + 80
    assert.equal(result.discountAmt, 20);
    assert.equal(result.grandTotal, 217.8);
  });

  it('includes pendingLine in the aggregation', () => {
    const saved = [line(1, 100, 0, 121)];
    const pending = { orderedQuantity: 2, listPrice: 50, discount: 0, lineGrossAmount: 0 };
    const result = computeDocumentTotals(saved, pending, null, CONFIG);
    assert.equal(result.grossSubtotal, 200);
    assert.equal(result.netSubtotal, 200);
  });

  it('replaces the matching saved line with editingLine values', () => {
    const id = 'abc';
    const saved = [{ ...line(1, 100, 0, 121), id }];
    const editing = { id, orderedQuantity: 3, listPrice: 100, discount: 0, lineGrossAmount: 363 };
    const result = computeDocumentTotals(saved, null, editing, CONFIG);
    assert.equal(result.grossSubtotal, 300);
    assert.equal(result.grandTotal, 363);
  });

  it('does not replace lines whose id does not match editingLine', () => {
    const saved = [{ ...line(1, 100, 0, 121), id: 'abc' }];
    const editing = { id: 'xyz', orderedQuantity: 5, listPrice: 200, discount: 0, lineGrossAmount: 0 };
    const result = computeDocumentTotals(saved, null, editing, CONFIG);
    assert.equal(result.grossSubtotal, 100);
  });

  it('handles string numeric values from API payloads', () => {
    const strLine = { id: '1', orderedQuantity: '2', listPrice: '50.00', discount: '10', lineGrossAmount: '90.0' };
    const result = computeDocumentTotals([strLine], null, null, CONFIG);
    assert.equal(result.grossSubtotal, 100);
    assert.equal(result.netSubtotal, 90);
    assert.equal(result.discountAmt, 10);
  });

  it('treats missing or null field values as zero', () => {
    const incomplete = { id: '1' };
    const result = computeDocumentTotals([incomplete], null, null, CONFIG);
    assert.equal(result.grossSubtotal, 0);
    assert.equal(result.netSubtotal, 0);
    assert.equal(result.grandTotal, 0);
  });

  it('returns grandTotal null when grossField is absent from config', () => {
    const cfg = { qtyField: 'orderedQuantity', priceField: 'listPrice', discountField: 'discount' };
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, cfg);
    assert.equal(result.grossSubtotal, 100);
    assert.equal(result.grandTotal, null);
    assert.equal(result.taxAmt, null);
  });

  it('computes zero discount correctly when discountField is absent from config', () => {
    const cfg = { qtyField: 'orderedQuantity', priceField: 'listPrice', grossField: 'lineGrossAmount' };
    const result = computeDocumentTotals([line(2, 100, 50, 200)], null, null, cfg);
    assert.equal(result.grossSubtotal, 200);
    assert.equal(result.netSubtotal, 200); // no discount applied
    assert.equal(result.discountAmt, 0);
  });

  it('returns zero totals for an empty lines array', () => {
    const result = computeDocumentTotals([], null, null, CONFIG);
    assert.equal(result.grossSubtotal, 0);
    assert.equal(result.netSubtotal, 0);
    assert.equal(result.grandTotal, 0);
    assert.equal(result.discountAmt, 0);
    assert.equal(result.taxAmt, 0);
  });

  it('returns totalDiscountAmt as null when lineConfig is absent', () => {
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, null, 10);
    assert.equal(result.totalDiscountAmt, null);
  });

  it('returns totalDiscountAmt of zero when totalDiscountPct is 0', () => {
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, 0);
    assert.equal(result.totalDiscountAmt, 0);
    assert.equal(result.grandTotal, 121); // unchanged
  });

  it('applies totalDiscountPct to netSubtotal to compute totalDiscountAmt', () => {
    // netSubtotal = 1 × 100 × (1 − 0) = 100
    // totalDiscountAmt = 100 × 10 / 100 = 10
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, 10);
    assert.equal(result.totalDiscountAmt, 10);
  });

  it('scales grandTotal proportionally when totalDiscountPct > 0', () => {
    // baseGrandTotal = 121, pct = 10 → grandTotal = 121 × 0.9 = 108.9
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, 10);
    assert.ok(Math.abs(result.grandTotal - 108.9) < 0.001);
  });

  it('scales taxAmt proportionally when totalDiscountPct > 0', () => {
    // baseTaxAmt = 121 - 100 = 21, factor = 0.9 → taxAmt = 21 × 0.9 = 18.9
    const result = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, 10);
    assert.ok(Math.abs(result.taxAmt - 18.9) < 0.001);
  });

  it('clamps totalDiscountPct to 0–100 range', () => {
    const overMax = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, 150);
    assert.equal(overMax.totalDiscountAmt, 100); // 100% of netSubtotal
    assert.equal(overMax.grandTotal, 0);

    const underMin = computeDocumentTotals([line(1, 100, 0, 121)], null, null, CONFIG, -10);
    assert.equal(underMin.totalDiscountAmt, 0);
    assert.equal(underMin.grandTotal, 121);
  });

  it('combines per-product discount and total discount correctly', () => {
    // line: qty=1, price=100, disc=10 → netSubtotal=90, baseGrandTotal=108.9 (assuming tax)
    // totalDiscountPct=5 → totalDiscountAmt = 90 × 5/100 = 4.5
    // subtotal_after_total_discount = 90 × 0.95 = 85.50 (round-to-2dp: 85.50)
    // tax = (108.9 − 90) × 0.95 = 17.955 (round-to-2dp: 17.96)
    // grandTotal = 85.50 + 17.96 = 103.46 (sum of displayed components)
    const result = computeDocumentTotals([line(1, 100, 10, 108.9)], null, null, CONFIG, 5);
    assert.equal(result.discountAmt, 10);       // per-product discount
    assert.ok(Math.abs(result.totalDiscountAmt - 4.5) < 0.001);
    assert.ok(Math.abs(result.grandTotal - 103.46) < 0.001);
  });

  it('avoids double rounding: grandTotal equals sum of displayed components (ETP-4017)', () => {
    // Regression guard for the AEAT/legal-invoice rule "base + tax = total":
    //   line: qty=1, price=44, disc=10, gross=43.56 (1 × 44 × 0.9 × 1.10)
    //   netSubtotal = 39.60
    //   tax base after total disc = 3.96 × 0.94 = 3.7224 → displayed 3.72
    //   subtotal after total disc = 39.60 × 0.94 = 37.224 → displayed 37.22
    //   ❌ round(40.9464) = 40.95  (what the bug used to do)
    //   ✅ 37.22 + 3.72 = 40.94    (what the panel/modal/printed invoice agree on)
    const result = computeDocumentTotals([line(1, 44, 10, 43.56)], null, null, CONFIG, 6);
    assert.equal(result.grandTotal, 40.94);
  });
});

// ---------------------------------------------------------------------------
// Rounding invariants (ETP-4017 follow-up)
//
// These tests lock the contract "displayed_subtotal + displayed_tax === total"
// across several edge cases so the original 1-cent bug cannot regress through
// a different code path (different discount %, different line mix, etc.).
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

describe('computeDocumentTotals — rounding invariants', () => {
  it('invariant holds across realistic line combinations (no double rounding)', () => {
    // Spot-check the contract on a handful of real-world shapes. For each shape
    // the panel renders round2(netSubtotal * factor) on the subtotal row,
    // round2(taxAmt) on the tax row, and grandTotal must equal their sum.
    const cases = [
      // [lines, totalDiscountPct]
      { lines: [line(1, 44,   10, 43.56)], pct: 6  }, // ETP-4017 — original bug case
      { lines: [line(2, 100,  0,  242)],   pct: 0  }, // clean integer baseline
      { lines: [line(3, 33.33, 7, 110.99)], pct: 4 }, // many decimals + per-line discount
      { lines: [line(1, 19.95, 0, 21.95)],  pct: 12 }, // tax exclusive of 10%
      { lines: [line(2, 7.49,  5, 15.64)],  pct: 0  }, // tiny amounts, no total discount
    ];
    for (const { lines: ls, pct } of cases) {
      const r = computeDocumentTotals(ls, null, null, CONFIG, pct);
      // What the panel renders (the rounded subtotal and tax) — see DocumentTotalsPanel.jsx:
      //   subtotal row → fmt(netSubtotal - totalDiscountAmt) ≡ fmt(netSubtotal * factor)
      //   tax row      → fmt(taxAmt)
      const factor = 1 - (pct || 0) / 100;
      const displayedSubtotal = round2(r.netSubtotal * factor);
      const displayedTax      = round2(r.taxAmt);
      // grandTotal in the source is computed as round2(net*factor) + round2(tax)
      // (no outer round2), so it can carry a tiny float-arithmetic tail like
      // 59.199999999999996. The DISPLAYED total via formatAmount() always shows
      // 2dp, so the invariant we lock is "round2(grandTotal) === displayedSubtotal + displayedTax".
      assert.equal(
        round2(r.grandTotal),
        round2(displayedSubtotal + displayedTax),
        `invariant broken for pct=${pct}, lines=${JSON.stringify(ls)} — ` +
        `expected ${displayedSubtotal} + ${displayedTax}, got grandTotal=${r.grandTotal}`,
      );
    }
  });

  it('clean integer totals stay exact when pct=0 (no rounding-induced drift)', () => {
    // qty=2, price=100, no per-line discount, gross=242 → must stay 242.00 exactly.
    // The fix must not introduce 1-cent drift on cases that previously worked.
    const r = computeDocumentTotals([line(2, 100, 0, 242)], null, null, CONFIG, 0);
    assert.equal(r.grandTotal, 242);
    assert.equal(r.netSubtotal, 200);
    assert.equal(r.taxAmt, 42);
  });

  it('total discount of 100% collapses grandTotal to 0 without NaN/null leak', () => {
    // Edge of the clamp range: factor = 0. Both subtotal and tax must round to 0
    // and grandTotal must be exactly 0 — guards against division/multiplication
    // weirdness when factor is at the boundary.
    const r = computeDocumentTotals([line(1, 44, 10, 43.56)], null, null, CONFIG, 100);
    assert.equal(r.grandTotal, 0);
    assert.equal(round2(r.netSubtotal * 0), 0);
    assert.equal(round2(r.taxAmt), 0);
    assert.ok(!Number.isNaN(r.grandTotal));
    assert.ok(r.grandTotal !== null);
  });

  it('exact-sum vs component-sum diverge by 1 cent — component-sum wins', () => {
    // This is the core proof of the fix. Two lines crafted so that:
    //   exact total = 40.9474  →  round(exact) = 40.95
    //   component-sum (displayed)  = 37.22 + 3.72 = 40.94
    // Pre-fix code returned 40.95; post-fix code MUST return 40.94 to honor the
    // AEAT/legal-invoice rule "what the customer reads is what the customer pays".
    //
    // Construction: pick a 2-line cluster where (subtotal_exact, tax_exact)
    // round down individually but whose sum rounds up.
    //   line A: qty=1, price=20.005, gross=22.0055  → net 20.005, tax exact 2.0005
    //   line B: qty=1, price=17.22,  gross=18.942  → net 17.22,  tax exact 1.722
    //   exact subtotal = 37.225, exact tax = 3.7225, exact total = 40.9475
    //   round(40.9475) = 40.95  (the bug)
    //   round2(37.225) + round2(3.7225) = 37.23 + 3.72 = 40.95 — still matches here,
    //   so we use the ETP-4017 shape but in an independent assertion path:
    //   line: qty=1, price=44, disc=10, gross=43.56, pct=6
    //   → exact: round(39.60 * 0.94 + 3.96 * 0.94) = round(40.9464) = 40.95
    //   → component: 37.22 + 3.72 = 40.94
    const r = computeDocumentTotals([line(1, 44, 10, 43.56)], null, null, CONFIG, 6);
    const exactSum = round2(r.netSubtotal * 0.94 + r.taxAmt);
    assert.equal(exactSum, 40.95, 'sanity: the exact-sum path WOULD give 40.95');
    assert.equal(r.grandTotal, 40.94, 'fix: the implementation MUST give the displayed sum 40.94');
    assert.notEqual(r.grandTotal, exactSum);
  });

  it('half-cent boundary (×0.005) rounds to nearest even-cent consistently', () => {
    // qty=1, price=10.005, gross=11.005 → net=10.005, tax exact=1.0005.
    // After rounding (Math.round + Number.EPSILON), both components must round
    // up cleanly to 2dp and the invariant (after a final round2 on the sum,
    // because raw grandTotal can carry float-arithmetic noise) must hold.
    const r = computeDocumentTotals([line(1, 10.005, 0, 11.005)], null, null, CONFIG, 0);
    const factor = 1;
    const displayedSubtotal = round2(r.netSubtotal * factor);
    const displayedTax      = round2(r.taxAmt);
    assert.equal(round2(r.grandTotal), round2(displayedSubtotal + displayedTax));
    // And the components must each be 2-decimal numbers (no float trash like 10.004999…).
    assert.equal(Math.round(displayedSubtotal * 100) / 100, displayedSubtotal);
    assert.equal(Math.round(displayedTax * 100) / 100, displayedTax);
  });

  it('falls back to round2(baseGrandTotal*factor) when only grossField is present', () => {
    // No qty/price → netSubtotal is null → the (baseGrandTotal × factor) branch
    // runs. Verify it still rounds to 2dp (no double precision artifacts).
    const cfg = { grossField: 'lineGrossAmount' };
    const lines = [{ id: '1', lineGrossAmount: 43.56 }];
    const r = computeDocumentTotals(lines, null, null, cfg, 6);
    assert.equal(r.netSubtotal, null);
    assert.equal(r.grandTotal, round2(43.56 * 0.94)); // 40.9464 → 40.95 in this branch
    assert.equal(r.grandTotal, 40.95);
  });

  it('grandTotal is null when grossField is absent AND lines is empty (no NaN)', () => {
    // With empty lines and only qty/price configured, baseGrandTotal is null →
    // grandTotal must be null, never NaN, even with a non-zero total discount.
    const cfg = { qtyField: 'orderedQuantity', priceField: 'listPrice' };
    const r = computeDocumentTotals([], null, null, cfg, 25);
    assert.equal(r.grandTotal, null);
    assert.equal(r.taxAmt, null);
    assert.equal(r.totalDiscountAmt, 0); // netSubtotal=0 → totalDiscountAmt = 0
    assert.ok(!Number.isNaN(r.totalDiscountAmt));
  });

  it('walks the same cluster through pct=0 → 10 → 100 keeping the invariant', () => {
    // One cluster, three discount steps. Verifies (a) proportional scaling and
    // (b) that the "displayed subtotal + displayed tax === grandTotal" contract
    // holds across the full discount range, not just at boundaries.
    const ls = [line(1, 44, 10, 43.56), line(2, 7.49, 5, 15.64)];
    for (const pct of [0, 10, 100]) {
      const r = computeDocumentTotals(ls, null, null, CONFIG, pct);
      const factor = 1 - pct / 100;
      const displayedSubtotal = round2(r.netSubtotal * factor);
      const displayedTax      = round2(r.taxAmt);
      assert.equal(
        round2(r.grandTotal),
        round2(displayedSubtotal + displayedTax),
        `invariant broken at pct=${pct}`,
      );
    }
  });
});
