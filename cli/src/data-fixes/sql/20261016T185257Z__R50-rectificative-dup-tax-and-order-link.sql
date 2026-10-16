-- @id: R50-rectificative-dup-tax-and-order-link
-- @gap: ETP-5729
-- @risk: medium
-- @type: sql
-- @description: Repair rectificative invoices created from a return document before ETP-5729 —
--   drop the duplicated C_InvoiceTax row per rate (fixing GrandTotal, outstanding and the payment
--   plan) and unlink their lines from the original order so its QtyInvoiced is 100% again.
--   Posted, paid or tax-authority-sent documents are never altered: they are listed in @report.

-- Background — the bug (com.etendoerp.go, ETP-5729, commit e4a1a1a26)
-- --------------------------------------------------------------------------------------------
-- A rectificative invoice created from a return document (Sales: Return Material Receipt,
-- Purchase: Return to Vendor Shipment — ReturnShipmentUtils.finalizeReturnInvoice) had TWO
-- defects, both fixed in code by ETP-5729:
--
--  1. DUPLICATED TAX. Flushing the lines already lets the core trigger chain
--     (C_INVOICELINE_TRG2 -> C_INVOICELINETAX_TRG) build ONE C_InvoiceTax per rate with
--     Recalculate='Y'. CreateDraftInvoiceHandler#recalculateTotals then inserted a SECOND,
--     hand-made C_InvoiceTax per rate with Recalculate='N' (same C_Tax_ID, same base, same tax).
--     Completion summed both: GrandTotal = TotalLines + 2 x tax, and the payment plan
--     (FIN_Payment_Schedule / its unpaid FIN_Payment_ScheduleDetail) and C_Invoice.OutstandingAmt
--     inherited the doubled amount. Example (QA, La Paulina): FVR1000003 lines -60.50 incl. VAT
--     (base -50, VAT 21% -10.50) completed with GrandTotal -71.00 = -50 - 2 x 10.50.
--  2. ORDER UNLINKING. Each rectificative line kept C_OrderLine_ID = the ORIGINAL order line
--     (copied from the original shipment line it prices from). C_INVOICE_POST then treated the
--     negative line as an invoice of that order: it added the negative quantity to
--     C_OrderLine.QtyInvoiced (sales: SO branch; purchase: the IsSOTrx='N' loop), stamped
--     C_OrderLine.DateInvoiced, and created an M_MatchSO / M_MatchPO row (M_InOutLine_ID NULL).
--     The order then read as partially invoiced (PV1000009 75%, PC1000001 67%) and "Add from
--     order" offered the returned quantity as pending again. The fixed code sets the line's
--     C_OrderLine_ID to NULL, so none of that happens.
--
-- Detection — the bug's signature, never document numbers
-- --------------------------------------------------------------------------------------------
-- "rect" = a completed (Processed='Y', DocStatus='CO') invoice of the tenant that
--   (a) is a rectificative: it has a C_Invoice_Reverse row as the rectifying side, and
--   (b) comes from a return document: at least one line points (M_InOutLine_ID) at a line of an
--       M_InOut whose C_DocType has IsReturn='Y'.
-- Defect 1 = rect has a C_InvoiceTax row with Recalculate='N' whose twin (same invoice, same
--   C_Tax_ID) with Recalculate='Y' also exists. The core never produces that pair; only the
--   removed recalculateTotals did.
-- Defect 2 = a rect line with QtyInvoiced < 0, C_OrderLine_ID NOT NULL, and C_OrderLine_ID equal
--   to the order line of the ORIGINAL shipment line its return line cancels
--   (M_InOutLine.Canceled_InOutLine_ID). That is exactly how the buggy code derived it.
-- Both defects are independent: a document may have one, the other or both.
--
-- Correct state reproduced (= what the fixed code produces at creation)
-- --------------------------------------------------------------------------------------------
-- Defect 1, per invoice, delta = SUM(TaxAmt) of its duplicated Recalculate='N' rows:
--   * DELETE those C_InvoiceTax rows (the trigger-made Recalculate='Y' row of each rate stays);
--   * C_Invoice.GrandTotal and .OutstandingAmt -= delta (and .DueAmt when it equalled the
--     outstanding amount, i.e. the whole amount was already overdue);
--   * FIN_Payment_Schedule.Amount / .OutstandingAmt -= delta;
--   * the unpaid FIN_Payment_ScheduleDetail.Amount -= delta.
--   C_InvoiceLine / C_InvoiceLineTax / TotalLines were always right and are not touched.
-- Defect 2, per original order line, returned = SUM(rect line QtyInvoiced) (negative):
--   * C_OrderLine.QtyInvoiced -= returned (undoes exactly what C_INVOICE_POST added);
--   * C_OrderLine.DateInvoiced := latest DateInvoiced among the OTHER processed invoices of that
--     line (unchanged when there is none);
--   * DELETE the M_MatchSO / M_MatchPO rows C_INVOICE_POST created for the rect line
--     (M_InOutLine_ID IS NULL — their triggers are no-ops for such rows anyway);
--   * C_InvoiceLine.C_OrderLine_ID := NULL.
--   C_Order.EM_ETGO_Invoice_Status (the "% invoiced" chip, stored computed column, Refresh_Mode
--   'S') recomputes by itself: its ad_scd_* trigger on C_OrderLine watches QtyInvoiced and is
--   NOT gated by AD_isTriggerEnabled; the deferred refresh runs at COMMIT.
--
-- Guards — what is NEVER altered automatically (listed in @report instead)
-- --------------------------------------------------------------------------------------------
-- Defect 1 is repaired only when ALL of these hold; otherwise the invoice is reported:
--   POSTED       Posted='Y' or Fact_Acct rows exist. The ledger already carries the doubled VAT
--                and receivable/payable; changing the subledger under it would desynchronise
--                accounting. Procedure: unpost the invoice (GO "unpost" action =
--                ResetAccounting, which refuses a closed period), force this fix for the tenant
--                (--fix R50-rectificative-dup-tax-and-order-link --client <id>), post again.
--   SIF_SENT     Sent to / registered by a tax authority (Verifactu sent flag or a status other
--                than 'PE', SII sent, TicketBAI sent). The declared amounts are already doubled
--                at the AEAT/Hacienda; that needs a fiscal correction (subsanacion), not a
--                silent local edit. The SIF columns are read through to_jsonb(row) so the fix
--                still runs on an instance without one of those modules.
--   TOTALS       GrandTotal <> TotalLines + SUM(all C_InvoiceTax.TaxAmt): the document does not
--                show the exact duplicated-tax pattern (someone already edited it by hand).
--   PAID         Any payment or credit already applied (TotalPaid <> 0, OutstandingAmt <>
--                GrandTotal, or a schedule detail bound to a FIN_Payment_Detail).
--   PAYMENT_PLAN More than one schedule, a schedule/detail whose amounts do not equal
--                GrandTotal, or a detail inside a payment proposal: the delta cannot be placed
--                unambiguously.
--   CASH_VAT     IsCashVAT='Y' (C_InvoiceTax_CashVAT rows depend on the tax rows).
--   TAX_REGISTER A duplicated row is referenced by C_TaxRegisterLine (already in a VAT register).
-- Defect 2 is repaired regardless of posting: C_OrderLine_ID plays no part in the invoice's
-- Fact_Acct, so unlinking does not change accounting. It is skipped and reported only when the
-- corrected QtyInvoiced would fall outside [0, QtyOrdered] (product not quantity-variable) —
-- e.g. the "pending" quantity was invoiced AGAIN after the rectificative; undoing the negative
-- line then would over-invoice the order, which needs a human decision.
--
-- Trigger handling
-- --------------------------------------------------------------------------------------------
-- The invoices are processed, so C_INVTAX_CHK_RESTRICTIONS_TRG / C_INVOICETAX_TRG refuse the tax
-- DELETE and C_INVLINE_CHK_RESTRICTIONS_TRG refuses the C_OrderLine_ID change (@20501@). @apply
-- therefore runs between ad_disable_triggers() / ad_enable_triggers() (transaction-local
-- set_config — never leaks to another pooled connection). With triggers off nothing adjusts
-- GrandTotal on the tax DELETE (C_INVOICETAX_TRG2 would), which is why the totals are adjusted
-- explicitly. Every statement is ONE statement with data-modifying CTEs, so all guards are
-- evaluated on the same pre-change snapshot. The non-gated module triggers on C_Invoice
-- (etvfac_*, etblkp_*, etarc_*, ad_scd_*) only copy/derive unrelated columns.
--
-- Fronts
-- --------------------------------------------------------------------------------------------
-- Preventive: the ETP-5729 code fix itself (com.etendoerp.go: CreateDraftInvoiceHandler no longer
-- inserts InvoiceTax; ReturnShipmentUtils.buildAndSaveInvoiceLine nulls C_OrderLine_ID). This is
-- not an onboarding-provisioning gap — a brand-new tenant has no documents — so there is no
-- onboarding service and ONBOARDING_PROVISIONED_THROUGH is deliberately NOT bumped: new tenants
-- must still be evaluated (their @check is simply 0 rows).
--
-- Re-run / watermark
-- --------------------------------------------------------------------------------------------
-- Idempotent: a repaired invoice no longer has a duplicated row and a repaired line no longer
-- has C_OrderLine_ID, so both drop out of every predicate; @check returns 0 rows once nothing is
-- left. @check also matches documents that are only reportable, so a tenant whose documents are
-- all posted still gets an APPLIED ledger row with the @report list in `detail`. Once the
-- operator has unposted them, the runner's watermark will not revisit the tenant on its own —
-- force it with --fix (see POSTED above).

