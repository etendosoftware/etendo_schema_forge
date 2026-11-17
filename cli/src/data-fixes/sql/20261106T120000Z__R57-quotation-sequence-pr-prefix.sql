-- @id: R57-quotation-sequence-pr-prefix
-- @gap: N10
-- @risk: medium
-- @type: sql
-- @description: ETP-5837 — give the sales-quotation series the product prefix PR (only where the tenant left it empty) and renumber that tenant's existing quotations 1000000 -> PR1000000.
--   Only the first line of @description reaches the ledger.

-- Context (ETP-5837, gap N10)
-- ---------------------------------------------------------------------------------------------
-- Every provisioned tenant has a sales-quotation doctype (C_DocType DocBaseType='SOO',
-- DocSubTypeSO='OB', name "Quotation") whose DocNoSequence_ID points at its own AD_Sequence
-- "Quotation" with NO prefix, so quotations are numbered 1000000, 1000001... — the same digits
-- as the sales orders (PV) and invoices (FV) before R38 prefixed those. ETP-5837 gives the series
-- the product prefix PR and shows it on the "Secuencia de documentos" window. The preventive
-- front is dataset-only (`GOClient/AD_SEQUENCE.xml`, PREFIX=PR on the "Quotation" row), so a new
-- tenant is born correct. This corrective aligns already-provisioned tenants.
--
-- Product decision (2026-11-06, confirmed by the user): existing tenants are aligned INCLUDING the
-- quotations they already hold. So, unlike R38, this fix renumbers documents, not only the series.
--
-- SCOPE — WHICH SEQUENCE, WHICH TENANT
-- ---------------------------------------------------------------------------------------------
-- The sequence is found through the quotation doctype (DocNoSequence_ID), NOT by name: it is the
-- doctype that decides which counter numbers a quotation. A tenant can carry more than one
-- quotation doctype (F&B International Group has two, each with its own sequence) and every one
-- of them is covered.
--
-- A sequence is prefixed only when ALL of this holds:
--   - its PREFIX is NULL or blank. A prefix the tenant configured itself is NEVER overwritten, and
--     that tenant's quotations are left exactly as they are (step 2 only renumbers quotations
--     whose sequence carries PR).
--   - it is referenced ONLY by quotation doctypes. A sequence shared with any other doctype would
--     put PR on those documents too; it is left alone and listed by @report. (0 such sequences on
--     the local DB, 2026-11-06.)
--
-- A tenant whose quotation sequence ALREADY carries 'PR' (set by hand) is treated as aligned at
-- the series level, and its quotations still unprefixed are renumbered like everyone else's —
-- it is the same product series, the result is identical to a tenant born from the dataset.
--
-- WHICH QUOTATIONS ARE RENUMBERED
-- ---------------------------------------------------------------------------------------------
-- C_Order rows whose C_DocTypeTarget_ID is a quotation doctype of the tenant whose sequence now
-- carries PR. C_DocTypeTarget_ID, not C_DocType_ID, because the target doctype is the one that
-- issued the number (both are equal on 24/24 local quotations, drafts included). An order created
-- FROM a quotation (C_Order.Quotation_ID) is a different row with its own Standard Order doctype
-- and its own PV number; it is never touched.
--
-- Every status is covered: drafts, booked, converted (CA / ETGO_CI), rejected (CJ), voided (VO),
-- closed (CL). A quotation is not a fiscal document (no SII / TicketBAI / VeriFactu record, no
-- posting: 0 FACT_ACCT rows for quotations), so renumbering a completed one has no tax-reporting
-- consequence.
--
-- Only numbers made of digits alone are renumbered (`documentno ~ '^[0-9]+$'`). That is exactly
-- what the unprefixed "Quotation" sequence (mask #######, no suffix) issues, and it also excludes
-- anything already starting with PR, which is the idempotency guard. A number of any other shape
-- (typed by hand, a suffix, a provisional '<...>' draft number) is NOT guessed at: it is left
-- untouched and listed by @report. A number whose PR form already exists on another quotation of
-- the same doctype is likewise skipped and reported, so the fix can never create a duplicate.
--
-- WHERE ELSE THE QUOTATION NUMBER LIVES (investigated read-only on the local DB, 2026-11-06)
-- ---------------------------------------------------------------------------------------------
-- The goal is that no two numbers coexist for the same quotation. Findings:
--   - Converted sales orders: hold the quotation through the Quotation_ID FK only. Their
--     DocumentNo is their own PV number; Description/POReference are copied from the quotation's
--     FREE TEXT (ConvertQuotationIntoOrder copies the header, then sets DocumentNo=null), never its
--     number. 8/8 converted orders checked: no quotation number in any text column. Nothing to do.
--   - Invoices created from a quotation (C_Invoice.C_Order_ID): FK only; 1/1 checked, no copy.
--     No printable template (print-*/template.hbs) prints an order/quotation number, so no other
--     document's cached PDF carries it. Nothing to do.
--   - Stored computed columns (Computation_Mode='S'): none derives from C_Order.DocumentNo (the
--     C_Order ones are numeric delivery/invoice statuses). Nothing to do.
--   - Stored identifier columns (em_etgo_identifier-style): C_Order has none. Nothing to do.
--   - Vector search (ETARC_*): sources exist only for M_Product, C_BPartner and C_Invoice; no
--     C_Order source or target. Nothing to do.
--   - Cached PDF (C_File, EM_ETGO_IsPreviewMain='Y', named sales-quotation-<number>.pdf, 10 local
--     rows): SELF-HEALS, provided this fix moves C_Order.Updated — which it does. Both the SPA
--     (QuotationPreview passes recordUpdated -> attachmentFreshness.isCachedRenderingStale) and the
--     server-side render (NeoDocumentPdf, same rule) treat a cache written before the record's
--     last update as STALE and re-render it on the next open/print/email; the re-render replaces
--     the marked attachment (markAsMain deletes the previous one) under the new file name. Until
--     that next open the Attachments list still shows the old file name. The fix does NOT delete
--     or rename C_File rows: SQL cannot remove the bytes on disk, and a renamed file whose content
--     still says 1000000 would be worse than a stale one that is detected as stale.
--   - Email send log (ETGO_EMAIL_SEND_LOG subject/body): a historical record of what was actually
--     sent; left as is on purpose (0 quotation rows locally). The same applies to AD_PInstance
--     messages and the audit trail (C_Order is not fully audited).
--
-- TRIGGERS
-- ---------------------------------------------------------------------------------------------
-- C_ORDER_CHK_RESTRINCTIONS_TRG raises @20501@ when DOCUMENTNO changes on a row with
-- Processed='Y' (every booked/converted/rejected quotation), unless AD_isTriggerEnabled()='N'.
-- The C_Order UPDATE therefore runs between ad_disable_triggers() / ad_enable_triggers()
-- (transaction-local, same pattern as R1/R50/R55), scoped to that one statement. Only DocumentNo
-- and Updated/UpdatedBy change, so nothing the bypassed triggers maintain is affected.
--
-- WHY ONBOARDING_PROVISIONED_THROUGH IS NOT BUMPED
-- ---------------------------------------------------------------------------------------------
-- A brand-new tenant gets PR straight from the corrected AD_SEQUENCE.xml and has no quotation yet,
-- so this fix's @check returns 0 rows for it and the runner records SKIPPED_NOT_NEEDED. Same shape
-- as R38/R39: dataset-only preventive, no new onboarding service, no CUT bump.

-- Idempotency
-- ---------------------------------------------------------------------------------------------
-- Two layers. @check returns rows only while a quotation sequence still lacks a prefix or a
-- quotation of a PR series is still unprefixed (and safely renumberable). Each @apply statement is
-- self-guarded: the sequence UPDATE only matches a NULL/blank prefix, the C_Order UPDATE only
-- matches digit-only numbers, which a renumbered 'PR...' number never is. A re-run changes
-- nothing. Every statement, subqueries included, is scoped by ad_client_id = :client_id.

-- @check
-- >=1 row while (a) a quotation-only sequence of the tenant has no prefix, or (b) a quotation of a
-- PR-prefixed quotation series still carries a digit-only number whose PR form is free.
SELECT 1
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND NULLIF(btrim(s.prefix), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND dt.docbasetype = 'SOO'
      AND dt.docsubtypeso = 'OB')
  AND NOT EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND NOT (dt.docbasetype = 'SOO' AND COALESCE(dt.docsubtypeso, '') = 'OB'))
