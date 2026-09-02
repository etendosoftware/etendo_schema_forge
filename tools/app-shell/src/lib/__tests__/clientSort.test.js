/**
 * clientSort — the comparator behind the three hand-rolled financial-account grids.
 *
 * Behavioural, not source-reading: this module is pure JS with no imports, so it runs
 * directly under the node test runner.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareCellValues, sortRows } from '../clientSort.js';

const keys = (rows) => rows.map((r) => r.k);

describe('compareCellValues — blanks', () => {
  // Blanks carry no ordering information, and flipping them to the top on a descending sort
  // would bury the rows the user actually asked to see.
  it('sorts every flavour of blank last, whatever it is compared against', () => {
    for (const blank of [null, undefined, '']) {
      assert.ok(compareCellValues(blank, 'a') > 0, `${String(blank)} vs string`);
      assert.ok(compareCellValues(blank, 0) > 0, `${String(blank)} vs 0`);
      assert.ok(compareCellValues('a', blank) < 0, `string vs ${String(blank)}`);
    }
  });

  it('treats two blanks as equal, so their original order is kept', () => {
    assert.equal(compareCellValues(null, undefined), 0);
    assert.equal(compareCellValues('', null), 0);
  });

  // 0 and false are real values, not blanks: a zero balance must sort among the numbers.
  it('does not mistake 0 or false for a blank', () => {
    assert.ok(compareCellValues(0, 5) < 0);
    assert.ok(compareCellValues(0, null) < 0);
    assert.ok(compareCellValues(false, true) < 0);
  });
});

describe('compareCellValues — types', () => {
  it('compares numbers numerically, not lexicographically', () => {
    assert.ok(compareCellValues(9, 10) < 0, '9 must come before 10');
    assert.ok(compareCellValues(-250, 100) < 0);
  });

  it('compares strings with locale collation', () => {
    // 'á' collates next to 'a' rather than after 'z' as its code point would put it.
    assert.ok(compareCellValues('ábaco', 'bar', 'es-ES') < 0);
  });

  it('orders embedded numbers naturally, so document numbers do not interleave', () => {
    assert.ok(compareCellValues('DOC-9', 'DOC-10', 'es-ES') < 0);
  });

  it('orders ISO-8601 dates chronologically as plain strings', () => {
    assert.ok(compareCellValues('2026-01-09T00:00:00Z', '2026-01-10T00:00:00Z') < 0);
    assert.ok(compareCellValues('2025-12-31T00:00:00Z', '2026-01-01T00:00:00Z') < 0);
  });
});

describe('sortRows', () => {
  const ROWS = [
    { k: 'a', n: 3, s: 'zeta' },
    { k: 'b', n: 1, s: 'alfa' },
    { k: 'c', n: 2, s: 'beta' },
  ];

  it('sorts ascending by default', () => {
    assert.deepEqual(keys(sortRows(ROWS, { key: 'n' })), ['b', 'c', 'a']);
  });

  it('reverses for descending', () => {
    assert.deepEqual(keys(sortRows(ROWS, { key: 'n', direction: 'desc' })), ['a', 'c', 'b']);
  });

  it('does not mutate the input', () => {
    const before = keys(ROWS);
    sortRows(ROWS, { key: 'n', direction: 'desc' });
    assert.deepEqual(keys(ROWS), before);
  });

  it('returns the rows untouched when there is no sort key', () => {
    assert.deepEqual(keys(sortRows(ROWS, { key: null })), ['a', 'b', 'c']);
    assert.deepEqual(keys(sortRows(ROWS, {})), ['a', 'b', 'c']);
  });

  it('survives a missing or non-array rows argument', () => {
    assert.deepEqual(sortRows(undefined, { key: 'n' }), []);
    assert.deepEqual(sortRows(null, { key: 'n' }), []);
  });

  // The whole reason accessors exist: in these grids the column name and the payload key
  // routinely differ (the movements grid renders `transactionDate` from `row.date`).
  it('reads through an accessor when the row property does not match the key', () => {
    const rows = [{ k: 'a', date: '2026-03-01' }, { k: 'b', date: '2026-01-01' }];
    const accessors = { transactionDate: (r) => r.date };
    assert.deepEqual(keys(sortRows(rows, { key: 'transactionDate', accessors })), ['b', 'a']);
  });

  it('falls back to the row property when the key has no accessor', () => {
    assert.deepEqual(keys(sortRows(ROWS, { key: 's', accessors: {} })), ['b', 'c', 'a']);
  });

  // Stability is what keeps equal rows in their backend order instead of shuffling between
  // renders — the memo can re-run any number of times.
  it('is stable for rows that tie on the sort key', () => {
    const rows = [{ k: 'a', g: 1 }, { k: 'b', g: 1 }, { k: 'c', g: 0 }, { k: 'd', g: 1 }];
    assert.deepEqual(keys(sortRows(rows, { key: 'g' })), ['c', 'a', 'b', 'd']);
  });

  // Sentinel/QA (ETP-5083) — BUG-1. `compareCellValues` alone always puts a blank last (see the
  // "compareCellValues — blanks" describe block above), but `sortRows` builds its comparator as
  // `sign * compareCellValues(...)` — a single multiplication applied to EVERY branch of
  // `compareCellValues`, including the blank-handling ones. That flips blank placement too
  // whenever `direction: 'desc'`, contradicting this file's own module doc comment ("Blank
  // values ... always sort LAST, in both directions"). Surfaces directly in
  // WarehouseTransactionsTable's Documento column (ETP-5083): descending-sorting Documento with
  // an undocumented row present floats that row to the TOP instead of the bottom. Pre-existing
  // shared code (also consumed by the financial-account detail tabs), not introduced by
  // ETP-5083's diff — reported, not fixed, per QA's own-bugs-are-reported-not-fixed rule.
  it('BUG: sign-flipping direction also flips the blank-handling branches, floating a blank to the top when direction is desc', () => {
    const rows = [{ k: 'a', v: null }, { k: 'b', v: 'X' }, { k: 'c', v: 'Y' }];
    // Spec (per this module's own doc comment): blank stays last regardless of direction.
    assert.deepEqual(keys(sortRows(rows, { key: 'v', direction: 'desc' })), ['c', 'b', 'a']);
  });
});
