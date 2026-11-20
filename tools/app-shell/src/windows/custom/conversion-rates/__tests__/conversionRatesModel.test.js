// @covers tools/app-shell/src/windows/custom/conversion-rates/conversionRatesModel.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenEnded, displayValidTo, formatWallClock } from '../conversionRatesModel.js';

describe('isOpenEnded', () => {
  for (const [validTo, expected] of [
    ['9999-12-31T00:00:00', true],
    ['2999-12-31T00:00:00', true],
    ['2998-12-31T23:59:00', false],
    ['2026-11-17T00:00:00', false],
    [null, true],
    ['', true],
  ]) {
    it(`${JSON.stringify(validTo)} → ${expected}`, () => {
      assert.equal(isOpenEnded(validTo), expected);
    });
  }
});

describe('displayValidTo', () => {
  for (const [label, row, expected] of [
    ['open range (9999) shows no end', { validFromDate: '2026-11-01T00:00:00', validToDate: '9999-12-31T00:00:00' }, null],
    ['open range (2999) shows no end', { validFromDate: '2026-11-01T00:00:00', validToDate: '2999-12-31T00:00:00', sMFCRSynced: true }, null],
    ['synced daily range closing at 00:00 shows 23:59 of that day',
      { validFromDate: '2026-11-17T00:00:00', validToDate: '2026-11-17T00:00:00', sMFCRSynced: true }, '17/11/2026 23:59'],
    ['synced range closing at another minute shows it as stored',
      { validFromDate: '2026-11-17T00:00:00', validToDate: '2026-11-17T10:15:00', sMFCRSynced: true }, '17/11/2026 10:15'],
    ['manual range closing at 00:00 keeps 00:00',
      { validFromDate: '2026-11-17T00:00:00', validToDate: '2026-11-18T00:00:00', sMFCRSynced: false }, '18/11/2026 00:00'],
    ['synced end at 00:00 before its start is not stretched',
      { validFromDate: '2026-11-18T09:00:00', validToDate: '2026-11-17T00:00:00', sMFCRSynced: true }, '17/11/2026 00:00'],
  ]) {
    it(label, () => {
      assert.equal(displayValidTo(row), expected);
    });
  }
});

describe('formatWallClock', () => {
  it('shows the stored wall clock as dd/MM/yyyy HH:mm, without timezone shift', () => {
    assert.equal(formatWallClock('2026-01-02T00:05:59'), '02/01/2026 00:05');
  });

  it('is empty for an unparseable value', () => {
    assert.equal(formatWallClock('not a date'), '');
  });
});
