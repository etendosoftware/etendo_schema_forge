# Generated/custom windows

Functional documentation for the user-facing Schema Forge window surface.

This folder is the entry point for documentation that describes how generated and custom windows behave from a user and QA perspective: goals, routes, expected outcomes, visible errors, and testable verification paths.

## Shared guide

| File | Description |
|------|-------------|
| [app-shell-functional-flows.md](app-shell-functional-flows.md) | Cross-window functional guide for app-shell routes, generated/custom window loading, shared entity behavior, OAuth2 screens, and PWA update/recovery flows |

| [2026-04-23-epic-etp-3504-merge-changelog.md](2026-04-23-epic-etp-3504-merge-changelog.md) | Window-level change log for the `epic/ETP-3504` -> `develop` merge, focused on user-visible generated/custom window deltas |

## People

| File | Description |
|------|-------------|
| [contacts.md](contacts.md) | Visible People entry with custom contacts-specific extensions and multi-entity maintenance flow |
| [business-partner.md](business-partner.md) | Hidden route-only business-partner master/detail window |
| [deal.md](deal.md) | Hidden route-only CRM deal window |
| [activity.md](activity.md) | Hidden route-only CRM activity window |
| [lead.md](lead.md) | Hidden route-only lead qualification window |
| [employee.md](employee.md) | Hidden route-only employee maintenance window |
| [absence.md](absence.md) | Hidden route-only absence tracking window |

## Sales

| File | Description |
|------|-------------|
| [sales-quotation.md](sales-quotation.md) | Custom quotation flow with related documents and draft actions |
| [sales-order.md](sales-order.md) | Custom sales-order flow with fulfillment/invoicing actions and related documents |
| [goods-shipment.md](goods-shipment.md) | Custom shipment flow with invoice/return actions and bulk invoicing cues |
| [sales-invoice.md](sales-invoice.md) | Custom sales-invoice flow with payment-plan and related-document behavior |
| [return-from-customer.md](return-from-customer.md) | Generated return-from-customer flow linked to shipment lines |
| [return-material-receipt.md](return-material-receipt.md) | Generated return-material-receipt flow linked back to sales orders |

## Purchases

| File | Description |
|------|-------------|
| [purchase-order.md](purchase-order.md) | Custom purchase-order flow |
| [goods-receipt.md](goods-receipt.md) | Custom goods-receipt flow |
| [purchase-invoice.md](purchase-invoice.md) | Custom purchase-invoice flow |
| [return-to-vendor.md](return-to-vendor.md) | Generated vendor-return flow |
| [return-to-vendor-shipment.md](return-to-vendor-shipment.md) | Generated return-to-vendor-shipment flow |

## Inventory

| File | Description |
|------|-------------|
| [product.md](product.md) | Generated gallery-style product window with custom product panels |
| [product-category.md](product-category.md) | Generated product-category master/detail flow |
| [physical-inventory.md](physical-inventory.md) | Generated physical-inventory flow with custom count-list actions |
| [goods-movements.md](goods-movements.md) | Generated goods-movements flow for stock transfers |
| [internal-consumption.md](internal-consumption.md) | Generated internal-consumption flow: draftMode Complete + kebab Void, trimmed list view |
| [warehouse.md](warehouse.md) | Custom warehouse flow with products/transactions tabs |
| [warehouse-storage-bins.md](warehouse-storage-bins.md) | Hidden route-only warehouse storage-bin master/detail window |

## Finance

