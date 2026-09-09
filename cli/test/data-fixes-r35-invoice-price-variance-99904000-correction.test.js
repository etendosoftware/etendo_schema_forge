import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R35 corrective data-fix
 * (20260909T150000Z__R35-invoice-price-variance-99904000-correction.sql, ETP-5222).
 *
 * R34 (ETP-5075) backfilled `P_InvoicePriceVariance_Acct` (schema-default, product-category,
 * product) from each row's OWN `P_Expense_Acct`. ETP-5222 supersedes that value choice — product
 * confirmed a STANDARD account for ALL clients instead of a per-schema ad-hoc one. That standard
 * was corrected mid-ticket, within this same ETP-5222 session, from `99905000` ("Diferencia entre
 * el precio de compra y el coste estándar") to **`99904000`** ("Diferencias entre el coste del
 * producto y el precio de la fra[ctura]", genuinely truncated at 61 chars in the bundled data
 * itself) — sibling accounts one code apart in GOClient's chart. Both are `AccountType = 'M'`
 * (Memorandum, verified via `ad_ref_list` reference 117), part of GOClient's entire `999*` branch
 * (Etendo's own generic default/suspense-account family), which product accepted as
 * uniformly-Memo-by-design without requiring a dedicated live `DocMatchInv` posting test for
 * `99904000` itself — the real production evidence that exists (matched-purchase-invoice
 * `920B74ACD78A4F358392E91FF1B2503B`, product "Fernet") is specific to `99905000` and does not
 * directly cover `99904000`.
 *
 * R34 is deliberately left untouched (a historical migration record — see this file's own
 * "Why a new file, not an edit to R34" section) — this fix supersedes R34's EFFECT via a strictly
 * later timestamp in the same catalog, not by editing it. It resolves `99904000`'s OWN natural
 * `C_ValidCombination` for each row's own `(ad_client_id, c_acctschema_id)`, scoped through
 * `C_AcctSchema_Element` (`elementtype = 'AC'`) so an unwired "orphan" element sharing the same
 * account code is never picked (confirmed live: GOClient itself carries a second, unrelated
 * `c_elementvalue` row for `99904000` under an unwired "GOOrg Account Tree" element).
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live Postgres
 * tenant; end-to-end row-level behavior was verified by hand in rolled-back transactions against
 * GOClient (99904000 resolves: schema default + all 3 category rows + 5 of 6 product rows
 * corrected; the 6th, "Fernet", pointed at the sibling 99905000 account by a prior manual set, is
 * correctly left untouched since it matches neither the NULL nor the P_Expense_Acct branch of the
 * guard) and a "QA Testing" client whose chart lacks 99904000 entirely (the runner reports
 * SKIPPED_NOT_NEEDED — the INNER JOIN chain naturally excludes it, this fix deliberately provides
 * no P_Expense_Acct-style fallback of its own, unlike R34/the Java-side onboarding fix, since its
 * whole purpose is a targeted correction, not an initial fill). What is verified deterministically
 * here, without a DB, mirrors the R34/R21 precedent: header metadata, tenant isolation, the
 * 99904000-via-C_AcctSchema_Element resolution shape, the "NULL or old P_Expense_Acct value only"
 * correction guard per level, and idempotency.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260909T150000Z__R35-invoice-price-variance-99904000-correction.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

/** The 3 levels this fix corrects, in @apply statement order. */
const LEVELS = [
  { table: 'c_acctschema_default', alias: 'd', idCol: 'c_acctschema_default_id', sourceAlias: 'd2' },
  { table: 'm_product_category_acct', alias: 'pca', idCol: 'm_product_category_acct_id', sourceAlias: 'p2' },
  { table: 'm_product_acct', alias: 'pa', idCol: 'm_product_acct_id', sourceAlias: 'p2' },
];

const CORRECT_ACCT_VALUE = '99904000';
const SUPERSEDED_ACCT_VALUE = '99905000';

describe('R35 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R35-invoice-price-variance-99904000-correction');
    assert.equal(fix.gap, 'A8b');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions 99904000, correcting NULL-or-old values, and superseding R34', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /99904000/);
    assert.match(fix.description, /R34/);
    assert.match(fix.description, /supersedes/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is strictly after R34\'s', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-09T15:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260907T180000Z__R34-invoice-price-variance-backfill').getTime());
  });

  it('never references the superseded account 99905000 anywhere in @check or @apply', () => {
    assert.doesNotMatch(fix.check, new RegExp(SUPERSEDED_ACCT_VALUE));
    assert.doesNotMatch(fix.apply, new RegExp(SUPERSEDED_ACCT_VALUE));
  });
});

