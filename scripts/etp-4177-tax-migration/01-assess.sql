-- ============================================================================
-- ETP-4177 — Tax-to-System migration : PHASE 0  (READ-ONLY ASSESSMENT)
-- ============================================================================
-- Purpose
--   The Spanish fiscal taxes were promoted IN PLACE in GOClient (same c_tax_id,
--   ad_client_id changed to '0'). Other clients carry their OWN client-level
--   copies (different IDs). This script builds the old->system mapping by
--   natural key and reports exactly what a remap would touch, WITHOUT changing
--   any data.
--
-- What it does
--   * builds two work tables:  etp4177_taxcat_map, etp4177_tax_map
--   * classifies every non-system tax/category as AUTO (exact system twin) or
--     REVIEW (no twin — US sales tax, test data, summary-rate mismatch, custom)
--   * reports downstream usage so REVIEW rows can be triaged before anything
--     destructive runs.
--
-- Safe to run repeatedly. Creates only etp4177_* tables. Touches nothing else.
--
-- Matching key
--   tax:      (name, rate, sopotype)   -- verified unique within system set
--   category: (name)
--
-- Usage
--   psql -h <host> -p <port> -U <user> -d <staging_db> -f 01-assess.sql
-- ============================================================================

\set ON_ERROR_STOP on
\timing on

-- ---------------------------------------------------------------------------
-- 0. Guard: confirm a system-level tax set actually exists
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM c_tax WHERE ad_client_id = '0';
  IF n = 0 THEN
    RAISE EXCEPTION 'No system-level taxes (ad_client_id=0) found. Apply the dataset first.';
  END IF;
  RAISE NOTICE 'System-level taxes present: %', n;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tax-category mapping  (client category -> system category, by name)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS etp4177_taxcat_map;
CREATE TABLE etp4177_taxcat_map AS
SELECT
  cc.ad_client_id,
  cl.name                       AS client_name,
  cc.c_taxcategory_id           AS old_taxcat_id,
  cc.name                       AS taxcat_name,
  s.c_taxcategory_id            AS system_taxcat_id,
  CASE WHEN s.c_taxcategory_id IS NOT NULL THEN 'AUTO' ELSE 'REVIEW' END AS status
FROM c_taxcategory cc
JOIN ad_client cl ON cl.ad_client_id = cc.ad_client_id
LEFT JOIN c_taxcategory s
       ON s.ad_client_id = '0' AND s.name = cc.name
WHERE cc.ad_client_id <> '0';

-- ---------------------------------------------------------------------------
-- 2. Tax mapping  (client tax -> system tax, by name+rate+sopotype)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS etp4177_tax_map;
CREATE TABLE etp4177_tax_map AS
SELECT
  ct.ad_client_id,
  cl.name                AS client_name,
  ct.c_tax_id            AS old_tax_id,
  ct.name                AS tax_name,
  ct.rate,
  ct.sopotype,
  ct.issummary,
  s.c_tax_id             AS system_tax_id,
  CASE WHEN s.c_tax_id IS NOT NULL THEN 'AUTO' ELSE 'REVIEW' END AS status,
  -- downstream usage (drives triage of REVIEW rows)
  (SELECT count(*) FROM c_invoiceline    x WHERE x.c_tax_id = ct.c_tax_id) AS inv_lines,
  (SELECT count(*) FROM c_orderline      x WHERE x.c_tax_id = ct.c_tax_id) AS ord_lines,
  (SELECT count(*) FROM c_invoicetax     x WHERE x.c_tax_id = ct.c_tax_id) AS inv_tax,
  (SELECT count(*) FROM c_ordertax       x WHERE x.c_tax_id = ct.c_tax_id) AS ord_tax,
  (SELECT count(*) FROM c_invoicelinetax x WHERE x.c_tax_id = ct.c_tax_id) AS inv_line_tax,
  (SELECT count(*) FROM c_orderlinetax   x WHERE x.c_tax_id = ct.c_tax_id) AS ord_line_tax,
  (SELECT count(*) FROM fact_acct        x WHERE x.c_tax_id = ct.c_tax_id) AS fact_acct,
  (SELECT count(*) FROM gl_journalline   x WHERE x.c_tax_id = ct.c_tax_id) AS gl_journal,
  (SELECT count(*) FROM c_tax_acct       x WHERE x.c_tax_id = ct.c_tax_id) AS tax_acct,
  (SELECT count(*) FROM obtl_tax_parameter x WHERE x.c_tax_id = ct.c_tax_id) AS obtl_param,
  (SELECT count(*) FROM c_projectline    x WHERE x.c_tax_id = ct.c_tax_id) AS project_lines
FROM c_tax ct
JOIN ad_client cl ON cl.ad_client_id = ct.ad_client_id
LEFT JOIN c_tax s
       ON s.ad_client_id = '0'
      AND s.name     = ct.name
      AND s.rate     = ct.rate
      AND s.sopotype = ct.sopotype
