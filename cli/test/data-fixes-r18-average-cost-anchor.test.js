import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R18 corrective data-fix
 * (20260803T140000Z__R18-stuck-average-cost-anchor.sql, ETP-4736, gap H1).
 *
 * Like R14 (data-fixes-r14-multicurrency.test.js), this fix's true row-level
 * behavior can only be verified end-to-end against a live Postgres tenant —
 * and it already was, twice (a rolled-back transaction exercising all 3 price
 * tiers, and a real committed apply against a genuinely reproduced stuck
 * product, followed by a real document post with real fact_acct entries; see
 * the SQL file's own DELIVERY NOTE sections and docs/etendo-ad/
 * tenant-remediation-knowledge.md, 2026-08-03 entries).
 *
 * What a DB run does NOT protect against is a future *structural* regression
 * that a diff review alone might miss — this fix is unusually fragile in one
 * specific way that already bit the first draft (see the SQL header's
 * "Coupling & idempotency" note): the tier-tagging UPDATE is coupled to the
 * seeding INSERT via a data-modifying CTE's RETURNING set, NOT a
 * re-derived NOT EXISTS guard, because the naive two-statement version
 * silently tags nothing (the INSERT's own rows are already visible to a
 * second guard in the same transaction). These assertions pin that
 * structure, the tenant scope, the tier fallback order, and the other
 * documented invariants so a future edit that reintroduces the two-statement
 * bug (or drops a :client_id scope, or breaks the movementqty<0 filter)
 * fails fast here instead of silently shipping.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260803T140000Z__R18-stuck-average-cost-anchor.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R18 data-fix — header metadata', () => {
  it('parses with the expected id, gap and risk', () => {
    assert.equal(fix.id, 'R18-stuck-average-cost-anchor');
    assert.equal(fix.gap, 'H1');
    assert.equal(fix.risk, 'high');
    assert.equal(fix.type, 'sql');
  });

  it('has a description that mentions the average-cost anchor', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /average-cost|m_costing/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the last pre-existing fix (R16)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-03T14:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260727T114306Z__R16-tenant-roles-and-webhook-access').getTime(),
    );
  });
});

