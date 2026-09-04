# ETP-5111 — Cross-domain plan: unified delete rule for Cuenta Financiera

## Why this change is cross-domain

ETP-5111 replaces three divergent delete criteria in the `financial-account` window with a single
one: the trash button is always enabled, one selected record means Payment Removal and two or more
mean a classic delete, the reason is explained only for a single record, and the row kebab always
offers *Eliminar* and explains its own refusal. The full statement of the rule lives in
`docs/generated-custom-windows/financial-account.md` → "Unified delete rule (ETP-5111)".

That rule cannot be implemented inside one domain, for three reasons:

1. **The old criteria were partly implemented in shared components.** The "pre-block the trash can"
   approach this ticket retires was built as a *generic* `ListView` prop (`isRowDeletable`) and a
   *generic* `BulkDeleteSelectionBar` prop (`disabledReason`). Retiring the approach means removing
   both from the shared components — a window-scoped change could only stop *passing* them, leaving
   the invitation to re-fragment the rule documented and available to the next window.
2. **The single-record-only reason lives in a shared library.** `lib/batchDelete.js`'s
   `toastBatchDeleteOutcome` is the one place every bulk-delete surface in the app renders its
   outcome. Narrowing the reason to `total === 1` (and deleting the two `…WithReason` branches)
   has to happen there or not at all.
3. **Both error-plumbing fixes are in global hooks.** `isBusinessRejection` accepts a reason only
   from a rejection carrying a 4xx `status`, so two hooks had to start attaching it:
   `src/hooks/useStatementActions.js` (for the Extractos tab) and `src/hooks/useBulkRowDelete.jsx`
   (for every `ListView` grid multi-select, Cuentas included — it also had to forward `errors`).
   Both sit in `src/hooks/`, not `windows/custom/financial-account/hooks/`, so every consumer is
   affected. `useBulkRowDelete` is the reason rule 3 of the unified rule holds on the Cuentas list
   at all: without it a single undeletable account fell back to a bare counter.

Because of that, the domain-boundary guard correctly classifies this branch as a cross-domain
change (`platform-change` mixed with `window:financial-account`).

## Domains touched

- **platform-change**
  - `tools/app-shell/src/components/contract-ui/ListView.jsx`
  - `tools/app-shell/src/components/financial-accounts/BulkDeleteSelectionBar.jsx`
  - `tools/app-shell/src/lib/batchDelete.js`
  - `tools/app-shell/src/lib/backendErrors.js`
  - `tools/app-shell/src/hooks/useStatementActions.js`
  - `tools/app-shell/src/hooks/useBulkRowDelete.jsx`
  - `tools/app-shell/src/windows/custom/shared/LifecycleConfirmModal.jsx`
  - `tools/app-shell/src/components/contract-ui/DeleteConfirmDialog.jsx` (new)
  - `tools/app-shell/src/hooks/useBatchDeleteDialog.jsx`
  - `tools/app-shell/src/locales/en_US.json`
  - `tools/app-shell/src/locales/es_ES.json`
  - `tools/app-shell/src/locales/es_AR.json`
  - `tools/app-shell/src/components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx`
  - `tools/app-shell/src/components/contract-ui/__tests__/ListView.isRowDeletable.vitest.jsx` (deleted)
  - `tools/app-shell/src/lib/__tests__/batchDelete.vitest.js`
  - `tools/app-shell/src/hooks/__tests__/useStatementActions.vitest.jsx`

  Why: the retired pre-blocking mechanism (`isRowDeletable` on `ListView`, `disabledReason` on
  `BulkDeleteSelectionBar`) and the narrowed outcome toast (`batchDelete.js`) are shared
  infrastructure by construction — the rule cannot be unified from inside one window while the
  generic component still offers the old escape hatch. `useStatementActions` and `useBulkRowDelete`
  are both global hooks; the latter is what makes the single-record reason work on the Cuentas list,
  and it necessarily improves every other `ListView` grid multi-select at the same time.
  `shared/LifecycleConfirmModal.jsx` is here for the same structural reason: making the kebab's
  Eliminar always confirm required a confirmation with **nothing to warn about**, and `warning`
  arrives there as a pre-resolved string that the shared component rendered unconditionally — so
  "no warning" was inexpressible until it learned that the warning box, the items list and the
  padded body wrapper are each optional. Its other three consumer families
  (`components/contract-ui/ReconciliationSplitPanel.jsx:1043`,
  `financial-account/BankConnectionDeleteConfirmModal.jsx:41`,
  `shared/PaymentLifecycleConfirmModal.jsx:142`) were each checked and all pass a real string, so
  no existing dialog changes appearance — but the file is shared, so the change is
  `platform-change` regardless of who currently benefits.
  `DeleteConfirmDialog.jsx` is new, and it is shared for the reason the ticket exists: it is the
  bulk confirmation's markup lifted verbatim out of `useBatchDeleteDialog` (same keys, same
  `data-testid`s) so that a per-row delete and a bulk delete of the same record are the **same
  component rendered twice** rather than two lookalikes that can drift. `useBatchDeleteDialog` now
  renders it — output byte-identical, which is what makes this a safe extraction rather than a
  rewrite — and the Movimientos kebab renders it with `count={1}`. Extraction was chosen over
  routing the single row through the hook because the hook owns the outcome toast (its counter
  wording would have replaced "Movimiento eliminado" with "1 registros eliminados
  correctamente."), it always renders its dialog node (one hidden Radix `Dialog` per row on a long
  grid), and it offers no way to decline after the user confirms — which the blocked path needs.
  `backendErrors.js` gains the `BACKEND_ERROR_MAP` entries for the three new backend literals
  (matched by **exact text** after `.trim()` — the literals are tabulated byte-for-byte in
  `docs/generated-custom-windows/financial-account.md`, `action=delete` section, and a reviewer
  should diff that table against the Java rather than eyeballing it), and
  the locale files gain four `backendError.*` keys — `paymentMovementNotDeletable`,
  `receiptMovementNotDeletable`, `movementProcessedNotDeletable`,
  `statementBankConnectedNotDeletable`, all three locales, with `es_AR` carrying its own voseo
  forms rather than a copy of `es_ES` — plus the two keys the confirm dialog's new neutral state
  needs (`financeAccountTxConfirmDeleteSubNeither`, `financeAccountTxConfirmDeleteBtnPlain`, also
  all three locales) — and lose `bulkDeleteAllFailedWithReason`,
  `bulkDeletePartialFailureWithReason` and `bulkDeleteBlockedTooltip` (verified gone from
  `en_US`/`es_ES`/`es_AR` **and** from `locales/generated/core.*`). It adds **no new** key to the
  `financeAccountTxRowDelet…` family: an earlier iteration added
  `financeAccountTxRowDeletePaymentLinked` and `…PaymentLinkedNoRef` to interpolate the payment's
  `documentNo`, and dropping the document number from the message removed the need for both, so
  those two are absent rather than added-then-kept (verified absent from all three locales). The
  family's pre-existing members — `financeAccountTxRowDelete`, `financeAccountTxRowDeleting`,
  `financeAccountTxRowDeleteSuccess`, `financeAccountTxRowDeleteError` — are untouched and very much
  live; do not read this as a claim that the family is empty.

