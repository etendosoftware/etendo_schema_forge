-- @id: R17-bp-group-acct-notinvoiced-receipts
-- @gap: A2b
-- @risk: low
-- @type: sql
-- @description: Backfill C_BP_Group_Acct.NotInvoicedReceipts_Acct on posting-account rows created before the schema's Not-Invoiced-Receipts default existed, left permanently NULL by the insert-only NOT EXISTS guard (ETP-4706)

-- ETP-4706: "Contabilizar" fails on purchase Goods Receipts with a generic
-- "Account could not be found." error. Root cause traced (not a NeoHandler bug,
-- not a product/product-category account gap): Etendo's native posting engine
-- (org.openbravo.erpCommon.ad_forms.AcctServer#getAccount, ACCTTYPE_NotInvoicedReceipts
-- = "51") resolves this account entirely by BUSINESS-PARTNER GROUP, never by
-- product or product category:
--   SELECT NotInvoicedReceipts_Acct FROM C_BP_Group_Acct a, C_BPartner bp
--   WHERE a.C_BP_Group_ID = bp.C_BP_Group_ID AND bp.C_BPartner_ID = ?
--     AND a.C_AcctSchema_ID = ?
-- (org/openbravo/erpCommon/ad_forms/AcctServer_data.xsql, selectNotInvoicedReceiptsAcct).
-- Confirmed via information_schema.columns that neither M_Product_Category_Acct
-- nor M_Product_Acct even HAS a not-invoiced-receipts column — the ticket's
-- original "missing product-category column" diagnosis does not apply.
--
-- Live-DB diagnosis (GOClient, client 802509E12436405C86BA1FD5B1DF508C, schema
-- "Esquema GO" C06B100312FA48159DB36B9A4B461019): the "Cliente" BP group
-- (formerly "Consumidor Final", id DBBD00C9E0B9442188FCDDA3F601DAEA) has a
-- C_BP_Group_Acct row for this schema whose notinvoicedreceipts_acct is NULL,
-- while C_AcctSchema_Default.notinvoicedreceipts_acct on the same schema IS
-- populated. The row was created 2026-04-07 (well before this account's
-- current default existed) and was never revisited: the onboarding insert
-- (OnboardingAccountingWiringService#provisionEntityPostingAccounts,
-- BP_GROUP_ACCT_SQL) is guarded by `NOT EXISTS` at the ROW level, so an
-- existing-but-incomplete row is never backfilled once created.
--
-- SCOPE CONFIRMED CORRECTIVE-ONLY -- no preventive fix shipped alongside this.
-- Swept every BP group on this DB across every tenant: every OTHER group
-- (including tenants onboarded via the CURRENT onboarding code the same day
-- this was diagnosed, e.g. "Empresa E2E d5be89a8") already has
-- notinvoicedreceipts_acct populated. A brand-new tenant is NOT born with this
-- gap; only this one pre-existing GOClient row is affected on this DB. Per
-- docs/etendo-ad/onboarding-and-datafixes-map.md §0 "Boundary": a gap that is
-- purely about existing-tenant state with no onboarding-process cause may ship
-- corrective-only, stated explicitly. ONBOARDING_PROVISIONED_THROUGH is
-- deliberately NOT bumped -- there is no corresponding preventive change.
--
-- General/defensive: scoped by :client_id (not hardcoded to GOClient) and by
-- "column still NULL, default now available", so it also self-heals any other
-- tenant that develops the same drift in the future, without re-touching rows
-- that are already correct.

-- @check
-- Returns >=1 row when a bp-group posting-account row is missing its
-- Not-Invoiced-Receipts account even though the accounting schema has one to
-- source from. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_bp_group_acct a
JOIN c_bp_group g ON g.c_bp_group_id = a.c_bp_group_id
JOIN c_acctschema_default d ON d.c_acctschema_id = a.c_acctschema_id
WHERE g.ad_client_id = :client_id
  AND a.notinvoicedreceipts_acct IS NULL
  AND d.notinvoicedreceipts_acct IS NOT NULL
LIMIT 1;

-- @apply
UPDATE c_bp_group_acct a
SET notinvoicedreceipts_acct = d.notinvoicedreceipts_acct,
    updated = now(),
    updatedby = '0'
FROM c_bp_group g, c_acctschema_default d
WHERE a.c_bp_group_id = g.c_bp_group_id
  AND a.c_acctschema_id = d.c_acctschema_id
  AND g.ad_client_id = :client_id
  AND a.notinvoicedreceipts_acct IS NULL
  AND d.notinvoicedreceipts_acct IS NOT NULL;
