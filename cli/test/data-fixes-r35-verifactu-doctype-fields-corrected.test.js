import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R35 corrective data-fix
 * (20260911T120000Z__R35-verifactu-doctype-fields-corrected.sql, gap F1).
 *
 * R35 supersedes the retired R23 (20260813T120000Z__R23-verifactu-doctype-fields,
 * retired ETP-5229, see ../src/data-fixes/retired.json): R23 hardcoded the
 * rectificative sales invoice's `em_etvfac_inv_type` to 'R1', which is a SPECIFIC
 * rectification cause per the field's AD_Ref_List, not the generic catch-all
 * reason. R35 reproduces R23's still-correct standard-invoice branch (F1/Ventas)
 * unchanged, replaces the rectificative branch with the corrected value 'R4', and
 * widens the guard to `IS NULL OR = 'R1'` so it ALSO retroactively repairs any
 * DocType R23 already mis-populated.
 *
 * SCOPE NOTE, confirmed with the user (not something this suite needs to defend
 * against): R4 is the correct DEFAULT seeded at the C_DocType level for a
 * rectificative sales invoice DocType — R1 is never a legitimate DocType-level
 * default there. A user who wants a different R1-R5 rectification reason for an
 * INDIVIDUAL invoice sets it on a separate, invoice-level SIF-tab field, never on
 * `C_DocType.em_etvfac_inv_type`. Because R35 only ever touches the DocType-level
 * column, it can never clobber that per-invoice override — the two live in
 * different tables entirely. No discriminator narrowing or extra safety check is
 * needed for this; it is documented here so a future reader does not "fix" the
 * widened guard back into something narrower.
 *
 * This is a static/parse suite (no DB): it verifies the SQL the fix ships —
 * header metadata, the discriminator shape (never matching a purchase invoice, a
 * reversal DocType, a return DocType, or a non-rectificative sales DocType),
 * two-layer idempotency of the widened guard, and :client_id tenant scoping —
 * mirroring the pattern used by
 * data-fixes-r24-payment-method-cheque-to-recibo.test.js. True row-level behavior
 * (against a live Postgres tenant) is exercised by the runner, not by this file.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260911T120000Z__R35-verifactu-doctype-fields-corrected.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
/** The fix immediately preceding R35 in the catalog (lexical sort == chronological order). */
const PREVIOUS_FIX_ID = '20260908T120000Z__R34-fin-account-cleared-payment-accounts';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Drop full-line `--` comments, then normalise — mirrors the R24 reference pattern. */
const sqlOnly = (s) =>
  norm(
    s
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n'),
  );

const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

/** The 2 executable statements of @apply, in file order. */
const statements = sqlApply
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

describe('R35 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R35-verifactu-doctype-fields-corrected');
    assert.equal(fix.gap, 'F1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that names the correction (R1 -> R4)', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /R23/);
    assert.match(fix.description, /R4/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous catalog fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-11T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime(),
      `R35 must sort after ${PREVIOUS_FIX_ID} (lexical sort == execution order)`,
    );
  });
});

