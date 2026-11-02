-- @id: R55-bp-category-customer-vendor-flags
-- @gap: ETP-5791
-- @risk: low
-- @type: sql
-- @description: Add the "Cliente/Proveedor" contact category (C_BP_Group) with accounting mirrored from the tenant's own categories, and set the customer/vendor type flags on the four standard categories.

-- Background
-- ----------
-- ETP-5791 gives every contact category (C_BP_Group) two type flags, EM_ETGO_ISCUSTOMER and
-- EM_ETGO_ISVENDOR (YesNo, NOT NULL, default 'N'). The column default leaves every existing
-- category N/N, and a category flagged N/N cannot be saved afterwards, so existing tenants need the
-- flags set explicitly. The story also adds a fourth standard category, "Cliente/Proveedor", for
-- contacts that are both customer and vendor.
--
-- Target state per category NAME (onboarding ships Name == Value for all four):
--   Cliente            -> customer only  (Y/N)
--   Proveedor          -> vendor only    (N/Y)
--   Acreedor           -> vendor only    (N/Y)
--   Cliente/Proveedor  -> both           (Y/Y)
--
-- PREVENTIVE TWIN (com.etendoerp.go, same ticket): referencedata/sampledata/GOClient/C_BP_GROUP.xml
-- ships the four categories with these flags, and makes "Cliente/Proveedor" the default
-- (ISDEFAULT='Y') for NEW tenants. Its C_BP_Group_Acct rows come, like the other three, from
-- OnboardingAccountingWiringService.BP_GROUP_ACCT_SQL + patchBpGroupAcctMissingColumns, so no
-- onboarding Java changes. A new tenant matches the target state, so this fix's @check returns 0
-- rows for it (SKIPPED_NOT_NEEDED) and ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped
-- (same reasoning as ETP-5079/R31-document-sequence-startno: reserve CUT bumps for fixes whose
-- @check WOULD match a correctly provisioned new tenant; a bump here would also silently skip the
-- unaudited R34..R49 for new tenants).
--
-- DEFAULT: existing tenants keep "Cliente" as their only default. The new category is inserted
-- with ISDEFAULT='N' and no existing ISDEFAULT is touched.
--
-- ACCOUNTING for the new category (C_BP_Group_Acct, one row per accounting schema), mirrored from
-- the tenant's OWN categories, never from C_AcctSchema_Default when a category exists to copy:
--   * customer-side and shared columns -> copied from the tenant's "Cliente" row for that schema;
--   * vendor-side columns (V_Liability_Acct, V_Liability_Services_Acct, V_Prepayment_Acct,
--     NotInvoicedReceipts_Acct, PayDiscount_Rev_Acct) -> copied from the tenant's "Proveedor" row
--     for that schema when it has one, else from "Cliente" as well.
--   * no "Cliente" row for the schema -> the whole row is copied from "Proveedor";
--   * neither exists (the two legacy Classic demo tenants with no standard categories) -> the row
--     is built from C_AcctSchema_Default, the same source the core trigger and onboarding use.
-- Should a tenant ever carry two categories with the same name (in different orgs; none today),
-- DISTINCT ON keeps one source row per schema -- the one in org '0' first -- so the
-- UNIQUE (c_bp_group_id, c_acctschema_id) constraint can never be hit by a fan-out.
-- "Acreedor" is never a source: its vendor accounts are deliberately creditor-specific (R9/R35).
-- Live check 2026-10-19: "Cliente" and "Proveedor" rows are byte-identical on all 211 tenants that
-- have both, so today the split only matters for a tenant that later customizes one of them.
--
-- WHY TRIGGERS ARE DISABLED AROUND THE GROUP INSERT: c_bp_group_trg() (the only trigger on
-- C_BP_Group) would create the C_BP_Group_Acct rows from C_AcctSchema_Default on INSERT, and the
-- mirror INSERT below would then find them and silently no-op (the idempotency trap recorded in
-- tenant-remediation-knowledge.md, 2026-07-01). Disabling it lets the explicit, NOT EXISTS-guarded
-- INSERT ... SELECT be the single writer. set_config(..., true) inside ad_disable_triggers() is
-- transaction-local; ad_enable_triggers() restores it right after (same pattern as R1).
--
-- NOT TOUCHED:
--   * C_BPartner (contacts): no contact changes category or any other column.
--   * Categories with any other name (custom tenant categories, E2E test categories): left at the
--     column default N/N on purpose -- the next fix, R56-bp-category-custom-flags-from-contacts,
--     flags them from their contacts. They are listed in the ledger detail (see @report).
--
-- Prerequisite: update.database has created EM_ETGO_ISCUSTOMER / EM_ETGO_ISVENDOR. Before that
-- both sections fail on the missing column and the runner records FAILED (retried next run).
--
-- IDEMPOTENT: the category INSERT is guarded by NOT EXISTS on name/value; each acct INSERT by
-- NOT EXISTS on (group, schema); the flag UPDATE by IS DISTINCT FROM. After a successful run
-- @check returns 0 rows. Every statement is scoped to :client_id. PKs come from get_uuid().

