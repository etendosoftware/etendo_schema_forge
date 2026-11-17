// @covers cli/src/data-fixes/sql/20261112T120000Z__R58-quotation-sequence-startno.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R58 corrective data-fix (gap N10): the "Quotation" sequence
 * gets STARTNO 1000000 where it still holds the dataset's 10000.
 *
 * Row-level behaviour needs a live tenant; what is pinned here, without a DB, is the SQL the fix
 * ships: the only column it writes (never CURRENTNEXT, PREFIX or a document), the exact-value
 * guard that is also its idempotency guard, the @check/@apply agreement, tenant isolation and its
 * position after R57 in the catalog.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20261112T120000Z__R58-quotation-sequence-startno.sql';
const FIX_ID = basename(FIX_FILE, '.sql');
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);

/** Drop `--` comment lines and collapse whitespace: the header prose quotes SQL it does not run. */
const sqlOnly = (s) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .replace(/\s+/g, ' ').trim();
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report ?? '');

/** The guard both @check and @apply must carry, so a row the apply skips cannot keep @check firing. */
const TARGET_ROW = [/s\.ad_client_id = :client_id/, /s\.name = 'Quotation'/, /s\.startno = 10000\b/];

describe('R58 data-fix — header and catalog position', () => {
  it('parses as a low-risk sql chain fix for gap N10 with a @report', () => {
    assert.equal(fix.id, 'R58-quotation-sequence-startno');
    assert.equal(fix.gap, 'N10');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.equal(fix.optIn, false);
    assert.match(fix.description, /ETP-5837/);
    assert.ok(fix.report.length > 0);
  });

  it('sorts strictly after R57, which has already run on existing tenants (watermark)', () => {
    const r58 = parseFixTimestamp(FIX_ID).getTime();
    const stamps = readdirSync(SQL_DIR)
      .filter(f => f.endsWith('.sql') && f !== FIX_FILE)
      .map(f => parseFixTimestamp(basename(f, '.sql'))?.getTime());
    assert.ok(!stamps.includes(r58), 'no other fix may share R58\'s timestamp');
    assert.ok(r58 > parseFixTimestamp('20261106T120000Z__R57-quotation-sequence-pr-prefix').getTime());
  });
});

describe('R58 data-fix — scope', () => {
  for (const [name, sql] of [['@check', sqlCheck], ['@apply', sqlApply]]) {
    it(`${name} targets only a Quotation sequence of this tenant still at STARTNO 10000`, () => {
      for (const guard of TARGET_ROW) {
        assert.match(sql, guard);
      }
    });
  }

  it('@report is scoped to this tenant', () => {
    assert.match(sqlReport, /s\.ad_client_id = :client_id/);
    assert.match(sqlReport, /s\.startno IS DISTINCT FROM 1000000/);
  });
});

describe('R58 data-fix — what it writes', () => {
  it('is a single UPDATE of ad_sequence setting STARTNO 1000000', () => {
    const statements = sqlApply.split(';').map(s => s.trim()).filter(Boolean);
    assert.equal(statements.length, 1);
    assert.match(statements[0], /^UPDATE ad_sequence s SET startno = 1000000, updated = now\(\), updatedby = '0' WHERE/);
  });

  it('never writes CURRENTNEXT, the prefix or any document', () => {
    const setClause = sqlApply.match(/\bSET (.*?) WHERE\b/)[1];
    assert.doesNotMatch(setClause, /currentnext|prefix/i);
    assert.doesNotMatch(sqlApply, /\b(?:UPDATE|DELETE FROM|INSERT INTO) (?!ad_sequence\b)\w+/i);
  });
});