- **window:financial-account**
  - `tools/app-shell/src/windows/custom/financial-account/index.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/MovementsTab.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/MovementRowKebab.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/movementActionEligibility.js` (new)
  - `tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx`
  - `artifacts/financial-account/custom/AccountsHeaderTable.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/*.vitest.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/movementActionEligibility.test.js` (new)
  - `artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js`
  - `e2e/tests/flows/financial-account-delete.mocked.spec.js`
  - `docs/generated-custom-windows/financial-account.md`

  Why: this is the window whose three surfaces are being unified. The per-window half of the change
  is the new pure decision module (`movementActionEligibility.js`), the selection-size flag on the
  Movimientos bulk delete, the always-rendered kebab item, the removal of the statements tab's
  `resolveBulkDeleteBlock` / `selectionHasNonDraft` / `bulkDeleteDisabledReason`, and the Cuentas
  slot no longer unmounting its toolbar during a selection. The e2e spec is listed here because
  `docs/ops/domain-boundary-check.md` scopes `window:<name>` to include the window's matching e2e
  tests.

- **repo-infra / docs**
  - `docs/ui-customization.md`
  - `docs/plans/ETP-5111-cross-domain.md` (this file)
  - `docs/feedback.md`

  Why: the retirement of a documented generic prop has to be recorded where that prop was
  documented, or the next ticket reintroduces it. `feedback.md` records the two out-of-scope gaps
  the work uncovered (see "Out of scope", below).

- **runtime module `com.etendoerp.go`** (sibling repo, same branch name `feature/ETP-5111`)
  - `src/com/etendoerp/go/schemaforge/FinancialAccountTransactionsHandler.java`
  - `src/com/etendoerp/go/schemaforge/BankStatementsHandler.java`
  - `src-test/src/com/etendoerp/go/schemaforge/FinancialAccountTransactionsHandlerTest.java`
  - `src-test/src/com/etendoerp/go/schemaforge/BankStatementsHandlerTest.java`

  (Note the doubled segment — the tests live under `src-test/src/…`, not `src-test/…`.
  `FinancialAccountTransactionsLifecycleTest.java`, in the same directory, is **unmodified** and
  must stay green.)

  Why: two of the guards are genuine data-integrity fixes and must land with the frontend change,
  not after it. A movement carrying a `FIN_Payment` was deletable over REST, MCP and the bulk path
  with no validation at all; a statement on a PSD2 bank-connected account was blocked in the
  frontend only. And the `paymentRemoval: false` route the new bulk delete introduces needs its own
  409 pre-check, or the DB trigger fires as a JDBC error and surfaces as an opaque 500. This repo's
  gate does not see that repo — merge is coordinated per `docs/branch-workflow.md`.

