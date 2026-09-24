import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';
import { formatReportDetail } from '../src/data-fixes/run.js';

/**
 * Static + parse validation for the R37 corrective data-fix
 * (20260924T150000Z__R37-tenant-subscription-backfill.sql, ETP-5046, gap B2).
 *
 * Gives every already-onboarded tenant that carries the legacy AD_Preference plan marker
 * (ETGO_TenantPlan='productive') exactly ONE open ETGO_SUBSCRIPTION row on the grandfathered
 * 'legacy-productive' plan, copying the Stripe ids from that tenant's own checkout request when
 * one exists. What this file verifies deterministically, without a DB, is the SQL's structural
 * contract: header metadata, the fact that every statement really is tenant-scoped (through one
 * of the four columns that carry the tenant across these tables — see the fix's own header for
 * why three of them are NOT `ad_client_id`), the two-layer idempotency guard that the partial
 * unique index `etgo_sub_open_envclient_uq` depends on, the missing-plan abort guard (an ERROR
 * retries the tenant; a silent zero-row APPLIED would lose a paying customer forever), and the
 * @report contract — including that the manual pre-check was actually filled in rather than
 * shipped with its placeholder marker.
 *
 * <p>Since the per-tenant retirement landed, @apply is THREE statements: the abort guard, the
 * INSERT, and a DELETE that retires that tenant's ETGO_TenantPlan preference in the same
 * transaction. The cutover is therefore a per-tenant state transition with an observable end
 * condition (`select count(*) from ad_preference where attribute='ETGO_TenantPlan'` reaching 0)
 * rather than a fleet-wide flag day, and the specs below pin the three things that make it safe:
 * the DELETE is scoped by `visibleat_client_id` and NEVER by `ad_client_id`, it is guarded on an
 * open subscription EXISTING (self-healing, not "we just inserted"), and @report records the
 * retirement — the only audit trail left once the row is gone.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260924T150000Z__R37-tenant-subscription-backfill.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

/** The newest fix that already existed in this checkout when R37 was authored. */
// The newest fix already in develop when ETP-5046 merged. The strict watermark in run.js skips a
// fix dated at or before it on every tenant that has processed it, so this one must stay later.
const PREVIOUS_FIX_ID = '20260922T130000Z__R39-document-sequence-clear-descriptions';

/**
 * The marker an author leaves in @report while the manual pre-check is still outstanding.
 * Shipping it is a build failure — see the fix header's "@report placeholder convention".
 */
const PRECHECK_PLACEHOLDER = 'TODO-PRECHECK-R37';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

/**
 * Split a section body into its individual SQL statements, quote-aware.
 *
 * A naive `split(';')` would be wrong here on both counts: this fix carries a `;` INSIDE a string
 * literal (the pre-check sentence in @report) and `--` sequences inside string literals are not
 * comments. So the scanner tracks single-quoted strings (including the doubled-quote escape) and
 * strips only real line comments.
 *
 * @param {string} sql
 * @returns {string[]} non-empty statements, comments removed
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { current += sql[++i]; } else { inString = false; }
      }
      continue;
    }
    if (ch === "'") { inString = true; current += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      current += '\n';
      continue;
    }
    if (ch === ';') { statements.push(current); current = ''; continue; }
    current += ch;
  }
  statements.push(current);
  return statements.map(norm).filter(s => s.length > 0);
}

/** The four columns that carry the tenant across the tables this fix touches. */
const SCOPE_PREDICATES = [
  /\bad_client_id = :client_id\b/,          // ad_client (driving table of every statement)
  /\bvisibleat_client_id = :client_id\b/,   // ad_preference — the plan marker's visibility scope
  /\bcreated_client_id = :client_id\b/,     // etgo_checkout_request — System-owned at client '0'
  /\benvironment_client_id = :client_id\b/, // etgo_subscription — System-owned at client '0'
];

