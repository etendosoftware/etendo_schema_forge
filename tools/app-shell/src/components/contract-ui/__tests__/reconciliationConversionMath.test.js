// @covers tools/app-shell/src/components/contract-ui/reconciliationConversionMath.js
/**
 * Unit tests for `reconciliationConversionMath.js` — the pure rules of the bank-rate conversion
 * block of the reconciliation payment-method modal (Classic parity: Match Statement → Add Payment).
 *
 * node:test (not vitest) on purpose: the module is a plain `.js` sibling of the hook and the
 * section `.jsx`, precisely so this runner can import it without a JSX transform (same arrangement
 * as `writeoffMath.js` / `reconciliationDifferenceMath.js`).
 *
 * The reference scenario is the one documented in
 * `docs/generated-custom-windows/financial-account.md` ("Bank-rate conversion block"): a EUR
 * account, a 27,87 € statement line, and one USD invoice with 40,91 USD outstanding whose own rate
 * is ≈ 0,680286. The backend (`ReconciliationConversionSupport`) re-validates everything; these
 * rules are what the modal shows and what it lets the user confirm.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMOUNT_DECIMALS,
  RATE_DECIMALS,
  allocateGreedy,
  conversionDefaults,
  conversionEligibility,
  conversionPayloadFields,
  decimalString,
  fxDifference,
  fxOutcome,
  invoiceRateEquivalent,
  isNegligibleAmount,
  onActualEdit,
  onConvertedEdit,
  onRateEdit,
  outstandingOf,
  outstandingSum,
  referenceRate,
  remainderAmount,
  roundHalfUp,
  validateConversion,
} from '../reconciliationConversionMath.js';

// ── Reference scenario ──────────────────────────────────────────────────────────

const LINE = 27.87;
const OUTSTANDING = 40.91;
const INVOICE_RATE = 0.680286;
const BOUNDS = { outstanding: OUTSTANDING, lineAbs: LINE };

/** A selected USD invoice candidate as the reconciliation candidates endpoint emits it. */
function usdInvoice(overrides = {}) {
  return {
    id: 'C-USD',
    kind: 'invoice',
    currency: 'USD',
    amount: OUTSTANDING,
    pendingBalance: OUTSTANDING,
    rate: INVOICE_RATE,
    ...overrides,
  };
}

const INVOICES = [usdInvoice()];
const DEFAULTS = conversionDefaults(BOUNDS);

// Two invoices of the same currency at DIFFERENT own rates: the probe of the greedy allocation the
// backend applies (15 USD → A paid in full, worth 6 €; B paid 5 USD, worth 4 €).
const PROBE_A = { id: 'A', currency: 'USD', amount: 10, pendingBalance: 10, rate: 0.6 };
const PROBE_B = { id: 'B', currency: 'USD', amount: 10, pendingBalance: 10, rate: 0.8 };

describe('constants', () => {
  it('derives rates at 6 decimals and amounts at 2 (Classic FIN_AddPayment)', () => {
    assert.equal(RATE_DECIMALS, 6);
    assert.equal(AMOUNT_DECIMALS, 2);
  });
});

describe('roundHalfUp', () => {
  it('rounds 1.005 up to 1.01 — no binary-float trap', () => {
    // The naive Math.round(1.005 * 100) / 100 gives 1.00.
    assert.equal(roundHalfUp(1.005, 2), 1.01);
  });

  it('rounds half away from zero for negatives', () => {
    assert.equal(roundHalfUp(-1.005, 2), -1.01);
  });

  it('accepts a numeric string', () => {
    assert.equal(roundHalfUp('2.345', 2), 2.35);
  });

  it('rounds a value already in exponent notation', () => {
    assert.equal(roundHalfUp(1e-7, 2), 0);
  });

  it('derives the reference rate at 6 decimals', () => {
    assert.equal(roundHalfUp(LINE / OUTSTANDING, RATE_DECIMALS), 0.681252);
  });

  for (const blank of [null, undefined, '', 'abc', Number.NaN, Infinity]) {
    it(`returns null for ${String(blank) || 'an empty string'}`, () => {
      assert.equal(roundHalfUp(blank, 2), null);
    });
  }
});