describe('R18 data-fix — tenant isolation (every correlated query scoped to :client_id)', () => {
  it('scopes @check to :client_id', () => {
    assert.match(normCheck, /t\.ad_client_id = :client_id/);
  });

  it('scopes the @apply blocking_products CTE to :client_id', () => {
    assert.match(normApply, /t\.ad_client_id = :client_id/);
  });

  it('scopes every price-list lookup subquery to :client_id', () => {
    const occurrences = (fix.apply.match(/pl\.ad_client_id = :client_id/g) || []).length;
    // purchase_price, purchase_currency, sales_price, sales_currency — 4 correlated subqueries.
    assert.equal(occurrences, 4, `expected 4 price-list :client_id scopes, found ${occurrences}`);
  });

  it('scopes the warehouse-dimension rule lookup to :client_id', () => {
    assert.match(normApply, /cr\.ad_client_id = :client_id/);
  });

  it('scopes the seeding INSERT and the coupled UPDATE to :client_id', () => {
    assert.match(normApply, /INSERT INTO m_costing \(/);
    assert.match(normApply, /get_uuid\(\), :client_id,/);
    assert.match(normApply, /mp\.ad_client_id = :client_id/);
  });
});

describe('R18 data-fix — blocking-product predicate (shared shape between @check and @apply)', () => {
  it('requires zero prior M_Costing history for the product (idempotency gate)', () => {
    assert.match(normCheck, /NOT EXISTS \(.*FROM m_costing c.*WHERE c\.m_product_id = t\.m_product_id/);
    assert.match(normApply, /NOT EXISTS \(.*FROM m_costing c.*WHERE c\.m_product_id = t\.m_product_id/);
  });

  it('restricts to stocked, itemized products only', () => {
    for (const sql of [normCheck, normApply]) {
      assert.match(sql, /p\.producttype = 'I'/);
      assert.match(sql, /p\.isstocked = 'Y'/);
    }
  });

  it('restricts the movement type to the outbound reference list (AD_Reference 189)', () => {
    for (const sql of [normCheck, normApply]) {
      assert.match(sql, /ad_ref_list rl/);
      assert.match(sql, /rl\.ad_reference_id = '189'/);
      assert.match(sql, /rl\.value = t\.movementtype/);
    }
  });

  it('picks the earliest-by-TrxProcessDate transaction per product (never MovementDate)', () => {
    for (const sql of [normCheck, normApply]) {
      assert.match(sql, /DISTINCT ON \(t\.m_product_id\)/);
      assert.match(sql, /ORDER BY t\.m_product_id, t\.trxprocessdate ASC/);
    }
  });

  it('filters the blocking transaction to a strictly negative quantity (outbound)', () => {
    assert.match(normCheck, /WHERE bp\.movementqty < 0/);
    assert.match(normApply, /WHERE f\.movementqty < 0/);
  });
});

describe('R18 data-fix — three-tier cost fallback (purchase -> sales -> 0)', () => {
  it('resolves unit_cost via COALESCE in exactly that order', () => {
    assert.match(normApply, /COALESCE\(r\.purchase_price, r\.sales_price, 0\) AS unit_cost/);
  });

  it('tags cost_source matching the same tier precedence', () => {
    assert.match(
      normApply,
      /CASE WHEN r\.purchase_price IS NOT NULL THEN 'purchase' WHEN r\.sales_price IS NOT NULL THEN 'sales' ELSE 'nothing' END AS cost_source/,
    );
  });

  it('falls back the seeded currency to the System-owned \'100\' only for tier 3', () => {
    assert.match(
      normApply,
      /CASE WHEN r\.purchase_price IS NOT NULL THEN r\.purchase_currency WHEN r\.sales_price IS NOT NULL THEN r\.sales_currency.*ELSE '100' END AS cost_currency_id/,
    );
  });

  it('every price-list lookup excludes SO-only lists from the purchase tier and vice versa', () => {
    // 2 purchase lookups (price + currency) require issopricelist = 'N'; 2 sales lookups require 'Y'.
    const purchaseGuards = (fix.apply.match(/pl\.issopricelist = 'N'/g) || []).length;
    const salesGuards = (fix.apply.match(/pl\.issopricelist = 'Y'/g) || []).length;
    assert.equal(purchaseGuards, 2);
    assert.equal(salesGuards, 2);
  });
});

describe('R18 data-fix — cost-org and warehouse-dimension resolution', () => {
  it('routes production-flagged products to the System org (cost_org_id = 0)', () => {
    assert.match(normApply, /WHEN r\.is_production = 'Y' THEN '0'/);
  });

  it('otherwise prefers the denormalized legal-entity org, falling back to the transaction org', () => {
    assert.match(
      normApply,
      /WHEN r\.ad_legalentity_org_id IS NOT NULL THEN r\.ad_legalentity_org_id ELSE r\.org_self END AS cost_org_id/,
    );
  });

  it('only writes the transaction warehouse onto the seeded row when a validated warehouse-dimension rule applies', () => {
    assert.match(normApply, /CASE WHEN f2\.uses_warehouse_dimension THEN f2\.trx_warehouse_id ELSE NULL END/);
    assert.match(normApply, /cr\.warehouse_dimension = 'Y'/);
    assert.match(normApply, /cr\.isvalidated = 'Y'/);
  });
});

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

  it('the seeding INSERT keeps its own defensive NOT EXISTS(m_costing) guard (belt-and-suspenders)', () => {
    const insertClause = normApply.slice(normApply.indexOf('seeded AS'), normApply.indexOf('RETURNING m_product_id'));
    assert.match(insertClause, /NOT EXISTS \(.*SELECT 1 FROM m_costing c2/);
  });

  it('appends the tier tag to M_Product.Description without a leading space when the prior description is empty', () => {
    assert.match(
      normApply,
      /COALESCE\(mp\.description, ''\) \|\| CASE WHEN COALESCE\(mp\.description, ''\) = '' THEN '' ELSE ' ' END/,
    );
  });

  it('every seeded row is flagged ISMANUAL and carries a real M_Transaction_ID back-reference', () => {
    assert.match(normApply, /'AVA', 'Y', f2\.unit_cost/);
    assert.match(normApply, /f2\.m_transaction_id, f2\.cost_currency_id/);
  });
});
