# Precision KPIs

Precision validates whether automated extraction, matching, accounting, search,
and reports produce correct results. These KPIs usually need backend/domain
validation events because the browser cannot authoritatively decide whether a
field, accounting entry, or amortization quota is correct.

## Developed

- Mixpanel transport exists, but no precision-specific business events are
  currently emitted.
- Onboarding events can report success/failure, but they do not validate data
  correctness.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `ocr_extraction_evaluated` | OCR extraction is compared against accepted/corrected data. | `kpiId`, `module`, `entityType`, `correctCount`, `total`, `status` |
| `stock_count_reconciled` | Physical count is reconciled against system stock. | `kpiId`, `module`, `correctCount`, `total`, `status` |
| `bank_reconciliation_match_evaluated` | A bank movement match is accepted/rejected. | `kpiId`, `module`, `channel`, `status` |
| `accounting_entry_validated` | Generated accounting entry is validated or corrected. | `kpiId`, `module`, `entityType`, `channel`, `status` |
| `autocomplete_result_selected` | User selects or rejects an autocomplete result. | `kpiId`, `module`, `entityType`, `status` |
| `copilot_interaction_evaluated` | Copilot task is accepted, corrected, or rejected. | `kpiId`, `module`, `type`, `status` |
| `depreciation_calculation_validated` | Depreciation quota/report is validated. | `kpiId`, `module`, `entityType`, `status` |

Pending before implementation: add `kpiId`, `module`, `entityType`,
`channel`, `correctCount`, and `total` to the safe payload allowlist.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_precision_purchase_ocr_fields` | Compras | Campos correctamente extraidos por OCR | `> 85%` | `sum(correctCount) / sum(total)` from `ocr_extraction_evaluated`. | Backend pending | Need ground-truth comparison after user confirmation/correction. |
| `kpi_precision_inventory_stock_count` | Inventario | Exactitud del stock vs conteo fisico | `> 98%` | Matching counted items / counted items in `stock_count_reconciled`. | Backend pending | Physical inventory flow must emit reconciliation result. |
| `kpi_precision_bank_auto_matching` | Contabilidad | Matching automatico en conciliacion bancaria | `> 70%` | Auto-matched movements accepted / all movements requiring match. | Backend pending | Reconciliation engine must emit suggestion/acceptance source. |
| `kpi_precision_accounting_invoice_entries` | Contabilidad | Facturas con asiento contable correcto | Source KPI: `> 98%`; acceptance critical: `100%` | Entries without manual correction / generated invoice entries. | Backend pending | Resolve threshold conflict; acceptance criteria require 100% for validation. |
| `kpi_precision_contact_autocomplete` | Contactos | Autocompletado exitoso por nombre o CIF | `> 80%` | Successful selected autocomplete results / autocomplete attempts. | Mixpanel ready | Instrument selection/rejection and define success. |
| `kpi_precision_copilot_correction_rate` | Copilot IA | Conversaciones que requieren correccion manual posterior | `< 20%` | Corrected/reopened/reversed Copilot interactions / completed interactions. | Backend pending | Need task outcome and downstream correction linkage. |
| `kpi_precision_asset_depreciation_quota` | Activos Fijos | Cuotas de amortizacion calculadas correctamente | `100%` | Correct quotas / generated quotas for linear depreciation. | Backend pending | Accounting/domain validation event required. |
| `kpi_precision_fully_depreciated_report` | Activos Fijos | Activos totalmente amortizados reflejados correctamente | `100%` | Correct fully depreciated assets in report / expected assets. | Backend pending | Need report validation job or QA dataset. |

## Acceptance Notes

- `kpi_precision_accounting_invoice_entries` is listed as `> 98%` in the module
  KPI table but as `100% sin excepcion` in the acceptance criteria. Treat 100%
  as the release gate and keep `> 98%` only as an operational warning threshold
  if Product wants both.
- Fixed asset depreciation precision KPIs are effectively blocking because the
  acceptance criteria include them in the 100% set.

## Open Decisions

- Define who confirms "correct": user acceptance, QA scripted dataset,
  accounting rule engine, or post-hoc correction absence.
- Define the time window for "correction manual posterior" in Copilot. A
  practical default is 24 hours after the Copilot-created or Copilot-modified
  artifact.
- Decide whether exact stock validation uses unit-level equality or tolerance by
  unit of measure.