describe('decimalString', () => {
  it('keeps a plain decimal as is', () => {
    assert.equal(decimalString(27.87), '27.87');
  });

  it('expands exponent notation to a plain dot-decimal (the backend parses with BigDecimal)', () => {
    assert.equal(String(1e-7), '1e-7');
    assert.equal(decimalString(1e-7), '0.0000001');
  });

  it('returns null for null or a non-finite number', () => {
    assert.equal(decimalString(null), null);
    assert.equal(decimalString(undefined), null);
    assert.equal(decimalString(Number.NaN), null);
  });
});

describe('outstandingOf / outstandingSum', () => {
  it('reads pendingBalance, unsigned', () => {
    assert.equal(outstandingOf({ pendingBalance: -40.91, amount: -99 }), 40.91);
  });

  it('falls back to amount when pendingBalance is missing', () => {
    assert.equal(outstandingOf({ amount: 12.5 }), 12.5);
  });

  it('is 0 for a candidate with neither, or for no candidate at all', () => {
    assert.equal(outstandingOf({}), 0);
    assert.equal(outstandingOf(null), 0);
  });

  it('keeps an explicit 0 pendingBalance instead of falling back to amount', () => {
    assert.equal(outstandingOf({ pendingBalance: 0, amount: 50 }), 0);
  });

  it('cleans binary float noise off the sum (10.1 + 20.2 = 30.3)', () => {
    assert.notEqual(10.1 + 20.2, 30.3);
    assert.equal(outstandingSum([{ pendingBalance: 10.1 }, { pendingBalance: 20.2 }]), 30.3);
  });

  it('is 0 for an empty or missing selection', () => {
    assert.equal(outstandingSum([]), 0);
    assert.equal(outstandingSum(undefined), 0);
  });
});

describe('conversionEligibility', () => {
  const base = {
    invoiceMode: true, isReconciledLine: false, invoices: INVOICES, accountCurrency: 'EUR',
    lineAmount: LINE,
  };

  it('is eligible for invoices sharing one currency other than the account currency', () => {
    assert.deepEqual(conversionEligibility(base), { eligible: true, invoiceCurrency: 'USD' });
  });

  it('is eligible for a payment line (negative amount) too', () => {
    assert.equal(conversionEligibility({ ...base, lineAmount: -LINE }).eligible, true);
  });

  it('is eligible for several invoices of the same foreign currency', () => {
    const invoices = [usdInvoice(), usdInvoice({ id: 'C-USD-2' })];
    assert.deepEqual(conversionEligibility({ ...base, invoices }), {
      eligible: true, invoiceCurrency: 'USD',
    });
  });

  const NOT_ELIGIBLE = [
    ['outside invoice mode', { invoiceMode: false }],
    ['on a reconciled line', { isReconciledLine: true }],
    ['on a zero line', { lineAmount: 0 }],
    ['on a line with no amount', { lineAmount: undefined }],
    ['with no invoice selected', { invoices: [] }],
    ['with no selection at all', { invoices: undefined }],
    ['for invoices in the account currency', { invoices: [usdInvoice({ currency: 'EUR' })] }],
    ['for an invoice with no currency', { invoices: [usdInvoice({ currency: undefined })] }],
    ['for a mixed foreign + same-currency selection',
      { invoices: [usdInvoice(), usdInvoice({ id: 'C-EUR', currency: 'EUR' })] }],
    ['for two different foreign currencies',
      { invoices: [usdInvoice(), usdInvoice({ id: 'C-GBP', currency: 'GBP' })] }],
  ];

  for (const [label, override] of NOT_ELIGIBLE) {
    it(`is not eligible ${label}`, () => {
      assert.deepEqual(conversionEligibility({ ...base, ...override }), {
        eligible: false, invoiceCurrency: null,
      });
    });
  }
});

