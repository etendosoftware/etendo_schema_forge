// @covers tools/app-shell/src/lib/dateFieldValidation.js
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dateFieldToastId, getDateFieldError, resolveMinDate } from '../dateFieldValidation.js';

/**
 * `minDate` on date fields (decisions.json → contract → FieldDef): the shared rule behind the
 * EntityForm commit toast and the useEntity save gate.
 *
 * Every reference "now" is built with the local-time Date constructor, never from a string, so
 * the tests pin the LOCAL calendar day the user sees.
 */

// A west-of-UTC host where 22:30 local is already the next day in UTC.
const WEST_TZ = 'America/Argentina/Buenos_Aires';

let originalTz;
beforeEach(() => {
  originalTz = process.env.TZ;
  process.env.TZ = WEST_TZ;
});
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

/** 2026-11-06 at the given local hour/minute. */
function localNov6(hours = 10, minutes = 0) {
  return new Date(2026, 10, 6, hours, minutes);
}

describe('resolveMinDate', () => {
  it('"today" is the local calendar day of the reference', () => {
    assert.equal(resolveMinDate('today', localNov6(10)), '2026-11-06');
  });

  it('"today" stays on the local day late in the evening west of UTC (no UTC slice)', () => {
    const lateEvening = localNov6(22, 30);
    // Sanity: in UTC this instant is already the 7th — a toISOString().slice(0, 10) would say so.
    assert.equal(lateEvening.toISOString().slice(0, 10), '2026-11-07');
    assert.equal(resolveMinDate('today', lateEvening), '2026-11-06');
  });

  it('a fixed yyyy-MM-dd is returned as is', () => {
    assert.equal(resolveMinDate('2026-12-01', localNov6()), '2026-12-01');
  });

  it('no minDate resolves to null', () => {
    assert.equal(resolveMinDate(undefined), null);
    assert.equal(resolveMinDate(null), null);
    assert.equal(resolveMinDate(''), null);
  });

  it('an unusable minDate is ignored (null) rather than blocking the user', () => {
    for (const bad of ['tomorrow', '2026/12/01', '01-12-2026', '2026-12-01T00:00:00Z', 20261201, {}]) {
      assert.equal(resolveMinDate(bad, localNov6()), null, `minDate ${JSON.stringify(bad)}`);
    }
  });
});

describe('getDateFieldError — minDate "today"', () => {
  const field = { key: 'dueDate', type: 'date', minDate: 'today' };
  const opts = () => ({ reference: localNov6(10) });

  it('accepts today and later', () => {
    assert.equal(getDateFieldError(field, '2026-11-06', undefined, opts()), null);
    assert.equal(getDateFieldError(field, '2026-11-07', undefined, opts()), null);
  });

  it('refuses a new value earlier than today with fieldMinDateError (no params)', () => {
    assert.deepEqual(getDateFieldError(field, '2026-11-05', undefined, opts()), {
      key: 'fieldMinDateError', params: {},
    });
  });

  it('late evening west of UTC: today still passes and yesterday is still refused', () => {
    const late = { reference: localNov6(22, 30) };
    assert.equal(getDateFieldError(field, '2026-11-06', undefined, late), null);
    assert.deepEqual(getDateFieldError(field, '2026-11-05', undefined, late), {
      key: 'fieldMinDateError', params: {},
    });
  });

  it('compares the calendar day of a full timestamp value', () => {
    assert.equal(getDateFieldError(field, '2026-11-06T00:00:00.000Z', undefined, opts()), null);
    assert.equal(getDateFieldError(field, '2026-11-05T23:59:59.000Z', undefined, opts())?.key, 'fieldMinDateError');
  });
});

