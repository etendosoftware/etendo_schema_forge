import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSifEligibleByDate, isTbaiEligibleByDate } from '../fiscalTargets.js';
import { getPendingSifTargets } from '../sifSending.js';

// ---------------------------------------------------------------------------
// ETP-5046 — the fiscal adoption-date gate, pinned across timezones.
//
// `fiscalTargets.test.js` and `sifSending.test.js` already assert what this gate
// answers; what neither of them could assert is that the answer does not depend on
// where the browser is. That gap is exactly how the bug shipped: the gate compared a
// LOCAL-midnight reference day (`parseCalendarDate`) against a UTC instant
// (`new Date(adoptionRaw)`), two different reference frames, so the inclusive
// boundary returned true in UTC and false in every UTC+ zone. CI runs UTC and stayed
// green, while in Europe/Madrid — the zone these Spanish fiscal regimes (TicketBAI /
// SII / VERI*FACTU) actually serve — an invoice dated exactly on its organization's
// adoption day was silently never offered for sending.
//
// So the cases below are deliberately run under a MATRIX of host timezones rather
// than whichever one the runner happens to have. Every case must give the same
// answer in every zone; a case that only holds in UTC is the bug, not a passing test.
//
// ## Why `process.env.TZ` and not a separate per-TZ process
//
// Verified on this repo's Node (v22.x): assigning `process.env.TZ` mid-process takes
// effect on the very next `Date` construction — Node's env setter notifies V8 to drop
// its cached timezone. This file's own `only holds under the fixed implementation`
// assertions prove it empirically: they would be unreachable if the switch were a
// no-op, because every zone would just reproduce the host's answer. The repo already
// relies on this in a dozen places (`statementDate.vitest.js`,
// `MovementsTable.tz-bug.vitest.jsx`, `ImportStatementModal.vitest.jsx`, ...), so an
// out-of-process runner per zone would be a new, heavier mechanism for no extra
// coverage. `node --test` also gives each FILE its own process, so nothing here can
// leak into another spec even if a restore were missed — and each case restores the
// original TZ in a `finally` regardless.
// ---------------------------------------------------------------------------

/**
 * Europe/Madrid is the real client case and a UTC+ host — the zone the pre-fix gate
 * got wrong. Buenos Aires covers the UTC- side (where the pre-fix gate was wrong in
 * the OPPOSITE direction: it let a too-early document through). Kiritimati is the
 * +14 extreme, Kolkata a half-hour offset, and UTC the blind spot CI runs in.
 */
const ZONES = [
  'UTC',
  'Europe/Madrid',
  'America/Argentina/Buenos_Aires',
  'Pacific/Kiritimati',
  'Asia/Kolkata',
];

function withTimezone(tz, fn) {
  const originalTz = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
}

/**
 * Each case is a complete statement of the gate's contract for one (reference date,
 * adoption timestamp) pair. `redZones` records which zones would FAIL the case
 * against the pre-ETP-5046 implementation (`new Date(adoptionRaw)`); it is
 * documentation of the regression's shape, not an input to the assertions — the
 * assertion is always "the same answer in every zone".
 */
const CASES = [
  {
    name: 'a reference date well after the adoption date',
    reference: '2026-06-15',
    adoption: '2026-01-01T00:00:00.000Z',
    expected: true,
    redZones: 'none — a whole-month gap swamps any offset',
  },
  {
    // THE regression. Inclusive boundary: adoption at midnight means the adoption day
    // itself qualifies. Pre-fix this returned true only in UTC and UTC- zones.
    name: 'the inclusive boundary — reference date exactly on a midnight adoption day',
    reference: '2026-01-01',
    adoption: '2026-01-01T00:00:00.000Z',
    expected: true,
    redZones: 'every UTC+ zone (Madrid, Kiritimati, Kolkata)',
  },
  {
    // Classic parity. `ETGO_GET_TBAI_STATUS` and Classic's
    // `TO_TIMESTAMP(@DateInvoiced@, 'DD-MM-YYYY') >= conf.tbaisystemdate` compare the
    // document's midnight against the FULL adoption timestamp, so an adoption time of
    // day excludes that same day. This is also the guard against "fixing" ETP-5046 by
    // truncating the adoption side to a calendar day, which would flip this to true.
    name: 'Classic parity — an adoption time-of-day excludes that same day',
    reference: '2026-01-01',
    adoption: '2026-01-01T14:30:00.000Z',
    expected: false,
    redZones: 'none pre-fix, but every zone if the adoption side is day-truncated',
  },
  {
    name: 'a reference date one day before a midnight adoption date',
    reference: '2025-12-31',
    adoption: '2026-01-01T00:00:00.000Z',
    expected: false,
    redZones: 'none — no offset reaches a full day',
  },
  {
    // The mirror image of the boundary case, and the reason a UTC- zone belongs in the
    // matrix: pre-fix, Buenos Aires (UTC-3) pushed the reference day's midnight to
    // 03:00Z and so wrongly admitted a document dated before a 02:00 adoption moment.
    // A gate that is too PERMISSIVE is the worse failure — it offers a send the
    // backend will refuse.
    name: 'an early-morning adoption time still excludes that same day',
    reference: '2026-01-01',
    adoption: '2026-01-01T02:00:00.000Z',
    expected: false,
    redZones: 'UTC- zones (Buenos Aires)',
  },
  {
    // Year boundary, where a one-day shift is most visible, and a second UTC+
    // discriminator: pre-fix, Kiritimati (UTC+14) read the reference day as
    // 2025-12-31T10:00Z and so rejected a document the rule admits.
    name: 'a year-boundary adoption moment late on the previous day',
    reference: '2026-01-01',
    adoption: '2025-12-31T23:59:59.000Z',
    expected: true,
    redZones: 'every UTC+ zone',
  },
];

