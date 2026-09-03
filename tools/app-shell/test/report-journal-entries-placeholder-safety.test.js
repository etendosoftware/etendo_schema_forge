/**
 * ETP-5013 follow-up — regression guard for a real production break.
 *
 * The report's SQL is not run verbatim: `applyPlaceholders` (the shared
 * report-sql module) rewrites it first, and one of its rewrites turns
 * `= 'a,b'` into `IN ('a','b')` so a multi-select param can arrive as a
 * single comma-joined string:
 *
 *     q.replace(/=\s*'([^',]+(?:,[^',]+)+)'/g, ...)
 *
 * That regex only looks for an '=' followed by a quote — it cannot tell a
 * PARAMETER comparison from an '=' that is part of the query's own data. The
 * financial-account drill-down first shipped with `THEN 'txn=' || record_id`
 * in the SELECT list; the '=' sitting right before that closing quote opened
 * a false match that ran on to the NEXT quote in the query, swallowing the
 * commas between them and rewriting a whole chunk of the SELECT list as an
 * `IN (...)`. The report died with `syntax error at or near "','"`, and no
 * amount of unit-testing the raw contract SQL would have caught it, because
 * the raw SQL was perfectly valid — only the REWRITTEN SQL was broken.
 *
 * So this asserts the property that actually matters: the SQL this report
 * ships must still be intact after the engine has rewritten it, with no
 * parameters supplied (the "Generate report" default, which is exactly how
 * it broke).
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyPlaceholders } from '@etendosoftware/schema-forge-cli/src/report-sql.js';

const CONTRACT = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../artifacts/report-journal-entries/report-contract.json'), 'utf8'));

function rewrite(params = {}) {
  return applyPlaceholders(CONTRACT.sql.query, {
    clientId: '00000000000000000000000000000000',
    params,
    contract: CONTRACT,
    locale: 'en_US',
  });
}

describe('report-journal-entries — SQL survives applyPlaceholders (ETP-5013)', () => {
  it('keeps every projected drill-down column intact with no params supplied', () => {
    const sql = rewrite();
    for (const col of ['doc_window', 'doc_record_id', 'doc_query_key']) {
      assert.match(sql, new RegExp(`AS ${col}\\b`), `${col} was mangled by the rewrite`);
    }
  });

  it('never rewrites a piece of the SELECT list into an IN (...) list', () => {
    // The corrupted output looked like `'txnIN ('|| fa.record_id` — an IN
    // list injected in the middle of an expression, where a SELECT-list
    // rewrite can only ever be a bug.
    const sql = rewrite();
    assert.doesNotMatch(sql, /THEN\s+'[^']*IN\s*\(/i);
    assert.doesNotMatch(sql, /AS doc_[a-z_]*IN\s*\(/i);
  });

  it('injects no IN (...) at all when no multi-value param is supplied', () => {
    // The precise, non-heuristic form of the guard: with nothing multi-valued
    // in the request, the rewrite must be a no-op for IN lists. Counting is
    // what makes it exact — trying to spot "an '=' inside a literal" by regex
    // gives false positives on ordinary `x = 'y'` comparisons between two
    // separate literals, which are of course legitimate SQL.
    const before = (CONTRACT.sql.query.match(/IN\s*\(/gi) || []).length;
    const after = (rewrite().match(/IN\s*\(/gi) || []).length;
    assert.equal(after, before, 'the placeholder rewrite injected an IN (...) it should not have');
  });

  it('still rewrites a genuine multi-select param into an IN (...) list', () => {
    // The guard above must not be read as "the rewrite is bad" — it is load-
    // bearing for real multi-value filters, so prove it still fires.
    const sql = rewrite({ bPartnerId: 'bp-1,bp-2' });
    assert.match(sql, /IN \('bp-1','bp-2'\)/);
  });
});
