# Mixpanel KPI Emission Spec

This document captures the current Etendo Go Mixpanel emission contract and the
validation evidence for frontend, backend, and advanced KPI events.

## Scope

The scope is the App Shell and `com.etendoerp.go` backend telemetry used by the
Etendo Go KPI dashboards in Mixpanel.

Mixpanel project:

- Project ID: `4026645`
- Workspace ID: `4522831`
- Validation dashboard: `Etendo Go - Validacion de Emision de Eventos`
- Dashboard URL: `https://eu.mixpanel.com/project/4026645/app/boards#id=11309136`

## Runtime Configuration

Frontend Mixpanel uses Vite variables:

| Variable | Purpose |
| --- | --- |
| `VITE_MIXPANEL_ENABLED` | Enables the browser Mixpanel provider. |
| `VITE_MIXPANEL_TOKEN` | Browser project token. |
| `VITE_MIXPANEL_DEBUG` | Optional browser SDK debug flag. |
| `VITE_MIXPANEL_API_HOST` | Optional Mixpanel API host, for example EU ingest. |

Backend Mixpanel must not read `VITE_*` values. It uses backend runtime
properties:

| Property | Environment variable | Purpose |
| --- | --- | --- |
| `etendo.go.mixpanel.enabled` | `ETGO_MIXPANEL_ENABLED` | Enables backend Mixpanel submission. Defaults to `true`. |
| `etendo.go.mixpanel.token` | `ETGO_MIXPANEL_TOKEN` | Backend project token. Required. |
| `etendo.go.mixpanel.apiHost` | `ETGO_MIXPANEL_API_HOST` | Mixpanel API host. Defaults to `https://api-eu.mixpanel.com`. |
| `etendo.go.mixpanel.timeoutMs` | `ETGO_MIXPANEL_TIMEOUT_MS` | HTTP connect/read timeout. Defaults to `5000`. |
| `etendo.go.mixpanel.distinctId` | `ETGO_MIXPANEL_DISTINCT_ID` | Stable backend identity. Defaults to `neo-backend`. |

Backend token values must remain outside committed source files.

## Emission Status

### Emitting

| Area | Events | Evidence |
| --- | --- | --- |
| App lifecycle | `app_started`, `page_view` | Validation dashboard base events. |
| Onboarding | `onboarding_auth_*`, `onboarding_setup_*`, `onboarding_run_*`, `onboarding_environment_enter_*` | Validation dashboard onboarding report. |
| Product usage | `window_opened`, `record_created`, `record_updated`, `search_performed`, `search_result_selected` | Validation dashboard Product Usage report. |
| Dashboard KPI slice | `quick_action_used`, `pending_task_opened`, `dashboard_document_opened`, `accounting_dashboard_viewed` | Implemented in dashboard/accounting call sites; emits when those UI widgets are used. |
| Backend write telemetry | `backend_write_operation_completed` | Java backend sink submitted to Mixpanel with HTTP 200 and response `status=1`; Mixpanel query `93de91d8` showed product writes. |

### Defined But Not Yet Emitting Broadly

These events are catalogued or dashboarded but do not have active call sites for
the relevant product flows yet:

| Event or group | Current gap |
| --- | --- |
| `screen_load_completed` | Timing helper exists, but it is not attached globally to real screen loads. |
| `task_flow_completed` | No active call sites found for end-to-end task flows. |
| Integrity KPI events | KPI contracts exist, but scheduled/backend integrity emitters are not implemented. |
| Precision KPI events | KPI contracts exist, but domain emitters such as OCR/search precision are not wired. |
| Business KPI events | KPI contracts exist, but activation, retention, and business-state emitters are not wired. |
| `backend_accounting_entry_generated` | Defined in frontend/backend catalogs, but not wired to an authoritative accounting generation hook. |
| `backend_ocr_field_accuracy` | Defined, but no OCR extraction/accuracy backend emitter is wired. |
| `backend_asset_created` | Defined, but no asset creation domain emitter is wired. |
| `backend_email_invoice_ingested` | Defined, but no email ingestion backend emitter is wired. |
| `backend_monthly_close_started` / `backend_monthly_close_completed` | Defined, but no monthly close backend process emitter is wired. |

## Backend Event Contract

`backend_write_operation_completed` is emitted by `NeoCrudHandler` for mutating
NEO CRUD methods:

- `POST` -> `operation=create`
- `PUT` / `PATCH` -> `operation=update`
- `DELETE` -> `operation=delete`

Allowed properties:

| Property | Meaning |
| --- | --- |
| `source` | Always `neo`. |
| `specName` | Schema Forge spec name, for example `product`. |
| `entity` | NEO entity name, for example `product`. |
| `operation` | `create`, `update`, `delete`, or `unknown`. |
| `status` | `success` or `failed`. |
| `durationMs` | Backend operation duration. |
| `httpStatus` | HTTP status when a `NeoResponse` is available. |

The backend telemetry service sanitizes payloads and drops sensitive keys such
as tokens, raw URLs, document numbers, record IDs, labels, names, and free-form
search terms.

## Validation Procedure

1. Confirm frontend Mixpanel is enabled and `page_view` reaches Mixpanel.
2. Confirm backend properties are present in the deployed runtime without
   printing token values.
3. Trigger a small mutating backend operation from localhost.
4. Check `openbravo.log` for:

   ```text
   Backend Mixpanel telemetry is configured apiHost=... distinctId=...
   Backend telemetry event submitted to Mixpanel event=backend_write_operation_completed status=200 response={"error":null,"status":1}
   ```

5. Query Mixpanel for `backend_write_operation_completed` over the last day,
   grouped by `specName` or `status`.

Recent validation evidence:

| Evidence | Result |
| --- | --- |
| Local product smoke create | Created product with `specName=product`. |
| Backend log | Mixpanel sink received HTTP `200` and response `{"error":null,"status":1}`. |
| Mixpanel query `93de91d8` | `backend_write_operation_completed` present, including `specName=product`. |
| Mixpanel query `15312099` | Backend writes present with `status=success`. |

## Dashboard Interpretation

`Etendo Go - Validacion de Emision de Eventos` is a diagnostics dashboard.

- `Eventos Product Usage` validates frontend product usage emission.
- `Eventos Backend` validates server-side emission through
  `backend_write_operation_completed`.
- `Eventos KPI avanzados` is expected to remain empty until the specific
  advanced KPI call sites are implemented. An empty report there does not mean
  Mixpanel ingestion is broken.

## Next Implementation Work

Recommended priority order:

1. Attach `screen_load_completed` to real route/screen usable-state timing.
2. Add `task_flow_completed` for a small set of end-to-end flows, such as
   product create and sales invoice create.
3. Wire authoritative backend emitters for bank reconciliation and accounting
   flows already present in `com.etendoerp.go`.
4. Add integrity scheduled checks only after the denominator and blocking rules
   are defined with Product and QA.

Each new event must include a targeted test and a Mixpanel validation query.
