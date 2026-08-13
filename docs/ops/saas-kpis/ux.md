# UX KPIs

UX validates task efficiency, discoverability, completion, and satisfaction.
Mixpanel can measure user flows and elapsed time when the frontend owns the
interaction. Backend-generated documents and long-running operations still need
terminal backend events to avoid measuring only button-click latency.

## Developed

- Onboarding already emits auth, setup-step, run, and environment-entry events.
- Existing onboarding does not match the product document exactly: local code
  has auth/profile/company plus backend setup progress, while the product KPI
  describes a four-step company/billing/bank/team wizard.
- No generic task timing hook is currently implemented in App Shell.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `task_flow_started` | User starts a KPI-measured task. | `kpiId`, `module`, `flow`, `source` |
| `task_flow_completed` | Task reaches successful terminal state. | `kpiId`, `module`, `flow`, `durationMs`, `status` |
| `dashboard_document_opened` | User navigates from Dashboard to a document. | `kpiId`, `module`, `entityType`, `source` |
| `search_completed` | Search returns results and/or selection. | `kpiId`, `module`, `entityType`, `status`, `count` |
| `support_needed_reported` | User requests support/help during a measured flow. | `kpiId`, `module`, `flow`, `status` |
| `survey_submitted` | NPS or post-interaction survey is submitted. | `kpiId`, `module`, `type`, `status` |
| `copilot_task_completed` | Copilot completes a task without UI fallback. | `kpiId`, `module`, `type`, `status`, `durationMs` |

Implemented in App Shell: `kpiId`, `module`, `flow`, `entityType`,
`durationMs`, and `count` are in the safe payload allowlist. Dashboard-origin
document navigation is instrumented for Recent Sales, Top Clients, and Best
Products widgets without record IDs or names.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_ux_dashboard_to_document` | Dashboard | Sesiones que navegan desde Dashboard a un documento | `> 30%` | Sessions with `dashboard_document_opened` / dashboard sessions. | Developed | Define dashboard-session denominator. |
| `kpi_ux_sales_quote_creation_time` | Ventas | Tiempo promedio para crear un presupuesto | `< 3 min` | Average or p75 duration between quote `task_flow_started` and `task_flow_completed`. | Backend pending | Need terminal quote creation success, not just form submit. |
| `kpi_ux_purchase_ocr_registration_time` | Compras | Registro de factura de proveedor via OCR | `< 1 min` | Duration from OCR upload/scan start to registered invoice. | Backend pending | OCR terminal registration event. |
| `kpi_ux_purchase_manual_registration_time` | Compras | Registro manual de factura de proveedor | `< 5 min` | Duration from manual invoice start to registered invoice. | Backend pending | Manual flow start/completion events. |
| `kpi_ux_inventory_adjustment_time` | Inventario | Tiempo para realizar ajuste de inventario | `< 5 min` | Duration from inventory adjustment start to successful post. | Backend pending | Stock adjustment terminal event. |
| `kpi_ux_accounting_monthly_close_time` | Contabilidad | Tiempo para completar cierre mensual | `< 2h` | Duration from close start to close success. | Backend pending | Close process lifecycle events. |
| `kpi_ux_contact_creation_time` | Contactos | Creacion de contacto nuevo completo | `< 2 min` | Duration from contact creation start to valid saved contact. | Backend pending | Complete-contact definition and save success event. |
| `kpi_ux_contact_search_relevance` | Contactos | Busquedas con resultado correcto en primeros 3 resultados | `> 90%` | Successful selected result with rank <= 3 / searches with selection. | Mixpanel ready | Search event must include bucketed rank/count without PII. |
| `kpi_ux_product_creation_time` | Productos | Alta de producto nuevo | `< 2 min` | Duration from product creation start to saved product. | Backend pending | Product save terminal event. |
| `kpi_ux_product_search_relevance` | Productos | Busquedas de catalogo con resultado correcto en < 3 resultados | `> 95%` | Successful selected result with rank <= 3 / catalog searches with selection. | Mixpanel ready | Search event must include bucketed rank/count without product names. |
| `kpi_ux_copilot_task_resolution` | Copilot IA | Resolucion de tarea completa via Copilot sin ir a UI | `> 60%` | Completed Copilot tasks without UI fallback / Copilot task interactions. | Backend pending | Need Copilot task lifecycle and fallback detection. |
| `kpi_ux_copilot_nps` | Copilot IA | NPS de Copilot post-interaccion | `> 40` | NPS from `survey_submitted(type=copilot_nps)`. | Mixpanel ready | Survey UI and score handling; avoid sending free-form comments. |
| `kpi_ux_onboarding_completion` | Configuracion | Usuarios que completan wizard sin abandonar | `> 85%` | Completed onboarding users / started onboarding users. | Developed partial | Existing events cover auth/setup/run; align with four-step wizard. |
| `kpi_ux_onboarding_time_to_first_invoice` | Configuracion | Registro hasta primera factura | `< 10 min` | Duration from registration/onboarding start to first invoice issued. | Backend pending | Need first invoice issuance event linked to registration. |
| `kpi_ux_onboarding_steps_without_support` | Configuracion | Pasos completados sin soporte externo | `> 90%` | Steps completed without support/help event / completed steps. | Mixpanel ready | Define support signal and map current/future wizard steps. |
| `kpi_ux_fixed_asset_manual_creation_time` | Activos Fijos | Alta manual de activo nuevo | `< 3 min` | Duration from manual asset flow start to saved asset. | Backend pending | Asset save terminal event. |
| `kpi_ux_fixed_asset_disposal_time` | Activos Fijos | Baja de activo por venta o descarte | `< 5 min` | Duration from disposal start to successful disposal. | Backend pending | Disposal process terminal event. |
| `kpi_ux_product_nps_general` | Transversal | NPS general del producto a 30 dias post-onboarding | `> 35` | NPS from `survey_submitted(type=general_nps)` for users 30 days post-onboarding. | Mixpanel ready | Survey scheduling and identity/cohort definition. |

## Open Decisions

- For elapsed-time UX KPIs, decide whether to report average, median, p75, or
  p95. The source says "promedio"; for product UX dashboards, p75 is usually
  more robust than average.
- Define task abandonment: closing route, timeout, logout, switching module, or
  starting another task.
- Define whether NPS scores go directly to Mixpanel or through a survey system
  that syncs aggregate events to Mixpanel.