describe('R37 data-fix — header metadata', () => {
  it('parses with the expected id and gap label', () => {
    assert.equal(fix.id, 'R37-tenant-subscription-backfill');
    assert.equal(fix.gap, 'B2');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a one-line description naming the table and the grandfathered plan', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.doesNotMatch(fix.description, /\n/);
    assert.match(fix.description, /ETGO_SUBSCRIPTION/i);
    assert.match(fix.description, /legacy-productive/);
    assert.match(fix.description, /ETGO_TenantPlan/);
  });

  it('explains, in the file header, why three tables are not scoped by ad_client_id', () => {
    assert.match(rawText, /TENANT SCOPING/);
    assert.match(rawText, /environment_client_id/);
    assert.match(rawText, /created_client_id/);
    assert.match(rawText, /visibleat_client_id/);
  });

  it('documents that ONBOARDING_PROVISIONED_THROUGH is deliberately not bumped', () => {
    assert.match(rawText, /ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped/);
  });

  it('has non-empty @check, @apply, and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0);
  });

  it('has a filename timestamp strictly after the last pre-existing fix in this checkout', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-24T15:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime());
  });
});

describe('R37 data-fix — tenant isolation (no statement is unscoped)', () => {
  it('scopes EVERY statement of @check, @apply and @report to :client_id', () => {
    for (const [section, body] of [['@check', fix.check], ['@apply', fix.apply], ['@report', fix.report]]) {
      const statements = splitStatements(body);
      assert.ok(statements.length > 0, `${section} must contain at least one statement`);
      for (const stmt of statements) {
        const scoped = SCOPE_PREDICATES.some(re => re.test(stmt));
        assert.ok(scoped, `${section} has an unscoped statement: ${stmt.slice(0, 120)}...`);
      }
    }
  });

  it('anchors every section on ad_client, so README rule 1 is met literally on the driving table', () => {
    for (const body of [normCheck, normApply, normReport]) {
      assert.match(body, /FROM ad_client c/);
      assert.match(body, /c\.ad_client_id = :client_id/);
    }
  });

  it('reads the plan marker through visibleat_client_id (matching TenantPlanService and R31/R32)', () => {
    assert.match(normCheck, /tp\.attribute = 'ETGO_TenantPlan'/);
    assert.match(normCheck, /tp\.visibleat_client_id = :client_id/);
    assert.doesNotMatch(normCheck, /tp\.ad_client_id/);
    assert.match(normApply, /tp\.visibleat_client_id = :client_id/);
  });

  it('scopes the checkout-request lookup by created_client_id (the table is System-owned)', () => {
    assert.match(normApply, /FROM etgo_checkout_request r WHERE r\.created_client_id = :client_id/);
  });

  it('scopes every etgo_subscription access by environment_client_id (the tenant column)', () => {
    const scoped = (norm(rawText).match(/environment_client_id = :client_id/g) || []).length;
    const touched = (norm(rawText).match(/FROM etgo_subscription s/g) || []).length;
    assert.ok(touched >= 3, 'expected etgo_subscription to be probed in @check, @apply and @report');
    assert.ok(scoped >= touched, 'every etgo_subscription probe must carry environment_client_id = :client_id');
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
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE etgo_subscription" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R37 data-fix — @check (productive tenant without an open subscription)', () => {
  it('requires an active ETGO_TenantPlan=productive marker', () => {
    assert.match(normCheck, /EXISTS \( SELECT 1 FROM ad_preference tp/);
    assert.match(normCheck, /tp\.isactive = 'Y'/);
    assert.match(normCheck, /upper\(trim\(tp\.value\)\) = 'PRODUCTIVE'/);
  });

  it('requires the tenant to have NO open subscription yet', () => {
    assert.match(
      normCheck,
      /NOT EXISTS \( SELECT 1 FROM etgo_subscription s WHERE s\.environment_client_id = :client_id AND s\.isactive = 'Y' AND s\.end_date IS NULL \)/,
    );
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });

  it('is read-only', () => {
    assert.doesNotMatch(normCheck, /\b(INSERT|UPDATE|DELETE)\b/i);
  });
});

describe('R37 data-fix — @apply statement 1 (missing-plan abort guard)', () => {
  it('raises instead of quietly inserting nothing when the legacy-productive plan row is absent', () => {
    assert.match(normApply, /CAST\( 'R37 ABORT: etgo_plan has no active row with value = ''legacy-productive''/);
    assert.match(normApply, /AS integer \) AS abort_missing_legacy_plan/);
    assert.match(
      normApply,
      /NOT EXISTS \( SELECT 1 FROM etgo_plan p WHERE p\.value = 'legacy-productive' AND p\.isactive = 'Y' \)/,
    );
  });

  it('concatenates the client id into the message so PostgreSQL cannot constant-fold the cast', () => {
    assert.match(normApply, /\|\| 'Refusing to backfill tenant ' \|\| c\.ad_client_id/);
  });

  it('only aborts for a tenant that would genuinely have been backfilled', () => {
    const guardStatement = splitStatements(fix.apply)[0];
    assert.match(guardStatement, /attribute = 'ETGO_TenantPlan'/);
    assert.match(guardStatement, /NOT EXISTS \( SELECT 1 FROM etgo_subscription s/);
  });

  it('documents why FAILED is the right outcome (the watermark does not advance, so the tenant retries)', () => {
    assert.match(rawText, /FAILED is NOT in the runner's\s+--\s+PROCESSED set/);
    assert.match(rawText, /watermark does NOT advance/);
  });
});

describe('R37 data-fix — @apply statement 2 (the backfill INSERT)', () => {
  const insertStatement = splitStatements(fix.apply).find(s => /^INSERT INTO etgo_subscription/.test(s));

  it('runs exactly one INSERT, into etgo_subscription', () => {
    const inserts = (fix.apply.match(/\bINSERT\s+INTO\b/gi) || []).length;
    assert.equal(inserts, 1);
    assert.ok(insertStatement, 'expected an INSERT INTO etgo_subscription statement');
  });

  it('writes a fresh per-tenant id through the @uuid_ placeholder, never a hardcoded one', () => {
    assert.match(normApply, /'@uuid_ETGOSUB@'/);
  });

  it('owns the row at System level while pointing environment_client_id at the tenant', () => {
    assert.match(normApply, /environment_client_id, etgo_plan_id, status,/);
    assert.match(normApply, /'@uuid_ETGOSUB@', '0', '0', 'Y', now\(\), '0', now\(\), '0', c\.ad_client_id,/);
  });

  it('resolves the plan through a legacy-productive subselect', () => {
    assert.match(
      normApply,
      /\(SELECT p\.etgo_plan_id FROM etgo_plan p WHERE p\.value = 'legacy-productive' AND p\.isactive = 'Y' LIMIT 1\)/,
    );
  });

  it('writes an OPEN, active subscription (status active, end_date NULL) so the constraints hold', () => {
    assert.match(normApply, /'active', COALESCE\(cr\.paid_at, c\.created, now\(\)\), NULL, NULL, NULL,/);
  });

  it('copies the Stripe ids from the latest paid checkout request via LEFT JOIN LATERAL', () => {
    assert.match(normApply, /LEFT JOIN LATERAL \( SELECT r\.stripe_customer_id, r\.stripe_subscription_id, r\.stripe_price_id, r\.paid_at/);
    assert.match(normApply, /r\.stripe_subscription_id IS NOT NULL/);
    assert.match(normApply, /ORDER BY r\.paid_at DESC NULLS LAST, r\.created DESC LIMIT 1 \) cr ON TRUE/);
    assert.match(normApply, /cr\.stripe_customer_id, cr\.stripe_subscription_id,/);
  });

  it('copies the charged Stripe price id from the same checkout request, NULL when unknown', () => {
    assert.match(normApply, /etgo_account_id, provider_price_id, snapshot_amount, snapshot_currency, pending_plan_id, pending_effective_date/);
    // etgo_account_id NULL, provider_price_id from the request, snapshot amount/currency NULL.
    assert.match(normApply, /NULL, cr\.stripe_price_id, NULL, NULL, NULL, NULL FROM ad_client c/);
    // The LEFT JOIN makes it NULL for a tenant with no usable request, never a guessed value.
    assert.match(normApply, /\) cr ON TRUE/);
  });

  it('leaves snapshot_amount and snapshot_currency NULL (the legacy plan has no price to snapshot)', () => {
    assert.match(rawText, /grandfathered 'legacy-productive' plan has no price/);
    assert.doesNotMatch(normApply, /snapshot_amount\s*=|display_price/);
  });

  it('reports the copied price id per created subscription', () => {
    assert.match(normReport, /', price=' \|\| COALESCE\(s\.provider_price_id, 'unknown'\)/);
  });
});

describe('R37 data-fix — @apply statement 3 (per-tenant retirement of the ETGO_TenantPlan preference)', () => {
  const statements = splitStatements(fix.apply);
  const deleteStatement = statements[2];

  it('runs THREE statements, in order: abort guard, INSERT, then the retirement DELETE', () => {
    assert.equal(statements.length, 3, `@apply must be three statements: ${statements.length}`);
    assert.match(statements[0], /abort_missing_legacy_plan/);
    assert.match(statements[1], /^INSERT INTO etgo_subscription/);
    assert.match(statements[2], /^DELETE FROM ad_preference tp/);
    // The order is the invariant, not an accident: the DELETE's guard reads the row the INSERT
    // writes, in the same transaction. Retiring the preference first would leave a window in
    // which neither store answers for the tenant if the INSERT then failed.
    const deletes = (fix.apply.match(/\bDELETE\s+FROM\b/gi) || []).length;
    assert.equal(deletes, 1, 'exactly one DELETE, and it targets ad_preference');
  });

  it('scopes the DELETE by visibleat_client_id and NEVER by ad_client_id', () => {
    // THE mistake that has already nearly shipped twice on this ticket. Preferences
    // .setPreferenceValue stores the row at AD_CLIENT_ID = '0' and puts the tenant in
    // VISIBLEAT_CLIENT_ID only, so `ad_client_id = :client_id` matches ZERO rows for every
    // tenant — a silent no-op that would leave the whole fleet un-retired with nothing reporting
    // it. Verified on the live database: via_visibleat=6, via_adclient=0.
    assert.match(deleteStatement, /tp\.visibleat_client_id = :client_id/);
    assert.doesNotMatch(deleteStatement, /tp\.ad_client_id/);
    assert.match(deleteStatement, /tp\.attribute = 'ETGO_TenantPlan'/);
  });

  it('is guarded on an OPEN SUBSCRIPTION EXISTING, not on "the INSERT above just ran"', () => {
    // Guarding on existence makes the statement self-healing: a tenant that obtained its
    // subscription by any other route (the runtime paid-upgrade path, a manual correction, an
    // earlier partial run) is retired the next time the fix is invoked for it.
    assert.match(
      deleteStatement,
      /AND EXISTS \( SELECT 1 FROM etgo_subscription s WHERE s\.environment_client_id = :client_id AND s\.isactive = 'Y' AND s\.end_date IS NULL \)/,
    );
    assert.doesNotMatch(deleteStatement, /NOT EXISTS/);
  });

  it('retires EVERY ETGO_TenantPlan row of the tenant, whatever its value or isactive flag', () => {
    // Deliberate, and documented in the header: once the tenant has an open subscription, any
    // surviving marker is a second answer to a question that now has one authority. A leftover
    // inactive or non-productive row would also keep the end-condition count above zero forever,
    // which is the one property that makes the per-tenant design worth having.
    assert.doesNotMatch(deleteStatement, /tp\.isactive/);
    assert.doesNotMatch(deleteStatement, /tp\.value/);
    assert.match(rawText, /WHY THE DELETE IGNORES the preference's own value and isactive flag/);
  });

  it('documents the observable end condition that makes Phase F a query, not a judgement call', () => {
    assert.match(rawText, /select count\(\*\) from ad_preference where attribute = 'ETGO_TenantPlan'/);
    assert.match(rawText, /ETP-5046-TRANSITIONAL-FALLBACK/);
  });

  it('records the R31/R32 ordering invariant and the fiscal-compliance stake', () => {
    // R31 keys on the ABSENCE of the marker to force ETSG_ForceTestMode='Y'. Running it after
    // this fix retired a paying tenant's marker would route that tenant's real SII/TicketBAI/
    // VeriFactu submissions to the tax authority's TEST endpoints.
    assert.match(rawText, /ORDERING INVARIANT/);
    assert.match(rawText, /20260901T120000Z__R31-force-test-mode-demo-tenants\.sql/);
    assert.match(rawText, /20260901T130000Z__R32-revert-test-mode-productive-tenants\.sql/);
    assert.match(rawText, /TEST endpoints/);
    assert.match(rawText, /fiscal-compliance failure/);
    assert.match(rawText, /ANY FUTURE FIX MUST KEY ON etgo_subscription, NOT ON ETGO_TenantPlan/);
    // R31/R32 are immutable applied fixes — superseded by a new dated file, never edited.
    assert.match(rawText, /an applied data-fix is immutable/);
  });
});

describe('R37 data-fix — idempotency (converges to zero, never trips the partial unique index)', () => {
  it('carries the same NOT EXISTS open-subscription guard in BOTH @check and @apply', () => {
    const guard = /NOT EXISTS \( SELECT 1 FROM etgo_subscription s WHERE s\.environment_client_id = :client_id AND s\.isactive = 'Y' AND s\.end_date IS NULL \)/;
    assert.match(normCheck, guard);
    assert.match(normApply, guard);
    const applyGuards = (normApply.match(new RegExp(guard.source, 'g')) || []).length;
    assert.equal(applyGuards, 2, 'expected the guard on BOTH the abort guard and the INSERT');
  });

  it('gates both sections on the same productive-plan marker, so the two layers agree', () => {
    const marker = /attribute = 'ETGO_TenantPlan'/;
    assert.match(normCheck, marker);
    const applyMarkers = (normApply.match(new RegExp(marker.source, 'g')) || []).length;
    assert.equal(applyMarkers, 3,
      'expected the plan marker on the abort guard, the INSERT and the retirement DELETE');
  });

  it('converges after the retirement too: no preference left means @check can never match again', () => {
    // Two independent reasons now: @check requires an ACTIVE productive preference AND no open
    // subscription. After @apply the tenant has the subscription and no preference at all, so
    // both halves of the probe are false and the runner records SKIPPED_NOT_NEEDED forever.
    assert.match(normCheck, /EXISTS \( SELECT 1 FROM ad_preference tp/);
    assert.match(normCheck, /NOT EXISTS \( SELECT 1 FROM etgo_subscription s/);
    const deleteStatement = splitStatements(fix.apply)[2];
    assert.match(deleteStatement, /^DELETE FROM ad_preference tp/);
    // Re-running the DELETE removes nothing, so it is safe even outside the @check gate.
    assert.match(rawText, /A second invocation would in any case remove nothing/);
  });

  it('names the partial unique index it must not violate', () => {
    assert.match(rawText, /etgo_sub_open_envclient_uq/);
  });
});

describe('R37 data-fix — @report (manual pre-check + per-row Stripe outcome)', () => {
  it('is a read-only SELECT (no INSERT/UPDATE/DELETE)', () => {
    assert.doesNotMatch(normReport, /\b(INSERT|UPDATE|DELETE)\b/i);
    assert.match(normReport, /\bSELECT\b/);
  });

  it('always returns at least one row, so the ledger detail is never NULL on an APPLIED row', () => {
    // The first UNION ALL branch is driven by ad_client filtered on the target tenant, which
    // always matches exactly one row — the report can never come back empty after an apply.
    assert.match(normReport, /'manual-pre-check' AS item/);
    assert.match(normReport, /FROM ad_client c WHERE c\.ad_client_id = :client_id UNION ALL/);
  });

  it('carries the verbatim manual pre-check outcome, including its date and its consequence', () => {
    assert.match(normReport, /2026-08-27/);
    assert.ok(
      normReport.includes('a real paying cohort exists that the backfill would orphan'),
      '@report must state the consequence verbatim',
    );
    assert.match(normReport, /production Stripe checkout has not gone live since 2026-08-27/);
    assert.match(normReport, /an adoption step is required first/);
  });

  it('does NOT ship the unfilled pre-check placeholder marker', () => {
    assert.ok(
      !normReport.includes(PRECHECK_PLACEHOLDER),
      `@report still carries the ${PRECHECK_PLACEHOLDER} placeholder — fill in the manual pre-check outcome`,
    );
  });

  it('records the retirement of the preference — the only audit trail once the row is gone', () => {
    assert.match(normReport, /'tenant-plan-preference' AS item/);
    assert.ok(normReport.includes('ETGO_TenantPlan preference retired for this tenant'),
      '@report must say the preference was retired');
    assert.ok(normReport.includes('no row remains (either it was removed here, or there '),
      '@report must also cover the case where there was nothing left to retire');
    assert.ok(normReport.includes('ETGO_TenantPlan preference STILL PRESENT for this tenant'),
      '@report must flag a tenant whose preference was NOT retired');
    // Driven by ad_client, so the line is emitted for every applied tenant, exactly once.
    assert.match(normReport, /END AS outcome, c\.ad_client_id AS ref FROM ad_client c WHERE c\.ad_client_id = :client_id ORDER BY 1, 3/);
  });

  it('keeps the existing manual-pre-check line alongside the retirement line', () => {
    assert.match(normReport, /'manual-pre-check' AS item/);
    assert.match(normReport, /'open-subscription' AS item/);
    assert.match(normReport, /'tenant-plan-preference' AS item/);
  });

  it('reports, per created row, whether the Stripe ids were copied or left NULL', () => {
    assert.match(normReport, /'open-subscription' AS item/);
    assert.match(normReport, /WHEN s\.stripe_subscription_id IS NOT NULL THEN 'stripe ids copied from etgo_checkout_request/);
    assert.match(normReport, /ELSE 'no usable etgo_checkout_request found, stripe ids left NULL'/);
    assert.match(normReport, /s\.etgo_subscription_id AS ref/);
  });
});

describe('R37 data-fix — formatReportDetail integration (runner side of the @report contract, synthetic fixture)', () => {
  it('formats both report branches the way an operator would read them', () => {
    const rows = [
      {
        item: 'manual-pre-check',
        outcome: 'Re-verify that production Stripe checkout has not gone live since 2026-08-27; if it has, a real paying cohort exists that the backfill would orphan and an adoption step is required first.',
        ref: 'A'.repeat(32),
      },
      {
        item: 'open-subscription',
        outcome: 'no usable etgo_checkout_request found, stripe ids left NULL',
        ref: 'B'.repeat(32),
      },
      {
        item: 'tenant-plan-preference',
        outcome: 'ETGO_TenantPlan preference retired for this tenant in the same transaction as its'
          + ' open subscription; no row remains (either it was removed here, or there was none left'
          + ' to remove). The subscription is now its only plan record.',
        ref: 'A'.repeat(32),
      },
    ];
    const detail = formatReportDetail(rows);
    assert.match(detail, /^3 row\(s\) need manual attention:/);
    assert.match(detail, /item=manual-pre-check/);
    assert.match(detail, /a real paying cohort exists that the backfill would orphan/);
    assert.match(detail, /item=open-subscription/);
    // The ledger line is the ONLY record of the deletion — the preference row itself is gone.
    assert.match(detail, /item=tenant-plan-preference/);
    assert.match(detail, /preference retired for this tenant/);
  });

  it('would leave detail NULL only if the report returned nothing — which this @report cannot do', () => {
    assert.equal(formatReportDetail([]), null);
  });
});
