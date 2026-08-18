import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R22 corrective data-fix
 * (20260805T140000Z__R22-fin-account-warehouse-acct.sql, ETP-4743).
 *
 * ETP-4743 is a follow-up to ETP-4565: FIN_FINANCIAL_ACCOUNT and M_WAREHOUSE are bulk-imported
 * by the onboarding dataset importer with DB triggers disabled, so neither table's native
 * AFTER-INSERT trigger (fin_financial_account_trg / m_warehouse_trg) ever fires for the bundled
 * template rows — unlike the sibling entities (BP group/customer/vendor, product category,
 * product, tax), nobody backfilled FIN_Financial_Account_Acct / M_Warehouse_Acct for tenants
 * that were already onboarded BEFORE ETP-4565 shipped its preventive fix
 * (FIN_FINANCIAL_ACCOUNT_ACCT_SQL / WAREHOUSE_ACCT_SQL in OnboardingAccountingWiringService).
 * This fix is the corrective twin, live-validated on a real tenant (acreedortest,
 * D94AED60C3E0494AAFD44B8A05BB5CFC): dry-run WOULD_APPLY -> real run APPLIED (4 rows) -> re-run
 * SKIPPED_NOT_NEEDED — kept prior success state.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB. What is
 * verified deterministically here, without a DB, is the SQL the fix ships: header metadata,
 * tenant isolation, the two-layer idempotency guard, the per-schema join shape (a tenant may own
 * more than one accounting schema), and the column mapping mirroring
 * OnboardingAccountingWiringService's FIN_FINANCIAL_ACCOUNT_ACCT_SQL / WAREHOUSE_ACCT_SQL
 * one-for-one.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260805T140000Z__R22-fin-account-warehouse-acct.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R22 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R22-fin-account-warehouse-acct');
    assert.equal(fix.gap, 'A2c');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions both target tables', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /FIN_Financial_Account_Acct/i);
    assert.match(fix.description, /M_Warehouse_Acct/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix (R20)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-05T14:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260803T180000Z__prev').getTime(),
      'R22 must sort after R20 (the last fix present on this branch)',
    );
  });
});

describe('R22 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to :client_id on both the financial-account and warehouse branches', () => {
    assert.match(normCheck, /f\.ad_client_id = :client_id/);
    assert.match(normCheck, /w\.ad_client_id = :client_id/);
  });

  it('scopes the @apply INSERTs to :client_id', () => {
    assert.match(normApply, /f\.ad_client_id = :client_id/);
    assert.match(normApply, /w\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE fin_financial_account_acct' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R22 data-fix — per-schema coverage (a tenant may own more than one accounting schema)', () => {
  it('the @check joins c_acctschema on ad_client_id, not a single hardcoded schema id', () => {
    assert.match(normCheck, /JOIN c_acctschema s ON s\.ad_client_id = f\.ad_client_id/i);
    assert.match(normCheck, /JOIN c_acctschema s ON s\.ad_client_id = w\.ad_client_id/i);
  });

  it('the @apply INSERTs join c_acctschema the same way, so every ledger the tenant owns is covered', () => {
    assert.match(normApply, /JOIN c_acctschema s ON s\.ad_client_id = f\.ad_client_id/i);
    assert.match(normApply, /JOIN c_acctschema s ON s\.ad_client_id = w\.ad_client_id/i);
  });
});

describe('R22 data-fix — column mapping mirrors OnboardingAccountingWiringService', () => {
  it('the financial-account INSERT reuses the CASE-resolved asset account for deposit/withdrawal/clear columns', () => {
    assert.match(normApply, /INSERT INTO fin_financial_account_acct/i);
    assert.match(normApply, /CASE WHEN f\.type = 'C' THEN d\.cb_asset_acct ELSE d\.b_asset_acct END/g);
    // 4 occurrences: fin_deposit_acct, fin_withdrawal_acct, fin_out_clear_acct, fin_in_clear_acct.
    const caseOccurrences = (normApply.match(
      /CASE WHEN f\.type = 'C' THEN d\.cb_asset_acct ELSE d\.b_asset_acct END/g,
    ) || []).length;
    assert.equal(caseOccurrences, 4);
  });

  it('the financial-account INSERT reuses b_intransit_acct for both in/out intransit columns', () => {
    assert.match(normApply, /d\.b_intransit_acct, d\.b_intransit_acct/i);
  });

  it('the warehouse INSERT copies the four warehouse default accounts straight from c_acctschema_default', () => {
    assert.match(normApply, /INSERT INTO m_warehouse_acct/i);
    assert.match(
      normApply,
      /d\.w_inventory_acct, d\.w_differences_acct, d\.w_revaluation_acct, d\.w_invactualadjust_acct/i,
    );
  });

  it('guards the warehouse insert with w_differences_acct IS NOT NULL (the only NOT NULL target column)', () => {
    assert.match(normApply, /d\.w_differences_acct IS NOT NULL/i);
  });
});

describe('R22 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check NOT EXISTS keys match the tables\' own UNIQUE constraints', () => {
    assert.match(
      normCheck,
      /a\.fin_financial_account_id = f\.fin_financial_account_id\s+AND a\.c_acctschema_id = s\.c_acctschema_id/i,
    );
    assert.match(
      normCheck,
      /a\.m_warehouse_id = w\.m_warehouse_id\s+AND a\.c_acctschema_id = s\.c_acctschema_id/i,
    );
  });

  it('the @apply re-checks the same NOT EXISTS guards (defended even if @check were bypassed)', () => {
    assert.match(
      normApply,
      /a\.fin_financial_account_id = f\.fin_financial_account_id\s+AND a\.c_acctschema_id = s\.c_acctschema_id/i,
    );
    assert.match(
      normApply,
      /a\.m_warehouse_id = w\.m_warehouse_id\s+AND a\.c_acctschema_id = s\.c_acctschema_id/i,
    );
  });

  it('mints a fresh PK per row with get_uuid() rather than reusing/hardcoding one', () => {
    const insertCount = (normApply.match(/get_uuid\(\)/g) || []).length;
    assert.equal(insertCount, 2, 'one get_uuid() per INSERT statement (financial-account + warehouse)');
  });
});