| File | Description |
|------|-------------|
| [payment-in.md](payment-in.md) | Generated payment-in flow with related documents and payment actions |
| [payment-out.md](payment-out.md) | Custom payment-out flow with related documents and multiple child surfaces |
| [financial-accounts-page.md](financial-accounts-page.md) | Cuentas landing page (ETP-4095) + offline account create / edit / archive (ETP-4096) |
| [bank-reconciliation.md](bank-reconciliation.md) | Legacy placeholder; superseded by `financial-account.md` (kept hidden in menu.json until T8) |
| [match-rule.md](match-rule.md) | Bank Reconciliation matching-rules catalog ("Reglas de matcheo") — first `list-modal` window (grid + create/edit modal, no detail) on generic W CRUD + validation hook |
| [transaction-type.md](transaction-type.md) | Backend-only user-definable lookup behind the match-rule "Tipo de transacción" field — no menu/route; created inline from the selector (W spec + `TransactionTypeHandler`) |
| [chart-of-accounts.md](chart-of-accounts.md) | Generated chart-of-accounts maintenance window |
| [open-close-period-control.md](open-close-period-control.md) | Generated open/close period control window for fiscal period status management |
| [assets.md](assets.md) | Generated assets flow with custom setup, sidebar, and amortization surfaces |
| [asset-group.md](asset-group.md) | Generated asset-category master/detail flow — header with conditional depreciation-policy fields (`displayLogicJs`), inline-editable accounting accounts subtab |
| [amortization.md](amortization.md) | Generated amortization master/detail flow (MVP read+draft, sidebar metrics, linked assets) |
| [simple-g-l-journal.md](simple-g-l-journal.md) | Generated manual-journal (Asientos Manuales) master/detail flow with a debit/credit balance footer that blocks save until Σ debit = Σ credit (posting deferred) |
| [recurring-invoice.md](recurring-invoice.md) | Hidden route-only recurring-invoice template window |
| [conversion-rates.md](conversion-rates.md) | General currency conversion-rate catalog; auto-downloaded rates lock as Synced and feed the invoice completion guard |
| [general-ledger-configuration.md](general-ledger-configuration.md) | Custom 4-tab accounting schema setup window aligned to the Figma-first ETP-4246 scope |

## Projects

| File | Description |
|------|-------------|
| [project.md](project.md) | Hidden route-only project maintenance window |
| [time-tracking.md](time-tracking.md) | Hidden route-only time-entry window |
| [document.md](document.md) | Hidden route-only document metadata window |

## Reports

| File | Description |
|------|-------------|
| [balance-sheet.md](balance-sheet.md) | Contract-driven financial report — point-in-time assets, liabilities, and owner equity by accounting schema and year |
| [report-journal-entries.md](report-journal-entries.md) | Contract-driven journal book — entries grouped with debit/credit lines for a date range with dimension filters |
| [report-trial-balance.md](report-trial-balance.md) | Contract-driven trial balance — opening/period/closing balances per account with General Ledger drill-down |

## Settings

| File | Description |
|------|-------------|
| [price-list.md](price-list.md) | Custom price-list flow with product-price workspace |
| [payment-term.md](payment-term.md) | Generated payment-term maintenance window |
| [tax.md](tax.md) | Generated tax-rate maintenance window |
| [tax-category.md](tax-category.md) | Generated tax-category catalog window (groups tax rates; ETP-4249) |
| [user.md](user.md) | Generated user window with roles child surface and defaults dependencies |
| [fiscal-config.md](fiscal-config.md) | Custom fiscal configuration window — onboarding wizard (SII/TBAI/Verifactu) and ongoing config maintenance |
| [fiscal-models.md](fiscal-models.md) | Custom fiscal models window — declaration list and per-model detail pages (303, 349) with auto-compute and file generation |
| [fiscal-monitor.md](fiscal-monitor.md) | Custom fiscal monitor window — real-time invoice submission status for SII, TBAI, and Verifactu |
| [not-posted-documents.md](not-posted-documents.md) | Custom cross-document posting window — aggregates all unposted documents, single-row and bulk Post actions |
| [sii-monitor.md](sii-monitor.md) | API-only sub-window — SII invoice submission records consumed by FiscalMonitorPage |
| [monitor-verifactu.md](monitor-verifactu.md) | API-only sub-window — Verifactu invoice submission records consumed by FiscalMonitorPage |
| [tbai-facturas-enviadas.md](tbai-facturas-enviadas.md) | API-only sub-window — TBAI invoice submission records consumed by FiscalMonitorPage |
| [conversion-rate-downloader-log.md](conversion-rate-downloader-log.md) | Read-only audit log of automated conversion-rate downloader runs |

## Scope

Use this folder for:
- shared functional documentation that applies to generated and custom windows
- one-file-per-window functional guides for the current window set
- verification-oriented flow documentation for QA and product review

Do not use this folder for:
- low-level generator implementation notes
- backend architecture documentation
- pipeline internals not visible from the window behavior
