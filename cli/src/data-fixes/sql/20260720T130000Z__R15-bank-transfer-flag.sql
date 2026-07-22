-- @id: R15-bank-transfer-flag
-- @gap: G2
-- @risk: low
-- @type: sql
-- @description: Set em_psd2_is_bank_transfer='Y' on the Transferencia bancaria / Wire Transfer
--   payment method and its per-account links, on both new and existing clients

-- Background
-- --------------------------------------------------------------------------------------------
-- FIN_PaymentMethod.EM_PSD2_Is_Bank_Transfer ("Wire Transfer" in the UI) is the stable identity
-- flag for the bank-transfer payment method: it drives the ETP-4503 multicurrency exception
-- (R14 / FinancialAccountSupport.disableMulticurrencyForBankTransfer) and is itself expected to
-- be checked by default on that method. R14 already documented that the live flag diverges from
-- the seeded value and worked around it with a name fallback for the multicurrency exception —
-- this fix corrects the flag itself, at the root, on both tables where it lives:
--   - fin_paymentmethod (the method template) — sampledata ships 'Y' for NEW clients, but
--     existing (legacy) clients' templates can still be 'N'.
--   - fin_finacc_paymentmethod (the per-account link, the one that drives the checkbox on the
--     account UI) — NEVER set by sampledata nor by runtime link creation until this change, so
--     it is 'N' (column default) on every existing account, new and legacy alike.
--
-- Identifying "Transferencia bancaria"
-- --------------------------------------------------------------------------------------------
-- Since the flag itself is what we're correcting, identification here is by NAME only:
-- name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer') — the three variants
-- observed live across tenants (the third, English, was missing from R14's own fallback list;
-- FinancialAccountSupport.isBankTransferMethod was fixed alongside this fix to include it too).
-- Once this fix runs, downstream code can rely on the flag alone going forward.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns >=1 row only while some row named as above still has the flag off (or NULL).
-- @apply is guarded the same way, so a re-run matches 0 rows. Scoped to ad_client_id = :client_id.
--
-- Preventive twin (new tenants born correct — no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Static: referencedata/sampledata/GOClient/FIN_FINACC_PAYMENTMETHOD.xml now ships
--   EM_PSD2_IS_BANK_TRANSFER='Y' on the Transferencia bancaria link (FIN_PAYMENTMETHOD.xml
--   template already had it).
-- Runtime: FinancialAccountSupport.createLink now sets PSD2IsBankTransfer(true) when linking the
--   transfer method, so runtime-created links (manual + PSD2 create-and-link) are born correct.
-- ONBOARDING_PROVISIONED_THROUGH is intentionally NOT bumped: this .sql only repairs legacy
--   tenants; new tenants are born correct via the sampledata/runtime above.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer')
  AND pm.em_psd2_is_bank_transfer IS DISTINCT FROM 'Y'
UNION ALL
SELECT 1
FROM fin_finacc_paymentmethod fpm
WHERE fpm.ad_client_id = :client_id
  AND fpm.em_psd2_is_bank_transfer IS DISTINCT FROM 'Y'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer')
  )
LIMIT 1;

-- @apply
-- Effect 1 — set the identity flag on the method template.
UPDATE fin_paymentmethod pm
SET em_psd2_is_bank_transfer = 'Y',
    updated = now(),
    updatedby = '0'
WHERE pm.ad_client_id = :client_id
  AND pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer')
  AND pm.em_psd2_is_bank_transfer IS DISTINCT FROM 'Y';

-- Effect 2 — set the identity flag on every per-account link of that method (drives the
-- "Wire Transfer" checkbox on the account UI).
UPDATE fin_finacc_paymentmethod fpm
SET em_psd2_is_bank_transfer = 'Y',
    updated = now(),
    updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND fpm.em_psd2_is_bank_transfer IS DISTINCT FROM 'Y'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer')
  );
