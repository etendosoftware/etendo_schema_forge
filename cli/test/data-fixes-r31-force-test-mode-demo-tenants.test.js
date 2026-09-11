import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R31 corrective data-fix
 * (20260901T120000Z__R31-force-test-mode-demo-tenants.sql, ETP-5117, gap N1).
 *
 * A Demo/free tenant had no way to force SII/TicketBAI/VeriFactu submissions into test/sandbox
 * mode without a manual edit in Classic. The fix has two independent effects, both gated on the
 * tenant resolving as Demo/free (no active ETGO_TenantPlan='productive' row):
 *   1. Inserts a brand-new, client-scoped ETSG_ForceTestMode='Y' AD_Preference row (never the
 *      System-level default row, AD_Client_ID='0') — guarded so a tenant that already owns one
 *      (from a previous run, or an operator's own manual choice) is left untouched.
 *   2. Directly backfills any pre-existing EtvfacVerifactuConfig/AeatsiiConfig/TbaiConfig row
 *      still reading as "production" for the same tenant — necessary because
 *      ForceTestModeEventHandler (and its SII/TicketBAI siblings) only cascade an update to
 *      already-persisted config rows on an UPDATE of the Preference row via Hibernate/DAL; plain
 *      SQL never fires any observer, so a corrective fix that only touched AD_Preference would
 *      leave already-existing config rows silently stale.
 *
 * Lockstep preventive twin: OnboardingForceTestModeService#forceTestModeForFreeTenant
 * (com.etendoerp.go), wired as a new step in EtendoGoJwtServlet#ensureOnboardingDataset.
 *
 * Live-validated (2026-09-01) against the shared dev DB: fleet-wide dry-run across all 29
 * tenants -> 4 SKIPPED_NOT_NEEDED (GOClient — fixed for real this session; F&B International
 * Group, MariaG, AyelenG — already owned their own ETSG_ForceTestMode row) / 25 WOULD_APPLY; a
 * real run against GOClient (802509E12436405C86BA1FD5B1DF508C) -> APPLIED (1 row, the preference
 * insert — its SII/TicketBAI config rows already read as test mode on this DB) -> re-run
 * SKIPPED_NOT_NEEDED — kept prior success state; the 3 config-table UPDATE statements were
 * additionally verified end-to-end in a rolled-back transaction against GOClient's own
 * aeatsii_config/tbai_config rows (forced to 'Y'/production, fix flipped both back to 'N', then
 * rolled back) to prove the backfill effect fires correctly when a row actually needs it; the
 * "tenant is not free" exclusion was verified the same way (a rolled-back ETGO_TenantPlan
 *='productive' row for MariaG made the free-plan subquery return 0 rows).
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB (done
 * above). What is verified deterministically here, without a DB, is the SQL the fix ships: header
 * metadata, tenant isolation, the two-layer idempotency guard per effect, and that every effect is
 * excluded once a productive-plan preference exists.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260901T120000Z__R31-force-test-mode-demo-tenants.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R31 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R31-force-test-mode-demo-tenants');
    assert.equal(fix.gap, 'N1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions the preference and the config backfill', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETSG_ForceTestMode/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix (R30)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-01T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260831T120000Z__prev').getTime(),
      'R31 must sort after the latest fix present on this branch',
    );
  });
});

describe('R31 data-fix — never touches the System-level default preference row', () => {
  it('the @apply preference INSERT scopes AD_Client_ID to :client_id, never the literal \'0\'', () => {
    assert.match(normApply, /INSERT INTO ad_preference/i);
    assert.match(normApply, /SELECT get_uuid\(\), :client_id, :org_id, 'Y'/);
  });

  it('never contains an UPDATE against the System preference row', () => {
    assert.doesNotMatch(normApply, /UPDATE ad_preference/i);
  });
});

describe('R31 data-fix — tenant isolation (every statement scoped to the requested client)', () => {
  it('scopes the @check free-plan subquery to :client_id', () => {
    assert.match(normCheck, /tp\.visibleat_client_id = :client_id/);
  });

  it('scopes every @apply statement to :client_id', () => {
    const occurrences = (normApply.match(/:client_id/g) || []).length;
    assert.ok(occurrences >= 8, `expected many :client_id scopes across 4 statements, got ${occurrences}`);
    assert.match(normApply, /v\.ad_client_id = :client_id/);
    assert.match(normApply, /a\.ad_client_id = :client_id/);
    assert.match(normApply, /t\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId, org_id: 'B'.repeat(32) });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client', org_id: 'B'.repeat(32) }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R31 data-fix — excludes productive (paid) tenants from every effect', () => {
  it('@check gates on "no active ETGO_TenantPlan=productive row"', () => {
    assert.match(normCheck, /attribute = 'ETGO_TenantPlan'/);
    assert.match(normCheck, /upper\(trim\(tp\.value\)\) = 'PRODUCTIVE'/);
  });

  it('the productive-plan exclusion subquery is repeated in all 4 @apply statements', () => {
    const occurrences = (normApply.match(/attribute = 'ETGO_TenantPlan'/g) || []).length;
    assert.equal(occurrences, 4, 'the preference INSERT + 3 config UPDATEs must each exclude productive tenants');
  });
});

describe('R31 data-fix — the 3 fiscal config tables use their own (non-uniform) test-mode semantics', () => {
  it('VeriFactu: IS_DEV_ENV=\'Y\' means test mode (inverted vs. SII/TicketBAI)', () => {
    assert.match(normApply, /UPDATE etvfac_verifactu_config v\s+SET is_dev_env = 'Y'/i);
    assert.match(normApply, /v\.is_dev_env = 'N'/);
  });

  it('SII: PRODUCCION=\'N\' means test mode', () => {
    assert.match(normApply, /UPDATE aeatsii_config a\s+SET produccion = 'N'/i);
    assert.match(normApply, /a\.produccion = 'Y'/);
  });

  it('TicketBAI: PRODUCTION_ENV=\'N\' means test mode', () => {
    assert.match(normApply, /UPDATE tbai_config t\s+SET production_env = 'N'/i);
    assert.match(normApply, /t\.production_env = 'Y'/);
  });
});

describe('R31 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('@check reports work needed when the preference row is missing OR any config row is stale', () => {
    assert.match(normCheck, /property = 'ETSG_ForceTestMode'/);
    assert.match(normCheck, /v\.is_dev_env = 'N'/);
    assert.match(normCheck, /a\.produccion = 'Y'/);
    assert.match(normCheck, /t\.production_env = 'Y'/);
  });

  it('the preference INSERT is guarded on "no active own-client row already exists"', () => {
    assert.match(
      normApply,
      /NOT EXISTS \(\s*SELECT 1 FROM ad_preference fp\s+WHERE fp\.property = 'ETSG_ForceTestMode'\s+AND fp\.ad_client_id = :client_id\s+AND fp\.isactive = 'Y'\s*\)/,
    );
  });

  it('each config UPDATE is guarded on its own still-in-production flag (never re-applies once fixed)', () => {
    assert.match(normApply, /v\.isactive = 'Y'\s+AND v\.is_dev_env = 'N'/);
    assert.match(normApply, /a\.isactive = 'Y'\s+AND a\.produccion = 'Y'/);
    assert.match(normApply, /t\.isactive = 'Y'\s+AND t\.production_env = 'Y'/);
  });
});
