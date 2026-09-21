import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R37 corrective data-fix
 * (20260917T120000Z__R37-acctdim-bp-pr-locked-active.sql, ETP-4879, gap K2).
 *
 * Product decision (ETP-4879): the BP (Contacto) and PR (Producto)
 * accounting-dimension elements are never editable/visible through the "Dimensiones
 * contables" screen and must always be `active` — Project (PJ) and Cost Center (CC)
 * stay editable/optional, unchanged. The code-side lock
 * (`GeneralLedgerConfigurationHandler.LOCKED_DIMENSION_TYPES`) already shipped on this
 * branch and is NOT touched here; this fix repairs the underlying DB state so it stays
 * true regardless of which window/consumer reads it.
 *
 * DB investigation (2026-09-17, this DB, before writing this fix):
 *   - `C_AcctSchema_Element.isactive` was ALREADY 'Y' for every existing BP/PR row
 *     (98/98 each, 96 distinct clients with an accounting schema) — the AD-standard
 *     default, matching R23/K1's own finding. The IsActive half of this fix is a
 *     correctness guard, not a needed repair on the current fleet.
 *   - `ismandatory` was 'N' for EVERY BP/PR row (196/196) — never forced before. This is
 *     the real corrective content.
 *   - 2 client ids have NO accounting schema at all (unrelated A1/A2 gap, out of
 *     scope) — this fix's @check naturally returns 0 rows for them.
 * Confirmed safe to force IsMandatory='Y' by reading every consumer: it is dead code
 * for BP/PR in `applyDimensionChanges` (the branch that reads it is skipped entirely
 * for locked types), and classic core's posting/balancing engine (Fact.java/
 * FactLine.java) never reads AcctSchemaElement.isMandatory — only isBalanced.
 *
 * Preventive companion (same commit, dataset-only, NO CUT bump — a new tenant is
 * already born correct on both flags): `com.etendoerp.go/referencedata/sampledata/
 * GOClient/C_ACCTSCHEMA_ELEMENT.xml` already shipped BP/PR with ISACTIVE=Y; its
 * ISMANDATORY=N was corrected to Y in the same change.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a
 * live Postgres tenant, so true row-level behavior can only be verified end-to-end with
 * a DB (done above, read-only). What is verified deterministically here, without a DB,
 * is the SQL the fix ships: header metadata, tenant isolation, and the two-layer
 * idempotency guard.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260917T120000Z__R37-acctdim-bp-pr-locked-active.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R37 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R37-acctdim-bp-pr-locked-active');
    assert.equal(fix.gap, 'K2');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions both locked types and both flags', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /BP/);
    assert.match(fix.description, /PR/);
    assert.match(fix.description, /IsActive/);
    assert.match(fix.description, /IsMandatory/);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix (R36)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-17T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260911T120000Z__prev').getTime(),
      'R37 must sort after the latest pre-existing fix on this branch',
    );
  });
});

describe('R37 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client and to BP/PR only', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
    assert.match(normCheck, /elementtype IN \('BP', 'PR'\)/);
  });

  it('scopes the @apply to the client and to BP/PR only', () => {
    assert.match(normApply, /ad_client_id = :client_id/);
    assert.match(normApply, /elementtype IN \('BP', 'PR'\)/);
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

describe('R37 data-fix — sets both flags to Y', () => {
  it('the @apply sets isactive and ismandatory both to Y', () => {
    assert.match(normApply, /SET isactive = 'Y',\s*ismandatory = 'Y'/);
  });

  it('never writes a value other than Y to either column', () => {
    assert.doesNotMatch(normApply, /isactive = 'N'/);
    assert.doesNotMatch(normApply, /ismandatory = 'N'/);
  });

  it('never touches any other elementtype (PJ/CC/OO/AC/U1/U2 are out of scope)', () => {
    for (const other of ['PJ', 'CC', 'OO', 'AC', 'U1', 'U2']) {
      assert.doesNotMatch(normApply, new RegExp(`'${other}'`));
      assert.doesNotMatch(normCheck, new RegExp(`'${other}'`));
    }
  });
});

describe('R37 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check gate mirrors the exact predicate the @apply guards on', () => {
    const gate = "e.isactive IS DISTINCT FROM 'Y' OR e.ismandatory IS DISTINCT FROM 'Y'";
    assert.match(normCheck, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(normApply, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('the @apply UPDATE is guarded by IS DISTINCT FROM (only touches rows that would change)', () => {
    assert.match(normApply, /WHERE e\.ad_client_id = :client_id[\s\S]*IS DISTINCT FROM 'Y'/);
  });
});

describe('R37 data-fix — single-statement atomicity', () => {
  it('the @apply is exactly one UPDATE statement (both flags set together, no separate statements)', () => {
    const updateCount = (normApply.match(/\bUPDATE\b/gi) || []).length;
    assert.equal(updateCount, 1, 'expected exactly one UPDATE statement in @apply');
  });
});
