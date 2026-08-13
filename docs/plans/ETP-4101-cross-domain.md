# ETP-4101 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4101 (T7) delivers the **automatic bank-reconciliation matching engine**:
a two-pass motor (standard Etendo algorithm + rule engine) that proposes 1:N
groupings for bank statement lines, surfaces them in the `AutoMatchSuggestionModal`,
and creates GL-item transactions (Cobro/Pago) for rule-matched lines. The feature
also adds per-line state classification (suggested/byRule/difference/reconciled)
to the left-panel filter, 1:N group persistence via `EM_ETGO_Match_Group_ID`, and
navigation from the reconciled-txns modal to the Movements tab. It necessarily
spans frontend components, artifacts, i18n, and the backend handler, all under
the same ticket.

## Domains touched

- **platform-change** — new shared component
  `tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx`
  (+ vitest); updated hooks `tools/app-shell/src/hooks/useReconciliation.js`
  (`useAutoMatch`, `useApplySuggestions`, enriched `usePendingStatementLines`
  with `counts`); `ReconciliationSplitPanel.jsx` client-side state filter + new
  state badges; `MovementsTable.jsx` highlight + scroll + expand for deep-link.
- **app-shell-core** — i18n keys for automatch modal and new state filter labels
  (ES + EN) `packages/app-shell-core/src/locales/{en_US,es_ES}.json`.
- **window:financial-account** — `index.jsx` auto-opens automatch modal on
  Reconciliación tab entry and on ReconcilePill click; `MovementsTab.jsx` threads
  `highlightTxnId`; `ReconciledTxnsModal.jsx` navigates to transaction (not
  payment); `StatementLinesInline.jsx` adds N.º de referencia column + header
  alignment; `ManualStatementModal.jsx` date-picker click-outside fix.
- **window:match-rule** — `decisions.json` makes `accountingConcept` (C_GLItem_ID)
  mandatory (`required: true`); `contract.json` + `generated/` regenerated.
- **artifacts:financial-account** — `decisions.json` adds `referenceNo` as grid
  column (gridOrder 6); `contract.json` + `generated/` regenerated.
- **backend (com.etendoerp.go, separate repo, same ticket)** —
  `ReconciliationHandler`: `buildAutoMatch`, `applySuggestions`,
  `createTransactionForRule` (BPD/BPW); `buildPendingLines` returns `state` +
  `counts`; `MatchRuleEngine`; `AutoMatchSupport` (group builders, signal grouping,
  line classification, `mergeMatchGroups`); `BankStatementsSupport`/`Handler`
  expose `transactionId` + `matchGroupId` and merge 1:N split sub-lines;
  `MatchRuleHandler` validates `accountingConcept` required; DB column
  `EM_ETGO_Match_Group_ID` on `FIN_BankStatementLine`; `ETGO_MATCH_RULE.C_GLITEM_ID`
  set NOT NULL.

## Tests

- `tools/app-shell`: vitest for `AutoMatchSuggestionModal` (19 tests),
  `ReconciliationSplitPanel` (state filter + counts + visibleTotal) — green.
- Backend: `MatchRuleEngineTest`, `AutoMatchSupportTest` (matchByKey + classify +
  merge), `ReconciliationHandlerTest` (applySuggestions + createTransactionForRule
  + pendingLines state/counts), `MatchRuleHandlerTest` (mandatory accountingConcept)
  — compiled and passing.

## Rollback

Revert the ETP-4101 commits on both repos (schema_forge + com.etendoerp.go).
The `EM_ETGO_Match_Group_ID` column and the `C_GLITEM_ID NOT NULL` constraint on
`ETGO_MATCH_RULE` must be reverted in the DB with `./gradlew update.database` after
reverting the sourcedata XML. No data migration is required (the match group column
is informative and any existing rules without a GL item were either updated or
removed before applying the constraint).