describe('referenceRate', () => {
  it('is the invoice rate for a single invoice', () => {
    assert.equal(referenceRate(INVOICES), INVOICE_RATE);
  });

  it('is the outstanding-weighted average of each invoice rate', () => {
    // (10 × 0.5 + 30 × 0.7) / 40 = 0.65
    const rate = referenceRate([
      { pendingBalance: 10, rate: 0.5 },
      { pendingBalance: 30, rate: 0.7 },
    ]);
    assert.ok(Math.abs(rate - 0.65) < 1e-12, `expected 0.65, got ${rate}`);
  });

  it('is null when any selected candidate lacks a rate', () => {
    assert.equal(referenceRate([usdInvoice(), usdInvoice({ id: 'C2', rate: undefined })]), null);
  });

  it('is null when a rate is zero or negative', () => {
    assert.equal(referenceRate([usdInvoice({ rate: 0 })]), null);
    assert.equal(referenceRate([usdInvoice({ rate: -0.5 })]), null);
    assert.equal(referenceRate([usdInvoice({ rate: -1 })]), null);
  });

  it('is null for a zero or negative rate whatever the amount to pay, even beside a valid one', () => {
    for (const rate of [0, -1, '0', '']) {
      assert.equal(referenceRate([usdInvoice({ rate })], 21.34), null, `rate ${JSON.stringify(rate)}`);
      assert.equal(referenceRate([PROBE_A, { ...PROBE_B, rate }], 15), null, `rate ${JSON.stringify(rate)}`);
    }
  });

  it('is null when nothing is outstanding, or nothing is selected', () => {
    assert.equal(referenceRate([usdInvoice({ pendingBalance: 0 })]), null);
    assert.equal(referenceRate([]), null);
    assert.equal(referenceRate(null), null);
  });

  describe('weighted by what an amount to pay actually settles', () => {
    it('weights by the greedy allocation of the amount, not by outstanding', () => {
      // 15 USD over A then B: A takes 10, B takes 5 → (10 × 0.6 + 5 × 0.8) / 15 = 0.6666…
      const rate = referenceRate([PROBE_A, PROBE_B], 15);
      assert.ok(Math.abs(rate - 2 / 3) < 1e-12, `expected 0.6667, got ${rate}`);
      // The outstanding-weighted average (0.7) would overstate what 15 USD is worth.
      assert.ok(Math.abs(referenceRate([PROBE_A, PROBE_B]) - 0.7) < 1e-12);
    });

    it('follows the request order', () => {
      // B first: B takes 10, A takes 5 → (10 × 0.8 + 5 × 0.6) / 15 = 0.7333…
      const rate = referenceRate([PROBE_B, PROBE_A], 15);
      assert.ok(Math.abs(rate - 11 / 15) < 1e-12, `expected 0.7333, got ${rate}`);
    });

    it('is the first invoice rate when the amount does not reach the second', () => {
      assert.equal(referenceRate([PROBE_A, PROBE_B], 5), 0.6);
    });

    it('coincides with the outstanding-weighted average when everything is paid', () => {
      assert.ok(Math.abs(referenceRate([PROBE_A, PROBE_B], 20) - 0.7) < 1e-12);
    });

    it('falls back to outstanding weights for a zero, negative or missing amount', () => {
      for (const actual of [0, -5, null, undefined]) {
        assert.ok(Math.abs(referenceRate([PROBE_A, PROBE_B], actual) - 0.7) < 1e-12, `${actual}`);
      }
    });

    it('is still null when a candidate lacks a rate, whatever the amount', () => {
      assert.equal(referenceRate([PROBE_A, { ...PROBE_B, rate: undefined }], 5), null);
    });
  });
});

describe('allocateGreedy', () => {
  it('spreads the amount in request order, each invoice taking min(left, outstanding)', () => {
    assert.deepEqual(allocateGreedy([PROBE_A, PROBE_B], 15), [10, 5]);
    assert.deepEqual(allocateGreedy([PROBE_B, PROBE_A], 15), [10, 5]);
  });

  it('pays every invoice in full when the amount covers them all', () => {
    assert.deepEqual(allocateGreedy([PROBE_A, PROBE_B], 25), [10, 10]);
  });

  it('gives nothing to the invoices past the cut', () => {
    assert.deepEqual(allocateGreedy([PROBE_A, PROBE_B], 4), [4, 0]);
  });

  it('allocates nothing for a missing or negative amount', () => {
    assert.deepEqual(allocateGreedy([PROBE_A, PROBE_B], null), [0, 0]);
    assert.deepEqual(allocateGreedy([PROBE_A, PROBE_B], -5), [0, 0]);
  });

  it('scrubs float noise off what is left, so the last share is exact', () => {
    // 0.3 − 0.1 is 0.19999999999999998 in binary floating point.
    assert.deepEqual(allocateGreedy([{ pendingBalance: 0.1 }, { pendingBalance: 0.2 }], 0.3), [0.1, 0.2]);
  });

  it('returns no shares for no invoices', () => {
    assert.deepEqual(allocateGreedy([], 10), []);
    assert.deepEqual(allocateGreedy(undefined, 10), []);
  });
});

