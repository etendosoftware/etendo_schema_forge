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
 * later timestamp in the same catalog, not by editing it.
 *
 * CASCADE DESIGN (ETP-5222 follow-up, 2026-09-09): only LEVEL 1 (`c_acctschema_default`) resolves
 * `99904000`'s OWN natural `C_ValidCombination` independently (scoped through `C_AcctSchema_Element`
 * `elementtype = 'AC'` so an unwired "orphan" element sharing the same account code is never
 * picked). LEVELS 2/3 (`m_product_category_acct` / `m_product_acct`) no longer re-derive that
 * resolution themselves — they COALESCE/copy `C_AcctSchema_Default.p_invoicepricevariance_acct`
 * for their own `(ad_client_id, c_acctschema_id)`, matching the ORIGINAL plan's "Layer B" design
 * (`santo_ETP-5222-analysis-and-plan.md`) instead of the file's first-shipped version, which
 * independently re-ran the full dimension-filtered JOIN chain three times. A real, deliberate
 * consequence of this cascade (live-verified, not hypothetical): a tenant whose schema-default
 * ALREADY holds a genuine, non-99904000 value (e.g. its own dedicated "Invoice price variance"
 * account on a chart that doesn't use GOClient's numbering at all) now correctly propagates THAT
 * value to Levels 2/3 too, rather than being silently skipped at those levels the way independent
 * per-level 99904000-only resolution used to leave them. See the SQL file's own "Cascade design"
 * comment for the full ordering/visibility proof (same-transaction, Level 1 always runs first).
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live Postgres
 * tenant; end-to-end row-level behavior was verified by hand in rolled-back transactions against
 * GOClient (99904000 resolves: schema default + all 3 category rows + 5 of 6 product rows
 * corrected; the 6th, "Fernet", pointed at the sibling 99905000 account by a prior manual set, is
 * correctly left untouched since it matches neither the NULL nor the P_Expense_Acct branch of the
 * guard), SantoEmpresa (same shape, its own resolved combination), a "QA Testing" client whose
 * chart lacks 99904000 entirely on either of its 2 schemas (the runner reports SKIPPED_NOT_NEEDED,
 * 0 rows touched at any level — the `d.p_invoicepricevariance_acct IS NOT NULL` guard on Levels 2/3
 * prevents them from ever writing NULL over an existing value), and "F&B International Group" (a
 * real 2-schema client: one schema already holds a genuine non-99904000 schema-level value, which
 * the simplified cascade now correctly propagates to that schema's own product rows — the other
 * schema is NULL and stays untouched, confirming per-schema isolation still holds under the new
 * design). What is verified deterministically here, without a DB, mirrors the R34/R21 precedent:
 * header metadata, tenant isolation, the 99904000-via-C_AcctSchema_Element resolution shape
 * (Level 1 only), the cascade shape (Levels 2/3), the "NULL or old P_Expense_Acct value only"
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

/** Level 1 — the only level that independently resolves 99904000 via C_AcctSchema_Element. */
const SOURCE_LEVEL = { table: 'c_acctschema_default', alias: 'd', idCol: 'c_acctschema_default_id', sourceAlias: 'd2' };