-- @check
-- Returns >=1 row when the tenant has at least one rectificative with either defect (repairable
-- or reportable). 0 rows => SKIPPED_NOT_NEEDED.
WITH rect AS (
  SELECT i.c_invoice_id
  FROM c_invoice i
  WHERE i.ad_client_id = :client_id
    AND i.processed = 'Y'
    AND i.docstatus = 'CO'
    AND EXISTS (SELECT 1 FROM c_invoice_reverse rv
                WHERE rv.c_invoice_id = i.c_invoice_id AND rv.ad_client_id = :client_id)
    AND EXISTS (SELECT 1
                FROM c_invoiceline il
                JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
                JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
                JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
                WHERE il.c_invoice_id = i.c_invoice_id
                  AND il.ad_client_id = :client_id
                  AND dt.isreturn = 'Y')
)
SELECT r.c_invoice_id
FROM rect r
WHERE EXISTS (SELECT 1
              FROM c_invoicetax n
              WHERE n.c_invoice_id = r.c_invoice_id
                AND n.ad_client_id = :client_id
                AND n.recalculate = 'N'
                AND EXISTS (SELECT 1 FROM c_invoicetax y
                            WHERE y.c_invoice_id = n.c_invoice_id
                              AND y.c_tax_id = n.c_tax_id
                              AND y.recalculate = 'Y'))
   OR EXISTS (SELECT 1
              FROM c_invoiceline il
              JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
              JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
              JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
              JOIN m_inoutline orig ON orig.m_inoutline_id = iol.canceled_inoutline_id
              WHERE il.c_invoice_id = r.c_invoice_id
                AND il.ad_client_id = :client_id
                AND dt.isreturn = 'Y'
                AND il.qtyinvoiced < 0
                AND il.c_orderline_id IS NOT NULL
                AND il.c_orderline_id = orig.c_orderline_id)
