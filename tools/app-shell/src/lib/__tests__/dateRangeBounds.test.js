import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presetBounds, getDateBounds, toDateParam } from '../dateRangeBounds.js';

describe('dateRangeBounds helpers', () => {
  describe('presetBounds', () => {
    it('returns start-of-today..end-of-today for "today"', () => {
      const { from, to } = presetBounds('today');
      const today = new Date();
      assert.equal(from.getHours(), 0);
      assert.equal(from.getMinutes(), 0);
      assert.equal(to.getHours(), 23);
      assert.equal(to.getMinutes(), 59);
      assert.equal(to.getSeconds(), 59);
      assert.equal(to.getMilliseconds(), 999);
      assert.equal(from.getDate(), today.getDate());
      assert.equal(to.getDate(), today.getDate());
    });

    it('shifts both bounds back one day for "yesterday"', () => {
      const { from, to } = presetBounds('yesterday');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 1);
      assert.equal(from.getDate(), ref.getDate());
      assert.equal(to.getDate(), ref.getDate());
      assert.equal(to.getHours(), 23);
    });

    it('spans 7 calendar days (today - 6) for "last7"', () => {
      const { from, to } = presetBounds('last7');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 6);
      assert.equal(from.getTime(), ref.getTime());
      const expectedTo = new Date();
      expectedTo.setHours(23, 59, 59, 999);
      assert.equal(to.getTime(), expectedTo.getTime());
    });

    it('spans 30 calendar days (today - 29) for "last30"', () => {
      const { from } = presetBounds('last30');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 29);
      assert.equal(from.getTime(), ref.getTime());
    });

    it('goes back 12 months for "last12m"', () => {
      const { from } = presetBounds('last12m');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setMonth(ref.getMonth() - 12);
      assert.equal(from.getTime(), ref.getTime());
    });

    it('returns null for an unknown preset', () => {
      assert.equal(presetBounds('all-time'), null);
      assert.equal(presetBounds(undefined), null);
    });
  });

  describe('getDateBounds', () => {
    it('returns null bounds for a falsy range', () => {
      assert.deepEqual(getDateBounds(null), { from: null, to: null });
      assert.deepEqual(getDateBounds(undefined), { from: null, to: null });
    });

    it('delegates to presetBounds for a presetId range', () => {
      const direct = presetBounds('last7');
      const viaRange = getDateBounds({ presetId: 'last7' });
      assert.equal(viaRange.from.getTime(), direct.from.getTime());
      assert.equal(viaRange.to.getTime(), direct.to.getTime());
    });

    it('returns null bounds for an unknown presetId', () => {
      assert.deepEqual(getDateBounds({ presetId: 'nope' }), { from: null, to: null });
    });

    it('normalizes explicit from/to Dates to day start/end', () => {
      const from = new Date(2026, 0, 10, 9, 30, 15, 123);
      const to = new Date(2026, 0, 20, 9, 30, 15, 123);
      const bounds = getDateBounds({ from, to });
      assert.equal(bounds.from.getHours(), 0);
      assert.equal(bounds.from.getMinutes(), 0);
      assert.equal(bounds.to.getHours(), 23);
      assert.equal(bounds.to.getMilliseconds(), 999);
      // Does not mutate the originals (copies are made).
      assert.equal(from.getHours(), 9);
      assert.equal(to.getHours(), 9);
    });

    it('tolerates non-Date members in an explicit range', () => {
      const bounds = getDateBounds({ from: 'x', to: null });
      assert.equal(bounds.from, null);
      assert.equal(bounds.to, null);
    });
  });

  describe('toDateParam', () => {
    it('formats a valid Date as ISO yyyy-mm-dd', () => {
      assert.equal(toDateParam(new Date('2026-03-04T12:00:00Z')), '2026-03-04');
    });

    it('returns undefined for an invalid Date', () => {
      assert.equal(toDateParam(new Date('not-a-date')), undefined);
    });

    it('returns undefined for a non-Date value', () => {
      assert.equal(toDateParam(null), undefined);
      assert.equal(toDateParam('2026-03-04'), undefined);
      assert.equal(toDateParam(undefined), undefined);
    });
  });
});
