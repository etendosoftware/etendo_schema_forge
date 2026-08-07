# TBAI Facturas Enviadas

> **API-only sub-window** — no standalone UI. Data is fetched directly by
> `FiscalMonitorPage` via NEO Headless. There is no route or menu entry for this spec.

## Purpose

Exposes TBAI (TicketBAI) invoice submission records to the fiscal monitor UI. The spec
provides read access to a single entity tab filtered by submission status:

| Entity | Description |
|--------|-------------|
| `sincronización` | All TBAI invoices sent, filterable by status |

Supported status filters (matched against `r.estado`):

| Filter key | Meaning |
|-----------|---------|
| `'all'` | No filter — show all rows |
| `'Recibido'` | Accepted by the tax authority |
| `'Rechazado'` | Rejected (combines rejected + error counts in the KPI) |

> These filter keys are TBAI API status codes, not UI labels. Labels are resolved
> via `fiscalMonitor.tbai.tab.*` i18n keys.

## How it is consumed

`useFiscalMonitor.js` and `TbaiMonitorSection.jsx` fetch paginated rows from:

```
GET /sws/neo/tbai-facturas-enviadas/sincronización?adOrgId=...&page=...&estado=...
```

The `TbaiMonitorSection` component drives filter switching and row rendering.

## Parent guide

See [fiscal-monitor.md](fiscal-monitor.md) for the full functional specification,
debug mode, test plan, and known issues.

## API access — read-only (ETP-4254)

`decisions.json` declares `window.readOnly: true`, so both entities (`sincronización`,
`resultadoValidación`) are restricted to `GET` + `GETBYID` on `ETGO_SF_ENTITY`
(`ISPOST`/`ISPUT`/`ISPATCH`/`ISDELETE` = `N`). These are TBAI submission records produced by
the integration, not user- or agent-authored data. NEO Headless answers
`405 "<METHOD> not enabled for <entity>"` to the React app *and* to the MCP agent, and
`neo_discover` reports `readOnly: true`.

CRUD only — action/process, callout, selector, defaults and evaluate-display endpoints are
unaffected. Criteria and the full mechanism:
[`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md).

## Automated evidence

The `decisions.json` declares `attachments: false`, so the Attachments tab is explicitly disabled for this window.
