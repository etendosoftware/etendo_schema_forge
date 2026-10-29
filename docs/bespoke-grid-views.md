# Personal views for bespoke business grids

## Scope and contract

This inventory covers production hand-written table surfaces under `tools/app-shell/src` and
`artifacts/*/custom`, including raw `<table>` markup and the UI `Table` primitive. Generated
outputs are not source files and were not edited. A table-shaped view is eligible only when
it has a verified configured spec/entity and its data columns can be customized without
removing the controls that define the workflow.

The migrated components use the existing `GRID_COLUMN_VIEWS`, `useGridView`,
`GridViewControls` and column-header controls. Each personal view belongs to the authenticated
user and the existing spec/entity. Visibility, column order and explicit widths are saved only
when the user selects Save view. Filters, sorting, selection, expanded rows and edit drafts
are not saved as column preferences. The feature flag gates personalization. Before a view is
ready, when loading fails, and with the flag disabled, each surface retains its original column
layout and interactions. No replacement spec/entity IDs or persistence API were introduced.

Structural selection, expansion, hierarchy and action cells remain outside the customizable
data-column model. Empty/loading/expanded rows and totals follow the effective data-column
count and ordering where applicable. Existing sort, edit and status handlers remain the
source of business behavior.

## Migrated surfaces

Paths in this table are relative to the repository root. Scopes are established by the existing
fetch paths, constants and entity contracts, rather than display names.

| Production component | Personal-view scope | Preserved behavior and structure |
| --- | --- | --- |
| `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx` | `amortization` / `lines` | Inline edits and queued writes, expansion, row selection and action cells; later view arrival does not discard an edit draft. Scope agrees with the amortization contract and existing line fetch. |
| `tools/app-shell/src/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx` | `sales-invoice` or `purchase-invoice` / `reversedInvoices` | Invoice scope comes from the existing supported API base; an unrecognized base disables personalization. Expansion, inline 349 editing and fixed actions remain intact. The shared panel serves both invoice windows. |
| `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx` | `assets` / `amortizationLine` | Selection, data cells and totals remain aligned after hiding or reordering columns. Scope agrees with the existing asset-amortization endpoint. |
| `tools/app-shell/src/windows/custom/warehouse/WarehouseTransactionsTable.jsx` | `warehouse` / `productTransactions` | Existing sorting and document navigation remain active; original unsized column geometry remains the default. Scope matches `useWarehouseStock`. |
| `tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx` | `tbai-facturas-enviadas` / `sincronización` | Fixed leading selection, invoice navigation, status/error actions, filters, pagination and export remain intact. Scope uses `TBAI_SPEC` and `TBAI_ENTITY` from `useFiscalMonitor.js`. |
| `tools/app-shell/src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx` | `sii-monitor` / active invoice entity | Fixed leading selection, invoice/status actions, tab changes, pagination and export remain intact. `SUBTAB_ENTITIES` selects `issuedInvoices`, `receivedInvoices`, `issuedInvoices(previousPeriod)` or `receivedInvoices(previousPeriod)` from the existing constants; preferences therefore follow the actual entity. The previous-period UI remains subject to its existing restrictions. |
| `tools/app-shell/src/windows/custom/organization/ActividadesIaeSection.jsx` | `organization` / `actividadesDelIae` | Existing and new rows share visible column order. Selector writes, main-activity toggle, limits and warnings remain intact; delete/save/cancel cells remain fixed. The main-activity column remains required. Scope and AD columns match the organization contract and `useActividadesIae`. |
| `tools/app-shell/src/windows/custom/organization/RepresentantesLegalesSection.jsx` | `organization` / `representanteLegal` | Fixed leading line/Modelo 390 marker and trailing edit/delete cells. Data-column preferences do not reorder representative records or change the separate edit form. Scope matches the organization contract and `useRepresentantesLegales`. |
| `artifacts/chart-of-accounts/custom/AccountTreeView.jsx` | `chart-of-accounts` / `elementValue` | Account code, tree indentation and expansion remain structural. Data columns, widths, keyboard opening, selection and row navigation retain their existing behavior, including when Name is hidden. |
| `tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx` — statement lines | `financial-account` / `bankStatementLines` | Existing backend rows carry `FIN_BankStatementLine` IDs. Fixed selection, matching, sorting, totals, expansion and read-only write guards remain intact. The financial-account follow-up explicitly admits this shared component. |
| `tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx` — candidate table | `financial-account` / `transaction`, `sales-invoice` / `paymentPlan`, or `purchase-invoice` / `paymentPlan` | Scope follows homogeneous actual rows: movement IDs, or invoice installments with `kind: 'invoice'`, `id === scheduleId` and boolean `isReceipt`. Invoice candidates are `FIN_Payment_Schedule` records, not invoice headers. Selection stays fixed; reconciled amount/unlink stays locked. Existing matching, sort, selection, actions and read-only behavior remain owned by the panel. |

