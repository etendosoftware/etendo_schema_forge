-- @id: R29-transfer-link-multicurrency
-- @gap: G1
-- @risk: low
-- @type: sql
-- @description: Enable multicurrency (payin + payout) with NO bank-transfer exception on every
--   payment method and per-account link — supersedes R14-payment-method-multicurrency (ETP-5084)

-- Background
-- --------------------------------------------------------------------------------------------
-- ETP-4503 (data-fix R14) enabled multicurrency on every payment method and per-account link with
-- ONE exception: the bank-transfer link on a Bank account with an active PSD2 connection was forced
-- OFF, on the premise that "a PSD2 transfer executes in the account's own currency, so multicurrency
-- on that link would be misleading".
--
-- ETP-5084 retires that premise. A PIS transfer does execute in the account's own currency — but
-- that is exactly why it CAN settle an invoice in another currency: the amount is converted to the
-- account currency (with the invoice's own conversion rate, the same one the resulting FIN_Payment
-- is booked at) before the bank is instructed. So a cross-currency transfer is a supported
-- operation, and the transfer link is multicurrency like every other payment method.
--
-- Consequences of the old exception, both repaired here:
--   1. cross-currency bank RECONCILIATION through the transfer method was refused outright by
--      ReconciliationPaymentService.assertMethodMultiCurrency ("...is not enabled for
--      multi-currency, so an invoice in a different currency cannot be reconciled against it");
--   2. the flags silently diverged from every other payment method on exactly the accounts that
--      needed them most — the connected ones.
--
-- Multicurrency is TWO columns — payin_ismulticurrency AND payout_ismulticurrency — on BOTH
-- fin_paymentmethod (the method template) and fin_finacc_paymentmethod (the per-account link).
-- Unlike R14 this fix treats them uniformly: no method, no account type and no connection state is
-- excluded, which is what makes it a strict superset of R14's effects 1a + 1b and the inverse of
-- its effect 2. There is therefore no need to identify the transfer method at all — the fragile
-- `em_psd2_is_bank_transfer='Y' OR name IN (...)` predicate R14/R15/R24 need is simply absent here.
--
-- Why R14 is retired rather than left in place
-- --------------------------------------------------------------------------------------------
-- R14's own effect 2 ACTIVELY disables the transfer link, and its @check has no awareness it was
-- superseded: on any tenant that has not run it yet it would re-apply the removed exception, and on
-- a tenant that has, the two fixes would fight on every run (R29 turns the link on, R14 turns it
-- back off). R14 is therefore retired via cli/src/data-fixes/retired.json (ETP-5084), leaving its
-- .sql byte-for-byte untouched per the immutability rule. This fix subsumes everything R14 did that
-- is still wanted.
--
-- Preventive twin (new tenants born correct — no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Static: referencedata/sampledata/GOClient/{FIN_PAYMENTMETHOD,FIN_FINACC_PAYMENTMETHOD}.xml
--   already ship PAYIN/PAYOUT_ISMULTICURRENCY='Y' on all methods + links (R14 aligned them, and the
--   seeded Bank account has no PSD2 connection, so nothing there relied on the exception).
-- Runtime: FinancialAccountSupport.createLink still sets multicurrency true on runtime-created
--   links; the call that cleared it afterwards
--   (FinancialAccountBankConnectionHandler.linkAccount -> disableMulticurrencyForBankTransfer) was
--   REMOVED by ETP-5084, together with the helper itself. So connecting an account to its bank no
--   longer changes these flags at all.
-- ONBOARDING_PROVISIONED_THROUGH is intentionally NOT bumped: this .sql only repairs existing
--   tenants; new tenants are born correct via the sampledata above.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Two-layer: @check returns >=1 row only while some method or link is still 'N'; each @apply UPDATE
-- is additionally guarded on the same condition, so a re-run matches 0 rows. Every statement is
-- scoped to ad_client_id = :client_id (tenant isolation). Nothing is ever set to 'N' by this fix,
-- so it cannot undo a deliberate administrator choice made after it ran — it only ever completes
-- the "multicurrency ON by default" baseline.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
-- (a) a method template still 'N' on either direction; (b) a per-account link still 'N'.
SELECT 1
FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND (pm.payin_ismulticurrency = 'N' OR pm.payout_ismulticurrency = 'N')
UNION ALL
SELECT 1
FROM fin_finacc_paymentmethod fpm
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'N' OR fpm.payout_ismulticurrency = 'N')
LIMIT 1;

-- @apply
-- Effect 1 — every method template, both directions.
UPDATE fin_paymentmethod pm
SET payin_ismulticurrency = 'Y',
    payout_ismulticurrency = 'Y',
    updated = now(),
    updatedby = '0'
WHERE pm.ad_client_id = :client_id
  AND (pm.payin_ismulticurrency = 'N' OR pm.payout_ismulticurrency = 'N');

-- Effect 2 — every per-account link, both directions. No exception: this is the row the runtime
-- actually reads, and it is what R14's effect 2 had forced OFF on PSD2-connected Bank accounts.
UPDATE fin_finacc_paymentmethod fpm
SET payin_ismulticurrency = 'Y',
    payout_ismulticurrency = 'Y',
    updated = now(),
    updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'N' OR fpm.payout_ismulticurrency = 'N');
