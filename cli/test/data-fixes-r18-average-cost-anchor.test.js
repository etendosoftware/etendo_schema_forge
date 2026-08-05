import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix } from '../src/data-fixes/parse-fix.js';

/**
 * Regression guard for the R18 corrective data-fix
 * (20260803T140000Z__R18-stuck-average-cost-anchor.sql, ETP-4736, gap H3).
 *
 * This file was deliberately trimmed down from a broader "pin every clause
 * of the SQL text" suite (header metadata, tenant-isolation scoping, the
 * blocking-product predicate, the three-tier cost fallback, cost-org/
 * warehouse resolution — ~20 assertions across 6 describe blocks) to just
 * the one check below that has demonstrated real value.
 *
 * Reasoning: static regex/text assertions against raw SQL are a brittle,
 * low-signal substitute for the real verification this fix already went
 * through — a live-DB run exercising all 3 price tiers plus a real
 * committed apply + document post (see the SQL file's own DELIVERY NOTE
 * sections and docs/etendo-ad/tenant-remediation-knowledge.md, 2026-08-03
 * entries). Pinning things like COALESCE tier order, :client_id scoping, or
 * the AD_Reference 189 predicate here mostly just breaks on harmless
 * reformatting and duplicates what a human reviewer already checks when
 * reading the SQL diff.
 *
 * The one exception: this fix is coupled in a way that is NOT obvious from
 * reading the SQL casually and that already caused a real, confirmed bug.
 * The description-tagging UPDATE must key off `EXISTS (SELECT 1 FROM
 * seeded ...)` — the RETURNING set of the data-modifying CTE that performs
 * the INSERT — and must NOT re-derive its own separate `NOT EXISTS (SELECT
 * 1 FROM m_costing ...)` guard. Sentinel (QA) confirmed by temporarily
 * reintroducing the naive two-statement version (INSERT, then a separately
 * -guarded UPDATE) that this exact assertion fails: the re-derived guard
 * silently tags nothing on a real run, because the INSERT's own new rows
 * are already visible to a second guard evaluated in the same transaction.
 * That is the one structural trap a diff review can miss and a live-DB run
 * won't reliably catch either (it depends on transaction visibility
 * subtleties) — so it is the only thing this file still pins.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260803T140000Z__R18-stuck-average-cost-anchor.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normApply = norm(fix.apply);

describe('R18 data-fix — coupled INSERT/UPDATE via data-modifying CTE (regression guard)', () => {
  it('seeds M_Costing through a data-modifying CTE named "seeded" that RETURNS m_product_id', () => {
    assert.match(normApply, /seeded AS \( INSERT INTO m_costing/);
    assert.match(normApply, /RETURNING m_product_id \)/);
  });

  it('keys the description-tagging UPDATE off the seeded CTE, NOT a re-derived m_costing guard', () => {
    // The coupled UPDATE must reference `seeded` in its own WHERE clause...
    const updateClause = normApply.slice(normApply.indexOf('UPDATE m_product mp'));
    assert.match(updateClause, /EXISTS \( SELECT 1 FROM seeded s WHERE s\.m_product_id = f2\.m_product_id \)/);
    // ...and must NOT re-derive a second, independent NOT EXISTS(m_costing) guard on the
    // UPDATE itself — that was the exact bug the header's "Coupling & idempotency" note
    // documents as rejected (it silently tags nothing on a real run).
    assert.doesNotMatch(updateClause, /NOT EXISTS \(\s*SELECT 1 FROM m_costing/);
  });
});
