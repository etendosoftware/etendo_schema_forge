import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R32 corrective data-fix
 * (20260902T090000Z__R32-glitem-name-resync.sql, ETP-5101, gap N3).
 *
 * R31 (gap N1) backfills a C_Glitem/C_Glitem_Acct pair for a leaf subaccount that has NONE at
 * all yet -- it never touches the NAME of a subaccount whose GL Item is already linked. R32
 * closes that adjacent gap: an already-linked GL Item whose composed name went stale (renamed
 * subaccount, pre-ETP-5101 naming convention, or a hand-authored row predating ETP-5020
 * auto-provisioning) is resynced to the current composeGlItemName format.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply/@report SQL against a
 * live Postgres tenant, so true row-level behavior can only be fully verified end-to-end with a
 * DB. What is verified deterministically here, without a DB, mirrors R31's own test approach:
 * header metadata, tenant isolation, the two-layer idempotency guard, the natural-combination
 * CTE shape (byte-for-byte identical between @check and @apply per the R22/R31 symmetry lesson),
 * the resync_candidates dedup key (DISTINCT ON (c_glitem_id), NOT subaccount_id -- the one bug
 * class this file's own header explicitly warns about), the composed-name formula symmetry
 * between @check and @apply, and the @report/@apply TEMP TABLE name coupling.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260902T090000Z__R32-glitem-name-resync.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

describe('R32 data-fix — header metadata', () => {
  it('parses with the expected id, gap label (N3), risk and type', () => {
    assert.equal(fix.id, 'R32-glitem-name-resync');
    assert.equal(fix.gap, 'N3');
    assert.equal(fix.risk, 'low');
    assert.equal(fix.type, 'sql');
  });

  it('has a non-empty description', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.ok(fix.description.length > 0);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, 'R32 must carry an @report section (old name -> new name list)');
  });

  it('has a filename whose timestamp prefix sorts lexically/chronologically after R31 (2026-09-01T14:00:00Z)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-02T09:00:00.000Z');
    const r31Ts = parseFixTimestamp('20260901T140000Z__R31-glitem-subaccount-backfill');
    assert.ok(
      ts.getTime() > r31Ts.getTime(),
      'R32 must sort after R31 (20260901T140000Z__R31-glitem-subaccount-backfill.sql)',
    );
    // Lexical filename ordering must agree with chronological ordering (the framework's own
    // sort-by-filename invariant).
    assert.ok(
      '20260902T090000Z__R32-glitem-name-resync.sql' > '20260901T140000Z__R31-glitem-subaccount-backfill.sql',
    );
  });
});

