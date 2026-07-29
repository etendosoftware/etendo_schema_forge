import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R17 corrective data-fix
 * (20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql, ETP-4706).
 *
 * ETP-4706 ("Contabilizar" fails on purchase Goods Receipts with a generic
 * "Account could not be found" error) traced back to AcctServer.getAccount
 * (ACCTTYPE_NotInvoicedReceipts = "51"), which resolves the account via
 * `SELECT NotInvoicedReceipts_Acct FROM C_BP_Group_Acct a, C_BPartner bp WHERE
 * a.C_BP_Group_ID = bp.C_BP_Group_ID AND bp.C_BPartner_ID = ? AND
 * a.C_AcctSchema_ID = ?` (AcctServer_data.xsql) — entirely BP-group scoped, NOT
 * product/product-category scoped as the ticket was originally filed (neither
 * M_Product_Category_Acct nor M_Product_Acct even HAS a not-invoiced-receipts
 * column; confirmed against information_schema.columns on the live DB).
 *
 * Live-DB diagnosis (GOClient, client 802509E12436405C86BA1FD5B1DF508C, schema
 * "Esquema GO" C06B100312FA48159DB36B9A4B461019): the "Cliente" BP group's
 * (formerly "Consumidor Final", DBBD00C9E0B9442188FCDDA3F601DAEA) C_BP_Group_Acct
 * row for this schema has notinvoicedreceipts_acct = NULL, while
 * C_AcctSchema_Default.notinvoicedreceipts_acct on the same schema IS populated
 * — a stale row from historical drift (row created 2026-04-07, well before this
 * account got its current default) that the current onboarding
 * BP_GROUP_ACCT_SQL never revisits (its guard is `NOT EXISTS` at the ROW level,
 * so an existing-but-incomplete row is never backfilled).
 *
 * SCOPE CONFIRMED CORRECTIVE-ONLY (no preventive gap): every OTHER BP group on
 * this DB, across every other tenant — including "Empresa E2E d5be89a8"
 * onboarded the SAME DAY as this diagnosis via the CURRENT onboarding code —
 * already has notinvoicedreceipts_acct populated. A brand-new tenant onboarded
 * today is NOT born with this gap; only this one pre-existing GOClient row is
 * affected. So this ships corrective-only, per the map's "Boundary" rule
 * (docs/etendo-ad/onboarding-and-datafixes-map.md §0) — stated explicitly
 * rather than silently omitting the preventive front.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL
 * against a live Postgres tenant, so true row-level behavior can only be
 * verified end-to-end with a DB. What is verified deterministically here,
 * without a DB, is the SQL the fix ships: header metadata, tenant isolation,
 * the two-layer idempotency guard, and the resolution join shape that matches
 * AcctServer's own BP-group-scoped lookup (never a product/category join).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260729T120000Z__R17-bp-group-acct-notinvoiced-receipts.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R17 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R17-bp-group-acct-notinvoiced-receipts');
    assert.equal(fix.gap, 'A2b');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions Not-Invoiced-Receipts', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /not.?invoiced.?receipts/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-07-29T12:00:00.000Z');
    // Strictly after the last pre-existing fix (20260727T114306Z) so lexical == chronological order.
    assert.ok(ts.getTime() > parseFixTimestamp('20260727T114306Z__prev').getTime());
  });
});

describe('R17 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
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

describe('R17 data-fix — resolution join matches AcctServer.selectNotInvoicedReceiptsAcct (BP-group, never product/category)', () => {
  it('the @check resolves the account via C_BP_Group_Acct joined to C_BP_Group, not a product/category table', () => {
    assert.match(normCheck, /FROM c_bp_group_acct a/i);
    assert.match(normCheck, /JOIN c_bp_group g ON g\.c_bp_group_id = a\.c_bp_group_id/i);
    assert.doesNotMatch(normCheck, /m_product_category_acct|m_product_acct/i);
  });

  it('the @apply resolves the account via the same join shape', () => {
    assert.match(normApply, /UPDATE c_bp_group_acct a/i);
    assert.match(normApply, /c_bp_group g/i);
    assert.doesNotMatch(normApply, /m_product_category_acct|m_product_acct/i);
  });

  it('sources the replacement value from C_AcctSchema_Default.notinvoicedreceipts_acct, scoped to the same schema', () => {
    assert.match(normApply, /d\.c_acctschema_id = a\.c_acctschema_id/i);
    assert.match(normApply, /d\.notinvoicedreceipts_acct/i);
  });
});

describe('R17 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check only matches rows where the target column is NULL and a default exists to source from', () => {
    assert.match(normCheck, /a\.notinvoicedreceipts_acct is null/i);
    assert.match(normCheck, /d\.notinvoicedreceipts_acct is not null/i);
  });

  it('the @apply UPDATE re-checks the same NULL guard (defended even if @check were bypassed)', () => {
    assert.match(normApply, /a\.notinvoicedreceipts_acct is null/i);
    assert.match(normApply, /d\.notinvoicedreceipts_acct is not null/i);
  });

  it('stamps updated/updatedby audit columns on the UPDATE', () => {
    assert.match(normApply, /updated = now\(\)/i);
    assert.match(normApply, /updatedby = '0'/i);
  });
});