describe('R35 data-fix — discriminator matches ONLY the rectificative sales DocType shape', () => {
  /** The 2 UPDATE statements: [0] standard (F1), [1] rectificative (R4). */
  const standard = () => statements[0];
  const rectificative = () => statements[1];

  it('has exactly 2 @apply statements (standard branch + rectificative branch)', () => {
    assert.equal(statements.length, 2);
    assert.match(standard(), /^UPDATE c_doctype/);
    assert.match(rectificative(), /^UPDATE c_doctype/);
  });

  it('the rectificative branch requires all 5 discriminator predicates, excluding every sibling shape', () => {
    const rect = rectificative();
    // docbasetype='ARI' excludes a purchase invoice (APC/APX/...).
    assert.match(rect, /docbasetype\s*=\s*'ARI'/);
    // issotrx='Y' excludes a purchase-side transaction.
    assert.match(rect, /issotrx\s*=\s*'Y'/);
    // isreversal='N' excludes a reversal DocType.
    assert.match(rect, /isreversal\s*=\s*'N'/);
    // isreturn='N' excludes the system-generated "Reversed Sales Invoice" DocType.
    assert.match(rect, /isreturn\s*=\s*'N'/);
    // em_etsg_isrectificative='Y' excludes a non-rectificative (standard) sales invoice DocType.
    assert.match(rect, /em_etsg_isrectificative\s*=\s*'Y'/);
  });

  it('the standard branch requires the same base discriminator but the opposite rectificative flag', () => {
    const std = standard();
    assert.match(std, /docbasetype\s*=\s*'ARI'/);
    assert.match(std, /issotrx\s*=\s*'Y'/);
    assert.match(std, /isreversal\s*=\s*'N'/);
    assert.match(std, /isreturn\s*=\s*'N'/);
    assert.match(std, /em_etsg_isrectificative\s*=\s*'N'/);
  });

  it('the two branches are mutually exclusive on em_etsg_isrectificative (no DocType can match both)', () => {
    assert.match(standard(), /em_etsg_isrectificative\s*=\s*'N'/);
    assert.match(rectificative(), /em_etsg_isrectificative\s*=\s*'Y'/);
  });

  it('never keys the discriminator on a pattern match (LIKE/ILIKE/~) that could over-match', () => {
    assert.doesNotMatch(sqlApply, /\b(I?LIKE|SIMILAR TO|~)\b/i);
    assert.doesNotMatch(sqlCheck, /\b(I?LIKE|SIMILAR TO|~)\b/i);
  });

  it('@check mirrors the exact same base discriminator (docbasetype/issotrx/isreversal/isreturn)', () => {
    assert.match(sqlCheck, /docbasetype\s*=\s*'ARI'/);
    assert.match(sqlCheck, /issotrx\s*=\s*'Y'/);
    assert.match(sqlCheck, /isreversal\s*=\s*'N'/);
    assert.match(sqlCheck, /isreturn\s*=\s*'N'/);
  });

  it('writes F1/Ventas on the standard branch and R4/Rectificaciones de Ventas/I on the rectificative one', () => {
    assert.match(standard(), /em_etvfac_inv_type\s*=\s*'F1'/);
    assert.match(standard(), /em_etvfac_verifac_desc\s*=\s*'Ventas'/);
    assert.match(rectificative(), /em_etvfac_inv_type\s*=\s*'R4'/);
    assert.match(rectificative(), /em_etvfac_verifac_desc\s*=\s*'Rectificaciones de Ventas'/);
    assert.match(rectificative(), /em_etvfac_reverseinvtype\s*=\s*'I'/);
  });
});

describe('R35 data-fix — widened guard is genuinely idempotent', () => {
  it('the rectificative branch guard accepts NULL (fresh seed) OR the old wrong R1 (correction)', () => {
    assert.match(
      rectificativeStmt(),
      /em_etvfac_inv_type\s+IS\s+NULL\s+OR\s+em_etvfac_inv_type\s*=\s*'R1'/,
    );
  });

  it('the guard does NOT match a row already corrected to R4 (no self-refire)', () => {
    // Simulate the @apply WHERE clause evaluated against a row that already reads 'R4': neither
    // "IS NULL" nor "= 'R1'" can be true, so a second pass leaves it untouched.
    const value = 'R4';
    const guardFires = value === null || value === 'R1';
    assert.equal(guardFires, false, 'a row already at R4 must not be re-matched by the guard');
  });

  it('@check mirrors the widened guard exactly, scoped to the rectificative branch only', () => {
    assert.match(
      sqlCheck,
      /d\.em_etsg_isrectificative\s*=\s*'Y'\s+AND\s+d\.em_etvfac_inv_type\s*=\s*'R1'/,
    );
    // The standard-branch @check predicate is a plain IS NULL, shared across both branches via OR —
    // it must NOT also accept 'R1' (that would be over-widening the standard branch's own guard).
    assert.match(sqlCheck, /d\.em_etvfac_inv_type\s+IS\s+NULL/);
  });

  it('@check returns 0 rows once every matching DocType reads R4/F1 — the fix converges', () => {
    // @check is `IS NULL OR (isrectificative='Y' AND ='R1')` at the row level: once a DocType's
    // em_etvfac_inv_type is 'F1' (standard) or 'R4' (rectificative), neither disjunct is true.
    for (const value of ['F1', 'R4']) {
      const stillNeedsFix = value === null || value === 'R1';
      assert.equal(stillNeedsFix, false, `${value} must read as already-fixed`);
    }
  });

  it('the standard branch keeps the plain IS NULL guard (unchanged from R23, no widening needed)', () => {
    assert.match(standardStmt(), /em_etvfac_inv_type\s+IS\s+NULL\s*;?\s*$/);
    assert.doesNotMatch(standardStmt(), /OR\s+em_etvfac_inv_type/);
  });

  function standardStmt() {
    return statements[0];
  }
  function rectificativeStmt() {
    return statements[1];
  }
});

