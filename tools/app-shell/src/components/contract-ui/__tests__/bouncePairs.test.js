// @covers tools/app-shell/src/components/contract-ui/bouncePairs.js
/**
 * Unit tests for `bouncePairs.js` — the pure logic of the bank reconciliation bounce pairs
 * ("rebotes"). The backend detects them behind the `bank-bounce-suggestions` flag; this module only
 * reads what it answers (autoMatch groups with `kind: "bouncePair"`, `pendingLines` rows in the
 * `bounce` state with a `bouncePair` annotation, and the `status=discarded` rows with their
 * `bounceLink`). Contract: com.etendoerp.go docs/neo-headless.md §4.12.1.1.
 *
 * node:test on purpose: the module is plain `.js` so this runner can import it, same arrangement
 * as `reconciliationStatusFilter.test.js`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BOUNCE_PAIR_KIND,
  BOUNCE_STATE,
  DISCARDED_STATE,
  HIGH_CONFIDENCE,
  isBouncePairGroup,
  splitAutoMatchGroups,
  isAmbiguousPair,
  isSelectableGroup,
  defaultGroupChecked,
  bouncePairPayload,
  pairOriginalLines,
  daysBetween,
  bounceReason,
  pairNet,
  pendingLinesStatusParam,
  isBounceReviewLine,
  withDismissedPairs,
  countsWithDismissedPairs,
  bouncePanelModel,
  summarizeApplyResults,
} from '../bouncePairs.js';

const MODULE_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'bouncePairs.js'),
).href;

// --- Fixtures -------------------------------------------------------------

const ORIGINAL = { id: 'L-OUT', date: '2026-03-02', amount: -120.5, description: 'Transfer to ACME' };
const BOUNCE = { id: 'L-IN', date: '2026-03-05', amount: 120.5, description: 'DEVOLUCION ACME' };
const CAND_A = { id: 'L-OUT-A', date: '2026-03-01', amount: -80 };
const CAND_B = { id: 'L-OUT-B', date: '2026-03-03', amount: -80 };

function pairGroup(overrides = {}) {
  return {
    kind: BOUNCE_PAIR_KIND,
    groupKey: 'bp-1',
    confidence: 'review',
    statementLine: ORIGINAL,
    counterpartLine: BOUNCE,
    ...overrides,
  };
}

// --- Group classification ------------------------------------------------

describe('isBouncePairGroup / splitAutoMatchGroups', () => {
  it('reads only kind:"bouncePair" as a pair; a group without kind is a transaction group', () => {
    assert.equal(isBouncePairGroup(pairGroup()), true);
    assert.equal(isBouncePairGroup({ kind: 'transaction' }), false);
    assert.equal(isBouncePairGroup({}), false);
    assert.equal(isBouncePairGroup(null), false);
    assert.equal(isBouncePairGroup(undefined), false);
  });

  it('splits groups keeping the backend order inside each kind', () => {
    const t1 = { groupKey: 't1' };
    const t2 = { groupKey: 't2', kind: 'transaction' };
    const p1 = pairGroup({ groupKey: 'p1' });
    const p2 = pairGroup({ groupKey: 'p2' });
    const out = splitAutoMatchGroups([p1, t1, p2, t2]);
    assert.deepEqual(out.transactionGroups.map((g) => g.groupKey), ['t1', 't2']);
    assert.deepEqual(out.bouncePairs.map((g) => g.groupKey), ['p1', 'p2']);
  });

  it('treats the whole flag-off answer (no kind anywhere) as transaction groups', () => {
    const groups = [{ groupKey: 'a' }, { groupKey: 'b' }];
    const out = splitAutoMatchGroups(groups);
    assert.deepEqual(out.transactionGroups, groups);
    assert.deepEqual(out.bouncePairs, []);
  });

  it('tolerates a missing or null groups array', () => {
    assert.deepEqual(splitAutoMatchGroups(), { transactionGroups: [], bouncePairs: [] });
    assert.deepEqual(splitAutoMatchGroups(null), { transactionGroups: [], bouncePairs: [] });
  });
});

describe('isAmbiguousPair / isSelectableGroup / defaultGroupChecked', () => {
  it('reads ambiguous as a boolean', () => {
    assert.equal(isAmbiguousPair({ ambiguous: true }), true);
    assert.equal(isAmbiguousPair({ ambiguous: false }), false);
    assert.equal(isAmbiguousPair(null), false);
  });

  it('lets every transaction group be selected and start checked', () => {
    assert.equal(isSelectableGroup({ groupKey: 't' }), true);
    assert.equal(defaultGroupChecked({ groupKey: 't' }), true);
  });

  it('checks a high-confidence pair that names both lines', () => {
    const g = pairGroup({ confidence: HIGH_CONFIDENCE });
    assert.equal(isSelectableGroup(g), true);
    assert.equal(defaultGroupChecked(g), true);
  });

  it('leaves a pair to review selectable but unchecked', () => {
    const g = pairGroup({ confidence: 'review' });
    assert.equal(isSelectableGroup(g), true);
    assert.equal(defaultGroupChecked(g), false);
  });

  it('never lets an ambiguous pair be selected, even when marked high', () => {
    const g = pairGroup({ ambiguous: true, confidence: HIGH_CONFIDENCE, statementLine: null });
    assert.equal(isSelectableGroup(g), false);
    assert.equal(defaultGroupChecked(g), false);
  });

  it('never lets a pair missing either line id be selected', () => {
    assert.equal(isSelectableGroup(pairGroup({ statementLine: { date: '2026-03-01' } })), false);
    assert.equal(isSelectableGroup(pairGroup({ counterpartLine: null })), false);
    assert.equal(defaultGroupChecked(pairGroup({ confidence: HIGH_CONFIDENCE, counterpartLine: null })), false);
  });
});

describe('bouncePairPayload / pairOriginalLines', () => {
  it('builds the applySuggestions entry: original as statementLineId, bounce as counterpartLineId', () => {
    assert.deepEqual(bouncePairPayload(pairGroup()), {
      kind: 'bouncePair',
      statementLineId: 'L-OUT',
      counterpartLineId: 'L-IN',
    });
  });

  it('offers the original of a plain pair', () => {
    assert.deepEqual(pairOriginalLines(pairGroup()), [ORIGINAL]);
  });

  it('offers the candidates of an ambiguous pair, skipping empty entries', () => {
    const g = pairGroup({
      ambiguous: true,
      statementLine: null,
      candidates: [{ line: CAND_A }, null, { line: null }, { line: CAND_B }],
    });
    assert.deepEqual(pairOriginalLines(g), [CAND_A, CAND_B]);
  });

  it('offers nothing when a plain pair has no original', () => {
    assert.deepEqual(pairOriginalLines(pairGroup({ statementLine: null })), []);
    assert.deepEqual(pairOriginalLines(pairGroup({ ambiguous: true, statementLine: null })), []);
  });
});

// --- daysBetween ------------------------------------------------------------

describe('daysBetween', () => {
  it('counts whole days between two business dates', () => {
    assert.equal(daysBetween('2026-03-02', '2026-03-05'), 3);
    assert.equal(daysBetween('2026-03-05', '2026-03-05'), 0);
    assert.equal(daysBetween('2026-03-05', '2026-03-02'), -3);
  });

  it('reads only the date part of a timestamp', () => {
    assert.equal(daysBetween('2026-03-02T23:30:00-03:00', '2026-03-03T00:10:00Z'), 1);
  });

  it('answers null when either date is missing', () => {
    assert.equal(daysBetween(null, '2026-03-02'), null);
    assert.equal(daysBetween('2026-03-02', undefined), null);
    assert.equal(daysBetween('', ''), null);
  });

  // `new Date('2026-03-02')` is UTC midnight; under a negative offset its local day is the 1st.
  // daysBetween goes through parseCalendarDate, so the count must not depend on the host zone, and
  // Math.round must absorb the 23 h / 25 h DST days.
  const ZONES = ['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'Europe/Madrid', 'America/Los_Angeles'];
  for (const tz of ZONES) {
    it(`gives the same counts under TZ=${tz}, DST changes included`, () => {
      const script = `
        const { daysBetween } = await import(${JSON.stringify(MODULE_URL)});
        console.log(JSON.stringify([
          daysBetween('2026-03-02', '2026-03-05'),
          daysBetween('2026-03-28', '2026-03-30'),
          daysBetween('2026-10-24', '2026-10-26'),
          daysBetween('2026-03-07', '2026-03-09'),
          daysBetween('2026-11-01', '2026-11-02'),
          daysBetween('2026-12-31', '2027-01-01'),
        ]));`;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      assert.deepEqual(JSON.parse(out.trim()), [3, 2, 2, 2, 1, 1]);
    });
  }
});

// --- bounceReason -----------------------------------------------------------

describe('bounceReason — high confidence', () => {
  const SIGNALS = [
    ['pis_link', 'financeReconcileBounceSignalPisLink'],
    ['return_text', 'financeReconcileBounceSignalReturnText'],
    ['counterparty', 'financeReconcileBounceSignalCounterparty'],
  ];
  for (const [signal, key] of SIGNALS) {
    it(`names the "${signal}" signal`, () => {
      assert.deepEqual(
        bounceReason({ confidence: 'high', signal }, ORIGINAL, BOUNCE),
        { high: true, signalKey: key },
      );
    });
  }

  it('answers a null signal key for an unknown or missing signal', () => {
    assert.deepEqual(bounceReason({ confidence: 'high', signal: 'nope' }, ORIGINAL, BOUNCE), { high: true, signalKey: null });
    assert.deepEqual(bounceReason({ confidence: 'high' }, ORIGINAL, BOUNCE), { high: true, signalKey: null });
  });

  it('never reads an ambiguous pair as high', () => {
    const r = bounceReason({ confidence: 'high', ambiguous: true, candidates: [{}, {}] }, null, BOUNCE);
    assert.equal(r.high, false);
  });
});

describe('bounceReason — review reasons', () => {
  it('ambiguous with more than one candidate: the count', () => {
    assert.deepEqual(
      bounceReason({ confidence: 'review', ambiguous: true, candidates: [{}, {}, {}] }, null, BOUNCE),
      {
        high: false,
        shortKey: 'financeReconcileBounceReasonAmbiguousShort',
        longKey: 'financeReconcileBounceReasonAmbiguous',
        params: { count: 3 },
      },
    );
  });

  it('ambiguous seen from a candidate line (no candidates on the annotation): check the original', () => {
    const r = bounceReason({ role: 'candidate', ambiguous: true }, CAND_A, BOUNCE);
    assert.deepEqual(r, {
      high: false,
      shortKey: 'financeReconcileBounceReasonCheckShort',
      longKey: 'financeReconcileBounceReasonCheck',
      params: {},
    });
  });

  it('ambiguous with a single candidate left: check the original', () => {
    const r = bounceReason({ ambiguous: true, candidates: [{ line: CAND_A }] }, CAND_A, BOUNCE);
    assert.equal(r.shortKey, 'financeReconcileBounceReasonCheckShort');
  });

  it('only the counterparty matches', () => {
    assert.deepEqual(
      bounceReason({ confidence: 'review', signals: ['counterparty'] }, ORIGINAL, BOUNCE),
      {
        high: false,
        shortKey: 'financeReconcileBounceReasonCounterpartyShort',
        longKey: 'financeReconcileBounceReasonCounterparty',
        params: {},
      },
    );
  });

  it('wording but the bounce came N days later', () => {
    assert.deepEqual(
      bounceReason({ confidence: 'review', signals: ['return_text', 'counterparty'] }, ORIGINAL, BOUNCE),
      {
        high: false,
        shortKey: 'financeReconcileBounceReasonLateShort',
        longKey: 'financeReconcileBounceReasonLate',
        params: { days: 3 },
      },
    );
  });

  it('a payment link but the bounce came N days later', () => {
    const r = bounceReason({ confidence: 'review', signals: ['pis_link'] }, ORIGINAL, { ...BOUNCE, date: '2026-03-23' });
    assert.equal(r.longKey, 'financeReconcileBounceReasonLate');
    assert.deepEqual(r.params, { days: 21 });
  });

  it('a strong signal on the same day falls back to check', () => {
    const r = bounceReason({ confidence: 'review', signals: ['pis_link'] }, ORIGINAL, { ...BOUNCE, date: ORIGINAL.date });
    assert.equal(r.longKey, 'financeReconcileBounceReasonCheck');
  });

  it('a strong signal with an unknown original date falls back to check', () => {
    const r = bounceReason({ confidence: 'review', signals: ['return_text'] }, null, BOUNCE);
    assert.equal(r.longKey, 'financeReconcileBounceReasonCheck');
  });

  it('no signals at all: check', () => {
    assert.equal(bounceReason({ confidence: 'review' }, ORIGINAL, BOUNCE).longKey, 'financeReconcileBounceReasonCheck');
    assert.equal(bounceReason({ signals: 'pis_link' }, ORIGINAL, BOUNCE).longKey, 'financeReconcileBounceReasonCheck');
    assert.equal(bounceReason(null, null, null).longKey, 'financeReconcileBounceReasonCheck');
  });
});

// --- pairNet / pendingLinesStatusParam / isBounceReviewLine -------------------

describe('pairNet', () => {
  it('sums the two signed amounts rounded to cents (0 for a real bounce)', () => {
    assert.equal(pairNet(ORIGINAL, BOUNCE), 0);
    assert.equal(pairNet({ amount: '-10.10' }, { amount: '10.3' }), 0.2);
  });

  it('answers null when a line or an amount is missing', () => {
    assert.equal(pairNet(ORIGINAL, null), null);
    assert.equal(pairNet(null, BOUNCE), null);
    assert.equal(pairNet({ amount: null }, BOUNCE), null);
  });
});

describe('pendingLinesStatusParam', () => {
  it('asks for status=discarded only under the discarded filter', () => {
    assert.equal(pendingLinesStatusParam(DISCARDED_STATE), 'discarded');
  });

  it('sends nothing for every other filter (client-side over the default answer)', () => {
    for (const s of ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled', '', null, undefined]) {
      assert.equal(pendingLinesStatusParam(s), undefined, String(s));
    }
  });
});

describe('isBounceReviewLine', () => {
  it('is true for a discarded line and for a bounce line with its annotation', () => {
    assert.equal(isBounceReviewLine({ state: DISCARDED_STATE }), true);
    assert.equal(isBounceReviewLine({ state: BOUNCE_STATE, bouncePair: { role: 'bounce' } }), true);
  });

  it('is false for a bounce state without annotation, other states, and no line', () => {
    assert.equal(isBounceReviewLine({ state: BOUNCE_STATE }), false);
    assert.equal(isBounceReviewLine({ state: 'pending', bouncePair: { role: 'bounce' } }), false);
    assert.equal(isBounceReviewLine(null), false);
  });
});

// --- Dismissal --------------------------------------------------------------

describe('withDismissedPairs / countsWithDismissedPairs', () => {
  const lines = [
    { id: 'A', state: BOUNCE_STATE, bouncePair: { groupKey: 'g1', role: 'original' } },
    { id: 'B', state: BOUNCE_STATE, bouncePair: { groupKey: 'g1', role: 'bounce' } },
    { id: 'C', state: BOUNCE_STATE, bouncePair: { groupKey: 'g2', role: 'bounce' } },
    { id: 'D', state: 'suggested' },
  ];
  const counts = { all: 4, pending: 1, suggested: 1, bounce: 3 };

  it('turns every line of a dismissed pair back into a plain pending line', () => {
    const out = withDismissedPairs(lines, new Set(['g1']));
    assert.deepEqual(out[0], { id: 'A', state: 'pending' });
    assert.deepEqual(out[1], { id: 'B', state: 'pending' });
    assert.equal(out[2], lines[2]);
    assert.equal(out[3], lines[3]);
    assert.equal(lines[0].state, BOUNCE_STATE, 'the input is not mutated');
  });

  it('returns the same array when nothing is dismissed or nothing matches', () => {
    assert.equal(withDismissedPairs(lines, new Set()), lines);
    assert.equal(withDismissedPairs(lines, null), lines);
    assert.equal(withDismissedPairs(lines, new Set(['other'])), lines);
  });

  it('ignores a non-bounce line that still carries the dismissed key', () => {
    const odd = [{ id: 'X', state: 'pending', bouncePair: { groupKey: 'g1' } }];
    assert.equal(withDismissedPairs(odd, new Set(['g1'])), odd);
  });

  it('moves the dismissed lines from bounce to pending; all is unchanged', () => {
    assert.deepEqual(countsWithDismissedPairs(counts, lines, new Set(['g1'])), {
      all: 4, pending: 3, suggested: 1, bounce: 1,
    });
  });

  it('never lets bounce go negative', () => {
    assert.equal(countsWithDismissedPairs({ bounce: 1, pending: 0 }, lines, new Set(['g1'])).bounce, 0);
  });

  it('returns the same counts object when nothing changes', () => {
    assert.equal(countsWithDismissedPairs(counts, lines, new Set()), counts);
    assert.equal(countsWithDismissedPairs(counts, lines, new Set(['other'])), counts);
    const flagOff = { all: 1, pending: 1 };
    assert.equal(countsWithDismissedPairs(flagOff, lines, new Set(['g1'])), flagOff);
  });
});

// --- bouncePanelModel ---------------------------------------------------------

describe('bouncePanelModel — lines of a detected pair', () => {
  it('answers null for no line, a plain line, or a bounce line without annotation', () => {
    assert.equal(bouncePanelModel(null), null);
    assert.equal(bouncePanelModel({ id: 'X', state: 'pending' }), null);
    assert.equal(bouncePanelModel({ id: 'X', state: BOUNCE_STATE }), null);
  });

  it('original role: lists the bounce line, the selected line is the original', () => {
    const line = { ...ORIGINAL, state: BOUNCE_STATE,
      bouncePair: { role: 'original', groupKey: 'g1', confidence: 'high', signal: 'pis_link', counterpartLine: BOUNCE } };
    const m = bouncePanelModel(line);
    assert.equal(m.mode, BOUNCE_STATE);
    assert.equal(m.role, 'original');
    assert.deepEqual(m.rows, [BOUNCE]);
    assert.equal(m.rowBadge, 'bounce');
    assert.equal(m.selectable, false);
    assert.equal(m.chosenId, 'L-IN');
    assert.equal(m.other, BOUNCE);
    assert.deepEqual(m.reason, { high: true, signalKey: 'financeReconcileBounceSignalPisLink' });
    assert.deepEqual(m.discard, { statementLineId: 'L-OUT', counterpartLineId: 'L-IN' });
    assert.equal(m.net, 0);
  });

  it('candidate role: the bounce is the counterpart, the candidate the original, reason check', () => {
    const line = { ...CAND_A, state: BOUNCE_STATE,
      bouncePair: { role: 'candidate', groupKey: 'g2', ambiguous: true, counterpartLine: { id: 'L-IN2', date: '2026-03-04', amount: 80 } } };
    const m = bouncePanelModel(line);
    assert.equal(m.role, 'candidate');
    assert.deepEqual(m.discard, { statementLineId: 'L-OUT-A', counterpartLineId: 'L-IN2' });
    assert.equal(m.reason.longKey, 'financeReconcileBounceReasonCheck');
    assert.equal(m.net, 0);
  });

  it('original role without a counterpart: no rows, nothing to discard', () => {
    const m = bouncePanelModel({ ...ORIGINAL, state: BOUNCE_STATE, bouncePair: { role: 'original' } });
    assert.deepEqual(m.rows, []);
    assert.equal(m.discard, null);
    assert.equal(m.chosenId, null);
    assert.equal(m.net, null);
  });

  it('bounce role, plain pair: lists the original, already chosen', () => {
    const line = { ...BOUNCE, state: BOUNCE_STATE,
      bouncePair: { role: 'bounce', confidence: 'review', signals: ['return_text'], counterpartLine: ORIGINAL } };
    const m = bouncePanelModel(line);
    assert.equal(m.role, 'bounce');
    assert.deepEqual(m.rows, [ORIGINAL]);
    assert.equal(m.rowBadge, 'bounceOriginal');
    assert.equal(m.selectable, false);
    assert.equal(m.chosenId, 'L-OUT');
    assert.deepEqual(m.discard, { statementLineId: 'L-OUT', counterpartLineId: 'L-IN' });
    assert.deepEqual(m.reason.params, { days: 3 });
    assert.equal(m.net, 0);
  });

  it('bounce role, ambiguous pair: radio rows, nothing preselected, nothing to discard yet', () => {
    const line = { id: 'L-IN3', date: '2026-03-04', amount: 80, state: BOUNCE_STATE,
      bouncePair: { role: 'bounce', ambiguous: true, candidates: [{ line: CAND_A }, { line: CAND_B }] } };
    const m = bouncePanelModel(line);
    assert.deepEqual(m.rows, [CAND_A, CAND_B]);
    assert.equal(m.selectable, true);
    assert.equal(m.chosenId, null);
    assert.equal(m.other, null);
    assert.equal(m.discard, null);
    assert.deepEqual(m.reason.params, { count: 2 });
    assert.equal(m.net, null);
  });

  it('bounce role, ambiguous pair, original chosen: the discard body names it', () => {
    const line = { id: 'L-IN3', date: '2026-03-04', amount: 80, state: BOUNCE_STATE,
      bouncePair: { role: 'bounce', ambiguous: true, candidates: [{ line: CAND_A }, { line: CAND_B }] } };
    const m = bouncePanelModel(line, { chosenOriginalId: 'L-OUT-B' });
    assert.equal(m.chosenId, 'L-OUT-B');
    assert.equal(m.other, CAND_B);
    assert.deepEqual(m.discard, { statementLineId: 'L-OUT-B', counterpartLineId: 'L-IN3' });
    assert.equal(m.net, 0);
  });

  it('bounce role, ambiguous pair, an unknown chosen id is ignored', () => {
    const line = { id: 'L-IN3', state: BOUNCE_STATE,
      bouncePair: { role: 'bounce', ambiguous: true, candidates: [{ line: CAND_A }] } };
    assert.equal(bouncePanelModel(line, { chosenOriginalId: 'nope' }).discard, null);
  });
});

describe('bouncePanelModel — two ambiguous pairs sharing a candidate', () => {
  // Both offered (neo-headless.md §4.12.1.1): L-IN3 over [A, B] and L-IN4 over [B, C], sharing B.
  const CAND_C = { id: 'L-OUT-C', date: '2026-03-03', amount: -80 };
  const first = { id: 'L-IN3', date: '2026-03-04', amount: 80, state: BOUNCE_STATE,
    bouncePair: { groupKey: 'g-a', role: 'bounce', ambiguous: true, candidates: [{ line: CAND_A }, { line: CAND_B }] } };
  const second = { id: 'L-IN4', date: '2026-03-05', amount: 80, state: BOUNCE_STATE,
    bouncePair: { groupKey: 'g-b', role: 'bounce', ambiguous: true, candidates: [{ line: CAND_B }, { line: CAND_C }] } };

  it('lists each pair with its own two candidates and a "2 salidas posibles" reason', () => {
    const a = bouncePanelModel(first);
    const b = bouncePanelModel(second);
    assert.deepEqual(a.rows, [CAND_A, CAND_B]);
    assert.deepEqual(b.rows, [CAND_B, CAND_C]);
    assert.equal(a.reason.shortKey, 'financeReconcileBounceReasonAmbiguousShort');
    assert.deepEqual(a.reason.params, { count: 2 });
    assert.deepEqual(b.reason.params, { count: 2 });
  });

  it('choosing the shared candidate discards it against the bounce of the pair it was chosen in', () => {
    assert.deepEqual(bouncePanelModel(first, { chosenOriginalId: 'L-OUT-B' }).discard,
      { statementLineId: 'L-OUT-B', counterpartLineId: 'L-IN3' });
    assert.deepEqual(bouncePanelModel(second, { chosenOriginalId: 'L-OUT-B' }).discard,
      { statementLineId: 'L-OUT-B', counterpartLineId: 'L-IN4' });
    // A candidate of the other pair only is not an option here.
    assert.equal(bouncePanelModel(second, { chosenOriginalId: 'L-OUT-A' }).discard, null);
  });
});

describe('bouncePanelModel — discarded lines', () => {
  const partner = { id: 'L-IN', state: DISCARDED_STATE, amount: 120.5 };

  it('paired: lists the line it was discarded with, found in the discarded lines', () => {
    const line = { ...ORIGINAL, state: DISCARDED_STATE,
      bounceLink: { counterpartLineId: 'L-IN', signal: 'pis_link', confidence: 'high', discardedAt: '2026-03-10T10:00:00Z' } };
    const m = bouncePanelModel(line, { discardedLines: [line, partner] });
    assert.equal(m.mode, DISCARDED_STATE);
    assert.equal(m.paired, true);
    assert.deepEqual(m.rows, [partner]);
    assert.equal(m.rowBadge, DISCARDED_STATE);
    assert.equal(m.other, partner);
    assert.equal(m.link, line.bounceLink);
    assert.equal(m.net, 0);
  });

  it('paired but the counterpart is missing from the list: still paired, no row', () => {
    const line = { ...ORIGINAL, state: DISCARDED_STATE, bounceLink: { counterpartLineId: 'GONE' } };
    const m = bouncePanelModel(line, { discardedLines: [line] });
    assert.equal(m.paired, true);
    assert.deepEqual(m.rows, []);
    assert.equal(m.other, null);
    assert.equal(m.net, null);
  });

  it('alone (Classic per-line discard): not paired, no row, null link', () => {
    const m = bouncePanelModel({ ...ORIGINAL, state: DISCARDED_STATE, bounceLink: null });
    assert.equal(m.paired, false);
    assert.deepEqual(m.rows, []);
    assert.equal(m.link, null);
  });
});

// --- summarizeApplyResults ----------------------------------------------------

describe('summarizeApplyResults', () => {
  it('counts successful groups and pairs and collects the failures', () => {
    const fail = { kind: 'bouncePair', error: 'Has payment', code: 'HAS_PAYMENT' };
    const out = summarizeApplyResults([
      { groupKey: 't1' },
      { groupKey: 't2', kind: 'transaction' },
      { kind: 'bouncePair' },
      fail,
      { groupKey: 't3', error: 'boom' },
    ]);
    assert.equal(out.groupsOk, 2);
    assert.equal(out.pairsOk, 1);
    assert.equal(out.failures.length, 2);
    assert.equal(out.failures[0], fail);
  });

  it('answers zeros for no results', () => {
    assert.deepEqual(summarizeApplyResults(), { groupsOk: 0, pairsOk: 0, failures: [] });
    assert.deepEqual(summarizeApplyResults(null), { groupsOk: 0, pairsOk: 0, failures: [] });
  });
});
