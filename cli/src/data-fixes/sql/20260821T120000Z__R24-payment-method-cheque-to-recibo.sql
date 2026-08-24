-- @id: R24-payment-method-cheque-to-recibo
-- @gap: G3
-- @risk: medium
-- @type: sql
-- @description: Replace the "Cheque" payment method with a new "Recibo" method, link it to every
--   Bank and Card financial account, and retire Cheque (deleted when unused, deactivated when it
--   carries history)

-- Background
-- --------------------------------------------------------------------------------------------
-- Etendo GO seeds exactly four payment methods per tenant (Efectivo, Transferencia bancaria,
-- Cheque, Tarjeta) and ships no payment-method management screen (the `payment-method` window is
-- out of scope, ETP-4191). Functional asked to drop "Cheque" and introduce "Recibo" instead, with
-- the configuration below, associated to ALL Bank (type='B') and Card (type='CA') accounts.
--
-- A NEW method is created rather than renaming Cheque in place: renaming would relabel every
-- historical payment/invoice already issued "por cheque". The cost of that choice is that the old
-- documents keep pointing at Cheque, which is why this fix deactivates instead of deleting Cheque
-- whenever any reference survives.
--
-- Target configuration (both on the method template and on every per-account link)
-- --------------------------------------------------------------------------------------------
--   Pay IN : payin_allow=Y, automatic_receipt=N, payin_ismulticurrency=Y, automatic_deposit=Y,
--            payin_execution_type=M, uponreceiptuse=NULL, upondeposituse=DEP,
--            inuponclearinguse=CLE
--   Pay OUT: payout_allow=Y, automatic_payment=N, payout_ismulticurrency=Y,
--            automatic_withdrawn=Y, payout_execution_type=M, uponpaymentuse=NULL,
--            uponwithdrawaluse=WIT, outuponclearinguse=CLE, em_psd2_is_bank_transfer=N
--   Links also carry payin_invoicepaidstatus=RPR, payout_invoicepaidstatus=PPM, isactive=Y.
--
-- Note that inuponclearinguse/outuponclearinguse=CLE ("Cleared Payment Account") makes Recibo the
-- only one of the four methods with the reconciliation accounts set — the other three keep them
-- empty. That is deliberate and scoped to Recibo; aligning the rest is a separate decision.
--
-- `isdefault` on the links is NEVER touched: Transferencia bancaria stays the default on Bank
-- accounts and Tarjeta on Card accounts. New links are inserted with isdefault='N'.
--
-- Identifying an Etendo GO tenant
-- --------------------------------------------------------------------------------------------
-- EVERY statement in both @check and @apply is gated on the tenant owning a method named
-- 'Transferencia bancaria' — the unambiguous GOClient-sampledata signature. The runner always
-- runs @check before @apply, so the gate on @check alone would suffice in normal operation; it
-- is repeated on every @apply statement as defence in depth, because a hand-run of @apply (or a
-- future runner that skips @check) would otherwise let Effects 2b/5/6/7 delete a demo client's
-- own Cheque links, blank its business-partner defaults and retire its method. This matters: 'F&B International Group' and other
-- Openbravo demo clients also ship a method literally named 'Cheque' (plus 'Check', 'Wire
-- Transfer', 'Al contado', ...) that has nothing to do with the GO seed set, and must not be
-- touched. On the authoring DB the gate selected 35 tenants; matching on 'Cheque' alone would
-- have selected 36 and corrupted F&B.
--
-- Config references vs. history
-- --------------------------------------------------------------------------------------------
-- Effect 5 repoints the "which method should be used from now on" references (business-partner
-- defaults, payment-term lines, projects, payment proposals). Skipping this would leave 34
-- business partners (authoring DB) defaulting to an INACTIVE method, so every new invoice for
-- them would be born broken. Effect 6 repoints UNPROCESSED documents so they stay operable.
-- Processed/completed documents are deliberately left pointing at Cheque — that is the whole
-- reason a new method was created instead of a rename.
--
-- Retirement policy (ticket requirement)
-- --------------------------------------------------------------------------------------------
-- Effect 7 DELETEs Cheque only when no reference survives across the 13 columns with an FK to
-- fin_paymentmethod, and otherwise deactivates it (isactive='N'). Both are attempted, in that
-- order, so the UPDATE only ever hits a survivor. `@report` lists the tenants where Cheque was
-- kept and what still holds it.
--
-- This fix references module-provided schema (fin_paymentmethod.em_psd2_is_bank_transfer from
-- com.etendoerp.psd2.bank.integration and obirb_invbookline from
-- org.openbravo.module.invoicesregisterbook), i.e. it assumes the standard Etendo GO bundle —
-- the same assumption R14 and R15 already make for the PSD2 column.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- Two-layer. @check returns >=1 row only while some effect is still pending, using the SAME
-- target predicates that @apply writes, so the fix provably converges.
--
-- NOTE on the *use columns (uponreceiptuse, upondeposituse, inuponclearinguse, uponpaymentuse,
-- uponwithdrawaluse, outuponclearinguse): they are NULLABLE, so they are compared with
-- IS NOT DISTINCT FROM, never with `=`. Inside a `NOT ( ... )` guard a plain `col = 'CLE'`
-- evaluates to NULL when the column is NULL, `NOT (NULL)` is NULL, and the row is silently NOT
-- matched -- which made the migrated Bank link keep empty reconciliation accounts while @check
-- reported the tenant as already fixed. Caught on a rolled-back trial run; do not revert. Every @apply statement is
-- additionally guarded (NOT EXISTS / IS DISTINCT FROM), keyed on the table's own UNIQUE
-- constraint where relevant (fin_finacc_paymentmethod_un on
-- (fin_paymentmethod_id, fin_financial_account_id)). Every statement that assigns FROM the
-- Recibo scalar subquery additionally requires that row to exist: without the guard the
-- subquery yields NULL and the UPDATE would BLANK the column rather than repoint it. A second pass matches 0 rows everywhere.
-- Every statement is scoped to ad_client_id = :client_id.
--
-- Preventive twin (new tenants born correct — no CUT bump)
-- --------------------------------------------------------------------------------------------
-- Static: referencedata/sampledata/GOClient/FIN_PAYMENTMETHOD.xml drops the Cheque block and
--   ships Recibo (id FBC13FFB5535450781A9B06DC57D1C99) with the config above;
--   FIN_FINACC_PAYMENTMETHOD.xml repoints the former Cheque link (5DCF1BEE...) to Recibo on
--   "Cuenta de Banco" and adds a new Recibo link on the "Tarjeta" (type CA) account.
-- Runtime: FinancialAccountSupport.PAYMENT_METHODS_BY_TYPE now maps B -> [Transferencia, Recibo,
--   Tarjeta] and CA -> [Tarjeta, Recibo] (Recibo never first, so it never becomes the default),
--   and createLink now copies inuponclearinguse/outuponclearinguse from the method template so
--   runtime-created links are born with CLE too.
-- Scope note: the automatic association fires only on the two Etendo GO paths
--   (FinancialAccountHandler#afterHandle and FinancialAccountBankConnectionHandler#handleCreateAndLink).
--   There is deliberately NO EntityPersistenceEventObserver on FIN_FinancialAccount, so an
--   account created straight from Etendo Classic gets no automatic link — accepted scope.
-- ONBOARDING_PROVISIONED_THROUGH is intentionally NOT bumped: this .sql only repairs legacy
--   tenants; new tenants are born correct via the sampledata above. Same call as G1/G2.

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND (
    -- (a) Recibo missing, or present with a configuration that diverges from the target.
    NOT EXISTS (
      SELECT 1 FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id
        AND r.name = 'Recibo'
        AND r.isactive = 'Y' AND r.description = 'Recibo'
        AND r.automatic_receipt = 'N' AND r.automatic_payment = 'N'
        AND r.automatic_deposit = 'Y' AND r.automatic_withdrawn = 'Y'
        AND r.payin_allow = 'Y' AND r.payout_allow = 'Y'
        AND r.payin_execution_type = 'M' AND r.payout_execution_type = 'M'
        AND r.payin_deferred = 'N' AND r.payout_deferred = 'N'
        AND r.uponreceiptuse IS NULL AND r.upondeposituse IS NOT DISTINCT FROM 'DEP' AND r.inuponclearinguse IS NOT DISTINCT FROM 'CLE'
        AND r.uponpaymentuse IS NULL AND r.uponwithdrawaluse IS NOT DISTINCT FROM 'WIT' AND r.outuponclearinguse IS NOT DISTINCT FROM 'CLE'
        AND r.payin_ismulticurrency = 'Y' AND r.payout_ismulticurrency = 'Y'
        AND r.em_psd2_is_bank_transfer = 'N')
    -- (b) some per-account link still points at Cheque.
    OR EXISTS (
      SELECT 1 FROM fin_finacc_paymentmethod fpm
      JOIN fin_paymentmethod pm ON pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      WHERE fpm.ad_client_id = :client_id AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
    -- (c) some Bank/Card account has no Recibo link at all.
    OR EXISTS (
      SELECT 1 FROM fin_financial_account fa
      WHERE fa.ad_client_id = :client_id
        AND fa.type IN ('B', 'CA')
        AND NOT EXISTS (
          SELECT 1 FROM fin_finacc_paymentmethod f
          JOIN fin_paymentmethod pm ON pm.fin_paymentmethod_id = f.fin_paymentmethod_id
          WHERE f.fin_financial_account_id = fa.fin_financial_account_id
            AND pm.ad_client_id = :client_id AND pm.name = 'Recibo'))
    -- (d) some Recibo link diverges from the target configuration.
    OR EXISTS (
      SELECT 1 FROM fin_finacc_paymentmethod fpm
      JOIN fin_paymentmethod pm ON pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      WHERE fpm.ad_client_id = :client_id AND pm.ad_client_id = :client_id AND pm.name = 'Recibo'
        AND NOT (fpm.isactive = 'Y'
          AND fpm.automatic_receipt = 'N' AND fpm.automatic_payment = 'N'
          AND fpm.automatic_deposit = 'Y' AND fpm.automatic_withdrawn = 'Y'
          AND fpm.payin_allow = 'Y' AND fpm.payout_allow = 'Y'
          AND fpm.payin_execution_type = 'M' AND fpm.payout_execution_type = 'M'
          AND fpm.payin_deferred = 'N' AND fpm.payout_deferred = 'N'
          AND fpm.uponreceiptuse IS NULL AND fpm.upondeposituse IS NOT DISTINCT FROM 'DEP'
          AND fpm.inuponclearinguse IS NOT DISTINCT FROM 'CLE'
          AND fpm.uponpaymentuse IS NULL AND fpm.uponwithdrawaluse IS NOT DISTINCT FROM 'WIT'
          AND fpm.outuponclearinguse IS NOT DISTINCT FROM 'CLE'
          AND fpm.payin_ismulticurrency = 'Y' AND fpm.payout_ismulticurrency = 'Y'
          AND fpm.payin_invoicepaidstatus = 'RPR' AND fpm.payout_invoicepaidstatus = 'PPM'
          AND fpm.em_psd2_is_bank_transfer = 'N'))
    -- (e) a forward-looking configuration reference still points at Cheque.
    OR EXISTS (
      SELECT 1 FROM c_bpartner x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id IN (x.fin_paymentmethod_id, x.po_paymentmethod_id)
      WHERE x.ad_client_id = :client_id AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
    OR EXISTS (
      SELECT 1 FROM c_paymenttermline x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque')
    OR EXISTS (
      SELECT 1 FROM c_project x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque')
    OR EXISTS (
      SELECT 1 FROM c_projectproposal x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque')
    OR EXISTS (
      SELECT 1 FROM fin_payment_proposal x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque')
    -- (f) an unprocessed document still points at Cheque.
    OR EXISTS (
      SELECT 1 FROM c_invoice x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque' AND x.processed = 'N')
    OR EXISTS (
      SELECT 1 FROM c_order x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque' AND x.processed = 'N')
    OR EXISTS (
      SELECT 1 FROM fin_payment x JOIN fin_paymentmethod pm
        ON pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      WHERE x.ad_client_id = :client_id AND pm.name = 'Cheque' AND x.processed = 'N')
    -- (g) Cheque is still selectable, or is now unused and therefore deletable.
    OR EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.ad_client_id = :client_id AND pm.name = 'Cheque' AND pm.isactive = 'Y')
    OR EXISTS (
      SELECT 1 FROM fin_paymentmethod pm
      WHERE pm.ad_client_id = :client_id AND pm.name = 'Cheque'
        AND NOT EXISTS (SELECT 1 FROM c_bpartner t WHERE pm.fin_paymentmethod_id IN (t.fin_paymentmethod_id, t.po_paymentmethod_id))
        AND NOT EXISTS (SELECT 1 FROM c_invoice t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM c_order t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM c_paymenttermline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM c_project t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM c_projectproposal t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM fin_finacc_paymentmethod t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM fin_orig_payment_schedule t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM fin_payment t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM fin_payment_proposal t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM fin_payment_schedule t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM gl_journalline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
        AND NOT EXISTS (SELECT 1 FROM obirb_invbookline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id))
  )
LIMIT 1;

-- @apply

-- Effect 1 -- create the Recibo method template. The org is inherited from the method it
-- replaces (Cheque), falling back to the transfer method's org, so Recibo lands in the same org
-- as its three siblings. Deliberately NOT the runner's operative-org bind: the runner scans the
-- raw section text (comments included) for that placeholder and, when it finds it, resolves the
-- tenant's operative org up front — throwing for any tenant that has none and aborting the
-- whole chain. Never name that placeholder in this file, not even in prose.
INSERT INTO fin_paymentmethod (
  fin_paymentmethod_id, ad_client_id, ad_org_id, created, createdby, updated, updatedby,
  isactive, name, description,
  automatic_receipt, automatic_payment, automatic_deposit, automatic_withdrawn,
  payin_allow, payout_allow, payin_execution_type, payout_execution_type,
  payin_deferred, payout_deferred,
  upondeposituse, inuponclearinguse, uponwithdrawaluse, outuponclearinguse,
  payin_ismulticurrency, payout_ismulticurrency, em_psd2_is_bank_transfer)
SELECT '@uuid_RECIBO@', :client_id,
       COALESCE(
         (SELECT ch.ad_org_id FROM fin_paymentmethod ch
          WHERE ch.ad_client_id = :client_id AND ch.name = 'Cheque' LIMIT 1),
         (SELECT tr.ad_org_id FROM fin_paymentmethod tr
          WHERE tr.ad_client_id = :client_id AND tr.name = 'Transferencia bancaria' LIMIT 1)),
       now(), '0', now(), '0',
       'Y', 'Recibo', 'Recibo',
       'N', 'N', 'Y', 'Y',
       'Y', 'Y', 'M', 'M',
       'N', 'N',
       'DEP', 'CLE', 'WIT', 'CLE',
       'Y', 'Y', 'N'
WHERE EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND NOT EXISTS (
    SELECT 1 FROM fin_paymentmethod x
    WHERE x.ad_client_id = :client_id AND x.name = 'Recibo');

-- Effect 1b -- normalise the method template. Covers a Recibo created by an earlier partial run
-- or edited by hand, so @check's predicate (a) can go green.
UPDATE fin_paymentmethod r
SET isactive = 'Y', description = 'Recibo',
    automatic_receipt = 'N', automatic_payment = 'N',
    automatic_deposit = 'Y', automatic_withdrawn = 'Y',
    payin_allow = 'Y', payout_allow = 'Y',
    payin_execution_type = 'M', payout_execution_type = 'M',
    payin_deferred = 'N', payout_deferred = 'N',
    uponreceiptuse = NULL, upondeposituse = 'DEP', inuponclearinguse = 'CLE',
    uponpaymentuse = NULL, uponwithdrawaluse = 'WIT', outuponclearinguse = 'CLE',
    payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y',
    em_psd2_is_bank_transfer = 'N',
    updated = now(), updatedby = '0'
WHERE r.ad_client_id = :client_id
  AND r.name = 'Recibo'
  AND NOT (r.isactive = 'Y' AND r.description = 'Recibo'
    AND r.automatic_receipt = 'N' AND r.automatic_payment = 'N'
    AND r.automatic_deposit = 'Y' AND r.automatic_withdrawn = 'Y'
    AND r.payin_allow = 'Y' AND r.payout_allow = 'Y'
    AND r.payin_execution_type = 'M' AND r.payout_execution_type = 'M'
    AND r.payin_deferred = 'N' AND r.payout_deferred = 'N'
    AND r.uponreceiptuse IS NULL AND r.upondeposituse IS NOT DISTINCT FROM 'DEP' AND r.inuponclearinguse IS NOT DISTINCT FROM 'CLE'
    AND r.uponpaymentuse IS NULL AND r.uponwithdrawaluse IS NOT DISTINCT FROM 'WIT' AND r.outuponclearinguse IS NOT DISTINCT FROM 'CLE'
    AND r.payin_ismulticurrency = 'Y' AND r.payout_ismulticurrency = 'Y'
    AND r.em_psd2_is_bank_transfer = 'N')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- Effect 2 -- repoint the existing per-account Cheque links to Recibo, preserving each link's
-- own isdefault. Safe: nothing in the schema has an FK to fin_finacc_paymentmethod. The
-- NOT EXISTS guard protects fin_finacc_paymentmethod_un on the (method, account) pair when the
-- account already carries a Recibo link.
UPDATE fin_finacc_paymentmethod fpm
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r
    WHERE r.ad_client_id = :client_id AND r.name = 'Recibo')
  AND NOT EXISTS (
    SELECT 1 FROM fin_finacc_paymentmethod other
    JOIN fin_paymentmethod pm2 ON pm2.fin_paymentmethod_id = other.fin_paymentmethod_id
    WHERE other.fin_financial_account_id = fpm.fin_financial_account_id
      AND pm2.ad_client_id = :client_id AND pm2.name = 'Recibo')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- Effect 2b -- drop the Cheque links that Effect 2 could not repoint (their account already had
-- a Recibo link), so no account keeps Cheque associated.
DELETE FROM fin_finacc_paymentmethod fpm
WHERE fpm.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- Effect 3 -- normalise every Recibo link to the target configuration. Real divergence exists on
-- the authoring DB: of 55 migrated links, 51 had automatic_deposit/withdrawn = Y/Y, 4 had N/N and
-- 3 of those also had upondeposituse/uponwithdrawaluse empty. isdefault is left untouched.
UPDATE fin_finacc_paymentmethod fpm
SET isactive = 'Y',
    automatic_receipt = 'N', automatic_payment = 'N',
    automatic_deposit = 'Y', automatic_withdrawn = 'Y',
    payin_allow = 'Y', payout_allow = 'Y',
    payin_execution_type = 'M', payout_execution_type = 'M',
    payin_deferred = 'N', payout_deferred = 'N',
    uponreceiptuse = NULL, upondeposituse = 'DEP', inuponclearinguse = 'CLE',
    uponpaymentuse = NULL, uponwithdrawaluse = 'WIT', outuponclearinguse = 'CLE',
    payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y',
    payin_invoicepaidstatus = 'RPR', payout_invoicepaidstatus = 'PPM',
    em_psd2_is_bank_transfer = 'N',
    updated = now(), updatedby = '0'
WHERE fpm.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = fpm.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Recibo')
  AND NOT (fpm.isactive = 'Y'
    AND fpm.automatic_receipt = 'N' AND fpm.automatic_payment = 'N'
    AND fpm.automatic_deposit = 'Y' AND fpm.automatic_withdrawn = 'Y'
    AND fpm.payin_allow = 'Y' AND fpm.payout_allow = 'Y'
    AND fpm.payin_execution_type = 'M' AND fpm.payout_execution_type = 'M'
    AND fpm.payin_deferred = 'N' AND fpm.payout_deferred = 'N'
    AND fpm.uponreceiptuse IS NULL AND fpm.upondeposituse IS NOT DISTINCT FROM 'DEP'
    AND fpm.inuponclearinguse IS NOT DISTINCT FROM 'CLE'
    AND fpm.uponpaymentuse IS NULL AND fpm.uponwithdrawaluse IS NOT DISTINCT FROM 'WIT'
    AND fpm.outuponclearinguse IS NOT DISTINCT FROM 'CLE'
    AND fpm.payin_ismulticurrency = 'Y' AND fpm.payout_ismulticurrency = 'Y'
    AND fpm.payin_invoicepaidstatus = 'RPR' AND fpm.payout_invoicepaidstatus = 'PPM'
    AND fpm.em_psd2_is_bank_transfer = 'N')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- Effect 4 -- link Recibo to every Bank and Card account that still lacks it. On the authoring DB
-- this covered 11 Bank accounts (never had a Cheque link) and all 34 Card accounts (Recibo on
-- Card accounts is new behaviour, not a migration). isdefault='N' so Transferencia bancaria /
-- Tarjeta keep the default on their account type.
INSERT INTO fin_finacc_paymentmethod (
  fin_finacc_paymentmethod_id, ad_client_id, ad_org_id, created, createdby, updated, updatedby,
  isactive, fin_paymentmethod_id, fin_financial_account_id,
  automatic_receipt, automatic_payment, automatic_deposit, automatic_withdrawn,
  payin_allow, payout_allow, payin_execution_type, payout_execution_type,
  payin_deferred, payout_deferred,
  upondeposituse, inuponclearinguse, uponwithdrawaluse, outuponclearinguse,
  payin_ismulticurrency, payout_ismulticurrency, isdefault,
  payin_invoicepaidstatus, payout_invoicepaidstatus, em_psd2_is_bank_transfer)
SELECT get_uuid(), :client_id, fa.ad_org_id, now(), '0', now(), '0',
       'Y', r.fin_paymentmethod_id, fa.fin_financial_account_id,
       'N', 'N', 'Y', 'Y',
       'Y', 'Y', 'M', 'M',
       'N', 'N',
       'DEP', 'CLE', 'WIT', 'CLE',
       'Y', 'Y', 'N',
       'RPR', 'PPM', 'N'
FROM fin_financial_account fa
CROSS JOIN (
  SELECT p.fin_paymentmethod_id FROM fin_paymentmethod p
  WHERE p.ad_client_id = :client_id AND p.name = 'Recibo') r
WHERE fa.ad_client_id = :client_id
  AND fa.type IN ('B', 'CA')
  AND NOT EXISTS (
    SELECT 1 FROM fin_finacc_paymentmethod f
    WHERE f.fin_financial_account_id = fa.fin_financial_account_id
      AND f.fin_paymentmethod_id = r.fin_paymentmethod_id)
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- Effect 5 -- repoint forward-looking configuration references (defaults), NOT history.
UPDATE c_bpartner x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE c_bpartner x
SET po_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.po_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE c_paymenttermline x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE c_project x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE c_projectproposal x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE fin_payment_proposal x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

-- Effect 6 -- repoint UNPROCESSED documents so they remain operable once Cheque is retired.
-- Processed documents keep Cheque on purpose (historical traceability).
UPDATE c_invoice x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND x.processed = 'N'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE c_order x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND x.processed = 'N'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

UPDATE fin_payment x
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE x.ad_client_id = :client_id
  AND x.processed = 'N'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = x.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

-- Payment-plan lines follow their parent document: only those hanging off an unprocessed
-- invoice/order are repointed.
UPDATE fin_payment_schedule s
SET fin_paymentmethod_id = (
      SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r
      WHERE r.ad_client_id = :client_id AND r.name = 'Recibo'),
    updated = now(), updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod pm
    WHERE pm.fin_paymentmethod_id = s.fin_paymentmethod_id
      AND pm.ad_client_id = :client_id AND pm.name = 'Cheque')
  AND (EXISTS (SELECT 1 FROM c_invoice i
               WHERE i.c_invoice_id = s.c_invoice_id AND i.processed = 'N')
    OR EXISTS (SELECT 1 FROM c_order o
               WHERE o.c_order_id = s.c_order_id AND o.processed = 'N'))
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria')
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod r2
    WHERE r2.ad_client_id = :client_id AND r2.name = 'Recibo');

-- Effect 7 -- retire Cheque: delete it when nothing references it any more, otherwise deactivate
-- it so it disappears from every selector while history stays intact. The DELETE runs first, so
-- the UPDATE can only ever touch a survivor.
DELETE FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND pm.name = 'Cheque'
  AND NOT EXISTS (SELECT 1 FROM c_bpartner t WHERE pm.fin_paymentmethod_id IN (t.fin_paymentmethod_id, t.po_paymentmethod_id))
  AND NOT EXISTS (SELECT 1 FROM c_invoice t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM c_order t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM c_paymenttermline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM c_project t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM c_projectproposal t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM fin_finacc_paymentmethod t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM fin_orig_payment_schedule t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM fin_payment t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM fin_payment_proposal t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM fin_payment_schedule t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM gl_journalline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND NOT EXISTS (SELECT 1 FROM obirb_invbookline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

UPDATE fin_paymentmethod pm
SET isactive = 'N', updated = now(), updatedby = '0'
WHERE pm.ad_client_id = :client_id
  AND pm.name = 'Cheque'
  AND pm.isactive IS DISTINCT FROM 'N'
  AND EXISTS (
    SELECT 1 FROM fin_paymentmethod g
    WHERE g.ad_client_id = :client_id AND g.name = 'Transferencia bancaria');

-- @report
-- Read-only, runs after a successful @apply in the SAME transaction. Returns 0 rows when Cheque
-- was deleted outright; one row per surviving (deactivated) Cheque, with the reference counts
-- that blocked the delete, so an operator can see exactly what history is holding it.
SELECT pm.name                                  AS payment_method,
       'DEACTIVATED (history preserved)'         AS outcome,
       (SELECT count(*) FROM c_invoice t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)            AS invoices,
       (SELECT count(*) FROM c_order t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)              AS orders,
       (SELECT count(*) FROM fin_payment t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)          AS payments,
       (SELECT count(*) FROM fin_payment_schedule t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id) AS payment_plan_lines,
       (SELECT count(*) FROM gl_journalline t WHERE t.fin_paymentmethod_id = pm.fin_paymentmethod_id)       AS journal_lines
FROM fin_paymentmethod pm
WHERE pm.ad_client_id = :client_id
  AND pm.name = 'Cheque';
