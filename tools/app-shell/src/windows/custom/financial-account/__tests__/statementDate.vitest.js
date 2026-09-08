import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeStatementDate, isInvalidStatementDate } from '../statementDate.js';

/**
 * ETP-4954 — the one date parser for bank-statement imports.
 *
 * It lives apart from the pipeline that consumes it so the row validator in
 * `bankStatementImportFields.js` can reach it without an import cycle. Same split, and same
 * reason, as `statementAmount.js` — and the same three-way contract: a normalized value, a
 * blank cell (which is the required check's business, never this one's), and an unusable value.
 */
describe('normalizeStatementDate', () => {
  // Day-first is the contract for every separated form: all three of this app's locales
  // write dates that way and the downloadable template documents it. `01/08/2026` is
  // 1 August, never 8 January — reading it month-first would silently misfile a whole file.
  it('reads dd/MM/yyyy day-first', () => {
    assert.equal(normalizeStatementDate('01/08/2026'), '2026-08-01');
  });

  // What `parseXlsx` emits for a real Excel date cell, and what the CSV export writes.
  it('reads dd-MM-yyyy day-first', () => {
    assert.equal(normalizeStatementDate('01-08-2026'), '2026-08-01');
  });

  it('passes an ISO yyyy-MM-dd through unchanged', () => {
    assert.equal(normalizeStatementDate('2026-08-01'), '2026-08-01');
  });

  // Some bank exports use dots, with no zero padding.
  it('reads d.M.yyyy day-first and pads the parts', () => {
    assert.equal(normalizeStatementDate('1.8.2026'), '2026-08-01');
  });

  // A two-digit year is read as 20xx: bank statements are contemporary documents, and a
  // 19xx window would misfile every one of them.
  it('reads a two-digit year as 20xx', () => {
    assert.equal(normalizeStatementDate('01/08/26'), '2026-08-01');
  });

  it('never reads a separated date month-first', () => {
    // 12/08/2026 is ambiguous only to a reader; month-first would give 2026-12-08.
    assert.equal(normalizeStatementDate('12/08/2026'), '2026-08-12');
    // And a day above 12 cannot be a month at all, so this one would be rejected outright
    // by a month-first parser instead of merely shifted.
    assert.equal(normalizeStatementDate('31/08/2026'), '2026-08-31');
  });

  it('drops a time part, whichever separator carries it', () => {
    assert.equal(normalizeStatementDate('2026-08-01T13:45:00Z'), '2026-08-01');
    assert.equal(normalizeStatementDate('01/08/2026 13:45'), '2026-08-01');
  });

  // An impossible date must fail its row rather than roll over into the next month, which is
  // what a `new Date(...)` round-trip would silently do.
  it('rejects an impossible calendar date instead of rolling it over', () => {
    assert.equal(normalizeStatementDate('31/02/2026'), null);
    assert.equal(normalizeStatementDate('2026-02-31'), null);
    assert.equal(normalizeStatementDate('29/02/2026'), null, '2026 is not a leap year');
  });

  it('accepts a real leap day', () => {
    assert.equal(normalizeStatementDate('29/02/2024'), '2024-02-29');
  });

  it('rejects a month outside 1-12 and a zero day', () => {
    assert.equal(normalizeStatementDate('01/13/2026'), null);
    assert.equal(normalizeStatementDate('00/08/2026'), null);
  });

  it('returns null for an unrecognizable or blank cell', () => {
    assert.equal(normalizeStatementDate('basura'), null);
    assert.equal(normalizeStatementDate(''), null);
    assert.equal(normalizeStatementDate('   '), null);
    assert.equal(normalizeStatementDate(null), null);
    assert.equal(normalizeStatementDate(undefined), null);
  });

  // No `Date` is constructed for the calendar value, on purpose: `new Date('2026-08-01')` is
  // UTC midnight, and reading it back with local getters shifts the calendar day on any
  // negative-UTC host — the ETP-4031 / ETP-4850 bug class, which hit this very import flow.
  // Working purely on the string cannot shift a day, in any zone.
  describe('is timezone-independent (ETP-4031 / ETP-4850 bug class)', () => {
    const originalTz = process.env.TZ;

    // Buenos Aires (UTC-3) is the discriminator: a UTC-midnight parse read back with local
    // getters lands on the PREVIOUS day there. Madrid is the same-answer sanity check for a
    // realistic EU-deployed host, Kiritimati (UTC+14) the far side of the same axis.
    for (const tz of ['America/Argentina/Buenos_Aires', 'Europe/Madrid', 'Pacific/Kiritimati']) {
      it(`returns the same calendar day under host TZ=${tz}`, () => {
        process.env.TZ = tz;
        try {
          assert.equal(normalizeStatementDate('01/08/2026'), '2026-08-01');
          assert.equal(normalizeStatementDate('2026-08-01'), '2026-08-01');
          // Year boundaries are where a one-day shift is most visible.
          assert.equal(normalizeStatementDate('31/12/2026'), '2026-12-31');
          assert.equal(normalizeStatementDate('01/01/2026'), '2026-01-01');
          // The month-length lookup must not shift either.
          assert.equal(normalizeStatementDate('29/02/2024'), '2024-02-29');
          assert.equal(normalizeStatementDate('30/02/2024'), null);
        } finally {
          if (originalTz === undefined) delete process.env.TZ;
          else process.env.TZ = originalTz;
        }
      });
    }
  });
});

/**
 * The predicate that closes the hole the generic `validateRow` cannot see: its required check
 * only asks whether a cell is BLANK, and `31/02/2026` is not blank, so an unparseable date
 * passed every check and only failed later in `toPayloadLine`, where it became the literal
 * string `"nullT00:00:00Z"` in the `?action=create` payload — a silently corrupt line.
 */
describe('isInvalidStatementDate', () => {
  it('flags a well-formed but impossible date — the case that used to slip through', () => {
    assert.equal(isInvalidStatementDate('31/02/2026'), true);
    assert.equal(isInvalidStatementDate('2026-02-31'), true);
    assert.equal(isInvalidStatementDate('29/02/2026'), true);
  });

  it('flags a cell that is not a date at all', () => {
    assert.equal(isInvalidStatementDate('basura'), true);
    assert.equal(isInvalidStatementDate('01/2026'), true);
    assert.equal(isInvalidStatementDate('2026/08/01'), true);
  });

  // Blank is "the row says nothing about this field", which is the required check's business.
  // Reporting it here too would flag the same cell twice in the review queue.
  it('treats a blank cell as valid', () => {
    assert.equal(isInvalidStatementDate(''), false);
    assert.equal(isInvalidStatementDate('   '), false);
    assert.equal(isInvalidStatementDate(null), false);
    assert.equal(isInvalidStatementDate(undefined), false);
  });

  it('accepts every shape normalizeStatementDate understands', () => {
    for (const raw of ['01/08/2026', '01-08-2026', '2026-08-01', '1.8.2026', '01/08/26', '2026-08-01T13:45:00Z']) {
      assert.equal(isInvalidStatementDate(raw), false, `${raw} must be accepted`);
    }
  });
});
