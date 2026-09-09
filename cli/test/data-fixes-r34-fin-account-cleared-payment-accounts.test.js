import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R34 corrective data-fix
 * (20260908T120000Z__R34-fin-account-cleared-payment-accounts.sql, ETP-5207, gap A9).
 *
 * Core's AFTER INSERT trigger FIN_FINANCIAL_ACCOUNT_TRG seeds FIN_FINANCIAL_ACCOUNT_ACCT's
 * fin_in_clear_acct/fin_out_clear_acct with the ledger asset account (57200000), and a non-null
 * cleared account is exactly what makes DocFINReconciliation queue a reconciliation for posting —
 * generating the unwanted entries ETP-5207 reports. The functional default for every account type
 * is EMPTY. This fix blanks both columns on already-provisioned tenants; the runtime and
 * onboarding fronts ship in com.etendoerp.go.
 *
 * Scope is deliberately ALL accounts, including those that already have POSTED reconciliations: an
 * earlier draft skipped those, but leaving them configured means they can still post NEW
 * reconciliations, which defeats the point of the ticket. Product owner's explicit call, with the
 * trade-off accepted (existing FACT_ACCT entries are untouched, but those old documents can no
 * longer be re-posted identically). The tests below assert that scope, so re-adding a
 * posted-reconciliation guard is a visible change, not a silent narrowing.
 *
 * ONE guard survives and must stay mirrored between @check and @apply: Bank rows missing
 * bankfee/revaluation accounts are skipped, because APRM_FIN_FINACC_ACCT_CHECK_TRG fires BEFORE
 * UPDATE too and a single such row would abort the transaction and fail the whole tenant. That is
 * a technical necessity, not a functional choice.
 *
 * As with every data-fix, the runner (src/data-fixes/run.js) executes the parsed SQL against a
 * live Postgres tenant — true row-level behavior can only be verified end-to-end with a DB. What
 * is verified deterministically here, without a DB, is the SQL the fix ships: header metadata,
 * tenant isolation, guard symmetry, and that the blast radius is exactly the two columns.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260908T120000Z__R34-fin-account-cleared-payment-accounts.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

/**
 * Same, but with `--` comment lines dropped first. Every NEGATIVE assertion ("must not contain X")
 * has to run against this, not against `norm*`: the prose in these sections legitimately names the
 * things the SQL must not DO (the removed posted-reconciliation guard, "raced the UPDATE", ...), so
 * scanning comments too turns documentation into a test failure. Positive assertions can use
 * either, since a match in a comment still means the file says what we want it to say.
 */
const sqlOnly = (s) => norm(s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'));
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report);

describe('R34 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R34-fin-account-cleared-payment-accounts');
    assert.equal(fix.gap, 'A9');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a description naming ETP-5207 and BOTH cleared columns', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETP-5207/);
    assert.match(fix.description, /fin_in_clear_acct/i);
    assert.match(fix.description, /fin_out_clear_acct/i);
  });

  it('description states the guarded population is skipped, not silently dropped', () => {
    assert.match(fix.description, /skipped/i);
    assert.match(fix.description, /APRM_FIN_FINACC_ACCT_CHECK_TRG/i);
  });

  it('description says the scope is ALL accounts, posted reconciliations included', () => {
    // Guards against a future edit quietly re-narrowing the scope: the product decision is that
    // an account with posted reconciliations must ALSO stop being able to post new ones.
    assert.match(fix.description, /includ\w*\s+.*posted reconciliation|posted reconciliation\w*\s+includ/i);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, 'the guards skip rows, so @report is mandatory here');
  });

  it('has a timestamp prefix that sorts after the newest existing fix (R33)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-08T12:00:00.000Z');
    // Must also sort after R22, the frozen twin that still fills both cleared columns, so the
    // chain self-corrects on a tenant that runs both.
    assert.ok(ts.getTime() > parseFixTimestamp('20260903T120000Z__prev').getTime());
    assert.ok(ts.getTime() > parseFixTimestamp('20260805T140000Z__prev').getTime());
  });

  it('documents that R22 is neither edited nor retired (immutability rule)', () => {
    assert.match(rawText, /R22/);
    assert.match(rawText, /Do not edit or retire R22/i);
  });
});

