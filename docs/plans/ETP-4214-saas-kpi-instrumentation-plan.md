# ETP-4214 — SaaS KPI Instrumentation Plan

## Purpose

Implement the missing instrumentation needed to measure the Etendo SaaS
functional validation KPIs in Mixpanel and backend observability.

The KPI catalog is already documented by dimension. This plan covers the
remaining engineering work: payload contract, frontend events, backend/domain
events, Mixpanel dashboards, and KPI governance.

## Source Documents

All implementation work must stay aligned with these docs:

| Document | Purpose |
|----------|---------|
| [../ops/saas-kpis/README.md](../ops/saas-kpis/README.md) | KPI instrumentation index, current framework status, shared event/property conventions. |
| [../ops/saas-kpis/rendimiento.md](../ops/saas-kpis/rendimiento.md) | Performance KPIs and timing/backend metric needs. |
| [../ops/saas-kpis/adopcion.md](../ops/saas-kpis/adopcion.md) | Adoption KPIs and product event contracts. |
| [../ops/saas-kpis/precision.md](../ops/saas-kpis/precision.md) | Precision KPIs for OCR, accounting, search, Copilot, and fixed assets. |
| [../ops/saas-kpis/integridad.md](../ops/saas-kpis/integridad.md) | Blocking integrity KPIs and backend validation events. |
| [../ops/saas-kpis/ux.md](../ops/saas-kpis/ux.md) | UX task-time, search, onboarding, NPS, and Copilot KPIs. |
| [../ops/saas-kpis/negocio.md](../ops/saas-kpis/negocio.md) | Business KPIs, retention, abandonment, data quality, and definition gaps. |
| [../ops/app-shell-observability.md](../ops/app-shell-observability.md) | Existing App Shell observability framework and privacy rules. |

## Current Baseline

Developed:

- App Shell vendor-neutral observability facade.
- Optional Mixpanel provider.
- Payload normalization/redaction.
- Base lifecycle events: `app_started`, `page_view`.
- Onboarding events for auth, setup, environment creation, and environment
  entry.
- Tests for provider behavior, payload sanitization, route tracking, and
  onboarding event dispatch.

Not developed:

- KPI-grade payload fields such as `kpiId`, `module`, `flow`, `durationMs`,
  `count`, `total`, `correctCount`, `entityType`, `channel`, and `critical`.
- Product/business events outside onboarding.
- Backend terminal events for OCR, email ingestion, stock, accounting,
  reconciliation, fixed assets, master-data quality, and cross-module integrity.
- Mixpanel dashboards/cohorts/funnels for the KPI catalog.
- Final definitions for token usage, feature KPI coverage, retention cohort, and
  day-3 abandonment denominator.

## Work Plan

### Phase 1 — Analytics Contract

Owner: App Shell / platform frontend.

Tasks:

- [x] Extend the safe payload allowlist with the KPI fields documented in
  [README.md](../ops/saas-kpis/README.md).
- [x] Add typed/centralized KPI tracking helpers so feature code does not construct
  unsafe payloads by hand.
- [x] Add tests proving the new fields survive sanitization and denylisted values
  still get stripped.
- [x] Decide canonical property names before implementation. Recommended:
  `durationMs`, `correctCount`, `kpiId`, and `entityType`.

Acceptance:

- Mixpanel receives low-cardinality KPI properties.
- PII, record IDs, document numbers, labels, raw URLs, and free-form user input
  remain blocked.
- New instrumentation has unit coverage.

### Phase 2 — Frontend Product Events

Owner: App Shell feature owners.

Tasks:

- [x] Instrument dashboard quick actions, pending tasks, and
  dashboard-to-document navigation.
- [ ] Instrument screen/report usable-state timings.
- [ ] Instrument contact/product search relevance with bucketed rank/count only.
- [x] Instrument accounting board view.
- [ ] Instrument product photo upload, Copilot interaction start, Copilot NPS,
  general NPS, and support-needed signals.
- [ ] Align onboarding telemetry with the product document's four-step
  company/billing/bank/team wizard, or explicitly document the implemented
  onboarding model if the product flow changed.

Acceptance:

- KPIs marked `Mixpanel ready` in the dimension docs have real call sites.
- Event names match the documented contracts.
- No call site passes user-entered names, IDs, document numbers, or search text.

### Phase 3 — Backend Measurement Framework

Owner: Etendo Go/backend.

Tasks:

- Add a backend event/metric sink for KPI terminal events.
- Emit redacted structured events for write operations, document confirmation,
  OCR processing, email ingestion, email send, accounting entry generation,
  reconciliation matching, stock movements, fixed asset processes, and
  master-data quality checks.
- Expose backend latency/error metrics needed by performance KPIs.
- Correlate backend events with frontend product events through safe
  low-cardinality metadata, not raw document IDs.

Acceptance:

- KPIs marked `Backend pending` have authoritative source events or metrics.
- Integrity failures have debuggable backend logs/audit entries while Mixpanel
  receives only redacted aggregate/safe metadata.
- Backend measurements can support both Mixpanel summaries and operational
  observability.

### Phase 4 — Domain KPI Instrumentation

Owner: Domain module owners.

Tasks:

- Sales: system email adoption and critical payment-invoice link integrity.
- Purchases: OCR adoption/precision, email ingestion, manual/OCR registration
  times, creditor invoice critical-data integrity, and token usage once defined.
- Inventory: stock accuracy, stock movement traceability, purchase receipt stock
  updates, sales delivery stock reductions, and adjustment time.
