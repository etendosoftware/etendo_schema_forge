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
| `VITE_MIXPANEL_ALLOW_LOCAL` | `true` lets a non-production host emit, to validate emission locally. Off by default; never set in a deployment. |

**Production hosts only (ETP-5466).** The browser provider emits only when the page is served
from `app.etendo.software` or `app.etendo.ai` (`MIXPANEL_ALLOWED_HOSTS`, exact hostnames). On
`localhost`, `127.0.0.1`, staging, experimental or any other host it stays disabled even with
`VITE_MIXPANEL_ENABLED=true` and a token, unless `VITE_MIXPANEL_ALLOW_LOCAL=true`. Before this
rule, local development and Playwright runs (each test a new device) made up ~99% of the
project's `page_view` devices; the historical localhost data is not deleted and must still be
excluded by report filters.

Backend Mixpanel must not read `VITE_*` values. It uses backend runtime
properties:

| Property | Environment variable | Purpose |
| --- | --- | --- |
| `etendo.go.mixpanel.enabled` | `ETGO_MIXPANEL_ENABLED` | Enables backend Mixpanel submission (`true` / `Y`). Defaults to `false` since ETP-5466: only an environment that sets it explicitly emits, a token alone does not. |
| `etendo.go.mixpanel.token` | `ETGO_MIXPANEL_TOKEN` | Backend project token. Required. |
| `etendo.go.mixpanel.apiHost` | `ETGO_MIXPANEL_API_HOST` | Mixpanel API host. Defaults to `https://api-eu.mixpanel.com`. |
| `etendo.go.mixpanel.timeoutMs` | `ETGO_MIXPANEL_TIMEOUT_MS` | HTTP connect/read timeout. Defaults to `5000`. |
| `etendo.go.mixpanel.distinctId` | `ETGO_MIXPANEL_DISTINCT_ID` | Stable backend identity. Defaults to `neo-backend`. Each emitting environment sets its own (a local validation uses `neo-backend-localhost`). |

Backend token values must remain outside committed source files.

## Emission Status

### Emitting