WHERE ct.ad_client_id <> '0';

-- a tax is "blocked" if it is REVIEW (no system twin) but still referenced by
-- documents/accounting — it cannot be auto-migrated nor safely deleted.
ALTER TABLE etp4177_tax_map ADD COLUMN total_refs bigint;
UPDATE etp4177_tax_map
   SET total_refs = inv_lines+ord_lines+inv_tax+ord_tax+inv_line_tax+ord_line_tax
                   +fact_acct+gl_journal+tax_acct+obtl_param+project_lines;

-- ===========================================================================
-- REPORTS
-- ===========================================================================
\echo ''
\echo '======================================================================'
\echo ' 1) TAX MAPPING SUMMARY  (per client)'
\echo '======================================================================'
SELECT client_name,
       count(*)                              AS client_taxes,
       count(*) FILTER (WHERE status='AUTO')   AS auto_mapped,
       count(*) FILTER (WHERE status='REVIEW') AS review,
       count(*) FILTER (WHERE status='REVIEW' AND total_refs>0) AS review_but_used
FROM etp4177_tax_map
GROUP BY client_name ORDER BY client_name;

\echo ''
\echo '======================================================================'
\echo ' 2) AUTO-MAPPED taxes that ARE used (the remap workload, by volume)'
\echo '======================================================================'
SELECT client_name, tax_name, rate, sopotype,
       inv_lines, ord_lines, fact_acct, tax_acct, obtl_param
FROM etp4177_tax_map
WHERE status='AUTO' AND total_refs>0
ORDER BY (inv_lines+ord_lines+fact_acct) DESC, client_name, tax_name;

\echo ''
\echo '======================================================================'
\echo ' 3) REVIEW + USED  (BLOCKERS — no system twin but referenced)'
\echo '    => decide: keep client-level, or provide a manual mapping'
\echo '======================================================================'
SELECT client_name, tax_name, rate, sopotype, issummary,
       inv_lines, ord_lines, fact_acct, total_refs
FROM etp4177_tax_map
WHERE status='REVIEW' AND total_refs>0
ORDER BY total_refs DESC, client_name, tax_name;

\echo ''
\echo '======================================================================'
\echo ' 4) REVIEW + UNUSED  (safe to leave or deactivate — no documents)'
\echo '======================================================================'
SELECT client_name, count(*) AS review_unused
FROM etp4177_tax_map
WHERE status='REVIEW' AND total_refs=0
GROUP BY client_name ORDER BY client_name;

\echo ''
\echo '======================================================================'
\echo ' 5) TAX-CATEGORY MAPPING SUMMARY (categories feed m_product, c_charge…)'
\echo '======================================================================'
SELECT client_name,
       count(*)                                AS client_cats,
       count(*) FILTER (WHERE status='AUTO')     AS auto_mapped,
       count(*) FILTER (WHERE status='REVIEW')   AS review
FROM etp4177_taxcat_map
GROUP BY client_name ORDER BY client_name;

\echo ''
\echo '======================================================================'
\echo ' 6) MASTER-DATA referencing REVIEW categories (would be orphaned)'
\echo '======================================================================'
SELECT m.client_name, m.taxcat_name,
  (SELECT count(*) FROM m_product   p WHERE p.c_taxcategory_id=m.old_taxcat_id) AS products,
  (SELECT count(*) FROM c_charge    c WHERE c.c_taxcategory_id=m.old_taxcat_id) AS charges,
  (SELECT count(*) FROM c_glitem    g WHERE g.c_taxcategory_id=m.old_taxcat_id) AS glitems
FROM etp4177_taxcat_map m
WHERE m.status='REVIEW'
ORDER BY products DESC, m.client_name;

\echo ''
\echo '======================================================================'
\echo ' 7) CLIENT-LEVEL obtl_tax_parameter (303/349) — should be 0'
\echo '    Rows on AUTO taxes are DELETED by the migration (system config'
\echo '    already maps the system tax to the report box). Rows on REVIEW'
\echo '    taxes stay. Any rows here = real 2.b work on this environment.'
\echo '======================================================================'
SELECT cl.name AS client_name,
       count(*) FILTER (WHERE map.status='AUTO')   AS on_auto_taxes_to_delete,
       count(*) FILTER (WHERE map.status='REVIEW') AS on_review_taxes_kept,
       count(*) FILTER (WHERE map.status IS NULL)  AS on_other_taxes
FROM obtl_tax_parameter p
JOIN ad_client cl ON cl.ad_client_id = p.ad_client_id
LEFT JOIN etp4177_tax_map map ON map.old_tax_id = p.c_tax_id
WHERE p.ad_client_id <> '0'
GROUP BY cl.name ORDER BY cl.name;

\echo ''
\echo 'Assessment complete. Work tables: etp4177_tax_map, etp4177_taxcat_map'
\echo 'Review report #3 (BLOCKERS) before running the destructive phase.'