The reconciliation scopes are verified against `ReconciliationHandler` row builders and the
financial-account and invoice entity contracts. Empty candidate tables use their declared source
or reconciled-transaction mode; nonempty actual rows take precedence. These views share the
existing user/spec/entity preference with other projections, so saving a projection does not
retain settings for absent columns. Preference-load errors, including missing invoice-window
access, retain the original usable table. See
[`financial-account/README.md`](../tools/app-shell/src/windows/custom/financial-account/README.md)
for the complete local inventory and scope evidence.

## Interactive surfaces blocked by the existing persistence boundary

These are verified interactive surfaces, not completed migrations. Resolving them requires a
real configured entity or a separate decision about safe customization. Assigning an arbitrary
scope would misrepresent their backend identity or share incompatible preferences.

Unless a path starts with `artifacts/`, paths below are relative to `tools/app-shell/src/`.

| Surface | Reason it remains unchanged |
| --- | --- |
| `windows/custom/warehouse/WarehouseProductsTab.jsx` | `aggregateProducts` groups `binContents` into product/valuation rows; no single configured entity represents those aggregate rows. |
| `windows/custom/user/UserRolesTab.jsx` | Dynamic role-assignment comparison matrix from template/overview APIs. Role columns are part of the assignment operation; no configured row entity and safe independent data-column model were verified. |
| `pages/roles/RolesAccessMatrix.jsx` | Dynamic permission matrix, with role/permission columns integral to the operation and no verified configured grid entity. |
| `artifacts/payment-in/custom/ApplyToInvoices.jsx` — both tables | Pending-invoice and schedule/action projections, including `scheduleId`, are not a configured entity backing either table. |
| `pages/AcctProcessMonitorPage.jsx` | Operational process/action history from `useAcctProcessMonitor`, without a configured grid entity. |
| `pages/ApiKeysPage.jsx` | Uses the built-in `/oauth2/api-keys` API, not a configured spec/entity. |
| `pages/OAuth2ClientsPage.jsx` | Uses the built-in OAuth client-management API, not a configured spec/entity. |
| `pages/MyCompaniesPage.jsx` — owned-company table | Membership/environment-management projection from the owned-environments API; no configured grid entity. |
| `pages/MyCompaniesPage.jsx` — invited-company table | Membership/invitation projection from the invited-environments API; no configured grid entity. |
| `pages/PortalPage.jsx` | Public external-bearer invoice portal, without the authenticated user's personal-grid scope. |
| `windows/custom/fiscal-models/FmListPage.jsx` | Multi-model declaration projections from `/fiscal303/declarations`; no verified configured entity. |
| `windows/custom/fiscal-models/models/349/FmModel349Page.jsx` — rectifications table | Custom fiscal-endpoint projection, without a verified configured entity. |
| `windows/custom/fiscal-models/models/349/FmModel349Page.jsx` — operators table | Custom fiscal-endpoint operator projection, without a verified configured entity. |
| `windows/custom/fiscal-models/FmTabContent.jsx` — sources table | Source-document projection rather than a configured entity. |
| `windows/custom/fiscal-models/FmTabContent.jsx` — incidents table | Computed validation incidents with conditional suggestion/action columns; no configured entity or safe column-customization contract. |
| `windows/custom/fiscal-models/models/390/FmSources390.jsx` | Interactive invoice/tax/box projections without one configured entity. |
| `windows/custom/fiscal-models/models/390/Settlements303Table390.jsx` | Period/declaration-link projection without a verified configured entity. |
| `windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx` | Combines partial/rejected/invalid status entities; the union does not have one safe persisted entity scope. |
| `components/contract-ui/ReconciliationSplitPanel.jsx` — mixed or unverifiable candidate rows only | `resolveReconciliationCandidateScope` rejects mixed scopes, missing IDs, unsupported kinds, invoice `id`/`scheduleId` mismatch or nonboolean invoice direction. This state retains the original candidate table without a preference request. Supporting it requires homogeneous verifiable backend identity or an explicitly supported heterogeneous scope contract; no substitute identifier is invented. |