describe('conversionDefaults (Classic parity)', () => {
  it('pays everything outstanding, books the statement amount and derives the rate', () => {
    assert.deepEqual(DEFAULTS, {
      actual: 40.91,
      rate: 0.681252,
      rateText: null,
      converted: 27.87,
      anchor: 'converted',
    });
  });

  it('has no rate when nothing is outstanding', () => {
    const s = conversionDefaults({ outstanding: 0, lineAbs: LINE });
    assert.equal(s.actual, 0);
    assert.equal(s.rate, null);
    assert.equal(s.converted, LINE);
  });

  it('keeps blank inputs as null instead of NaN', () => {
    const s = conversionDefaults({ outstanding: '', lineAbs: undefined });
    assert.equal(s.actual, null);
    assert.equal(s.converted, null);
    assert.equal(s.rate, null);
  });
});

describe('onActualEdit', () => {
  it('keeps the converted amount pinned and re-derives the rate (anchor "converted")', () => {
    const s = onActualEdit(DEFAULTS, 21.34);
    assert.equal(s.actual, 21.34);
    assert.equal(s.converted, 27.87);
    assert.equal(s.rate, 1.305998);
    assert.equal(s.anchor, 'converted');
    assert.equal(s.rateText, null);
  });

  it('drops a typed rate text, since the rate is derived again', () => {
    const typed = { ...DEFAULTS, rateText: '0.68' };
    assert.equal(onActualEdit(typed, 21.34).rateText, null);
  });

  it('recomputes the converted amount once the rate is the anchor', () => {
    const rated = onRateEdit(DEFAULTS, 0.7, '0.7');
    const s = onActualEdit(rated, 21.34);
    assert.equal(s.rate, 0.7);
    assert.equal(s.rateText, '0.7');
    // round2(21.34 × 0.7 = 14.938)
    assert.equal(s.converted, 14.94);
    assert.equal(s.anchor, 'rate');
  });

  // An unusable amount (blank, 0, negative) only changes its own field: deriving from it would
  // blank or corrupt a figure the user did not touch.
  for (const [label, typed, stored] of [
    ['blanked', null, null], ['emptied', '', null], ['zero', 0, 0], ['negative', -5, -5],
  ]) {
    it(`leaves the rate and the converted amount untouched when the amount is ${label}`, () => {
      assert.deepEqual(onActualEdit(DEFAULTS, typed), { ...DEFAULTS, actual: stored });
    });

    it(`keeps the rate anchor, its text and the converted amount when the amount is ${label}`, () => {
      const rated = onRateEdit(DEFAULTS, 0.7, '0.7');
      assert.deepEqual(onActualEdit(rated, typed), { ...rated, actual: stored });
    });
  }

  it('derives from the kept anchor on the next valid amount, as if nothing happened', () => {
    // Converted anchor: the rate is re-derived from the pinned 27,87 €.
    const pinned = onActualEdit(onActualEdit(DEFAULTS, ''), 21.34);
    assert.equal(pinned.rate, 1.305998);
    assert.equal(pinned.converted, 27.87);
    // Rate anchor: the converted amount follows the kept 0,7.
    const rated = onActualEdit(onActualEdit(onRateEdit(DEFAULTS, 0.7, '0.7'), -5), 21.34);
    assert.equal(rated.rate, 0.7);
    assert.equal(rated.converted, 14.94);
  });

  describe('rounds the typed amount HALF_UP to cents before deriving anything', () => {
    it('40,905 → 40,91, and the rate is derived from 40,91', () => {
      const s = onActualEdit(DEFAULTS, 40.905);
      assert.equal(s.actual, 40.91);
      assert.equal(s.rate, 0.681252);
      assert.equal(conversionPayloadFields(s).actualPayment, '40.91');
    });

    it('rounds down below half a cent', () => {
      assert.equal(onActualEdit(DEFAULTS, 21.344).actual, 21.34);
    });

    it('recomputes the converted amount from the rounded amount under a rate anchor', () => {
      // round2(40.905) = 40.91; 40.91 × 0.5 = 20.455 → 20.46
      const s = onActualEdit(onRateEdit(DEFAULTS, 0.5, '0.5'), 40.905);
      assert.equal(s.actual, 40.91);
      assert.equal(s.converted, 20.46);
    });

    it('accepts the parsed number as a string too', () => {
      assert.equal(onActualEdit(DEFAULTS, '40.905').actual, 40.91);
    });
  });
});