LIMIT 1;

-- @apply
SELECT ad_disable_triggers();

-- Step 1 — defect 1 (duplicated tax): delete the hand-made rows and take their amount off the
-- header totals and the payment plan, for the invoices that pass every guard.
WITH rect AS (
  SELECT i.*
  FROM c_invoice i
  WHERE i.ad_client_id = :client_id
    AND i.processed = 'Y'
    AND i.docstatus = 'CO'
    AND EXISTS (SELECT 1 FROM c_invoice_reverse rv
                WHERE rv.c_invoice_id = i.c_invoice_id AND rv.ad_client_id = :client_id)
    AND EXISTS (SELECT 1
                FROM c_invoiceline il
                JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
                JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
                JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
                WHERE il.c_invoice_id = i.c_invoice_id
                  AND il.ad_client_id = :client_id
                  AND dt.isreturn = 'Y')
),
dup_tax AS (
  SELECT n.c_invoicetax_id, n.c_invoice_id, n.taxamt
  FROM c_invoicetax n
  JOIN rect r ON r.c_invoice_id = n.c_invoice_id
  WHERE n.ad_client_id = :client_id
    AND n.recalculate = 'N'
    AND EXISTS (SELECT 1 FROM c_invoicetax y
                WHERE y.c_invoice_id = n.c_invoice_id
                  AND y.c_tax_id = n.c_tax_id
                  AND y.recalculate = 'Y')
),
fixable AS (
  SELECT r.c_invoice_id,
         r.grandtotal,
         r.outstandingamt,
         r.dueamt,
         (SELECT SUM(d.taxamt) FROM dup_tax d WHERE d.c_invoice_id = r.c_invoice_id) AS delta
  FROM rect r
  WHERE EXISTS (SELECT 1 FROM dup_tax d WHERE d.c_invoice_id = r.c_invoice_id)
    -- POSTED
    AND r.posted <> 'Y'
    AND NOT EXISTS (SELECT 1 FROM fact_acct fa
                    WHERE fa.ad_client_id = :client_id
                      AND fa.ad_table_id = '318'
                      AND fa.record_id = r.c_invoice_id)
    -- SIF_SENT
    AND COALESCE(to_jsonb(r) ->> 'em_etvfac_senttoverifac', 'N') <> 'Y'
    AND COALESCE(to_jsonb(r) ->> 'em_etvfac_invoice_status', 'PE') = 'PE'
    AND COALESCE(to_jsonb(r) ->> 'em_aeatsii_issent', 'N') <> 'Y'
    AND COALESCE(to_jsonb(r) ->> 'em_tbai_issent', 'N') <> 'Y'
    -- TOTALS
    AND r.grandtotal = r.totallines
          + (SELECT COALESCE(SUM(t.taxamt), 0) FROM c_invoicetax t
             WHERE t.c_invoice_id = r.c_invoice_id)
    -- PAID
    AND COALESCE(r.totalpaid, 0) = 0
    AND r.outstandingamt = r.grandtotal
    AND NOT EXISTS (SELECT 1
                    FROM fin_payment_schedule ps
                    JOIN fin_payment_scheduledetail psd
                      ON psd.fin_payment_schedule_invoice = ps.fin_payment_schedule_id
                    WHERE ps.c_invoice_id = r.c_invoice_id
                      AND psd.fin_payment_detail_id IS NOT NULL)
    -- PAYMENT_PLAN
    AND (SELECT COUNT(*) FROM fin_payment_schedule ps
         WHERE ps.c_invoice_id = r.c_invoice_id) <= 1
    AND NOT EXISTS (SELECT 1 FROM fin_payment_schedule ps
                    WHERE ps.c_invoice_id = r.c_invoice_id
                      AND (ps.amount <> r.grandtotal
                           OR ps.outstandingamt <> r.grandtotal
                           OR ps.paidamt <> 0))
    AND NOT EXISTS (SELECT 1
                    FROM fin_payment_schedule ps
                    JOIN fin_payment_scheduledetail psd
                      ON psd.fin_payment_schedule_invoice = ps.fin_payment_schedule_id
                    WHERE ps.c_invoice_id = r.c_invoice_id
                      AND (psd.amount <> r.grandtotal
                           OR EXISTS (SELECT 1 FROM fin_payment_prop_detail ppd
                                      WHERE ppd.fin_payment_scheduledetail_id
                                            = psd.fin_payment_scheduledetail_id)))
    -- CASH_VAT
    AND COALESCE(r.iscashvat, 'N') <> 'Y'
    -- TAX_REGISTER
    AND NOT EXISTS (SELECT 1 FROM dup_tax d
                    JOIN c_taxregisterline trl ON trl.c_invoicetax_id = d.c_invoicetax_id
                    WHERE d.c_invoice_id = r.c_invoice_id)
),
del_tax AS (
  DELETE FROM c_invoicetax t
  USING dup_tax d, fixable f
  WHERE t.c_invoicetax_id = d.c_invoicetax_id
    AND d.c_invoice_id = f.c_invoice_id
    AND t.ad_client_id = :client_id
  RETURNING t.c_invoicetax_id
),
upd_detail AS (
  UPDATE fin_payment_scheduledetail psd
  SET amount = psd.amount - f.delta,
      updated = now(),
      updatedby = '0'
  FROM fin_payment_schedule ps, fixable f
  WHERE psd.fin_payment_schedule_invoice = ps.fin_payment_schedule_id
    AND ps.c_invoice_id = f.c_invoice_id
    AND psd.fin_payment_detail_id IS NULL
    AND psd.ad_client_id = :client_id
  RETURNING psd.fin_payment_scheduledetail_id
),
upd_schedule AS (
  UPDATE fin_payment_schedule ps
  SET amount = ps.amount - f.delta,
      outstandingamt = ps.outstandingamt - f.delta,
      updated = now(),
      updatedby = '0'
  FROM fixable f
  WHERE ps.c_invoice_id = f.c_invoice_id
    AND ps.ad_client_id = :client_id
  RETURNING ps.fin_payment_schedule_id
)
UPDATE c_invoice i
SET grandtotal = f.grandtotal - f.delta,
    outstandingamt = f.outstandingamt - f.delta,
    dueamt = CASE WHEN f.dueamt <> 0 AND f.dueamt = f.outstandingamt
                  THEN f.dueamt - f.delta ELSE f.dueamt END,
    updated = now(),
    updatedby = '0'