- Accounting: automatic entries, bank matching, monthly close time, invoice
  entry correctness, accounting board adoption, and aging report performance.
- Contacts: autocomplete precision, creation time, data completeness, search
  relevance, and availability in Sales/Purchases.
- Products: creation time, photo adoption, search relevance, price completeness,
  and product-card stock integrity.
- Copilot: first-week/weekly adoption, simple-task latency, task completion,
  correction rate, and NPS.
- Onboarding: completion, time to first invoice, no-support completion, bank
  account setup, role assignment integrity, and day-3 abandonment.
- Fixed assets: manual/from-purchase creation, master-data completeness,
  depreciation entries, quota precision, entry links, disposal flow, disposal
  accounting, amortization report integrity, and fully depreciated report
  precision.

Acceptance:

- All 64 documented KPIs have an owner, source event/metric, formula, and test or
  validation strategy.
- Blocking integrity KPIs with 100% targets fail the release gate when violated.

### Phase 5 — Mixpanel Dashboards

Owner: Product analytics.

Tasks:

- Create dashboards by KPI dimension: Rendimiento, Adopcion, Precision,
  Integridad, UX, and Negocio.
- Create module-level views for Dashboard, Ventas, Compras, Inventario,
  Contabilidad, Contactos, Productos, Copilot, Onboarding, and Activos Fijos.
- Define cohorts: onboarded user/company, active module user, first 7 days,
  first 30 days, month 1, day-3 abandonment, and beta/pilot company.
- Add alerting or review checklist for 100% integrity gates.

Acceptance:

- Product can see current value, target, status, and data freshness for every
  KPI.
- Dashboard formulas match the documentation.

### Phase 6 — Definition Cleanup And Governance

Owner: Product + analytics + domain owners.

Tasks:

- Define the OCR token KPI objective, unit, period, and cost dimensions.
- Decide whether `100% funcionalidades con al menos una metrica` remains a
  business KPI or moves to governance.
- Resolve threshold conflicts:
  - Accounting invoice entry correctness: source KPI says `> 98%`, acceptance
    gate says `100%`.
  - Onboarding role assignment: source KPI says `> 95%`, acceptance gate says
    `100%`.
- Define active user/company denominators for retention, abandonment, and module
  adoption.
- Assign an owner to every KPI and document review cadence.

Acceptance:

- No KPI remains with `Definition pending`.
- Threshold conflicts are resolved or explicitly documented as warning threshold
  plus release gate.

## Jira Task

Created issue: [ETP-4307](https://etendoproject.atlassian.net/browse/ETP-4307)

Recommended summary:

> Implement Etendo SaaS KPI instrumentation for Mixpanel and backend validation

Recommended issue type: `Task`

Recommended description:

```markdown
Implement the missing instrumentation needed to measure the Etendo SaaS
functional validation KPIs in Mixpanel and backend observability.

Source docs:
- `docs/ops/saas-kpis/README.md`
- `docs/ops/saas-kpis/rendimiento.md`
- `docs/ops/saas-kpis/adopcion.md`
- `docs/ops/saas-kpis/precision.md`
- `docs/ops/saas-kpis/integridad.md`
- `docs/ops/saas-kpis/ux.md`
- `docs/ops/saas-kpis/negocio.md`
- `docs/ops/app-shell-observability.md`
- `docs/plans/ETP-4214-saas-kpi-instrumentation-plan.md`

Scope:
1. Extend the App Shell analytics payload contract with KPI-safe fields.
2. Instrument frontend product events outside onboarding.
3. Add backend/domain terminal events and metrics for authoritative KPIs.
4. Implement domain KPI events for Sales, Purchases, Inventory, Accounting,
   Contacts, Products, Copilot, Onboarding, and Fixed Assets.
5. Create Mixpanel dashboards by KPI dimension and module.
6. Resolve definition gaps and acceptance-threshold conflicts.

Acceptance criteria:
- All 64 documented KPIs have a source event/metric, formula, owner, and test or
  validation strategy.
- All `Mixpanel ready` KPIs have implemented frontend/backend event sources.
- All `Backend pending` KPIs have authoritative backend events or metrics.
- Blocking 100% integrity KPIs are represented as release gates.
- No event sends PII, record IDs, document numbers, raw URLs, free-form search
  text, names, labels, OAuth values, or tokens.
- Mixpanel dashboards show current value, target, status, and data freshness for
  every KPI group.
```

Suggested subtasks:

| Subtask | Owner area |
|---------|------------|
| Extend KPI payload allowlist and tracking helper tests | App Shell |
| Instrument frontend KPI events | App Shell |
| Add backend KPI event/metric sink | Etendo Go/backend |
| Instrument Sales and Purchases KPIs | Domain owners |
| Instrument Inventory and Accounting KPIs | Domain owners |
| Instrument Contacts and Products KPIs | Domain owners |
| Instrument Copilot and Onboarding KPIs | Domain owners |
| Instrument Fixed Assets KPIs | Domain owners |
| Build Mixpanel dashboards and cohorts | Product analytics |
| Resolve KPI definition gaps and threshold conflicts | Product/analytics |

## Validation

- Documentation check: `git diff --check`.
- Frontend implementation must add unit tests for payload sanitization and each
  instrumented call site.
- Backend implementation must include tests for terminal event emission and
  redaction.
- Analytics validation must compare Mixpanel dashboard formulas against the KPI
  docs before beta measurement.