UNION ALL
SELECT 1
FROM c_order o
JOIN c_doctype dt ON dt.c_doctype_id = o.c_doctypetarget_id
JOIN ad_sequence s ON s.ad_sequence_id = dt.docnosequence_id
WHERE o.ad_client_id = :client_id
  AND dt.ad_client_id = :client_id
  AND s.ad_client_id = :client_id
  AND dt.docbasetype = 'SOO'
  AND dt.docsubtypeso = 'OB'
  AND s.prefix = 'PR'
  AND o.documentno ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM c_order o2
    WHERE o2.ad_client_id = :client_id
      AND o2.c_doctypetarget_id = o.c_doctypetarget_id
      AND o2.documentno = 'PR' || o.documentno)
LIMIT 1;

-- @apply

-- 1. PREFIX on the quotation series — only an empty one, only on a sequence no other doctype
--    uses. PR satisfies DocumentSequenceHandler's fiscal prefix rules (A-Z/0-9/hyphen, no
--    I O Y W Ñ, <= 20 chars), so the window can re-save it.
UPDATE ad_sequence s
SET prefix = 'PR',
    updated = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND NULLIF(btrim(s.prefix), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND dt.docbasetype = 'SOO'
      AND dt.docsubtypeso = 'OB')
  AND NOT EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND NOT (dt.docbasetype = 'SOO' AND COALESCE(dt.docsubtypeso, '') = 'OB'));