## Tests

- Pure decision module (Node test runner, no React):
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/movementActionEligibility.test.js`
    — deliberately inside `__tests__/`, next to the window's other suites, so the canonical glob
    collects it.
- Window behaviour (Vitest):
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/MovementRowKebab.lifecycle.vitest.jsx` — *Eliminar* is present
    for all four cases (GL draft, GL processed, payment-linked, transfer leg); clicking a blocked
    one toasts and never calls `deleteMovement`. Inverts the two ETP-5085 assertions that asserted
    the item was absent. **Also covers the always-confirm follow-up and the dialog routing**, which
    went through three revisions — the assertions to hold are: *every* row opens a dialog (blocked
    included); a blocked row's reason toast fires only **after** confirming and `deleteMovement` is
    never called; a plain draft and a blocked row get `DeleteConfirmDialog`; a posted and/or
    reconciled row still gets the cartel; and a **blocked-and-posted** row gets the generic dialog,
    not the cartel — that last one is the case the routing exists for. Any earlier assertion that a
    draft deletes on a single click, or that a blocked row skips the dialog, is now inverted.
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/MovementsTab.vitest.jsx` — trash enabled on a mixed selection;
    1 selected → `paymentRemoval: true`; 2+ → `paymentRemoval: false`.
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.vitest.jsx` — the
    `resolveBulkDeleteBlock` suite is removed with the function; the disabled-trigger assertions
    are inverted.
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx`
    — the toolbar-swap suite is inverted: the slot's toolbar now stays mounted while a selection is
    active.
  - `artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js` — reads the `.jsx` as
    **text** with regexes rather than rendering it, so it reacts to changes in the component's
    signature and JSX shape, not just its behaviour.
  - Two sibling suites are **unmodified** and must simply stay green:
    `tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.handlers.vitest.jsx`
    (it never asserted the toolbar swap) and
    `.../__tests__/index.wrapper.vitest.jsx` (it never referenced `isRowDeletable`, so dropping the
    prop needed no change there).
- End-to-end (Playwright, mocked):
  - `e2e/tests/flows/financial-account-delete.mocked.spec.js` — two assertions inverted and two
    tests added for the unified rule. Worth calling out for review: with the `ListView.*` vitest
    family currently collecting **0 tests** in both dev profiles, this spec is the only *executable*
    check of "the bulk trash button is never pre-disabled" — and `make dev` does not boot either, so
    it has not actually been run. Both gaps are pre-existing and recorded in `docs/feedback.md`
    (`[2026-09-03] ETP-5111 (pre-existing environment debt)`).
- Platform coverage:
  - `tools/app-shell/src/lib/__tests__/batchDelete.vitest.js` — the `…WithReason` assertions are
    inverted; the `total === 1` case survives unchanged.
  - `tools/app-shell/src/hooks/__tests__/useBulkRowDelete.vitest.jsx` — now covers the hook's new
    `err.status` / `errors` plumbing, which is what makes rule 3 hold on the Cuentas list. (This
    was flagged as an open gap in an earlier revision of this plan; it has since been closed.)
    Unlike the `ListView.*` family this suite is **executable today** — it does not touch the
    `importFormats.js` resolution gap — so the single-record-reason behaviour is pinned by a
    running test rather than by review.
  - `tools/app-shell/src/windows/custom/shared/__tests__/LifecycleConfirmModal.vitest.jsx` — the
    optional body: no items and no `warning` renders neither block **nor** the padded wrapper; one
    of the two still renders correctly.
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/MovementLifecycleConfirmModal.vitest.jsx`
    — the `'neither'` tier's copy, and that no state resolves to the posted wording unless the row
    is actually posted.
  - **No dedicated suite for `DeleteConfirmDialog.jsx`** (nor any change to
    `hooks/__tests__/useBatchDeleteDialog.vitest.jsx`, which is unmodified). That is defensible —
    the extraction is byte-identical output, so the hook's existing suite and the kebab's routing
    assertions cover it from both sides — but a reviewer should know it is covered *indirectly*
    rather than assume otherwise. Its `data-testid`s are unchanged precisely so those existing
    assertions keep applying.
  - `tools/app-shell/src/hooks/__tests__/useStatementActions.vitest.jsx` — new assertion that a
    rejected action carries `error.status`.
  - `tools/app-shell/src/components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx` — the
    **replacement sentinel** for the deleted `ListView.isRowDeletable.vitest.jsx`: with rows
    carrying `deletable: false` selected, the bulk-delete button stays enabled and keeps its plain
    `delete` title. The old file's first case was explicitly the "no other window regressed" guard,
    so the sentinel changes sign instead of disappearing.
