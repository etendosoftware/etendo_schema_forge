import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R31 corrective data-fix
 * (20260901T140000Z__R31-glitem-subaccount-backfill.sql, ETP-5101 S2.2, gap N1).
 *
 * ETP-5020 made subaccount creation auto-provision an invisible C_Glitem/C_Glitem_Acct pair
 * behind every new leaf C_ElementValue (elementlevel='S'), via
 * GlItemProvisioningSupport#ensureGlItemForSubaccount -- but that is forward-only (fires on a
 * live POST/PATCH through ChartOfAccountsHandler, or a fresh onboarding's bulk chart import). A
 * subaccount created BEFORE ETP-5020 shipped (2026-08-30), never PUT/re-saved since, has no
 * GLItem/GLItemAccounts row and nothing retroactively creates one. This fix is the corrective
 * twin -- the preventive front is already closed (ETP-5020, out of scope for this ticket), so
 * this is a deliberately corrective-only gap per the framework's own boundary rule.
 *
 * N2 (C_Glitem.Name varchar(60) vs C_ElementValue.Name varchar(255)) was found during this fix's
 * OWN live validation, then fixed on BOTH fronts in the same session: composeGlItemName/
 * truncateToFit (Java, GlItemProvisioningSupport) now hard-truncates the NAME portion only (never
 * the code -- the code is what disambiguates two subaccounts sharing a name), and this fix mirrors
 * that EXACT formula in SQL (Postgres `left(str, n)` = Java `String#substring(0, n)`) so both
 * fronts converge on byte-identical GL Item names, not merely "no longer diverges going forward".
 *
 * Live-validated in rolled-back transactions (2026-09-01/02, not committed here):
 *   - GOClient (1 schema, 658 missing pairs pre-fix): @apply inserted all 658 rows (0 skipped --
 *     the N2 fix means nothing is length-blocked anymore); re-@check converges to 0 rows; re-run
 *     inserted 0 (idempotent); the 2 pre-existing manual GLItems ("Capital social"/"Sueldos y
 *     salarios") stayed at exactly 1 row each (reused, not duplicated). All 294 previously-blocked
 *     rows (composed name > 60 chars) were checked byte-for-byte against a reference reimplementation
 *     of truncateToFit: 0 mismatches, every truncated name exactly 60 chars.
 *   - QA Testing (2 active schemas, 61 distinct subaccounts needing a new item): @apply inserted 61
 *     rows, 3 GL Items ended up linked to BOTH schemas (multi-schema reuse), re-@check converges to
 *     0, re-run inserted 0. This tenant also has genuine duplicate all-NULL-dimension
 *     C_ValidCombination rows for 2 (subaccount, schema) pairs -- exercised the natural_combos
 *     DISTINCT ON guard (see below), AND surfaced a second real bug: @check originally iterated
 *     every raw combination row (not deduplicated), so it kept reporting NEEDS FIX forever for
 *     these 2 subaccounts even after a fully successful @apply -- the same
 *     @check-promises-more-than-@apply-can-deliver asymmetry class Sentinel caught in R22/ETP-4743.
 *     Fixed by rewriting @check to use the identical DISTINCT ON dedup @apply's own natural_combos
 *     CTE uses, so the two are symmetric by construction.
 *
 * A real (committed, non-rolled-back) run through the actual runner CLI was attempted against a
 * disposable E2E test tenant and blocked by this environment's write-approval gate; the dry-run
 * leg of the same command against that tenant confirmed `WOULD_APPLY -- @check matched (1 row(s))`.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply/@report SQL against a live
 * Postgres tenant, so true row-level behavior can only be fully verified end-to-end with a DB.
 * What is verified deterministically here, without a DB, is the SQL the fix ships: header
 * metadata, tenant isolation, the two-layer idempotency guard, the natural-combination shape
 * mirroring GlItemProvisioningSupport#resolveNaturalCombination's 11 dimensions (deduplicated
 * identically in BOTH @check and @apply), the per-schema join (a tenant may own more than one
 * accounting schema), the get_uuid()-after-DISTINCT ordering that avoids the fan-out bug found
 * during live validation, and the N2 truncation formula + its @report.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260901T140000Z__R31-glitem-subaccount-backfill.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

