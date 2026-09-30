import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R41 corrective data-fix
 * (20260928T140000Z__R41-personal-role-owner-backfill.sql, ETP-5502).
 *
 * The behavior — rules 1-3 attribute an owner, an ambiguous dormant role and a deleted user's
 * orphan stay NULL, a re-run's @check matches nothing — was verified live against the local dev
 * DB in a rolled-back transaction (five seeded roles on the F&B test client), and through the
 * runner with `--dry-run`. This suite pins the static contract that makes that result hold on
 * every future edit: tenant isolation, the owner-IS-NULL idempotency guard on every write, and
 * the name rule mirroring PersonalRoleAccessProvisioningService in com.etendoerp.go.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20260928T140000Z__R41-personal-role-owner-backfill.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(join(SQL_DIR, FIX_FILE), 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sqlOnly = (s) =>
  norm(s.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n'));

const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report);
const applyStatements = sqlApply.split(';').map((s) => s.trim()).filter(Boolean);

/** The personal-role prefix PersonalRoleAccessProvisioningService builds (en dash, not hyphen). */
const PERSONAL_PREFIX = "'Personal – '";

describe('R41 data-fix — header metadata', () => {
  it('parses with the expected id, type and risk', () => {
    assert.equal(fix.id, 'R41-personal-role-owner-backfill');
    assert.equal(fix.gap, 'ETP-5502');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, '@report lists the roles left without an owner');
  });

  it('sorts after every other fix in the catalog', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.equal(ts.toISOString(), '2026-09-28T14:00:00.000Z');
    const others = readdirSync(SQL_DIR)
      .filter((f) => f.endsWith('.sql') && f !== FIX_FILE)
      .map((f) => basename(f, '.sql'));
    for (const other of others) {
      assert.ok(other < FIX_ID, `${FIX_ID} must sort after ${other}`);
    }
  });
});

describe('R41 data-fix — tenant isolation', () => {
  it('scopes @check, every @apply statement and @report to :client_id', () => {
    assert.match(sqlCheck, /r\.ad_client_id = :client_id/);
    assert.equal(applyStatements.length, 3, 'one UPDATE per attribution rule');
    for (const stmt of applyStatements) {
      assert.match(stmt, /r\.ad_client_id = :client_id/, stmt.slice(0, 80));
    }
    assert.match(sqlReport, /r\.ad_client_id = :client_id/);
  });

  it('scopes every AD_User read to :client_id (an owner is always a user of the same tenant)', () => {
    for (const [name, sql] of [['@check', sqlCheck], ['@apply', sqlApply]]) {
      const userReads = sql.match(/FROM ad_user (du|u)\b[^;]*?WHERE [^;]*?\1\.ad_client_id = :client_id/g) || [];
      const allUserReads = sql.match(/FROM ad_user (du|u)\b/g) || [];
      assert.equal(userReads.length, allUserReads.length, `${name}: an ad_user read is unscoped`);
    }
  });

  it('binds nothing but :client_id and inlines it safely', () => {
    const binds = new Set(
      `${fix.check}\n${fix.apply}\n${fix.report}`.match(/:[A-Za-z_][A-Za-z0-9_]*/g) || [],
    );
    assert.deepEqual([...binds], [':client_id']);
    const clientId = 'B'.repeat(32);
    for (const body of [fix.check, fix.apply, fix.report]) {
      const inlined = inlineParams(body, { client_id: clientId });
      assert.ok(inlined.includes(`'${clientId}'`));
      assert.doesNotMatch(inlined, /:client_id\b/);
    }
  });
});

