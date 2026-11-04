# Financial account personal column views

The local `FinancialGridView` adapter connects the existing `useGridView` and
`GridViewControls` to the custom financial account grids when `GRID_COLUMN_VIEWS`
is enabled. The existing renderers still own sorting, filtering, selection,
navigation, row expansion, dimension editing, and actions. The flag-off and
preference-load failure paths retain the original layout.

## Grid inventory and persistence identity

The eight local grids use the existing `financial-account` spec and its declared
entities. The custom transaction, bank statement, and cash-close action endpoints
return records belonging to these entities; account, statement, and reconciliation
record IDs are filters, never parts of the personal view identity.

| Grid | Entity | Row identity |
| --- | --- | --- |
| `MovementsTable` | `transaction` | Movement `id` |
| `CashClose/CashCloseMovementsPanel` | `transaction` | Movement `id` |
| `ReconciledTxnsModal` | `transaction` | Associated movement `transactionId` |
| `StatementsTable` | `importedBankStatements` | Statement `id` |
| `StatementLinesTable` | `bankStatementLines` | Line `id` |
| `StatementLinesInline` | `bankStatementLines` | Line `id` |
| `ReconciliationList/ReconciliationListTable` | `reconciliations` | Reconciliation `id` |
| `ReconciliationList/ClearedItemsInline` | `clearedItems` | Cleared item `id` |

AD-backed columns retain the contract's field key and AD column name. Matching
fields in different projections use the same identity even when their API payload
aliases or displayed labels differ. Signed amounts, balances and aggregates have
stable local keys; this integration does not add backend filter fields.

The existing persistence API stores one view per user/spec/entity, without a
separate projection key. Consequently transaction projections share a saved
view, and statement-line projections share another, including the reconciliation
workspace described below. Saving a projection writes its
available columns through the existing hook; settings for columns absent from that
projection are not retained by that save. Independent saved views for these
projections cannot be provided safely within this slice's common-hook/API boundary.

## Structural safety

Expanders, selection cells, row-action slots, the statement-line match/transaction
pair, and the cleared-item movement icon remain visible and fixed. Saved preferences
cannot change their widths or move data across them. Movable columns are projected
independently within each segment between these anchors, including when stored
preferences contain obsolete structural positions or hidden structural columns.

Explicitly marked rows project their existing cells in the same order as their
headers and skeletons. Full-width table cells update their `colSpan` to the visible
column count. Group rows with a different shape remain intact. Expanded dimensions
and nested forms never consume the column projection; nested child grids establish
their own view scope. Statement row actions remain absolute overlays rather than
becoming data columns. Header drag handles, keyboard movement
(`Alt+Shift+ArrowLeft/ArrowRight`), and resize handles use the existing common
header controls without replacing custom sort handlers.

## Reconciliation workspace

`ReconciliationTab` delegates its matching workspace to the shared
`ReconciliationSplitPanel`. Both tables now use the existing personal-view hook,
controls, and header affordances under `GRID_COLUMN_VIEWS`; the caller needs no
change. The statement-line table uses `financial-account/bankStatementLines`.
The candidate table resolves a scope from its actual rows:

| Candidate records | Existing scope | Identity evidence |
| --- | --- | --- |
| Financial movements | `financial-account/transaction` | Movement `id`, without invoice or schedule markers |
| Sales invoice installments | `sales-invoice/paymentPlan` | `kind: 'invoice'`, `id === scheduleId`, `isReceipt === true` |
| Purchase invoice installments | `purchase-invoice/paymentPlan` | `kind: 'invoice'`, `id === scheduleId`, `isReceipt === false` |

These scopes are backed by the declared entities, not by the
`bank-reconciliation` action endpoint name. The backend emits statement-line IDs
from `FIN_BankStatementLine`, movement IDs from `FIN_Finacc_Transaction`, and
invoice-candidate IDs from `FIN_Payment_Schedule`. The two invoice contracts declare
that last table as `paymentPlan`. An empty candidate table uses the declared source
or reconciled-transaction mode; nonempty rows take precedence over the source filter.

Mixed scopes, missing IDs, unsupported kinds, mismatched schedule IDs, or an
unverifiable invoice direction leave the candidate table in its original layout
without a preference request. Supporting these rows requires a homogeneous,
verifiable backend identity or an explicitly supported heterogeneous scope contract.
No substitute preference identifier is created. A role without access to the
corresponding invoice window may receive a preference-load error; the original
table remains usable through the existing hook's fallback.

Selection stays fixed and visible. In reconciled mode, the amount cell containing
the unlink action is also fixed. Existing matching, sort, totals, selection,
expansion, and read-only write guards remain owned by the original panel. The
partial-match document cards are composite flex content, not another table, and
remain unchanged.

## Boundaries and validation

Account landing/list grids and other common detail/list panels remain outside this
slice. Dimension editors and cash denomination/count forms are forms, not
independent data grids.

Sixteen focused behavior cases were added across six existing and three new test
suites, covering all eight grids and the local adapter. They cover preference
loading, structural safety, order/visibility/width, explicit save, flag-off,
scope changes, grouped rows, nested panels, and existing grid interactions.
The reconciliation follow-up adds 21 parameterized behavior cases to the existing
`ReconciliationSplitPanel.sort.vitest.jsx` suite, covering valid and invalid
scopes, saved layouts, structural locks, sorting, selection, explicit save, and
read-only behavior.
The full app-shell `npm run test:all` suite passed, including the grid behavior suites, and
`npm run build` passed. Browser smoke covered Sales Order only, not these financial grids;
authenticated preference persistence and human QA remain pending. Lint/formatters were not run.
