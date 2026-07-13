-- @id: R11-acctschema-default-completion
-- @gap: A3b
-- @risk: medium
-- @type: sql
-- @description: Populate 6 previously-NULL C_ACCTSCHEMA_DEFAULT "Defaults tab" accounts (doubtful
--   debt, bad-debt expense/revenue, allowance for doubtful debt, deferred product expense/revenue)
--   from the tenant's own chart of accounts, so document types that resolve these defaults (e.g.
--   receivable write-downs, deferred revenue recognition) do not fail with "Account Not Defined" —
--   ETP-4245 (R11, follow-up to R10's TC-41 finding, "Jorge's list")
--
-- Background
-- ----------
-- ETP-4245's Group-10 test-plan pass (R10, 2026-07-06) flagged the C_ACCTSCHEMA_DEFAULT "Defaults
-- tab" (TC-41) as only partially verified (5 columns) and deferred the rest pending a fuller
-- reference list from the product owner ("Jorge's list"). That list arrived 2026-07-06: 10 Tercero
-- (Third Party) fields + 5 Producto (Product) fields, all shown as 10-digit codes in the classic UI.
-- Cross-checking each against c_elementvalue confirms the client's chart is 8-digit (drop the
-- trailing 2 zeros — same convention already established by R8-account-codes-8digits): of the 15
-- fields, 9 were ALREADY populated and correct (c_receivable_acct, c_prepayment_acct, writeoff_acct,
-- v_liability_acct, v_prepayment_acct, notinvoicedreceipts_acct, p_asset_acct, p_expense_acct,
-- p_revenue_acct) and 6 were NULL (doubtfuldebt_acct, baddebtexpense_acct, baddebtrevenue_acct,
-- allowancefordoubtful_acct, p_def_expense_acct, p_def_revenue_acct). This fix closes only the 6
-- NULL ones.
--
-- WRITE-OFF OVERRIDE (superseded — see R12) ----------------------------------------------------
-- At the time this fix was written (2026-07-06), the product owner had EXPLICITLY confirmed the
-- DB's existing value (69400000, "Pérdidas por deterioro de créditos por operaciones comerciales")
-- was correct and must NOT be changed to the screenshot's 65000000. Verified live at the time:
-- writeoff_acct resolved to c_validcombination 997A522BF1124E029E99AB31CF2540F9 = account 69400000.
-- This fix's @check/@apply deliberately never reference writeoff_acct.
--
-- SUPERSEDED 2026-07-08: the product owner reconfirmed, again explicitly, that 65000000 IS the
-- correct value after all — a second decision that reverses the one above. Do NOT "fix" this file
-- (it is immutable, already applied to real tenant DBs) — the correction lives in a NEW sibling
-- fix: cli/src/data-fixes/sql/20260708T090000Z__R12-writeoff-account-override.sql.
--
-- FK indirection gotcha (new, not previously documented) ------------------------------------------
-- C_ACCTSCHEMA_DEFAULT's *_acct columns are NOT a direct FK to c_elementvalue — they point to
-- C_VALIDCOMBINATION (the account + dimension combination), whose own account_id then points to
-- c_elementvalue. All 9 already-populated columns resolve to combinations with every optional
-- dimension NULL (an "unbalanced", dimensionless posting combination) scoped to the tenant's own
-- c_acctschema_id. The 6 target accounts already have exactly one such combination each pre-existing
-- for GOClient (confirmed by query) — this fix does not need to INSERT into c_validcombination.
--
-- Idempotency
-- -----------
-- Two layers: (1) @check only fires for a column that is BOTH still NULL AND has a resolvable
-- target combination (so a tenant whose chart lacks one of these 6 accounts does not loop forever);
-- (2) each @apply UPDATE re-states the same NULL + EXISTS guard in its WHERE clause, so a partial or
-- concurrent apply is safe to re-run — an already-populated column is never overwritten.
--
-- Preventive twin
-- ----------------
-- referencedata/sampledata/GOClient/C_ACCTSCHEMA_DEFAULT.xml (dataset-only, table already in
-- OnboardingDatasetDefinition.INCLUDED_TABLES since the A1 pass; neither OnboardingAccountingWiringService
-- nor any other onboarding class references these specific columns). ONBOARDING_PROVISIONED_THROUGH
-- bumped to 2026-07-06T16:00:00Z in OnboardingBaselineService.java.

-- @check
-- Fires when at least one of the 6 target columns is NULL for the tenant's schema AND a matching
-- dimensionless C_VALIDCOMBINATION already exists for that account value on that schema.
SELECT 1
FROM c_acctschema_default d
WHERE d.ad_client_id = :client_id
  AND (
    (d.doubtfuldebt_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '43600000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
    OR (d.baddebtexpense_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '69400000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
    OR (d.baddebtrevenue_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '79400000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
    OR (d.allowancefordoubtful_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '49000000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
    OR (d.p_def_expense_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48000000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
    OR (d.p_def_revenue_acct IS NULL AND EXISTS (
      SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48500000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
    ))
  )
LIMIT 1;

-- @apply
-- One UPDATE per column. Each WHERE clause mirrors its @check condition exactly (NULL + EXISTS),
-- so re-running after a partial success is a no-op for the columns already resolved.

UPDATE c_acctschema_default d
SET doubtfuldebt_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '43600000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.doubtfuldebt_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '43600000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

UPDATE c_acctschema_default d
SET baddebtexpense_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '69400000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.baddebtexpense_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '69400000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

UPDATE c_acctschema_default d
SET baddebtrevenue_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '79400000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.baddebtrevenue_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '79400000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

UPDATE c_acctschema_default d
SET allowancefordoubtful_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '49000000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.allowancefordoubtful_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '49000000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

UPDATE c_acctschema_default d
SET p_def_expense_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48000000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.p_def_expense_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48000000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );

UPDATE c_acctschema_default d
SET p_def_revenue_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48500000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.p_def_revenue_acct IS NULL
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '48500000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );
