import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R27 corrective data-fix
 * (20260826T121500Z__R27-deactivate-r16-duplicate-roles.sql, gap H2, ETP-4877).
 *
 * QA gap this closes: R27 shipped with only the generic catalog-level `@report` presence check
 * (cli/test/data-fixes-report-regression.test.js) — no dedicated per-fix test file, unlike every
 * other R** fix in the catalog (R14, R17-R25 each have one). The most important behavioral claim
 * — "a per-client legacy Finance/Sales/Purchasing/Inventory clone still in real use is reported,
 * NEVER auto-deactivated" — was verified live (rolled-back transaction against a real tenant,
 * `E2E User 52f1a5e7` / B51856879617445A97E13BCB7C41D132) as part of QA's ETP-4877 pass: a
 * synthetic active AD_User_Roles row on 'Sales' left it isactive='Y' after @apply while the other
 * 3 unused clones were deactivated, and @report surfaced exactly the 'Sales' row with
 * active_user_roles=1. This suite pins the STATIC contract (predicate symmetry, idempotency,
 * tenant isolation) that makes that live result reproducible on every future run, not just the
 * one behavior traced by hand.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260826T121500Z__R27-deactivate-r16-duplicate-roles.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
/** The fix immediately preceding R27 in the catalog (lexical sort == chronological order). */
const PREVIOUS_FIX_ID = '20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sqlOnly = (s) =>
  norm(s.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n'));

const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report);

const CLONE_NAMES = ['Finance', 'Sales', 'Purchasing', 'Inventory'];

describe('R27 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R27-deactivate-r16-duplicate-roles');
    assert.equal(fix.gap, 'H2');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, '@report is what surfaces a still-in-use clone');
  });

  it('has a filename whose timestamp is newer than R26 (its sibling in the same PR)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-26T12:15:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime(),
      `R27 must sort after ${PREVIOUS_FIX_ID}`,
    );
  });
});

