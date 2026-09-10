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
} from '../reconciliationStatusFilter.js';

/** The five exclusive states the backend can put on a line. */
const STATES = ['pending', 'suggested', 'byRule', 'difference', 'reconciled'];

/**
 * The contract as a table: for each line state, exactly which filter codes must show it.
 * Anything not listed must be filtered out.
 */
const EXPECTED_MATCHES = {
  pending: ['pending'],
  suggested: ['pending', 'suggested'],
  byRule: ['pending', 'byRule'],
  difference: ['pending', 'difference'],
  reconciled: ['reconciled'],
};

describe('STATUS_CODES', () => {
  it('lists the five filter codes in dropdown order', () => {
    assert.deepEqual(STATUS_CODES, ['pending', 'suggested', 'byRule', 'difference', 'reconciled']);
  });
});

describe('STATUS_MEMBERS', () => {
  it('maps pending to every non-reconciled state', () => {
    assert.deepEqual(STATUS_MEMBERS.pending, ['pending', 'suggested', 'byRule', 'difference']);
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