FROM fixable f
WHERE i.c_invoice_id = f.c_invoice_id
  AND i.ad_client_id = :client_id;

-- Step 2 — defect 2 (order link): give the returned quantity back to the original order line
-- and unlink the rectificative line, for the order lines whose corrected QtyInvoiced stays
-- within [0, QtyOrdered].
WITH ord_line AS (
  SELECT il.c_invoiceline_id, il.c_orderline_id, il.qtyinvoiced
  FROM c_invoice i
  JOIN c_invoiceline il ON il.c_invoice_id = i.c_invoice_id
  JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
  JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
  JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
  JOIN m_inoutline orig ON orig.m_inoutline_id = iol.canceled_inoutline_id
  WHERE i.ad_client_id = :client_id
    AND il.ad_client_id = :client_id
    AND i.processed = 'Y'
    AND i.docstatus = 'CO'
    AND EXISTS (SELECT 1 FROM c_invoice_reverse rv
                WHERE rv.c_invoice_id = i.c_invoice_id AND rv.ad_client_id = :client_id)
    AND dt.isreturn = 'Y'
    AND il.qtyinvoiced < 0
    AND il.c_orderline_id IS NOT NULL
    AND il.c_orderline_id = orig.c_orderline_id
),
fixable_ol AS (
  SELECT x.c_orderline_id, x.returned
  FROM (SELECT c_orderline_id, SUM(qtyinvoiced) AS returned
        FROM ord_line GROUP BY c_orderline_id) x
  JOIN c_orderline ol ON ol.c_orderline_id = x.c_orderline_id
  LEFT JOIN m_product p ON p.m_product_id = ol.m_product_id
  WHERE ol.ad_client_id = :client_id
    AND (COALESCE(p.isquantityvariable, 'N') = 'Y'
         OR (ol.qtyinvoiced - x.returned)
              BETWEEN LEAST(0, ol.qtyordered) AND GREATEST(0, ol.qtyordered))
),
fixable_line AS (
  SELECT l.c_invoiceline_id
  FROM ord_line l
  JOIN fixable_ol f ON f.c_orderline_id = l.c_orderline_id
),
upd_orderline AS (
  UPDATE c_orderline ol
  SET qtyinvoiced = ol.qtyinvoiced - f.returned,
      dateinvoiced = COALESCE(
        (SELECT MAX(i2.dateinvoiced)
         FROM c_invoiceline il2
         JOIN c_invoice i2 ON i2.c_invoice_id = il2.c_invoice_id
         WHERE il2.c_orderline_id = ol.c_orderline_id
           AND il2.ad_client_id = :client_id
           AND i2.processed = 'Y'
           AND NOT EXISTS (SELECT 1 FROM ord_line l WHERE l.c_invoiceline_id = il2.c_invoiceline_id)),
        ol.dateinvoiced),
      updated = now(),
      updatedby = '0'
  FROM fixable_ol f
  WHERE ol.c_orderline_id = f.c_orderline_id
    AND ol.ad_client_id = :client_id
  RETURNING ol.c_orderline_id
),
del_matchso AS (
  DELETE FROM m_matchso m
  USING fixable_line fl
  WHERE m.c_invoiceline_id = fl.c_invoiceline_id
    AND m.m_inoutline_id IS NULL
    AND m.ad_client_id = :client_id
  RETURNING m.m_matchso_id
),
del_matchpo AS (
  DELETE FROM m_matchpo m
  USING fixable_line fl
  WHERE m.c_invoiceline_id = fl.c_invoiceline_id
    AND m.m_inoutline_id IS NULL
    AND m.ad_client_id = :client_id
  RETURNING m.m_matchpo_id
)
UPDATE c_invoiceline il
SET c_orderline_id = NULL,
    updated = now(),
    updatedby = '0'
