import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R20 corrective data-fix
 * (20260803T180000Z__R20-default-standard-costing-rule.sql, ETP-4760, gap J1).
 *
 * ETP-4760 ("La regla de costeo debe ser Standard por defecto, no Average"). Live-DB sweep
 * (etendogoclean, 2026-08-03) confirmed the real root cause: M_COSTING_RULE was never in
 * OnboardingDatasetDefinition.INCLUDED_TABLES (com.etendoerp.go), so every onboarded tenant
 * inherits ZERO costing rules — not Average. acreedortest, acreetest2, empresa, 4
 * "Empresa E2E *" tenants, RolesPresa and TaxesOrg all had 0 M_Costing_Rule rows; every
 * M_Transaction row on the ones with any transactions was iscostcalculated='N' (100%).
 * GOClient/F&B International Group/QA Testing (the only tenants with a rule at all) already
 * have one, so this fix intentionally does NOT touch them — see the "scope decision" comment
 * in the .sql header for why converting an existing Average rule to Standard needs the real
 * "Validate Costing Rule" UI process (it creates Physical Inventory documents), not hand SQL.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB (done
 * this session in a rolled-back transaction against "empresa" — see
 * docs/etendo-ad/tenant-remediation-knowledge.md). What is verified deterministically here,
 * without a DB, is the SQL the fix ships: header metadata, tenant isolation, the two-layer
 * idempotency guard, the Standard-not-Average algorithm literal, and the deliberate exclusion
 * of tenants that already have any active+validated rule.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260803T180000Z__R20-default-standard-costing-rule.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const STANDARD_ALGORITHM_ID = '6A39D8B46CD94FE682D48758D3B7726B';
const AVERAGE_ALGORITHM_ID = 'B069080A0AE149A79CF1FA0E24F16AB6';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R20 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R20-default-standard-costing-rule');
    assert.equal(fix.gap, 'J1');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a description that mentions Standard and the costing rule gap', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /standard/i);
    assert.match(fix.description, /costing rule/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than every prior fix in the catalog', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-03T18:00:00.000Z');
    // Strictly after the last pre-existing fix on this branch (20260729T120000Z__R17).
    assert.ok(ts.getTime() > parseFixTimestamp('20260729T120000Z__prev').getTime());
  });
});

describe('R20 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
  });

  it('scopes the @apply to :client_id in both the target-org subquery and the client join', () => {
    assert.match(normApply, /ad_client_id = :client_id/);
    // Appears at least twice: once resolving the operative org, once resolving ad_client.
    const occurrences = (normApply.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(occurrences >= 2, `expected >=2 :client_id scopes in @apply, found ${occurrences}`);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE m_costing_rule' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R20 data-fix — seeds Standard, never Average', () => {
  it('the @apply hardcodes the Standard algorithm id', () => {
    assert.match(normApply, new RegExp(STANDARD_ALGORITHM_ID));
  });

  it('the @apply never references the Average algorithm id', () => {
    assert.doesNotMatch(normApply, new RegExp(AVERAGE_ALGORITHM_ID));
  });

  it('inserts an active, validated rule (isactive and isvalidated both Y)', () => {
    assert.match(normApply, /'Y', now\(\), '0', now\(\), '0',\s*'6A39D8B46CD94FE682D48758D3B7726B'/);
    assert.match(normApply, /'N', 'N', 'Y', 'N', c\.created/);
  });

  it('does not scope the rule to a specific product or product category (whole-client rule)', () => {
    assert.doesNotMatch(normApply, /m_product_id|m_product_category_id/i);
  });
});

describe('R20 data-fix — scope: only tenants with ZERO active+validated rules (excludes existing-rule tenants)', () => {
  it('the @check matches only when NO active, validated M_Costing_Rule exists for the client', () => {
    assert.match(normCheck, /NOT EXISTS \(\s*SELECT 1 FROM m_costing_rule cr/i);
    assert.match(normCheck, /cr\.isactive = 'Y'/i);
    assert.match(normCheck, /cr\.isvalidated = 'Y'/i);
  });

  it('the @apply re-checks the identical NOT EXISTS guard (second idempotency layer)', () => {
    assert.match(normApply, /NOT EXISTS \(\s*SELECT 1 FROM m_costing_rule cr/i);
    assert.match(normApply, /cr\.isactive = 'Y'/i);
    assert.match(normApply, /cr\.isvalidated = 'Y'/i);
  });

  it('requires a non-System operative org to exist for the tenant', () => {
    assert.match(normCheck, /o\.name <> '\*'/);
    assert.match(normApply, /o\.name <> '\*'/);
  });
});

describe('R20 data-fix — scope: excludes multi-org tenants (QA finding, 2026-08-03)', () => {
  /**
   * Etendo core's actual costing-rule lookup (CostingUtils.getCostDimensionRule /
   * CostingServer.getOrganization()) is an EXACT match on ad_org_id with no client-wide
   * fallback, even though the seeded rule itself is org_dimension='N' (whole-client). Picking
   * an arbitrary org for a hypothetical future multi-Legal-Entity zero-rule tenant would leave
   * every OTHER legal entity's transactions hitting a hard
   * NoCostingRuleFoundForOrganizationAndDate error instead of today's silent gap. So both
   * @check and @apply must require EXACTLY ONE non-'*' org for the client — a multi-org
   * zero-rule tenant (none exist today) falls through to the same "needs manual handling"
   * bucket as the already-excluded existing-rule tenants, rather than getting a rule anchored
   * to an arbitrary org.
   */
  const countGuard = /\(SELECT COUNT\(\*\) FROM ad_org o2 WHERE o2\.ad_client_id = :client_id AND o2\.name <> '\*'\) = 1/;

  it('the @check requires exactly one non-System org for the client', () => {
    assert.match(normCheck, countGuard);
  });

  it('the @apply re-checks the identical single-org guard (second idempotency layer)', () => {
    assert.match(normApply, countGuard);
  });

  it('the single-org guard is structurally identical in @check and @apply (same COUNT subquery)', () => {
    const checkMatch = normCheck.match(countGuard);
    const applyMatch = normApply.match(countGuard);
    assert.ok(checkMatch, '@check must contain the single-org COUNT guard');
    assert.ok(applyMatch, '@apply must contain the single-org COUNT guard');
    assert.equal(checkMatch[0], applyMatch[0]);
  });
});

describe('R20 data-fix — datefrom mirrors the tenant\'s own history, not "today"', () => {
  it('sources datefrom from the tenant\'s own AD_Client.created, not now()', () => {
    assert.match(normApply, /CROSS JOIN ad_client c/i);
    // The SELECT list's last value (datefrom) is c.created, immediately followed by the FROM
    // clause once whitespace/comments are normalized to single spaces.
    assert.match(normApply, /'N', 'Y', 'N', c\.created FROM/);
  });
});