describe('onRateEdit', () => {
  it('recomputes converted = round2(actual × rate) and makes the rate the anchor', () => {
    const s = onRateEdit(DEFAULTS, 0.68125, '0.68125');
    // 40.91 × 0.68125 = 27.869937… → 27.87
    assert.equal(s.converted, 27.87);
    assert.equal(s.rate, 0.68125);
    assert.equal(s.anchor, 'rate');
  });

  it('keeps the typed text verbatim', () => {
    assert.equal(onRateEdit(DEFAULTS, 0.6812519, '0.6812519').rateText, '0.6812519');
  });

  it('defaults the typed text to null when none is passed', () => {
    assert.equal(onRateEdit(DEFAULTS, 0.7).rateText, null);
  });

  describe('an unusable rate (blank, 0, negative) leaves the amount and the converted amount alone', () => {
    // Start from a typed rate, so the converted amount (28,64 €) is one the rate produced.
    const RATED = onRateEdit(DEFAULTS, 0.7, '0.7');

    it('drops the text when the rate is blanked, and pins the converted amount as the anchor', () => {
      assert.deepEqual(onRateEdit(RATED, null, ''), {
        actual: 40.91, rate: null, rateText: null, converted: 28.64, anchor: 'converted',
      });
    });

    it('keeps the typed text of a zero rate (only a blank drops it)', () => {
      assert.deepEqual(onRateEdit(RATED, 0, '0'), {
        actual: 40.91, rate: 0, rateText: '0', converted: 28.64, anchor: 'converted',
      });
    });

    it('keeps the typed text of a negative rate', () => {
      assert.deepEqual(onRateEdit(RATED, -0.5, '-0.5'), {
        actual: 40.91, rate: -0.5, rateText: '-0.5', converted: 28.64, anchor: 'converted',
      });
    });

    for (const [rate, text] of [[null, ''], [0, '0'], [-0.5, '-0.5']]) {
      it(`a later amount edit re-derives the rate from the kept converted amount (rate ${rate})`, () => {
        const s = onActualEdit(onRateEdit(RATED, rate, text), 21.34);
        // 28.64 / 21.34 = 1.3420805…
        assert.equal(s.rate, 1.342081);
        assert.equal(s.rateText, null);
        assert.equal(s.converted, 28.64);
        assert.equal(validateConversion(s, BOUNDS).rateInvalid, false);
      });
    }

    it('is refused by the validation, on the rate alone', () => {
      // From the defaults, whose kept converted amount (27,87 €) is within the line.
      const v = validateConversion(onRateEdit(DEFAULTS, 0, '0'), BOUNDS);
      assert.deepEqual(v, {
        valid: false, actualInvalid: false, rateInvalid: true, convertedInvalid: false,
      });
    });
  });
});

describe('onConvertedEdit', () => {
  it('re-derives rate = round6(converted / actual) and pins the converted amount again', () => {
    const rated = onRateEdit(DEFAULTS, 0.68125, '0.68125');
    const s = onConvertedEdit(rated, 27);
    assert.equal(s.converted, 27);
    // 27 / 40.91 = 0.6599853…
    assert.equal(s.rate, 0.659985);
    assert.equal(s.rateText, null);
    assert.equal(s.anchor, 'converted');
  });

  for (const converted of [null, 0, -5]) {
    it(`keeps the rate and the amount, and makes the rate the anchor, for a converted amount of ${converted}`, () => {
      assert.deepEqual(onConvertedEdit(DEFAULTS, converted), {
        ...DEFAULTS, converted, anchor: 'rate',
      });
      assert.deepEqual(validateConversion(onConvertedEdit(DEFAULTS, converted), BOUNDS), {
        valid: false, actualInvalid: false, rateInvalid: false, convertedInvalid: true,
      });
    });

    it(`a later amount edit recomputes the converted amount from the kept rate (converted ${converted})`, () => {
      const s = onActualEdit(onConvertedEdit(DEFAULTS, converted), 21.34);
      assert.equal(s.rate, 0.681252);
      // round2(21.34 × 0.681252 = 14.538…)
      assert.equal(s.converted, 14.54);
      assert.equal(validateConversion(s, BOUNDS).valid, true);
    });
  }

  it('keeps the typed rate text when the converted amount is cleared', () => {
    const s = onConvertedEdit(onRateEdit(DEFAULTS, 0.7, '0.7'), null);
    assert.equal(s.rateText, '0.7');
    assert.equal(s.rate, 0.7);
  });
});

