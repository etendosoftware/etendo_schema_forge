// @covers tools/app-shell/src/components/ui/date-time-field-model.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWallClock, joinWallClock, formatDateTimeText, maskDateTimeInput, parseDateTimeText, isAfterMax,
} from '../date-time-field-model.js';

const DMY = { order: ['day', 'month', 'year'], sep: '/' };

describe('wall-clock split / join', () => {
  it('splits yyyy-MM-ddTHH:mm[:ss] into day and minute, dropping the seconds', () => {
    assert.deepEqual(splitWallClock('2026-11-19T14:20:45'), { date: '2026-11-19', time: '14:20' });
    assert.equal(splitWallClock('2026-11-19'), null);
    assert.equal(splitWallClock(null), null);
  });

  for (const [date, time, expected] of [
    ['2026-11-19', '14:20', '2026-11-19T14:20:00'],
    ['2026-11-19', '9:05', '2026-11-19T09:05:00'],
    ['2026-11-19', '24:00', null],
    ['2026-11-19', '12:60', null],
    ['19/11/2026', '14:20', null],
  ]) {
    it(`join(${date}, ${time}) → ${expected}`, () => {
      assert.equal(joinWallClock(date, time), expected);
    });
  }
});

describe('display and typing', () => {
  it('displays a wall-clock value as dd/MM/yyyy HH:mm', () => {
    assert.equal(formatDateTimeText('2026-11-19T14:20:00', DMY), '19/11/2026 14:20');
    assert.equal(formatDateTimeText('', DMY), '');
  });

  it('inserts the separators while digits are typed', () => {
    assert.equal(maskDateTimeInput('19112026', DMY), '19/11/2026');
    assert.equal(maskDateTimeInput('1911202614', DMY), '19/11/2026 14');
    assert.equal(maskDateTimeInput('191120261420', DMY), '19/11/2026 14:20');
  });

  for (const [text, expected] of [
    ['19/11/2026 14:20', { ok: true, value: '2026-11-19T14:20:00' }],
    ['', { ok: true, value: '' }],
    ['19/11/2026', { ok: false }],
    ['31/02/2026 10:00', { ok: false }],
    ['19/11/2026 25:00', { ok: false }],
  ]) {
    it(`parses ${JSON.stringify(text)}`, () => {
      assert.deepEqual(parseDateTimeText(text, DMY), expected);
    });
  }
});

describe('isAfterMax', () => {
  for (const [value, max, expected] of [
    ['2026-11-19T14:21:00', '2026-11-19T14:20:00', true],
    ['2026-11-19T14:20:59', '2026-11-19T14:20:00', false],
    ['2026-11-18T23:59:00', '2026-11-19T00:00:00', false],
    ['2026-11-19T14:21:00', undefined, false],
  ]) {
    it(`${value} after ${max} → ${expected}`, () => {
      assert.equal(isAfterMax(value, max), expected);
    });
  }
});