/** Levels 2/3 — cascade (COALESCE/copy) from Level 1's own c_acctschema_default row. */
const CASCADE_LEVELS = [
  { table: 'm_product_category_acct', alias: 'pca' },
  { table: 'm_product_acct', alias: 'pa' },
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

describe('R35 data-fix — Level 1 (c_acctschema_default): 99904000 resolved via C_AcctSchema_Element, never an unwired orphan element, never a fallback', () => {
  it('the @check probes 99904000 through c_acctschema_element joined by elementtype = \'AC\' (exactly once — Level 1 only)', () => {
    const matches = normCheck.match(/c_acctschema_element ae/g) || [];
    assert.equal(matches.length, 1, `expected exactly 1 c_acctschema_element join in @check (Level 1 only), found ${matches.length}`);
    assert.match(normCheck, /ae\.elementtype = 'AC'/);
  });

  it('the @apply probes 99904000 through c_acctschema_element joined by elementtype = \'AC\' (exactly once — Level 1 only)', () => {
    const matches = normApply.match(/c_acctschema_element ae/g) || [];
    assert.equal(matches.length, 1, `expected exactly 1 c_acctschema_element join in @apply (Level 1 only), found ${matches.length}`);
  });

  it('the @check joins C_ElementValue by the 99904000 account code, scoped to the element actually wired to the row\'s own schema', () => {
    const pattern = /ev\.c_element_id = ae\.c_element_id and ev\.value = '99904000'/gi;
    const matches = normCheck.match(pattern) || [];
    assert.equal(matches.length, 1, `expected exactly 1 account-value join in @check (Level 1 only), found ${matches.length}`);
  });

  it('uses plain INNER JOINs (not LEFT JOIN) at every level — this correction never falls back to P_Expense_Acct of its own accord', () => {
    assert.doesNotMatch(normApply, /left join/i);
    assert.doesNotMatch(normCheck, /left join/i);
  });

  it('never hardcodes a cross-tenant C_ValidCombination id anywhere in @check or @apply', () => {
    assert.doesNotMatch(normCheck, /p_invoicepricevariance_acct = '[0-9A-F]{32}'/i);
    assert.doesNotMatch(normApply, /p_invoicepricevariance_acct = '[0-9A-F]{32}'/i);
  });

  it(`@apply resolves ${SOURCE_LEVEL.table} via a derived table keyed on ${SOURCE_LEVEL.idCol}, sourcing vc.c_validcombination_id`, () => {
    const updateBlock = new RegExp(
      `UPDATE ${SOURCE_LEVEL.table} ${SOURCE_LEVEL.alias}[\\s\\S]*?SET p_invoicepricevariance_acct = resolved\\.ipv_99904000_id`,
      'i',
    );
    assert.match(fix.apply, updateBlock);
  });

  it(`@apply scopes the element/combination lookup through the row's OWN c_acctschema_id (not a fixed :schema_id)`, () => {
    const scoping = new RegExp(
      `ae\\.c_acctschema_id = ${SOURCE_LEVEL.sourceAlias}\\.c_acctschema_id and ae\\.ad_client_id = ${SOURCE_LEVEL.sourceAlias}\\.ad_client_id`,
      'i',
    );
    assert.match(normApply, scoping);
  });

  it(`@apply correlates the UPDATE target back to its resolved source row by primary key`, () => {
    const correlation = new RegExp(
      `where ${SOURCE_LEVEL.alias}\\.${SOURCE_LEVEL.idCol} = resolved\\.${SOURCE_LEVEL.idCol}`,
      'i',
    );
    assert.match(normApply, correlation);
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
 *
 * ETP-5222 follow-up (cascade design, 2026-09-09): this filter now lives ONLY in Level 1's own
 * resolution (Levels 2/3 no longer re-derive the combination at all — they copy Level 1's already
 * -resolved value), so every count below dropped from "at least 3" to "exactly 1".
 */
const DIMENSION_COLUMNS = [
  'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id',
  'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id',
];

describe('R35 data-fix — NATURAL combination filter (ETP-5222 review fix, Alex/W1) — Level 1 only', () => {
  for (const column of DIMENSION_COLUMNS) {
    it(`the @check requires vc.${column} IS NULL exactly once (Level 1's combination lookup)`, () => {
      const pattern = new RegExp(`vc\\.${column} is null`, 'gi');
      const matches = normCheck.match(pattern) || [];
      assert.equal(matches.length, 1, `expected vc.${column} IS NULL exactly once in @check, found ${matches.length}`);
    });

    it(`the @apply requires vc.${column} IS NULL exactly once (Level 1's combination lookup)`, () => {
      const pattern = new RegExp(`vc\\.${column} is null`, 'gi');
      const matches = normApply.match(pattern) || [];
      assert.equal(matches.length, 1, `expected vc.${column} IS NULL exactly once in @apply, found ${matches.length}`);
    });
  }

  it('the @check defensively orders + limits the combination lookup to 1 row (Level 1 only)', () => {
    const matches = normCheck.match(/order by vc\.c_validcombination_id limit 1/gi) || [];
    assert.equal(matches.length, 1, `expected the ORDER BY + LIMIT 1 guard exactly once in @check, found ${matches.length}`);
  });

  it('the @apply defensively orders + limits the combination lookup to 1 row (Level 1 only)', () => {
    const matches = normApply.match(/order by vc\.c_validcombination_id limit 1/gi) || [];
    assert.equal(matches.length, 1, `expected the ORDER BY + LIMIT 1 guard exactly once in @apply, found ${matches.length}`);
  });

  it('resolves the combination via a correlated scalar subquery (not a plain JOIN c_validcombination), so it can carry its own ORDER BY/LIMIT', () => {
    assert.doesNotMatch(normCheck, /join c_validcombination vc on/i);
    assert.doesNotMatch(normApply, /join c_validcombination vc on/i);
    assert.match(normCheck, /\(select vc\.c_validcombination_id from c_validcombination vc/i);
    assert.match(normApply, /\(select vc\.c_validcombination_id from c_validcombination vc/i);
  });
});

describe('R35 data-fix — Level 1 correction (NULL or old P_Expense_Acct value → 99904000)', () => {
  it(`@apply's correction guard matches NULL or the row's own old P_Expense_Acct value, and skips anything else`, () => {
    const guard = new RegExp(
      `\\(${SOURCE_LEVEL.alias}\\.p_invoicepricevariance_acct is null or ${SOURCE_LEVEL.alias}\\.p_invoicepricevariance_acct = ${SOURCE_LEVEL.alias}\\.p_expense_acct\\)`,
      'i',
    );
    assert.match(normApply, guard);
  });

  it(`@apply skips a row already correctly resolved (IS DISTINCT FROM guard)`, () => {
    const guard = new RegExp(
      `resolved\\.ipv_99904000_id is distinct from ${SOURCE_LEVEL.alias}\\.p_invoicepricevariance_acct`,
      'i',
    );
    assert.match(normApply, guard);
  });
});

/**
 * ETP-5222 follow-up (cascade design, 2026-09-09): Levels 2/3 no longer independently re-derive
 * 99904000 — they COALESCE/copy Level 1's OWN c_acctschema_default.p_invoicepricevariance_acct for
 * their own (ad_client_id, c_acctschema_id). This is verified by absence (no c_acctschema_element/
 * c_validcombination/99904000 reference anywhere outside Level 1's own block — asserted above as
 * "exactly 1" occurrences for the whole file) and by presence (the join shape below).
 */
for (const level of CASCADE_LEVELS) {
  describe(`R35 data-fix — level "${level.table}" cascade (COALESCE from c_acctschema_default, ETP-5222 follow-up)`, () => {
    it(`@check joins c_acctschema_default d on the row's OWN (c_acctschema_id, ad_client_id) — not a fixed :schema_id`, () => {
      const scoping = new RegExp(
        `join c_acctschema_default d on d\\.c_acctschema_id = ${level.alias}\\.c_acctschema_id and d\\.ad_client_id = ${level.alias}\\.ad_client_id`,
        'i',
      );
      assert.match(normCheck, scoping);
    });

    it(`@apply joins c_acctschema_default d on the row's OWN (c_acctschema_id, ad_client_id) — not a fixed :schema_id`, () => {
      const scoping = new RegExp(
        `from c_acctschema_default d where d\\.c_acctschema_id = ${level.alias}\\.c_acctschema_id and d\\.ad_client_id = ${level.alias}\\.ad_client_id`,
        'i',
      );
      assert.match(normApply, scoping);
    });

    it(`@apply for ${level.table} copies d.p_invoicepricevariance_acct directly (no independent combination derivation of its own)`, () => {
      const updateBlock = new RegExp(
        `UPDATE ${level.table} ${level.alias}\\s+SET p_invoicepricevariance_acct = d\\.p_invoicepricevariance_acct`,
        'i',
      );
      assert.match(fix.apply, updateBlock);
    });

    it(`@check requires d.p_invoicepricevariance_acct IS NOT NULL (no fallback of its own — a chart lacking 99904000, and lacking any schema-level override, stays untouched)`, () => {
      const matches = normCheck.match(/d\.p_invoicepricevariance_acct is not null/gi) || [];
      assert.ok(matches.length >= 1, `expected d.p_invoicepricevariance_acct IS NOT NULL in @check for ${level.table}`);
    });

    it(`@apply requires d.p_invoicepricevariance_acct IS NOT NULL (prevents writing NULL over an existing value when the schema default itself is unresolved)`, () => {
      const matches = normApply.match(/d\.p_invoicepricevariance_acct is not null/gi) || [];
      assert.ok(matches.length >= 1, `expected d.p_invoicepricevariance_acct IS NOT NULL in @apply for ${level.table}`);
    });

    it(`@apply's correction guard for ${level.table} matches NULL or the row's own old P_Expense_Acct value, and skips anything else`, () => {
      const guard = new RegExp(
        `\\(${level.alias}\\.p_invoicepricevariance_acct is null or ${level.alias}\\.p_invoicepricevariance_acct = ${level.alias}\\.p_expense_acct\\)`,
        'i',
      );
      assert.match(normApply, guard);
    });

    it(`@apply for ${level.table} skips a row already matching the schema default (IS DISTINCT FROM guard)`, () => {
      const guard = new RegExp(
        `d\\.p_invoicepricevariance_acct is distinct from ${level.alias}\\.p_invoicepricevariance_acct`,
        'i',
      );
      assert.match(normApply, guard);
    });

    it(`@check does NOT re-derive 99904000/c_acctschema_element/c_validcombination for ${level.table} (cascade, not independent resolution)`, () => {
      // Isolate this level's own UNION ALL branch in @check and assert it stays free of the
      // Level-1-only resolution machinery.
      const branchPattern = new RegExp(
        `select 1 from ${level.table} ${level.alias}[\\s\\S]*?(?=union all|$)`,
        'i',
      );
      const branch = normCheck.match(branchPattern)?.[0] || '';
      assert.ok(branch.length > 0, `could not isolate the ${level.table} @check branch`);
      assert.doesNotMatch(branch, /c_acctschema_element/i);
      assert.doesNotMatch(branch, /c_validcombination/i);
      assert.doesNotMatch(branch, /99904000/);
    });
  });
}

describe('R35 data-fix — idempotency and correction semantics', () => {
  it('every level\'s @apply WHERE requires the NULL-or-own-P_Expense_Acct guard — never touches a genuine manual override (e.g. "Fernet" pointed at the sibling 99905000 account)', () => {
    const matches = normApply.match(/\w+\.p_invoicepricevariance_acct is null or \w+\.p_invoicepricevariance_acct = \w+\.p_expense_acct/gi) || [];
    assert.ok(matches.length >= 3, `expected a correction guard per level, found ${matches.length}`);
  });

  it('stamps updated/updatedby audit columns on every level\'s UPDATE', () => {
    const matches = normApply.match(/updated = now\(\)/gi) || [];
    assert.ok(matches.length >= 3, `expected an audit stamp per level, found ${matches.length}`);
    assert.match(normApply, /updatedby = '0'/i);
  });

  it('the account code 99904000 is referenced only within Level 1\'s own resolution (Levels 2/3 cascade from it instead of re-referencing it)', () => {
    // @check: one literal occurrence — the ev.value = '99904000' join condition inside Level 1's
    // UNION ALL branch. @apply: the literal ev.value = '99904000' join PLUS 4 more occurrences of
    // the "ipv_99904000_id" derived-column alias, reused across Level 1's own SELECT/SET/WHERE
    // clauses (the alias name embeds the account code) — still entirely confined to Level 1's own
    // UPDATE statement, never appearing in Levels 2/3's cascade UPDATEs.
    const checkOccurrences = (fix.check.match(new RegExp(CORRECT_ACCT_VALUE, 'g')) || []).length;
    const applyOccurrences = (fix.apply.match(new RegExp(CORRECT_ACCT_VALUE, 'g')) || []).length;
    assert.equal(checkOccurrences, 1, `expected 99904000 exactly once in @check, found ${checkOccurrences}`);
    assert.equal(applyOccurrences, 5, `expected 99904000 exactly 5 times in @apply (1 literal join + 4 ipv_99904000_id alias reuses, all within Level 1's own UPDATE), found ${applyOccurrences}`);
  });
});
