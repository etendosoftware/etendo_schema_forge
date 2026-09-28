/**
 * ETP-5376 — regression guard for Debe/Haber row ordering in Libro Diario
 * (report-journal-entries).
 *
 * A `dc_priority` `CASE` expression computing "debit rows first, credit rows
 * second" has existed in this report's `GROUP BY` clause since its creation
 * (ETP-3636), but was never wired into the final `ORDER BY` — so rows within
 * a journal entry came out in arbitrary/insertion order. A real ticket showed
 * a journal entry rendering its Haber (credit) line before its Debe (debit)
 * line.
 *
 * The fix this session added `dc_priority` as a genuine projected column
 * (SELECT-list of the `je` CTE, duplicated verbatim in its `GROUP BY`) and
 * wired it into the outer `ORDER BY`. The FIRST attempt at this fix also
 * shipped with the polarity silently INVERTED (credit sorting before debit)
 * — caught only by manually running the SQL against a real Postgres DB and
 * eyeballing row order, because no test asserted row ORDER for this report.
 * This is that missing test.
 *
 * There is no live DB connection available from this repo's Node tests (the
 * SQL pipeline tooling lives in the sibling `schema_forge_core` repo), so
 * this is a static/structural test against the `report-contract.json`
 * `sql.query` string — it does not execute the SQL, but it would have caught
 * both failure modes seen this session:
 *   1. `dc_priority` missing from the final ORDER BY
 *   2. the CASE polarity inverted (credit before debit)
 *   3. the GROUP BY copy of the CASE expression drifting from the SELECT-list
 *      copy (a real Postgres "must appear in the GROUP BY clause" error)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACT = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../artifacts/report-journal-entries/report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;

/**
 * Given a string and the index of an opening '(', returns the substring from
 * that '(' up to (and including) its matching ')', by counting parenthesis
 * depth. Works regardless of internal nesting (e.g. `SIGN(x)` inside the
 * expression).
 */
function extractBalancedParens(str, openIndex) {
  assert.equal(str[openIndex], '(', `expected '(' at index ${openIndex}`);
  let depth = 0;
  for (let i = openIndex; i < str.length; i += 1) {
    if (str[i] === '(') depth += 1;
    else if (str[i] === ')') {
      depth -= 1;
      if (depth === 0) return str.slice(openIndex, i + 1);
    }
  }
  throw new Error('unbalanced parentheses — no matching close found');
}

function findAllOccurrences(str, needle) {
  const indices = [];
  let from = 0;
  for (;;) {
    const idx = str.indexOf(needle, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + needle.length;
  }
  return indices;
}

describe('report-journal-entries — dc_priority CASE expression (ETP-5376)', () => {
  it('appears exactly twice — once in the SELECT list, once duplicated in GROUP BY', () => {
    const occurrences = findAllOccurrences(SQL, '(CASE fa.amtacctdr WHEN 0');
    assert.equal(occurrences.length, 2,
      'expected the dc_priority CASE expression in exactly two places: the je CTE SELECT list and its GROUP BY clause');
  });

  it('the SELECT-list copy and the GROUP BY copy are byte-for-byte identical', () => {
    const occurrences = findAllOccurrences(SQL, '(CASE fa.amtacctdr WHEN 0');
    assert.equal(occurrences.length, 2, 'precondition: expected exactly two occurrences');
    const [selectExpr, groupByExpr] = occurrences.map((idx) => extractBalancedParens(SQL, idx));

    // The SELECT-list copy must be immediately followed by "AS dc_priority" —
    // confirms we extracted the right one, not some unrelated CASE.
    const afterSelect = SQL.slice(SQL.indexOf(selectExpr) + selectExpr.length, SQL.indexOf(selectExpr) + selectExpr.length + 20);
    assert.match(afterSelect, /^\s*AS dc_priority\b/, 'the SELECT-list copy must be aliased AS dc_priority');

    // A textual mismatch between the two copies breaks GROUP BY in Postgres
    // ("must appear in the GROUP BY clause") — this is the second real bug
    // found while fixing ETP-5376.
    assert.equal(groupByExpr, selectExpr,
      'the GROUP BY copy of the dc_priority expression must be textually identical to the SELECT-list copy');
  });

  it('gives debit rows (amtacctdr != 0) a strictly lower priority than credit rows (amtacctdr = 0)', () => {
    const idx = SQL.indexOf('(CASE fa.amtacctdr WHEN 0');
    const expr = extractBalancedParens(SQL, idx);

    // WHEN 0 branch = amtacctdr is zero -> credit row, keyed off amtacctcr's sign.
    const creditBranch = expr.match(/WHEN 0 THEN \(CASE SIGN\(fa\.amtacctcr\) WHEN -1 THEN (\d+) ELSE (\d+) END\)/);
    // ELSE branch = amtacctdr is non-zero -> debit row, keyed off amtacctdr's sign.
    const debitBranch = expr.match(/ELSE \(CASE SIGN\(fa\.amtacctdr\) WHEN -1 THEN (\d+) ELSE (\d+) END\)/);

    assert.ok(creditBranch, 'expected a credit-row (amtacctdr = 0) priority branch keyed off SIGN(fa.amtacctcr)');
    assert.ok(debitBranch, 'expected a debit-row (amtacctdr != 0) priority branch keyed off SIGN(fa.amtacctdr)');

    const creditPriorities = [Number(creditBranch[1]), Number(creditBranch[2])];
    const debitPriorities = [Number(debitBranch[1]), Number(debitBranch[2])];

    assert.ok(
      Math.max(...debitPriorities) < Math.min(...creditPriorities),
      `debit priorities ${JSON.stringify(debitPriorities)} must all be lower (sort earlier) than ` +
      `credit priorities ${JSON.stringify(creditPriorities)} — debit rows must render before credit rows`
    );
  });

  it('the final ORDER BY sorts by dc_priority, positioned after fact_acct_group_id and before the seqno tiebreak', () => {
    // The je CTE's own window function (`DENSE_RANK() OVER (ORDER BY ...)`)
    // also contains the literal "ORDER BY" — the clause that matters for row
    // rendering is the LAST one, outside the CTE.
    const idx = SQL.lastIndexOf('ORDER BY');
    assert.notEqual(idx, -1, 'expected an ORDER BY clause');
    const clause = SQL.slice(idx + 'ORDER BY'.length).trim();
    const columns = clause.split(',').map((c) => c.trim());

    assert.deepEqual(columns, ['dateacct', 'fact_acct_group_id', 'dc_priority', 'min_seqno'],
      'expected the final ORDER BY to be dateacct, fact_acct_group_id, dc_priority, min_seqno — in that order');
  });
});