describe('R35 data-fix — tenant isolation (every level scoped to :client_id)', () => {
  it('scopes the @check to :client_id for all three levels', () => {
    const matches = normCheck.match(/ad_client_id = :client_id/g) || [];
    assert.ok(matches.length >= 3, `expected at least 3 :client_id scopes in @check, found ${matches.length}`);
  });

  it('scopes the @apply to :client_id for all three levels', () => {
    const matches = normApply.match(/ad_client_id = :client_id/g) || [];
    assert.ok(matches.length >= 3, `expected at least 3 :client_id scopes in @apply, found ${matches.length}`);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE m_product_acct' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R35 data-fix — 99904000 resolved via C_AcctSchema_Element, never an unwired orphan element, never a fallback', () => {
  it('the @check probes 99904000 through c_acctschema_element joined by elementtype = \'AC\'', () => {
    const matches = normCheck.match(/c_acctschema_element ae/g) || [];
    assert.ok(matches.length >= 3, 'expected a c_acctschema_element join per level in @check');
    assert.match(normCheck, /ae\.elementtype = 'AC'/);
  });

  it('the @check joins C_ElementValue by the 99904000 account code, scoped to the element actually wired to the row\'s own schema', () => {
    const pattern = /ev\.c_element_id = ae\.c_element_id and ev\.value = '99904000'/gi;
    const matches = normCheck.match(pattern) || [];
    assert.ok(matches.length >= 3, `expected 3 account-value joins in @check, found ${matches.length}`);
  });

  it('uses plain INNER JOINs (not LEFT JOIN) — unlike R34/the Java onboarding fix, this correction never falls back to P_Expense_Acct', () => {
    assert.doesNotMatch(normApply, /left join/i);
    assert.doesNotMatch(normCheck, /left join/i);
  });

  it('never hardcodes a cross-tenant C_ValidCombination id anywhere in @check or @apply', () => {
    assert.doesNotMatch(normCheck, /p_invoicepricevariance_acct = '[0-9A-F]{32}'/i);
    assert.doesNotMatch(normApply, /p_invoicepricevariance_acct = '[0-9A-F]{32}'/i);
  });
});

/**
 * ETP-5222 review fix (Alex/W1): C_ValidCombination can hold non-natural, dimension-specific rows
 * for the same (account, schema) pair — an unfiltered join can match more than one, and Postgres
 * UPDATE...FROM picks one ARBITRARILY (silent nondeterminism). Every dimension column must be
 * explicitly required NULL, mirroring GlItemProvisioningSupport#resolveNaturalCombination's
 * Restrictions.isNull(...) list (the DAL/Criteria precedent for this exact operation), translated
 * to native SQL AND vc.<col> IS NULL predicates, plus that same method's defensive
 * ORDER BY ... LIMIT 1.
 */
const DIMENSION_COLUMNS = [
  'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id',
  'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id',
];

describe('R35 data-fix — NATURAL combination filter (ETP-5222 review fix, Alex/W1)', () => {
  for (const column of DIMENSION_COLUMNS) {
    it(`the @check requires vc.${column} IS NULL in every one of the 3 levels' combination lookup`, () => {
      const pattern = new RegExp(`vc\\.${column} is null`, 'gi');
      const matches = normCheck.match(pattern) || [];
      assert.ok(matches.length >= 3, `expected vc.${column} IS NULL at least 3 times in @check, found ${matches.length}`);
    });

    it(`the @apply requires vc.${column} IS NULL in every one of the 3 levels' combination lookup`, () => {
      const pattern = new RegExp(`vc\\.${column} is null`, 'gi');
      const matches = normApply.match(pattern) || [];
      assert.ok(matches.length >= 3, `expected vc.${column} IS NULL at least 3 times in @apply, found ${matches.length}`);
    });
  }

  it('the @check defensively orders + limits the combination lookup to 1 row per level (3 occurrences)', () => {
    const matches = normCheck.match(/order by vc\.c_validcombination_id limit 1/gi) || [];
    assert.ok(matches.length >= 3, `expected the ORDER BY + LIMIT 1 guard 3 times in @check, found ${matches.length}`);
  });

  it('the @apply defensively orders + limits the combination lookup to 1 row per level (3 occurrences)', () => {
    const matches = normApply.match(/order by vc\.c_validcombination_id limit 1/gi) || [];
    assert.ok(matches.length >= 3, `expected the ORDER BY + LIMIT 1 guard 3 times in @apply, found ${matches.length}`);
  });

  it('resolves the combination via a correlated scalar subquery (not a plain JOIN c_validcombination), so it can carry its own ORDER BY/LIMIT', () => {
    assert.doesNotMatch(normCheck, /join c_validcombination vc on/i);
    assert.doesNotMatch(normApply, /join c_validcombination vc on/i);
    assert.match(normCheck, /\(select vc\.c_validcombination_id from c_validcombination vc/i);
    assert.match(normApply, /\(select vc\.c_validcombination_id from c_validcombination vc/i);
  });
});

for (const level of LEVELS) {
  describe(`R35 data-fix — level "${level.table}" correction (NULL or old P_Expense_Acct value → 99904000)`, () => {
    it(`@apply resolves ${level.table} via a derived table keyed on ${level.idCol}, sourcing vc.c_validcombination_id`, () => {
      const updateBlock = new RegExp(
        `UPDATE ${level.table} ${level.alias}[\\s\\S]*?SET p_invoicepricevariance_acct = resolved\\.ipv_99904000_id`,
        'i',
      );
      assert.match(fix.apply, updateBlock);
    });

    it(`@apply scopes the ${level.table} element/combination lookup through the row's OWN c_acctschema_id (not a fixed :schema_id)`, () => {
      const scoping = new RegExp(
        `ae\\.c_acctschema_id = ${level.sourceAlias}\\.c_acctschema_id and ae\\.ad_client_id = ${level.sourceAlias}\\.ad_client_id`,
        'i',
      );
      assert.match(normApply, scoping);
    });

    it(`@apply correlates the UPDATE target for ${level.table} back to its resolved source row by primary key (ETP-5222 QA — prevents one row's resolved combination leaking onto another)`, () => {
      // Same shape as the schema-scoping check above but for the OUTER WHERE: the UPDATE target
      // must be joined back to the "resolved" derived table by the row's own PK, not merely by
      // ad_client_id — otherwise a client with more than one matching row at this level (e.g. two
      // accounting schemas each with their own c_acctschema_default row) could have Postgres's
      // UPDATE...FROM pick an ARBITRARY "resolved" row instead of the one that actually belongs to
      // the row being updated.
      const correlation = new RegExp(
        `where ${level.alias}\\.${level.idCol} = resolved\\.${level.idCol}`,
        'i',
      );
      assert.match(normApply, correlation);
    });

    it(`@apply's correction guard for ${level.table} matches NULL or the row's own old P_Expense_Acct value, and skips anything else`, () => {
      const guard = new RegExp(
        `\\(${level.alias}\\.p_invoicepricevariance_acct is null or ${level.alias}\\.p_invoicepricevariance_acct = ${level.alias}\\.p_expense_acct\\)`,
        'i',
      );
      assert.match(normApply, guard);
    });

    it(`@apply for ${level.table} skips a row already correctly resolved (IS DISTINCT FROM guard)`, () => {
      const guard = new RegExp(
        `resolved\\.ipv_99904000_id is distinct from ${level.alias}\\.p_invoicepricevariance_acct`,
        'i',
      );
      assert.match(normApply, guard);
    });
  });
}

describe('R35 data-fix — idempotency and correction semantics', () => {
  it('every level\'s @apply WHERE requires the NULL-or-old-value guard — never touches a genuine manual override (e.g. "Fernet" pointed at the sibling 99905000 account)', () => {
    const matches = normApply.match(/\w+\.p_invoicepricevariance_acct is null or \w+\.p_invoicepricevariance_acct = \w+\.p_expense_acct/gi) || [];
    assert.ok(matches.length >= 3, `expected a correction guard per level, found ${matches.length}`);
  });

  it('stamps updated/updatedby audit columns on every level\'s UPDATE', () => {
    const matches = normApply.match(/updated = now\(\)/gi) || [];
    assert.ok(matches.length >= 3, `expected an audit stamp per level, found ${matches.length}`);
    assert.match(normApply, /updatedby = '0'/i);
  });

  it('the account code 99904000 is referenced consistently across all 3 levels x (check + apply)', () => {
    const checkOccurrences = (fix.check.match(new RegExp(CORRECT_ACCT_VALUE, 'g')) || []).length;
    const applyOccurrences = (fix.apply.match(new RegExp(CORRECT_ACCT_VALUE, 'g')) || []).length;
    assert.ok(checkOccurrences >= 3, `expected 99904000 at least 3 times in @check, found ${checkOccurrences}`);
    assert.ok(applyOccurrences >= 3, `expected 99904000 at least 3 times in @apply, found ${applyOccurrences}`);
  });
});
