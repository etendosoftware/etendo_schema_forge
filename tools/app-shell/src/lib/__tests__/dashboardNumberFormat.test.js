import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDashboardAmount,
  formatDashboardCompact,
  formatDashboardNumber,
} from '../dashboardNumberFormat.js';
import { formatCurrency } from '../formatCurrency.js';

// Intl's `currencyDisplay: 'narrowSymbol'` (es-ES) separates the amount from the
// symbol with a NON-breaking space (U+00A0), not a regular space — use this
// constant in literal expectations below to avoid a byte-for-byte mismatch.
const NBSP = ' ';

describe('formatDashboardNumber', () => {
  it('always uses en-US separators regardless requested locale', () => {
    assert.equal(
      formatDashboardNumber(3850.22, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      '3,850.22'
    );
    assert.equal(
      formatDashboardNumber(3850.22, 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      '3,850.22'
    );
  });
});

describe('formatDashboardAmount', () => {
  it('delegates to formatCurrency with es-ES separators and a currency symbol (not the ISO code)', () => {
    assert.equal(formatDashboardAmount(7284.2, 'EUR'), formatCurrency('EUR', 7284.2));
    assert.equal(formatDashboardAmount(7284.2, 'EUR'), `7.284,20${NBSP}€`);
  });

  it('ETP-4314 regression: never emits the literal ISO currency code as plain text', () => {
    const result = formatDashboardAmount(1234.5, 'EUR');
    assert.equal(result, formatCurrency('EUR', 1234.5));
    assert.equal(result.includes('EUR'), false);
    assert.equal(result, `1.234,50${NBSP}€`);
  });

  it('groups thousands with a period (es-ES) for values >= 1000', () => {
    assert.equal(formatDashboardAmount(180328.29, 'USD'), `180.328,29${NBSP}$`);
  });

  it('the 3rd argument (legacy locale) is ignored — output stays es-ES regardless', () => {
    assert.equal(formatDashboardAmount(7284.2, 'EUR', 'es-ES'), formatDashboardAmount(7284.2, 'EUR', 'en-US'));
    assert.equal(formatDashboardAmount(7284.2, 'EUR', 'en-US'), `7.284,20${NBSP}€`);
  });

  it('normalizes lowercase currency labels to uppercase code', () => {
    assert.equal(formatDashboardAmount(10, 'usd'), `10,00${NBSP}$`);
  });

  it('keeps sign before the amount for negative values (symbol still after the amount)', () => {
    assert.equal(formatDashboardAmount(-99.5, 'EUR'), `-99,50${NBSP}€`);
    assert.equal(formatDashboardAmount(-4.22, 'USD'), `-4,22${NBSP}$`);
  });

  it('falls back to plain es-ES numeric formatting when currency is missing', () => {
    assert.equal(formatDashboardAmount(7284.2, ''), '7.284,20');
  });
});

describe('formatDashboardCompact', () => {
  it('keeps compact suffix, now with the currency symbol instead of the ISO code prefix', () => {
    assert.equal(formatDashboardCompact(1500, { currencyLabel: 'EUR' }), `1,50${NBSP}€K`);
  });
});
