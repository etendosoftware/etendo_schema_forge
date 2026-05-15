import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUSES, STATUS_COLOR, STATUS_ORDER,
  formatPeriod, formatAmount, fmtDecl,
} from '../fiscalModelsUtils.js';

describe('STATUSES — enum completeness', () => {
  it('has exactly 7 statuses', () => assert.equal(STATUSES.length, 7));
  it('includes omitido', () => assert.ok(STATUSES.includes('omitido')));
  it('includes pendiente', () => assert.ok(STATUSES.includes('pendiente')));
  it('includes borrador', () => assert.ok(STATUSES.includes('borrador')));
  it('includes listo', () => assert.ok(STATUSES.includes('listo')));
  it('includes presentado', () => assert.ok(STATUSES.includes('presentado')));
  it('includes presentadoOtra', () => assert.ok(STATUSES.includes('presentadoOtra')));
  it('includes presentadoAcuse', () => assert.ok(STATUSES.includes('presentadoAcuse')));
});

describe('STATUS_COLOR — all statuses have colors', () => {
  for (const s of ['omitido','pendiente','borrador','listo','presentado','presentadoOtra','presentadoAcuse']) {
    it(`${s} has a color`, () => assert.ok(typeof STATUS_COLOR[s] === 'string'));
  }
});

describe('STATUS_ORDER — free transitions', () => {
  it('contains all 7 statuses', () => assert.equal(STATUS_ORDER.length, 7));
  it('is an array', () => assert.ok(Array.isArray(STATUS_ORDER)));
});

describe('formatPeriod', () => {
  it('passes through quarter codes (T1, T4)', () => assert.equal(formatPeriod('T1'), 'T1'));
  it('converts two-digit month to NM format', () => assert.equal(formatPeriod('03'), '3M'));
  it('converts single-digit month string', () => assert.equal(formatPeriod('01'), '1M'));
  it('passes through unknown formats', () => assert.equal(formatPeriod('anual'), 'anual'));
  it('returns em-dash for null', () => assert.equal(formatPeriod(null), '—'));
  it('returns em-dash for undefined', () => assert.equal(formatPeriod(undefined), '—'));
});

describe('formatAmount', () => {
  it('returns em-dash for null', () => assert.equal(formatAmount(null), '—'));
  it('returns em-dash for undefined', () => assert.equal(formatAmount(undefined), '—'));
  it('formats positive number with € symbol', () => assert.match(formatAmount(12179.75), /€|EUR/));
  it('formats negative number with minus sign', () => assert.match(formatAmount(-100), /-/));
});

describe('fmtDecl', () => {
  it('formats a 303 quarterly declaration', () => {
    const result = fmtDecl({ model: '303', year: 2026, period: 'T1' });
    assert.ok(result.includes('303'));
    assert.ok(result.includes('2026'));
    assert.ok(result.includes('T1'));
  });
  it('formats a 349 monthly declaration', () => {
    const result = fmtDecl({ model: '349', year: 2026, period: '03' });
    assert.ok(result.includes('349'));
    assert.ok(result.includes('2026'));
  });
});