| Area | Events | Evidence |
| --- | --- | --- |
| App lifecycle | `app_started`, `page_view` | Validation dashboard base events. |
| Onboarding | `onboarding_auth_*`, `onboarding_setup_*`, `onboarding_run_*`, `onboarding_environment_enter_*` | Validation dashboard onboarding report. |
| Product usage | `window_opened`, `record_created`, `record_updated`, `search_performed`, `search_result_selected` | Validation dashboard Product Usage report. |
| Product usage (ETP-5889) | `product_movements_tab_opened` (`account_id`, `category`, `entity`, `source` = `tab` or `side_panel_link`, `specName`) | **Implemented, emitted once the tab is on**: the hook `useProductMovementsTabTracking` calls `trackProductMovementsTabOpened` when the tab becomes active, never on mount (custom tabs are mounted with the record and only hidden). The tab exists only for accounts with the backend flag `product-movements-tab` on (`capabilities.productMovements`); with it off nothing renders and nothing is emitted, so the KPIs stay N/D until the flag is on for some account in a released build. The event is sent whatever the role of the user is: the role travels on every event as the list property `role_groups` (ETP-6043) and is only a filter of the KPI reports. Merged into `develop` on 2026-11-02 (etendo_schema_forge#2073, com.etendoerp.go#1507); the Datadog flag has a targeting rule by account email in Production. Not in the validation dashboard: its KPIs have their own dashboard, see *Reading the Movements KPIs*. |
| Invoice Inbox usage (ETP-6050) | `invoice_inbox_opened` (`account_id`, `category` = `product_usage`, `specName` = `invoice-inbox`) | **Implemented, not yet validated in production.** The hook `useInvoiceInboxOpenedTracking` calls `trackInvoiceInboxOpened` once per mount of the Invoice Inbox page (the page is mounted only while shown), never on re-render, list refresh, drawer open/close or locale change. The inbox is a custom page, so the generic `window_opened` does not fire for it, and the flag `invoice-inbox` is backend-only, so the browser never emits `feature_flag_evaluated` for it: this event is the adoption trail. Adoption = `invoice_inbox_opened` over `session_started` in Mixpanel (report not created yet, tracked in etendo-kpis). With the flag off the page is not reachable and nothing is emitted. No file name, vendor, amount or document id travels. Caveats: adoption = `invoice_inbox_opened` over `session_started` in Mixpanel; demo tenants (tenant_type D) and test accounts are NOT excluded yet (the ETGO_Account test-account indicator is pending with Platform); `account_id` carries the tenant `clientId`, as in ETP-5889, while etendo-kpis notes that `etgo_account_id` replaces `account_id` for backend events (a frontend migration, if any, must move ETP-5889 and this event together). |
| Bank reconciliation (ETP-5581) | `bounce_suggestions_viewed` (`account_id`, `pairs_shown`, `pairs_preselected`, `auto_opened`), `bounce_suggestions_dismissed` (`account_id`, `pairs_shown`, `pairs_checked_at_close`, `auto_opened`) | **Implemented, not yet validated against live traffic.** Emitted by the automatch modal (`AutoMatchSuggestionModal.jsx` via `lib/bounceSuggestionsTelemetry.js`): `viewed` once per opening that shows at least one bounce pair, `dismissed` when that opening closes without applying (*Revisar en el panel* and an apply do not count). Bounce pairs exist only for accounts with the backend flag `bank-bounce-suggestions` on, so nothing is emitted until an account is targeted. Feeds the roadmap #15 control *suggestions closed without deciding*; the per-pair decisions are backend events (`backend_bank_bounce_pair_decided`, fed by the `bounceDecisions` of `applySuggestions` and by `dismissPair`; for an MCP apply, which sends no `bounceDecisions`, the backend reports the pairs left out as `unchecked` itself, `channel: mcp`), and `backend_bank_bounce_pair_restored` carries `preselected` so a restore can be subtracted from the high-confidence KPI. Backend contract: com.etendoerp.go `docs/backend-observability.md`. See `docs/generated-custom-windows/financial-account.md`, *KPI reporting*. |
| Dashboard KPI slice | `quick_action_used`, `pending_task_opened`, `dashboard_document_opened`, `accounting_dashboard_viewed` | Implemented in dashboard/accounting call sites; emits when those UI widgets are used. |
| Backend write telemetry | `backend_write_operation_completed` | Java backend sink submitted to Mixpanel with HTTP 200 and response `status=1`; Mixpanel query `93de91d8` showed product writes. |
| Feature flags | `feature_flag_evaluated` | Global OpenFeature hook (`lib/flags/flag-exposure.js`); confirmed live via Mixpanel queries `b653bf8a` / `6a731a9c` (342 unique users / 30d across both current flags). |
| Tenant-upgrade checkout funnel | `upgrade_page_viewed`, `upgrade_first_tenant_free_continued`, `upgrade_existing_tenant_name_blocked`, `upgrade_session_expired`, `upgrade_checkout_submitted`, `upgrade_payment_declined`, `upgrade_tenant_provisioning_succeeded`, `upgrade_tenant_provisioning_failed`, `upgrade_enter_tenant_failed` | Added in `UpgradePage.jsx` / `lib/upgrade/`, see `docs/paid-tenant-infrastructure.md` §3.6. Not yet validated against live traffic — no deploy has shipped this yet, so Mixpanel shows zero events for these names until it does. |

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

## Reading the Movements KPIs

The two KPIs of the Movements tab (`eng_movements_tab_adoption`, `eng_movements_tab_frequency`, roadmap idea `etendosoftware/etendo-ai#4`) are computed by the `etendo-kpis` collector from two **saved Mixpanel Insights reports** in the *Etendo Go* project (ids `93773825` and `93773827`, dashboard `11625102` *ETP-5889 · KPIs pestaña Movimientos de Producto*), not from the validation dashboard above.

- Unit: the device (Mixpanel does not identify people, ETP-4352). **Under review:** once someone signs in Mixpanel merges their devices into one identity (`$user_id`), so the reports count people when signed in; see section 11.1 of the ETP-5889 plan. Adoption = devices that opened the tab / devices with `session_started`, per week; frequency = opens / the same devices.
- Both reports filter the production hosts (`hostname` contains `app.etendo.`) and the role (`role_groups` contains `warehouse`). The role that counts is changed by editing those filters in Mixpanel, with no change to this repository.
- Weeks start on Monday 00:00 in the time zone of the Mixpanel project (Europe/Madrid).
- The KPIs are N/D, never 0, until `product_movements_tab_opened` has been seen in production and there are active devices of the role in the week.

Ids, filters, the series-name contract and how to rebuild the reports are documented in `etendo-kpis`: [`docs/mixpanel-saved-reports.md`](https://github.com/etendo-ai/etendo-kpis/blob/main/docs/mixpanel-saved-reports.md).

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
