-- @id: R50-tax-category-old-iva-normal-deactivate
-- @gap: U1
-- @risk: low
-- @type: sql
-- @description: Deactivate the obsolete "OLD IVA Normal" FinancialMgmtTaxCategory (c_taxcategory id 828E8E40DD3C4FA6A4F531569D26A6AF), a SYSTEM-owned (ad_client_id='0') row whose Spanish translation was never updated from "IVA Normal" -- causing a duplicate "IVA Normal" entry in the Tax Category selector for es_ES tenants with the Spanish fiscal data module applied (ETP-5802)

-- Background
-- ----------
-- Module `com.etendoerp.go.localization.es.data` ("Etendo Go - Spanish Fiscal
-- Taxes Data") ships TWO FinancialMgmtTaxCategory ("Standard") rows that both
-- display as "IVA Normal" in Spanish:
--   - The current/correct one (a different id, still active, correctly
--     translated).
--   - This one (828E8E40DD3C4FA6A4F531569D26A6AF), renamed "OLD IVA Normal" in
--     English but left ACTIVE with its Spanish translation (`FinancialMgmtTaxCategoryTrl`
--     id FE6B21A01CB141818AD4F1A12E60F594, es_ES language id '140') still reading
--     "IVA Normal" verbatim -- hence the duplicate the user sees.
--
-- Confirmed live on this DB (2026-10-19):
--   SELECT c_taxcategory_id, name, isactive, ad_client_id, ad_org_id
--   FROM c_taxcategory WHERE c_taxcategory_id = '828E8E40DD3C4FA6A4F531569D26A6AF';
--   -> name='OLD IVA Normal', isactive='Y', ad_client_id='0', ad_org_id='0'
--
-- This is System-owned reference data (ad_client_id='0'), not a per-tenant row.
-- `C_TaxCategory` (AD_Table 252) has AccessLevel=7 ("All" -- System/Client/Org),
-- so a System-level row is visible to every client through Etendo's standard
-- client-visibility filter. There is exactly ONE row to fix, shared by every
-- tenant -- the same shape as O1 (R40-aeatsii-cause-exemption-catalog, ETP-5481)
-- and the "System pseudo-tenant" convention documented in `sql/README.md`
-- ("Fixes that target the System pseudo-tenant (`--client 0`)").
--
-- Prior related work (read before editing): ETP-4944 (this same XML file, Sep
-- 2026) cleaned up the Spanish fiscal TAX RATE catalog and specifically kept
-- the "IVA Normal - Standard" FinancialMgmtTaxRate (id 867FFFAC82CC44069FE6497E4C5C6348)
-- INACTIVE-but-undeleted because a live invoice already referenced it ("Keep IVA
-- Normal, live invoice reference found", commit 0e27a0f). That commit never
-- touched the TAX CATEGORY itself -- only the rate under it -- which is exactly
-- this gap: the category stayed `active='Y'` and its stale Spanish translation
-- was never addressed. ETP-5802 closes that remaining piece.
--
-- Run with (System pseudo-tenant, per the documented convention):
--   node cli/src/data-fixes/run.js --fix R50-tax-category-old-iva-normal-deactivate --client 0
--
-- It will NEVER be picked up by the default per-tenant sweep (the runner's
-- tenant-universe query excludes ad_client_id='0' -- see run.js); an operator
-- must name it explicitly, same as R40.
--
-- Scope filter
-- ------------
-- Both `@check` and `@apply` filter on `ad_client_id = :client_id`, which
-- resolves to the literal `'0'` for this fix's only valid invocation -- this
-- satisfies the framework's rule 1 literally: the anchor row's own
-- `ad_client_id` really is `'0'`.
--
-- Why deactivating is safe
-- -------------------------
-- 1. Selectors already filter by active records (standard DAL selector /
--    client-visibility mechanism, same as O1) -- deactivating removes the
--    duplicate from every selector (OCR "Nuevo producto" popup, Product window)
--    without any frontend change, and with no literal id in shared code.
-- 2. The row is NOT deleted, only deactivated -- any already-provisioned
--    product that references `828E8E40DD3C4FA6A4F531569D26A6AF` as its
--    `C_TaxCategory_ID` keeps a valid FK and opens exactly as before; nothing
--    that already points at this category breaks.
-- 3. Confirmed live (2026-10-19): `SELECT count(*) FROM m_product WHERE
--    c_taxcategory_id = '828E8E40DD3C4FA6A4F531569D26A6AF'` = 0 on this DB, and
--    the only FinancialMgmtTaxRate under this category
--    (867FFFAC82CC44069FE6497E4C5C6348, "IVA Normal") is itself already
--    `isactive='N'` per ETP-4944 -- so deactivating the category leaves no
--    active tax computable under it in the first place; a product that DID
--    still reference it was already unable to compute VAT correctly (the exact
--    symptom this ticket closes).
--
-- Preventive twin
-- ---------------
-- `referencedata/standard/Spanish_Fiscal_Taxes_Go.xml` (module
-- `com.etendoerp.go.localization.es.data`) -- the FinancialMgmtTaxCategory
-- element for id 828E8E40DD3C4FA6A4F531569D26A6AF now ships `<active>false</active>`
-- (was `true`). This is STANDARD reference data, imported once at module
-- install/update time via Openbravo's reference-data import, NOT reapplied to
-- an already-provisioned instance by `update.database` on its own (same
-- "referencedata not reapplied to an existing install" pattern documented for
-- H1/N6 in `onboarding-gaps.md`) -- hence this corrective `.sql` is genuinely
-- required for instances where the module was already applied before this fix
-- shipped. A newborn instance that installs the module AFTER this fix is born
-- correct directly from the XML, with nothing left for this fix to do (its
-- `@check` converges to SKIPPED_NOT_NEEDED the moment the row shows `isactive='N'`).
--
-- ONBOARDING_PROVISIONED_THROUGH is NOT bumped: this fix targets the System
-- pseudo-tenant (ad_client_id='0'), which the CUT watermark mechanism does not
-- cover (the watermark is computed per real tenant from ETGO_DATA_FIX_HISTORY
-- rows keyed by `remediated_client_id`) -- same rationale as O1/R40.
--
-- Idempotency
-- -----------
-- Single guarded UPDATE: `@check` returns a row only while the target row is
-- still `isactive='Y'`; `@apply`'s own `WHERE isactive = 'Y'` makes a second run
-- a no-op (0 rows affected) even if invoked outside the runner's @check gate.

-- @check
-- Returns >=1 row while the SYSTEM pseudo-tenant's "OLD IVA Normal" tax
-- category is still active. 0 rows => already deactivated (e.g. by a prior run
-- of this fix, or already shipped via the reference-data XML on a fresh
-- install) => SKIPPED_NOT_NEEDED.
SELECT 1
FROM c_taxcategory tc
WHERE tc.c_taxcategory_id = '828E8E40DD3C4FA6A4F531569D26A6AF'
  AND tc.ad_client_id = :client_id
  AND tc.isactive = 'Y';

-- @apply
-- Deactivate the obsolete category. Defensively re-guarded by isactive = 'Y'
-- so a concurrent or repeated run is a safe no-op. The row is never deleted --
-- any existing FK reference (a product's C_TaxCategory_ID) stays valid.
UPDATE c_taxcategory
SET isactive = 'N',
    updated = now(),
    updatedby = '0'
WHERE c_taxcategory_id = '828E8E40DD3C4FA6A4F531569D26A6AF'
  AND ad_client_id = :client_id
  AND isactive = 'Y';
