-- @id: R14-payment-method-multicurrency
-- @gap: G1
-- @risk: low
-- @type: sql
-- @description: Enable multicurrency (payin + payout) on all payment methods and per-account
--   links, except the bank-transfer link on Bank accounts with an active PSD2 connection — ETP-4503
--
-- Background
-- --------------------------------------------------------------------------------------------
-- The four payment methods Etendo GO seeds for every client (Efectivo, Transferencia bancaria,
-- Cheque, Tarjeta) and their per-account links are born with multicurrency OFF
-- (payin_ismulticurrency='N', payout_ismulticurrency='N') — the column default. The business
-- requirement is that ALL payment methods have multicurrency ACTIVE by default, with a single
-- exception: on Bank accounts (type='B') with an active PSD2 connection, the "Transferencia
-- bancaria" per-account link must have multicurrency DISABLED (a PSD2 transfer executes in the
-- account's own currency, so multicurrency on that link would be misleading).
--
-- Multicurrency is TWO columns — payin_ismulticurrency AND payout_ismulticurrency — on BOTH
-- fin_paymentmethod (the method template) and fin_finacc_paymentmethod (the per-account link).
-- The PSD2 exception is applied on the per-account LINK only; the method template stays 'Y'.
--
-- Identifying "Transferencia bancaria"
-- --------------------------------------------------------------------------------------------
-- The intended stable key is fin_paymentmethod.em_psd2_is_bank_transfer='Y' (a PSD2-module
-- extension column). BUT on the live GOClient DB that flag is 'N' on every method (verified: all
-- 42 methods across the fleet have em_psd2_is_bank_transfer='N') — it diverges from the bundled
-- sampledata XML, which ships it 'Y' for Transferencia bancaria. So this fix identifies the
-- transfer method by the flag WITH a name fallback: em_psd2_is_bank_transfer='Y'
-- OR name IN ('Transferencia bancaria','Transferencia').
--
-- "Active PSD2 connection"
-- --------------------------------------------------------------------------------------------
-- Two independent signals, either one counts (they can point at the same or different accounts):
--   (a) fin_financial_account.em_psd2_connection_status='CO'
--       (BankIntegrationConstants.FA_CONNECTION_STATUS_CONNECTED), and/or
--   (b) an active row in psd2_finacc_connection (connection_status='AC' AND isactive='Y').
-- Live sweep at authoring time found exactly ONE such account fleet-wide: GOClient's "Societe
-- Generale Luxembourg Corporate" (type='B', status='CO', + active connection); its Transferencia
-- bancaria link is already 'N'/'N', so effect (2) is a no-op there — but effect (1) MUST NOT flip
-- it to 'Y', which the exclusion guarantees.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Two-layer: @check returns >=1 row only while some correction is still pending; each @apply
-- UPDATE is guarded so a re-run matches 0 rows. After a successful run every non-exception
-- method/link is 'Y'/'Y' and every exception link is 'N'/'N', so both @check and @apply are inert
-- on the second pass. Every statement is scoped to ad_client_id = :client_id (tenant isolation).
--
-- Preventive twin (new tenants born correct — no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Static: referencedata/sampledata/GOClient/{FIN_PAYMENTMETHOD,FIN_FINACC_PAYMENTMETHOD}.xml ship
--   PAYIN/PAYOUT_ISMULTICURRENCY='Y' on all 4 methods + all 5 links (the seeded Bank account has
--   no PSD2, so its Transferencia link is correctly 'Y'); OnboardingSteps SeedReferenceDataStep
--   aligned to set true.
-- Runtime: FinancialAccountSupport.createLink sets multicurrency true on runtime-created links;
--   FinancialAccountPsd2Handler disables it on the transfer link when a Bank account is connected
--   to PSD2 (createAndLink + link paths), via FinancialAccountSupport.disableMulticurrencyForBankTransfer.
-- ONBOARDING_PROVISIONED_THROUGH is intentionally NOT bumped: this .sql only repairs legacy
--   tenants; new tenants are born correct via the sampledata above, so the watermark stays put.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
-- (a) a method template still 'N'; (b) a non-exception link still 'N'; (c) an exception link 'Y'.
SELECT 1
FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND (pm.payin_ismulticurrency = 'N' OR pm.payout_ismulticurrency = 'N')
UNION ALL
SELECT 1
FROM fin_finacc_paymentmethod fpm
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'N' OR fpm.payout_ismulticurrency = 'N')
  AND NOT (
    EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
        AND (pm.em_psd2_is_bank_transfer = 'Y'
             OR pm.name IN ('Transferencia bancaria', 'Transferencia'))
    )
    AND EXISTS (
      SELECT 1 FROM fin_financial_account fa
      WHERE fa.fin_financial_account_id = fpm.fin_financial_account_id
        AND fa.type = 'B'
        AND (fa.em_psd2_connection_status = 'CO'
             OR EXISTS (
               SELECT 1 FROM psd2_finacc_connection pc
               WHERE pc.fin_financial_account_id = fa.fin_financial_account_id
                 AND pc.connection_status = 'AC'
                 AND pc.isactive = 'Y'
             ))
    )
  )