describe('R22 data-fix — BUG-1 regression (Sentinel, cycle 1): @check must join c_acctschema_default on the financial-account branch, matching @apply', () => {
  // Isolate the financial-account branch of @check (everything before the warehouse branch's
  // UNION ALL) so a false match on the warehouse branch's own (already-correct) join can't hide
  // a regression on the financial-account branch specifically.
  const [finAccountCheckBranch] = normCheck.split(/UNION ALL/i);

  it('the @check financial-account branch INNER JOINs c_acctschema_default, not just c_acctschema', () => {
    assert.match(
      finAccountCheckBranch,
      /JOIN c_acctschema_default d ON d\.c_acctschema_id = s\.c_acctschema_id/i,
      'without this join, @check counts (financial account x schema) pairs that @apply\'s own'
      + ' INNER JOIN c_acctschema_default can never insert -- a schema with no'
      + ' c_acctschema_default row would be reported as "needs fix" forever, non-convergent',
    );
  });

  it('the @check and @apply financial-account branches join c_acctschema_default the same number of times (symmetry)', () => {
    const checkJoins = (finAccountCheckBranch.match(/JOIN c_acctschema_default d ON d\.c_acctschema_id = s\.c_acctschema_id/gi) || []).length;
    // @apply has ONE fin-account INSERT (the warehouse INSERT is a separate statement, not part
    // of "apply" as parsed here — parseFix's @apply section concatenates both statements, so we
    // only assert the financial-account INSERT's own join count via the INSERT INTO anchor).
    const finAccountApplyBranch = normApply.split(/INSERT INTO m_warehouse_acct/i)[0];
    const applyJoins = (finAccountApplyBranch.match(/JOIN c_acctschema_default d ON d\.c_acctschema_id = s\.c_acctschema_id/gi) || []).length;
    assert.equal(checkJoins, 1, '@check financial-account branch must join c_acctschema_default exactly once');
    assert.equal(applyJoins, 1, '@apply financial-account INSERT must join c_acctschema_default exactly once');
    assert.equal(checkJoins, applyJoins, '@check and @apply must agree on whether c_acctschema_default is required');
  });
});