-- @check
-- Needed when the tenant has no "Cliente/Proveedor" category, when any of the four standard
-- categories carries flags other than its target, or when "Cliente/Proveedor" lacks its posting
-- row for one of the tenant's accounting schemas.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND (
    NOT EXISTS (
      SELECT 1 FROM c_bp_group g
      WHERE g.ad_client_id = :client_id
        AND (g.name = 'Cliente/Proveedor' OR g.value = 'Cliente/Proveedor')
    )
    OR EXISTS (
      SELECT 1 FROM c_bp_group g
      WHERE g.ad_client_id = :client_id
        AND g.name IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
        AND (g.em_etgo_iscustomer IS DISTINCT FROM
               CASE WHEN g.name IN ('Cliente', 'Cliente/Proveedor') THEN 'Y' ELSE 'N' END
             OR g.em_etgo_isvendor IS DISTINCT FROM
               CASE WHEN g.name = 'Cliente' THEN 'N' ELSE 'Y' END)
    )
    OR EXISTS (
      SELECT 1
      FROM c_bp_group g
      JOIN c_acctschema s ON s.ad_client_id = :client_id
      JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
      WHERE g.ad_client_id = :client_id
        AND g.name = 'Cliente/Proveedor'
        AND NOT EXISTS (
          SELECT 1 FROM c_bp_group_acct a
          WHERE a.c_bp_group_id = g.c_bp_group_id AND a.c_acctschema_id = s.c_acctschema_id
        )
    )
  )
LIMIT 1;

-- @apply

-- Step 1: create "Cliente/Proveedor" (customer + vendor, NOT default) when the tenant has no
-- category with that name or search key. Triggers off: see header.
SELECT ad_disable_triggers();

INSERT INTO c_bp_group (
  c_bp_group_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, isdefault, em_etgo_iscustomer, em_etgo_isvendor
)
SELECT get_uuid(), :client_id, '0', 'Y', now(), '0', now(), '0',
  'Cliente/Proveedor', 'Cliente/Proveedor', 'N', 'Y', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_bp_group g
  WHERE g.ad_client_id = :client_id
    AND (g.name = 'Cliente/Proveedor' OR g.value = 'Cliente/Proveedor')
);

SELECT ad_enable_triggers();

-- Step 2a: posting rows mirrored from "Cliente" (customer-side and shared columns), with the
-- vendor-side columns taken from "Proveedor" for the same schema when the tenant has that row.
INSERT INTO c_bp_group_acct (
  c_bp_group_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bp_group_id, c_acctschema_id,
  c_receivable_acct, c_prepayment_acct,
  v_liability_acct, v_liability_services_acct, v_prepayment_acct,
  paydiscount_exp_acct, paydiscount_rev_acct, writeoff_acct, writeoff_rev_acct,
  unrealizedgain_acct, unrealizedloss_acct, realizedgain_acct, realizedloss_acct,
  notinvoicedreceipts_acct, unearnedrevenue_acct, notinvoicedrevenue_acct, notinvoicedreceivables_acct,
  doubtfuldebt_acct, baddebtexpense_acct, baddebtrevenue_acct, allowancefordoubtful_acct
)
SELECT DISTINCT ON (cp.c_bp_group_id, cl.c_acctschema_id)
  get_uuid(), :client_id, cp.ad_org_id, 'Y', now(), '0', now(), '0',
  cp.c_bp_group_id, cl.c_acctschema_id,
  cl.c_receivable_acct, cl.c_prepayment_acct,
  CASE WHEN pv.c_bp_group_acct_id IS NOT NULL THEN pv.v_liability_acct ELSE cl.v_liability_acct END,
  CASE WHEN pv.c_bp_group_acct_id IS NOT NULL THEN pv.v_liability_services_acct ELSE cl.v_liability_services_acct END,
  CASE WHEN pv.c_bp_group_acct_id IS NOT NULL THEN pv.v_prepayment_acct ELSE cl.v_prepayment_acct END,
  cl.paydiscount_exp_acct,
  CASE WHEN pv.c_bp_group_acct_id IS NOT NULL THEN pv.paydiscount_rev_acct ELSE cl.paydiscount_rev_acct END,
  cl.writeoff_acct, cl.writeoff_rev_acct,
  cl.unrealizedgain_acct, cl.unrealizedloss_acct, cl.realizedgain_acct, cl.realizedloss_acct,
  CASE WHEN pv.c_bp_group_acct_id IS NOT NULL THEN pv.notinvoicedreceipts_acct ELSE cl.notinvoicedreceipts_acct END,
  cl.unearnedrevenue_acct, cl.notinvoicedrevenue_acct, cl.notinvoicedreceivables_acct,
  cl.doubtfuldebt_acct, cl.baddebtexpense_acct, cl.baddebtrevenue_acct, cl.allowancefordoubtful_acct
