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
-- Scope — PGC-chart family only, natural exclusion via the 65000000 marker (R12 precedent)
-- --------------------------------------------------------------------------------------------
-- A live sweep of every non-System client found the AD_Table_id=800060 row's ISACTIVE like this:
--   GOClient='Y' (already fixed live), F&B International Group='Y' (both schemas, already correct),
--   acreedortest='N', acreetest2='N', empresa='N', QA Testing='N' (both schemas), TaxesOrg='N'.
-- acreedortest/acreetest2/empresa are the same GOClient-style 8-digit Spanish PGC chart family
-- documented for R9/R11/R12 (all three already carry a postable, active `65000000` leaf minted by
-- the standard `c_elementvalue_trg()` provisioning) — they get this fix. QA Testing and TaxesOrg run
-- unrelated US-chart schemas with NO 65000000 account at all and ZERO A_Asset records; whether
-- amortization accounting is meant to apply to them at all is a business decision outside this
-- fix's scope, so the @check's EXISTS-65000000 guard naturally excludes them, exactly like R12 —
-- no hardcoded client allowlist. If amortization is later required for a non-PGC chart, that is a
-- new, separate data-fix scoped to that chart family.
--
-- Scope of the @apply — UPDATE only, on purpose
-- --------------------------------------------------------------------------------------------
-- Every affected tenant today (acreedortest/acreetest2/empresa) already carries the 800060 row
-- with ISACTIVE='N' — none is missing it outright. So @apply is a plain UPDATE, matching what was
-- actually observed live. A future PGC-family tenant that is missing the row entirely (not
-- observed today) is a different shape (an INSERT, needing a fresh per-schema id) and is
-- deliberately NOT handled here — the `@uuid_<KEY>@` placeholder is a static text label
-- substituted once per whole @apply body, so it cannot mint a distinct id per row for a
-- variable-cardinality subquery (a tenant could have 1 or 2 schemas). If that gap is ever found
-- live, ship it as its own dedicated fix (same call R1 makes for its own analogous B1 edge case).
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check mirrors @apply's guard exactly (row exists AND ISACTIVE <> 'Y' AND the 65000000 marker
-- exists), so a re-run after success — or a tenant whose row was never inactive, or one missing
-- the row entirely (out of this fix's scope, see above) — always yields 0 check rows.
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
  AND EXISTS (
    SELECT 1 FROM c_elementvalue ev
    WHERE ev.ad_client_id = :client_id AND ev.value = '65000000'
      AND ev.issummary = 'N' AND ev.isactive = 'Y'
  )
LIMIT 1;

-- @apply
-- Shape 1: row exists but inactive.
UPDATE c_acctschema_table t
SET isactive = 'Y', updated = now(), updatedby = '0'
WHERE t.ad_client_id = :client_id
  AND t.ad_table_id = '800060'
  AND t.isactive <> 'Y'
  AND EXISTS (
    SELECT 1 FROM c_elementvalue ev
    WHERE ev.ad_client_id = :client_id AND ev.value = '65000000'
      AND ev.issummary = 'N' AND ev.isactive = 'Y'
  );