-- C_ORDER_CHK_RESTRINCTIONS_TRG forbids changing DocumentNo on a processed order unless AD
-- triggers are off; the switch is transaction-local and scoped to the next statement.
SELECT ad_disable_triggers();

-- 2. Renumber the existing quotations of every PR quotation series: 1000005 -> PR1000005.
--    `updated` is moved on purpose: it is what marks the cached quotation PDF as stale (SPA and
--    server-side render), so the next open re-renders it with the new number.
UPDATE c_order o
SET documentno = 'PR' || o.documentno,
    updated = now(),
    updatedby = '0'
FROM c_doctype dt
JOIN ad_sequence s ON s.ad_sequence_id = dt.docnosequence_id
WHERE o.ad_client_id = :client_id
  AND dt.ad_client_id = :client_id
  AND s.ad_client_id = :client_id
  AND dt.c_doctype_id = o.c_doctypetarget_id
  AND dt.docbasetype = 'SOO'
  AND dt.docsubtypeso = 'OB'
  AND s.prefix = 'PR'
  AND o.documentno ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM c_order o2
    WHERE o2.ad_client_id = :client_id
      AND o2.c_doctypetarget_id = o.c_doctypetarget_id
      AND o2.documentno = 'PR' || o.documentno);

-- Re-enable AD triggers (pairs with ad_disable_triggers() above).
SELECT ad_enable_triggers();

-- @report
-- Read-only, runs after a successful @apply in the same transaction. Lists what the fix
-- deliberately left alone and an operator should look at. Empty on a normal tenant.
SELECT s.name AS sequence_name,
       'quotation sequence NOT prefixed: also used by a non-quotation doctype' AS detail
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND NULLIF(btrim(s.prefix), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND dt.docbasetype = 'SOO'
      AND dt.docsubtypeso = 'OB')
UNION ALL
SELECT s.name,
       'quotation sequence kept its own prefix ' || s.prefix || ' (quotations not renumbered)'
FROM ad_sequence s
WHERE s.ad_client_id = :client_id
  AND NULLIF(btrim(s.prefix), '') IS NOT NULL
  AND s.prefix <> 'PR'
  AND EXISTS (
    SELECT 1 FROM c_doctype dt
    WHERE dt.ad_client_id = :client_id
      AND dt.docnosequence_id = s.ad_sequence_id
      AND dt.docbasetype = 'SOO'
      AND dt.docsubtypeso = 'OB')
UNION ALL
SELECT s.name,
       'quotation ' || o.documentno || ' (' || o.c_order_id || ') NOT renumbered: '
         || CASE WHEN o.documentno ~ '^[0-9]+$'
                 THEN 'PR' || o.documentno || ' already exists'
                 ELSE 'number is not digits-only' END
FROM c_order o
JOIN c_doctype dt ON dt.c_doctype_id = o.c_doctypetarget_id
JOIN ad_sequence s ON s.ad_sequence_id = dt.docnosequence_id
WHERE o.ad_client_id = :client_id
  AND dt.ad_client_id = :client_id
  AND s.ad_client_id = :client_id
  AND dt.docbasetype = 'SOO'
  AND dt.docsubtypeso = 'OB'
  AND s.prefix = 'PR'
  AND o.documentno NOT LIKE 'PR%'
UNION ALL
SELECT s.name,
       'renumbered quotation ' || o.documentno || ' is at/above the sequence CURRENTNEXT '
         || s.currentnext || ': the series will issue this number again'
FROM c_order o
JOIN c_doctype dt ON dt.c_doctype_id = o.c_doctypetarget_id
JOIN ad_sequence s ON s.ad_sequence_id = dt.docnosequence_id
WHERE o.ad_client_id = :client_id
  AND dt.ad_client_id = :client_id
  AND s.ad_client_id = :client_id
  AND dt.docbasetype = 'SOO'
  AND dt.docsubtypeso = 'OB'
  AND s.prefix = 'PR'
  -- CASE, not AND: Postgres does not promise to evaluate the regex before the cast.
  AND CASE WHEN o.documentno ~ '^PR[0-9]+$'
           THEN substr(o.documentno, 3)::numeric >= s.currentnext
           ELSE false END;
