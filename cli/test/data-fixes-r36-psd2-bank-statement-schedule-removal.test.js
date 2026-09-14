import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R36 corrective data-fix
 * (20260910T120000Z__R36-psd2-bank-statement-schedule-removal.sql, ETP-5275).
 *
 * Onboarding used to create one daily AD_Process_Request per tenant for the PSD2
 * `Get Bank Statements` process. ETP-5275 deletes that onboarding step in com.etendoerp.go, so a
 * new tenant is born with no scheduled process; this fix deletes the request on tenants already
 * provisioned with it.
 *
 * Four properties carry the whole ticket, and every one of them fails SILENTLY or destructively
 * if a later edit gets it wrong — hence a test for each:
 *
 * 1. The fix must key on the AD_Process ID, never on the process name. A separate, still-wanted
 *    process is named "Get Bank Statements (All Clients)"; a `name ILIKE '%Get Bank Statements%'`
 *    predicate would delete its schedule too. That is the one bug this ticket cannot ship.
 * 2. @apply must stay TWO statements. Core's AD_PROCESS_REQUEST_TRG raises @20630@ ("Unable to
 *    delete Process Request whilst still scheduled") when :OLD.STATUS is 'SCH' or 'MIS', and every
 *    targeted row is 'SCH'. Collapsing this to the DELETE alone aborts the whole tenant.
 * 3. BOTH historical description markers must be matched. ETP-4097 wrote "PSD2 automatic bank
 *    statement synchronization (Etendo GO onboarding)"; ETP-4690 renamed it to "Automatic bank
 *    statement synchronization (Etendo GO onboarding)". Matching only the current constant leaves
 *    every pre-rename tenant scheduled (9 of 127 rows on the shared dev DB).
 * 4. The DELETE must stay narrowed by those markers. Widening it to "every request for this
 *    process" would also destroy hand-made requests and one-shot manual runs.
 *
 * As with every data-fix, the runner (src/data-fixes/run.js) executes the parsed SQL against a
 * live Postgres tenant — true row-level behavior can only be verified end-to-end with a DB. What
 * is verified deterministically here, without a DB, is the SQL the fix ships.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260910T120000Z__R36-psd2-bank-statement-schedule-removal.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

/** The PSD2 process this fix removes the schedule for (search key PSD2_GetBankStatements). */
const TARGET_PROCESS_ID = 'F8704AB553464EFEABF8A5A82C74A308';
const MARKER_CURRENT = 'Automatic bank statement synchronization (Etendo GO onboarding)';
const MARKER_LEGACY = 'PSD2 automatic bank statement synchronization (Etendo GO onboarding)';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/**
 * The file's prose as one continuous string: leading `--` comment markers stripped, then all
 * whitespace collapsed. Prose assertions ("the header must explain X") run against THIS, not
 * rawText. The comment block is hard-wrapped at ~100 columns, so any phrase long enough to be
 * worth asserting on eventually straddles a line break — and the wrap inserts BOTH a newline and
 * the next line's `-- ` prefix into the middle of the sentence. Collapsing whitespace alone is
 * not enough; the marker has to go too, or a documentation check fails spuriously.
 */
