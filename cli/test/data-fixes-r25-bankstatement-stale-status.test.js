import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R25 corrective data-fix
 * (20260824T120000Z__R25-bankstatement-stale-status.sql, ETP-4891 follow-up).
 *
 * Row-level behavior was verified against GOClient in a rolled-back transaction: @check 5 rows
 * needed -> @apply 5 rows updated (all correctly to PENDING, matching each row's own
 * em_etgo_line_count/em_etgo_matched_count) -> @check 0. What is verifiable without a DB is the
 * SQL the fix ships: header metadata, tenant isolation, the idempotency guard, and that the
 * derivation mirrors BankStatementsSupport.deriveStatementStatus exactly. Mirrors the
 * data-fixes-r24-transfer-automatic-withdrawn.test.js precedent.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260824T120000Z__R25-bankstatement-stale-status.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R25 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R25-bankstatement-stale-status');
    assert.equal(fix.gap, 'L1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('explains the runtime root cause (PSD2 sync bypasses our own handlers)', () => {
    assert.match(rawText, /PSD2/);
    assert.match(rawText, /BankStatementHeaderStatusHandler/);
  });

  it('has non-empty @check and @apply sections and no @report', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(!fix.report, 'every matched row is corrected directly, nothing to report');
  });

  it('sorts after the previous fix, so lexical order == chronological order', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-24T12:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260821T120000Z__prev').getTime());
  });
});

describe('R25 data-fix — tenant isolation', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(normCheck, /bs\.ad_client_id = :client_id/);
  });

  it('scopes the @apply UPDATE to :client_id', () => {
    assert.match(normApply, /bs\.ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE fin_bankstatement' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R25 data-fix — only touches processed statements', () => {
  it('the @check only matches processed=\'Y\' rows', () => {
    assert.match(normCheck, /bs\.processed = 'Y'/);
  });

  it('the @apply only matches processed=\'Y\' rows (never touches a real draft)', () => {
    assert.match(normApply, /bs\.processed = 'Y'/);
  });
});

describe('R25 data-fix — status derivation mirrors deriveStatementStatus exactly', () => {
  it('derives PENDING when line count or matched count is zero', () => {
    assert.match(
      normApply,
      /WHEN COALESCE\(bs\.em_etgo_line_count, 0\) = 0 OR COALESCE\(bs\.em_etgo_matched_count, 0\) = 0 THEN 'PENDING'/,
    );
  });

  it('derives RECONCILED when matched count reaches line count', () => {
    assert.match(normApply, /WHEN bs\.em_etgo_matched_count >= bs\.em_etgo_line_count THEN 'RECONCILED'/);
  });

  it('derives PARTIAL as the fallthrough', () => {
    assert.match(normApply, /ELSE 'PARTIAL'/);
  });

  it('uses the header\'s own stored counters — no join to fin_bankstatementline', () => {
    assert.doesNotMatch(fix.apply, /fin_bankstatementline/i);
  });
});

describe('R25 data-fix — idempotency guard', () => {
  it('the @check compares the stored status against the same derivation with IS DISTINCT FROM', () => {
    assert.match(normCheck, /em_etgo_status IS DISTINCT FROM/);
  });

  it('the @apply is guarded the same way, so a re-run matches 0 rows', () => {
    assert.match(normApply, /em_etgo_status IS DISTINCT FROM/);
  });

  it('runs exactly one UPDATE statement', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+fin_bankstatement/gi) || []).length;
    assert.equal(updates, 1);
  });

  it('stamps the audit columns the way the other fixes do', () => {
    assert.match(normApply, /updated = now\(\), updatedby = '0'/);
  });
});
