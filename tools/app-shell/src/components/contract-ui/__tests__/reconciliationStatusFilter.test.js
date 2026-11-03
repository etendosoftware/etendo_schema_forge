// @covers tools/app-shell/src/components/contract-ui/reconciliationStatusFilter.js
/**
 * Unit tests for `reconciliationStatusFilter.js` — the pure membership logic behind the bank
 * reconciliation left-panel status filter.
 *
 * node:test (not vitest) on purpose: the module is deliberately a plain `.js` sibling of the
 * `.jsx` panel precisely so this runner can import it without a JSX transform — same arrangement
 * as `reconciliationDifferenceMath.test.js`.
 *
 * ETP-5033 — the regression this file guards. The backend assigns each statement line exactly ONE
 * `state` out of pending / suggested / byRule / difference / reconciled, and the panel used to
 * filter with strict equality (`(l.state || 'pending') !== leftStatus`). Since 'pending' is also
 * the DEFAULT filter, opening the panel hid every suggested / byRule / difference line — the very
 * lines the user has to act on. 'pending' must therefore mean "everything not reconciled"; the
 * other codes stay strict subsets, and a falsy filter is the "Todos" entry.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_CODES,
  STATUS_MEMBERS,
  matchesStatus,
  countForStatus,
  visibleStatusCodes,
} from '../reconciliationStatusFilter.js';

/**
 * The exclusive states the backend can put on a line. `bounce` (flag `bank-bounce-suggestions` on)
 * and `discarded` (served only by `pendingLines?status=discarded`) were added by ETP-5581.
 */
const STATES = ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled', 'discarded'];

/**
 * The contract as a table: for each line state, exactly which filter codes must show it.
 * Anything not listed must be filtered out.
 */
const EXPECTED_MATCHES = {
  pending: ['pending'],
  suggested: ['pending', 'suggested'],
  byRule: ['pending', 'byRule'],
  difference: ['pending', 'difference'],
  // A possible bounce still needs the user to act, so it is a kind of pending.
  bounce: ['pending', 'bounce'],
  reconciled: ['reconciled'],
  // A discarded line is out of the reconciliation: only its own filter shows it.
  discarded: ['discarded'],
};

