import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';
import { formatReportDetail } from '../src/data-fixes/run.js';

/**
 * Static + parse validation for the R28 corrective data-fix
 * (20260827T120000Z__R28-owner-email-backfill.sql, ETP-5019, gap L2).
 *
 * Backfills AD_User.Email for tenant owners (EM_ETGO_Is_Owner='Y') whose Email is NULL,
 * mirroring GoAccountResolver#findAccountByUsername's two-step resolution (exact
 * username=email match first, then last-'+'-suffix-stripped fallback). Live-DB sweep
 * (2026-08-27, see the fix file's own header) confirmed 69/69 current owners resolve via the
 * exact branch alone, 0 ambiguous, 0 left NULL — what this file verifies deterministically
 * without a DB is the SQL's structural contract: header metadata, tenant isolation, that both
 * resolution branches are present and correctly guarded, the idempotency/non-owner/
 * already-set exclusion predicates, and the @report mechanism's wiring, mirroring the R19
 * precedent's "flag, don't guess" pattern.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260827T120000Z__R28-owner-email-backfill.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

describe('R28 data-fix — header metadata', () => {
  it('parses with the expected id and gap label (L2, sibling of L1 Tenant Ownership)', () => {
    assert.equal(fix.id, 'R28-owner-email-backfill');
    assert.equal(fix.gap, 'L2');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a non-empty description header referencing the onboarding gap', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /AD_User\.Email/);
    assert.match(fix.description, /EM_ETGO_Is_Owner/);
  });

  it('documents the preventive front and the two-step email resolution in the file background', () => {
    assert.match(rawText, /applyClientAdminEmail/);
    assert.match(rawText, /findAccountByUsername/);
    assert.match(rawText, /@report/);
  });

  it('has non-empty @check, @apply, and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0);
  });

  it('has a filename timestamp strictly after the last pre-existing fix in this checkout', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-27T12:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260824T120000Z__prev').getTime());
  });
});

describe('R28 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes @check to :client_id', () => {
    assert.match(normCheck, /u\.ad_client_id = :client_id/);
  });

  it('scopes @apply to :client_id (both the outer UPDATE and the resolution subquery)', () => {
    assert.match(normApply, /u\.ad_client_id = :client_id/);
    assert.match(normApply, /u2\.ad_client_id = :client_id/);
  });

  it('scopes @report to :client_id', () => {
    assert.match(normReport, /u\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal on all three sections and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    for (const body of [fix.check, fix.apply, fix.report]) {
      const inlined = inlineParams(body, { client_id: clientId });
      assert.ok(inlined.includes(`'${clientId}'`));
      assert.doesNotMatch(inlined, /:client_id\b/);
    }
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_user' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R28 data-fix — @check (owner with NULL email that resolves to an account)', () => {
  it('reports an owner row with NULL email as needing the fix', () => {
    assert.match(normCheck, /u\.em_etgo_is_owner = 'Y'/);
    assert.match(normCheck, /u\.email IS NULL/);
    assert.match(normCheck, /EXISTS \( SELECT 1 FROM etgo_account a/);
  });

  it('requires the matched account to be active', () => {
    assert.match(normCheck, /a\.isactive = 'Y'/);
  });

  it('checks both resolution branches (exact match, then last-\'+\'-suffix fallback)', () => {
    assert.match(normCheck, /lower\(a\.email\) = lower\(u\.username\)/);
    assert.match(normCheck, /position\('\+' IN u\.username\) > 0/);
    assert.match(normCheck, /reverse\(u\.username\)/);
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });
});

describe('R28 data-fix — @apply (two-step email resolution)', () => {
  it('runs exactly one UPDATE on ad_user', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+ad_user\b/gi) || []).length;
    assert.equal(updates, 1);
  });

  it('resolves via an exact username=email match first', () => {
    assert.match(
      normApply,
      /LEFT JOIN etgo_account a_exact ON a_exact\.isactive = 'Y' AND lower\(a_exact\.email\) = lower\(u2\.username\)/,
    );
  });

  it('falls back to the last-\'+\'-suffix-stripped match only when the exact branch missed', () => {
    assert.match(normApply, /a_exact\.etgo_account_id IS NULL/);
    assert.match(normApply, /position\('\+' IN u2\.username\) > 0/);
    assert.match(normApply, /a_suffix\.isactive = 'Y'/);
    assert.match(normApply, /lower\(a_suffix\.email\) = lower\(substring\(/);
    assert.match(normApply, /reverse\(u2\.username\)/);
  });

  it('combines both branches with COALESCE so the exact match always wins when present', () => {
    assert.match(normApply, /COALESCE\(a_exact\.email, a_suffix\.email\) AS resolved_email/);
  });

  it('only ever writes a non-null resolved email', () => {
    assert.match(normApply, /resolved\.resolved_email IS NOT NULL/);
  });

  it('never touches a row that is not flagged as owner (em_etgo_is_owner scopes both the outer UPDATE and the resolution subquery)', () => {
    const ownerGuards = (normApply.match(/em_etgo_is_owner = 'Y'/g) || []).length;
    assert.ok(ownerGuards >= 2, 'expected the owner guard on both u2 (subquery) and u (outer UPDATE)');
  });

  it('is guarded by "email IS NULL" so an owner whose email is already set is never overwritten (idempotent too)', () => {
    const emailNullGuards = (normApply.match(/email IS NULL/g) || []).length;
    assert.ok(emailNullGuards >= 2, 'expected the "email IS NULL" guard on both u2 (subquery) and u (outer UPDATE)');
  });
});

describe('R28 data-fix — idempotency (converges to zero after a successful apply)', () => {
  it('@check and @apply share the exact same "still needs it" gate, so a re-run after success matches 0 rows', () => {
    // Both sections gate on the same owner-flag + NULL-email predicate. Once @apply sets the
    // email, a re-run of @check's own predicate structurally cannot match that row again.
    assert.match(normCheck, /u\.em_etgo_is_owner = 'Y'/);
    assert.match(normCheck, /u\.email IS NULL/);
    assert.match(normApply, /u\.em_etgo_is_owner = 'Y'/);
    assert.match(normApply, /u\.email IS NULL/);
  });
});

describe('R28 data-fix — @report (surfacing owners that remain unresolved)', () => {
  it('is a read-only SELECT (no INSERT/UPDATE/DELETE)', () => {
    assert.doesNotMatch(normReport, /\b(INSERT|UPDATE|DELETE)\b/i);
    assert.match(normReport, /\bSELECT\b/i);
  });

  it('only reports owners still Email IS NULL after @apply (the ones neither branch could resolve)', () => {
    assert.match(normReport, /u\.em_etgo_is_owner = 'Y'/);
    assert.match(normReport, /u\.email IS NULL/);
  });

  it('identifies the unresolved owner by id and username for manual investigation', () => {
    assert.match(normReport, /u\.ad_user_id/);
    assert.match(normReport, /u\.username AS unresolved_owner_username/);
  });
});

describe('R28 data-fix — formatReportDetail integration (runner side of the @report contract, synthetic fixture)', () => {
  it('formats a realistic @report row set the way an operator would read it', () => {
    const rows = [
      { ad_user_id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', unresolved_owner_username: 'ghost.owner+oldclient' },
    ];
    const detail = formatReportDetail(rows);
    assert.match(detail, /^1 row\(s\) need manual attention:/);
    assert.match(detail, /unresolved_owner_username=ghost\.owner\+oldclient/);
  });

  it('returns null when every owner on the tenant was resolvable (nothing to report — matches the live-DB sweep, 0\/69)', () => {
    assert.equal(formatReportDetail([]), null);
  });
});
