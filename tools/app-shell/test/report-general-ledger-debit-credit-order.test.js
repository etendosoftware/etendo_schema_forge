/**
 * ETP-5376 — regression guard for Debe/Haber row ordering in Libro Mayor
 * (report-general-ledger).
 *
 * Same underlying bug and same fix shape as report-journal-entries (see
 * report-journal-entries-debit-credit-order.test.js for the full history):
 * a `dc_priority` CASE expression ("debit rows first, credit rows second")
 * is projected in the flat SELECT and must be wired into the final
 * ORDER BY, with debit strictly sorting before credit.
 *
 * report-general-ledger has no CTE and no GROUP BY (it's a flat SELECT), so
 * unlike report-journal-entries there is no duplicated-expression hazard —
 * but the same two failure modes from this session still apply here:
 *   1. dc_priority missing from the final ORDER BY
 *   2. the CASE polarity inverted (credit before debit)
 *
 * Static/structural test against report-contract.json — no live DB
 * connection is available from this repo's Node tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACT = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../artifacts/report-general-ledger/report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;

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

describe('report-general-ledger — dc_priority CASE expression (ETP-5376)', () => {
  it('appears exactly once as a projected column, aliased AS dc_priority', () => {
    const occurrences = (SQL.match(/\(CASE fa\.amtacctdr WHEN 0/g) || []).length;
    assert.equal(occurrences, 1,
      'expected the dc_priority CASE expression exactly once — this report has no CTE/GROUP BY duplication hazard');

    const idx = SQL.indexOf('(CASE fa.amtacctdr WHEN 0');
    const expr = extractBalancedParens(SQL, idx);
    const after = SQL.slice(idx + expr.length, idx + expr.length + 20);
    assert.match(after, /^\s*AS dc_priority\b/, 'the CASE expression must be aliased AS dc_priority');
  });

  it('gives debit rows (amtacctdr != 0) a strictly lower priority than credit rows (amtacctdr = 0)', () => {
    const idx = SQL.indexOf('(CASE fa.amtacctdr WHEN 0');
    const expr = extractBalancedParens(SQL, idx);

    const creditBranch = expr.match(/WHEN 0 THEN \(CASE SIGN\(fa\.amtacctcr\) WHEN -1 THEN (\d+) ELSE (\d+) END\)/);
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
    const idx = SQL.lastIndexOf('ORDER BY');
    assert.notEqual(idx, -1, 'expected an ORDER BY clause');
    const clause = SQL.slice(idx + 'ORDER BY'.length).trim();
    const columns = clause.split(',').map((c) => c.trim());

    assert.deepEqual(
      columns,
      ['ev.value', 'ev.name', 'fa.dateacct', 'fa.fact_acct_group_id', 'dc_priority', 'fa.seqno'],
      'expected the final ORDER BY to be ev.value, ev.name, fa.dateacct, fa.fact_acct_group_id, dc_priority, fa.seqno — in that order'
    );
  });

  it('the openingQuery (opening-balance aggregation) is untouched — it has no per-row ordering concept', () => {
    // Sanity guard: dc_priority is a row-ordering concern for the detail
    // query only. The opening-balance query is a pre-aggregated SUM() with
    // no per-row Debe/Haber rendering, so it must NOT have grown a
    // dc_priority column of its own.
    assert.ok(CONTRACT.sql.openingQuery, 'expected an openingQuery to exist');
    assert.doesNotMatch(CONTRACT.sql.openingQuery, /dc_priority/);
  });
});