describe('validateConversion', () => {
  it('accepts the defaults', () => {
    assert.deepEqual(validateConversion(DEFAULTS, BOUNDS), {
      valid: true, actualInvalid: false, rateInvalid: false, convertedInvalid: false,
    });
  });

  it('accepts a partial payment', () => {
    assert.equal(validateConversion(onActualEdit(DEFAULTS, 21.34), BOUNDS).valid, true);
  });

  describe('amount to pay: > 0 and ≤ Σ outstanding', () => {
    for (const actual of [0, -1, null]) {
      it(`refuses ${actual}`, () => {
        const v = validateConversion({ ...DEFAULTS, actual }, BOUNDS);
        assert.equal(v.actualInvalid, true);
        assert.equal(v.valid, false);
      });
    }

    it('refuses an amount above the outstanding total', () => {
      assert.equal(validateConversion({ ...DEFAULTS, actual: 40.92 }, BOUNDS).actualInvalid, true);
    });

    it('accepts exactly the outstanding total, float noise included', () => {
      const v = validateConversion(
        { ...DEFAULTS, actual: 10.1 + 20.2 },
        { outstanding: 30.3, lineAbs: LINE },
      );
      assert.equal(v.actualInvalid, false);
    });
  });

  describe('rate: > 0', () => {
    for (const rate of [0, -0.5, null]) {
      it(`refuses ${rate}`, () => {
        const v = validateConversion({ ...DEFAULTS, rate }, BOUNDS);
        assert.equal(v.rateInvalid, true);
        assert.equal(v.valid, false);
      });
    }

    it('accepts exactly 1 — a pegged pair is legitimate when convertedAmount is sent', () => {
      const pegged = { actual: 27.87, rate: 1, rateText: '1', converted: 27.87, anchor: 'rate' };
      assert.deepEqual(validateConversion(pegged, BOUNDS), {
        valid: true, actualInvalid: false, rateInvalid: false, convertedInvalid: false,
      });
    });
  });

  describe('converted: round2 > 0 and ≤ the line, strictly', () => {
    it('accepts exactly the line', () => {
      assert.equal(validateConversion({ ...DEFAULTS, converted: 27.87 }, BOUNDS).convertedInvalid, false);
    });

    it('refuses one cent over the line — no tolerance', () => {
      const v = validateConversion({ ...DEFAULTS, converted: 27.88 }, BOUNDS);
      assert.equal(v.convertedInvalid, true);
      assert.equal(v.valid, false);
    });

    it('compares the amount rounded to cents', () => {
      assert.equal(validateConversion({ ...DEFAULTS, converted: 27.874 }, BOUNDS).convertedInvalid, false);
      assert.equal(validateConversion({ ...DEFAULTS, converted: 27.875 }, BOUNDS).convertedInvalid, true);
    });

    for (const converted of [0, 0.004, -5, null]) {
      it(`refuses ${converted}`, () => {
        assert.equal(validateConversion({ ...DEFAULTS, converted }, BOUNDS).convertedInvalid, true);
      });
    }
  });
});

