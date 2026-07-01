-- ============================================================================
-- ETP-4177 — Tax-to-System migration : PHASE 1  (DESTRUCTIVE REMAP + DELETE)
-- ============================================================================
-- Prerequisite : 01-assess.sql has been run (etp4177_tax_map / etp4177_taxcat_map
--                exist) and report #3 (BLOCKERS) has been reviewed.
--
-- Policy (decided ETP-4177): FULL remap — re-point c_tax_id on ALL references
-- including posted documents, fact_acct, gl_journalline and VAT books, so the
-- old client taxes become fully unreferenced and are then deleted.
--
-- Scope : only taxes/categories flagged status='AUTO' (exact system twin).
--         REVIEW taxes (US sales taxes, QA test data, unmatched summary taxes)
--         and their categories are LEFT client-level, untouched.
--
-- Safety:
--   * runs inside a single transaction (all-or-nothing)
--   * COMMITs only when invoked with  -v do_commit=1 ; otherwise ROLLBACK
--   * FK constraints are the final backstop: any missed reference makes the
--     DELETE fail and rolls the whole thing back.
--
-- Dry run (rolls back, prints row counts):
--   psql ... -f 02-migrate.sql
-- Real run:
--   psql ... -v do_commit=1 -f 02-migrate.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?do_commit} \else \set do_commit 0 \endif
\timing on

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: mapping tables must exist and contain AUTO rows
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.etp4177_tax_map') IS NULL
     OR to_regclass('public.etp4177_taxcat_map') IS NULL THEN
    RAISE EXCEPTION 'Run 01-assess.sql first (mapping tables missing).';
  END IF;
  SELECT count(*) INTO n FROM etp4177_tax_map WHERE status='AUTO';
  RAISE NOTICE 'AUTO-mapped taxes to migrate: %', n;
  IF n = 0 THEN RAISE EXCEPTION 'Nothing AUTO-mapped — aborting.'; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Disable Etendo document-protection triggers for this session.
-- The protection trigger c_invline_chk_restrictions_trg blocks changing
-- C_TAX_ID on posted/processed documents (@20501@). Re-pointing to the
-- identical promoted system tax (same name/rate) does not change any amount,
-- so bypassing the guard is correct here. Re-enabled before COMMIT/ROLLBACK.
-- ---------------------------------------------------------------------------
SELECT ad_disable_triggers();

-- ===========================================================================
-- PHASE A — Tax-CATEGORY master-data remap (AUTO categories -> system)
--   Categories drive product/charge/GL classification. Re-point the masters
--   so they share the system category; the client category is deleted later
--   only if it ends up unreferenced.
-- ===========================================================================
UPDATE m_product p              SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE p.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';
UPDATE m_product_servicelinked p SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE p.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';
UPDATE c_charge c               SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE c.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';
UPDATE c_glitem g               SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE g.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';
UPDATE s_expensetype  s         SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE s.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';
UPDATE s_resourcetype s         SET c_taxcategory_id = m.system_taxcat_id
  FROM etp4177_taxcat_map m WHERE s.c_taxcategory_id = m.old_taxcat_id AND m.status='AUTO';

-- ===========================================================================
-- PHASE B — TAX reference remap (AUTO taxes -> system), all FK tables
-- ===========================================================================
-- B1. Transactional documents -------------------------------------------------
UPDATE c_invoiceline    x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_invoicetax     x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_invoicelinetax x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_orderline      x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_ordertax       x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_orderlinetax   x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_projectline    x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';

-- B2. Accounting (posted) -----------------------------------------------------
UPDATE fact_acct        x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE gl_journalline   x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';

-- B3. Spanish VAT books / tax register ----------------------------------------
UPDATE c_taxregisterline        x SET c_tax_id    = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id   =m.old_tax_id AND m.status='AUTO';
UPDATE c_taxregister_type_lines x SET c_tax_id    = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id   =m.old_tax_id AND m.status='AUTO';
UPDATE c_tax_report             x SET c_tax_id    = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id   =m.old_tax_id AND m.status='AUTO';
UPDATE obirb_invbookline        x SET c_tax_id_vat= m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id_vat=m.old_tax_id AND m.status='AUTO';
UPDATE obirb_invbookline        x SET c_tax_id_ec = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id_ec =m.old_tax_id AND m.status='AUTO';
UPDATE obirb_invbooktax_setup   x SET c_tax_id    = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id   =m.old_tax_id AND m.status='AUTO';
UPDATE obcvat_manualsettlementline x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id   =m.old_tax_id AND m.status='AUTO';

-- B4. OBTL 303/349 -------------------------------------------------------------
--     A client-level obtl_tax_parameter row maps a CLIENT tax to a 303/349 box.
--     The system dataset already maps the SYSTEM tax to that box (at client 0),
--     and that config is shared by all clients. Re-pointing the client row to
--     the system tax would create a DUPLICATE link (client-0 + client) and risk
--     double-counting in the report. So DELETE client-level rows for AUTO taxes
--     instead — the system config covers them once their docs use system taxes.
--     (In testendo there are 0 such rows; only matters on real staging.)
DELETE FROM obtl_tax_parameter x
 USING etp4177_tax_map m
 WHERE x.c_tax_id = m.old_tax_id AND m.status='AUTO' AND x.ad_client_id <> '0';

-- B5. Configuration / master ---------------------------------------------------
UPDATE ad_orginfo       x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_bp_withholding x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';
UPDATE c_glitem         x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';

