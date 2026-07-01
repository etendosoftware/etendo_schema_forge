# Etendo SaaS KPI Instrumentation

This folder turns the Etendo SaaS functional validation KPIs into an
implementation-ready measurement catalog. The source product document groups
KPIs by module, while these files group them by KPI dimension so Product,
Analytics, QA, and Engineering can work from the same event and metric contract.

## Current Implementation Baseline

Developed in App Shell:

- Vendor-neutral observability facade in `tools/app-shell/src/lib/observability`.
- Optional Mixpanel provider enabled by `VITE_MIXPANEL_ENABLED=true` and
  `VITE_MIXPANEL_TOKEN`.
- Base lifecycle events: `app_started` and `page_view`.
- Onboarding telemetry events for auth, setup progress, environment creation,
  and environment entry.
- Payload normalization and redaction before provider dispatch.
- KPI-safe payload fields and `trackKpiEvent` helper for low-cardinality
  product metrics.
- Dashboard telemetry for quick actions, pending-task opens, and
  dashboard-origin document navigation.
- Accounting board view telemetry for weekly adoption measurement.
- Provider isolation: analytics failures do not block rendering or user flows.
- Test coverage exists for payload sanitization, provider dispatch/failure
  isolation, browser provider config, Mixpanel lazy loading, route tracking, and
  onboarding event calls.

Events already emitted:

| Area | Events |
|------|--------|
| Lifecycle | `app_started`, `page_view` |
| Onboarding auth | `onboarding_auth_submitted`, `onboarding_auth_succeeded`, `onboarding_auth_failed`, `onboarding_auth_logout` |
| Onboarding setup | `onboarding_setup_step_completed`, `onboarding_setup_step_back` |
| Environment creation | `onboarding_run_started`, `onboarding_run_succeeded`, `onboarding_run_failed` |
| Environment entry | `onboarding_environment_enter_submitted`, `onboarding_environment_enter_succeeded`, `onboarding_environment_enter_failed` |
| Dashboard | `quick_action_used`, `pending_task_opened`, `dashboard_document_opened` |
| Accounting | `accounting_dashboard_viewed` |

Known limits:

- Product/business events outside onboarding and the first Dashboard KPI slice
  are not instrumented yet.
- `packages/apps-sdk` does not receive observability context yet.
- KPI-grade properties such as `durationMs`, `count`, `total`, `entityType`,
  `module`, and `kpiId` are allowlisted with finite-number and boolean guards.
- Backend measurements are documented architecturally, but many business facts
  still need terminal domain events or metrics.

## Status Labels

| Status | Meaning |
|--------|---------|
| Developed | The repo already emits the event or has the supporting framework. |
| Mixpanel ready | The event contract is defined and can be implemented with the existing facade; some KPIs still need payload allowlist additions before values survive sanitization. |
| Backend pending | The KPI depends on authoritative backend/domain facts, not only browser interaction. |
| Definition pending | The KPI has no complete threshold, ownership, or calculation rule yet. |

## Shared Mixpanel Conventions

Event names use lowercase `snake_case`, describe product behavior, and avoid
record IDs, document numbers, names, labels, raw URLs, or free-form user input.

Common properties to keep from the developed framework:

| Property | Notes |
|----------|-------|
| `app` | Example: `app-shell`. |
| `environment` | Hostname/environment value. |
| `hostname` | Browser hostname. |
| `mockMode` | Boolean from `VITE_MOCK`. |
| `route` | Normalized route, without IDs or query strings. |
| `routePattern` | Normalized route pattern. |
| `windowName` | Normalized first route segment. |
| `component` | Stable UI component or domain surface. |
| `source` | Stable flow source, for example `dashboard`, `ocr`, `email_ingestion`. |
| `type` | Low-cardinality subtype, for example `sales_invoice`, `simple_task`. |
| `action` | Stable action, for example `create`, `send`, `complete`, `open`. |
| `status` | Stable result, for example `success`, `failed`, `abandoned`. |
| `provider` | Stable provider, for example `mixpanel`, `ocr`, `email`. |
| `enabled` | Boolean flags only. |
| `locale` | UI locale. |
| `timestamp` | ISO timestamp injected by the observability layer. |

KPI properties supported by the App Shell payload allowlist:

| Property | Type | Purpose |
|----------|------|---------|
| `kpiId` | string | Stable KPI identifier from these docs. |
| `module` | string | Product module: `sales`, `purchases`, `inventory`, etc. |
| `flow` | string | Stable functional flow: `quote_creation`, `bank_reconciliation`. |
| `entityType` | string | Stable object type, never an object ID. |
| `channel` | string | Input/output channel: `manual`, `ocr`, `email`, `system`. |
| `durationMs` | number | Elapsed time for performance and UX KPIs. |
| `count` | number | Count of records/actions in a summarized event. |
| `total` | number | Denominator for aggregate KPI events. |
| `correctCount` | number | Numerator for precision/integrity checks. |
| `errorClass` | string | Low-cardinality error class. |
| `critical` | boolean | Whether the event belongs to a blocking acceptance KPI. |

## KPI Groups

| Group | Document | Primary owner |
|-------|----------|---------------|
| Rendimiento | [rendimiento.md](rendimiento.md) | Frontend/backend platform |
| Adopcion | [adopcion.md](adopcion.md) | Product analytics |
| Precision | [precision.md](precision.md) | QA, AI/OCR, accounting domain |
| Integridad | [integridad.md](integridad.md) | Backend/domain owners |
| UX | [ux.md](ux.md) | Product design, frontend, QA |
| Negocio | [negocio.md](negocio.md) | Product leadership |

## Acceptance Rules

A module is validated when at least 80% of its KPIs meet threshold during a
30-day post-launch period with real users.

KPIs with 100% integrity requirements are blocking. If any blocking integrity
KPI fails, the module is not accepted even when the 80% rule is satisfied.

The source document has acceptance criteria that introduce critical KPIs not
listed in the module KPI table. Those are kept in the relevant group document
and marked as added from acceptance criteria.
