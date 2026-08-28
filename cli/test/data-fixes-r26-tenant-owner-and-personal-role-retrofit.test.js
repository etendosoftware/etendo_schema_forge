import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R26 corrective data-fix
 * (20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit.sql, gap L1, ETP-4877).
 *
 * QA gap this closes: R26 shipped with only the generic catalog-level `@report` presence check
 * (cli/test/data-fixes-report-regression.test.js) — no dedicated per-fix test file, unlike every
 * other R** fix in the catalog. Two behavioral claims were verified LIVE (rolled-back
 * transactions) as part of QA's ETP-4877 pass and are documented in the ledger, not re-asserted
 * here (a static suite cannot prove live row-level behavior — see R24's own header note):
 *   - Step 0 (owner detection) and Steps 1-8b were exercised via a real, committed `--fix` run
 *     against a throwaway tenant (acreedortest).
 *   - Step 8b's "gain Finance -> Y / lose Finance -> N" derivation was exercised via a rolled-back
 *     transaction with a synthetic role and AD_Role_Inheritance row, both directions.
 * What THIS suite pins is the STATIC contract that makes those results reproducible: header
 * metadata, tenant isolation, the owner-detection atomicity guard, and — the sharpest regression
 * risk here — that Step 8b's SQL predicate is byte-for-byte the SAME derivation
 * (`AD_Role_Inheritance` row, active, `inherit_from` = the Finance template id) that
 * `UserRoleCompositionService#syncShowAccountingFieldsFlag` uses on the Java "going forward" side.
 * The two are explicitly documented as needing to be kept in lockstep; a future edit to either
 * side without the other is exactly the kind of silent drift this suite exists to catch.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
/** The fix immediately preceding R26 in the catalog (lexical sort == chronological order). */
const PREVIOUS_FIX_ID = '20260824T120000Z__R25-bankstatement-stale-status';
/** SystemRoleTemplates.FINANCE_ROLE_ID (com.etendoerp.go) — must match Step 8a/8b's literal id. */
const FINANCE_TEMPLATE_ID = 'B88A34B5D1874F8685FA6F3C3A609412';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sqlOnly = (s) =>
  norm(s.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n'));

const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report);

describe('R26 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R26-tenant-owner-and-personal-role-retrofit');
    assert.equal(fix.gap, 'L1');
  });

  it('is a high-risk sql fix (multi-step, touches ownership + role composition)', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'high');
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, '@report surfaces what this fix cannot mechanically resolve');
  });

  it('has a filename whose timestamp is newer than the previous catalog fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-26T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime(),
      `R26 must sort after ${PREVIOUS_FIX_ID}`,
    );
  });
});

