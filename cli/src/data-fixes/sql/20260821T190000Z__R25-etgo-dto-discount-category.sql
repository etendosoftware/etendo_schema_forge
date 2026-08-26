-- @id: R25-etgo-dto-discount-category
-- @gap: ETP-4967
-- @risk: low
-- @type: sql
-- @description: Reclassify the internal global-discount product (ETGO_DTO) into its own "Discounts" M_Product_Category per tenant, creating that category (and its M_Product_Category_Acct) when the tenant does not have one yet, and flagging it EM_Etgo_IsSystemCategory='Y' so it is hidden from windows/selectors

-- Context (ETP-4967)
-- --------------------------------------------------------------------------------------------
-- ETGO_DTO is the generic product used internally to represent the global discount on a
-- document. ETP-4967 needs to exclude it from every product window/selector, and the chosen
-- mechanism is filtering by category rather than by product id, so any future internal product
-- tagged the same way is excluded automatically. GOClient's reference data
-- (com.etendoerp.go/referencedata/sampledata/GOClient/M_PRODUCT_CATEGORY*.xml) already ships a
-- "Discounts" category and reclassifies its own ETGO_DTO — but that XML is sampledata, not
-- something replayed into already-provisioned tenants. This corrective closes the same gap for
-- every tenant that was onboarded before the category existed.
--
-- Why the category can't just be copied by id
-- ---------------------------------------------------------------------------
-- M_Product_Category is client-scoped. GOClient's category id
-- (B8FE24DC84A14783846F72A25DA9CBE4) only exists under GOClient's own ad_client_id — writing it
-- into another tenant's M_Product would create a cross-client FK, which Etendo's AD scoping
-- forbids. Each tenant needs its OWN "Discounts" category, created here when missing.
--
-- Accounting continuity (TC-06: the global discount must keep posting correctly)
-- ---------------------------------------------------------------------------
-- Etendo's own core trigger (m_product_category_trg, AFTER INSERT ON M_Product_Category) already
-- fires on step 1's INSERT and auto-creates one M_Product_Category_Acct row per C_AcctSchema the
-- category's org can see (from C_AcctSchema_Default) AND the AD_TreeNode entry the category needs
-- to show up correctly in the product-category tree. Do NOT also INSERT
-- M_Product_Category_Acct by hand for the just-created category — it collides with the trigger's
-- own row on the (M_Product_Category_ID, C_AcctSchema_ID) unique constraint
-- (m_product_category_acct_pro_un). Confirmed live: inserting a category and then trying to
-- INSERT its acct row manually raises "duplicate key value violates unique constraint
-- m_product_category_acct_pro_un" — the row already exists by the time the INSERT statement after
-- it runs.
--
-- The trigger uses C_AcctSchema_Default's accounts, which are not guaranteed to match what
-- ETGO_DTO has actually been posting against. So step 2 is an UPDATE, not an INSERT: it overwrites
-- the accounts on the row the trigger just created (and ONLY that row — guarded by
-- m_product_category_id = '@uuid_R25CAT@', the exact id step 1 used) with P_REVENUE_ACCT /
-- P_EXPENSE_ACCT / P_ASSET_ACCT / P_COGS_ACCT copied from the M_Product_Category_Acct that
-- ETGO_DTO's CURRENT category already has for that same C_AcctSchema. This keeps posting behavior
-- identical before/after the reclassification, for every schema ETGO_DTO's old category was
-- already wired for. If the tenant's "Discounts" category already existed before this apply (the
-- NOT-EXISTS-guarded case below), '@uuid_R25CAT@' matches no row and step 2 is a harmless no-op —
-- it never touches accounts on a category it did not create.
--
-- Idempotency
-- -----------
-- Step 1 (category) only inserts when the tenant has an ETGO_DTO product that is not already on
-- a "Discounts"-named category AND the tenant has no such category yet (NOT EXISTS guard on
-- value ILIKE 'discount%', case-insensitive so it also recognizes categories created ad hoc, e.g.
-- by QA/E2E seed data — confirmed present on "F&B International Group" and "QA Testing" in the
-- live DB). Step 2 (acct override) is scoped to the exact id step 1 used, so it is naturally a
-- no-op on re-run (the row's accounts already match) and never touches a pre-existing category.
-- Step 3 (product update) is a plain UPDATE guarded by "category_id <> target", so re-running
-- after success is a no-op. The whole @apply runs in ONE transaction (the runner wraps
-- BEGIN/COMMIT); on failure it rolls back — including whatever the trigger did.
--
-- Preventive twin
-- ---------------
-- New tenants onboarded from the GOClient dataset going forward inherit the "Discounts" category
-- (already flagged EM_Etgo_IsSystemCategory='Y') and the already-reclassified ETGO_DTO directly
-- from the sampledata XML above — this corrective only covers tenants that predate that dataset
-- change.
--
-- EM_Etgo_IsSystemCategory backfill (added after the column existed; this file never shipped
-- before the column did, so it is amended in place rather than patched by a follow-up fix — see
-- the data-fixes README's immutability rule, which only protects a fix already applied in an
-- environment other than the one authoring it)
-- ---------------------------------------------------------------------------
-- Etendo's own AD provides no generic "hidden category" concept, so ETP-4967 added a real column
-- (EM_Etgo_IsSystemCategory, Yes/No, extension column owned by Etendo Go) instead of matching
-- categories by name — a rename would have silently un-hidden "Discounts" otherwise. Step 4 below
-- sets it on every category this fix's own step 1 creates AND retroactively on any "Discounts"
-- category that already existed (either from an earlier run of this same fix, or ad hoc QA/E2E
-- seed data) but is not flagged yet — @check's second branch below exists specifically so this
-- backfill still fires even when ETGO_DTO already points to the right category.

-- @check
-- Needs the fix when the tenant's ETGO_DTO product exists and EITHER its current category is not
-- yet a "Discounts"-named category, OR it already is one but is not flagged
-- EM_Etgo_IsSystemCategory='Y' yet (the backfill case).
SELECT 1
FROM m_product p
WHERE p.ad_client_id = :client_id
  AND p.value = 'ETGO_DTO'
  AND (
    NOT EXISTS (
      SELECT 1 FROM m_product_category c
       WHERE c.m_product_category_id = p.m_product_category_id
         AND c.value ILIKE 'discount%'
    )
    OR EXISTS (
      SELECT 1 FROM m_product_category c
       WHERE c.m_product_category_id = p.m_product_category_id
         AND c.value ILIKE 'discount%'
         AND c.em_etgo_issystemcategory <> 'Y'
    )
  )
LIMIT 1;

-- @apply
-- 1. M_PRODUCT_CATEGORY. Create the tenant's own "Discounts" category only if it has none yet
--    and its ETGO_DTO still needs it.
INSERT INTO m_product_category (
  m_product_category_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, value, name, isdefault, plannedmargin, issummary,
  em_etgo_issystemcategory
)
SELECT '@uuid_R25CAT@', :client_id, '0', 'Y', now(), '0', now(), '0',
       'Discounts', 'Discounts', 'N', 0, 'N', 'Y'
WHERE EXISTS (
    SELECT 1 FROM m_product p
     WHERE p.ad_client_id = :client_id AND p.value = 'ETGO_DTO'
       AND NOT EXISTS (
         SELECT 1 FROM m_product_category c
          WHERE c.m_product_category_id = p.m_product_category_id
            AND c.value ILIKE 'discount%'
       )
  )
  AND NOT EXISTS (
    SELECT 1 FROM m_product_category c
     WHERE c.ad_client_id = :client_id AND c.value ILIKE 'discount%'
  );

-- 2. M_PRODUCT_CATEGORY_ACCT override. The m_product_category_trg trigger already created these
--    rows (one per schema, C_AcctSchema_Default accounts) as a side effect of step 1's INSERT.
--    Overwrite ONLY the row(s) belonging to the exact category id step 1 used, with the accounts
--    ETGO_DTO's CURRENT category already has for the same schema. Scoped to '@uuid_R25CAT@' so
--    this is a no-op when step 1 didn't insert (category pre-existed).
UPDATE m_product_category_acct tgt_acct
SET p_revenue_acct = old_acct.p_revenue_acct,
    p_expense_acct = old_acct.p_expense_acct,
    p_asset_acct = old_acct.p_asset_acct,
    p_cogs_acct = old_acct.p_cogs_acct,
    updated = now(), updatedby = '0'
FROM m_product p
JOIN m_product_category_acct old_acct ON old_acct.m_product_category_id = p.m_product_category_id
WHERE p.ad_client_id = :client_id
  AND p.value = 'ETGO_DTO'
  AND tgt_acct.m_product_category_id = '@uuid_R25CAT@'
  AND tgt_acct.c_acctschema_id = old_acct.c_acctschema_id;

-- 3. M_PRODUCT. Point ETGO_DTO at the tenant's own "Discounts" category.
UPDATE m_product p
SET m_product_category_id = tgt.m_product_category_id,
    updated = now(), updatedby = '0'
FROM m_product_category tgt
WHERE p.ad_client_id = :client_id
  AND p.value = 'ETGO_DTO'
  AND tgt.ad_client_id = :client_id
  AND tgt.value ILIKE 'discount%'
  AND p.m_product_category_id <> tgt.m_product_category_id;

-- 4. EM_Etgo_IsSystemCategory backfill. Flags every "Discounts"-named category of this client
--    that is not flagged yet — covers both the category step 1 just created (redundant with its
--    own 'Y' literal, but harmless) and any pre-existing one (ad hoc QA/E2E data, or a category
--    created by an earlier run of this fix before the column existed).
UPDATE m_product_category
SET em_etgo_issystemcategory = 'Y', updated = now(), updatedby = '0'
WHERE ad_client_id = :client_id
  AND value ILIKE 'discount%'
  AND em_etgo_issystemcategory <> 'Y';
