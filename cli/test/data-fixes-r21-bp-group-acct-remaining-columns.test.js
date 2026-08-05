import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R21 corrective data-fix
 * (20260805T120000Z__R21-bp-group-acct-remaining-columns.sql, ETP-4720).
 *
 * ETP-4720 generalizes ETP-4706/R17 (which backfilled only
 * C_BP_Group_Acct.NotInvoicedReceipts_Acct) to the other 11 *_acct columns on
 * the same table that can go stale the exact same way — a stale row created
 * before an accounting-schema default existed is never revisited by the
 * insert-only NOT EXISTS guard in OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL.
 *
 * Live-DB diagnosis (all 12 tenants on the dev DB, 2026-08-05): confirmed 4 of
 * the 11 columns (DoubtfulDebt_Acct/BadDebtExpense_Acct/BadDebtRevenue_Acct/
 * AllowanceForDoubtful_Acct) are ALSO missing on every tenant's C_BP_Group_Acct
 * rows, including a 6-day-old tenant onboarded via the current onboarding code
 * — this was fixed on BOTH fronts (see OnboardingAccountingWiringService
 * #patchBpGroupAcctMissingColumns in com.etendoerp.go, wired as the new last
 * onboarding step, and ONBOARDING_PROVISIONED_THROUGH bumped to R21's own
 * timestamp). Of the other 6 columns, NotInvoicedRevenue_Acct/
 * NotInvoicedReceivables_Acct/UnEarnedRevenue_Acct/PayDiscount_Exp_Acct/
 * PayDiscount_Rev_Acct/V_Liability_Services_Acct have no source value
 * anywhere on this DB (C_AcctSchema_Default itself is NULL fleet-wide for
 * them, an R11-adjacent gap out of this ticket's scope) — R21's @check
 * naturally excludes them today. WriteOff_Rev_Acct is the one exception: NULL
 * on 13 of 14 schemas, but already populated on "F&B International Group"'s
 * schema since 2026-07-08 (predates this fix) — so for that one tenant R21's
 * @check/@apply for this column is NOT a no-op, it backfills 2 rows.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL
 * against a live Postgres tenant, so true row-level behavior can only be
 * verified end-to-end with a DB (already done once, by hand, in a rolled-back
 * transaction against GOClient — see docs/etendo-ad/onboarding-gaps.md's "A2b
 * (generalized)" section: 3 groups, exactly the 4 sourced columns filled,
 * other 7 stayed NULL, re-run affected 0 rows, R17's own column untouched).
 * What is verified deterministically here, without a DB, mirrors the R17/R20
 * precedent: header metadata, tenant isolation, the two-layer idempotency
 * guard per column ("needs it" / "doesn't need it, so @check excludes it" /
 * "re-run is a no-op"), and that R17's own column is never touched.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260805T120000Z__R21-bp-group-acct-remaining-columns.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

/** The 11 columns R21 owns (NotInvoicedReceipts_Acct is explicitly excluded — that's R17's). */
const TARGET_COLUMNS = [
  'notinvoicedrevenue_acct',
  'notinvoicedreceivables_acct',
  'unearnedrevenue_acct',
  'paydiscount_exp_acct',
  'paydiscount_rev_acct',
  'writeoff_rev_acct',
  'v_liability_services_acct',
  'doubtfuldebt_acct',
  'baddebtexpense_acct',
  'baddebtrevenue_acct',
  'allowancefordoubtful_acct',
];

describe('R21 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R21-bp-group-acct-remaining-columns');
    assert.equal(fix.gap, 'A2b');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions generalizing R17 to the remaining columns', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /R17/);
    assert.match(fix.description, /11/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than every prior fix in the catalog', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-05T12:00:00.000Z');
    // Strictly after R20 (20260803T180000Z), the newest fix at the time R21 was authored.
    assert.ok(ts.getTime() > parseFixTimestamp('20260803T180000Z__prev').getTime());
  });
});