- Runtime module (`com.etendoerp.go`, JUnit — compiled and run by the human, not from this repo):
  `FinancialAccountTransactionsHandlerTest` (409 on a payment-linked movement, 409 on a processed
  movement with `paymentRemoval: false`, Payment Removal with `paymentRemoval: true`),
  `BankStatementsHandlerTest` (409 on a statement of a bank-connected account).
- Guards expected on this branch:
  - `npx sf-validate-pipeline --scope=financial-account`
  - `tools/app-shell/test/no-raw-fetch.test.js`, `tools/app-shell/test/auth-header-policy.test.js`
  - `domain-boundary-check` (this file is its exception evidence)
  - `data-testid` codemod check
- Local reproduction of the gate:

  ```bash
  make domain-boundary-check BASE=origin/develop LABELS=cross-domain-approved \
    PR_BODY_FILE=docs/plans/ETP-5111-cross-domain.md
  ```

## PR requirements

`cross-domain-approved` on the label alone is not sufficient — per
`docs/ops/domain-boundary-check.md` ("Exception Policy") the PR must **also** carry a changed
`docs/plans/<ticket>-cross-domain.md`, which is this file, naming the domains, the tests and the
rollback. **CODEOWNER review is still required by branch protection.** The two repos share the
branch name `feature/ETP-5111` and merge together (`docs/branch-workflow.md`). Never bypass the
push gate: `git push --no-verify` is denied by a committed Claude hook
(`.claude/hooks/block-push-no-verify.sh`) and by policy.

## Rollback

Rollback is file-level; no database migration is introduced in this repo. The change is one logical
unit and is best reverted as one — reverting only the frontend would leave the new 409 guards
rejecting deletes the UI still presents as unconditional, and reverting only the backend would leave
`paymentRemoval: false` requests dying as opaque 500s.

- **Platform/shared frontend**: revert `ListView.jsx` (restores the `isRowDeletable` prop),
  `BulkDeleteSelectionBar.jsx` (restores `disabledReason`), `lib/batchDelete.js` (restores the two
  `…WithReason` branches), `lib/backendErrors.js`, `hooks/useStatementActions.js`,
  `hooks/useBulkRowDelete.jsx`, and the three locale files — including the three removed keys, which
  must come back with the branches that read them. Note the `useBulkRowDelete` revert is the one
  change here that is a **net loss of behaviour** rather than a restoration: reverting it takes the
  single-record failure reason away from every `ListView` grid multi-select, not just this window's.
  If a partial rollback is ever wanted, that file is the one worth keeping.
- **Window**: revert `windows/custom/financial-account/*` and
  `artifacts/financial-account/custom/AccountsHeaderTable.jsx`, and delete
  `movementActionEligibility.js` and its test. This restores the three previous criteria as they
  were, including the hidden kebab item and the unmounting toolbar.
- **Tests**: restore `ListView.isRowDeletable.vitest.jsx` and revert the inverted suites (the four
  `financial-account/__tests__/*` ones, `artifacts/.../AccountsHeaderTable.test.js`,
  `lib/__tests__/batchDelete.vitest.js`, `hooks/__tests__/useStatementActions.vitest.jsx`) plus
  `e2e/tests/flows/financial-account-delete.mocked.spec.js`; delete
  `__tests__/movementActionEligibility.test.js` with its module. The new sentinel in
  `ListView.bulkDelete.vitest.jsx` must be removed in the same revert, or it will fail against the
  restored prop.
- **Docs**: revert `docs/generated-custom-windows/financial-account.md` (removing the "Unified
  delete rule" section) and `docs/ui-customization.md` (restoring §9d). Leave the `feedback.md`
  entries in place — they describe pre-existing gaps that are true either way.
- **Runtime module**: revert `FinancialAccountTransactionsHandler.java` and
  `BankStatementsHandler.java` in `com.etendoerp.go` independently, on the same branch. No
  `ETGO_SF_*` configuration changes and no `export.database` are involved, so nothing has to be
  re-pushed to NEO.

## Out of scope (recorded in `docs/feedback.md`)

- `Utilities.checkPeriod` is not called on the NEO `handleDelete` / `handleReactivate` path, which
  diverges from Classic and lets the GO handler unpost into a closed accounting period.
- `PaymentRemovalUtil.reactivate` calls `SessionHandler.getInstance().commitAndStart()` — a
  mid-request commit that would defeat `runMutation`'s `rollbackAndClose()`. The current
  transaction-only path (`TransactionRemovalUtil`, which only `flush()`es) is safe; any future
  payment-aware delete route inherits the risk.
