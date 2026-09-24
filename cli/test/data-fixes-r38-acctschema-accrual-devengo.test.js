import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R38 corrective data-fix
 * (20260921T125157Z__R38-acctschema-accrual-devengo.sql, ETP-5372).
 *
 * Product decision (ETP-5372): "Criterio Contable" (accrual) is hidden in the Esquema
 * Contable window and internally fixed to Devengo — Etendo Go doesn't support Caja
 * (cash-basis) for taxes. The code-side lock
 * (`GeneralLedgerConfigurationHandler.applyGeneralChanges` no longer applies a
 * client-supplied `accrual` value; `decisions.json` reclassifies it as `system`) already
 * shipped on this branch and is NOT touched here; this fix repairs the underlying DB
 * state so it stays true regardless of which window/consumer reads it — the code lock
 * only stops FUTURE writes, it does nothing for a tenant that flipped the flag before
 * this fix shipped.
 *
 * DB investigation (2026-09-21, experimental DB, before writing this fix):
 *   - `C_AcctSchema.isaccrual` was ALREADY 'Y' for all 104 schemas in this environment
 *     (0 with 'N'). This fix is a correctness guard on the fleet checked so far, not a
 *     needed repair — but each environment (dev/staging/production) has its own
 *     database, so this does not generalize without running the fix everywhere.
 *   - Dry-run of the fix itself (`--fix R38-acctschema-accrual-devengo --dry-run`)
 *     against the same DB: 102/102 tenants SKIPPED_NOT_NEEDED, 0 APPLIED/FAILED —
 *     confirms the @check logic matches the manual query finding.
 *
 * Preventive companion: NOT needed here — `com.etendoerp.go/referencedata/sampledata/
 * GOClient/C_ACCTSCHEMA.xml` already ships `ISACCRUAL=Y`, unchanged by this ticket.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a
 * live Postgres tenant, so true row-level behavior can only be verified end-to-end with
 * a DB (done above, dry-run only). What is verified deterministically here, without a
 * DB, is the SQL the fix ships: header metadata, tenant isolation, and the two-layer
 * idempotency guard.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260921T125157Z__R38-acctschema-accrual-devengo.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R38 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R38-acctschema-accrual-devengo');
    assert.equal(fix.gap, 'ETP-5372');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions the column and Devengo', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /IsAccrual/);
    assert.match(fix.description, /Devengo/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix (R37)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-21T12:51:57.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260917T120000Z__prev').getTime(),
      'R38 must sort after the latest pre-existing fix on this branch',
    );
  });
});

describe('R38 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client and to c_acctschema only', () => {
    assert.match(normCheck, /FROM c_acctschema s/);
    assert.match(normCheck, /s\.ad_client_id = :client_id/);
  });

  it('scopes the @apply to the client and to c_acctschema only', () => {
    assert.match(normApply, /UPDATE c_acctschema s/);
    assert.match(normApply, /s\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE ad_client" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R38 data-fix — forces isaccrual to Y (Devengo)', () => {
  it('the @apply sets isaccrual to Y', () => {
    assert.match(normApply, /SET isaccrual = 'Y'/);
  });

  it('never writes a value other than Y to isaccrual', () => {
    assert.doesNotMatch(normApply, /isaccrual = 'N'/);
  });

  it('stamps audit columns (updated, updatedby) like the sibling R37 fix', () => {
    assert.match(normApply, /updated = now\(\)/);
    assert.match(normApply, /updatedby = '0'/);
  });
});

describe('R38 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check gate mirrors the exact predicate the @apply guards on', () => {
    const gate = "isaccrual IS DISTINCT FROM 'Y'";
    assert.match(normCheck, new RegExp(gate));
    assert.match(normApply, new RegExp(gate));
  });

  it('the @apply UPDATE is guarded by IS DISTINCT FROM (only touches rows that would change)', () => {
    assert.match(normApply, /WHERE s\.ad_client_id = :client_id[\s\S]*IS DISTINCT FROM 'Y'/);
  });
});

describe('R38 data-fix — single-statement atomicity', () => {
  it('the @apply is exactly one UPDATE statement', () => {
    const updateCount = (normApply.match(/\bUPDATE\b/gi) || []).length;
    assert.equal(updateCount, 1, 'expected exactly one UPDATE statement in @apply');
  });
});