describe('invoiceRateEquivalent', () => {
  it('values a full payment at the invoice rate, like amountBase', () => {
    // round2(40.91 × 0.680286 = 27.8305…) = 27.83
    assert.equal(invoiceRateEquivalent(INVOICES, OUTSTANDING), 27.83);
  });

  it('spreads the amount over the invoices in request order', () => {
    const a = { pendingBalance: 10, rate: 0.5 };
    const b = { pendingBalance: 20, rate: 0.6 };
    // a takes 10 → 5.00, b takes the 5 left → 3.00
    assert.equal(invoiceRateEquivalent([a, b], 15), 8);
    // b takes all 15 → 9.00, a gets nothing
    assert.equal(invoiceRateEquivalent([b, a], 15), 9);
  });

  it('is null when a candidate has no rate', () => {
    assert.equal(invoiceRateEquivalent([usdInvoice({ rate: null })], OUTSTANDING), null);
  });

  // A rate of 0 would value the invoice at 0 € and turn the whole line into an "exchange
  // difference"; a negative one would flip its sign. Both are unknown, like a missing rate.
  for (const rate of [0, -1]) {
    it(`is null for a candidate with rate ${rate}`, () => {
      assert.equal(invoiceRateEquivalent([usdInvoice({ rate })], OUTSTANDING), null);
      assert.equal(invoiceRateEquivalent([PROBE_A, { ...PROBE_B, rate }], 15), null);
    });

    it(`is null for rate ${rate} even when the invoice receives nothing`, () => {
      // B is past the cut (A takes all 10 USD), yet its unusable rate still voids the figure.
      assert.equal(invoiceRateEquivalent([PROBE_A, { ...PROBE_B, rate }], 10), null);
    });
  }

  it('is 0 when nothing is paid', () => {
    assert.equal(invoiceRateEquivalent(INVOICES, null), 0);
    assert.equal(invoiceRateEquivalent([], OUTSTANDING), 0);
  });
});

describe('fxDifference', () => {
  it('is +0.04 € for the defaults (27.87 − 27.83)', () => {
    assert.equal(fxDifference(DEFAULTS, INVOICES), 0.04);
  });

  it('is converted − Σ round2(pay × rate) on a partial payment (27.87 − 14.52)', () => {
    assert.equal(fxDifference(onActualEdit(DEFAULTS, 21.34), INVOICES), 13.35);
  });

  it('is negative when the bank paid less than the invoice rate is worth', () => {
    assert.equal(fxDifference({ ...DEFAULTS, converted: 27.8 }, INVOICES), -0.03);
  });

  it('is null when a field is empty', () => {
    assert.equal(fxDifference({ ...DEFAULTS, converted: null }, INVOICES), null);
    assert.equal(fxDifference({ ...DEFAULTS, actual: null }, INVOICES), null);
  });

  it('is null when a candidate has no rate', () => {
    assert.equal(fxDifference(DEFAULTS, [usdInvoice({ rate: undefined })]), null);
  });

  for (const rate of [0, -1]) {
    it(`is null — not the whole line — for a candidate with rate ${rate}`, () => {
      assert.equal(fxDifference(DEFAULTS, [usdInvoice({ rate })]), null);
      assert.equal(fxOutcome(fxDifference(DEFAULTS, [usdInvoice({ rate })]), true), null);
    });
  }

  it('values each invoice at its own rate, allocated greedily (probe A + B)', () => {
    // 15 USD booked as 10 €: A takes 10 USD (6 €), B takes 5 USD (4 €) → no difference.
    const state = { actual: 15, rate: 0.666667, rateText: null, converted: 10, anchor: 'converted' };
    assert.equal(fxDifference(state, [PROBE_A, PROBE_B]), 0);
    // B first: B takes 10 USD (8 €), A takes 5 USD (3 €) → 10 − 11 = −1.
    assert.equal(fxDifference(state, [PROBE_B, PROBE_A]), -1);
  });
});

describe('fxOutcome — the difference named as the gain or loss Core books', () => {
  // Receipt: collecting more account currency than the invoices were worth is a gain.
  // Payment: paying more account currency than they were worth is a loss.
  const MATRIX = [
    ['receipt, bank sent more', 0.04, true, { kind: 'gain', amount: 0.04 }],
    ['receipt, bank sent less', -4, true, { kind: 'loss', amount: 4 }],
    ['payment, bank took more', 0.04, false, { kind: 'loss', amount: 0.04 }],
    ['payment, bank took less', -4, false, { kind: 'gain', amount: 4 }],
  ];

  for (const [label, difference, isReceipt, expected] of MATRIX) {
    it(`${label}: ${expected.kind} of ${expected.amount}, unsigned`, () => {
      assert.deepEqual(fxOutcome(difference, isReceipt), expected);
    });
  }

  it('names the reference +0,04 € as a gain on the receipt line', () => {
    assert.deepEqual(fxOutcome(fxDifference(DEFAULTS, INVOICES), true), { kind: 'gain', amount: 0.04 });
  });

  for (const isReceipt of [true, false]) {
    const side = isReceipt ? 'receipt' : 'payment';

    it(`is null for a negligible difference on a ${side} (< half a cent, either sign)`, () => {
      assert.equal(fxOutcome(0, isReceipt), null);
      assert.equal(fxOutcome(0.004, isReceipt), null);
      assert.equal(fxOutcome(-0.004, isReceipt), null);
    });

    it(`is null for an unknown difference on a ${side}`, () => {
      assert.equal(fxOutcome(null, isReceipt), null);
      assert.equal(fxOutcome(undefined, isReceipt), null);
    });
  }

  it('names half a cent already', () => {
    assert.deepEqual(fxOutcome(0.005, true), { kind: 'gain', amount: 0.005 });
  });
});

