-- @id: R24-transfer-automatic-withdrawn
-- @gap: G4
-- @risk: low
-- @type: sql
-- @description: Clear automatic_withdrawn on the bank-transfer payment method and its per-account
--   links, so a transfer never auto-creates its FIN_Finacc_Transaction (ETP-4891)

-- Background
-- --------------------------------------------------------------------------------------------
-- Etendo Go pays a bank transfer over PIS: the FIN_Finacc_Transaction is created by the Salt Edge
-- callback once the bank reports execution, NOT by the local "process payment" step. With
-- Automatic Withdrawn on, processing the payment ALSO creates the transaction locally, so the same
-- movement lands twice — and `PPM` stops meaning "confirmed but not withdrawn", which the payment
-- windows rely on to show a transfer as in-progress.
--
-- Until ETP-4891 this was handled dynamically and only for accounts connected from the SPA:
-- FinancialAccountBankConnectionHandler cleared the flag on connect and RESTORED it to 'Y' on a
-- permanent disconnect. Two consequences, both repaired here:
--   1. an account that was connected and then disconnected went back to 'Y';
--   2. an account that was never connected was never touched at all.
-- The flag is now an invariant of the METHOD (always off for transfers), independent of any
-- account's connection state — enforced at link creation by FinancialAccountSupport.createLink and
-- seeded as 'N' for new tenants by the FIN_PAYMENTMETHOD / FIN_FINACC_PAYMENTMETHOD sampledata.
-- This fix repairs existing tenants, on both tables where the flag lives:
--   - fin_paymentmethod (the method template) — every existing tenant ships 'Y' here.
--   - fin_finacc_paymentmethod (the per-account link, the one the runtime actually reads).
--
-- Only Automatic Withdrawn (Payment OUT) is cleared. PIS initiates outbound transfers only, so
-- incoming money is unaffected and automatic_deposit is deliberately left as configured — same
-- scope decision the removed runtime code documented.
--
-- Identifying the bank-transfer method
-- --------------------------------------------------------------------------------------------
-- Flag first (em_psd2_is_bank_transfer='Y'), name as fallback: the three variants observed live
-- across tenants ('Transferencia bancaria', 'Transferencia', 'Wire Transfer'). Identical predicate
-- to R14/R15 and to FinancialAccountSupport.isBankTransferMethod — keep the four in lockstep. A
-- 2026-08-21 sweep found the flag alone already sufficient on every tenant (R15 corrected it), so
-- the name arm is belt-and-braces for a tenant that has not had R15 applied yet.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check returns rows only while something is still 'Y', and each @apply is additionally guarded on
-- automatic_withdrawn = 'Y', so re-running touches nothing. A link legitimately already at 'N' (an
-- account connected from the SPA before this change) is left untouched rather than rewritten.

-- @check
-- Returns >=1 row when at least one transfer method or link is still auto-withdrawing.
SELECT 1
FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND pm.automatic_withdrawn = 'Y'
  AND (pm.em_psd2_is_bank_transfer = 'Y'
       OR pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer'))
UNION ALL
SELECT 1
FROM fin_finacc_paymentmethod l
JOIN fin_paymentmethod pm ON pm.fin_paymentmethod_id = l.fin_paymentmethod_id
WHERE l.ad_client_id = :client_id
  AND l.automatic_withdrawn = 'Y'
  AND (pm.em_psd2_is_bank_transfer = 'Y'
       OR pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer'))
LIMIT 1;

-- @apply
-- 1) The method template. Corrected first so a link created afterwards (before this fix reaches
--    every tenant) inherits 'N' through createLink's copy of the master.
UPDATE fin_paymentmethod pm
SET automatic_withdrawn = 'N',
    updated = now(),
    updatedby = '0'
WHERE pm.ad_client_id = :client_id
  AND pm.automatic_withdrawn = 'Y'
  AND (pm.em_psd2_is_bank_transfer = 'Y'
       OR pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer'));

-- 2) The per-account links — the rows the runtime reads when processing a payment.
UPDATE fin_finacc_paymentmethod l
SET automatic_withdrawn = 'N',
    updated = now(),
    updatedby = '0'
WHERE l.ad_client_id = :client_id
  AND l.automatic_withdrawn = 'Y'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = l.fin_paymentmethod_id
      AND (pm.em_psd2_is_bank_transfer = 'Y'
           OR pm.name IN ('Transferencia bancaria', 'Transferencia', 'Wire Transfer'))
  );
