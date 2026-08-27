# Raw `fetch` inventory — app-shell frontend

Counts every direct `fetch(` call in `tools/app-shell/src`. Tests, mocks and spec files
are excluded, and comments are stripped before counting (prose such as "overrides the
fetch (used by tests)" would otherwise inflate the total). Measured 2026-08-27 while
closing ETP-5022.

## Why this exists

ETP-5022 added `Accept-Language` to every request, and that landed in **one place** — the
canonical header builders (`buildHeaders` / `authHeaders` in `app-shell-core`,
`buildAuthHeaders` in `etendo-go-core`) — because almost every call site already sourced
its headers from them. Header construction is therefore *already* centralized, and
`tools/app-shell/test/auth-header-policy.test.js` now fails the build if a new call site
hand-rolls an `Authorization` header or uses a builder without importing it.

What is **not** centralized is the `fetch` call itself. `createApiFetch`
(`app-shell-core/src/auth/api.js:55`) already wraps `buildHeaders` and adds four things
the raw call sites below lack:

| Concern | Raw `fetch` | `apiFetch` |
|---|---|---|
| `Authorization` + `Accept-Language` | via builder — already correct | via builder |
| Base URL | repeated at every call site | `baseUrl` argument |
| `credentials: 'include'` | per call site, easy to omit | always set |
| `FormData` boundary (dropping `Content-Type`) | manual | automatic |
| **401 handling** | **none — each site fails its own way** | `onUnauthorized()`, then throws |

The 401 gap is the substantive one: when a token expires, these 293 call sites do not
route the user to the login screen. Everything else is duplication rather than defect.

## Totals

- **121 files**, **293 raw `fetch` calls**
- **109 files** import a canonical header builder directly
- **9 files** receive ready-made `headers` from a parent component instead of importing a
  builder — still authenticated, just one level removed
- **3 files** send no auth headers at all, and all three are legitimate (see below)

**There is no missing-authentication case in this inventory.** This is a duplication and
401-handling problem, not a security one.

| Calls per file | Files | Calls |
|---|---|---|
| 7+ | 8 | 79 |
| 4-6 | 16 | 71 |
| 2-3 | 36 | 82 |
| 1 | 61 | 61 |

## Unauthenticated by design

| File | Calls | Why |
|---|---|---|
| `src/pages/ArtifactViewerPage.jsx` | 3 | dev server (`/api/artifacts`), no token expected |
| `src/components/support/helpDocs.js` | 2 | public mkdocs assets (`mkdocs.yml`, `search_index.json`) |
| `src/preview/PreviewPage.jsx` | 1 | dev server (`/api/source`), no token expected |

## Suggested migration order

Highest call count first: each file migrated removes the most duplication per unit of
review effort and concentrates the 401 fix where the most requests happen. The top 10
files alone account for 90 of the 293 calls.

`auth` column — `builder`: imports a builder, so migration is a mechanical swap.
`inherited`: takes `headers` as a prop, so the parent must be migrated in the same pass.
`none`: unauthenticated by design, skip.

| # | File | Calls | auth |
|---|---|---|---|
| 1 | `src/components/contract-ui/DetailView.jsx` | 19 | builder |
| 2 | `src/hooks/useEntity.js` | 14 | builder |
| 3 | `src/components/contract-ui/CreateContactModal.jsx` | 9 | inherited |
| 4 | `src/windows/custom/fiscal-models/fiscalModelsUtils.js` | 9 | builder |
| 5 | `src/components/attachments/useAttachments.js` | 7 | builder |
| 6 | `src/components/copilot/ocr/listAttachments.js` | 7 | builder |
| 7 | `src/hooks/useAccountMutations.js` | 7 | builder |
| 8 | `src/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx` | 7 | builder |
| 9 | `src/windows/custom/product/ProductPriceBar.jsx` | 6 | builder |
| 10 | `src/windows/custom/amortization/AmortizationLinesTable.jsx` | 5 | builder |
| 11 | `src/windows/custom/contacts/BillingPreferencesForm.jsx` | 5 | builder |
| 12 | `src/windows/custom/fiscal-models/FmListPage.jsx` | 5 | builder |
| 13 | `src/windows/custom/purchase-order/PurchaseOrderActions.jsx` | 5 | builder |
| 14 | `src/windows/custom/shared/pdfUtils.js` | 5 | builder |
| 15 | `src/components/contract-ui/DocumentPrintDrawer.jsx` | 4 | builder |
| 16 | `src/components/contract-ui/SendDocumentModal.jsx` | 4 | builder |
| 17 | `src/components/copilot/ocr/ProductResolverPopup.jsx` | 4 | builder |
| 18 | `src/components/related-documents/helpers.js` | 4 | builder |
| 19 | `src/explorer/useDiscovery.js` | 4 | builder |
| 20 | `src/pages/InviteAcceptancePage.jsx` | 4 | builder |
| 21 | `src/pages/ReportViewerPage.jsx` | 4 | builder |
| 22 | `src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx` | 4 | builder |
| 23 | `src/windows/custom/product/productImportDescriptor.js` | 4 | builder |
| 24 | `src/windows/custom/shared/LocationEditorModal.jsx` | 4 | builder |
| 25 | `src/components/contract-ui/CreatableSearchSelect.jsx` | 3 | builder |
| 26 | `src/components/contract-ui/ListModalWindow.jsx` | 3 | builder |
| 27 | `src/components/contract-ui/ReportDrawer.jsx` | 3 | builder |
| 28 | `src/components/contract-ui/productSelectorDrawerShared.jsx` | 3 | builder |
| 29 | `src/components/import-return-lines/ImportReturnLinesModal.jsx` | 3 | inherited |
| 30 | `src/hooks/useWindowFilterPresets.js` | 3 | builder |
| 31 | `src/pages/ArtifactViewerPage.jsx` | 3 | none |
| 32 | `src/windows/custom/assets/AssetsAmortizationPanel.jsx` | 3 | builder |
| 33 | `src/windows/custom/fiscal-config/FiscalConfigDebugPanel.jsx` | 3 | builder |
| 34 | `src/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx` | 3 | inherited |
| 35 | `src/components/contract-ui/CloneOrderModal.jsx` | 2 | inherited |
| 36 | `src/components/contract-ui/ConfirmDocumentModal.jsx` | 2 | inherited |
| 37 | `src/components/contract-ui/ConfirmInOutModal.jsx` | 2 | inherited |
| 38 | `src/components/contract-ui/CurrencyRatePicker.jsx` | 2 | builder |
| 39 | `src/components/contract-ui/ImageField.jsx` | 2 | builder |
| 40 | `src/components/contract-ui/documentEmailSend.js` | 2 | builder |
| 41 | `src/components/copilot/ocr/ingest/purchaseInvoiceDescriptor.js` | 2 | builder |
| 42 | `src/components/layout/FavoritesContext.jsx` | 2 | builder |
| 43 | `src/components/support/helpDocs.js` | 2 | none |
| 44 | `src/hooks/useFinancialAccountAccounting.js` | 2 | builder |
| 45 | `src/hooks/useMovementLookups.js` | 2 | builder |
| 46 | `src/windows/custom/calendar/PeriodsExpandablePanel.jsx` | 2 | builder |
| 47 | `src/windows/custom/chart-of-accounts/NewAccountModal.jsx` | 2 | builder |
| 48 | `src/windows/custom/contacts/ContactsFinanceContext.jsx` | 2 | builder |
| 49 | `src/windows/custom/contacts/ContactsTable.jsx` | 2 | builder |
| 50 | `src/windows/custom/contacts/contactsImportDescriptor.js` | 2 | builder |
| 51 | `src/windows/custom/fiscal-calendar/CloseYearConfirmModal.jsx` | 2 | builder |
| 52 | `src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx` | 2 | builder |
| 53 | `src/windows/custom/organization/OrgLogoField.jsx` | 2 | builder |
| 54 | `src/windows/custom/price-list/PriceListProductPrices.jsx` | 2 | builder |
| 55 | `src/windows/custom/product/ProductSidebar.jsx` | 2 | builder |
| 56 | `src/windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx` | 2 | builder |
| 57 | `src/windows/custom/return-material-receipt/ImportFromShipmentModal.jsx` | 2 | inherited |
| 58 | `src/windows/custom/shared/PaymentHeaderTableBase.jsx` | 2 | builder |
| 59 | `src/windows/custom/shared/useTaxSifLineRowActions.jsx` | 2 | builder |
| 60 | `src/windows/custom/warehouse/WarehouseCustomTable.jsx` | 2 | builder |
| 61 | `src/App.jsx` | 1 | builder |
| 62 | `src/components/contract-ui/CreateInvoiceConfirmModal.jsx` | 1 | builder |
| 63 | `src/components/contract-ui/DataTable.jsx` | 1 | builder |
| 64 | `src/components/contract-ui/EntityForm.jsx` | 1 | builder |
| 65 | `src/components/contract-ui/ImportLinesModal.jsx` | 1 | inherited |
| 66 | `src/components/contract-ui/InlineCreateSelector.jsx` | 1 | builder |
| 67 | `src/components/contract-ui/InlineSearchCombo.jsx` | 1 | builder |
| 68 | `src/components/contract-ui/PriceListPicker.jsx` | 1 | inherited |
| 69 | `src/components/contract-ui/SelectorInput.jsx` | 1 | builder |
| 70 | `src/components/copilot/copilotApi.js` | 1 | builder |
| 71 | `src/components/copilot/ocr/attachFile.js` | 1 | builder |
| 72 | `src/components/copilot/ocr/ingest/useBatch.js` | 1 | builder |
| 73 | `src/components/copilot/ocr/kinds/entityLookup.js` | 1 | builder |
| 74 | `src/components/copilot/ocr/strategies.js` | 1 | builder |
| 75 | `src/components/dashboard/TopClientsList.jsx` | 1 | builder |
| 76 | `src/hooks/useBankConnectionActions.js` | 1 | builder |
| 77 | `src/hooks/useBulkRowDelete.jsx` | 1 | builder |
| 78 | `src/hooks/useCallout.js` | 1 | builder |
| 79 | `src/hooks/useCashClose.js` | 1 | builder |
| 80 | `src/hooks/useCreateMovement.js` | 1 | builder |
| 81 | `src/hooks/useCreateStatement.js` | 1 | builder |
| 82 | `src/hooks/useCsvExport.js` | 1 | builder |
| 83 | `src/hooks/useCurrencyPrecision.js` | 1 | builder |
| 84 | `src/hooks/useDashboardData.js` | 1 | builder |
| 85 | `src/hooks/useDimensionValues.js` | 1 | builder |
| 86 | `src/hooks/useDisplayLogic.js` | 1 | builder |
| 87 | `src/hooks/useDistinctValues.js` | 1 | builder |
| 88 | `src/hooks/useDocumentAction.js` | 1 | builder |
| 89 | `src/hooks/useFinancialAccounts.js` | 1 | builder |
| 90 | `src/hooks/useNeoAction.js` | 1 | builder |
| 91 | `src/hooks/useNeoResource.js` | 1 | builder |
| 92 | `src/hooks/useQuickPurchaseData.js` | 1 | builder |
| 93 | `src/hooks/useQuickSalesData.js` | 1 | builder |
| 94 | `src/hooks/useReconciliation.js` | 1 | builder |
| 95 | `src/hooks/useRowDelete.jsx` | 1 | builder |
| 96 | `src/hooks/useStatementActions.js` | 1 | builder |
| 97 | `src/hooks/useStatementFileRequest.js` | 1 | builder |
| 98 | `src/hooks/useWidget.js` | 1 | builder |
| 99 | `src/lib/batchDelete.js` | 1 | builder |
| 100 | `src/lib/currencyFormatConfig.js` | 1 | builder |
| 101 | `src/lib/menuTree.js` | 1 | builder |
| 102 | `src/lib/neoWebhookClient.js` | 1 | builder |
| 103 | `src/preview/PreviewPage.jsx` | 1 | none |
| 104 | `src/windows/custom/calendar/AccountingPanel.jsx` | 1 | builder |
| 105 | `src/windows/custom/calendar/useYearCloseStatus.js` | 1 | builder |
| 106 | `src/windows/custom/chart-of-accounts/AccountTreeView.jsx` | 1 | builder |
| 107 | `src/windows/custom/contacts/ContactsFinancialPanel.jsx` | 1 | builder |
| 108 | `src/windows/custom/contacts/contactsFkResolvers.js` | 1 | builder |
| 109 | `src/windows/custom/contacts/index.jsx` | 1 | builder |
| 110 | `src/windows/custom/financial-account/MovementRowKebab.jsx` | 1 | builder |
| 111 | `src/windows/custom/fiscal-models/FmOverlays.jsx` | 1 | builder |
| 112 | `src/windows/custom/goods-shipment/GoodsShipmentPreview.jsx` | 1 | builder |
| 113 | `src/windows/custom/payment-out/RelatedDocuments.jsx` | 1 | builder |
| 114 | `src/windows/custom/shared/PaymentDetailSidebarBase.jsx` | 1 | builder |
| 115 | `src/windows/custom/shared/SifTab.jsx` | 1 | builder |
| 116 | `src/windows/custom/shared/useConfirmWithCredit.js` | 1 | builder |
| 117 | `src/windows/custom/shared/useMainAttachment.js` | 1 | builder |
| 118 | `src/windows/custom/user/InviteUserDialog.jsx` | 1 | builder |
| 119 | `src/windows/custom/warehouse/index.jsx` | 1 | builder |
| 120 | `src/windows/custom/warehouse/useWarehouseStock.js` | 1 | builder |
| 121 | `src/windows/spike-apps-host/AppIframeHost.jsx` | 1 | builder |

## Scope note

Deliberately **not** part of ETP-5022. The locale defect is fixed and verified in the
browser across all three repos, and the guardrail prevents the header regression from
recurring (ETP-4685 patched a single field and the defect resurfaced in three more —
that is the failure mode the guardrail closes).

Migrating 121 files changes 401 behaviour from "error surfaced locally" to "redirect to
login". That is a real behavioural change per call site and needs its own task, not the
tail of this one.