describe('R26 data-fix — tenant isolation', () => {
  it('scopes @check to :client_id', () => {
    assert.match(sqlCheck, /ad_client_id = :client_id/);
  });

  it('every @apply step other than Step 8a references :client_id somewhere in its own body', () => {
    // Step 8a is the sole, deliberate exception (system-level singleton, see its own describe
    // block below). NOTE: this does NOT split @apply on bare ';' — Step 1's own description text
    // ("...template inheritances; do not edit directly.") contains a literal semicolon INSIDE a
    // quoted string, which a naive split would misinterpret as a statement boundary. Instead this
    // checks each numbered "-- Step N --" section (comments are stripped from sqlApply, but the
    // RAW text still has them) independently.
    const stepHeaders = [...rawText.matchAll(/-- Step (\d[ab]?) --/g)].map((m) => m[1]);
    assert.deepEqual(stepHeaders, ['0', '1', '2', '2b', '3', '4', '5', '6', '7', '8a', '8b']);
    const stepBody = (label) => {
      const re = new RegExp(`-- Step ${label} --[\\s\\S]*?(?=-- Step |-- @report|$)`);
      const m = rawText.match(re);
      assert.ok(m, `Step ${label} section not found`);
      return m[0];
    };
    // Step 7 is documentation-only ("no separate role-level cleanup is needed beyond Step 6's own
    // reconciliation") — it emits no SQL of its own, so it is excluded from the :client_id sweep.
    assert.doesNotMatch(stepBody('7'), /^UPDATE|^INSERT|^DELETE/m, 'Step 7 must stay comment-only');
    for (const label of ['0', '1', '2', '2b', '3', '4', '5', '6']) {
      assert.match(stepBody(label), /:client_id\b/, `Step ${label} must reference :client_id`);
    }
    // Comment-stripped: Step 8a's own PROSE mentions ":client_id" (explaining it is deliberately
    // unscoped) — real code must not, but the comment alone must not fail this negative check.
    assert.doesNotMatch(sqlOnly(stepBody('8a')), /:client_id\b/, 'Step 8a is a global singleton and must NOT be client-scoped');
    assert.match(stepBody('8b'), /:client_id\b/, 'Step 8b must reference :client_id');
  });

  it('never mentions :org_id anywhere (this fix never resolves the tenant operative org)', () => {
    for (const [name, body] of [['@check', fix.check], ['@apply', fix.apply], ['@report', fix.report]]) {
      assert.ok(!body.includes(':org_id'), `${name} must not mention :org_id, even in a comment`);
    }
  });

  it('binds only :client_id across the three sections (a colon-prefixed literal is not a bind)', () => {
    // NOTE: Step 1's deterministic-id derivation concatenates the literal string
    // ':ETP4877-personal-role' (a namespace tag for the MD5 hash, not a runner bind) — it matches
    // a naive `:word` regex the same way :client_id does, so it is explicitly excluded here rather
    // than silently passing a weaker assertion. run.js's own `.includes(':org_id')` scan (the thing
    // this class of regression actually threatens — see R24's own regression note) only tests for
    // that ONE literal substring, so a stray ':ETP4877...' token is harmless to the runner either way.
    const binds = new Set(
      `${fix.check}\n${fix.apply}\n${fix.report}`.match(/:[A-Za-z_][A-Za-z0-9_]*/g) || [],
    );
    binds.delete(':ETP4877');
    assert.deepEqual([...binds], [':client_id']);
    assert.ok(fix.apply.includes("':ETP4877-personal-role'"), 'sanity: the known literal must still be present verbatim');
  });

  it('refuses an injection-y :client_id value', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1'; DROP TABLE ad_role; --" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R26 data-fix — Step 0 owner-detection atomicity (gap L1)', () => {
  it('is a single UPDATE, not a SELECT-then-UPDATE (no TOCTOU window across concurrent runs)', () => {
    const step0 = sqlApply.match(/^UPDATE ad_user SET em_etgo_is_owner = 'Y'.*?;/)?.[0];
    assert.ok(step0, 'Step 0 UPDATE not found at the start of @apply');
  });

  it('the same statement both resolves the candidate AND guards against a pre-existing owner', () => {
    const step0 = sqlApply.match(/^UPDATE ad_user SET em_etgo_is_owner = 'Y'.*?;/)[0];
    // Candidate resolution: earliest-created is_client_admin holder.
    assert.match(step0, /ORDER BY u2\.created ASC, u2\.ad_user_id ASC LIMIT 1/);
    assert.match(step0, /r2\.is_client_admin = 'Y'/);
    // Idempotency / concurrency guard in the SAME statement.
    assert.match(step0, /AND NOT EXISTS \(SELECT 1 FROM ad_user u3 WHERE u3\.ad_client_id = :client_id AND u3\.em_etgo_is_owner = 'Y'\)/);
  });

  it('never assigns ownership to more than the resolved candidate (no bare UPDATE without the subquery)', () => {
    const step0 = sqlApply.match(/^UPDATE ad_user SET em_etgo_is_owner = 'Y'.*?;/)[0];
    assert.match(step0, /ad_user_id = \(\s*SELECT u2\.ad_user_id/);
  });
});

describe('R26 data-fix — Step 8a: system Finance template health check (singleton)', () => {
  it('targets exactly the Finance template id, unconditionally of :client_id', () => {
    const step8a = sqlApply.match(/UPDATE ad_role\s+SET em_etgo_show_acct_fields = 'Y'.*?;/)?.[0];
    assert.ok(step8a, 'Step 8a UPDATE not found');
    assert.match(step8a, new RegExp(`ad_role_id = '${FINANCE_TEMPLATE_ID}'`));
    assert.doesNotMatch(step8a, /:client_id/);
  });

  it('is idempotent (guarded so a second run of ANY tenant leaves it a no-op)', () => {
    const step8a = sqlApply.match(/UPDATE ad_role\s+SET em_etgo_show_acct_fields = 'Y'.*?;/)[0];
    assert.match(step8a, /em_etgo_show_acct_fields <> 'Y'/);
  });
});

describe('R26 data-fix — Step 8b: derived-flag sync, kept in lockstep with the Java side', () => {
  // syncShowAccountingFieldsFlag (UserRoleCompositionService.java) computes:
  //   shouldShowAcctFields = templates.stream().anyMatch(t -> FINANCE_ROLE_ID.equals(t.getId()))
  // i.e. "the role's FULL desired template set contains Finance" -> derived from an ACTIVE
  // AD_Role_Inheritance row whose inherit_from is the Finance template. Step 8b must compute the
  // IDENTICAL fact from the DB side: an active AD_Role_Inheritance row -> Finance template id.
  const step8bMatch = sqlApply.match(/UPDATE ad_role r\s+SET em_etgo_show_acct_fields = CASE WHEN EXISTS.*?\);$/s);

  it('exists as the final statement of @apply', () => {
    assert.ok(step8bMatch, 'Step 8b UPDATE not found');
  });

  it('derives Y/N from an ACTIVE AD_Role_Inheritance row pointing at the Finance template', () => {
    const step8b = step8bMatch[0];
    // Both the SET's CASE and the WHERE's re-evaluation (idempotency guard) must use the
    // identical predicate: isactive='Y' AND inherit_from = Finance template id.
    const occurrences = (step8b.match(
      new RegExp(`ri2?\\.isactive = 'Y' AND ri2?\\.inherit_from = '${FINANCE_TEMPLATE_ID}'`, 'g'),
    ) || []).length;
    assert.equal(occurrences, 2, 'expected the predicate exactly twice: once in SET, once in WHERE');
  });

  it('scopes to :client_id, excludes templates and client-admin roles (never derives this for a template or an admin role)', () => {
    const step8b = step8bMatch[0];
    assert.match(step8b, /r\.ad_client_id = :client_id/);
    assert.match(step8b, /r\.isactive = 'Y'/);
    assert.match(step8b, /r\.istemplate <> 'Y'/);
    assert.match(step8b, /r\.is_client_admin <> 'Y'/);
  });

  it('is idempotent: the WHERE re-checks the SAME derivation the SET computes, so a converged row is skipped', () => {
    const step8b = step8bMatch[0];
    assert.match(step8b, /r\.em_etgo_show_acct_fields <> \(CASE WHEN EXISTS/);
  });

  it('reaches EVERY qualifying role at the tenant, not only ones Steps 1-7 touched (no join restricting to freshly-minted roles)', () => {
    const step8b = step8bMatch[0];
    // Deliberately does NOT reference the deterministic personal-role id derivation
    // (UPPER(MD5(...))) or the 'Personal – ' naming convention used by Steps 4-6's narrower scope.
    assert.doesNotMatch(step8b, /UPPER\(MD5\(/);
    assert.doesNotMatch(step8b, /'Personal/);
  });
});

describe('R26 data-fix — @report surfaces what cannot be mechanically resolved', () => {
  it('is read-only', () => {
    assert.match(sqlReport, /^SELECT /);
    assert.doesNotMatch(sqlReport, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  });

  it('reports a tenant with no owner candidate (no is_client_admin holder to resolve Step 0 against)', () => {
    assert.match(sqlReport, /'no_owner_candidate' AS issue/);
    assert.match(sqlReport, /NOT EXISTS \(SELECT 1 FROM ad_user u3 WHERE u3\.ad_client_id = :client_id AND u3\.em_etgo_is_owner = 'Y'\)/);
  });

  it('reports a personal-role name collision Step 1 skipped rather than crashed on', () => {
    assert.match(sqlReport, /'personal_role_name_collision' AS issue/);
  });
});

describe('R26 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  // Each numbered "-- Step N --" section (see the tenant-isolation describe block above for why
  // this splits on step headers rather than a naive ';' split) must carry a recognizable guard.
  const stepBody = (label) => {
    const re = new RegExp(`-- Step ${label} --[\\s\\S]*?(?=-- Step |-- @report|$)`);
    return rawText.match(re)[0];
  };

  it('every SQL-emitting step carries a NOT EXISTS, <>, or IS DISTINCT FROM guard', () => {
    // Step 7 is comment-only (see the tenant-isolation block above) — excluded, nothing to guard.
    for (const label of ['0', '1', '2', '2b', '3', '4', '5', '6', '8a', '8b']) {
      const body = stepBody(label);
      const guarded = /NOT EXISTS/i.test(body) || /<>/.test(body) || /IS DISTINCT FROM/i.test(body);
      assert.ok(guarded, `Step ${label} has no recognizable idempotency guard`);
    }
  });
});