const normRaw = rawText
  .split('\n')
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Same, but with `--` comment lines dropped first. Every NEGATIVE assertion ("must not contain X")
 * has to run against this, not against the raw section: the prose legitimately names the things
 * the SQL must not DO (the rejected name-based predicate, the trigger's own DELETE text), so
 * scanning comments too turns documentation into a test failure.
 */
const sqlOnly = (s) => norm(s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'));
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

/** The @apply body split into executable statements, comments stripped. */
const applyStatements = sqlApply.split(';').map((s) => s.trim()).filter(Boolean);

describe('R36 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R36-psd2-bank-statement-schedule-removal');
    assert.equal(fix.gap, 'ETP-5275');
  });

  it('is a medium-risk sql fix (it deletes rows and cascades history)', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('description names the ticket, the two-statement reason and the cascade', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETP-5275/);
    assert.match(fix.description, /AD_PROCESS_REQUEST_TRG/);
    assert.match(fix.description, /cascade/i);
  });

  it('description states the (All Clients) process is left untouched', () => {
    // The scope guard is the headline requirement of the ticket, so it must be legible from the
    // header alone — an operator reading `--list` output should not have to open the file.
    assert.match(fix.description, /All Clients/i);
    assert.match(fix.description, /untouched|left alone|not touched/i);
  });

  it('has non-empty @check and @apply, and no @report section', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    // @apply never legitimately skips a row it matched, so there is nothing to report.
    assert.equal(norm(fix.report ?? ''), '');
  });

  it('has a timestamp prefix that sorts after the newest existing fix (R34)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-10T12:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260908T120000Z__prev').getTime());
  });
});

describe('R36 data-fix — tenant isolation (:client_id in EVERY statement)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(sqlCheck, /r\.ad_client_id = :client_id/);
  });

  it('scopes BOTH @apply statements to :client_id', () => {
    // A multi-statement @apply makes this easy to get wrong: an unscoped DELETE here would wipe
    // the schedule for every tenant in the instance on the first tenant processed.
    assert.equal(applyStatements.length, 2, '@apply must be exactly two statements');
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(stmt, /r\.ad_client_id = :client_id/,
        `@apply statement ${i + 1} must be tenant-scoped`);
    }
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
    // Both statements must carry the literal, not just the first.
    assert.equal((inlined.match(new RegExp(`'${clientId}'`, 'g')) || []).length, 2);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R36 data-fix — keyed on the process ID, never on the process name', () => {
  it('every statement pins ad_process_id to the PSD2 Get Bank Statements process', () => {
    const pin = new RegExp(`ad_process_id = '${TARGET_PROCESS_ID}'`);
    assert.match(sqlCheck, pin, '@check must pin the target AD_Process id');
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(stmt, pin, `@apply statement ${i + 1} must pin the target AD_Process id`);
    }
  });

  it('never joins ad_process or filters on a process name', () => {
    // THE regression guard of the ticket: matching by name would also delete the schedule of the
    // separate "Get Bank Statements (All Clients)" process, which must keep running.
    for (const [label, sql] of [['check', sqlCheck], ['apply', sqlApply]]) {
      assert.doesNotMatch(sql, /\bad_process\b(?!_)/i, `${label} must not join the ad_process table`);
      assert.doesNotMatch(sql, /\bilike\b/i, `${label} must not use a fuzzy name match`);
      assert.doesNotMatch(sql, /Get Bank Statements/i, `${label} must not reference it by name`);
    }
  });

  it('documents why hardcoding this AD id is correct here', () => {
    assert.match(rawText, /All Clients/);
    assert.match(rawText, /PSD2_GetBankStatements/);
  });
});

