import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R40 corrective data-fix
 * (20260923T120000Z__R40-internal-consumption-table-active.sql, ETP-5445, gap A4b).
 *
 * The curated GOClient dataset ships the C_AcctSchema_Table row for M_Internal_Consumption
 * (AD_Table_id 800168) inactive, so Internal Consumption documents can never post. The fix
 * flips that row to active on already-provisioned tenants — same shape as R13 (A_Amortization).
 *
 * Assertions deliberately target only the parsed @check / @apply / @report bodies with comment
 * lines stripped — never the free-form header comment, which may be edited independently.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260923T120000Z__R40-internal-consumption-table-active.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
/** Drop `--` comment lines so only executable SQL is asserted on. */
const sqlOnly = (s) => norm((s ?? '').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'));
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report);

/** Blank single-quoted SQL string literals ('' escapes included) before scanning for keywords. */
const stripLiterals = (s) => s.replace(/'(?:[^']|'')*'/g, "''");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The three-part guard shared by @check and @apply (order-independent). */
const GUARD_PARTS = [
  'ad_client_id = :client_id',
  "ad_table_id = '800168'",
  "isactive IS DISTINCT FROM 'Y'",
];

describe('R40 internal-consumption table data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R40-internal-consumption-table-active');
    assert.equal(fix.gap, 'A4b');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a first-line description referencing the ticket', () => {
    assert.ok(fix.description);
    assert.match(fix.description, /ETP-5445/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report && fix.report.length > 0, '@report must be declared');
  });

  it('sorts after the latest R39 fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.equal(ts.toISOString(), '2026-09-23T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260922T130000Z__R39-document-sequence-clear-descriptions').getTime(),
      'must sort after R39-document-sequence-clear-descriptions',
    );
  });
});

describe('R40 internal-consumption table data-fix — @check and @apply share the same guard', () => {
  for (const part of GUARD_PARTS) {
    it(`@check filters on ${part}`, () => {
      assert.match(sqlCheck, new RegExp(esc(part)));
    });

    it(`@apply filters on ${part}`, () => {
      assert.match(sqlApply, new RegExp(esc(part)));
    });
  }

  it('both target c_acctschema_table', () => {
    assert.match(sqlCheck, /FROM c_acctschema_table\b/i);
    assert.match(sqlApply, /UPDATE c_acctschema_table\b/i);
  });

  it('never targets another AD table id', () => {
    const ids = [...sqlApply.matchAll(/ad_table_id = '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(ids)], ['800168']);
  });
});

describe('R40 internal-consumption table data-fix — @apply activates the row', () => {
  it('sets isactive to Y', () => {
    assert.match(sqlApply, /SET isactive = 'Y'/);
  });

  it('stamps updated/updatedby', () => {
    assert.match(sqlApply, /updated = now\(\)/);
    assert.match(sqlApply, /updatedby = '0'/);
  });

  it('is UPDATE-only — no INSERT and no DELETE', () => {
    assert.doesNotMatch(stripLiterals(sqlApply), /\bINSERT\b/i);
    assert.doesNotMatch(stripLiterals(sqlApply), /\bDELETE\b/i);
  });
});

describe('R40 internal-consumption table data-fix — tenant isolation', () => {
  it('scopes the @check to the client', () => {
    assert.match(sqlCheck, /ad_client_id = :client_id/);
  });

  it('scopes every @apply statement to the client', () => {
    const statements = sqlApply.split(';').filter((s) => s.trim().length > 0);
    assert.equal(statements.length, 1, 'a single guarded UPDATE');
    for (const statement of statements) {
      assert.match(statement, /ad_client_id = :client_id/);
    }
  });

  it('scopes the @report to the client', () => {
    assert.match(sqlReport, /ad_client_id = :client_id/);
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

describe('R40 internal-consumption table data-fix — @report', () => {
  it('is read-only', () => {
    assert.match(sqlReport, /^SELECT\b/i);
    assert.doesNotMatch(stripLiterals(sqlReport), /\b(UPDATE|INSERT|DELETE)\b/i);
  });

  it('re-asserts the inactive gate on the 800168 row, so a clean run reports nothing', () => {
    assert.match(sqlReport, /ad_table_id = '800168'/);
    assert.match(sqlReport, /isactive IS DISTINCT FROM 'Y'/);
  });

  it('also flags an accounting schema with no 800168 row at all', () => {
    assert.match(sqlReport, /LEFT JOIN c_acctschema_table/i);
    assert.match(sqlReport, /c_acctschema_table_id IS NULL/i);
  });
});