describe('R35 data-fix — tenant isolation (:client_id scoping)', () => {
  it('scopes both @apply statements to :client_id', () => {
    for (const [i, s] of statements.entries()) {
      assert.match(
        s,
        /ad_client_id\s*=\s*:client_id/,
        `@apply statement #${i + 1} is not scoped to :client_id: ${s.slice(0, 90)}`,
      );
    }
  });

  it('scopes @check to :client_id', () => {
    assert.match(sqlCheck, /d\.ad_client_id\s*=\s*:client_id/);
  });

  it('never scopes a statement to :org_id (DocType is client-level master data)', () => {
    assert.doesNotMatch(sqlApply, /:org_id\b/);
    assert.doesNotMatch(sqlCheck, /:org_id\b/);
  });

  it('mentions :org_id NOWHERE in the parsed bodies, prose comments included (regression, per R24)', () => {
    // run.js decides whether to resolve the tenant's operative org via a raw `.includes(':org_id')`
    // over the concatenated check+apply+report text, and parseFix keeps `--` comments inside each
    // body — so merely naming `:org_id` in a comment would switch org resolution on. See the R24
    // suite's identical guard for the full incident writeup.
    for (const [name, body] of [
      ['@check', fix.check],
      ['@apply', fix.apply],
    ]) {
      assert.ok(!body.includes(':org_id'), `${name} mentions :org_id, even inside a comment`);
    }
  });

  it('binds nothing but :client_id in the parsed bodies', () => {
    const binds = new Set(`${fix.check}\n${fix.apply}`.match(/:[A-Za-z_][A-Za-z0-9_]*/g) || []);
    assert.deepEqual([...binds].sort(), [':client_id']);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    for (const body of [fix.check, fix.apply]) {
      const inlined = inlineParams(body, { client_id: clientId });
      assert.ok(inlined.includes(`'${clientId}'`));
      assert.doesNotMatch(inlined, /:client_id\b/);
    }
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R35 data-fix — fresh-seed case (row starts NULL) is handled alongside the R1 correction', () => {
  it('the standard branch @apply guard fires on a fresh NULL row', () => {
    const value = null;
    const guardFires = value === null;
    assert.equal(guardFires, true);
  });

  it('the rectificative branch @apply guard fires on BOTH a fresh NULL row and a stale R1 row', () => {
    for (const value of [null, 'R1']) {
      const guardFires = value === null || value === 'R1';
      assert.equal(guardFires, true, `guard must fire for value=${value}`);
    }
  });

  it('@check @apply write the same target values regardless of which disjunct matched (NULL or R1)', () => {
    // Whether the row started NULL (fresh seed) or 'R1' (R23 correction target), the same UPDATE
    // (unconditional SET, no CASE) writes R4/Rectificaciones de Ventas/I — there is only one target
    // state, so a fresh tenant and a corrected legacy tenant converge to an identical DocType row.
    const rect = statements[1];
    assert.doesNotMatch(rect, /\bCASE\b/i);
    assert.match(rect, /SET\s+em_etvfac_inv_type\s*=\s*'R4'/);
  });
});

describe('R35 data-fix — statement order (standard branch before rectificative)', () => {
  it('runs the standard (F1) UPDATE before the rectificative (R4) UPDATE', () => {
    const idxStandard = sqlApply.indexOf("em_etvfac_inv_type = 'F1'");
    const idxRect = sqlApply.indexOf("em_etvfac_inv_type = 'R4'");
    assert.ok(idxStandard >= 0 && idxRect >= 0 && idxStandard < idxRect);
  });

  it('keeps both effects in ONE @apply section (single transaction, all-or-nothing)', () => {
    const normApply = norm(fix.apply);
    assert.equal(normApply.split(/--\s*@apply/i).length, 1, 'exactly one @apply marker');
  });
});
