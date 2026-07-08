-- @id: R13-amortization-table-active
-- @gap: A4
-- @risk: low
-- @type: sql
-- @description: Activate accounting for the A_Amortization table (AD_Table_id 800060,
--   "FinancialMgmtAmortization") on C_AcctSchema_Table so amortization documents can post — ETP-4452
--
-- Background
-- --------------------------------------------------------------------------------------------
-- GOClient's live C_ACCTSCHEMA_TABLE row for AD_Table_id 800060 (id
-- DAE3C688574C4919B889DA7EFAD6CC5C, schema "Esquema GO") is ISACTIVE='Y' — someone manually
-- corrected it in the live DB at some point. But the bundled onboarding dataset
-- (referencedata/sampledata/GOClient/C_ACCTSCHEMA_TABLE.xml, same row/id) still ships ISACTIVE='N'.
-- Same class of drift as the earlier write-off-account and BP-category gaps this session: the live
-- DB was patched by hand without the fix ever being captured back into the dataset, so any
-- environment re-provisioned from this dataset (a fresh "Experimental" cloud reset included) is
-- born with the table inactive and amortization postings fail with "Account not defined" /
-- table-not-postable errors.
--
-- Scope — every tenant, no exclusions (revised 2026-07-08)
-- --------------------------------------------------------------------------------------------
-- This fix originally scoped itself to the GOClient-style PGC-chart family only, via an
-- EXISTS-65000000-marker guard (same pattern as R12), deliberately excluding QA Testing and
-- TaxesOrg pending a business decision on whether amortization accounting applied to them at all
-- (their charts carry no 65000000 leaf and, at the time, zero A_Asset records). The reporter has
-- since confirmed amortization accounting should be active for every known tenant regardless of
-- chart family or current asset data — proactively for TaxesOrg ("in case that organization
-- creates an asset in the future"), and unconditionally for QA Testing (the distinction was
-- functionally moot: "QA Testing is not used"). The marker guard is removed entirely; this fix now
-- applies to any client whose C_AcctSchema_Table row for this table is not yet active — a live
-- sweep at revision time found GOClient and F&B International Group already 'Y' (no-op here),
-- acreedortest/acreetest2/empresa/QA Testing (both schemas)/TaxesOrg all 'N' → activated.
--
-- Scope of the @apply — UPDATE only, on purpose
-- --------------------------------------------------------------------------------------------
-- Every affected tenant observed live already carries the 800060 row, just inactive — none is
-- missing it outright. So @apply is a plain UPDATE. A tenant missing the row entirely (not
-- observed at revision time) is a different shape (an INSERT, needing a fresh per-schema id) and
-- is deliberately NOT handled here — the `@uuid_<KEY>@` placeholder is a static text label
-- substituted once per whole @apply body, so it cannot mint a distinct id per row for a
-- variable-cardinality subquery (a tenant could have 1 or more schemas). If that gap is ever
-- found live, ship it as its own dedicated fix (same call R1 makes for its own analogous B1 edge
-- case).
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check mirrors @apply's guard exactly (row exists AND ISACTIVE <> 'Y'), so a re-run after
-- success — or a tenant whose row was never inactive, or one missing the row entirely (out of
-- this fix's scope, see above) — always yields 0 check rows.
--
-- Preventive twin
-- --------------------------------------------------------------------------------------------
-- referencedata/sampledata/GOClient/C_ACCTSCHEMA_TABLE.xml — row C_ACCTSCHEMA_TABLE_ID
-- DAE3C688574C4919B889DA7EFAD6CC5C flipped ISACTIVE from 'N' to 'Y', so every NEW tenant onboarded
-- from this dataset is born with amortization accounting active. ONBOARDING_PROVISIONED_THROUGH
-- bumped to 2026-07-08T10:00:00Z in OnboardingBaselineService.java.

-- @check
SELECT 1
FROM c_acctschema_table t
WHERE t.ad_client_id = :client_id
  AND t.ad_table_id = '800060'
  AND t.isactive <> 'Y'
LIMIT 1;

-- @apply
-- Shape 1: row exists but inactive.
UPDATE c_acctschema_table t
SET isactive = 'Y', updated = now(), updatedby = '0'
WHERE t.ad_client_id = :client_id
  AND t.ad_table_id = '800060'
  AND t.isactive <> 'Y';