describe('getDateFieldError — fixed minDate', () => {
  const field = { key: 'startDate', type: 'date', minDate: '2026-12-01' };

  it('accepts the minimum day itself and later', () => {
    assert.equal(getDateFieldError(field, '2026-12-01', undefined, { reference: localNov6() }), null);
    assert.equal(getDateFieldError(field, '2027-01-15', undefined, { reference: localNov6() }), null);
  });

  it('refuses an earlier day with fieldMinDateBeforeError and {min} formatted in the locale', () => {
    assert.deepEqual(
      getDateFieldError(field, '2026-11-30', undefined, { locale: 'es_ES', reference: localNov6() }),
      { key: 'fieldMinDateBeforeError', params: { min: '01/12/2026' } },
    );
    assert.deepEqual(
      getDateFieldError(field, '2026-11-30', undefined, { locale: 'en_US', reference: localNov6() }),
      { key: 'fieldMinDateBeforeError', params: { min: '12/01/2026' } },
    );
  });

  it('a fixed minimum does not move with the reference date', () => {
    // "today" is long past the minimum here: a value between the minimum and today passes.
    assert.equal(getDateFieldError(field, '2027-02-01', undefined, { reference: new Date(2027, 5, 1, 12) }), null);
  });
});

describe('getDateFieldError — values that never fail', () => {
  const field = { key: 'dueDate', type: 'date', minDate: 'today' };
  let reference;
  beforeEach(() => { reference = localNov6(); });

  it('an empty value is left to the required mechanism', () => {
    assert.equal(getDateFieldError(field, '', undefined, { reference }), null);
    assert.equal(getDateFieldError(field, null, undefined, { reference }), null);
    assert.equal(getDateFieldError(field, undefined, undefined, { reference }), null);
  });

  it('an unparseable value is not reported as a past date', () => {
    assert.equal(getDateFieldError(field, 'not a date', undefined, { reference }), null);
  });

  it('a field without minDate never validates', () => {
    assert.equal(getDateFieldError({ key: 'orderDate', type: 'date' }, '2000-01-01', undefined, { reference }), null);
    assert.equal(getDateFieldError(undefined, '2000-01-01', undefined, { reference }), null);
  });

  it('a field with an unusable minDate never validates', () => {
    assert.equal(getDateFieldError({ key: 'd', minDate: 'yesterday' }, '2000-01-01', undefined, { reference }), null);
  });
});

describe('getDateFieldError — only a NEW value is checked', () => {
  const field = { key: 'dueDate', type: 'date', minDate: 'today' };
  let reference;
  beforeEach(() => { reference = localNov6(); });

  it('the past value the record was loaded with passes', () => {
    assert.equal(getDateFieldError(field, '2026-10-01', '2026-10-01', { reference }), null);
  });

  it('a loaded full timestamp counts as the same day as its yyyy-MM-dd', () => {
    assert.equal(getDateFieldError(field, '2026-10-01', '2026-10-01T00:00:00.000Z', { reference }), null);
    assert.equal(getDateFieldError(field, '2026-10-01T00:00:00.000Z', '2026-10-01', { reference }), null);
  });

  it('a loaded Date object counts as the same calendar day', () => {
    assert.equal(getDateFieldError(field, '2026-10-01', new Date(2026, 9, 1), { reference }), null);
  });

  it('a past value changed to another past value is refused', () => {
    assert.deepEqual(getDateFieldError(field, '2026-10-02', '2026-10-01', { reference }), {
      key: 'fieldMinDateError', params: {},
    });
  });

  it('a future loaded value changed to a past one is refused', () => {
    assert.equal(getDateFieldError(field, '2026-11-01', '2026-12-24', { reference })?.key, 'fieldMinDateError');
  });

  it('an empty loaded value (a new record) checks every value', () => {
    assert.equal(getDateFieldError(field, '2026-10-01', '', { reference })?.key, 'fieldMinDateError');
    assert.equal(getDateFieldError(field, '2026-10-01', null, { reference })?.key, 'fieldMinDateError');
  });
});

describe('dateFieldToastId', () => {
  it('is stable per field key and distinct across keys', () => {
    assert.equal(dateFieldToastId('dueDate'), dateFieldToastId('dueDate'));
    assert.notEqual(dateFieldToastId('dueDate'), dateFieldToastId('startDate'));
  });

  it('does not collide with the numeric field toast id of the same key', async () => {
    const { numericFieldToastId } = await import('../numericValidation.js');
    assert.notEqual(dateFieldToastId('dueDate'), numericFieldToastId('dueDate'));
  });
});