## Static, form, demonstration and output exclusions

| Surface | Reason it is excluded |
| --- | --- |
| `windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx` | Read-only payment-detail display without selection, sorting, inline editing or row actions; not an interactive grid. |
| `windows/custom/fiscal-models/models/390/FmBoxes390.jsx` — activities table | `manualData` form/calculation matrix, not a customizable business-record grid. |
| `windows/custom/fiscal-models/models/390/FmBoxes390.jsx` — representatives table | `manualData` form matrix; the underlying organization representative grid is migrated separately. |
| `pages/SalesPage.jsx` | Demonstration table using generated `mockData`, not a verified production entity grid. |
| `pages/PurchasesPage.jsx` | Demonstration table using generated `mockData`, not a verified production entity grid. |
| `pages/ContactsPage.jsx` | Demonstration directory table using generated `mockData`; the production contact table consumes DataTable. |
| `pages/SmartScanPage.jsx` | Local `RECENT_SCANS` demonstration data, without a verified production entity grid. |
| `pages/ArtifactViewerPage.jsx` | JSON/code key-value inspector; table markup is a layout aid. |
| `components/copilot/MarkdownContent.jsx` | Arbitrary rendered Markdown table content; not a business grid definition. |
| `windows/custom/user/AssignTemplateRolesControl.jsx` | Chip/assignment form rather than table markup; no independent grid surface. |
| `components/contract-ui/ReportDrawer.jsx` | Report rendering/output, explicitly outside scope. |
| `windows/custom/return-material-receipt/useReturnReceiptPdf.js` | PDF document markup/output. |
| `windows/custom/goods-shipment/useShipmentPdf.js` | PDF document markup/output. |
| `windows/custom/return-to-vendor-shipment/useReturnToVendorPdf.js` | PDF document markup/output. |
| `windows/custom/shared/documentPdf.js` | Shared PDF document markup/output. |
| `windows/custom/fiscal-models/models/349/use349Pdf.js` | Fiscal PDF report markup/output. |

## Shared and financial surfaces owned by other slices

These were outside the original bespoke-family edit boundary, not global feature exclusions.
The table records their effective coverage across the shared and financial slices. Actual
unresolved identity/customization blockers are listed under *Interactive surfaces blocked by
the existing persistence boundary* above and in the standalone inventory. Framework ownership
is not itself a blocker. `ReconciliationSplitPanel` is registered in the migrated matrix above.