describe('R21 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to :client_id via the bp-group join', () => {
    assert.match(normCheck, /g\.ad_client_id = :client_id/);
  });

  it('scopes the @apply UPDATE to :client_id via the bp-group join', () => {
    assert.match(normApply, /g\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE c_bp_group_acct' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R21 data-fix — resolution join matches the R17 shape (C_BP_Group_Acct joined to C_BP_Group, never product/category)', () => {
  it('the @check resolves via C_BP_Group_Acct joined to C_BP_Group and C_AcctSchema_Default', () => {
    assert.match(normCheck, /FROM c_bp_group_acct a/i);
    assert.match(normCheck, /JOIN c_bp_group g ON g\.c_bp_group_id = a\.c_bp_group_id/i);
    assert.match(normCheck, /JOIN c_acctschema_default d ON d\.c_acctschema_id = a\.c_acctschema_id/i);
    assert.doesNotMatch(normCheck, /m_product_category_acct|m_product_acct/i);
  });

  it('the @apply resolves via the same join shape', () => {
    assert.match(normApply, /UPDATE c_bp_group_acct a/i);
    assert.match(normApply, /FROM c_bp_group g, c_acctschema_default d/i);
    assert.doesNotMatch(normApply, /m_product_category_acct|m_product_acct/i);
  });

  it('never touches C_BP_Vendor_Acct or C_BP_Customer_Acct (group-level fix only, no per-partner override write)', () => {
    assert.doesNotMatch(normApply, /c_bp_vendor_acct|c_bp_customer_acct/i);
  });
});

describe('R21 data-fix — covers exactly the 11 target columns, never R17\'s own column', () => {
  for (const column of TARGET_COLUMNS) {
    it(`the @check considers ${column}`, () => {
      const pattern = new RegExp(`a\\.${column} is null`, 'i');
      assert.match(normCheck, pattern);
    });

    it(`the @apply sets ${column} via COALESCE(a.${column}, d.${column})`, () => {
      const pattern = new RegExp(
        `${column} = coalesce\\(a\\.${column},\\s*d\\.${column}\\)`,
        'i',
      );
      assert.match(normApply, pattern);
    });
  }

  it('never references notinvoicedreceipts_acct (R17 already owns that single column)', () => {
    assert.doesNotMatch(normCheck, /notinvoicedreceipts_acct/i);
    assert.doesNotMatch(normApply, /notinvoicedreceipts_acct/i);
  });
});

describe('R21 data-fix — two-layer idempotency per column (needs-it / doesn\'t-need-it / re-run-is-skipped)', () => {
  for (const column of TARGET_COLUMNS) {
    it(`"needs it": @check matches when ${column} is NULL and the schema default is NOT NULL`, () => {
      const needsIt = new RegExp(`a\\.${column}\\s*is null and d\\.${column}\\s*is not null`, 'i');
      assert.match(normCheck, needsIt);
    });

    it(`"doesn't need it": the same NULL/NOT-NULL pair also gates the @apply guard for ${column}`, () => {
      // The @apply's row-level WHERE mirrors @check exactly, so a client whose row already has
      // this column populated (or whose schema default is itself NULL — the R11-adjacent case)
      // never matches this column's OR-branch; COALESCE further guarantees the SET clause itself
      // is a no-op even if some other column in the OR still makes the row match.
      const guard = new RegExp(`a\\.${column}\\s*is null and d\\.${column}\\s*is not null`, 'i');
      assert.match(normApply, guard);
    });
  }

  it('"re-run is skipped": COALESCE(a.col, d.col) never overwrites an already-populated column', () => {
    // COALESCE returns the first non-null argument, so once a.<col> is populated, re-running the
    // UPDATE is a value-level no-op for that column regardless of the row-level WHERE outcome —
    // this is the SQL-level guarantee that a second run changes nothing (verified end-to-end by
    // hand: a rolled-back re-run against GOClient affected 0 rows after the first apply).
    for (const column of TARGET_COLUMNS) {
      const coalesceGuard = new RegExp(
        `${column} = coalesce\\(a\\.${column},\\s*d\\.${column}\\)`,
        'i',
      );
      assert.match(normApply, coalesceGuard);
    }
  });

  it('stamps updated/updatedby audit columns on the UPDATE', () => {
    assert.match(normApply, /updated = now\(\)/i);
    assert.match(normApply, /updatedby = '0'/i);
  });
});
