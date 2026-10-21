-- @id: R51-bp-category-custom-flags-from-contacts
-- @gap: ETP-5791
-- @risk: low
-- @type: sql
-- @description: Give every non-standard contact category (C_BP_Group) still flagged neither customer nor vendor the type flags its contacts imply (Y/Y when they imply none).

-- Background
-- ----------
-- ETP-5791 added EM_ETGO_ISCUSTOMER / EM_ETGO_ISVENDOR to C_BP_Group (NOT NULL, default 'N'). A
-- category flagged N/N cannot be saved afterwards. R50-bp-category-customer-vendor-flags sets the
-- flags on the four standard categories (Cliente, Proveedor, Acreedor, Cliente/Proveedor) and
-- deliberately left every other category N/N pending a product decision. This fix applies that
-- decision (option (a), 2026-10-20):
--
--   customer flag = 'Y' when ANY contact of the category is a customer (C_BPartner.IsCustomer='Y')
--   vendor flag   = 'Y' when ANY contact of the category is a vendor   (C_BPartner.IsVendor='Y')
--   both 'Y'      when the category has no contacts, or none of them is customer or vendor
--                 (e.g. a category holding only employees) -- the permissive default, so the
--                 category stays usable for either kind of contact.
--
-- Contacts are counted whatever their IsActive: a deactivated contact still says what the
-- category is for.
--
-- TARGET: categories whose NAME is not one of the four standard names AND that are still N/N. That
-- includes a standard category a tenant renamed (its name no longer matches, so R50 left it N/N).
-- A category that already carries any flag set to 'Y' -- by R50, by a user, or by a previous run
-- of this fix -- is never touched.
--
-- ORDER: dated after R50 on purpose. Under the runner's fail-fast chain this fix runs for a tenant
-- only once R50 has been processed there, so the standard categories already carry their flags.
--
-- NO PREVENTIVE TWIN: a new tenant is born with only the four standard categories, already
-- flagged by the onboarding dataset (C_BP_GROUP.xml), so @check returns 0 rows for it
-- (SKIPPED_NOT_NEEDED). Categories a tenant creates later are saved through the UI, which requires
-- at least one flag. ONBOARDING_PROVISIONED_THROUGH is not bumped (same reasoning as R50).
--
-- NOT TOUCHED: C_BPartner (contacts), ISDEFAULT, and every other C_BP_Group column.
--
-- IDEMPOTENT: the only rows written are N/N rows, and the computed target always has at least one
-- 'Y', so after a run no N/N non-standard category is left: @check returns 0 rows and a re-run of
-- @apply matches nothing. Every statement is scoped to :client_id.

-- @check
SELECT 1
FROM c_bp_group g
WHERE g.ad_client_id = :client_id
  AND g.name NOT IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
  AND g.em_etgo_iscustomer = 'N'
  AND g.em_etgo_isvendor = 'N'
LIMIT 1;

-- @apply
UPDATE c_bp_group g
SET em_etgo_iscustomer = CASE
      WHEN NOT (COALESCE(t.has_customer, FALSE) OR COALESCE(t.has_vendor, FALSE)) THEN 'Y'
      WHEN t.has_customer THEN 'Y' ELSE 'N' END,
    em_etgo_isvendor = CASE
      WHEN NOT (COALESCE(t.has_customer, FALSE) OR COALESCE(t.has_vendor, FALSE)) THEN 'Y'
      WHEN t.has_vendor THEN 'Y' ELSE 'N' END,
    updated = now(), updatedby = '0'
FROM (
  SELECT c.c_bp_group_id,
         BOOL_OR(b.iscustomer = 'Y') AS has_customer,
         BOOL_OR(b.isvendor = 'Y') AS has_vendor
  FROM c_bp_group c
  LEFT JOIN c_bpartner b ON b.c_bp_group_id = c.c_bp_group_id AND b.ad_client_id = :client_id
  WHERE c.ad_client_id = :client_id
  GROUP BY c.c_bp_group_id
) t
WHERE g.c_bp_group_id = t.c_bp_group_id
  AND g.ad_client_id = :client_id
  AND g.name NOT IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
  AND g.em_etgo_iscustomer = 'N'
  AND g.em_etgo_isvendor = 'N';

-- @report
-- What each category received, and why (contact counts by kind). @report runs in the SAME
-- transaction as @apply, so now() is the same instant @apply wrote into UPDATED: the filter below
-- selects exactly the rows this run changed.
SELECT g.value AS category,
       g.em_etgo_iscustomer AS is_customer,
       g.em_etgo_isvendor AS is_vendor,
       COUNT(b.c_bpartner_id) AS contacts,
       COUNT(b.c_bpartner_id) FILTER (WHERE b.iscustomer = 'Y') AS customers,
       COUNT(b.c_bpartner_id) FILTER (WHERE b.isvendor = 'Y') AS vendors
FROM c_bp_group g
LEFT JOIN c_bpartner b ON b.c_bp_group_id = g.c_bp_group_id AND b.ad_client_id = :client_id
WHERE g.ad_client_id = :client_id
  AND g.name NOT IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
  AND g.updatedby = '0'
  AND g.updated = now()
GROUP BY g.value, g.em_etgo_iscustomer, g.em_etgo_isvendor
ORDER BY g.value;
