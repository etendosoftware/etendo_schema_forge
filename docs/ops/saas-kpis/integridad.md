# Integridad KPIs

Integridad validates cross-module consistency, traceability, and blocking
accounting/stock/role invariants. These KPIs should be treated as release gates
when the target is 100%.

## Developed

- The App Shell observability framework can send integrity events to Mixpanel,
  but integrity must be produced by backend/domain checks.
- No cross-module integrity event catalog is currently implemented.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `stock_movement_validated` | A stock movement is created or audited. | `kpiId`, `module`, `entityType`, `source`, `status`, `critical` |
| `cross_module_sync_validated` | A shared entity is verified across modules. | `kpiId`, `module`, `entityType`, `status`, `critical` |
| `accounting_link_validated` | Accounting entry is linked to its source document/asset. | `kpiId`, `module`, `entityType`, `status`, `critical` |
| `role_assignment_validated` | User roles are validated after onboarding. | `kpiId`, `module`, `status`, `critical` |
| `acceptance_integrity_check_completed` | Batch or QA integrity check finishes. | `kpiId`, `module`, `correctCount`, `total`, `status`, `critical` |

Pending before implementation: add `kpiId`, `module`, `entityType`,
`correctCount`, `total`, and `critical` to the safe payload allowlist.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_integrity_sales_payment_invoice_link` | Ventas | Cobros vinculados correctamente a su factura | `100%` | Valid linked payments / payments generated from sales invoices. | Backend pending | Added from acceptance criteria; not present in module KPI table. |
| `kpi_integrity_purchase_creditor_invoice_data` | Compras | Facturas de acreedor procesadas sin error de datos criticos | `100%` | Creditor invoices without critical data error / processed creditor invoices. | Backend pending | Added from acceptance criteria; define critical fields. |
| `kpi_integrity_inventory_movement_traceability` | Inventario | Movimientos de stock con origen trazable | `100%` | Movements with valid source document / movements. | Backend pending | Stock movement model must expose source document type. |
| `kpi_integrity_purchase_receipt_stock_update` | Inventario | Recepciones de compra actualizan correctamente stock | `100%` | Receipts with expected stock delta / posted receipts. | Backend pending | Domain check needed at receipt completion. |
| `kpi_integrity_sales_delivery_stock_update` | Inventario | Albaranes de salida reducen correctamente stock | `100%` | Deliveries with expected stock delta / posted deliveries. | Backend pending | Domain check needed at delivery completion. |
| `kpi_integrity_contacts_shared_master` | Contactos | Contactos disponibles correctamente en Ventas y Compras | `100%` | Shared contacts visible/usable in both modules / eligible contacts. | Backend pending | Need shared master-data visibility check. |
| `kpi_integrity_product_stock_card_inventory` | Productos | Stock en ficha coincide con Inventario | `100%` | Product cards with matching inventory stock / products with stock. | Backend pending | Need authoritative stock service comparison. |
| `kpi_integrity_onboarding_roles` | Configuracion | Usuarios con roles asignados correctamente al completar onboarding | Source KPI: `> 95%`; acceptance critical: `100%` | Users with valid role/org assignment / onboarded users. | Backend pending | Resolve threshold conflict; acceptance criteria require 100%. |
| `kpi_integrity_fixed_asset_depreciation_entries` | Activos Fijos | Asientos de amortizacion mensuales generados automaticamente | `100%` | Expected monthly depreciation entries generated / expected entries. | Backend pending | Scheduled process/event validation. |
| `kpi_integrity_fixed_asset_entry_link` | Activos Fijos | Asientos de amortizacion vinculados al activo de origen | `100%` | Linked depreciation entries / depreciation entries. | Backend pending | Accounting link validation. |
| `kpi_integrity_fixed_asset_disposal_result_entry` | Activos Fijos | Bajas con asiento de resultado generado correctamente | `100%` | Disposals with gain/loss entry / disposals. | Backend pending | Disposal process terminal event. |
| `kpi_integrity_fixed_asset_amortization_report` | Activos Fijos | Activos reflejados correctamente en cuadro de amortizaciones | `100%` | Correct assets in amortization report / expected assets. | Backend pending | Report validation job or QA audit dataset. |

## Blocking Acceptance Gates

Any KPI in this document with target `100%` blocks module validation if it
fails. The 80% module rule does not override these checks.

## Open Decisions

- Define whether integrity checks are emitted in real time, by nightly audit, or
  both. For release gates, nightly batch validation is easier to audit; for
  incident response, real-time terminal events are better.
- Define low-cardinality `entityType` values: `sales_invoice`,
  `supplier_invoice`, `creditor_invoice`, `goods_receipt`, `goods_shipment`,
  `business_partner`, `product`, `fixed_asset`, `depreciation_entry`,
  `role_assignment`.
- Decide where to store failed integrity details. Mixpanel should receive only
  aggregated/redacted status; debugging needs backend logs or an audit table.