describe('R34 data-fix — tenant isolation (:client_id in every section)', () => {
  it('scopes the @check to :client_id on both joined tables', () => {
    assert.match(normCheck, /f\.ad_client_id = :client_id/);
    assert.match(normCheck, /a\.ad_client_id = :client_id/);
  });

  it('scopes the @apply to :client_id on both joined tables', () => {
    assert.match(normApply, /f\.ad_client_id = :client_id/);
    assert.match(normApply, /a\.ad_client_id = :client_id/);
  });

  it('scopes the @report to :client_id (it is read-only but still tenant-bound)', () => {
    assert.match(normReport, /a\.ad_client_id = :client_id/);
  });

  it('never consults fin_reconciliation at all — scope is every account (product decision)', () => {
    // The posted-reconciliation guard was deliberately removed: an account that already posted
    // reconciliations must ALSO stop being able to post new ones. Asserting the table is absent
    // makes re-adding that guard a visible, intentional change rather than a silent narrowing —
    // and it also removes the client-scoping hazard the old correlated subquery carried.
    for (const [label, sql] of [['check', sqlCheck], ['apply', sqlApply], ['report', sqlReport]]) {
      assert.doesNotMatch(sql, /fin_reconciliation/i,
        `${label} must not gate on reconciliation state`);
    }
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R34 data-fix — blast radius is exactly the two cleared columns', () => {
  it('the @apply UPDATE targets fin_financial_account_acct and NULLs both cleared columns', () => {
    assert.match(normApply, /UPDATE fin_financial_account_acct/i);
    assert.match(normApply, /SET fin_in_clear_acct = NULL, fin_out_clear_acct = NULL/i);
  });

  it('never writes any OTHER accounting column', () => {
    // The SET list must not reach the deposit/withdrawal/in-transit/bank-fee/revaluation columns —
    // those are legitimate defaults this fix must leave exactly as they are.
    const setList = sqlApply.match(/SET (.*?) FROM /i)[1];
    for (const col of [
      'fin_deposit_acct', 'fin_withdrawal_acct', 'fin_in_intransit_acct', 'fin_out_intransit_acct',
      'fin_bankfee_acct', 'fin_bankrevaluationgain_acct', 'fin_bankrevaluationloss_acct',
      'fin_asset_acct', 'fin_transitory_acct',
    ]) {
      assert.doesNotMatch(setList, new RegExp(col, 'i'), `${col} must not be written`);
    }
  });

  it('stamps the standard AD audit columns and nothing more', () => {
    assert.match(normApply, /updated = now\(\)/i);
    assert.match(normApply, /updatedby = '0'/);
  });

  it('is an UPDATE only — never deletes or inserts rows', () => {
    assert.doesNotMatch(sqlApply, /\bDELETE\b/i);
    assert.doesNotMatch(sqlApply, /\bINSERT\b/i);
  });
});

describe('R34 data-fix — two-layer idempotency and guard symmetry', () => {
  it('@check and @apply both gate on "at least one cleared column is still set"', () => {
    const predicate = /\(a\.fin_in_clear_acct IS NOT NULL OR a\.fin_out_clear_acct IS NOT NULL\)/;
    assert.match(normCheck, predicate);
    assert.match(normApply, predicate);
  });

  it('carries no NOT EXISTS guard at all — the only exclusion is the APRM one below', () => {
    // Asymmetry between @check and @apply is the classic data-fix bug: @check reports "needed" for
    // a tenant whose only dirty rows are excluded, and @apply then legitimately changes nothing.
    // With the posted-reconciliation guard gone there is no correlated exclusion left to drift.
    assert.doesNotMatch(sqlCheck, /NOT EXISTS/i);
    assert.doesNotMatch(sqlApply, /NOT EXISTS/i);
  });

  it('the APRM guard (Bank row missing bankfee/revaluation) is present in BOTH @check and @apply', () => {
    const guard = /NOT \(f\.type = 'B' AND \(a\.fin_bankfee_acct IS NULL OR a\.fin_bankrevaluationgain_acct IS NULL OR a\.fin_bankrevaluationloss_acct IS NULL\)\)/;
    assert.match(normCheck, guard);
    assert.match(normApply, guard);
  });

  it('re-running after a successful apply matches zero rows (the WHERE is its own guard)', () => {
    // Every fixable row has both columns NULL after a successful apply, so the same
    // "IS NOT NULL" predicate that gated the UPDATE now excludes it — the second idempotency layer.
    assert.match(normApply, /\(a\.fin_in_clear_acct IS NOT NULL OR a\.fin_out_clear_acct IS NOT NULL\)/);
  });

  it('the @check LIMIT 1 is an existence probe only — @apply carries no row cap', () => {
    assert.match(normCheck, /LIMIT 1;$/);
    assert.doesNotMatch(sqlApply, /LIMIT/i);
  });
});

describe('R34 data-fix — @report surfaces exactly what the guards skipped', () => {
  it('selects the rows that STILL carry a cleared account after @apply ran', () => {
    // @report runs after @apply in the same transaction, so this predicate resolves to precisely
    // the guarded population — nothing else can still be non-null.
    assert.match(normReport, /\(a\.fin_in_clear_acct IS NOT NULL OR a\.fin_out_clear_acct IS NOT NULL\)/);
  });

  it('names the account, its type and the ledger so an operator can act per account', () => {
    assert.match(normReport, /AS financial_account/i);
    assert.match(normReport, /AS account_type/i);
    assert.match(normReport, /AS ledger/i);
  });

  it('states the one reason a row can be left behind', () => {
    assert.match(normReport, /AS reason/i);
    assert.match(normReport, /APRM check trigger/i);
  });

  it('resolves the account ids to human-readable combinations', () => {
    assert.match(normReport, /c_validcombination/i);
    assert.match(normReport, /AS in_clear_acct/i);
    assert.match(normReport, /AS out_clear_acct/i);
  });

  it('is read-only — no write statement may hide in @report', () => {
    assert.doesNotMatch(sqlReport, /\b(UPDATE|INSERT|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  });
});