describe('R27 data-fix — tenant isolation', () => {
  it('scopes @check to :client_id', () => {
    assert.match(sqlCheck, /r\.ad_client_id = :client_id/);
  });

  it('scopes @apply to :client_id', () => {
    assert.match(sqlApply, /r\.ad_client_id = :client_id/);
  });

  it('scopes @report to :client_id', () => {
    assert.match(sqlReport, /r\.ad_client_id = :client_id/);
  });

  it('never scopes any section to :org_id (roles are client-level master data)', () => {
    for (const [name, body] of [['@check', fix.check], ['@apply', fix.apply], ['@report', fix.report]]) {
      assert.ok(!body.includes(':org_id'), `${name} must not mention :org_id, even in a comment`);
    }
  });

  it('binds nothing but :client_id across the three sections', () => {
    const binds = new Set(
      `${fix.check}\n${fix.apply}\n${fix.report}`.match(/:[A-Za-z_][A-Za-z0-9_]*/g) || [],
    );
    assert.deepEqual([...binds], [':client_id']);
  });

  it('inlines :client_id safely and refuses an injection-y value', () => {
    const clientId = 'B'.repeat(32);
    for (const body of [fix.check, fix.apply, fix.report]) {
      const inlined = inlineParams(body, { client_id: clientId });
      assert.ok(inlined.includes(`'${clientId}'`));
      assert.doesNotMatch(inlined, /:client_id\b/);
    }
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1'; DROP TABLE ad_role; --" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R27 data-fix — keys only on the exact seeded clone names', () => {
  it('never uses LIKE/ILIKE/regex matching (would over-match a differently-named role)', () => {
    assert.doesNotMatch(sqlCheck, /\b(I?LIKE|SIMILAR TO|~)\b/i);
    assert.doesNotMatch(sqlApply, /\b(I?LIKE|SIMILAR TO|~)\b/i);
    assert.doesNotMatch(sqlReport, /\b(I?LIKE|SIMILAR TO|~)\b/i);
  });

  it('keys @check/@apply/@report on exactly the 4 R16-era clone names, nothing else', () => {
    const nameSet = (sql) => {
      const m = sql.match(/r\.name IN \(([^)]*)\)/);
      assert.ok(m, `no "r.name IN (...)" predicate found in: ${sql.slice(0, 80)}`);
      return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    };
    assert.deepEqual(nameSet(sqlCheck).sort(), [...CLONE_NAMES].sort());
    assert.deepEqual(nameSet(sqlApply).sort(), [...CLONE_NAMES].sort());
    assert.deepEqual(nameSet(sqlReport).sort(), [...CLONE_NAMES].sort());
  });
});

describe('R27 data-fix — @check/@apply/@report predicate symmetry (the core behavioral claim)', () => {
  // @check/@apply both require ZERO usage (safe to deactivate); @report requires the exact
  // logical NEGATION (still in use) — the three NOT EXISTS clauses on @check/@apply must appear,
  // unnegated, as the three EXISTS clauses inside @report's OR. This is what guarantees "reported"
  // and "deactivated" are mutually exclusive outcomes for the same role — never both, never neither.
  const USAGE_PREDICATES = [
    /ad_user_roles ur WHERE ur\.ad_role_id = r\.ad_role_id AND ur\.isactive = 'Y'/,
    /ad_user u WHERE u\.default_ad_role_id = r\.ad_role_id/,
    /ad_role_inheritance ri WHERE ri\.inherit_from = r\.ad_role_id/,
  ];

  it('@check requires all 3 NOT EXISTS zero-usage guards', () => {
    for (const re of USAGE_PREDICATES) {
      assert.match(sqlCheck, new RegExp(`NOT EXISTS \\(SELECT 1 FROM ${re.source}\\)`), `@check missing guard: ${re.source}`);
    }
  });

  it('@apply carries the IDENTICAL 3 NOT EXISTS guards as @check (same WHERE, not a looser one)', () => {
    // Extract the predicate body following "SET isactive = 'N'" up to the closing semicolon and
    // compare it against @check's own predicate body (minus the leading SELECT/FROM clause and
    // the LIMIT), so a future edit that loosens @apply relative to @check fails loudly.
    const applyWhere = sqlApply.match(/SET isactive = 'N', updated = now\(\), updatedby = '0' WHERE (.*);$/)[1];
    const checkWhere = sqlCheck.match(/^SELECT 1 FROM ad_role r WHERE (.*) LIMIT 1;$/)[1];
    assert.equal(applyWhere, checkWhere, '@apply and @check must share the identical WHERE clause');
  });

  it('@report requires the LOGICAL NEGATION: at least one usage EXISTS, on the same 3 dimensions', () => {
    for (const re of USAGE_PREDICATES) {
      assert.match(sqlReport, new RegExp(`EXISTS \\(SELECT 1 FROM ${re.source}\\)`), `@report missing EXISTS guard: ${re.source}`);
    }
    // The three are OR'd (any one usage signal is enough to exempt the role from deactivation).
    assert.match(sqlReport, /\(\s*EXISTS[\s\S]*OR\s*EXISTS[\s\S]*OR\s*EXISTS[\s\S]*\)/);
  });

  it('@report never touches data — read-only SELECT, no DML keywords', () => {
    assert.match(sqlReport, /^SELECT /);
    assert.doesNotMatch(sqlReport, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  });

  it('@report surfaces the usage counts a human needs to decide (not just a flag)', () => {
    assert.match(sqlReport, /AS active_user_roles/);
    assert.match(sqlReport, /AS default_role_pointers/);
    assert.match(sqlReport, /AS inheritance_dependents/);
  });
});

describe('R27 data-fix — two-layer idempotency', () => {
  it('@apply carries the same guard @check uses to gate the whole fix (re-run converges to 0 rows)', () => {
    // Once @apply deactivates a role (isactive='N'), the shared WHERE's `r.isactive = 'Y'`
    // predicate excludes it on any future run — no separate "already handled" flag needed.
    assert.match(sqlApply, /r\.isactive = 'Y'/);
    assert.match(sqlCheck, /r\.isactive = 'Y'/);
  });

  it('@check is a boolean gate (LIMIT 1), not a work list', () => {
    assert.match(sqlCheck, /LIMIT 1;$/);
    assert.match(sqlCheck, /^SELECT 1 FROM ad_role r/);
  });

  it('@apply is a single UPDATE statement (no DELETE — deactivation only, reversible by design)', () => {
    const statements = sqlApply.split(';').map((s) => s.trim()).filter(Boolean);
    assert.equal(statements.length, 1);
    assert.match(statements[0], /^UPDATE ad_role r/);
    assert.doesNotMatch(sqlApply, /\bDELETE\b/i);
  });
});