| Surface | Effective coverage or ownership |
| --- | --- |
| `components/contract-ui/InlineLinesPanel.jsx` | Integrated by the shared lines slice using stable spec/entity; active add-row forms temporarily retain default alignment. |
| `components/contract-ui/DetailView.jsx` | Supplies the primary line grid's spec identity; it is not an independent grid controller. |
| `components/contract-ui/ListModalWindow.jsx` | Integrated by the modal slice when its declared spec/entity and API contract agree. |
| `components/contract-ui/ListView.jsx` | Integrated for audited standard surfaces and forwarding adapters; unknown/custom layouts fail closed. |
| `components/contract-ui/DataTable.jsx` | Existing renderer/header affordances consume a parent controller; direct use alone does not establish a scope. |
| `components/contract-ui/CreateReturnWizard.jsx` | Transient wizard/action projection, not a completed configured-entity migration; no valid independent personal-view scope is asserted. |
| `components/copilot/ocr/OcrLinesReviewModal.jsx` | Transient OCR review/action projection; no configured persistent row entity is asserted. |
| `windows/WindowLoader.jsx`, `windows/registry.js` | Shared slice wiring determines audited ListView eligibility. |
| `lib/flags/`, `hooks/` and shared grid controls | Existing feature/persistence infrastructure consumed by all slices; not additional business-grid surfaces. |
| `windows/custom/financial-account/CashClose/CashCloseMovementsPanel.jsx`, `MovementsTable.jsx`, `ReconciledTxnsModal.jsx` | Integrated by the financial slice with `financial-account/transaction`. |
| `windows/custom/financial-account/StatementsTable.jsx` | Integrated with `financial-account/importedBankStatements`. |
| `windows/custom/financial-account/StatementLinesTable.jsx`, `StatementLinesInline.jsx` | Integrated with `financial-account/bankStatementLines`. |
| `windows/custom/financial-account/ReconciliationList/ReconciliationListTable.jsx`, `ClearedItemsInline.jsx` | Integrated with `financial-account/reconciliations` and `financial-account/clearedItems`, respectively. |
| Remaining `windows/custom/financial-account/**` | Supporting dialogs/forms/adapters are not blanket grid exclusions; see the financial-account README for the complete eight-grid inventory and reconciliation follow-up. |

### Direct DataTable consumers

This retains the direct-consumer inventory; it is not a global exclusion list. Audited
adapters inherit the ListView controller, independent surfaces require their own verified
controller, and attachment/mock/dormant projections remain limited as documented in the
[standalone inventory](standalone-datatable-grid-views.md). Paths use the same base convention.

| Surface | Reason |
| --- | --- |
| `pages/InventoryPage.jsx` | Direct DataTable consumer. |
| `pages/ReportsPage.jsx` | Direct DataTable consumer. |
| `pages/CrmPage.jsx` | Direct DataTable consumer. |
| `pages/ProjectsPage.jsx` | Direct DataTable consumer. |
| `pages/HrPage.jsx` | Direct DataTable consumer. |
| `pages/AccountingPage.jsx` | Direct DataTable consumer. |
| `artifacts/financial-account/custom/AccountsHeaderTable.jsx` | Audited financial-account ListView adapter; receives the shared parent controller. |
| `artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx` | Direct DataTable consumer. |
| `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx` | Direct DataTable consumer. |
| `components/attachments/AttachmentsTable.jsx` | Not migrated: cross-cutting attachment endpoint has no configured attachment entity or collision-free attachment-surface persistence contract. |
| `windows/custom/user/UserHeaderTable.jsx` | Direct DataTable consumer; the raw-table search hit is a documentation example, not another renderer. |
| `windows/custom/contacts/ContactsTable.jsx` | Direct DataTable consumer. |
| `windows/custom/shared/PaymentHeaderTableBase.jsx` | Direct DataTable consumer. |
| `windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx` | Direct DataTable consumer. |
| `windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx` | Direct DataTable consumer. |
| `windows/custom/calendar/YearTableWithCloseStatus.jsx` | Direct DataTable consumer. |
| `windows/custom/calendar/AccountingPanel.jsx` | Direct DataTable consumer. |
| `windows/custom/calendar/PeriodsExpandablePanel.jsx` | Direct DataTable consumer. |
| `windows/custom/warehouse/WarehouseCustomTable.jsx` | Direct DataTable consumer; the separate transaction table is migrated. |
| `windows/custom/product/StockTableGrouped.jsx` | Direct DataTable consumer. |
| `windows/custom/product/ProductCustomTable.jsx` | Direct DataTable consumer. |