describe('R32 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes @check to :client_id (both the acctschema join and the elementvalue WHERE)', () => {
    assert.match(normCheck, /s\.ad_client_id = :client_id/);
    assert.match(normCheck, /WHERE ev\.ad_client_id = :client_id/);
    assert.match(normCheck, /gi\.ad_client_id = :client_id/);
  });

  it('scopes @apply to :client_id (the CTE join, resync_candidates join, and the final UPDATE)', () => {
    assert.match(normApply, /s\.ad_client_id = :client_id/);
    assert.match(normApply, /WHERE ev\.ad_client_id = :client_id/);
    assert.match(normApply, /gi\.ad_client_id = :client_id/);
    assert.match(normApply, /AND gi\.ad_client_id = :client_id/);
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

describe('R32 data-fix — two-layer idempotency guard (mandatory rule #2)', () => {
  it('layer 1: resync_candidates itself filters on gi.name IS DISTINCT FROM the composed name', () => {
    // resync_candidates is @apply's own first-layer filter.
    const candidatesIdx = normApply.indexOf('resync_candidates AS');
    assert.ok(candidatesIdx > -1, 'resync_candidates CTE not found');
    const updatedIdx = normApply.indexOf('updated AS');
    assert.ok(updatedIdx > candidatesIdx, 'updated CTE must follow resync_candidates');
    const candidatesBody = normApply.slice(candidatesIdx, updatedIdx);
    assert.match(candidatesBody, /WHERE gi\.name IS DISTINCT FROM \( CASE/);
  });

  it('layer 2: the UPDATE itself re-checks gi.name IS DISTINCT FROM rc.new_name (defensive re-guard)', () => {
    const updatedIdx = normApply.indexOf('updated AS');
    assert.ok(updatedIdx > -1, 'updated CTE not found');
    const updateBody = normApply.slice(updatedIdx);
    assert.match(updateBody, /UPDATE c_glitem gi SET name = rc\.new_name/);
    assert.match(updateBody, /WHERE gi\.c_glitem_id = rc\.c_glitem_id/);
    assert.match(updateBody, /AND gi\.name IS DISTINCT FROM rc\.new_name/);
  });

  it('both idempotency filters are textually present in the @apply SQL (not merely described in prose)', () => {
    const distinctFromOccurrences = (normApply.match(/IS DISTINCT FROM/g) || []).length;
    // resync_candidates' own WHERE + the final UPDATE's own WHERE = at least 2 occurrences.
    assert.ok(distinctFromOccurrences >= 2, `expected >=2 IS DISTINCT FROM guards, found ${distinctFromOccurrences}`);
  });
});

describe('R32 data-fix — resync_candidates dedup key is c_glitem_id, never subaccount_id', () => {
  it('DISTINCT ON (gi.c_glitem_id) is present verbatim', () => {
    assert.match(fix.apply, /SELECT DISTINCT ON \(gi\.c_glitem_id\)/);
  });

  it('never dedupes resync_candidates by subaccount_id (would wrongly collapse 2 distinct GL Items sharing one subaccount into 1 row)', () => {
    assert.doesNotMatch(normApply, /SELECT DISTINCT ON \(nc\.subaccount_id\)/);
    assert.doesNotMatch(normApply, /SELECT DISTINCT ON \(subaccount_id\)/);
  });

  it('the DISTINCT ON (gi.c_glitem_id) belongs to resync_candidates, not to natural_combos (which dedupes on subaccount+schema instead)', () => {
    const candidatesIdx = fix.apply.indexOf('resync_candidates AS');
    const updatedIdx = fix.apply.indexOf('), updated AS');
    assert.ok(candidatesIdx > -1 && updatedIdx > candidatesIdx);
    const candidatesBody = fix.apply.slice(candidatesIdx, updatedIdx);
    assert.match(candidatesBody, /DISTINCT ON \(gi\.c_glitem_id\)/);
  });
});

describe('R32 data-fix — natural_combos CTE mirrors R31 (11-dimension all-NULL lookup)', () => {
  const dims = [
    'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id',
    'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id',
  ];

  it('@check filters all 11 dimension columns to IS NULL', () => {
    for (const dim of dims) {
      assert.match(normCheck, new RegExp(`vc\\.${dim} IS NULL`, 'i'), `@check missing dimension guard: ${dim}`);
    }
  });

  it('@apply natural_combos CTE filters the same 11 dimension columns', () => {
    for (const dim of dims) {
      assert.match(normApply, new RegExp(`vc\\.${dim} IS NULL`, 'i'), `@apply missing dimension guard: ${dim}`);
    }
  });

  it('@check and @apply define a byte-for-byte identical natural_combos CTE (per the R22/R31 symmetry lesson)', () => {
    // @apply's copy carries its own leading prose comment ("Textually identical to @check's own
    // CTE above...") that @check's does not — compare only from "SELECT DISTINCT ON" onward,
    // the same technique R31's own test uses to strip each copy's differing explanatory comment.
    const extractNaturalCombos = (sql) => {
      const start = sql.indexOf('SELECT DISTINCT ON (ev.c_elementvalue_id, s.c_acctschema_id)');
      assert.ok(start > -1, 'natural_combos CTE not found');
      const orderByIdx = sql.indexOf('ORDER BY ev.c_elementvalue_id, s.c_acctschema_id, vc.c_validcombination_id', start);
      assert.ok(orderByIdx > -1, 'natural_combos ORDER BY not found');
      const end = orderByIdx + 'ORDER BY ev.c_elementvalue_id, s.c_acctschema_id, vc.c_validcombination_id'.length;
      return sql.slice(start, end);
    };
    const checkCte = extractNaturalCombos(normCheck);
    const applyCte = extractNaturalCombos(normApply);
    assert.equal(checkCte, applyCte, '@check and @apply natural_combos CTEs must be textually identical');
  });

  it('only considers leaf (elementlevel=S), active subaccounts, joined via the AC-wired element', () => {
    assert.match(normCheck, /ev\.elementlevel = 'S'/);
    assert.match(normCheck, /ae\.elementtype = 'AC'/);
    assert.match(normApply, /ev\.elementlevel = 'S'/);
    assert.match(normApply, /ae\.elementtype = 'AC'/);
  });
});

describe('R32 data-fix — composed-name formula matches composeGlItemName exactly, symmetric in @check and @apply', () => {
  const bareCodeFallback = /CASE WHEN \w+\.subaccount_code IS NULL OR \w+\.subaccount_code = '' THEN left\(\w+\.subaccount_name, 60\)/;
  const normalCase = /ELSE \w+\.subaccount_code \|\| '-' \|\| left\(\w+\.subaccount_name, GREATEST\(60 - length\(\w+\.subaccount_code\) - 1, 0\)\) END/;

  it('@check uses the bare-code-fallback left() branch', () => {
    assert.match(normCheck, bareCodeFallback);
  });

  it('@check uses the normal subaccount_code || subaccount_name branch with GREATEST(...,0) budget', () => {
    assert.match(normCheck, normalCase);
  });

  it('@apply uses the identical bare-code-fallback left() branch', () => {
    assert.match(normApply, bareCodeFallback);
  });

  it('@apply uses the identical normal-case formula', () => {
    assert.match(normApply, normalCase);
  });

  it('the code portion is never itself truncated (only the name portion passes through left())', () => {
    assert.doesNotMatch(normCheck, /left\(nc\.subaccount_code/i);
    assert.doesNotMatch(normApply, /left\(\w+\.subaccount_code/i);
  });

  it('@apply\'s formula appears at least twice (once in resync_candidates\' SELECT, once in its own WHERE guard) — same shape both times', () => {
    const matches = normApply.match(/GREATEST\(60 - length\(nc\.subaccount_code\) - 1, 0\)/g) || [];
    assert.ok(matches.length >= 2, `expected the formula to repeat (SELECT + WHERE), found ${matches.length}`);
  });
});

describe('R32 data-fix — @report reads back from the exact TEMP TABLE @apply writes to', () => {
  it('@apply creates etgo_r32_glitem_name_resync via SELECT ... INTO TEMP TABLE from the updated CTE', () => {
    assert.match(
      normApply,
      /SELECT subaccount_code, subaccount_name, old_name, new_name INTO TEMP TABLE etgo_r32_glitem_name_resync FROM updated/,
    );
  });

  it('@report selects FROM the identical table name etgo_r32_glitem_name_resync', () => {
    assert.match(normReport, /FROM etgo_r32_glitem_name_resync/);
  });

  it('the TEMP TABLE name is textually identical between @apply and @report (a typo here would silently zero out @report)', () => {
    const applyTableMatch = normApply.match(/INTO TEMP TABLE (\w+)/);
    const reportTableMatch = normReport.match(/FROM (\w+)/);
    assert.ok(applyTableMatch, '@apply must create a TEMP TABLE');
    assert.ok(reportTableMatch, '@report must select FROM a table');
    assert.equal(applyTableMatch[1], reportTableMatch[1]);
  });

  it('the UPDATE feeding the TEMP TABLE returns old_name/new_name for operator visibility (R19/R31 pattern)', () => {
    assert.match(
      normApply,
      /RETURNING gi\.c_glitem_id, rc\.subaccount_code, rc\.subaccount_name, rc\.old_name, rc\.new_name/,
    );
  });
});

describe('R32 data-fix — self-cleaning DROP TABLE (ETP-5101 REVIEW FINDING B2)', () => {
  // A committed session-scoped TEMP TABLE survives client.release() (node-postgres does not
  // issue DISCARD ALL), and this framework's pool is reused across tenants — so a second
  // tenant's @apply on the SAME pooled connection would hit "relation ... already exists" and
  // abort the whole chain (run.js's applyChain halts on a failed @apply) unless @apply itself
  // self-cleans first. This is the LEAST battle-tested part of this fix: it was verified live
  // via psql once (see the file's own header), not by the automated suite, so these are the
  // guardrails that would have caught the DROP going missing, being misspelled, or landing in
  // the wrong position.
  it('@apply\'s first executable STATEMENT (ignoring leading -- comments) is DROP TABLE IF EXISTS, before any CTE', () => {
    // Strip @apply's own leading `-- ...` prose lines (the fix file always documents a
    // statement immediately above it) so this checks the first real SQL statement, not the
    // first line of text.
    const firstStatement = fix.apply
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'))[0];
    assert.match(firstStatement, /^DROP TABLE IF EXISTS \w+;$/);

    const dropMatch = normApply.match(/DROP TABLE IF EXISTS (\w+);/);
    assert.ok(dropMatch, '@apply must contain "DROP TABLE IF EXISTS <name>;"');
    const dropIdx = normApply.indexOf(dropMatch[0]);
    const withIdx = normApply.indexOf('WITH natural_combos AS');
    assert.ok(withIdx > -1, 'natural_combos CTE not found');
    assert.ok(dropIdx < withIdx, 'the DROP must execute BEFORE the CTE that recreates the table');
    // Nothing but the DROP statement itself (plus comments) should precede the CTE.
    const beforeCte = normApply.slice(0, withIdx);
    assert.equal((beforeCte.match(/;/g) || []).length, 1, 'exactly one statement (the DROP) before the CTE');
  });

  it('the DROP TABLE target is textually identical to the INTO TEMP TABLE / @report table name (a typo would leave a stale table across pooled-connection reuse)', () => {
    const dropMatch = normApply.match(/DROP TABLE IF EXISTS (\w+);/);
    const intoMatch = normApply.match(/INTO TEMP TABLE (\w+)/);
    const reportMatch = normReport.match(/FROM (\w+)/);
    assert.ok(dropMatch && intoMatch && reportMatch);
    assert.equal(dropMatch[1], 'etgo_r32_glitem_name_resync');
    assert.equal(dropMatch[1], intoMatch[1]);
    assert.equal(dropMatch[1], reportMatch[1]);
  });

  it('uses IF EXISTS (must not fail on a brand-new session where the temp table was never created)', () => {
    assert.match(normApply, /DROP TABLE IF EXISTS/);
    assert.doesNotMatch(normApply, /^DROP TABLE etgo_r32_glitem_name_resync;/);
  });

  it('@check carries NO DROP TABLE (read-only; only @apply may self-clean)', () => {
    assert.doesNotMatch(normCheck, /DROP TABLE/i);
  });

  it('inlineFreshUuids/inlineParams leave the DROP statement intact (no stray bind tokens or uuid labels inside it)', () => {
    const clientId = 'C'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.match(inlined, /^-- .*\n(?:-- .*\n)*DROP TABLE IF EXISTS etgo_r32_glitem_name_resync;/m);
  });
});

describe('R32 data-fix — parseFix/inlineParams round-trip cleanly (smoke parse)', () => {
  it('parseFix does not throw and produces well-formed sections from the file\'s marker lines', () => {
    assert.doesNotThrow(() => parseFix(rawText, FIX_ID));
    const reparsed = parseFix(rawText, FIX_ID);
    assert.equal(reparsed.fixId, FIX_ID);
    assert.ok(reparsed.check.length > 0);
    assert.ok(reparsed.apply.length > 0);
    assert.ok(reparsed.report.length > 0);
  });

  it('@check and @apply do not leak into each other (marker lines are well-formed)', () => {
    // @apply's resync_candidates CTE (unique to @apply) must not appear in @check.
    assert.doesNotMatch(normCheck, /resync_candidates/);
    // @report's own SELECT (unique to @report) must not appear in @apply.
    assert.doesNotMatch(normApply, /ORDER BY subaccount_code;/);
  });

  it('inlineParams can fully resolve @apply with a valid client id and leaves valid SQL text (no stray bind tokens)', () => {
    const clientId = 'B'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.doesNotMatch(inlined, /:\w+\b/, 'no unresolved bind parameters should remain');
  });
});
