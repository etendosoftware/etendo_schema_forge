# Bank Reconciliation

> **Retired window.** The generated `bank-reconciliation` window was removed in ETP-4100: its artifact (`artifacts/bank-reconciliation/`), its `menu.json` entry, its registry loader and its route are gone, so `/bank-reconciliation` only reaches `WindowLoader`'s `Window "bank-reconciliation" not found` error. Bank reconciliation is now done in the **Conciliación** tab of an account's detail (`/financial-account/:id`), reached from **Tesorería › Cuentas** (Treasury group since ETP-6389, Finance before):
> - open an account and pick the Conciliación tab, or
> - on an account row of the Cuentas list with pending lines, press the pending pill, which opens `/financial-account/:id?tab=reconciliation&autoMatch=true` (`AccountsHeaderTable.jsx` → `reconcilePill` in `components/financial-accounts/accountCellTypes.jsx`).
>
> The tab renders `ReconciliationSplitPanel` on the NEO spec `bank-reconciliation` (`/sws/neo/bank-reconciliation`, `ReconciliationHandler`). The name lives on only as that backend spec. Full guide: `financial-account.md` (Reconciliation tab). The sections below describe the retired generated window and are kept as history.

## Intent

Use this window to reconcile one bank statement against its transaction lines, review whether the statement balances, and track which lines are already matched to accounting documents such as invoices. The business goal is to let a finance user move a statement from open review toward a fully matched, zero-difference result without leaving the reconciliation context.

## What this window should allow

- List existing reconciliation headers by document number, bank account, and statement date.
- Create or open a reconciliation header with the bank account, statement date, and ending balance that define the statement being reviewed.
- Review statement-level status information such as document number, starting balance, current difference, and reconciliation status without editing those review fields directly.
- Add transaction lines under the selected statement, capturing transaction date, description, amount, and an optional matched invoice.
- Review each line's match status so unmatched items can be separated from already matched items.
- Filter headers by `documentNo`, `bankAccount`, and `statementDate`, and filter lines by `description` and `transactionDate`.

## Interaction model

- Route (until ETP-4100): `/bank-reconciliation` for the list and `/bank-reconciliation/:recordId` for the detail workflow. Neither route exists today; see the note at the top.
- Visibility: no menu entry. It used to be in the Finance menu; today the reconciliation surface is the Conciliación tab under Tesorería › Cuentas.
- Implementation type (until ETP-4100): generated window route loaded from the app-shell registry.
- Window shape: master-child. The header entity is `bankReconciliation`; the child entity is `bankReconciliationLine`.

## Reactive behavior and dependencies

- The detail view is centered on a header/line workflow: opening a reconciliation header loads its child transaction lines in the same detail context.
- Line creation is dependent on a selected header record. In the shared app-shell entity flow, adding a child row posts the parent id and then refreshes both the child collection and the header record, so this window should re-read header review values after line changes.
- `bankAccount` is a selector dependency for the statement header. The checked evidence does not show additional dependent selectors cascading from that choice.
- `matchedInvoice` is a search-based reference on each line. `matchStatus` is read-only, so the visible design suggests status is derived from reconciliation or matching logic rather than typed manually.
- `startingBalance`, `difference`, and `status` are read-only on the header. That strongly suggests statement balancing and status progression are computed elsewhere and then reflected back into the form.
- The backend contract declares an `autoMatch` process endpoint with preconditions requiring at least one unmatched line, an `Open` or `Partial` reconciliation, and an active bank account. In the checked generated page, `processes` is empty, so no dedicated in-page action for that process is currently visible.
- Mock data reinforces the expected semantics: headers with `difference: 0` appear as `Matched`, while non-zero differences appear as `Open` or `Partial`; lines with and without `matchedInvoice` can still appear as `Matched` or `Unmatched`. That indicates matching is not explained solely by the presence of an invoice reference.

## Gap assessment

- The window exposes read-only `startingBalance`, `difference`, `status`, and line-level `matchStatus`, but the checked frontend does not show the formula or event sequence that updates those values after a user edits balances or lines. Treat reconciliation math as expected behavior, not proven client-side behavior.
- The backend contract exposes `autoMatch`, but the generated SPA page does not surface a visible process button or action for it. Auto-match should be treated as a current gap in the checked UI unless another shell extension exposes it at runtime.
- The evidence shows that `matchedInvoice` can be searched and stored, but it does not prove whether selecting an invoice immediately changes `matchStatus`, affects statement `difference`, or enforces matching rules. That remains an open ambiguity.
- Defaulting behavior for new reconciliations is only supported by the shared app-shell defaults flow; this window's own checked files do not show which bank-reconciliation-specific defaults should appear, such as whether `startingBalance` is pulled from the prior statement.

## Manual verification

Current behaviour:

1. Confirm the sidebar has no Bank Reconciliation entry. In Tesorería › Cuentas, press the pending pill on a bank account row with pending lines (an account with none shows a static reconciled badge instead): the account detail opens on the Conciliación tab (`?tab=reconciliation&autoMatch=true`). For the reconciliation flow itself, follow `financial-account.md`.

The steps below applied to the retired generated window and can no longer be run:

1. Open `/bank-reconciliation` from the Finance menu and confirm the list shows statement headers with document number, bank account, statement date, ending balance, difference, and status.
2. Create a reconciliation header and confirm `bankAccount`, `statementDate`, and `endingBalance` are editable while `documentNo`, `startingBalance`, `difference`, and `status` remain review-only.
3. Open the saved header, add several lines with positive and negative amounts, and confirm the child table refreshes under the same header.
4. Add and remove `matchedInvoice` values on lines and verify whether `matchStatus`, header `difference`, or header `status` react automatically or only after save/refresh.
5. If your deployed backend exposes reconciliation actions beyond the checked generated page, verify whether an auto-match action exists and whether it is blocked when all lines are already matched or the reconciliation is not `Open` or `Partial`.

## Automated evidence

- Removal: commit `1e044565f` (ETP-4100, "drop legacy artifact") deleted `artifacts/bank-reconciliation/` and the window's entries in `menu.json`, `windows/registry.js` and `App.jsx`. The files named in the next bullets no longer exist; they are kept to explain what this guide described.
- Today's entry point: `artifacts/financial-account/custom/AccountsHeaderTable.jsx` (`onReconcile` → `/financial-account/:id?tab=reconciliation&autoMatch=true`) and `tools/app-shell/src/windows/custom/financial-account/ReconciliationTab.jsx` (renders `ReconciliationSplitPanel`).
- (Retired) `tools/app-shell/src/menu.json` registered `bank-reconciliation` under the Finance menu.
- (Retired) `tools/app-shell/src/windows/registry.js` mapped `bank-reconciliation` to the generated window loader.
- (Retired) `artifacts/bank-reconciliation/generated/web/bank-reconciliation/BankReconciliationPage.jsx` confirmed a master-child detail view with `bankReconciliation` as the header entity, `bankReconciliationLine` as the child entity, header summary fields for `documentNo`, `startingBalance`, and `difference`, and an empty `processes` array.
- (Retired) `artifacts/bank-reconciliation/generated/web/bank-reconciliation/BankReconciliationForm.jsx`, `BankReconciliationLineForm.jsx`, `BankReconciliationTable.jsx`, and `BankReconciliationLineTable.jsx` confirmed the visible editable, read-only, and filterable fields described above.
- (Retired) `artifacts/bank-reconciliation/contract.json` defined the same header/line fields plus the backend `autoMatch` process endpoint and its stated preconditions.
- No dedicated automated app-shell test file was found for this specific window; shared route and CRUD behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.