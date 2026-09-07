-- @id: R34-corrected-dataset-warehouse-and-generic-category
-- @gap: ETP-5079
-- @risk: low
-- @type: sql
-- @description: ETP-5079 — realign already-onboarded tenants to the corrected GOClient dataset on
--   two points the integration E2E suite now expects: rename the onboarding warehouse (M_Warehouse
--   VALUE='AG') from "Almacen GO" to "Almacen Principal", and rename the seeded starter product
--   category (M_Product_Category VALUE='Otros') in place to VALUE/NAME "Generic"

-- Context (ETP-5079)
-- ---------------------------------------------------------------------------------------------
-- ETP-5079 corrected the curated GOClient sample dataset and realigned the integration E2E specs to
-- expect the corrected values. Tenants onboarded before that dataset change (their local
-- com.etendoerp.go backend module predates the correction) still carry the OLD names, so ~6 live
-- integration specs fail against them. Two concrete, name-based mismatches are closed here; both are
-- PREVENTIVELY fixed in the corrected GOClient XMLs for every NEW tenant, so this file is
-- corrective-only for the tenants born before them.
--
-- 1. WAREHOUSE NAME (M_Warehouse VALUE='AG')
--    The onboarding warehouse shipped as NAME='Almacen GO'; the corrected dataset renames it to
--    'Almacen Principal'. The E2E helper constant `DEFAULT_WAREHOUSE_NAME`
--    (e2e/tests/helpers/inventory-helpers.js) is 'Almacen Principal', and `resolveWarehouseId()`
--    resolves the warehouse BY NAME through the `/inventory/selectors/warehouse` selector, matching
--    the label exactly (trimmed, case-insensitive). A stale name is therefore a HARD failure
--    ("ensureStockOnHand: warehouse 'Almacen Principal' not found"), not a silent fallback — this is
--    the single point of truth that has to move. VALUE ('AG') and the locator ('AG-0-0-0') are
--    unchanged; only NAME moves, so nothing that resolves the warehouse by VALUE or id is affected.
--    (The pre-ETP-5079 second warehouse 'Almacén Secundario' / VALUE='AS' — removed by the same
--    ticket — is a DELETION concern with stock/locator implications and is deliberately OUT OF SCOPE
--    here: the named specs resolve BY NAME 'Almacen Principal', so a leftover 'AS' warehouse does not
--    break them.)
--
-- 2. SEEDED STARTER CATEGORY (M_Product_Category VALUE='Otros' -> 'Generic')
--    The GOClient dataset seeds a starter category that shipped as VALUE/NAME='Otros'
--    (referencedata/sampledata/GOClient/M_PRODUCT_CATEGORY.xml, id EBAE46FD129049DEB26B948E160C6AD8,
--    on the tenant's operative org). ETP-5079 renames THAT SAME ROW in the XML to VALUE/NAME
--    'Generic' (the row id and org are unchanged in the corrected XML — it is an in-place rename, not
--    a new row). `product-import-category-resolution.integration.spec.js` matches the seeded category
--    on its SEARCH KEY (`SEEDED_CATEGORY_SEARCH_KEY='Generic'`, i.e. M_Product_Category.Value, an
--    untranslated column) and reads its base NAME back from the same payload, failing with
--    "expected the seeded starter category with searchKey 'Generic'" while the row is still 'Otros'.
--
--    RENAME IN PLACE — not an INSERT (explicit product decision, mirroring R9's
--    "Consumidor Final" -> "Cliente" rename): the corrected XML renames the existing row rather than
--    adding a second one, so a NEW tenant is born with 'Generic' and NO 'Otros'. Inserting a fresh
--    'Generic' on an already-onboarded tenant would instead leave BOTH 'Otros' and 'Generic'
--    (diverging from a new tenant), orphan the product(s) already pointing at the 'Otros'
--    M_Product_Category_ID on the old label, and risk a duplicate-category state the dataset never
--    ships. Renaming preserves the primary key, so every product already in the category keeps its FK
--    and is relabeled 'Generic' automatically, with no product-side update — and because the row
--    already exists, the accounting-defaults INSERT trigger (m_product_category_trg, which fires only
--    on INSERT to create M_Product_Category_Acct rows) is NOT re-fired: its existing acct rows stay
--    intact. No M_Product_Category_Trl row is created here: the corrected XML ships none either, and
--    the spec reads its display label dynamically off the same payload (`_identifier ?? name`), so it
--    passes whether or not a translated row exists — a `*_Trl` seed is a separate, out-of-scope
--    concern.
--
--    NO fleet-wide fallback INSERT (deliberately narrower than R9): 'Generic' is a GOClient-specific
--    starter category, not a fleet-wide default. The rename is keyed on the GOClient starter row
--    (VALUE='Otros') so it fires ONLY on GOClient-family tenants that shipped it; unrelated tenants
--    (e.g. the F&B demo client, whose analogous category is the English 'Others', or the base
--    Openbravo demo client, which has no such starter) are left untouched rather than polluted with a
--    category their own dataset never carried.
--
-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while some correction still applies, so an already-correct
-- tenant (a new tenant born from the corrected dataset, or one already remediated) is
-- SKIPPED_NOT_NEEDED and @apply never runs — no watermark bump is needed. Both @apply statements are
-- ALSO self-guarded: the warehouse UPDATE by `name IS DISTINCT FROM 'Almacen Principal'` (NULL-safe),
-- the category UPDATE by `value = 'Otros'` plus a NOT EXISTS guard against an already-present
-- 'Generic' (which both keeps a re-run a no-op and prevents a UNIQUE(value, ad_client_id) collision
-- should both labels ever coexist). Every statement is scoped by ad_client_id = :client_id.

-- @check
-- Returns >=1 row while EITHER the 'AG' warehouse is still not named 'Almacen Principal', OR the
-- tenant still has the 'Otros' starter category and no 'Generic' yet (i.e. the rename is both needed
-- and applicable). 0 rows => this tenant is already aligned (or is not a GOClient-family tenant and
-- has neither the 'AG' warehouse nor the 'Otros' starter category) => SKIPPED_NOT_NEEDED.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND (
    EXISTS (
      SELECT 1 FROM m_warehouse w
      WHERE w.ad_client_id = :client_id
        AND w.value = 'AG'
        AND w.name IS DISTINCT FROM 'Almacen Principal'
    )
    OR (
      EXISTS (
        SELECT 1 FROM m_product_category p
        WHERE p.ad_client_id = :client_id AND p.value = 'Otros'
      )
      AND NOT EXISTS (
        SELECT 1 FROM m_product_category g
        WHERE g.ad_client_id = :client_id AND g.value = 'Generic'
      )
    )
  )
LIMIT 1;

-- @apply

-- 1. Rename the onboarding warehouse 'AG' from 'Almacen GO' (or any stale name) to 'Almacen
--    Principal'. VALUE and locator are untouched; only NAME moves. Self-guarded by IS DISTINCT FROM
--    so a warehouse already at the target name is not touched (keeps updated/updatedby honest on a
--    re-run and makes this a no-op when only the category half still needed fixing).
UPDATE m_warehouse
SET name = 'Almacen Principal', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND value = 'AG'
  AND name IS DISTINCT FROM 'Almacen Principal';

-- 2. Rename the seeded starter category 'Otros' -> 'Generic' IN PLACE (same M_Product_Category_ID).
--    Every product already pointing at this row keeps its FK and is relabeled automatically — no
--    product-side update, and the INSERT-only accounting trigger does not re-fire. Guarded by
--    value='Otros' (idempotent: after the rename no 'Otros' row remains) and by NOT EXISTS on a
--    'Generic' row for this client (prevents a UNIQUE(value, ad_client_id) collision if both labels
--    ever coexist, and doubles as a no-op guard on re-run).
UPDATE m_product_category p
SET value = 'Generic', name = 'Generic', updated = now(), updatedby = '0'
WHERE p.ad_client_id = :client_id
  AND p.value = 'Otros'
  AND NOT EXISTS (
    SELECT 1 FROM m_product_category g
    WHERE g.ad_client_id = :client_id AND g.value = 'Generic'
  );
