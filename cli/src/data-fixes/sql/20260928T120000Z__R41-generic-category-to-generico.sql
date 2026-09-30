-- @id: R41-generic-category-to-generico
-- @gap: ETP-5498
-- @risk: low
-- @type: sql
-- @description: ETP-5498 — rename the seeded starter product category (M_Product_Category VALUE='Generic') in place to VALUE/NAME 'Genérico'
--   Only the first line of @description reaches the ledger.
--
-- Context (ETP-5498)
-- ---------------------------------------------------------------------------------------------
-- R34 (ETP-5079) renamed the GOClient starter category 'Otros' -> 'Generic'
-- (referencedata/sampledata/GOClient/M_PRODUCT_CATEGORY.xml, id EBAE46FD129049DEB26B948E160C6AD8).
-- The Product window shows it translated ("Genérico", via M_Product_Category_Trl), but the Product
-- Category window and the Stock Report read the base NAME, so Spanish users see "Generic".
-- Product decision: make the base row Spanish. The GOClient XML now ships VALUE/NAME 'Genérico'
-- (preventive twin, com.etendoerp.go); this file is the corrective half for tenants born before it.
--
-- RENAME IN PLACE — same reasoning as R34: preserving M_Product_Category_ID keeps every product's
-- FK and relabels it automatically, and the INSERT-only accounting trigger (m_product_category_trg)
-- does not re-fire. Keyed on VALUE='Generic', so it only touches GOClient-family tenants; other
-- datasets (F&B 'Others', base demo client) never carried that row. M_Product_Category_Trl rows
-- are left untouched.
--
-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- @check returns rows only while a 'Generic' row exists and no 'Genérico' row does. @apply repeats
-- both guards: after the rename no 'Generic' remains, and the NOT EXISTS prevents a
-- UNIQUE(value, ad_client_id) collision if both labels ever coexist (that tenant is left for
-- manual review and reported by @check returning 0 rows => SKIPPED_NOT_NEEDED).
--
-- Rollback (manual, per tenant)
-- ---------------------------------------------------------------------------------------------
--   UPDATE m_product_category
--   SET value = 'Generic', name = 'Generic', updated = now(), updatedby = '0'
--   WHERE ad_client_id = '<client_id>' AND value = 'Genérico';

-- @check
SELECT 1
FROM m_product_category p
WHERE p.ad_client_id = :client_id
  AND p.value = 'Generic'
  AND NOT EXISTS (
    SELECT 1 FROM m_product_category g
    WHERE g.ad_client_id = :client_id AND g.value = 'Genérico'
  )
LIMIT 1;

-- @apply
UPDATE m_product_category p
SET value = 'Genérico',
    name = 'Genérico',
    updated = now(),
    updatedby = '0'
WHERE p.ad_client_id = :client_id
  AND p.value = 'Generic'
  AND NOT EXISTS (
    SELECT 1 FROM m_product_category g
    WHERE g.ad_client_id = :client_id AND g.value = 'Genérico'
  );
