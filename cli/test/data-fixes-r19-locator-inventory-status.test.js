import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';
import { formatReportDetail } from '../src/data-fixes/run.js';

/**
 * Static + parse validation for the R19 corrective data-fix
 * (20260803T160000Z__R19-locator-inventory-status.sql, ETP-4761, gap I1).
 *
 * True row-level behavior (which locators actually flip, which get skipped and why) was verified
 * live in a rolled-back transaction against QA Testing (26 status-0 locators: 23 flipped, 3 skipped
 * for negative stock, 445 report rows) and GOClient (1 status-0 locator: flipped, 0 report rows) —
 * see docs/etendo-ad/tenant-remediation-knowledge.md for the recorded evidence. What this file
 * verifies deterministically without a DB: header metadata, tenant isolation, the negative-stock
 * guard shape, the @report section's existence and wiring, and that formatReportDetail (the runner
 * helper that turns @report rows into the ledger `detail`) behaves as the fix's design requires.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260803T160000Z__R19-locator-inventory-status.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report);

describe('R19 data-fix — header metadata', () => {
  it('parses with the expected id and a new gap-label series (I1)', () => {
    assert.equal(fix.id, 'R19-locator-inventory-status');
    assert.equal(fix.gap, 'I1');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a non-empty description header', () => {
    // The parser only captures the first physical line of a multi-line "-- @description:" header
    // (continuation lines have no "-- @key:" marker, so they are ignored as free header comments —
    // see parse-fix.js). Assert against that first-line content only.
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Undefined-OverIssue/i);
  });

  it('documents the negative-stock business rule and the report mechanism in the file background', () => {
    assert.match(rawText, /Undefined-OverIssue/);
    assert.match(rawText, /negative/i);
    assert.match(rawText, /Available/);
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
    assert.equal(ts.toISOString(), '2026-08-03T16:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260727T114306Z__prev').getTime());
  });
});

describe('R19 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes @check to :client_id', () => {
    assert.match(normCheck, /l\.ad_client_id = :client_id/);
  });

  it('scopes @apply to :client_id', () => {
    assert.match(normApply, /l\.ad_client_id = :client_id/);
  });

  it('scopes @report to :client_id', () => {
    assert.match(normReport, /l\.ad_client_id = :client_id/);
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
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE m_locator' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R19 data-fix — @check (needs it / does not need it)', () => {
  it('fires on any active status-0 locator, regardless of whether it is flippable', () => {
    // Deliberately broad: the check must not itself exclude negative-stock locators, so a tenant
    // whose gap is present but every candidate is blocked by negative stock is still detected
    // (and reported) rather than silently skipped as "not needed".
    assert.match(normCheck, /l\.isactive = 'Y'/);
    assert.match(normCheck, /l\.m_inventorystatus_id = '0'/);
    assert.doesNotMatch(normCheck, /qtyonhand/);
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });
});

describe('R19 data-fix — @apply (the negative-stock guard, AC: never flip a locator with negative stock)', () => {
  it('runs exactly one UPDATE on m_locator', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+m_locator\b/gi) || []).length;
    assert.equal(updates, 1);
  });

  it('sets the target status to Available (id 2)', () => {
    assert.match(normApply, /SET m_inventorystatus_id = '2'/);
  });

  it('is guarded so a re-run of the same predicate matches 0 rows (idempotent)', () => {
    assert.match(normApply, /l\.m_inventorystatus_id = '0'/);
  });

  it('never touches a locator with any negative on-hand stock row', () => {
    assert.match(
      normApply,
      /NOT EXISTS \( SELECT 1 FROM m_storage_detail sd WHERE sd\.m_locator_id = l\.m_locator_id AND sd\.qtyonhand < 0 \)/,
    );
  });

  it('stamps updated/updatedby audit columns', () => {
    assert.match(normApply, /updated = now\(\)/);
    assert.match(normApply, /updatedby = '0'/);
  });
});

describe('R19 data-fix — @report (surfacing skipped locators for manual correction)', () => {
  it('is a read-only SELECT (no INSERT/UPDATE/DELETE)', () => {
    assert.doesNotMatch(normReport, /\b(INSERT|UPDATE|DELETE)\b/i);
    assert.match(normReport, /\bSELECT\b/i);
  });

  it('only reports locators still at status 0 with negative stock (the ones @apply skipped)', () => {
    assert.match(normReport, /l\.m_inventorystatus_id = '0'/);
    assert.match(normReport, /sd\.qtyonhand < 0/);
  });

  it('identifies the product+attribute+UOM+locator combination needed for manual correction', () => {
    assert.match(normReport, /l\.value AS locator/);
    assert.match(normReport, /p\.(?:value|name) AS product_(?:code|name)/);
    assert.match(normReport, /m_attributesetinstance/);
    assert.match(normReport, /c_uom/i);
    assert.match(normReport, /sd\.qtyonhand/);
  });
});

describe('R19 data-fix — formatReportDetail integration (runner side of the @report contract)', () => {
  it('formats a realistic @report row set the way an operator would read it', () => {
    const rows = [
      { locator: 'L03', product_code: 'FGA', product_name: 'Final good A', attribute: 'L894', uom: 'Bag', qtyonhand: -2 },
      { locator: 'T02', product_code: 'INV1', product_name: 'InvoiceFromShipment_001-4', attribute: 'no attribute', uom: 'Unit', qtyonhand: -12 },
    ];
    const detail = formatReportDetail(rows);
    assert.match(detail, /^2 row\(s\) need manual attention:/);
    assert.match(detail, /locator=L03/);
    assert.match(detail, /qtyonhand=-12/);
  });

  it('returns null when every status-0 locator on the tenant was flippable (nothing to report)', () => {
    assert.equal(formatReportDetail([]), null);
  });
});