UNION ALL
SELECT 1
FROM fin_finacc_paymentmethod fpm
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'Y' OR fpm.payout_ismulticurrency = 'Y')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND (pm.em_psd2_is_bank_transfer = 'Y'
           OR pm.name IN ('Transferencia bancaria', 'Transferencia'))
  )
  AND EXISTS (
    SELECT 1 FROM fin_financial_account fa
    WHERE fa.fin_financial_account_id = fpm.fin_financial_account_id
      AND fa.type = 'B'
      AND (fa.em_psd2_connection_status = 'CO'
           OR EXISTS (
             SELECT 1 FROM psd2_finacc_connection pc
             WHERE pc.fin_financial_account_id = fa.fin_financial_account_id
               AND pc.connection_status = 'AC'
               AND pc.isactive = 'Y'
           ))
  )
LIMIT 1;

-- @apply
-- Effect 1a — enable multicurrency on every method template (no PSD2 exception at template level).
UPDATE fin_paymentmethod pm
SET payin_ismulticurrency = 'Y',
    payout_ismulticurrency = 'Y',
    updated = now(),
    updatedby = '0'
WHERE pm.ad_client_id = :client_id
  AND (pm.payin_ismulticurrency = 'N' OR pm.payout_ismulticurrency = 'N');

-- Effect 1b — enable multicurrency on every per-account link EXCEPT the transfer link on a
-- Bank account with an active PSD2 connection.
UPDATE fin_finacc_paymentmethod fpm
SET payin_ismulticurrency = 'Y',
    payout_ismulticurrency = 'Y',
    updated = now(),
    updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'N' OR fpm.payout_ismulticurrency = 'N')
  AND NOT (
    EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
        AND (pm.em_psd2_is_bank_transfer = 'Y'
             OR pm.name IN ('Transferencia bancaria', 'Transferencia'))
    )
    AND EXISTS (
      SELECT 1 FROM fin_financial_account fa
      WHERE fa.fin_financial_account_id = fpm.fin_financial_account_id
        AND fa.type = 'B'
        AND (fa.em_psd2_connection_status = 'CO'
             OR EXISTS (
               SELECT 1 FROM psd2_finacc_connection pc
               WHERE pc.fin_financial_account_id = fa.fin_financial_account_id
                 AND pc.connection_status = 'AC'
                 AND pc.isactive = 'Y'
             ))
    )
  );

-- Effect 2 — disable multicurrency on the transfer link of Bank accounts with active PSD2.
UPDATE fin_finacc_paymentmethod fpm
SET payin_ismulticurrency = 'N',
    payout_ismulticurrency = 'N',
    updated = now(),
    updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND (fpm.payin_ismulticurrency = 'Y' OR fpm.payout_ismulticurrency = 'Y')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND (pm.em_psd2_is_bank_transfer = 'Y'
           OR pm.name IN ('Transferencia bancaria', 'Transferencia'))
  )
  AND EXISTS (
    SELECT 1 FROM fin_financial_account fa
    WHERE fa.fin_financial_account_id = fpm.fin_financial_account_id
      AND fa.type = 'B'
      AND (fa.em_psd2_connection_status = 'CO'
           OR EXISTS (
             SELECT 1 FROM psd2_finacc_connection pc
             WHERE pc.fin_financial_account_id = fa.fin_financial_account_id
               AND pc.connection_status = 'AC'
               AND pc.isactive = 'Y'
           ))
  );
