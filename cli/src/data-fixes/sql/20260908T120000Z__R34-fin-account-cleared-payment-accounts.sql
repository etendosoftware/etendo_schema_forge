-- @id: R34-fin-account-cleared-payment-accounts
-- @gap: A8
-- @risk: medium
-- @type: sql
-- @description: ETP-5207 — empty FIN_FINANCIAL_ACCOUNT_ACCT.fin_in_clear_acct / fin_out_clear_acct (DAL clearedPaymentAccount / clearedPaymentAccountOUT), which core's FIN_FINANCIAL_ACCOUNT_TRG (and R22's own frozen backfill) seed with the ledger asset account 57200000 even though the functional default for every account type (Banco/Caja/Tarjeta) is EMPTY; scope is EVERY account, deliberately including those that already have POSTED reconciliation documents, so that no account is left able to post a reconciliation; the ONLY rows skipped are Bank rows that would trip APRM_FIN_FINACC_ACCT_CHECK_TRG, and those are listed by @report

-- Background
-- ----------
-- Core's AFTER INSERT trigger src-db/database/model/triggers/FIN_FINANCIAL_ACCOUNT_TRG.xml
-- (lines 53-65) creates the fin_financial_account_acct row for every LIVE financial-account
-- creation and sets fin_in_clear_acct = fin_out_clear_acct = v_AssetAccount (B_Asset_Acct, or
-- CB_Asset_Acct when type='C', from C_AcctSchema_Default -> 57200000 on a PGC España chart).
-- Both columns are nullable (ISMANDATORY=N) and the functional default for all three account
-- types is EMPTY. The trigger is CORE and must not be modified.
--
-- Why it matters: a non-null cleared account is exactly what makes DocFINReconciliation queue a
-- reconciliation for posting (#getDocumentConfirmation, DocFINReconciliation.java:1351-1390), so
-- reconciliations were being posted and generating accounting entries that distorted Sumas y
-- Saldos, Libro Mayor and the rest of the accounting reports.
--
-- Two other fronts ship with this fix (repo com.etendoerp.go, same task):
--   * Runtime   — FinancialAccountAccountingDefaultsSupport.applyDefaultsForType now calls
--                 setClearedPaymentAccount(null)/setClearedPaymentAccountOUT(null) explicitly.
--                 applyIfResolved only ever SET, so "never set here" left the trigger's value in
--                 place; clearing is required, not merely omitting.
--   * Onboarding — OnboardingAccountingWiringService.FIN_FINANCIAL_ACCOUNT_ACCT_SQL no longer
--                 selects the two columns. NOTE that INSERT, not the GOClient sampledata XML, is
--                 what a new tenant actually gets: FIN_FINANCIAL_ACCOUNT_ACCT is absent from
--                 OnboardingDatasetDefinition.INCLUDED_TABLES, so that XML is never imported.
--                 (It was cleaned in the same pass for template consistency only.)
--
-- ONBOARDING_PROVISIONED_THROUGH (OnboardingBaselineService) is deliberately NOT bumped: with the
-- onboarding edit above a newborn tenant is born correct, so this fix's @check returns 0 rows for
-- it and the runner records a clean SKIPPED_NOT_NEEDED. That constant's own contract reserves CUT
-- bumps for fixes whose @check WOULD still match on a correctly provisioned new tenant.
--
-- Relationship to R22 (immutable, NOT retired): 20260805T140000Z__R22-fin-account-warehouse-acct
-- backfills fin_financial_account_acct for legacy tenants and, mirroring the trigger, fills both
-- clear columns. R22 stays exactly as applied; this fix sorts after it in the chain, so a tenant
-- that runs both ends up correct. Do not edit or retire R22.
--
-- Scope: ALL accounts, including those with posted reconciliations (functional decision)
-- ---------------------------------------------------------------------------------------
-- An earlier draft of this fix skipped any account that already had a POSTED reconciliation, on
-- the grounds that its FACT_ACCT entries were produced USING the cleared account. That guard was
-- REMOVED on the product owner's explicit instruction, with the trade-off on the table: leaving
-- those accounts configured means they can still post new reconciliations, which defeats the whole
-- point of ETP-5207. Stopping that is worth more than keeping the old documents reproducible.
--
-- What that costs, recorded so nobody rediscovers it as a surprise:
--   * Existing entries are NOT deleted. Blanking a column does not touch FACT_ACCT; every
--     reconciliation already posted stays posted, and the ledger is unchanged.
--   * Those old documents can no longer be re-posted identically. A "reset accounting" + repost
--     would either stop posting silently (STATUS_DocumentDisabled) or, on a document that mixes a
--     line still passing the gate with a bank-fee/GL-item line, fail outright: createFact iterates
--     every p_line (DocFINReconciliation.java:722-734) while createFactFee (:772) and
--     createFactGLItem call getClearOutAccount/getAccount unconditionally, and that method
--     dereferences getClearedPaymentAccount(OUT)().getId() with no null check (:1589-1615).
--   * A related core trigger, APRM_FIN_FINACC_TRAN_CHECK_TRG (:84-94), raises
--     @APRM_RelatedPostedDocument@ when a FIN_FINACC_TRANSACTION belonging to a POSTED
--     reconciliation is UPDATED while its payment method uses UPONDEPOSITUSE/UPONWITHDRAWALUSE =
--     'CLE' and the matching clear column is NULL. It fires on fin_finacc_transaction, NOT on the
--     table this fix updates, so it cannot fail this fix -- but on such an account, later edits to
--     those transactions would be refused. Verified on the dev DB: no GO-provisioned tenant has a
--     'CLE'-on-deposit/withdrawal method (GOClient's affected account carries only "Recibo", which
--     is DEP/WIT). The only links that do are on QA Testing, which does not run the GO sampledata
--     at all -- it derives from F&B -- so this is not a GO-fleet concern. Re-check per tenant with:
--       SELECT name, upondeposituse, uponwithdrawaluse FROM fin_paymentmethod
--       WHERE ad_client_id = <client> AND 'CLE' IN (upondeposituse, uponwithdrawaluse);
--
-- Guard (the only one left) — Bank rows that would trip APRM_FIN_FINACC_ACCT_CHECK_TRG
-- ------------------------------------------------------------------------------------
-- Kept because it is a TECHNICAL necessity, not a functional choice: without it a single bad row
-- fails the fix for the entire tenant, so nothing gets cleaned at all.
-- modules_core/org.openbravo.advpaymentmngt/src-db/database/model/triggers/
-- APRM_FIN_FINACC_ACCT_CHECK_TRG.xml fires BEFORE INSERT **and UPDATE** and raises
-- @APRM_GainLossFeeAccountsError@ on any row whose account type is 'B' and whose
-- fin_bankfee_acct / fin_bankrevaluationgain_acct / fin_bankrevaluationloss_acct is NULL. In
-- PostgreSQL that aborts the whole transaction, i.e. a single such row would turn this fix into
-- FAILED for the entire tenant. Expected to be empty on a healthy tenant (the same trigger gates
-- the INSERT), but a tenant with an incomplete c_acctschema_default is exactly where it bites.
--
-- Idempotency: @check gates on the same predicate @apply guards on, so a re-run after success
-- matches 0 rows -> SKIPPED_NOT_NEEDED. Rows where both columns are already NULL are never
-- touched, so the BEFORE-UPDATE check trigger is not even reached for them. Every statement in
-- @check, @apply and @report is scoped to :client_id.
--
-- Live dry-run validation (2026-09-08, shared dev DB, one rolled-back transaction per tenant)
-- -------------------------------------------------------------------------------------------
-- Ran @check -> @apply -> @report -> @check again for all 27 non-System clients. EXPLAIN first
-- confirmed all three blocks parse against the real schema. Every tenant CONVERGES: the post-apply
-- @check returns 0 rows in 27/27 cases. Row counts: GOClient 7, Empresa fantasma S.A 5, QA Testing
-- 2, F&B International Group 1, plus 3-4 each across the 21 E2E/demo tenants.
--
-- The guards are NOT dead code: 5 (account, ledger) rows are protected and listed by @report --
-- 1 on GOClient (the account literally named "Cuenta bug", which is also the only posted
-- reconciliation on that tenant AND carries a GL-item cash-close line) and 4 on QA Testing
-- ("Accounting Documents DOLLAR"/"EURO", 2 ledgers each). All 5 under guard 1. Guard 2 fired
-- nowhere on this DB -- expected, since the same trigger gates the INSERT; it exists for a tenant
-- with an incomplete c_acctschema_default (gap A2d), where it prevents the fix from failing the
-- whole tenant.

-- @check
-- Returns >=1 row when at least one FIXABLE row still carries a cleared payment account.
-- 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM fin_financial_account_acct a
JOIN fin_financial_account f ON f.fin_financial_account_id = a.fin_financial_account_id
                            AND f.ad_client_id = :client_id
WHERE a.ad_client_id = :client_id
  AND (a.fin_in_clear_acct IS NOT NULL OR a.fin_out_clear_acct IS NOT NULL)
  AND NOT (f.type = 'B' AND (a.fin_bankfee_acct IS NULL
                             OR a.fin_bankrevaluationgain_acct IS NULL
                             OR a.fin_bankrevaluationloss_acct IS NULL))
LIMIT 1;

-- @apply
-- Deliberately the same predicate as @check (textually parallel, so the two can be eyeballed
-- against each other) -- that is also the defensive second idempotency layer: partial or
-- concurrent state is safe and a re-run is a no-op.
UPDATE fin_financial_account_acct a
SET fin_in_clear_acct  = NULL,
    fin_out_clear_acct = NULL,
    updated            = now(),
    updatedby          = '0'
FROM fin_financial_account f
WHERE f.fin_financial_account_id = a.fin_financial_account_id
  AND f.ad_client_id = :client_id
  AND a.ad_client_id = :client_id
  AND (a.fin_in_clear_acct IS NOT NULL OR a.fin_out_clear_acct IS NOT NULL)
  AND NOT (f.type = 'B' AND (a.fin_bankfee_acct IS NULL
                             OR a.fin_bankrevaluationgain_acct IS NULL
                             OR a.fin_bankrevaluationloss_acct IS NULL));

-- @report
-- Read-only, runs after a successful @apply in the SAME transaction, so anything still carrying a
-- cleared account here is exactly what the ONE remaining guard protected: a type-'B' row whose
-- bankfee/revaluation accounts are NULL, which APRM_FIN_FINACC_ACCT_CHECK_TRG would refuse to let
-- us update. Expected to be EMPTY on a healthy tenant (the same trigger gates the INSERT), leaving
-- `detail` null on the APPLIED ledger row. A non-empty result means the tenant has an incomplete
-- c_acctschema_default (gap A2d): fill the Bank row's gain/loss/fee accounts, then force a re-run
-- with FIX=R34-fin-account-cleared-payment-accounts.
--
-- It also doubles as a post-condition: since the posted-reconciliation guard was dropped, there is
-- no other legitimate "left behind" case, so a row here that is NOT missing those three accounts
-- would mean something raced the UPDATE and is worth investigating.
SELECT f.name                AS financial_account,
       f.type                AS account_type,
       s.name                AS ledger,
       vin.combination       AS in_clear_acct,
       vout.combination      AS out_clear_acct,
       'skipped: Bank row missing bankfee/revaluation account(s) - APRM check trigger'
                             AS reason
FROM fin_financial_account_acct a
JOIN fin_financial_account f ON f.fin_financial_account_id = a.fin_financial_account_id
                            AND f.ad_client_id = :client_id
JOIN c_acctschema s ON s.c_acctschema_id = a.c_acctschema_id
                   AND s.ad_client_id = :client_id
LEFT JOIN c_validcombination vin ON vin.c_validcombination_id = a.fin_in_clear_acct
                                AND vin.ad_client_id = :client_id
LEFT JOIN c_validcombination vout ON vout.c_validcombination_id = a.fin_out_clear_acct
                                 AND vout.ad_client_id = :client_id
WHERE a.ad_client_id = :client_id
  AND (a.fin_in_clear_acct IS NOT NULL OR a.fin_out_clear_acct IS NOT NULL)
ORDER BY f.name, s.name;
