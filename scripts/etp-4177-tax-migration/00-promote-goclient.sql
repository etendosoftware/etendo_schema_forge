-- ============================================================================
-- ETP-4177 — Tax-to-System migration : STEP 0  (PROMOTE GOClient -> SYSTEM)
-- ============================================================================
-- In existing environments (Experimental, Staging) GOClient holds the Spanish
-- fiscal dataset at client level. The correct first step is to PROMOTE that
-- data to system level (ad_client_id='0', ad_org_id='0') IN PLACE — keeping the
-- same primary keys — so:
--   * GOClient's own documents keep resolving (same c_tax_id, now system),
--   * other tenants' redundant copies can then be consolidated onto it
--     (02-migrate.sql).
--
-- This mirrors what com.etendoerp.go.localization.es.data ships for a fresh
-- install; here we apply it to a DB that already has the GOClient data.
--
-- Tables promoted (the dataset's 10):
--   c_taxcategory, c_taxcategory_trl, c_tax, c_tax_trl, c_tax_zone,
--   obtl_tributarykey, obtl_tax_report, obtl_tax_report_group,
--   obtl_tax_report_parameter, obtl_tax_parameter
--
-- Keeping IDs means every FK (self-refs, trl, zone, obtl links, and client
-- documents) stays valid throughout — FKs check the key exists, not its
-- client/org.
--
-- Safety: single transaction; Etendo triggers disabled; dry-run (ROLLBACK) by
-- default, COMMIT only with -v do_commit=1.
--
--   psql ... -f 00-promote-goclient.sql                 # dry run
--   psql ... -v do_commit=1 -f 00-promote-goclient.sql  # apply
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?do_commit} \else \set do_commit 0 \endif
\timing on

BEGIN;

-- Guard: resolve GOClient by name, confirm it has taxes and system is empty.
DO $$
DECLARE v_go varchar(32); n int;
BEGIN
  SELECT ad_client_id INTO v_go FROM ad_client WHERE name = 'GOClient';
  IF v_go IS NULL THEN RAISE EXCEPTION 'Client named GOClient not found.'; END IF;

  SELECT count(*) INTO n FROM c_tax WHERE ad_client_id = v_go;
  RAISE NOTICE 'GOClient (%): % client-level taxes to promote.', v_go, n;
  IF n = 0 THEN RAISE EXCEPTION 'GOClient has no client-level taxes — nothing to promote.'; END IF;

  SELECT count(*) INTO n FROM c_tax WHERE ad_client_id = '0';
  IF n > 0 THEN
    RAISE EXCEPTION 'System already has % taxes at client 0 — promotion already done?', n;
  END IF;
END $$;

-- Disable Etendo triggers (audit + verifactu rate-change guard) --------------
SELECT ad_disable_triggers();

-- Promote: client + org -> system ('0','0'), keeping primary keys ------------
-- GOClient resolved by name in each statement (portable across environments).
UPDATE c_taxcategory             x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE c_taxcategory_trl         x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE c_tax                     x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE c_tax_trl                 x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE c_tax_zone                x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE obtl_tributarykey         x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE obtl_tax_report           x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE obtl_tax_report_group     x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE obtl_tax_report_parameter x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;
UPDATE obtl_tax_parameter        x SET ad_client_id='0', ad_org_id='0' FROM ad_client c WHERE c.name='GOClient' AND x.ad_client_id=c.ad_client_id;

-- Strip the business-partner tax category to match the published dataset -------
-- The dataset's FinancialMgmtTaxRate has NO businessPartnerTaxCategory element,
-- so dataset taxes carry c_bp_taxcategory_id = NULL. GOClient's rows still point
-- at client-level c_bp_taxcategory records; once promoted to client 0 that would
-- be an invalid system->client reference. Null it to stay faithful to the dataset.
UPDATE c_tax SET c_bp_taxcategory_id = NULL
WHERE ad_client_id='0' AND c_bp_taxcategory_id IS NOT NULL;

SELECT ad_enable_triggers();

-- Report ---------------------------------------------------------------------
\echo ''
\echo 'System-level dataset after promotion (ad_client_id=0):'
SELECT 'c_taxcategory' tbl, count(*) FROM c_taxcategory WHERE ad_client_id='0'
UNION ALL SELECT 'c_tax',      count(*) FROM c_tax       WHERE ad_client_id='0'
UNION ALL SELECT 'c_tax_trl',  count(*) FROM c_tax_trl   WHERE ad_client_id='0'
UNION ALL SELECT 'c_tax_zone', count(*) FROM c_tax_zone  WHERE ad_client_id='0'
ORDER BY tbl;

\echo ''
\echo 'GOClient client-level taxes remaining (should be 0):'
SELECT count(*) FROM c_tax t JOIN ad_client c ON c.ad_client_id=t.ad_client_id WHERE c.name='GOClient';

\echo ''
\echo 'System taxes still carrying c_bp_taxcategory_id (should be 0 — faithful to dataset):'
SELECT count(*) FROM c_tax WHERE ad_client_id='0' AND c_bp_taxcategory_id IS NOT NULL;

\if :do_commit
  \echo '>>> do_commit=1 : COMMITTING promotion.'
  COMMIT;
\else
  \echo '>>> dry run : ROLLING BACK. Re-run with -v do_commit=1 to apply.'
  ROLLBACK;
\endif
