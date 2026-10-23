// @covers tools/app-shell/src/lib/paymentTermDays.js
/**
 * The number of days typed to create a payment term inline, and the order payment terms are
 * listed in a selector.
 *
 *   1. `validatePaymentTermDays` — empty → required; anything that is not an unsigned whole number
 *      → not-an-integer; a whole number outside 1–365 (signed negatives included) → out-of-range
 *      with `{ min, max }`; otherwise `{ ok: true, days }` after trimming.
 *   2. `leadingDays` — the leading whole number of a term name, `null` when there is none.
 *   3. `comparePaymentTermOptions` — names without a number first, then ascending by days
 *      (numeric, not alphabetical), ties by name.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePaymentTermDays,
  leadingDays,
  comparePaymentTermOptions,
  PAYMENT_TERM_DAYS_MIN,
  PAYMENT_TERM_DAYS_MAX,
  PAYMENT_TERM_DAYS_ERROR_KEYS,
} from '../paymentTermDays.js';

describe('validatePaymentTermDays', () => {
  describe('empty input → paymentTermDaysRequired', () => {
    for (const [label, raw] of [['empty string', ''], ['blanks only', '   '], ['null', null], ['undefined', undefined]]) {
      it(label, () => {
        assert.deepEqual(validatePaymentTermDays(raw), { ok: false, errorKey: 'paymentTermDaysRequired' });
      });
    }
  });

  describe('not a whole number → paymentTermDaysNotInteger', () => {
    for (const raw of ['abc', '7,5', '7.5', '50% 30 / 50% 60', '+5', '1e2', '30 días']) {
      it(JSON.stringify(raw), () => {
        assert.deepEqual(validatePaymentTermDays(raw), { ok: false, errorKey: 'paymentTermDaysNotInteger' });
      });
    }
  });

  describe('whole number outside 1–365 → paymentTermDaysOutOfRange with { min, max }', () => {
    for (const raw of ['0', '-5', '366', '000', '99999']) {
      it(JSON.stringify(raw), () => {
        assert.deepEqual(validatePaymentTermDays(raw), {
          ok: false,
          errorKey: 'paymentTermDaysOutOfRange',
          params: { min: 1, max: 365 },
        });
      });
    }
  });

  describe('valid input → { ok: true, days }', () => {
    for (const [raw, days] of [[' 12 ', 12], ['1', 1], ['365', 365], ['007', 7], [30, 30]]) {
      it(JSON.stringify(raw), () => {
        assert.deepEqual(validatePaymentTermDays(raw), { ok: true, days });
      });
    }
  });

  it('exposes the range and the error keys it reports', () => {
    assert.equal(PAYMENT_TERM_DAYS_MIN, 1);
    assert.equal(PAYMENT_TERM_DAYS_MAX, 365);
    assert.deepEqual({ ...PAYMENT_TERM_DAYS_ERROR_KEYS }, {
      empty: 'paymentTermDaysRequired',
      notInteger: 'paymentTermDaysNotInteger',
      outOfRange: 'paymentTermDaysOutOfRange',
    });
    assert.ok(Object.isFrozen(PAYMENT_TERM_DAYS_ERROR_KEYS));
  });
});

describe('leadingDays', () => {
  for (const [name, expected] of [
    ['30 Días', 30], ['1 Día', 1], ['  15 Días', 15], ['Inmediato', null], ['', null], [null, null], [undefined, null],
  ]) {
    it(`${JSON.stringify(name)} → ${expected}`, () => {
      assert.equal(leadingDays(name), expected);
    });
  }
});

describe('comparePaymentTermOptions', () => {
  const names = (opts) => opts.map((o) => o.name);

  it('lists Inmediato first, then by number of days ascending (numeric, not alphabetical)', () => {
    const shuffled = ['364 Días', '100 Días', '15 Días', 'Inmediato', '30 Días', '7 Días', '1 Día']
      .map((name) => ({ name }));
    assert.deepEqual(names([...shuffled].sort(comparePaymentTermOptions)),
      ['Inmediato', '1 Día', '7 Días', '15 Días', '30 Días', '100 Días', '364 Días']);
  });

  it('breaks a tie on the same number of days by name', () => {
    const opts = [{ name: '30 Días fin de mes' }, { name: '30 Días' }, { name: '30 Días + 5' }];
    assert.deepEqual(names([...opts].sort(comparePaymentTermOptions)),
      ['30 Días', '30 Días + 5', '30 Días fin de mes']);
  });

  it('orders names without a number among themselves by name, before every numbered one', () => {
    const opts = [{ name: '5 Días' }, { name: 'Contado' }, { name: 'A convenir' }];
    assert.deepEqual(names([...opts].sort(comparePaymentTermOptions)), ['A convenir', 'Contado', '5 Días']);
  });

  it('returns 0 for equal names and tolerates missing names / options', () => {
    assert.equal(comparePaymentTermOptions({ name: '30 Días' }, { name: '30 Días' }), 0);
    assert.equal(comparePaymentTermOptions({}, {}), 0);
    assert.ok(comparePaymentTermOptions(undefined, { name: '1 Día' }) < 0);
    assert.ok(comparePaymentTermOptions({ name: '1 Día' }, null) > 0);
  });
});
