import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R44 corrective data-fix
 * (20261001T120000Z__R44-demo-periods-open-through-oct-2026.sql, ETP-5575, gap C4).
 *
 * Existing DEMO tenants have their fiscal periods open only through the month they were built,
 * which is too short for a trial (a late-September demo cannot post in October). The fix opens
 * every never-opened ('N') C_PeriodControl row of an effective DEMO tenant for periods starting
 * before 2026-11-01, every duplicate copy included, and resyncs C_Period.OpenClose. Rows a user
 * closed ('C'/'P') are never reopened, productive tenants and tenants without
 * ETGO_EnvironmentType are never touched.
 *
 * Lockstep preventive twin: OnboardingPeriodControlService#openDemoTrialWindow (com.etendoerp.go),
 * run by EtendoGoJwtServlet after the onboarding commit for every demo signup.
 *
 * The runner executes the parsed SQL against a live Postgres tenant, so row-level behaviour is
 * verified end-to-end against a DB (see the ETP-5575 ledger). What is verified here, without a DB,
 * is the SQL the fix ships: header metadata, ordering, tenant isolation, the DEMO gate in both
 * stored shapes, the productive exclusion, the never-opened-only target and the window literal.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261001T120000Z__R44-demo-periods-open-through-oct-2026.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(join(SQL_DIR, FIX_FILE), 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);

describe('R44 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R44-demo-periods-open-through-oct-2026');
    assert.equal(fix.gap, 'C4');
  });

  it('is a low-risk sql fix with a description', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.match(fix.description, /DEMO/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0);
  });

  it('sorts after every other fix on this branch', () => {
    const ts = parseFixTimestamp(FIX_ID).getTime();
    const others = readdirSync(SQL_DIR)
      .filter((f) => f.endsWith('.sql') && f !== FIX_FILE)
      .map((f) => parseFixTimestamp(basename(f, '.sql')))
      .filter(Boolean);
    assert.ok(others.length > 0);
    for (const other of others) {
      assert.ok(ts > other.getTime(), `R44 must sort after ${other.toISOString()}`);
    }
  });
});

describe('R44 data-fix — tenant isolation', () => {
  it('scopes @check and both @apply statements to :client_id', () => {
    assert.match(normCheck, /pc\.ad_client_id = :client_id/);
    assert.equal(applyStatements.length, 2);
    for (const statement of applyStatements) {
      assert.match(statement, /\.ad_client_id = :client_id/);
    }
  });

  it('inlines :client_id into a quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('contains no hardcoded 32-char ids', () => {
    assert.doesNotMatch(fix.check + fix.apply + fix.report, /'[0-9A-F]{32}'/);
  });
});

describe('R44 data-fix — only effective DEMO tenants', () => {
  const gated = { '@check': normCheck, '@apply step 1': applyStatements[0] };

  for (const [section, sql] of Object.entries(gated)) {
    it(`${section} requires ETGO_EnvironmentType=DEMO in both stored shapes`, () => {
      assert.match(sql, /ep\.attribute = 'ETGO_EnvironmentType'/);
      assert.match(sql, /upper\(trim\(ep\.value\)\) = 'DEMO'/);
      assert.match(sql, /ep\.ad_client_id = :client_id/);
      assert.match(sql, /ep\.ad_client_id = '0' AND ep\.visibleat_client_id = :client_id/);
    });

    it(`${section} excludes tenants with an active productive plan`, () => {
      assert.match(sql, /NOT EXISTS \( SELECT 1 FROM ad_preference tp WHERE tp\.attribute = 'ETGO_TenantPlan'/);
      assert.match(sql, /upper\(trim\(tp\.value\)\) = 'PRODUCTIVE'/);
    });
  }
});

describe('R44 data-fix — opens only never-opened rows, through October 2026', () => {
  it('@apply step 1 targets PeriodStatus N only and sets the open state', () => {
    assert.match(applyStatements[0], /^UPDATE c_periodcontrol pc SET periodstatus = 'O', openclose = 'C', periodaction = 'N'/);
    assert.match(applyStatements[0], /pc\.periodstatus = 'N'/);
    assert.doesNotMatch(applyStatements[0], /periodstatus IN/i);
  });

  it('uses the 2026-11-01 window literal in every section', () => {
    for (const sql of [normCheck, ...applyStatements, normReport]) {
      assert.match(sql, /DATE '2026-11-01'/);
    }
  });

  it('keeps the future permanently closed year guard in @check and @apply step 1', () => {
    for (const sql of [normCheck, applyStatements[0]]) {
      assert.match(sql, /fpc\.periodstatus = 'P'/);
      assert.match(sql, /fy\.year > y\.year/);
      assert.match(sql, /AD_ISORGINCLUDED\(fpc\.ad_org_id, pc\.ad_org_id, fpc\.ad_client_id\) <> -1/);
    }
  });

  it('@apply step 2 resyncs C_Period.OpenClose only where it changed', () => {
    assert.match(applyStatements[1], /^UPDATE c_period p SET openclose = agg\.new_openclose/);
    assert.match(applyStatements[1], /p\.openclose IS DISTINCT FROM agg\.new_openclose/);
  });

  it('@report lists the rows left untouched with a reason', () => {
    assert.match(normReport, /closed_by_user_left_untouched/);
    assert.match(normReport, /permanently_closed_left_untouched/);
    assert.match(normReport, /no_october_2026_period_in_calendar/);
  });
});

describe('R44 data-fix — documents why the cutoff is not bumped', () => {
  it('states that ONBOARDING_PROVISIONED_THROUGH is deliberately not bumped', () => {
    assert.match(rawText, /ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped/);
  });
});
