# Rendimiento KPIs

Rendimiento validates user-visible speed, platform stability, and response
time. Mixpanel is useful for product-facing timing events, while backend p95,
error rate, and write latency require authoritative backend metrics.

## Developed

- `app_started` and `page_view` are already emitted from App Shell.
- AWS RUM and Sentry can collect browser performance/error telemetry when
  configured.
- Mixpanel can receive product events through the existing observability facade.

## Mixpanel Event Contract

| Event | When | Required properties |
|-------|------|---------------------|
| `screen_load_completed` | A screen reaches usable state. | `kpiId`, `module`, `windowName`, `durationMs`, `status` |
| `report_load_completed` | A report is visible with data or empty state. | `kpiId`, `module`, `type`, `durationMs`, `status` |
| `write_operation_completed` | Save/confirm/process finishes. | `kpiId`, `module`, `flow`, `durationMs`, `status` |
| `copilot_response_completed` | Copilot returns a final answer/action result. | `kpiId`, `module`, `type`, `durationMs`, `status` |
| `critical_error_observed` | A critical browser/API error reaches the session. | `kpiId`, `module`, `errorClass`, `critical`, `status` |

Pending before implementation: add `kpiId`, `module`, `flow`, `durationMs`,
`errorClass`, and `critical` to the safe payload allowlist.

## KPI Matrix

| KPI ID | Module | KPI | Target | Measurement | Status | Pending |
|--------|--------|-----|--------|-------------|--------|---------|
| `kpi_perf_dashboard_load` | Dashboard | Tiempo de carga del Dashboard | `< 2s` | p95 `durationMs` for `screen_load_completed` where `windowName=dashboard`. | Mixpanel ready | Add dashboard usable-state timing. |
| `kpi_perf_accounting_aging_reports` | Contabilidad | Tiempo hasta visualizar aging reports | `< 3s` | p95 `durationMs` for `report_load_completed` where `type=aging_report`. | Mixpanel ready | Add report timing and stable report type. |
| `kpi_perf_copilot_simple_response` | Copilot IA | Tiempo de respuesta del agente para tareas simples | `< 5s` | p95 `durationMs` for `copilot_response_completed` where `type=simple_task`. | Backend pending | Copilot service must emit terminal timing/result. |
| `kpi_perf_any_screen_report_load` | Transversal | Tiempo de carga de cualquier pantalla e informe | `< 2s` | p95 `durationMs` across `screen_load_completed` and `report_load_completed`. | Mixpanel ready | Add common timing hook and backend report timings. |
| `kpi_perf_sessions_without_critical_errors` | Transversal | Sesiones sin errores críticos | `> 99.5%` | `(sessions - sessions_with_critical_error) / sessions`. | Backend pending | Define session identity and critical error taxonomy across Sentry/RUM/API. |
| `kpi_perf_write_operation` | Transversal | Tiempo de respuesta de cualquier operacion de escritura | `< 3s` | p95 `durationMs` for `write_operation_completed`. | Backend pending | Backend endpoint/process timing required for authoritative write completion. |

## Backend Metrics

Recommended backend metrics for correlation:

| Metric | Labels | Supports |
|--------|--------|----------|
| `sf_api_request_duration_seconds` | `endpoint`, `method`, `status` | Screen/report/write response time. |
| `sf_api_request_total` | `endpoint`, `method`, `status` | Critical error and availability rates. |
| `sf_process_duration_seconds` | `process_name`, `status` | Document processing and long operations. |
| `sf_eventhandler_duration_seconds` | `entity`, `event_type` | Save/confirm side effects. |
| `sf_email_provider_duration_seconds` | `provider`, `contract`, `status` | Sales email sending latency if needed later. |

## Open Decisions

- Decide whether product thresholds use p75, p95, or percentage under threshold.
  This document recommends p95 for platform KPIs.
- Define the critical error taxonomy: HTTP 500, data loss, inconsistent state,
  failed confirmation after apparent success, and unrecoverable blank screen.
- Decide whether Mixpanel receives timing values directly or only summarized
  daily KPI events from the backend/data warehouse.