### Search false positives and generated files

`components/financial-accounts/AccountsTable/accountColumns.jsx`,
`components/financial-accounts/SortableHeaderLabel.jsx` and
`artifacts/amortization/custom/AmortizationBulkActions.jsx` contain table-related documentation
matches rather than independent table renderers. Table-related references in `lib/linesActionSlot.js`,
`lib/linesColumnWidth.js`, `lib/linesContentWidth.js`, `lib/linesScrollHost.js`, `lib/clientSort.js`,
`lib/neoRequestDedupe.js` and `hooks/useEntity.js` are helpers/documentation, not additional UI
surfaces. Generated files under `artifacts/*/generated/` are output, not editable sources; this
migration changes only the hand-written implementations they import.

## Focused coverage and delivery evidence

Repository: `etendo_schema_forge`. Branch: `feature/ETP-5835`. The original bespoke-family delivery covers nine production files;
the separately authorized financial-account follow-up adds `ReconciliationSplitPanel`.
Pre-existing changes elsewhere are not delivery evidence for these tasks.

Nine existing Vitest suites were extended (`Extended: 9 · Rewritten: 0 · New: 0`). Test paths
below are relative to `tools/app-shell/src/windows/custom/`:

| Test file | Added behavior coverage |
| --- | --- |
| `amortization/__tests__/AmortizationLinesTable.vitest.jsx` | Disabled/inactive fallback, hidden/reordered columns and widths, fixed expansion/selection/actions, inline PUT and draft retention when a view arrives. |
| `assets/__tests__/AssetsAmortizationPanel.vitest.jsx` | Header/body/footer alignment, widths, fixed selection and inactive defaults. |
| `sales-invoice/__tests__/ReversedInvoicesPanel.vitest.jsx` | Both invoice scopes, disabled/unknown-scope behavior, moved cells, expanded-row span and inline 349 PATCH. |
| `warehouse/__tests__/WarehouseTransactionsTable.vitest.jsx` | Real hook restore/save/keyboard resize, hidden/order/width preferences, sorting and document navigation, disabled no-request behavior, load-failure fallback and original unsized widths. |
| `fiscal-monitor/__tests__/TbaiMonitorSection.vitest.jsx` | Rendered visibility/order/width boundary, fixed selection, invoice/status actions and default fallback. |
| `fiscal-monitor/__tests__/SiiMonitorSection.vitest.jsx` | Rendered visibility/order/width boundary, fixed selection, invoice/status actions, fallback and entity scope after tab changes. |
| `organization/__tests__/ActividadesIaeSection.vitest.jsx` | Existing/new-row column alignment, selector/default edits, PATCH/POST, fixed action cells and fallback. |
| `organization/__tests__/Modelo390IdentitySection.vitest.jsx` | Representative line/390 marker/actions, reordered data, edit-form PATCH and fallback. |
| `chart-of-accounts/__tests__/AccountTreeView.vitest.jsx` | Fixed account code/expansion, reordered cells/widths/colgroup, selection and keyboard/name opening when Name is hidden. |

The reconciliation follow-up extends the existing
`tools/app-shell/src/components/contract-ui/__tests__/ReconciliationSplitPanel.sort.vitest.jsx`
suite with 21 parameterized behavior cases for valid and invalid scopes, saved layouts,
structural locks, sorting, selection, explicit save and read-only behavior; this suite passed
as part of the full app-shell test run.

`make find-tests FILE=<component path>` was used only to discover reusable suites. The full
`npm run test:all` suite passed (1,175 Vitest files; 24,617 tests passed, 2 skipped), and
`npm run build` passed. The mock-browser smoke covered Sales Order only, not these bespoke
surfaces; it used stubbed session/access and grid-view responses, so authenticated preference
persistence was not verified. Lint/formatters and human QA remain pending. The actual scope
limits and blocked surfaces remain listed above.