describe('R41 data-fix — idempotency and write surface', () => {
  it('only ever writes AD_Role.em_etgo_personal_owner_id (plus the audit columns)', () => {
    for (const stmt of applyStatements) {
      assert.match(stmt, /UPDATE ad_role r SET em_etgo_personal_owner_id = /, stmt.slice(0, 80));
      assert.doesNotMatch(stmt, /\b(INSERT|DELETE)\b/i);
      assert.doesNotMatch(stmt, /\bisactive\s*=/i, 'must not activate/deactivate roles');
    }
  });

  it('guards every write with em_etgo_personal_owner_id IS NULL (never overwrites an owner)', () => {
    for (const stmt of applyStatements) {
      assert.match(stmt, /r\.em_etgo_personal_owner_id IS NULL/, stmt.slice(0, 80));
    }
  });

  it('@check and @report only look at roles whose owner is still NULL', () => {
    assert.match(sqlCheck, /r\.em_etgo_personal_owner_id IS NULL/);
    assert.match(sqlReport, /r\.em_etgo_personal_owner_id IS NULL/);
  });

  it('restricts every section to personal composition roles (not templates, not client-admin)', () => {
    for (const [name, sql] of [['@check', sqlCheck], ['@report', sqlReport], ...applyStatements.map((s, i) => [`@apply#${i + 1}`, s])]) {
      assert.ok(sql.includes(`r.name LIKE 'Personal – %'`), `${name}: missing the en-dash prefix`);
      assert.match(sql, /r\.istemplate = 'N'/, name);
      assert.match(sql, /r\.is_client_admin = 'N'/, name);
    }
  });
});

describe('R41 data-fix — attribution rules', () => {
  it('rule 1 requires exactly one AD_User_Roles row', () => {
    assert.match(applyStatements[0],
      /\(SELECT COUNT\(\*\) FROM ad_user_roles ur WHERE ur\.ad_role_id = r\.ad_role_id\) = 1/);
  });

  it('rule 2 requires zero rows and exactly one default-role user', () => {
    assert.match(applyStatements[1], /NOT EXISTS \(SELECT 1 FROM ad_user_roles ur WHERE ur\.ad_role_id = r\.ad_role_id\)/);
    assert.match(applyStatements[1], /du\.default_ad_role_id = r\.ad_role_id\) = 1/);
  });

  it('rule 3 requires a current Admin not younger than the role, and a unique candidate', () => {
    const rule3 = applyStatements[2];
    assert.match(rule3, /ar\.is_client_admin = 'Y'/);
    assert.match(rule3, /a\.created <= pr\.created/, 'an older role belonged to someone else');
    assert.match(rule3, /HAVING COUNT\(\*\) = 1/, 'ambiguous matches must stay NULL');
  });

  it('@check lists exactly the three rules the @apply writes', () => {
    assert.equal((sqlCheck.match(/UNION ALL/g) || []).length, 2);
    assert.match(sqlCheck, /WHERE pr\.n_rows = 1/);
    assert.match(sqlCheck, /WHERE pr\.n_rows = 0 AND pr\.n_default = 1/);
    assert.match(sqlCheck, /HAVING COUNT\(\*\) = 1/);
  });
});

describe('R41 data-fix — name rule mirrors PersonalRoleAccessProvisioningService', () => {
  it('builds the base like personalRoleNameSource: trimmed name, else username, else id', () => {
    const base = /COALESCE\(NULLIF\(TRIM\(u\.name\), ''\), NULLIF\(TRIM\(u\.username\), ''\), u\.ad_user_id\)/;
    assert.match(sqlCheck, base);
    assert.match(applyStatements[2], base);
    assert.ok(sqlCheck.includes(`${PERSONAL_PREFIX} || COALESCE(`));
  });

  it('keeps the suffix when truncating: LEFT(full, 60 - LENGTH(suffix)) || suffix', () => {
    for (const sql of [sqlCheck, applyStatements[2]]) {
      assert.match(sql, /pr\.name = LEFT\(a\.full_name, 60\)/, 'n = 1 form');
      assert.match(sql, /LEFT\(a\.full_name, 60 - LENGTH\(' \(' \|\| SUBSTRING/, 'n >= 2 form');
      assert.match(sql, /<> '1'/, 'a "(1)" suffix is never built');
    }
  });
});