describe('R31 data-fix — header metadata', () => {
  it('parses with the expected id and a fresh gap label (N1)', () => {
    assert.equal(fix.id, 'R31-glitem-subaccount-backfill');
    assert.equal(fix.gap, 'N1');
  });

  it('is a low-risk sql fix (pure additive INSERT, no destructive UPDATE/DELETE)', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions both target tables and ETP-5020', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /C_Glitem/i);
    assert.match(fix.description, /C_Glitem_Acct/i);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, 'R31 must carry an @report section (N2 truncation list)');
  });

  it('has a filename whose timestamp prefix is newer than the previous newest fix (R29 @ 2026-08-31)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-01T14:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260831T120000Z__prev').getTime(),
      'R31 must sort after every existing catalog file (R29-transfer-link-multicurrency, latest timestamp on this branch)',
    );
  });
});

describe('R31 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes @check to :client_id', () => {
    assert.match(normCheck, /s\.ad_client_id = :client_id/);
    assert.match(normCheck, /WHERE ev\.ad_client_id = :client_id/);
  });

  it('scopes @apply to :client_id (both the CTE join and the final INSERT)', () => {
    assert.match(normApply, /s\.ad_client_id = :client_id/);
    assert.match(normApply, /:client_id, r\.subaccount_org_id/);
  });

  it('scopes @report to :client_id', () => {
    assert.match(normReport, /s\.ad_client_id = :client_id/);
    assert.match(normReport, /WHERE ev\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE c_glitem" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R31 data-fix — natural combination mirrors GlItemProvisioningSupport#resolveNaturalCombination', () => {
  const dims = [
    'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id',
    'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id',
  ];

  it('the @check filters all 11 dimension columns to IS NULL (the natural combination shape)', () => {
    for (const dim of dims) {
      assert.match(normCheck, new RegExp(`vc\\.${dim} IS NULL`, 'i'), `@check missing dimension guard: ${dim}`);
    }
  });

  it('the @apply natural_combos CTE filters the same 11 dimension columns', () => {
    for (const dim of dims) {
      assert.match(normApply, new RegExp(`vc\\.${dim} IS NULL`, 'i'), `@apply missing dimension guard: ${dim}`);
    }
  });

  it('only considers leaf (elementlevel=S), active subaccounts, joined via the AC-wired element', () => {
    assert.match(normCheck, /ev\.elementlevel = 'S'/);
    assert.match(normCheck, /ae\.elementtype = 'AC'/);
    assert.match(normApply, /ev\.elementlevel = 'S'/);
    assert.match(normApply, /ae\.elementtype = 'AC'/);
  });
});

describe('R31 data-fix — per-schema coverage (a tenant may own more than one accounting schema)', () => {
  it('joins c_acctschema on ad_client_id + isactive, not a single hardcoded schema id', () => {
    assert.match(normCheck, /JOIN c_acctschema s ON s\.c_acctschema_id = ae\.c_acctschema_id AND s\.isactive = 'Y' AND s\.ad_client_id = :client_id/i);
    assert.match(normApply, /JOIN c_acctschema s ON s\.c_acctschema_id = ae\.c_acctschema_id AND s\.isactive = 'Y' AND s\.ad_client_id = :client_id/i);
  });
});

describe('R31 data-fix — idempotency key is the natural combination, never the GL Item name', () => {
  it('@check idempotency guard keys off glitem_debit_acct, not name', () => {
    assert.match(normCheck, /NOT EXISTS \( SELECT 1 FROM c_glitem_acct ga WHERE ga\.glitem_debit_acct = nc\.combo_id \)/i);
  });

  it('the reuse CTE (existing_glitem_by_subaccount) also keys off glitem_debit_acct', () => {
    assert.match(normApply, /existing_glitem_by_subaccount AS \(/i);
    assert.match(normApply, /JOIN c_glitem_acct ga ON ga\.glitem_debit_acct = nc\.combo_id/i);
  });

  it('the final INSERT re-checks both the (glitem, schema) unique key and the combination key (defensive re-guard)', () => {
    assert.match(normApply, /ga2\.c_glitem_id = r\.c_glitem_id AND ga2\.c_acctschema_id = r\.c_acctschema_id/i);
    assert.match(normApply, /ga3\.glitem_debit_acct = r\.combo_id/i);
  });
});

describe('R31 data-fix — @check/@apply symmetry (ETP-4743/Sentinel asymmetry class, regression)', () => {
  // BUG found+fixed during this fix's OWN live validation: a plain (non-deduplicated) @check kept
  // reporting NEEDS FIX for a tenant with duplicate C_ValidCombination rows even after @apply
  // correctly finished everything it could legitimately close (QA Testing, 2 duplicate pairs).
  // @check must dedupe identically to @apply's own natural_combos, or it over-promises forever.
  it('@check wraps its own natural_combos CTE with the SAME DISTINCT ON dedup as @apply', () => {
    assert.match(normCheck, /WITH natural_combos AS \( SELECT DISTINCT ON \(ev\.c_elementvalue_id, s\.c_acctschema_id\)/i);
    assert.match(normCheck, /ORDER BY ev\.c_elementvalue_id, s\.c_acctschema_id, vc\.c_validcombination_id/i);
  });

  it('@check and @apply apply the identical 11-dimension natural-combination filter inside their own natural_combos CTE (byte-for-byte join shape)', () => {
    const extractNaturalCombosBody = (sql) => {
      const start = sql.indexOf('WITH natural_combos AS (');
      assert.ok(start > -1, 'natural_combos CTE not found');
      // Grab up through the closing "ORDER BY ...c_validcombination_id" that terminates the CTE's SELECT.
      const orderByIdx = sql.indexOf('ORDER BY ev.c_elementvalue_id, s.c_acctschema_id, vc.c_validcombination_id', start);
      assert.ok(orderByIdx > -1, 'natural_combos ORDER BY not found');
      return sql.slice(start, orderByIdx);
    };
    const checkBody = extractNaturalCombosBody(normCheck);
    const applyBody = extractNaturalCombosBody(normApply);
    // Strip each CTE's own leading prose comment (the two files' explanatory comments differ in
    // wording) — compare only the SQL from "SELECT DISTINCT ON" onward.
    const sqlOnly = (body) => body.slice(body.indexOf('SELECT DISTINCT ON'));
    // @check's natural_combos only projects combo_id; @apply's projects more columns. Compare just
    // the shared join/filter shape both must agree on: the FROM..WHERE clause.
    const joinShape = (body) => {
      const fromIdx = body.indexOf('FROM c_elementvalue ev');
      const whereEnd = body.indexOf("ev.isactive = 'Y'") + "ev.isactive = 'Y'".length;
      return body.slice(fromIdx, whereEnd);
    };
    assert.equal(joinShape(sqlOnly(checkBody)), joinShape(sqlOnly(applyBody)));
  });
});

describe('R31 data-fix — column mapping mirrors GlItemProvisioningSupport 1:1', () => {
  it('C_Glitem Client/Org come from the SUBACCOUNT, never the schema (matches createGlItem)', () => {
    assert.match(normApply, /INSERT INTO c_glitem \(/i);
    assert.match(normApply, /itc\.new_glitem_id, itc\.ad_client_id, itc\.subaccount_org_id, 'Y'/i);
  });

  it('C_Glitem_Acct Client/Org come from the subaccount too, and debit = credit = the same combo', () => {
    assert.match(normApply, /INSERT INTO c_glitem_acct \(/i);
    assert.match(normApply, /:client_id, r\.subaccount_org_id, 'Y'/i);
    assert.match(normApply, /now\(\), '0', now\(\), '0', r\.combo_id, r\.combo_id/i);
  });

  it('composed name is "<searchKey/value> <name, truncated to fit>", falling back to the (possibly truncated) bare name when the code is blank', () => {
    assert.match(
      normApply,
      /CASE WHEN itc\.subaccount_code IS NULL OR itc\.subaccount_code = '' THEN left\(itc\.subaccount_name, 60\) ELSE itc\.subaccount_code \|\| '-' \|\| left\(itc\.subaccount_name, GREATEST\(60 - length\(itc\.subaccount_code\) - 1, 0\)\) END/i,
    );
  });

  it('EnableInCash/EnableInFinInvoices left at their column defaults (N/N), tax columns NULL — satisfies every C_Glitem CHECK constraint', () => {
    assert.match(normApply, /NULL, 'N', 'N', NULL, NULL, NULL/i);
  });
});

describe('R31 data-fix — get_uuid() ordering avoids the fan-out bug found during live validation', () => {
  it('get_uuid() for a new C_Glitem id is computed AFTER deduplication (subaccounts_needing_new_item), not inside a SELECT DISTINCT', () => {
    // The bug: get_uuid() is volatile, so calling it as part of a `SELECT DISTINCT` list before
    // the source rows (one per missing schema) are collapsed mints a DIFFERENT id per schema for
    // the SAME subaccount, breaking "one subaccount, one GL Item" and violating
    // c_glitem_acct_glitem_acctsc_un on insert (reproduced live against QA Testing, a tenant with
    // 2 active schemas, before this CTE split existed).
    const dedupIdx = normApply.indexOf('subaccounts_needing_new_item AS');
    const itemsIdx = normApply.indexOf('items_to_create AS');
    const uuidIdx = normApply.indexOf('get_uuid() AS new_glitem_id');
    assert.ok(dedupIdx > -1 && itemsIdx > -1 && uuidIdx > -1, 'expected CTEs not found');
    assert.ok(dedupIdx < itemsIdx, 'dedup CTE must be defined before the id-minting CTE');
    assert.ok(uuidIdx > itemsIdx, 'get_uuid() must be minted in items_to_create, reading from the already-deduplicated CTE');
    // subaccounts_needing_new_item itself must not call get_uuid() -- it should only be plain columns.
    const dedupBody = normApply.slice(dedupIdx, itemsIdx);
    assert.doesNotMatch(dedupBody, /get_uuid\(\)/i, 'the dedup CTE must not itself call get_uuid()');
  });

  it('natural_combos picks exactly one combination per (subaccount, schema) via DISTINCT ON, mirroring resolveNaturalCombination\'s ORDER BY id ASC / setMaxResults(1)', () => {
    assert.match(normApply, /SELECT DISTINCT ON \(ev\.c_elementvalue_id, s\.c_acctschema_id\)/i);
    assert.match(normApply, /ORDER BY ev\.c_elementvalue_id, s\.c_acctschema_id, vc\.c_validcombination_id/i);
  });

  it('created_items is referenced downstream (resolved_glitem), so Postgres actually executes the data-modifying CTE', () => {
    assert.match(normApply, /LEFT JOIN created_items ci ON ci\.c_glitem_id = itc\.new_glitem_id/i);
  });
});

describe('R31 data-fix — N2 truncation (C_Glitem.Name is varchar(60)) — FIXED, matches composeGlItemName/truncateToFit byte-for-byte', () => {
  it('subaccounts_needing_new_item no longer gates on length — truncation makes every composed name fit by construction', () => {
    assert.doesNotMatch(
      normApply,
      /<= 60\s*\)\s*,\s*items_to_create/i,
      'the length skip-guard must be gone now that created_items truncates',
    );
    // sanity: the CTE still exists and still dedupes on the reuse check, just without the length filter.
    assert.match(normApply, /subaccounts_needing_new_item AS \( .* FROM missing_pairs mp WHERE NOT EXISTS \( SELECT 1 FROM existing_glitem_by_subaccount e WHERE e\.subaccount_id = mp\.subaccount_id \) \), items_to_create AS/i);
  });

  it('created_items truncates the NAME portion only via left(), mirroring Java\'s truncateToFit(name, GL_ITEM_NAME_MAX_LENGTH - suffix.length()) — never truncates or drops the code', () => {
    // Budget when a code is present: 60 - (1 + code.length()) — GREATEST(...,0) mirrors Java's
    // Math.max(0, maxLength) so it can never go negative (Postgres left() with a negative n has a
    // DIFFERENT meaning — "all but the last |n| chars" — which would silently disagree with Java).
    assert.match(normApply, /itc\.subaccount_code \|\| '-' \|\| left\(itc\.subaccount_name, GREATEST\(60 - length\(itc\.subaccount_code\) - 1, 0\)\)/i);
    assert.match(normApply, /left\(itc\.subaccount_name, 60\)/i, 'no-code branch truncates to the full 60-char budget');
    // The code itself must never be truncated — it always appears in full before the hyphen.
    assert.doesNotMatch(normApply, /left\(itc\.subaccount_code/i, 'the code must never be passed through left()/truncated');
  });

  it('@report lists subaccounts whose linked GL Item name is EXACTLY the deterministic truncation formula — precise, not a guess', () => {
    assert.match(normReport, /length\(ev\.name \|\| ' ' \|\| ev\.value\) > 60/i);
    assert.match(
      normReport,
      /CASE WHEN ev\.value IS NULL OR ev\.value = '' THEN left\(ev\.name, 60\) ELSE ev\.value \|\| '-' \|\| left\(ev\.name, GREATEST\(60 - length\(ev\.value\) - 1, 0\)\) END AS expected_truncated_name/i,
    );
    // Matched by equality against the actually-linked GL Item's name — a pre-existing, reused,
    // differently-named manual GL Item (e.g. "Capital social") must NOT be reported as truncated.
    assert.match(normReport, /JOIN c_glitem gi ON gi\.c_glitem_id = ga\.c_glitem_id AND gi\.name = c\.expected_truncated_name/i);
  });

  it('@report never truncates using ellipsis or a different budget than @apply — same GREATEST(60 - length(code) - 1, 0) formula in both sections', () => {
    const applyFormula = 'GREATEST(60 - length(itc.subaccount_code) - 1, 0)';
    const reportFormula = 'GREATEST(60 - length(ev.value) - 1, 0)';
    assert.ok(normApply.includes(applyFormula));
    assert.ok(normReport.includes(reportFormula));
    assert.doesNotMatch(normReport, /\.\.\.|…/, '@report must not use an ellipsis marker anywhere');
  });
});
