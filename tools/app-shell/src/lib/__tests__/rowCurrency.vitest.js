/**
 * ETP-5245 — `resolveRowCurrency` cascade.
 *
 * The bug this locks down: the amount cell used to read ONLY
 * `row['currency$_identifier']`, a DAL property name that exists only when the
 * entity's currency field is literally named `currency`. Three entities name it
 * `cCurrencyID` (from the AD column `C_Currency_ID`), so NEO sends
 * `cCurrencyID$_identifier` and the amount rendered with no symbol at all.
 *
 * The precedence order is the substance of the fix, not an implementation
 * detail: the row's own currency must always beat the session currency, because
 * M_Costing legitimately holds rows in different currencies (real tenant data:
 * 1663 USD next to 1545 EUR). Falling back to the session currency for a row
 * that has its own would print a confident lie.
 */
import { describe, it, expect } from 'vitest';
import { resolveRowCurrency } from '../rowCurrency.js';

const SESSION = 'GBP';

describe('resolveRowCurrency', () => {
  it('prefers the column-declared currencyField over every other source', () => {
    const row = {
      'cCurrencyID$_identifier': 'USD',
      'currency$_identifier': 'CHF',
      'altCurrency$_identifier': 'EUR',
    };
    expect(resolveRowCurrency(row, { currencyField: 'altCurrency' }, SESSION)).toBe('EUR');
  });

  it('falls through to currency$_identifier when the declared field is empty on this row', () => {
    const row = { 'altCurrency$_identifier': '', 'currency$_identifier': 'CHF' };
    expect(resolveRowCurrency(row, { currencyField: 'altCurrency' }, SESSION)).toBe('CHF');
  });

  it('uses currency$_identifier when the column declares nothing (pre-ETP-5245 behavior)', () => {
    expect(resolveRowCurrency({ 'currency$_identifier': 'CHF' }, {}, SESSION)).toBe('CHF');
  });

  it('uses cCurrencyID$_identifier without any per-window declaration', () => {
    // The payload key is fully determined by the AD column (C_Currency_ID), so
    // product/costing, product/transactionAdjustments and
    // warehouse/productTransactions are covered with no decisions.json change.
    expect(resolveRowCurrency({ 'cCurrencyID$_identifier': 'USD' }, {}, SESSION)).toBe('USD');
  });

  it('lets currency$_identifier win over cCurrencyID$_identifier when a row carries both', () => {
    const row = { 'currency$_identifier': 'CHF', 'cCurrencyID$_identifier': 'USD' };
    expect(resolveRowCurrency(row, {}, SESSION)).toBe('CHF');
  });

  it('falls back to the session currency only when the row carries none', () => {
    expect(resolveRowCurrency({ id: 'r1' }, {}, SESSION)).toBe('GBP');
  });

  it('returns undefined when nothing is known, so the amount renders grouped but symbol-less', () => {
    // Deliberate, not a failure: this is what mock data and currency-less
    // entities produce, and it is the exact pre-ETP-5245 rendering.
    expect(resolveRowCurrency({ id: 'r1' }, {}, null)).toBeUndefined();
    expect(resolveRowCurrency({ id: 'r1' }, {}, '')).toBeUndefined();
  });

  it('tolerates a missing row or column without throwing', () => {
    expect(resolveRowCurrency(undefined, undefined, 'EUR')).toBe('EUR');
    expect(resolveRowCurrency(null, null, null)).toBeUndefined();
  });
});