describe('remainderAmount', () => {
  it('is 0 when the converted amount covers the line', () => {
    assert.equal(remainderAmount(DEFAULTS, LINE), 0);
  });

  it('is what the converted amount leaves on the line', () => {
    assert.equal(remainderAmount({ ...DEFAULTS, converted: 14.52 }, LINE), 13.35);
  });

  it('is 0 for an over-coverage (invalid anyway) and for an empty converted amount', () => {
    assert.equal(remainderAmount({ ...DEFAULTS, converted: 30 }, LINE), 0);
    assert.equal(remainderAmount({ ...DEFAULTS, converted: null }, LINE), 0);
  });

  it('ignores less than half a cent', () => {
    assert.equal(remainderAmount({ ...DEFAULTS, converted: 27.87 }, 27.874), 0);
  });
});

describe('isNegligibleAmount', () => {
  it('is true below half a cent, either sign', () => {
    assert.equal(isNegligibleAmount(0.004), true);
    assert.equal(isNegligibleAmount(-0.004), true);
    assert.equal(isNegligibleAmount(0), true);
  });

  it('is false from half a cent on', () => {
    assert.equal(isNegligibleAmount(0.005), false);
    assert.equal(isNegligibleAmount(0.04), false);
    assert.equal(isNegligibleAmount(-0.04), false);
  });

  it('treats a non-number as negligible', () => {
    assert.equal(isNegligibleAmount(null), true);
    assert.equal(isNegligibleAmount('abc'), true);
  });
});

describe('conversionPayloadFields', () => {
  it('sends the defaults as dot-decimal strings', () => {
    assert.deepEqual(conversionPayloadFields(DEFAULTS), {
      actualPayment: '40.91',
      conversionRate: '0.681252',
      convertedAmount: '27.87',
    });
  });

  it('sends a typed rate verbatim, not the rounded number', () => {
    const s = onRateEdit(DEFAULTS, 0.6812519, '0.6812519');
    assert.equal(conversionPayloadFields(s).conversionRate, '0.6812519');
  });

  it('completes a rate typed with a trailing dot', () => {
    const s = { ...DEFAULTS, rate: 2, rateText: '2.' };
    assert.equal(conversionPayloadFields(s).conversionRate, '2');
  });

  it('completes a rate typed with a leading dot', () => {
    const s = { ...DEFAULTS, rate: 0.5, rateText: '.5' };
    assert.equal(conversionPayloadFields(s).conversionRate, '0.5');
  });

  it('falls back to the numeric rate when the typed text is not a clean decimal', () => {
    const s = { ...DEFAULTS, rate: 0.5, rateText: '0.5.1' };
    assert.equal(conversionPayloadFields(s).conversionRate, '0.5');
  });

  it('is unsigned — the statement line carries the sign', () => {
    const s = { actual: -40.91, rate: -0.681252, rateText: null, converted: -27.87, anchor: 'converted' };
    assert.deepEqual(conversionPayloadFields(s), {
      actualPayment: '40.91',
      conversionRate: '0.681252',
      convertedAmount: '27.87',
    });
  });

  it('sends the converted amount rounded to cents', () => {
    assert.equal(conversionPayloadFields({ ...DEFAULTS, converted: 27.874 }).convertedAmount, '27.87');
  });

  it('never sends exponent notation', () => {
    const s = { ...DEFAULTS, rate: 1e-7 };
    assert.equal(conversionPayloadFields(s).conversionRate, '0.0000001');
  });
});
