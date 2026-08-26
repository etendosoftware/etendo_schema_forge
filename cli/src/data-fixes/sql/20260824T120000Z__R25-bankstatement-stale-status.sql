-- @id: R25-bankstatement-stale-status
-- @gap: L1
-- @risk: low
-- @type: sql
-- @description: Re-derive EM_ETGO_STATUS on FIN_BankStatement headers stuck at DRAFT despite
--   Processed='Y' (ETP-4891 follow-up)

-- Background
-- --------------------------------------------------------------------------------------------
-- EM_ETGO_STATUS is an Etendo Go-only extension column — the "Estado" the SPA's "Extractos
-- importados" list shows (Borrador / Pendiente / Parcial / Conciliado). It is derived from
-- (Processed, line count, matched count) by BankStatementAggregates.apply(), but until this
-- ticket only OUR OWN write flows (BankStatementsHandler's create/process/reactivate) and the
-- per-line observer (BankStatementLineAggregateHandler) ever called it. A statement imported
-- through the PSD2 bank-connection sync (SaltEdgeAccountLinkHelper#fetchAccountTransactions, in
-- the external com.etendoerp.psd2 module) is created through a path that never touches this
-- module's handlers: its lines DO get counted correctly (the line-level observer still fires for
-- each insert), but at that moment Processed is still 'N', so the status those line events
-- compute — correctly, for that instant — is 'DRAFT'. The external sync then flips Processed to
-- 'Y' directly on the header, and nothing re-derives the status afterward, since no line event
-- fires for a header-only change. The column is left reading "Borrador" on an already-processed
-- statement forever — and the SPA's own "Procesar" action then fails with "Only draft
-- (unprocessed) statements can be modified", because that guard correctly reads the REAL
-- Processed flag, which already says 'Y'.
--
-- The runtime fix (BankStatementHeaderStatusHandler, a new FIN_BankStatement NEW/UPDATE
-- observer mirroring BankStatementLinePendingAmountHandler's in-event setCurrentState technique)
-- keeps this in sync going forward. This data-fix repairs statements already stuck from before
-- that handler existed.
--
-- Deriving the correct status
-- --------------------------------------------------------------------------------------------
-- Mirrors BankStatementsSupport.deriveStatementStatus(processed, lineCount, matchedCount) exactly:
--   not processed         -> DRAFT   (excluded here: this fix only touches processed='Y' rows)
--   lineCount = 0 OR matchedCount = 0 -> PENDING
--   matchedCount >= lineCount         -> RECONCILED
--   otherwise                          -> PARTIAL
-- Uses the header's OWN already-correct EM_ETGO_LINE_COUNT / EM_ETGO_MATCHED_COUNT — those were
-- never wrong (the per-line observer kept them current); only EM_ETGO_STATUS itself is stale, so
-- no line-table query is needed.
--
-- Idempotency
-- --------------------------------------------------------------------------------------------
-- @check matches only processed='Y' rows whose stored status no longer matches what the same
-- derivation would produce today, so a re-run after @apply corrects itself to 0 rows.

-- @check
SELECT 1
FROM fin_bankstatement bs
WHERE bs.ad_client_id = :client_id
  AND bs.processed = 'Y'
  AND bs.em_etgo_status IS DISTINCT FROM (
    CASE
      WHEN COALESCE(bs.em_etgo_line_count, 0) = 0 OR COALESCE(bs.em_etgo_matched_count, 0) = 0
        THEN 'PENDING'
      WHEN bs.em_etgo_matched_count >= bs.em_etgo_line_count THEN 'RECONCILED'
      ELSE 'PARTIAL'
    END
  );

-- @apply
UPDATE fin_bankstatement bs
SET em_etgo_status = CASE
      WHEN COALESCE(bs.em_etgo_line_count, 0) = 0 OR COALESCE(bs.em_etgo_matched_count, 0) = 0
        THEN 'PENDING'
      WHEN bs.em_etgo_matched_count >= bs.em_etgo_line_count THEN 'RECONCILED'
      ELSE 'PARTIAL'
    END,
    updated = now(),
    updatedby = '0'
WHERE bs.ad_client_id = :client_id
  AND bs.processed = 'Y'
  AND bs.em_etgo_status IS DISTINCT FROM (
    CASE
      WHEN COALESCE(bs.em_etgo_line_count, 0) = 0 OR COALESCE(bs.em_etgo_matched_count, 0) = 0
        THEN 'PENDING'
      WHEN bs.em_etgo_matched_count >= bs.em_etgo_line_count THEN 'RECONCILED'
      ELSE 'PARTIAL'
    END
  );
