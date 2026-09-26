-- @id: R40-internal-consumption-table-active
-- @gap: A4b
-- @risk: low
-- @type: sql
-- @description: Activate accounting for the M_Internal_Consumption table (AD_Table_id 800168) on C_AcctSchema_Table so Internal Consumption documents can post and appear in unposted documents — ETP-5445
--   Only the first line of @description reaches the ledger.
--
-- Background (ETP-5445, gap A4b — same drift family as A4/R13)
-- --------------------------------------------------------------------------------------------
-- The curated onboarding dataset
-- (com.etendoerp.go/referencedata/sampledata/GOClient/C_ACCTSCHEMA_TABLE.xml) ships the
-- C_AcctSchema_Table row for AD_Table_id 800168 (M_Internal_Consumption) with ISACTIVE='N'.
-- Every tenant born from that dataset therefore has Internal Consumption disabled for posting on
-- its accounting schema(s): the posting engine skips the table, so an Internal Consumption
-- document can never be posted and never shows up in "Documentos no contabilizados" either.
-- Exactly the A4 shape (A_Amortization, AD_Table_id 800060, R13) for a table TC-39's checklist
-- also never covered.
--
-- DB-state investigation (2026-09-23, local dev DB, read-only, confirmed by query)
-- --------------------------------------------------------------------------------------------
--   * 7 non-System clients, 9 accounting schemas (F&B International Group and QA Testing carry
--     two each). EVERY one of the 9 schemas already HAS the 800168 row — and every one is 'N'
--     (GOClient, F&B International Group x2, QA Testing x2, four "E2E User ..." tenants).
--   * ZERO schemas are missing the row outright, so an UPDATE covers the whole observed fleet.
--   * The only client without any C_AcctSchema is System ('0'), which the runner's default
--     tenant universe excludes anyway.
--
-- Scope of the @apply — UPDATE only, on purpose (same call as R13)
-- --------------------------------------------------------------------------------------------
-- A tenant missing the row entirely would need an INSERT with a fresh per-schema id. The
-- `@uuid_<KEY>@` placeholder is substituted once per @apply body, so it cannot mint a distinct id
-- per row of a variable-cardinality subquery (a tenant can have 1..N schemas). No such tenant was
-- observed; if one is ever found, ship it as its own dedicated fix. Such a tenant makes this
-- fix's @check return 0 rows (nothing to update), so it is recorded SKIPPED_NOT_NEEDED rather
-- than erroring — see @report below, which does NOT run in that case; detect it with the
-- verification query at the end of this header instead.
--
-- Tenant scope
-- --------------------------------------------------------------------------------------------
-- Every non-System tenant the runner resolves (ad_client_id <> '0'), no chart-family marker and
-- no allowlist — R13 established that every tenant should have a table-posting flag like this
-- active regardless of chart family or current document data. Both statements filter
-- ad_client_id = :client_id.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check mirrors @apply's guard exactly (row exists AND isactive IS DISTINCT FROM 'Y'), so a
-- re-run after success — or a tenant already active — yields 0 check rows (SKIPPED_NOT_NEEDED),
-- and the UPDATE itself touches 0 rows if it ever runs against already-active state.
--
-- Posting prerequisites (not changed by this fix, checked 2026-09-23)
-- --------------------------------------------------------------------------------------------
-- DocInternalConsumption posts COGS vs. Asset per line (ProductInfo.ACCTTYPE_P_Cogs /
-- ACCTTYPE_P_Asset from M_Product_Acct) and requires the line's transaction cost to be
-- calculated. C_AcctSchema_Default has both accounts on every tenant; M_Product_Acct has both on
-- every product except 4 F&B International Group products with a NULL P_Cogs_Acct (demo data,
-- out of scope). Activating the table is necessary, not by itself sufficient, for a document on
-- such a product to post.
--
-- Preventive twin
-- --------------------------------------------------------------------------------------------
-- Dataset-only, shipped separately under ETP-5445: GOClient/C_ACCTSCHEMA_TABLE.xml flips the
-- 800168 row's ISACTIVE to 'Y', so a newborn tenant's @check returns 0 rows here and the runner
-- records a clean SKIPPED_NOT_NEEDED. As with A9/N4/R37, ONBOARDING_PROVISIONED_THROUGH need not
-- be bumped for correctness; if it is bumped, it must equal this file's timestamp
-- (2026-09-23T12:00:00Z).
--
-- Reversibility / rollback
-- --------------------------------------------------------------------------------------------
-- Reversible in data terms: it flips one flag and creates or deletes nothing. A manual revert
-- for one tenant would be:
--   UPDATE c_acctschema_table
--   SET isactive = 'N', updated = now(), updatedby = '0'
--   WHERE ad_client_id = '<client_id>' AND ad_table_id = '800168' AND isactive = 'Y';
-- NOT recommended:
--   * Internal Consumption documents posted while the flag was 'Y' stay posted (their
--     Fact_Acct entries are not removed); the revert only stops NEW postings and hides the rest
--     from "Documentos no contabilizados" again, leaving the books half-posted.
--   * It re-creates the very gap this fix closes, and the ledger row stays APPLIED, so the
--     runner will not re-apply this fix on a later run (only a forced `--fix` would).
--   * Every schema observed was 'N' before this fix, so reverting to 'N' restores the prior
--     state exactly on this fleet; a tenant that was already 'Y' beforehand (none observed) was
--     never touched by @apply and must not be reverted.
--
-- Verification query (read-only; run per tenant before and after, replace :client_id)
-- --------------------------------------------------------------------------------------------
--   SELECT s.name AS acctschema, t.c_acctschema_table_id,
--          COALESCE(t.isactive, 'MISSING') AS isactive
--   FROM c_acctschema s
--   LEFT JOIN c_acctschema_table t
--          ON t.c_acctschema_id = s.c_acctschema_id AND t.ad_table_id = '800168'
--   WHERE s.ad_client_id = :client_id
--   ORDER BY s.name;
-- Expected after apply: every schema 'Y'. 'MISSING' = the out-of-scope INSERT case above.

-- @check
-- Returns >=1 row while any accounting schema of this client still has Internal Consumption
-- disabled for posting.
SELECT 1
FROM c_acctschema_table t
WHERE t.ad_client_id = :client_id
  AND t.ad_table_id = '800168'
  AND t.isactive IS DISTINCT FROM 'Y'
LIMIT 1;

-- @apply
-- Guarded by the same predicate (2nd idempotency layer): only inactive rows are touched.
UPDATE c_acctschema_table t
SET isactive = 'Y',
    updated = now(),
    updatedby = '0'
WHERE t.ad_client_id = :client_id
  AND t.ad_table_id = '800168'
  AND t.isactive IS DISTINCT FROM 'Y';

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Lists any accounting schema
-- of this client that still cannot post Internal Consumption: a row still inactive (should never
-- happen) or no 800168 row at all (the out-of-scope INSERT case). Empty => fully remediated.
SELECT s.name AS acctschema,
       CASE WHEN t.c_acctschema_table_id IS NULL
            THEN 'MISSING c_acctschema_table row for M_Internal_Consumption (800168) - needs a dedicated INSERT fix'
            ELSE 'STILL INACTIVE after apply'
       END AS detail
FROM c_acctschema s
LEFT JOIN c_acctschema_table t
       ON t.c_acctschema_id = s.c_acctschema_id
      AND t.ad_table_id = '800168'
WHERE s.ad_client_id = :client_id
  AND (t.c_acctschema_table_id IS NULL OR t.isactive IS DISTINCT FROM 'Y')
ORDER BY s.name;