FROM c_bp_group cp
JOIN c_bp_group clg ON clg.ad_client_id = :client_id AND clg.name = 'Cliente'
JOIN c_bp_group_acct cl ON cl.c_bp_group_id = clg.c_bp_group_id AND cl.ad_client_id = :client_id
LEFT JOIN c_bp_group pvg ON pvg.ad_client_id = :client_id AND pvg.name = 'Proveedor'
LEFT JOIN c_bp_group_acct pv ON pv.c_bp_group_id = pvg.c_bp_group_id
                            AND pv.c_acctschema_id = cl.c_acctschema_id
WHERE cp.ad_client_id = :client_id
  AND cp.name = 'Cliente/Proveedor'
  AND NOT EXISTS (
    SELECT 1 FROM c_bp_group_acct a
    WHERE a.c_bp_group_id = cp.c_bp_group_id AND a.c_acctschema_id = cl.c_acctschema_id
  )
ORDER BY cp.c_bp_group_id, cl.c_acctschema_id, clg.ad_org_id, clg.c_bp_group_id, pvg.ad_org_id, pvg.c_bp_group_id;

-- Step 2b: schemas where the tenant has no "Cliente" row -> mirror "Proveedor" whole.
INSERT INTO c_bp_group_acct (
  c_bp_group_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bp_group_id, c_acctschema_id,
  c_receivable_acct, c_prepayment_acct,
  v_liability_acct, v_liability_services_acct, v_prepayment_acct,
  paydiscount_exp_acct, paydiscount_rev_acct, writeoff_acct, writeoff_rev_acct,
  unrealizedgain_acct, unrealizedloss_acct, realizedgain_acct, realizedloss_acct,
  notinvoicedreceipts_acct, unearnedrevenue_acct, notinvoicedrevenue_acct, notinvoicedreceivables_acct,
  doubtfuldebt_acct, baddebtexpense_acct, baddebtrevenue_acct, allowancefordoubtful_acct
)
SELECT DISTINCT ON (cp.c_bp_group_id, pv.c_acctschema_id)
  get_uuid(), :client_id, cp.ad_org_id, 'Y', now(), '0', now(), '0',
  cp.c_bp_group_id, pv.c_acctschema_id,
  pv.c_receivable_acct, pv.c_prepayment_acct,
  pv.v_liability_acct, pv.v_liability_services_acct, pv.v_prepayment_acct,
  pv.paydiscount_exp_acct, pv.paydiscount_rev_acct, pv.writeoff_acct, pv.writeoff_rev_acct,
  pv.unrealizedgain_acct, pv.unrealizedloss_acct, pv.realizedgain_acct, pv.realizedloss_acct,
  pv.notinvoicedreceipts_acct, pv.unearnedrevenue_acct, pv.notinvoicedrevenue_acct, pv.notinvoicedreceivables_acct,
  pv.doubtfuldebt_acct, pv.baddebtexpense_acct, pv.baddebtrevenue_acct, pv.allowancefordoubtful_acct
FROM c_bp_group cp
JOIN c_bp_group pvg ON pvg.ad_client_id = :client_id AND pvg.name = 'Proveedor'
JOIN c_bp_group_acct pv ON pv.c_bp_group_id = pvg.c_bp_group_id AND pv.ad_client_id = :client_id
WHERE cp.ad_client_id = :client_id
  AND cp.name = 'Cliente/Proveedor'
  AND NOT EXISTS (
    SELECT 1 FROM c_bp_group_acct a
    WHERE a.c_bp_group_id = cp.c_bp_group_id AND a.c_acctschema_id = pv.c_acctschema_id
  )
ORDER BY cp.c_bp_group_id, pv.c_acctschema_id, pvg.ad_org_id, pvg.c_bp_group_id;

