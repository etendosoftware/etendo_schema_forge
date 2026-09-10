import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R29 corrective data-fix
 * (20260828T140000Z__R29-acctschema-allownegative-revert.sql, ETP-4947, gap A3).
 *
 * ETP-4245/A3 (2026-07-06) deliberately flipped `C_ACCTSCHEMA.AllowNegative` from N to Y —
 * preventively (GOClient.xml) and correctively
 * (20260706T120000Z__R10-accounting-schema-dimensions.sql) — justified at the time by Confluence
 * Test Plan case TC-38. ETP-4947 supersedes TC-38: AllowNegative must default to N (unchecked),
 * while remaining user-editable. This fix reverts ONLY the AllowNegative flag; R10 is not retired
 * (its IsCentrallyMaintained=Y flip and the CC/User1/User2 accounting-dimension rows stay correct
 * and are explicitly out of scope here).
 *
 * As with every other data-fix, the runner (src/data-fixes/run.js) executes the parsed
 * @check/@apply SQL against a live Postgres tenant — true row-level behavior can only be verified
 * end-to-end with a DB (see tenant-remediation-knowledge.md for the live sweep this fix was scoped
 * from). What is verified deterministically here, without a DB, is the SQL the fix ships: header
 * metadata, tenant isolation, and the two-layer idempotency guard.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260828T140000Z__R29-acctschema-allownegative-revert.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R29 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R29-acctschema-allownegative-revert');
    assert.equal(fix.gap, 'A3');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions AllowNegative and ETP-4947', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /AllowNegative/i);
    assert.match(fix.description, /ETP-4947/);
  });

  it('description explicitly excludes IsCentrallyMaintained from scope', () => {
    assert.match(fix.description, /IsCentrallyMaintained.*(scope|untouched)/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix sorts after every existing R28 claim on sibling branches', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-28T14:00:00.000Z');
    // Two sibling in-flight branches (feature/ETP-4706, feature/ETP-5019) already claim R28 with
    // 20260828T120000Z and 20260827T120000Z respectively — this fix must sort after both.
    assert.ok(ts.getTime() > parseFixTimestamp('20260828T120000Z__prev').getTime());
    assert.ok(ts.getTime() > parseFixTimestamp('20260827T120000Z__prev').getTime());
  });
});

describe('R29 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client row and the AllowNegative=Y predicate', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
    assert.match(normCheck, /allownegative = 'Y'/);
  });

  it('scopes the @apply UPDATE to :client_id', () => {
    assert.match(normApply, /UPDATE c_acctschema/i);
    assert.match(normApply, /WHERE ad_client_id = :client_id\s+AND allownegative = 'Y'/);
  });

  it('never touches iscentrallymaintained (explicitly out of scope for ETP-4947)', () => {
    assert.doesNotMatch(normApply, /iscentrallymaintained/i);
    assert.doesNotMatch(normCheck, /iscentrallymaintained/i);
  });

  it('never touches c_acctschema_element (the CC/U1/U2 dimensions stay as R10 left them)', () => {
    assert.doesNotMatch(normApply, /c_acctschema_element/i);
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

describe('R29 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('@check gates on exactly the predicate @apply guards on (allownegative = \'Y\')', () => {
    assert.match(normCheck, /allownegative = 'Y'/);
    assert.match(normApply, /allownegative = 'Y'/);
  });

  it('the @apply UPDATE sets allownegative to N', () => {
    assert.match(normApply, /SET\s+allownegative = 'N'/i);
  });

  it('re-running after a successful apply matches zero rows (WHERE clause is its own guard)', () => {
    // No `Y` rows remain after a successful apply, so the same WHERE predicate that gated the
    // UPDATE now excludes every row — this is the second idempotency layer, same shape as R10's
    // own defensive UPDATE guard.
    const whereClauseCount = (normApply.match(/WHERE ad_client_id = :client_id\s+AND allownegative = 'Y'/g) || []).length;
    assert.equal(whereClauseCount, 1);
  });
});

describe('R29 data-fix — multi-schema tenants (client with several c_acctschema rows)', () => {
  it('the @apply WHERE clause is bounded to exactly client_id + allownegative — no per-schema id restriction that could silently leave other Y schemas of the same client untouched', () => {
    // Anchored to the end of the statement: if a future edit narrowed this UPDATE to a single
    // c_acctschema row (e.g. by adding "AND c_acctschema_id = ..."), this regex would stop matching
    // even though the looser mid-string checks above would still pass.
    assert.match(normApply, /WHERE ad_client_id = :client_id AND allownegative = 'Y';$/);
  });

  it('the @apply UPDATE carries no LIMIT — every Y schema for the client flips, not just one', () => {
    // Postgres has no UPDATE...LIMIT syntax, but a row-restricting subquery (e.g. "ctid IN (SELECT
    // ctid ... LIMIT 1)") could still exist and would defeat the multi-schema case; assert its absence.
    assert.doesNotMatch(normApply, /LIMIT/i);
  });

  it('the @check LIMIT 1 is an existence probe only — it never bounds how many rows @apply flips', () => {
    // @check intentionally short-circuits on the first Y row it finds (LIMIT 1) to answer "is this
    // fix needed at all"; @apply's own WHERE (verified above) is what determines how many rows are
    // touched, and it carries no such limit.
    assert.match(normCheck, /allownegative = 'Y'\s+LIMIT 1;$/);
  });
});

describe('R29 data-fix — unconditional scope (no "manually set" guard, per product decision)', () => {
  it('the @apply WHERE clause filters only on client_id + allownegative — no extra "was this manually set" predicate', () => {
    // ETP-4947 decision: R10 force-set every tenant to Y only ~7 weeks before this fix, so there is
    // no population of tenants who could have genuinely opted into Y independent of R10 — revert
    // unconditionally. `updatedby = '0'` in the SET list is just the standard AD audit stamp (same
    // as R10's own apply) — it must never appear as a WHERE-clause filter/guard.
    assert.doesNotMatch(normApply, /WHERE ad_client_id = :client_id[^;]*updatedby/i);
    assert.doesNotMatch(normCheck, /updatedby/i);
  });
});
