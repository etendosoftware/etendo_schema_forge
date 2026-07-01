# Negocio KPIs

Negocio validates product value, retention, data completeness, and operating
cost signals. These KPIs usually require Mixpanel cohorts plus backend state
summaries because they depend on records, companies, and time windows.

## Developed

- Mixpanel can receive product events, but business-state summaries are not
  currently emitted.
- Onboarding and environment-entry events can support early retention analysis
  once user/company identity is consistently available.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `master_data_quality_evaluated` | A contact/product/asset quality check is summarized. | `kpiId`, `module`, `entityType`, `correctCount`, `total`, `status` |
| `ai_usage_cost_summarized` | Token/cost usage is summarized for a period. | `kpiId`, `module`, `type`, `count`, `status` |
| `retention_checkpoint_reached` | User/company reaches or misses a retention checkpoint. | `kpiId`, `module`, `type`, `status` |
| `early_abandonment_evaluated` | User/company is evaluated at day 3. | `kpiId`, `module`, `type`, `status` |
| `feature_metric_coverage_evaluated` | Feature catalog is checked for KPI coverage. | `kpiId`, `module`, `correctCount`, `total`, `status` |

Pending before implementation: add `kpiId`, `module`, `entityType`,
`correctCount`, `total`, and `count` to the safe payload allowlist.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_business_purchase_ocr_tokens` | Compras | Cantidad de tokens utilizados | Definition pending | Token count/cost by OCR invoice processing flow. | Definition pending | Define objective, unit, model/provider split, and reporting period. |
| `kpi_business_contact_minimum_data` | Contactos | Contactos con datos minimos completos | `> 75%` | Contacts with email + phone + address / active contacts. | Backend pending | Master-data quality summary event or query. |
| `kpi_business_product_price_completeness` | Productos | Productos con precio venta y compra completos | `> 90%` | Products with both prices / active products. | Backend pending | Product quality summary event or query. |
| `kpi_business_onboarding_3d_abandonment` | Configuracion | Abandono primeros 3 dias post-onboarding | `< 20%` | Users/companies with no return or activation event by day 3 / onboarded users. | Mixpanel ready | Define activation/return event and company-vs-user denominator. |
| `kpi_business_fixed_asset_master_data` | Activos Fijos | Activos con ficha completa | `> 90%` | Assets with value, category, date, location, responsible / active assets. | Backend pending | Asset quality summary event or query. |
| `kpi_business_retention_30d` | Transversal | Retencion de usuarios a 30 dias | `> 70%` | Users/companies active at day 30 / eligible onboarded users/companies. | Mixpanel ready | Define active event and denominator. |
| `kpi_business_global_3d_abandonment` | Transversal | Tasa de abandono en primeros 3 dias | `< 20%` | Same as onboarding abandonment unless Product wants separate global definition. | Mixpanel ready | Deduplicate with onboarding KPI or define separate scope. |
| `kpi_business_feature_metric_coverage` | Transversal | Funcionalidades con al menos una metrica de exito | `100%` | Features with assigned KPI / shipped product features. | Definition pending | Requires feature inventory and ownership. |

## Open Decisions

- Decide whether retention and abandonment are measured by user, company, or
  both. For SaaS validation, company-level retention is often more meaningful;
  user-level retention is still useful for UX.
- Define the activation event for day-3/day-30 calculations: environment entry,
  first invoice, second session, created document, or a composite.
- Define token KPI objective. The source marks it as future and does not define
  an acceptance threshold.
