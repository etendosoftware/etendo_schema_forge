# Adopcion KPIs

Adopcion validates whether users actually use the intended product shortcuts,
automation channels, and new module capabilities. Most KPIs can be measured in
Mixpanel as user/action funnels, but backend-originated channels such as email
ingestion need terminal backend events.

## Developed

- App Shell can send Mixpanel events through `track`.
- Onboarding auth/setup/run/environment events are already emitted.
- Generic `page_view` can show whether a user visited a module, but it is not
enough to validate adoption of specific actions.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `quick_action_used` | User triggers a dashboard quick action. | `kpiId`, `module`, `action`, `source` |
| `pending_task_opened` | User opens or acts on a pending task widget item. | `kpiId`, `module`, `action`, `source` |
| `document_email_sent` | A document is sent by the in-system email engine. | `kpiId`, `module`, `entityType`, `channel`, `status` |
| `invoice_ingestion_completed` | Supplier/creditor invoice is registered by OCR/email/manual. | `kpiId`, `module`, `channel`, `entityType`, `status` |
| `accounting_entry_created` | Accounting entry is generated. | `kpiId`, `module`, `channel`, `entityType`, `status` |
| `accounting_dashboard_viewed` | User opens the actionable accounting board. | `kpiId`, `module`, `source`, `status` |
| `product_photo_uploaded` | Product image is uploaded or replaced. | `kpiId`, `module`, `action`, `status` |
| `copilot_interaction_started` | User starts a Copilot interaction. | `kpiId`, `module`, `type`, `source` |
| `bank_account_configured` | Company finishes at least one bank account setup. | `kpiId`, `module`, `source`, `status` |
| `asset_created` | Fixed asset is created. | `kpiId`, `module`, `channel`, `source`, `status` |

Implemented in App Shell: `kpiId`, `module`, `entityType`, and `channel` are in
the safe payload allowlist. Dashboard quick actions, pending-task opens, and
accounting board views are instrumented with stable metadata only.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_adopt_dashboard_quick_actions_7d` | Dashboard | Usuarios que usan acciones rapidas en los primeros 7 dias | `> 60%` | Users with `quick_action_used` within 7 days of first `app_started` / onboarded date. | Developed | Define eligible user cohort. |
| `kpi_adopt_dashboard_pending_tasks` | Dashboard | Usuarios que interactuan con Tareas Pendientes | `> 50%` | Users with `pending_task_opened` or task action in measured period. | Developed | Define measured period and eligible user cohort. |
| `kpi_adopt_sales_email_engine` | Ventas | Facturas enviadas por email desde el sistema | `> 70%` | `document_email_sent(channel=system_email,type=sales_invoice,success)` / all sent invoices. | Backend pending | Need invoice denominator and terminal email send event. |
| `kpi_adopt_purchase_ocr_channel` | Compras | Facturas de proveedor cargadas via OCR | `> 50%` | `invoice_ingestion_completed(channel=ocr,type=supplier_invoice)` / all supplier invoices registered. | Backend pending | OCR flow must emit terminal registration event. |
| `kpi_adopt_purchase_email_ingestion` | Compras | Facturas recibidas por email dedicado | `> 30% in 60 days` | `invoice_ingestion_completed(channel=email)` / all supplier/creditor invoices in first 60 days. | Backend pending | Email ingestion must emit accepted/rejected terminal event. |
| `kpi_adopt_accounting_auto_entries` | Contabilidad | Asientos contables generados automaticamente | `> 90%` | `accounting_entry_created(channel=automatic)` / all accounting entries generated from documents. | Backend pending | Accounting engine must expose source channel. |
| `kpi_adopt_accounting_board_weekly` | Contabilidad | Usuarios que acceden al Tablero de Contabilidad semanalmente | `> 60%` | WAU with `accounting_dashboard_viewed` / active accounting users. | Developed | Define accounting-user cohort. |
| `kpi_adopt_product_photo_30d` | Productos | Productos con foto cargada a 30 dias | `> 40%` | Products with image at day 30 / active products. | Backend pending | Product media state must be queryable or summarized. |
| `kpi_adopt_copilot_first_7d` | Copilot IA | Usuarios que usan Copilot al menos una vez en primeros 7 dias | `> 50%` | Users with `copilot_interaction_started` within 7 days of onboarding. | Mixpanel ready | Instrument Copilot start and identity linkage. |
| `kpi_adopt_copilot_weekly_month_1` | Copilot IA | Usuarios que usan Copilot semanalmente en mes 1 | `> 35%` | Users with at least one weekly `copilot_interaction_started` during first month. | Mixpanel ready | Define week boundaries and user cohort. |
| `kpi_adopt_onboarding_bank_account` | Configuracion | Empresas con al menos una cuenta bancaria al finalizar | `> 40%` | Companies with `bank_account_configured(success)` before onboarding completion. | Backend pending | Current local onboarding does not expose the four-step bank/team wizard from the product doc. |
| `kpi_adopt_fixed_asset_from_purchase_invoice` | Activos Fijos | Activos dados de alta desde factura de compra | `> 40%` | `asset_created(channel=purchase_invoice)` / all `asset_created`. | Backend pending | Asset creation source must be persisted/emitted. |

## Open Decisions

- Define "active user" per module. Using all registered users would dilute module
  KPIs when a role does not have access to the module.
- Decide whether adoption denominators come from Mixpanel cohorts, backend
  record counts, or a data warehouse join.
- Define when a user is considered onboarded: registration success, environment
  creation success, or first entry into the environment.
