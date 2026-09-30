-- @id: R42-generic-category-trl-cleanup
-- @gap: ETP-5498
-- @risk: low
-- @type: sql
-- @description: ETP-5498 — delete the now-redundant es_ES M_Product_Category_Trl row for the seeded starter category after R41 renamed its base NAME to 'Genérico'
--   Only the first line of @description reaches the ledger.
--
-- Context (ETP-5498)
-- ---------------------------------------------------------------------------------------------
-- R41 (this same ticket) renamed the GOClient starter category's base VALUE/NAME from 'Generic' to
-- 'Genérico'. That category already carried an es_ES M_Product_Category_Trl row whose NAME was also
-- 'Genérico' (added when the base was still 'Generic', to show the translated label in the UI). Now
-- that the base itself is 'Genérico', that Trl row merely repeats the base NAME — the exact
-- "placeholder translation" shape flagged by
-- OnboardingDatasetCorrectionsSampleDataTest.testEveryUserFacingProductCategoryHasARealSpanishTranslation
-- (com.etendoerp.go). Etendo falls back to the base NAME when no Trl row exists, so deleting it
-- changes nothing user-visible; keeping it only leaves stale, redundant data.
--
-- SEPARATE FIX FROM R41 — not folded into it: by the time this shipped, R41 was already APPLIED for
-- at least one tenant (the ledger's watermark had advanced), and the data-fixes catalog's rule 3
-- forbids editing an applied .sql — see ../README.md § Mandatory rules. A tenant that ran R41 before
-- this file existed still needs the Trl row removed, hence a new dated fix.
--
-- Preventive twin
-- ---------------------------------------------------------------------------------------------
-- com.etendoerp.go/referencedata/sampledata/GOClient/M_PRODUCT_CATEGORY_TRL.xml no longer ships the
-- es_ES row for this category (removed in the same ETP-5498 change), so a newborn tenant never has
-- it and this fix's @check returns 0 rows for it => SKIPPED_NOT_NEEDED.
--
-- Scope
-- ---------------------------------------------------------------------------------------------
-- Keyed on a base category already named 'Genérico' (i.e. only after R41 has run, whichever order
-- the two land in a given sweep) with an es_ES Trl row whose NAME equals that same base NAME. Only
-- GOClient-family tenants ever had this Trl row, so this never touches unrelated datasets.
--
-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- @check mirrors @apply's guard exactly (Trl row exists AND its NAME = base NAME 'Genérico'), so a
-- re-run after success, or a tenant that never had the Trl row, yields 0 check rows
-- (SKIPPED_NOT_NEEDED).
--
-- Rollback (manual, per tenant)
-- ---------------------------------------------------------------------------------------------
-- Not recoverable from this fix alone (the deleted row's id and audit columns are lost). Re-seed
-- manually if ever needed:
--   INSERT INTO m_product_category_trl
--     (m_product_category_trl_id, m_product_category_id, ad_language, ad_client_id, ad_org_id,
--      isactive, created, createdby, updated, updatedby, name, istranslated)
--   SELECT <new-uuid>, p.m_product_category_id, 'es_ES', p.ad_client_id, p.ad_org_id,
--          'Y', now(), '0', now(), '0', 'Genérico', 'Y'
--   FROM m_product_category p
--   WHERE p.ad_client_id = '<client_id>' AND p.value = 'Genérico';

-- @check
-- Returns >=1 row while this client's 'Genérico' category still has an es_ES Trl row whose NAME
-- just repeats the base NAME.
SELECT 1
FROM m_product_category p
JOIN m_product_category_trl t
  ON t.m_product_category_id = p.m_product_category_id
 AND t.ad_language = 'es_ES'
WHERE p.ad_client_id = :client_id
  AND p.value = 'Genérico'
  AND t.name = p.name
LIMIT 1;

-- @apply
-- Guarded by the same predicate (2nd idempotency layer): only a Trl row that still repeats the
-- base NAME is removed.
DELETE FROM m_product_category_trl t
USING m_product_category p
WHERE t.m_product_category_id = p.m_product_category_id
  AND t.ad_language = 'es_ES'
  AND p.ad_client_id = :client_id
  AND p.value = 'Genérico'
  AND t.name = p.name;
