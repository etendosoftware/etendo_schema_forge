import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R32 corrective data-fix
 * (20260901T130000Z__R32-revert-test-mode-productive-tenants.sql, ETP-5117, gap N1 follow-up).
 *
 * Companion to R31, in the OPPOSITE direction: for a tenant that resolves as PLAN_PRODUCTIVE but
 * still carries its own stale client-scoped ETSG_ForceTestMode row (converted before the
 * preventive OnboardingForceTestModeService#revertTestModeForProductiveTenant existed, or via any
 * path that bypassed it), this fix reverts any already-existing VerifactuConfig/AeatsiiConfig/
 * TbaiConfig row back to production AND deletes the stale preference row entirely (never leaves
 * it sitting at any value) so resolution falls back to the System default.
 *
 * Unlike its Java preventive twin — which must do a two-step DAL write (flip VALUE to 'N' and
 * save FIRST so the real Hibernate/DAL cascade fires and reverts existing config rows, THEN
 * remove the row) because none of the three fiscal event handlers reacts to DELETE and none
 * checks IsActive in their cascade — this SQL fix needs no such dance: raw SQL never fires any
 * observer regardless (see R31's own header), so it directly performs both effects itself.
 *
 * Live-validated (2026-09-01) in a rolled-back transaction: simulated MariaG (a tenant with a
 * real pre-existing ETSG_ForceTestMode='Y' row and an active VerifactuConfig row with
 * is_dev_env='Y') marked PLAN_PRODUCTIVE -> @check matched (1 row) -> @apply flipped
 * is_dev_env to 'N' and deleted the preference row (0 remaining) -> rolled back, no persisted
 * change. Fleet-wide dry-run across all 29 tenants on the shared dev DB -> 29/29
 * SKIPPED_NOT_NEEDED (no tenant currently resolves as PLAN_PRODUCTIVE on this DB), confirming no
 * false positives.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260901T130000Z__R32-revert-test-mode-productive-tenants.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R32 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R32-revert-test-mode-productive-tenants');
    assert.equal(fix.gap, 'N1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than R31', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-01T13:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260901T120000Z__prev').getTime(),
      'R32 must sort after R31',
    );
  });
});

describe('R32 data-fix — only applies to PLAN_PRODUCTIVE tenants (the opposite gate from R31)', () => {
  it('@check requires an active ETGO_TenantPlan=productive row', () => {
    assert.match(normCheck, /EXISTS \(\s*SELECT 1 FROM ad_preference tp\s+WHERE tp\.attribute = 'ETGO_TenantPlan'/);
    assert.match(normCheck, /upper\(trim\(tp\.value\)\) = 'PRODUCTIVE'/);
  });

  it('the productive-plan requirement is repeated in all 4 @apply statements', () => {
    const occurrences = (normApply.match(/attribute = 'ETGO_TenantPlan'/g) || []).length;
    assert.equal(occurrences, 4, 'the 3 config UPDATEs + the DELETE must each require PLAN_PRODUCTIVE');
  });
});

describe('R32 data-fix — deletes the stale row entirely, never flips it to \'N\' and leaves it', () => {
  it('the @apply body contains a DELETE against ad_preference, never an UPDATE of it', () => {
    assert.match(normApply, /DELETE FROM ad_preference fp/i);
    assert.doesNotMatch(normApply, /UPDATE ad_preference/i);
  });

  it('the DELETE targets only the requesting client\'s own ETSG_ForceTestMode row', () => {
    assert.match(
      normApply,
      /DELETE FROM ad_preference fp\s+WHERE fp\.property = 'ETSG_ForceTestMode'\s+AND fp\.ad_client_id = :client_id/,
    );
  });
});

describe('R32 data-fix — tenant isolation (every statement scoped to the requested client)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(normCheck, /tp\.visibleat_client_id = :client_id/);
  });

  it('scopes every @apply statement to :client_id', () => {
    assert.match(normApply, /v\.ad_client_id = :client_id/);
    assert.match(normApply, /a\.ad_client_id = :client_id/);
    assert.match(normApply, /t\.ad_client_id = :client_id/);
    assert.match(normApply, /fp\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R32 data-fix — reverts each fiscal config table back to its own production value', () => {
  it('VeriFactu: IS_DEV_ENV set back to \'N\' (production)', () => {
    assert.match(normApply, /UPDATE etvfac_verifactu_config v\s+SET is_dev_env = 'N'/i);
    assert.match(normApply, /v\.is_dev_env = 'Y'/);
  });

  it('SII: PRODUCCION set back to \'Y\' (production)', () => {
    assert.match(normApply, /UPDATE aeatsii_config a\s+SET produccion = 'Y'/i);
    assert.match(normApply, /a\.produccion = 'N'/);
  });

  it('TicketBAI: PRODUCTION_ENV set back to \'Y\' (production)', () => {
    assert.match(normApply, /UPDATE tbai_config t\s+SET production_env = 'Y'/i);
    assert.match(normApply, /t\.production_env = 'N'/);
  });
});

describe('R32 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('@check reports work needed when the preference row exists OR any config row is still test mode', () => {
    assert.match(normCheck, /property = 'ETSG_ForceTestMode'/);
    assert.match(normCheck, /v\.is_dev_env = 'Y'/);
    assert.match(normCheck, /a\.produccion = 'N'/);
    assert.match(normCheck, /t\.production_env = 'N'/);
  });

  it('each config UPDATE is guarded on its own still-in-test-mode flag (never re-applies once fixed)', () => {
    assert.match(normApply, /v\.isactive = 'Y'\s+AND v\.is_dev_env = 'Y'/);
    assert.match(normApply, /a\.isactive = 'Y'\s+AND a\.produccion = 'N'/);
    assert.match(normApply, /t\.isactive = 'Y'\s+AND t\.production_env = 'N'/);
  });
});