-- B6. Accounting config: re-point c_tax_acct to the system tax (your step 2.c)
--     1:1 mapping guarantees no (c_tax_id,c_acctschema_id) collision.
UPDATE c_tax_acct       x SET c_tax_id = m.system_tax_id FROM etp4177_tax_map m WHERE x.c_tax_id=m.old_tax_id AND m.status='AUTO';

-- ===========================================================================
-- PHASE C — Self-reference fixups on REMAINING (REVIEW) client taxes that
--           pointed at an AUTO tax as parent / tax-base (about to be deleted).
-- ===========================================================================
UPDATE c_tax t SET parent_tax_id = m.system_tax_id
  FROM etp4177_tax_map m WHERE t.parent_tax_id = m.old_tax_id AND m.status='AUTO' AND t.ad_client_id <> '0';
UPDATE c_tax t SET c_taxbase_id  = m.system_tax_id
  FROM etp4177_tax_map m WHERE t.c_taxbase_id  = m.old_tax_id AND m.status='AUTO' AND t.ad_client_id <> '0';

-- ===========================================================================
-- PHASE D — Verify no document/accounting reference to AUTO old taxes remains
--           (trl/zone are tax-owned children, deleted next; not checked here)
-- ===========================================================================
DO $$
DECLARE leftover bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM c_invoiceline    x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
   +(SELECT count(*) FROM c_orderline      x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
   +(SELECT count(*) FROM c_invoicetax     x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
   +(SELECT count(*) FROM c_ordertax       x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
   +(SELECT count(*) FROM fact_acct        x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
   +(SELECT count(*) FROM c_tax_acct       x JOIN etp4177_tax_map m ON x.c_tax_id=m.old_tax_id AND m.status='AUTO')
    INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'Verification failed: % document/accounting refs to AUTO taxes remain.', leftover;
  END IF;
  RAISE NOTICE 'Verification OK — no remaining document/accounting refs to AUTO taxes.';
END $$;

-- ===========================================================================
-- PHASE E — Safe-delete the now-orphaned AUTO client taxes (your step 2.d)
--           children first (trl, zone), then the tax row.
-- ===========================================================================
DELETE FROM c_tax_trl  WHERE c_tax_id IN (SELECT old_tax_id FROM etp4177_tax_map WHERE status='AUTO');
DELETE FROM c_tax_zone WHERE c_tax_id IN (SELECT old_tax_id FROM etp4177_tax_map WHERE status='AUTO');
DELETE FROM c_tax      WHERE c_tax_id IN (SELECT old_tax_id FROM etp4177_tax_map WHERE status='AUTO');

-- ===========================================================================
-- PHASE F — Delete AUTO client categories that are now fully unreferenced.
--           Guarded: skipped if any tax/product/charge/glitem still points at
--           them (e.g. a REVIEW US tax sharing the category).
-- ===========================================================================
DELETE FROM c_taxcategory_trl tr
 WHERE tr.c_taxcategory_id IN (SELECT old_taxcat_id FROM etp4177_taxcat_map WHERE status='AUTO')
   AND NOT EXISTS (SELECT 1 FROM c_tax     t WHERE t.c_taxcategory_id = tr.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM m_product p WHERE p.c_taxcategory_id = tr.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM c_charge  c WHERE c.c_taxcategory_id = tr.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM c_glitem  g WHERE g.c_taxcategory_id = tr.c_taxcategory_id);

DELETE FROM c_taxcategory cc
 WHERE cc.c_taxcategory_id IN (SELECT old_taxcat_id FROM etp4177_taxcat_map WHERE status='AUTO')
   AND NOT EXISTS (SELECT 1 FROM c_tax     t WHERE t.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM m_product p WHERE p.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM m_product_servicelinked p WHERE p.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM c_charge  c WHERE c.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM c_glitem  g WHERE g.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM s_expensetype  s WHERE s.c_taxcategory_id = cc.c_taxcategory_id)
   AND NOT EXISTS (SELECT 1 FROM s_resourcetype s WHERE s.c_taxcategory_id = cc.c_taxcategory_id);

-- ---------------------------------------------------------------------------
-- Re-enable Etendo triggers.
-- ---------------------------------------------------------------------------
SELECT ad_enable_triggers();

-- ===========================================================================
-- PHASE G — Post-cleanup flag fix
--           'Entregas IVA 21%' at system level must be the default tax for
--           standard Spanish VAT flows. The flag was not preserved when the
--           GOClient tax was promoted; set it explicitly here.
-- ===========================================================================
UPDATE c_tax
   SET isdefault = 'Y'
 WHERE ad_client_id = '0'
   AND name = 'Entregas IVA 21%'
   AND isdefault = 'N';
\echo 'Phase G: isdefault set on system Entregas IVA 21%'

-- ===========================================================================
-- Final report
-- ===========================================================================
\echo ''
\echo 'Remaining client-level taxes after migration (should be REVIEW only):'
SELECT cl.name, count(*) AS remaining_client_taxes
FROM c_tax t JOIN ad_client cl ON cl.ad_client_id=t.ad_client_id
WHERE t.ad_client_id <> '0' GROUP BY cl.name ORDER BY cl.name;

\if :do_commit
  \echo '>>> do_commit=1 : COMMITTING changes.'
  COMMIT;
\else
  \echo '>>> dry run (do_commit unset/0) : ROLLING BACK. Re-run with -v do_commit=1 to apply.'
  ROLLBACK;
\endif
