import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R33 corrective data-fix
 * (20260902T120000Z__R33-force-test-mode-selected-backfill.sql, ETP-5117, gap N1 correction).
 *
 * R31's original preference INSERT never set AD_Preference.Selected, so every row it created
 * (character(1), NOT NULL DEFAULT 'N') landed at the schema default 'N' — inconsistent with the
 * shape of a row an operator creates by hand via the Classic Preference window (confirmed on the
 * shared dev DB: several hand-made ETSG_ForceTestMode rows carry Selected='Y'). None of the 3
 * consuming handlers (VeriFactu/SII/TicketBAI ForceTestModeEventHandler) filters on Selected in
 * their lookup, so this is a data-correctness/consistency-with-Classic fix, not a functional or
 * cascade one.
 *
 * Lockstep preventive twin: OnboardingForceTestModeService#forceTestModeForFreeTenant now calls
 * Preference#setSelected(true) on the row it builds — every tenant onboarded from this deploy
 * forward is born with Selected='Y' already, so R33 only ever has work to do for a tenant
 * onboarded before the fix landed (R31-era rows, or any manual insert that skipped the column).
 *
 * NOT a re-edit of R31: R31 already carries a real ledger row from live validation against the
 * shared dev DB (GOClient, 2026-09-01) and is treated as shipped/immutable per the framework's
 * own rule (see cli/src/data-fixes/sql/README.md "Applied fixes are immutable") — same precedent
 * already used for why R32 is a new file rather than an R31 edit.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260902T120000Z__R33-force-test-mode-selected-backfill.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R33 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R33-force-test-mode-selected-backfill');
    assert.equal(fix.gap, 'N1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions the Selected column', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Selected/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than R32', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-02T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260901T130000Z__prev').getTime(),
      'R33 must sort after R32',
    );
  });
});

describe('R33 data-fix — tenant isolation (every statement scoped to the requested client)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(normCheck, /fp\.ad_client_id = :client_id/);
  });

  it('scopes the @apply UPDATE to :client_id', () => {
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

describe('R33 data-fix — only ever touches the tenant\'s own ETSG_ForceTestMode row', () => {
  it('the @apply body is a plain UPDATE against ad_preference, never an INSERT/DELETE', () => {
    assert.match(normApply, /UPDATE ad_preference fp/i);
    assert.doesNotMatch(normApply, /INSERT INTO ad_preference/i);
    assert.doesNotMatch(normApply, /DELETE FROM ad_preference/i);
  });

  it('filters on property = ETSG_ForceTestMode and isactive = Y, matching the handlers\' own lookup', () => {
    assert.match(normCheck, /fp\.property = 'ETSG_ForceTestMode'/);
    assert.match(normCheck, /fp\.isactive = 'Y'/);
    assert.match(normApply, /fp\.property = 'ETSG_ForceTestMode'/);
    assert.match(normApply, /fp\.isactive = 'Y'/);
  });

  it('sets Selected to \'Y\' — never any other column\'s meaning', () => {
    assert.match(normApply, /SET selected = 'Y'/i);
  });
});

describe('R33 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('needs it: @check matches a row that still reads Selected = N', () => {
    assert.match(normCheck, /fp\.selected = 'N'/);
  });

  it('already Y: @check\'s guard means a row already at Selected = Y never matches (no work to do)', () => {
    // The @check body has exactly one predicate on the column, requiring 'N' — a row sitting at
    // 'Y' (hand-made in Classic, or created by the now-fixed onboarding service) fails this
    // predicate and the whole @check returns 0 rows, so @apply is never reached for it.
    const selectedPredicates = (normCheck.match(/fp\.selected = '[YN]'/g) || []);
    assert.deepEqual(selectedPredicates, ["fp.selected = 'N'"]);
  });

  it('re-run → skipped: @check and @apply share the identical WHERE guard, so a row @apply just fixed (Selected flipped to Y) no longer matches a fresh @check on the next pass', () => {
    const checkWhere = normCheck.match(/WHERE[\s\S]*/i)[0];
    const applyWhere = normApply.match(/WHERE[\s\S]*/i)[0];
    assert.equal(checkWhere, applyWhere);
  });
});
