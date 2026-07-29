import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINE_CONFIGS,
  resolveTaxFactor,
  deriveLineNet,
  computeLineGrossAmount,
  computeUnitPriceForPost,
  ORDER_LINE_CONFIG,
  INVOICE_LINE_CONFIG,
} from '../useLineGrossAmount.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAX_ID    = 'TAX-21';
const TAX_ID_10 = 'TAX-10';

function emptyCache() { return {}; }

function siblingsWithGross(grossField = 'lineGrossAmount') {
  return [{
    tax: TAX_ID,
    [grossField]: 121,
    lineNetAmount: 100,
    unitPrice: 100,
    orderedQuantity: 1,
    discount: 0,
  }];
}

// ─── resolveTaxFactor ─────────────────────────────────────────────────────────

describe('resolveTaxFactor', () => {

  it('source 0 — uses taxRate from callout result', () => {
    const factor = resolveTaxFactor(TAX_ID, { taxRate: 21 }, {}, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 0 — populates cache so future calls skip the network', () => {
    const cache = emptyCache();
    resolveTaxFactor(TAX_ID, { taxRate: 21 }, {}, cache, [], 'lineGrossAmount');
    assert.equal(cache[TAX_ID], 21);
  });

  it('source 1 — uses tax_rate from rowValues selector aux', () => {
    const factor = resolveTaxFactor(TAX_ID, {}, { tax_rate: 10 }, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, 1.10);
  });

  it('source 1 — accepts 0% tax rate (non-taxable)', () => {
    const factor = resolveTaxFactor(TAX_ID, {}, { tax_rate: 0 }, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, 1);
  });

  it('source 2 — reads from cache when callout has no taxRate', () => {
    const cache = { [TAX_ID]: 21 };
    const factor = resolveTaxFactor(TAX_ID, {}, {}, cache, [], 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 3 — derives from saved row gross/net ratio (sidebar case)', () => {
    const rowValues = { lineGrossAmount: 121, lineNetAmount: 100 };
    const factor = resolveTaxFactor(TAX_ID, {}, rowValues, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 3 — falls through to source 4 when saved row net is zero', () => {
    const rowValues  = { lineGrossAmount: 121, lineNetAmount: 0 };
    const siblings   = siblingsWithGross();
    const factor = resolveTaxFactor(TAX_ID, {}, rowValues, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 4 — derives from sibling line with same tax via net', () => {
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblingsWithGross(), 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 4 — derives from sibling via qty×price when lineNetAmount absent', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 121, lineNetAmount: 0, unitPrice: 10, orderedQuantity: 10, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('source 4 — adjusts for discount when deriving from sibling net', () => {
    // sibling: price=100, discount=50% → net base = 50, gross = 60.5 → factor = 1.21
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 60.5, lineNetAmount: 100, discount: 50, orderedQuantity: 1, unitPrice: 100 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.ok(Math.abs(factor - 1.21) < 0.001, `expected ~1.21, got ${factor}`);
  });

  it('source priority: 0 wins over cache', () => {
    const cache = { [TAX_ID]: 10 };
    const factor = resolveTaxFactor(TAX_ID, { taxRate: 21 }, {}, cache, [], 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('returns null when no source resolves', () => {
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, null);
  });

  it('skips sibling with wrong tax id', () => {
    const siblings = [{ tax: TAX_ID_10, lineGrossAmount: 110, lineNetAmount: 100 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, null);
  });

  it('uses invoice grossField (grossAmount) for source 3', () => {
    const rowValues = { grossAmount: 110, lineNetAmount: 100 };
    const factor = resolveTaxFactor(TAX_ID, {}, rowValues, emptyCache(), [], 'grossAmount');
    assert.equal(factor, 1.10);
  });

  it('uses invoice grossField (grossAmount) for source 4 sibling lookup', () => {
    const siblings = [{ tax: TAX_ID, grossAmount: 110, lineNetAmount: 100, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'grossAmount');
    assert.equal(factor, 1.10);
  });

  it('NaN taxRate in callout falls through to next source', () => {
    const cache = { [TAX_ID]: 10 };
    const factor = resolveTaxFactor(TAX_ID, { taxRate: 'bad' }, {}, cache, [], 'lineGrossAmount');
    assert.equal(factor, 1.10);
  });

  it('ETP-4567: source 3 — derives from saved row gross/net ratio when both are negative', () => {
    const rowValues = { lineGrossAmount: -121, lineNetAmount: -100 };
    const factor = resolveTaxFactor(TAX_ID, {}, rowValues, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('ETP-4567: source 4 — derives from a negative sibling line (gross/net ratio)', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: -121, lineNetAmount: -100, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('ETP-4567: source 4 — derives from a negative sibling line (qty x price fallback)', () => {
    const siblings = [{
      tax: TAX_ID, lineGrossAmount: -121, lineNetAmount: 0,
      orderedQuantity: -1, unitPrice: 100, discount: 0,
    }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, 1.21);
  });

  it('ETP-4567: source 3 — rejects a stale row where saved gross/net signs disagree', () => {
    // A line edited in independent steps (price, then qty) can leave a
    // half-updated gross/net pair from an earlier partial save. Signs must
    // always agree (a tax factor is positive) — a mismatch means the saved
    // ratio is untrustworthy, so this source must not resolve a factor from it.
    const rowValues = { lineGrossAmount: -41.14, lineNetAmount: 68 };
    const factor = resolveTaxFactor(TAX_ID, {}, rowValues, emptyCache(), [], 'lineGrossAmount');
    assert.equal(factor, null);
  });

  it('ETP-4567: source 4 — rejects a sibling whose saved gross/net signs disagree', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: -41.14, lineNetAmount: 68, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    assert.equal(factor, null);
  });

});

// ─── deriveLineNet ────────────────────────────────────────────────────────────
//
// ORDER CONFIG (priceField='listPrice'):   lineNet = qty × listPrice × (1-discount/100)
// INVOICE CONFIG (priceField='listPrice'): lineNet = qty × listPrice × 1
//   (invoices have no discount field, so discFactor = 1 always)

describe('deriveLineNet — order config (priceField=listPrice)', () => {

  it('qty change — applies discount factor', () => {
    // 3 × 10 × (1-0) = 30
    const net = deriveLineNet('orderedQuantity', '3', {}, { listPrice: 10, discount: 0 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 30);
  });

  it('qty change — discount reduces net', () => {
    // 4 × 100 × 0.75 = 300
    const net = deriveLineNet('orderedQuantity', '4', {}, { listPrice: 100, discount: 25 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 300);
  });

  it('listPrice change — applies discount factor', () => {
    // 2 × 100 × (1-20/100) = 160
    const net = deriveLineNet('listPrice', '100', {}, { orderedQuantity: 2, discount: 20 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 160);
  });

  it('listPrice change — no discount gives full price', () => {
    // 2 × 50 × 1 = 100
    const net = deriveLineNet('listPrice', '50', {}, { orderedQuantity: 2, discount: 0 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 100);
  });

  it('discount change — uses listPrice from rowValues', () => {
    // 4 × 50 × 0.75 = 150
    const net = deriveLineNet('discount', '25', {}, { orderedQuantity: 4, listPrice: 50 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 150);
  });

  it('discount change — 100% discount yields 0', () => {
    const net = deriveLineNet('discount', '100', {}, { orderedQuantity: 3, listPrice: 50 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 0);
  });

  it('tax change — applies current discount', () => {
    // 2 × 50 × (1-10/100) = 90
    const net = deriveLineNet('tax', 'TAX-NEW', {}, { orderedQuantity: 2, listPrice: 50, discount: 10 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 90);
  });

  it('product change — prefers callout lineNetAmount', () => {
    const net = deriveLineNet('product', 'P1', { lineNetAmount: 88 }, { orderedQuantity: 1, listPrice: 99 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 88);
  });

  it('product change — falls back to qty×listPrice when callout net is 0', () => {
    // callout returns listPrice=44, no discount
    const net = deriveLineNet('product', 'P1', { lineNetAmount: 0, listPrice: 44 }, { orderedQuantity: 2, discount: 0 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 88);
  });

  it('returns 0 when qty is 0', () => {
    const net = deriveLineNet('orderedQuantity', '0', {}, { listPrice: 50 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 0);
  });

  it('returns 0 when listPrice is 0', () => {
    const net = deriveLineNet('orderedQuantity', '5', {}, { listPrice: 0 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 0);
  });

  it('unknown field falls back to callout lineNetAmount', () => {
    const net = deriveLineNet('someOtherField', 'x', { lineNetAmount: 55 }, {}, 'orderedQuantity', 'listPrice');
    assert.equal(net, 55);
  });

  it('unknown field falls back to rowValues lineNetAmt when callout is empty', () => {
    const net = deriveLineNet('someOtherField', 'x', {}, { lineNetAmt: 42 }, 'orderedQuantity', 'listPrice');
    assert.equal(net, 42);
  });

  it('fractional discount result is finite', () => {
    // 3 × 33.33 × (1-0.1/100) should be finite and positive
    const net = deriveLineNet('orderedQuantity', '3', {}, { listPrice: 33.33, discount: 0.1 }, 'orderedQuantity', 'listPrice');
    assert.ok(Number.isFinite(net) && net > 0);
  });

});

describe('deriveLineNet — invoice config (priceField=listPrice)', () => {

  it('qty change — uses listPrice, no discount field', () => {
    const net = deriveLineNet('invoicedQuantity', '5', {}, { listPrice: 20 }, 'invoicedQuantity', 'listPrice');
    assert.equal(net, 100);
  });

  it('listPrice change — qty × newListPrice', () => {
    const net = deriveLineNet('listPrice', '100', {}, { invoicedQuantity: 2 }, 'invoicedQuantity', 'listPrice');
    assert.equal(net, 200);
  });

  it('tax change — qty × listPrice', () => {
    const net = deriveLineNet('tax', 'T', {}, { invoicedQuantity: 2, listPrice: 50 }, 'invoicedQuantity', 'listPrice');
    assert.equal(net, 100);
  });

});

// ─── deriveLineNet — negative qty/price (ETP-4567) ───────────────────────────
//
// ETP-4567 lifted the old decisions.json `min:0` constraint, so orderedQuantity
// and listPrice can now legitimately be negative (e.g. credit/return lines).
// The `qty > 0 && price > 0` guard inherited from when negatives were impossible
// makes deriveLineNet (and calculateBasicLineNet, used by the 'tax' branch)
// silently collapse the result to 0 instead of computing the real signed total.

describe('deriveLineNet — negative qty/price (ETP-4567 regression)', () => {

  it('qty change — negative qty × positive price yields negative net (not 0)', () => {
    // -5 × 100 × 1 = -500
    const net = deriveLineNet(
      'orderedQuantity', -5, {},
      { orderedQuantity: -5, listPrice: 100, discount: 0 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, -500);
  });

  it('listPrice change — positive qty × negative price yields negative net (not 0)', () => {
    // 5 × -100 × 1 = -500
    const net = deriveLineNet(
      'listPrice', -100, {},
      { orderedQuantity: 5, listPrice: -100, discount: 0 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, -500);
  });

  it('qty change — both qty and price negative yields positive net (not 0)', () => {
    // -5 × -100 × 1 = 500
    const net = deriveLineNet(
      'orderedQuantity', -5, {},
      { orderedQuantity: -5, listPrice: -100, discount: 0 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, 500);
  });

  it('sanity — positive qty × positive price still works (no regression)', () => {
    // 5 × 100 × 1 = 500
    const net = deriveLineNet(
      'orderedQuantity', 5, {},
      { orderedQuantity: 5, listPrice: 100, discount: 0 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, 500);
  });

  it('discount change — negative qty still yields the correct negative net', () => {
    // -5 × 100 × (1 - 10/100) = -450
    const net = deriveLineNet(
      'discount', '10', {},
      { orderedQuantity: -5, listPrice: 100, discount: 10 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, -450);
  });

  it('tax change (calculateBasicLineNet) — negative qty yields the correct negative net', () => {
    // -5 × 100 × 1 = -500
    const net = deriveLineNet(
      'tax', 'TAX-NEW', {},
      { orderedQuantity: -5, listPrice: 100, discount: 0 },
      'orderedQuantity', 'listPrice', 'discount',
    );
    assert.equal(net, -500);
  });

});

// ─── computeLineGrossAmount ───────────────────────────────────────────────────

describe('computeLineGrossAmount — order config', () => {

  it('happy path — qty change with no discount', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 2 × 50 × 1 × 1.21 = 121
    computeLineGrossAmount('orderedQuantity', '2', result, { listPrice: 50, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 121);
    assert.equal(result.grossAmount, 121);
  });

  it('happy path — discount applied before tax', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 2 × 100 × 0.50 × 1.21 = 121
    computeLineGrossAmount('discount', '50', result, { orderedQuantity: 2, listPrice: 100 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 121);
  });

  it('happy path — listPrice change', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 1 × 100 × 0.9 × 1.21 = 108.9
    computeLineGrossAmount('listPrice', '100', result, { orderedQuantity: 1, discount: 10 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 108.9);
  });

  it('orderedQuantity: overrides callout grossAmount with client-side value', () => {
    const cache  = { [TAX_ID]: 21 };
    // callout returned a gross but it was computed with stale unitPrice
    const result = { tax: TAX_ID, grossAmount: 99 };
    computeLineGrossAmount('orderedQuantity', '2', result, { listPrice: 50, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    // client-side wins: 2×50×1.21=121
    assert.equal(result.grossAmount, 121);
    assert.equal(result.lineGrossAmount, 121);
  });

  it('product: trusts callout grossAmount when non-zero', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID, grossAmount: 60.5, lineNetAmount: 50 };
    computeLineGrossAmount('product', 'P1', result, { orderedQuantity: 1, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.grossAmount, 60.5);
    assert.equal(result.lineGrossAmount, undefined);
  });

  it('no-op when lineNet is 0 (missing listPrice)', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    computeLineGrossAmount('orderedQuantity', '0', result, { listPrice: 50 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, undefined);
  });

  it('no-op when taxFactor cannot be resolved', () => {
    const result = { tax: TAX_ID };
    computeLineGrossAmount('orderedQuantity', '2', result, { listPrice: 50 }, emptyCache(), [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, undefined);
  });

  it('rounds to 2 decimal places', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 1 × 9.99 × 1.21 = 12.0879 → 12.09
    computeLineGrossAmount('orderedQuantity', '1', result, { listPrice: 9.99, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 12.09);
  });

  it('force-overrides lineGrossAmount for qty change', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID, lineGrossAmount: 999 }; // stale value
    computeLineGrossAmount('orderedQuantity', '2', result, { listPrice: 50, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 121);
  });

  it('force-overrides lineGrossAmount for discount change', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID, lineGrossAmount: 999 }; // stale value
    computeLineGrossAmount('discount', '50', result, { orderedQuantity: 2, listPrice: 100 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineGrossAmount, 121);
  });

});

describe('computeLineGrossAmount — invoice config', () => {

  it('happy path — sets grossAmount for invoice lines', () => {
    const cache    = { [TAX_ID]: 10 };
    const result   = { tax: TAX_ID };
    // 3 × 100 × 1.10 = 330
    computeLineGrossAmount('invoicedQuantity', '3', result, { listPrice: 100 }, cache, [], INVOICE_LINE_CONFIG);
    assert.equal(result.grossAmount, 330);
  });

  it('listPrice change — recomputes grossAmount', () => {
    const cache    = { [TAX_ID]: 21 };
    const result   = { tax: TAX_ID };
    // 2 × 46 × 1.21 = 111.32
    computeLineGrossAmount('listPrice', '46', result, { invoicedQuantity: 2 }, cache, [], INVOICE_LINE_CONFIG);
    assert.ok(Math.abs(result.grossAmount - 111.32) < 0.001);
  });

  it('resolves tax from sibling saved invoice line', () => {
    const siblings = [{ tax: TAX_ID, grossAmount: 110, lineNetAmount: 100, discount: 0 }];
    const result   = { tax: TAX_ID };
    // 2 × 50 × 1.10 = 110
    computeLineGrossAmount('invoicedQuantity', '2', result, { listPrice: 50 }, emptyCache(), siblings, INVOICE_LINE_CONFIG);
    assert.equal(result.grossAmount, 110);
  });

});

// ─── computeLineGrossAmount — currency conversion recompute (ETP-4029) ───────
// Mirrors DetailView.jsx's applyProductCurrencyConversion: on a 'product' field
// change under an active currency conversion, the caller sets
// result.lineNetAmount = null and result[priceField] = convertedPrice right
// before calling computeLineGrossAmount, so the net amount is recomputed from
// the CONVERTED price instead of the earlier callout pass's stale net (which
// was latched onto the unconverted price).

describe('computeLineGrossAmount — currency-conversion-triggered null lineNetAmount recompute', () => {
  // applyProductCurrencyConversion re-invokes computeLineGrossAmount with
  // `field = lineConfig.priceField` (NOT 'product') and `value = convertedPrice`,
  // after resetting result.lineNetAmount to null. priceField is a clientSideField,
  // so the sync guard at the top of computeLineGrossAmount fires and recomputes
  // lineNetAmount from the converted price instead of leaving it stale.

  it('re-invocation with priceField + reset lineNetAmount recomputes net/gross from the converted price (order config)', () => {
    const cache = { [TAX_ID]: 21 };
    // Post-conversion state set up by applyProductCurrencyConversion: listPrice
    // already holds the CONVERTED price, and lineNetAmount was just reset to null.
    const result = { tax: TAX_ID, lineNetAmount: null, listPrice: 55, grossAmount: null };
    const rowValues = { orderedQuantity: 2, listPrice: 55, discount: 0 };

    computeLineGrossAmount(ORDER_LINE_CONFIG.priceField, 55, result, { ...rowValues, ...result, listPrice: 55 }, cache, [], ORDER_LINE_CONFIG);

    // Net recomputed from the converted price: 2 × 55 × 1 = 110 (no discount)
    assert.equal(result.lineNetAmount, 110);
    // Gross applies the tax factor: 110 × 1.21 = 133.1
    assert.equal(result.grossAmount, 133.1);
    assert.equal(result.lineGrossAmount, 133.1);
  });

  it('re-invocation recomputes for the invoice config too (listPrice trigger)', () => {
    const cache = { [TAX_ID_10]: 10 };
    const result = { tax: TAX_ID_10, lineNetAmount: null, listPrice: 40, grossAmount: null };
    const rowValues = { invoicedQuantity: 3, listPrice: 40 };

    computeLineGrossAmount(INVOICE_LINE_CONFIG.priceField, 40, result, { ...rowValues, ...result, listPrice: 40 }, cache, [], INVOICE_LINE_CONFIG);

    // 3 × 40 × 1.10 = 132
    assert.equal(result.lineNetAmount, 120);
    assert.equal(result.grossAmount, 132);
  });

  it('would incorrectly skip the recompute if lineNetAmount were left stale (regression guard documenting the pre-fix bug)', () => {
    // This test documents WHY the fix is necessary: if the caller forgot to
    // reset lineNetAmount to null/0 after converting the price (the pre-fix
    // behavior), the sync guard (`calloutResult.lineNetAmount == null || === 0`)
    // would see a non-zero stale value and skip the resync entirely, leaving the
    // net inconsistent with the newly converted price used for the gross.
    const cache = { [TAX_ID]: 21 };
    const staleResult = { tax: TAX_ID, lineNetAmount: 50, listPrice: 55, grossAmount: null };
    const rowValues = { orderedQuantity: 2, listPrice: 55, discount: 0 };

    computeLineGrossAmount(ORDER_LINE_CONFIG.priceField, 55, staleResult, { ...rowValues, ...staleResult, listPrice: 55 }, cache, [], ORDER_LINE_CONFIG);

    // lineNetAmount sync is skipped because the stale value (50) is neither null nor 0 —
    // it stays wrong even though the gross below is correctly derived from the local lineNet.
    assert.equal(staleResult.lineNetAmount, 50);
    // Gross is still computed correctly from the (locally derived) converted-price net,
    // which is what produces the "inconsistent line" the fix comment warns about:
    // grossAmount is right (133.1) but lineNetAmount is stale (50) — exactly the bug.
    assert.equal(staleResult.grossAmount, 133.1);
    assert.notEqual(staleResult.lineNetAmount, 110);
  });

});

// ─── computeLineGrossAmount — lineNetAmount sync ──────────────────────────────
// For client-side fields (qty, priceField, discount), lineNetAmount is kept in
// sync when the callout didn't return it. Tax changes do not write lineNetAmount.

describe('computeLineGrossAmount — lineNetAmount sync', () => {

  it('qty trigger: sets lineNetAmount when callout did not return it', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 3 × 41.80 × 1 = 125.4
    computeLineGrossAmount('orderedQuantity', '3', result, { listPrice: 41.80, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, 125.40);
  });

  it('listPrice trigger: sets lineNetAmount when callout did not return it', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 1 × 41.80 × 1 = 41.80
    computeLineGrossAmount('listPrice', '41.80', result, { orderedQuantity: 1, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, 41.80);
  });

  it('discount trigger: sets lineNetAmount when callout did not return it', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // 1 × 44 × 0.95 = 41.80
    computeLineGrossAmount('discount', '5', result, { orderedQuantity: 1, listPrice: 44 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, 41.80);
  });

  it('does NOT overwrite lineNetAmount when callout returned non-zero', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID, lineNetAmount: 41.80 };
    computeLineGrossAmount('discount', '5', result, { orderedQuantity: 1, listPrice: 44 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, 41.80);
  });

  it('tax trigger: does NOT write lineNetAmount', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    computeLineGrossAmount('tax', TAX_ID, result, { orderedQuantity: 1, listPrice: 44, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, undefined);
  });

  it('lineNet=0: does not write lineNetAmount', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    computeLineGrossAmount('discount', '5', result, { orderedQuantity: 1, listPrice: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, undefined);
  });

  it('invoice config: lineNetAmount set for qty trigger', () => {
    const cache  = { [TAX_ID]: 10 };
    const result = { tax: TAX_ID };
    // 2 × 50 = 100 (no discount)
    computeLineGrossAmount('invoicedQuantity', '2', result, { listPrice: 50 }, cache, [], INVOICE_LINE_CONFIG);
    assert.equal(result.lineNetAmount, 100);
  });

});

// ─── computeLineGrossAmount — negative lineNet (ETP-4567 round 3) ────────────
//
// ETP-4567 lifted the old decisions.json `min:0` constraint, so orderedQuantity
// and listPrice (and therefore the derived lineNet) can legitimately be
// negative (credit/return lines). Two guards in computeLineGrossAmount still
// belong to the pre-fix "must be positive" family:
//   1. The lineNetAmount sync guard requires `lineNet > 0`, so a negative
//      lineNet is never synced onto calloutResult.lineNetAmount.
//   2. `if (lineNet <= 0) return;` bails out before the tax factor is even
//      resolved, so grossAmount/config.grossField are never computed for a
//      negative lineNet — the UI is left showing a stale gross amount.
// Both should only treat lineNet === 0 as the genuinely indeterminate case.

describe('computeLineGrossAmount — negative lineNet (ETP-4567 regression)', () => {

  it('qty change — negative lineNet still computes grossAmount and lineGrossAmount', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // qty=-5, price=100, discount=0 → lineNet = -500 → gross = -500 × 1.21 = -605
    computeLineGrossAmount('orderedQuantity', -5, result, { listPrice: 100, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.grossAmount, -605);
    assert.equal(result[ORDER_LINE_CONFIG.grossField], -605);
  });

  it('qty change — negative lineNet still syncs lineNetAmount', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    computeLineGrossAmount('orderedQuantity', -5, result, { listPrice: 100, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.lineNetAmount, -500);
  });

  it('listPrice change — negative lineNet still computes grossAmount (invoice config)', () => {
    const cache  = { [TAX_ID_10]: 10 };
    const result = { tax: TAX_ID_10 };
    // qty=3, listPrice=-40 → lineNet = -120 → gross = -120 × 1.10 = -132
    computeLineGrossAmount('listPrice', -40, result, { invoicedQuantity: 3 }, cache, [], INVOICE_LINE_CONFIG);
    assert.equal(result.grossAmount, -132);
    assert.equal(result.lineNetAmount, -120);
  });

  it('sanity — positive lineNet still computes grossAmount/lineNetAmount (no regression)', () => {
    const cache  = { [TAX_ID]: 21 };
    const result = { tax: TAX_ID };
    // qty=5, price=100, discount=0 → lineNet = 500 → gross = 500 × 1.21 = 605
    computeLineGrossAmount('orderedQuantity', 5, result, { listPrice: 100, discount: 0 }, cache, [], ORDER_LINE_CONFIG);
    assert.equal(result.grossAmount, 605);
    assert.equal(result[ORDER_LINE_CONFIG.grossField], 605);
    assert.equal(result.lineNetAmount, 500);
  });

});

// ─── computeUnitPriceForPost ──────────────────────────────────────────────────

describe('computeUnitPriceForPost', () => {

  it('order config: unitPrice = listPrice × (1 - discount/100)', () => {
    const lineData = { listPrice: 44, discount: 5 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.ok(Math.abs(lineData.unitPrice - 41.8) < 0.0001);
  });

  it('order config: no discount → unitPrice = listPrice', () => {
    const lineData = { listPrice: 100, discount: 0 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.equal(lineData.unitPrice, 100);
  });

  it('order config: 100% discount → unitPrice = 0', () => {
    const lineData = { listPrice: 100, discount: 100 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.equal(lineData.unitPrice, 0);
  });

  it('order config: missing listPrice → does not write unitPrice', () => {
    const lineData = { discount: 10 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.equal(lineData.unitPrice, undefined);
  });

  it('invoice config: derives unitPrice = listPrice when etgoDiscount absent', () => {
    const lineData = { listPrice: 50 };
    computeUnitPriceForPost(lineData, INVOICE_LINE_CONFIG);
    assert.equal(lineData.unitPrice, 50);
  });

  it('invoice config: applies etgoDiscount to unitPrice', () => {
    const lineData = { listPrice: 100, etgoDiscount: 10 };
    computeUnitPriceForPost(lineData, INVOICE_LINE_CONFIG);
    assert.equal(lineData.unitPrice, 90);
  });

  it('invoice config: missing listPrice → does not write unitPrice', () => {
    const lineData = {};
    computeUnitPriceForPost(lineData, INVOICE_LINE_CONFIG);
    assert.equal(lineData.unitPrice, undefined);
  });

  // ─ negative listPrice (ETP-4567 regression) ─
  //
  // ETP-4567 lifted the old `min:0` constraint so listPrice can legitimately be
  // negative (credit/return lines). The `listPrice > 0` guard inherited from
  // when negatives were impossible makes computeUnitPriceForPost silently skip
  // deriving `unitPrice` for negative list prices, so the field is left
  // undefined and never sent in the PATCH/POST body — the backend's native
  // callout then overwrites the price with its own default on line creation.

  it('order config: negative listPrice still derives unitPrice (not left undefined)', () => {
    const lineData = { listPrice: -100, discount: 0 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.equal(lineData.unitPrice, -100);
  });

  it('order config: negative listPrice with discount derives the correct discounted unitPrice', () => {
    // -100 × (1 - 10/100) = -90
    const lineData = { listPrice: -100, discount: 10 };
    computeUnitPriceForPost(lineData, ORDER_LINE_CONFIG);
    assert.equal(lineData.unitPrice, -90);
  });

});

// ─── LINE_CONFIGS shape ───────────────────────────────────────────────────────

describe('LINE_CONFIGS contract', () => {

  it('order config has discountField set', () => {
    assert.equal(LINE_CONFIGS.order.discountField, 'discount');
  });

  it('invoice config has discountField etgoDiscount', () => {
    assert.equal(LINE_CONFIGS.invoice.discountField, 'etgoDiscount');
  });

  it('invoice config uses listPrice as priceField (same as order)', () => {
    assert.equal(LINE_CONFIGS.invoice.priceField, 'listPrice');
  });

  it('invoice config uses invoicedQuantity as qtyField', () => {
    assert.equal(LINE_CONFIGS.invoice.qtyField, 'invoicedQuantity');
  });

  it('invoice config uses grossAmount as grossField', () => {
    assert.equal(LINE_CONFIGS.invoice.grossField, 'grossAmount');
  });

  it('returnOrder config uses unitPrice as priceField', () => {
    assert.equal(LINE_CONFIGS.returnOrder.priceField, 'unitPrice');
  });

  it('returnOrder config has no discountField', () => {
    assert.equal(LINE_CONFIGS.returnOrder.discountField, null);
  });

  it('returnOrder config uses orderedQuantity as qtyField', () => {
    assert.equal(LINE_CONFIGS.returnOrder.qtyField, 'orderedQuantity');
  });

  it('returnOrder config uses lineGrossAmount as grossField', () => {
    assert.equal(LINE_CONFIGS.returnOrder.grossField, 'lineGrossAmount');
  });

});
