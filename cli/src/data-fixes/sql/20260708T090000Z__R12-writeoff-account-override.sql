-- @id: R12-writeoff-account-override
-- @gap: A3b
-- @risk: low
-- @type: sql
-- @description: Reverse the R11 write-off override — the product owner has now confirmed
--   C_ACCTSCHEMA_DEFAULT.writeoff_acct must resolve to account 65000000 ("Pérdidas por créditos
--   comerciales incobrables", PGC 665), NOT 69400000 ("Pérdidas por deterioro de créditos por
--   operaciones comerciales", PGC 694) — ETP-4452
--
-- Background — a prior decision is being REVERSED here, on purpose
-- --------------------------------------------------------------------------------------------
-- R11 (20260706T160000Z__R11-acctschema-default-completion.sql) carries a "WRITE-OFF OVERRIDE
-- (do not 'fix' this)" comment recording that, on 2026-07-06, the product owner explicitly
-- confirmed 69400000 was correct and told the team NOT to change it to 65000000 (the value shown
-- in an earlier reference screenshot). On 2026-07-07 the product owner reconfirmed, again
-- explicitly, that 65000000 IS the correct value after all — this fix implements that second,
-- superseding decision. R11 itself is left untouched (immutable, already applied to real tenant
-- DBs); this is a NEW dated fix, not an edit of R11's history. See the updated comment in R11 and
-- the corrected notes in docs/etendo-ad/tenant-remediation-knowledge.md,
-- docs/etendo-ad/onboarding-gaps.md, docs/etendo-ad/onboarding-and-datafixes-map.md and
-- docs/plans/onboarding-gaps-remediation-plan.md.
--
-- Scope — self-limiting via @check, no client allowlist needed
-- --------------------------------------------------------------------------------------------
-- Only tenants provisioned from the GOClient-style Spanish PGC chart (8-digit numeric codes) can
-- possibly need this: GOClient, acreedortest, acreetest2, empresa all confirmed live to have (a) a
-- postable leaf `c_elementvalue.value = '65000000'` and (b) a pre-existing dimensionless
-- C_VALIDCOMBINATION for it on their own C_AcctSchema (both auto-created by the standard
-- `c_elementvalue_trg()` trigger when the leaf was provisioned — same mechanism documented for
-- R9/R11, no new C_VALIDCOMBINATION insert is ever needed here). F&B International Group,
-- QA Testing and TaxesOrg run unrelated (US-chart) schemas with no 65000000 account at all — the
-- @check's EXISTS guard naturally excludes them without a hardcoded client list.
--
-- FK indirection reminder (same as R11)
-- --------------------------------------------------------------------------------------------
-- C_ACCTSCHEMA_DEFAULT.writeoff_acct is an FK to C_VALIDCOMBINATION, not directly to
-- C_ElementValue. Resolve via c_validcombination.account_id -> c_elementvalue.c_elementvalue_id,
-- filtered to the dimensionless ("all optional dimensions NULL") combination scoped to the
-- tenant's own c_acctschema_id — the same convention as every other *_acct column in this table.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Two layers: (1) @check only fires when writeoff_acct does NOT already resolve to 65000000 AND a
-- resolvable dimensionless combination for 65000000 exists on the tenant's schema; (2) @apply
-- restates the identical guard in its WHERE clause, so a partial/concurrent/re-run is a no-op once
-- the column already points at the 65000000 combination.
--
-- Preventive twin
-- --------------------------------------------------------------------------------------------
-- referencedata/sampledata/GOClient/C_ACCTSCHEMA_DEFAULT.xml — WRITEOFF_ACCT changed from
-- GOClient's own 69400000 combination id (997A522BF1124E029E99AB31CF2540F9) to GOClient's own
-- 65000000 combination id (CB7E1B51B897403083CDCA20835F6AE9), so every NEW tenant onboarded from
-- this dataset is born with the corrected default. ONBOARDING_PROVISIONED_THROUGH bumped to
-- 2026-07-08T09:00:00Z in OnboardingBaselineService.java.

-- @check
-- Fires when writeoff_acct does not already resolve to account 65000000 AND a resolvable
-- dimensionless C_VALIDCOMBINATION for 65000000 exists on the tenant's own schema.
SELECT 1
FROM c_acctschema_default d
WHERE d.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM c_validcombination vc65 JOIN c_elementvalue ev65 ON ev65.c_elementvalue_id = vc65.account_id
    WHERE vc65.c_validcombination_id = d.writeoff_acct AND ev65.value = '65000000'
  )
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '65000000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  )
LIMIT 1;

-- @apply
-- WHERE clause mirrors @check exactly, so a re-run after success is a no-op.
UPDATE c_acctschema_default d
SET writeoff_acct = (
      SELECT vc.c_validcombination_id FROM c_validcombination vc
      JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
      WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '65000000'
        AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
        AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
        AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
        AND vc.user1_id IS NULL AND vc.user2_id IS NULL
      ORDER BY vc.created ASC LIMIT 1
    ),
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM c_validcombination vc65 JOIN c_elementvalue ev65 ON ev65.c_elementvalue_id = vc65.account_id
    WHERE vc65.c_validcombination_id = d.writeoff_acct AND ev65.value = '65000000'
  )
  AND EXISTS (
    SELECT 1 FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id = vc.account_id
    WHERE vc.c_acctschema_id = d.c_acctschema_id AND ev.value = '65000000'
      AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.c_project_id IS NULL
      AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL AND vc.ad_orgtrx_id IS NULL
      AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
      AND vc.user1_id IS NULL AND vc.user2_id IS NULL
  );