describe('isSifEligibleByDate — timezone independence (ETP-5046)', () => {
  for (const testCase of CASES) {
    describe(testCase.name, () => {
      for (const tz of ZONES) {
        it(`answers ${testCase.expected} under host TZ=${tz}`, () => {
          withTimezone(tz, () => {
            assert.equal(
              isSifEligibleByDate(testCase.reference, testCase.adoption),
              testCase.expected,
              `reference=${testCase.reference} adoption=${testCase.adoption} under ${tz}`,
            );
          });
        });
      }
    });
  }

  it('gives one single answer per case across the whole matrix', () => {
    // A belt-and-braces restatement of the property the per-zone cases assert one at a
    // time: collapse each case's answers into a Set and require exactly one member.
    // This is the assertion that fails loudest if a future change makes the gate
    // zone-dependent again in a way no individual expectation happens to cover.
    for (const testCase of CASES) {
      const answers = new Set();
      for (const tz of ZONES) {
        withTimezone(tz, () => {
          answers.add(isSifEligibleByDate(testCase.reference, testCase.adoption));
        });
      }
      assert.deepEqual(
        [...answers],
        [testCase.expected],
        `"${testCase.name}" disagreed across timezones`,
      );
    }
  });
});

describe('isTbaiEligibleByDate — the deprecated wrapper inherits the same independence', () => {
  // The wrapper is what `sifSending.js` historically called, so a regression that
  // reached only the wrapper would still hide the TicketBAI send action.
  for (const tz of ZONES) {
    it(`matches isSifEligibleByDate for every case under host TZ=${tz}`, () => {
      withTimezone(tz, () => {
        for (const testCase of CASES) {
          assert.equal(
            isTbaiEligibleByDate(testCase.reference, testCase.adoption),
            testCase.expected,
            `"${testCase.name}" under ${tz}`,
          );
        }
      });
    });
  }
});

describe('getPendingSifTargets — the TBAI send action is offered in every timezone', () => {
  // The gate in isolation is only half the story: what the user sees is whether the
  // "Send to SIF" action offers TicketBAI. This composes the gate with the profile and
  // sent-status checks, i.e. the exact surface ETP-5046 broke for Madrid users.
  const SALES_TBAI = ['sales-invoice', 'tbai'];

  for (const testCase of CASES) {
    describe(testCase.name, () => {
      for (const tz of ZONES) {
        it(`keeps sendTbai ${testCase.expected} under host TZ=${tz}`, () => {
          withTimezone(tz, () => {
            assert.deepEqual(
              getPendingSifTargets(
                ...SALES_TBAI,
                { tbaiIssent: false, invoiceDate: testCase.reference },
                null,
                { tbaisystemdate: testCase.adoption },
              ),
              { sendSii: false, sendTbai: testCase.expected },
              `invoiceDate=${testCase.reference} tbaisystemdate=${testCase.adoption} under ${tz}`,
            );
          });
        });
      }
    });
  }
});

describe('the timezone matrix itself is meaningful', () => {
  // A matrix that silently stopped switching zones would turn every assertion above
  // into a restatement of the host's behaviour — green forever, regression or not.
  // These two checks keep the harness honest.
  it('actually changes the local frame between zones', () => {
    const offsets = new Set();
    for (const tz of ZONES) {
      withTimezone(tz, () => {
        offsets.add(new Date(2026, 0, 1).getTimezoneOffset());
      });
    }
    assert.equal(
      offsets.size,
      ZONES.length,
      'each zone in the matrix must produce a distinct UTC offset',
    );
  });

  it('restores the original host timezone after each switch', () => {
    const before = process.env.TZ;
    withTimezone('Pacific/Kiritimati', () => {});
    assert.equal(process.env.TZ, before);
  });
});