-- Step 2c: schemas with neither a "Cliente" nor a "Proveedor" row -> build the row from
-- C_AcctSchema_Default, the source c_bp_group_trg() and onboarding's BP_GROUP_ACCT_SQL use.
-- V_Liability_Acct / WriteOff_Acct are NOT NULL on C_BP_Group_Acct; they are NOT NULL on
-- C_AcctSchema_Default too, so a schema with a defaults row can always be inserted.
INSERT INTO c_bp_group_acct (
  c_bp_group_acct_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  c_bp_group_id, c_acctschema_id,
  c_receivable_acct, c_prepayment_acct,
  v_liability_acct, v_liability_services_acct, v_prepayment_acct,
  paydiscount_exp_acct, paydiscount_rev_acct, writeoff_acct, writeoff_rev_acct,
  unrealizedgain_acct, unrealizedloss_acct, realizedgain_acct, realizedloss_acct,
  notinvoicedreceipts_acct, unearnedrevenue_acct, notinvoicedrevenue_acct, notinvoicedreceivables_acct,
  doubtfuldebt_acct, baddebtexpense_acct, baddebtrevenue_acct, allowancefordoubtful_acct
)
SELECT get_uuid(), :client_id, cp.ad_org_id, 'Y', now(), '0', now(), '0',
  cp.c_bp_group_id, s.c_acctschema_id,
  d.c_receivable_acct, d.c_prepayment_acct,
  d.v_liability_acct, d.v_liability_services_acct, d.v_prepayment_acct,
  d.paydiscount_exp_acct, d.paydiscount_rev_acct, d.writeoff_acct, d.writeoff_rev_acct,
  d.unrealizedgain_acct, d.unrealizedloss_acct, d.realizedgain_acct, d.realizedloss_acct,
  d.notinvoicedreceipts_acct, d.unearnedrevenue_acct, d.notinvoicedrevenue_acct, d.notinvoicedreceivables_acct,
  d.doubtfuldebt_acct, d.baddebtexpense_acct, d.baddebtrevenue_acct, d.allowancefordoubtful_acct
FROM c_bp_group cp
JOIN c_acctschema s ON s.ad_client_id = :client_id
JOIN c_acctschema_default d ON d.c_acctschema_id = s.c_acctschema_id
WHERE cp.ad_client_id = :client_id
  AND cp.name = 'Cliente/Proveedor'
  AND NOT EXISTS (
    SELECT 1 FROM c_bp_group_acct a
    WHERE a.c_bp_group_id = cp.c_bp_group_id AND a.c_acctschema_id = s.c_acctschema_id
  );

-- Step 3: type flags on the four standard categories, by name. Only rows whose flags differ are
-- written; ISDEFAULT and every other column are left as they are.
UPDATE c_bp_group g
SET em_etgo_iscustomer = CASE WHEN g.name IN ('Cliente', 'Cliente/Proveedor') THEN 'Y' ELSE 'N' END,
    em_etgo_isvendor = CASE WHEN g.name = 'Cliente' THEN 'N' ELSE 'Y' END,
    updated = now(), updatedby = '0'
WHERE g.ad_client_id = :client_id
  AND g.name IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
  AND (g.em_etgo_iscustomer IS DISTINCT FROM
         CASE WHEN g.name IN ('Cliente', 'Cliente/Proveedor') THEN 'Y' ELSE 'N' END
       OR g.em_etgo_isvendor IS DISTINCT FROM
         CASE WHEN g.name = 'Cliente' THEN 'N' ELSE 'Y' END);

-- @report
-- Custom categories (any other name) left at N/N, with how many contacts use them and how many of
-- those are customers/vendors -- the same inputs R56-bp-category-custom-flags-from-contacts uses
-- to flag them.
SELECT g.value AS category,
       g.isactive AS active,
       COUNT(b.c_bpartner_id) AS contacts,
       COUNT(b.c_bpartner_id) FILTER (WHERE b.iscustomer = 'Y') AS customers,
       COUNT(b.c_bpartner_id) FILTER (WHERE b.isvendor = 'Y') AS vendors
FROM c_bp_group g
LEFT JOIN c_bpartner b ON b.c_bp_group_id = g.c_bp_group_id AND b.ad_client_id = :client_id
WHERE g.ad_client_id = :client_id
  AND g.name NOT IN ('Cliente', 'Proveedor', 'Acreedor', 'Cliente/Proveedor')
  AND g.em_etgo_iscustomer = 'N'
  AND g.em_etgo_isvendor = 'N'
GROUP BY g.value, g.isactive
ORDER BY g.value;