describe('R36 data-fix — matches BOTH historical description markers', () => {
  it('@check accepts the current and the pre-ETP-4690 marker', () => {
    assert.ok(sqlCheck.includes(MARKER_CURRENT), 'current marker missing from @check');
    assert.ok(sqlCheck.includes(MARKER_LEGACY), 'legacy marker missing from @check');
  });

  it('BOTH @apply statements accept both markers', () => {
    for (const [i, stmt] of applyStatements.entries()) {
      assert.ok(stmt.includes(MARKER_CURRENT), `statement ${i + 1} misses the current marker`);
      assert.ok(stmt.includes(MARKER_LEGACY), `statement ${i + 1} misses the legacy marker`);
    }
  });

  it('uses an IN list, not equality, so neither marker can be dropped by accident', () => {
    for (const [label, sql] of [['check', sqlCheck], ['apply', sqlApply]]) {
      assert.match(sql, /r\.description IN \(/, `${label} must use an IN list of markers`);
    }
  });

  it('explains the rename that produced two markers', () => {
    assert.match(rawText, /ETP-4097/);
    assert.match(rawText, /ETP-4690/);
  });

  it('documents that unmarked rows (manual runs) are deliberately out of scope', () => {
    assert.match(rawText, /'COM'/);
    assert.match(rawText, /manual/i);
  });
});

describe('R36 data-fix — the two-statement shape core forces on it', () => {
  it("statement 1 unschedules to 'UNS' — the trigger's precondition, not decoration", () => {
    assert.match(applyStatements[0], /^UPDATE ad_process_request/);
    assert.match(applyStatements[0], /SET status = 'UNS'/);
  });

  it('statement 2 deletes the request', () => {
    assert.match(applyStatements[1], /^DELETE FROM ad_process_request/);
  });

  it('the UPDATE comes BEFORE the DELETE', () => {
    // Same transaction, and order matters: the trigger reads :OLD.STATUS, so the row must already
    // be 'UNS' by the time the DELETE runs.
    assert.ok(sqlApply.indexOf('UPDATE ad_process_request') < sqlApply.indexOf('DELETE FROM'));
  });

  it('documents the trigger that forces this shape, by name and message code', () => {
    // A future reader who wants to "simplify" this into a single DELETE must first delete an
    // explicit explanation of why that fails.
    assert.match(rawText, /AD_PROCESS_REQUEST_TRG/);
    assert.match(rawText, /@20630@/);
    assert.match(rawText, /:OLD\.STATUS/);
    assert.match(normRaw, /Do not "simplify" this fix down to the DELETE alone/);
  });
});

describe('R36 data-fix — blast radius', () => {
  it('touches only ad_process_request — never the child tables directly', () => {
    // AD_Process_Run goes away via ON DELETE CASCADE; jobs_job_result and etcop_schedule are
    // NO ACTION and belong to other modules, so this fix must never delete their rows itself.
    for (const [label, sql] of [['check', sqlCheck], ['apply', sqlApply]]) {
      assert.doesNotMatch(sql, /ad_process_run|jobs_job_result|etcop_schedule/i,
        `${label} must not touch the child tables directly`);
    }
  });

  it('never inserts', () => {
    assert.doesNotMatch(sqlApply, /\bINSERT\b/i);
  });

  it('the UPDATE writes only the status pair plus the standard AD audit columns', () => {
    const setClause = applyStatements[0].slice(
      applyStatements[0].indexOf('SET '), applyStatements[0].indexOf('WHERE '));
    const assigned = [...setClause.matchAll(/(\w+) =/g)].map((m) => m[1]).sort();
    assert.deepEqual(assigned, ['isactive', 'status', 'updated', 'updatedby']);
  });

  it('documents the cascade cost and that losing the history is the accepted decision', () => {
    assert.match(normRaw, /ON DELETE CASCADE/);
    assert.match(rawText, /AD_Process_Run/);
    assert.match(normRaw, /accepted, explicit product decision/i);
  });

  it('documents the live-Quartz consequence for the operator', () => {
    assert.match(normRaw, /foreign-key violation/i);
    assert.match(rawText, /restart/i);
  });
});

describe('R36 data-fix — two-layer idempotency', () => {
  it('@check and @apply gate on the same marked-row predicate', () => {
    const pin = new RegExp(`ad_process_id = '${TARGET_PROCESS_ID}'`);
    assert.match(sqlCheck, pin);
    for (const stmt of applyStatements) assert.match(stmt, pin);
  });

  it('re-running after a successful apply matches zero rows (the rows are gone)', () => {
    assert.match(rawText, /SKIPPED_NOT_NEEDED/);
  });

  it('the @check LIMIT 1 is an existence probe only — @apply carries no row cap', () => {
    assert.match(sqlCheck, /LIMIT 1/);
    assert.doesNotMatch(sqlApply, /LIMIT/i);
  });
});