FROM fixable_line fl
WHERE il.c_invoiceline_id = fl.c_invoiceline_id
  AND il.ad_client_id = :client_id;

-- Re-enable AD triggers (pairs with ad_disable_triggers() at the top of this @apply).
SELECT ad_enable_triggers();

-- @report
-- Runs after @apply in the same transaction, so it sees the post-repair state: every row here is
-- a document @apply deliberately left alone, with the reason. Repaired documents no longer match
-- any predicate and never appear.
WITH rect AS (
  SELECT i.*
  FROM c_invoice i
  WHERE i.ad_client_id = :client_id
    AND i.processed = 'Y'
    AND i.docstatus = 'CO'
    AND EXISTS (SELECT 1 FROM c_invoice_reverse rv
                WHERE rv.c_invoice_id = i.c_invoice_id AND rv.ad_client_id = :client_id)
    AND EXISTS (SELECT 1
                FROM c_invoiceline il
                JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
                JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
                JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
                WHERE il.c_invoice_id = i.c_invoice_id
                  AND il.ad_client_id = :client_id
                  AND dt.isreturn = 'Y')
),
dup_tax AS (
  SELECT n.c_invoicetax_id, n.c_invoice_id, n.taxamt
  FROM c_invoicetax n
  JOIN rect r ON r.c_invoice_id = n.c_invoice_id
  WHERE n.ad_client_id = :client_id
    AND n.recalculate = 'N'
    AND EXISTS (SELECT 1 FROM c_invoicetax y
                WHERE y.c_invoice_id = n.c_invoice_id
                  AND y.c_tax_id = n.c_tax_id
                  AND y.recalculate = 'Y')
),
tax_left AS (
  SELECT r.documentno,
         r.issotrx,
         'DUPLICATED_TAX' AS defect,
         r.grandtotal AS current_total,
         r.grandtotal - (SELECT SUM(d.taxamt) FROM dup_tax d
                         WHERE d.c_invoice_id = r.c_invoice_id) AS expected_total,
         CASE
           WHEN r.posted = 'Y'
                OR EXISTS (SELECT 1 FROM fact_acct fa
                           WHERE fa.ad_client_id = :client_id AND fa.ad_table_id = '318'
                             AND fa.record_id = r.c_invoice_id)
             THEN 'POSTED: unpost, force this fix with --fix, post again'
           WHEN COALESCE(to_jsonb(r) ->> 'em_etvfac_senttoverifac', 'N') = 'Y'
                OR COALESCE(to_jsonb(r) ->> 'em_etvfac_invoice_status', 'PE') <> 'PE'
                OR COALESCE(to_jsonb(r) ->> 'em_aeatsii_issent', 'N') = 'Y'
                OR COALESCE(to_jsonb(r) ->> 'em_tbai_issent', 'N') = 'Y'
             THEN 'SIF_SENT: amounts already declared to the tax authority, needs a fiscal correction'
           WHEN r.grandtotal <> r.totallines
                  + (SELECT COALESCE(SUM(t.taxamt), 0) FROM c_invoicetax t
                     WHERE t.c_invoice_id = r.c_invoice_id)
             THEN 'TOTALS: header total does not match the duplicated-tax pattern'
           WHEN COALESCE(r.totalpaid, 0) <> 0 OR r.outstandingamt <> r.grandtotal
                OR EXISTS (SELECT 1 FROM fin_payment_schedule ps
                           JOIN fin_payment_scheduledetail psd
                             ON psd.fin_payment_schedule_invoice = ps.fin_payment_schedule_id
                           WHERE ps.c_invoice_id = r.c_invoice_id
                             AND psd.fin_payment_detail_id IS NOT NULL)
             THEN 'PAID: a payment or credit was already applied'
           WHEN COALESCE(r.iscashvat, 'N') = 'Y'
             THEN 'CASH_VAT: cash-VAT invoice'
           WHEN EXISTS (SELECT 1 FROM dup_tax d
                        JOIN c_taxregisterline trl ON trl.c_invoicetax_id = d.c_invoicetax_id
                        WHERE d.c_invoice_id = r.c_invoice_id)
             THEN 'TAX_REGISTER: duplicated tax row already in a VAT register'
           ELSE 'PAYMENT_PLAN: payment plan cannot be adjusted unambiguously'
         END AS reason
  FROM rect r
  WHERE EXISTS (SELECT 1 FROM dup_tax d WHERE d.c_invoice_id = r.c_invoice_id)
),
order_left AS (
  SELECT i.documentno,
         i.issotrx,
         'ORDER_LINK' AS defect,
         ol.qtyinvoiced AS current_total,
         ol.qtyinvoiced - il.qtyinvoiced AS expected_total,
         'ORDER_LINE_OVER_INVOICED: order ' || o.documentno || ' line ' || ol.line
           || ' would exceed the ordered quantity (re-invoiced after the return?)' AS reason
  FROM c_invoice i
  JOIN c_invoiceline il ON il.c_invoice_id = i.c_invoice_id
  JOIN m_inoutline iol ON iol.m_inoutline_id = il.m_inoutline_id
  JOIN m_inout io ON io.m_inout_id = iol.m_inout_id
  JOIN c_doctype dt ON dt.c_doctype_id = io.c_doctype_id
  JOIN m_inoutline orig ON orig.m_inoutline_id = iol.canceled_inoutline_id
  JOIN c_orderline ol ON ol.c_orderline_id = il.c_orderline_id
  JOIN c_order o ON o.c_order_id = ol.c_order_id
  WHERE i.ad_client_id = :client_id
    AND il.ad_client_id = :client_id
    AND i.processed = 'Y'
    AND i.docstatus = 'CO'
    AND EXISTS (SELECT 1 FROM c_invoice_reverse rv
                WHERE rv.c_invoice_id = i.c_invoice_id AND rv.ad_client_id = :client_id)
    AND dt.isreturn = 'Y'
    AND il.qtyinvoiced < 0
    AND il.c_orderline_id = orig.c_orderline_id
)
SELECT * FROM tax_left
UNION ALL
SELECT * FROM order_left
ORDER BY 1, 3;