describe('STATUS_CODES', () => {
  // ETP-5581 added `bounce` and `discarded` (last); the dropdown offers them only when the backend
  // reports them (visibleStatusCodes).
  it('lists the filter codes in dropdown order', () => {
    assert.deepEqual(STATUS_CODES, ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled', 'discarded']);
  });
});

describe('STATUS_MEMBERS', () => {
  it('maps pending to every non-reconciled state', () => {
    assert.deepEqual(STATUS_MEMBERS.pending, ['pending', 'suggested', 'byRule', 'difference', 'bounce']);
  });

  it('keeps the other codes as strict single-state subsets', () => {
    assert.deepEqual(STATUS_MEMBERS.suggested, ['suggested']);
    assert.deepEqual(STATUS_MEMBERS.byRule, ['byRule']);
    assert.deepEqual(STATUS_MEMBERS.difference, ['difference']);
    assert.deepEqual(STATUS_MEMBERS.reconciled, ['reconciled']);
  });

  it('has an entry for every filter code', () => {
    for (const code of STATUS_CODES) {
      assert.ok(Array.isArray(STATUS_MEMBERS[code]), `missing members for ${code}`);
    }
  });

  it('never puts reconciled under a non-reconciled code', () => {
    for (const code of ['pending', 'suggested', 'byRule', 'difference']) {
      assert.ok(!STATUS_MEMBERS[code].includes('reconciled'), `${code} must not cover reconciled`);
    }
  });

  it('keeps bounce and discarded as strict single-state codes', () => {
    assert.deepEqual(STATUS_MEMBERS.bounce, ['bounce']);
    assert.deepEqual(STATUS_MEMBERS.discarded, ['discarded']);
  });

  it('never puts a discarded line under any other code', () => {
    for (const code of STATUS_CODES.filter((c) => c !== 'discarded')) {
      assert.ok(!STATUS_MEMBERS[code].includes('discarded'), `${code} must not cover discarded`);
    }
  });
});

describe('visibleStatusCodes — the dropdown entries offered for the counts (ETP-5581)', () => {
  /** The five entries an account without the flag and without discarded lines had before. */
  const FLAG_OFF_CODES = ['pending', 'suggested', 'byRule', 'difference', 'reconciled'];

  it('offers exactly the five previous codes when the backend reports neither bounce nor discarded', () => {
    const counts = { all: 4, pending: 2, suggested: 1, byRule: 0, difference: 1, reconciled: 0 };
    assert.deepEqual(visibleStatusCodes(counts, 'pending'), FLAG_OFF_CODES);
  });

  it('offers the five codes for absent counts', () => {
    assert.deepEqual(visibleStatusCodes(undefined, 'pending'), FLAG_OFF_CODES);
    assert.deepEqual(visibleStatusCodes(null, null), FLAG_OFF_CODES);
  });

  it('offers the five codes when counts.discarded is 0 and there is no counts.bounce', () => {
    assert.deepEqual(visibleStatusCodes({ pending: 1, discarded: 0 }, 'pending'), FLAG_OFF_CODES);
  });

  // The backend only sends counts.discarded with the flag on, next to counts.bounce; reading a
  // positive count on its own as "offer the entry" is a defensive fallback, not a real answer.
  it('adds discarded (last) for a positive discarded count even without counts.bounce (defensive)', () => {
    assert.deepEqual(
      visibleStatusCodes({ pending: 1, discarded: 2 }, 'pending'),
      [...FLAG_OFF_CODES, 'discarded'],
    );
  });

  it('reads a numeric-string discarded count', () => {
    assert.ok(visibleStatusCodes({ discarded: '3' }, 'pending').includes('discarded'));
  });

  it('adds bounce and discarded when counts.bounce is present, even at 0', () => {
    assert.deepEqual(
      visibleStatusCodes({ pending: 1, bounce: 0 }, 'pending'),
      ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled', 'discarded'],
    );
  });

  it('keeps the active code even when the counts would hide it', () => {
    // After restoring the last discarded line the filter is still `discarded`: the trigger must
    // never name an entry the list no longer has.
    assert.ok(visibleStatusCodes({ pending: 1, discarded: 0 }, 'discarded').includes('discarded'));
    assert.ok(visibleStatusCodes({ pending: 1 }, 'bounce').includes('bounce'));
  });

  it('keeps the dropdown order when the active code is re-added', () => {
    assert.deepEqual(visibleStatusCodes({}, 'bounce'), ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled']);
  });
});

describe('matchesStatus — the full state x filter matrix', () => {
  for (const state of STATES) {
    it(`shows a '${state}' line under exactly [${EXPECTED_MATCHES[state].join(', ')}]`, () => {
      for (const code of STATUS_CODES) {
        const expected = EXPECTED_MATCHES[state].includes(code);
        assert.equal(
          matchesStatus(state, code),
          expected,
          `state '${state}' under filter '${code}' should be ${expected}`,
        );
      }
    });
  }
});

describe("matchesStatus — the 'pending' filter means 'not reconciled' (ETP-5033)", () => {
  it('shows a suggested line', () => {
    assert.equal(matchesStatus('suggested', 'pending'), true);
  });

  it('shows a by-rule line', () => {
    assert.equal(matchesStatus('byRule', 'pending'), true);
  });

  it('shows a difference line', () => {
    assert.equal(matchesStatus('difference', 'pending'), true);
  });

  it('still shows a plain pending line', () => {
    assert.equal(matchesStatus('pending', 'pending'), true);
  });

  it('hides a reconciled line — that is the one state it must exclude', () => {
    assert.equal(matchesStatus('reconciled', 'pending'), false);
  });
});

describe('matchesStatus — the "Todos" entry (falsy filter)', () => {
  for (const state of STATES) {
    it(`shows a '${state}' line for null, undefined and empty-string filters`, () => {
      assert.equal(matchesStatus(state, null), true);
      assert.equal(matchesStatus(state, undefined), true);
      assert.equal(matchesStatus(state, ''), true);
    });
  }

  it('shows a stateless line too', () => {
    assert.equal(matchesStatus(undefined, null), true);
    assert.equal(matchesStatus(null, ''), true);
  });
});

describe("matchesStatus — a missing state defaults to 'pending'", () => {
  it('shows an undefined/null/empty state under the pending filter', () => {
    assert.equal(matchesStatus(undefined, 'pending'), true);
    assert.equal(matchesStatus(null, 'pending'), true);
    assert.equal(matchesStatus('', 'pending'), true);
  });

  it('hides an undefined state under the reconciled filter', () => {
    assert.equal(matchesStatus(undefined, 'reconciled'), false);
    assert.equal(matchesStatus(null, 'reconciled'), false);
  });

  it('hides an undefined state under the strict non-pending codes', () => {
    for (const code of ['suggested', 'byRule', 'difference']) {
      assert.equal(matchesStatus(undefined, code), false, `undefined state under '${code}'`);
    }
  });
});

describe('matchesStatus — an unknown filter code falls back to strict equality', () => {
  it('matches a state whose name equals the unknown code', () => {
    assert.equal(matchesStatus('archived', 'archived'), true);
  });

  it('does not match any other state', () => {
    assert.equal(matchesStatus('pending', 'archived'), false);
    assert.equal(matchesStatus('suggested', 'archived'), false);
    assert.equal(matchesStatus('reconciled', 'archived'), false);
  });

  it("treats a missing state as 'pending' for the fallback too", () => {
    assert.equal(matchesStatus(undefined, 'archived'), false);
    // A stateless line is 'pending', so an unknown code spelled 'pending' still matches it.
    assert.equal(matchesStatus(undefined, 'pending'), true);
  });
});

describe('matchesStatus — bounce and discarded lines (ETP-5581)', () => {
  it('shows a bounce line under pending, the default filter', () => {
    assert.equal(matchesStatus('bounce', 'pending'), true);
  });

  it('hides a discarded line under pending and under the strict codes', () => {
    for (const code of ['pending', 'suggested', 'byRule', 'difference', 'bounce', 'reconciled']) {
      assert.equal(matchesStatus('discarded', code), false, `discarded under '${code}'`);
    }
  });

  it('hides a stateless line under bounce and discarded', () => {
    assert.equal(matchesStatus(undefined, 'bounce'), false);
    assert.equal(matchesStatus(undefined, 'discarded'), false);
  });
});

describe('countForStatus', () => {
  /** The counts payload the backend returns alongside the lines. */
  const COUNTS = { all: 5, pending: 3, suggested: 1, byRule: 0, difference: 1, reconciled: 0 };

  it('sums the four non-reconciled members for pending', () => {
    // 3 pending + 1 suggested + 0 byRule + 1 difference = 5.
    assert.equal(countForStatus(COUNTS, 'pending'), 5);
  });

  it('returns just its own count for a strict code', () => {
    assert.equal(countForStatus(COUNTS, 'suggested'), 1);
    assert.equal(countForStatus(COUNTS, 'byRule'), 0);
    assert.equal(countForStatus(COUNTS, 'difference'), 1);
    assert.equal(countForStatus(COUNTS, 'reconciled'), 0);
  });

  it('adds counts.bounce to the pending sum and never counts.discarded', () => {
    // 3 + 1 + 0 + 1 + 2 bounce = 7; the 4 discarded lines are not pending.
    assert.equal(countForStatus({ ...COUNTS, bounce: 2, discarded: 4 }, 'pending'), 7);
    assert.equal(countForStatus({ ...COUNTS, bounce: 2, discarded: 4 }, 'bounce'), 2);
    assert.equal(countForStatus({ ...COUNTS, bounce: 2, discarded: 4 }, 'discarded'), 4);
  });

  it('excludes reconciled from the pending sum', () => {
    assert.equal(countForStatus({ ...COUNTS, reconciled: 42 }, 'pending'), 5);
  });

  it('treats missing member keys as 0', () => {
    assert.equal(countForStatus({ pending: 2 }, 'pending'), 2);
    assert.equal(countForStatus({ suggested: 4 }, 'pending'), 4);
    assert.equal(countForStatus({ pending: 2 }, 'suggested'), 0);
  });

  it('tolerates an absent counts payload', () => {
    assert.equal(countForStatus(undefined, 'pending'), 0);
    assert.equal(countForStatus(null, 'pending'), 0);
    assert.equal(countForStatus({}, 'pending'), 0);
    assert.equal(countForStatus(undefined, 'reconciled'), 0);
  });

  it('reads the raw key for a code outside the members map', () => {
    // 'all' is not a filter code — the dropdown's "Todos" entry reads counts.all straight.
    assert.equal(countForStatus(COUNTS, 'all'), 5);
    assert.equal(countForStatus(COUNTS, 'archived'), 0);
    assert.equal(countForStatus(undefined, 'all'), 0);
  });

  it('always returns a number, never undefined or NaN', () => {
    for (const code of [...STATUS_CODES, 'all', 'archived']) {
      const n = countForStatus(COUNTS, code);
      assert.equal(typeof n, 'number', `count for '${code}' must be a number`);
      assert.ok(!Number.isNaN(n), `count for '${code}' must not be NaN`);
    }
  });
});
