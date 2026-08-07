# Monitor Verifactu

> **API-only sub-window** — no standalone UI. Data is fetched directly by
> `FiscalMonitorPage` via NEO Headless. There is no route or menu entry for this spec.

## Purpose

Exposes Verifactu invoice submission records to the fiscal monitor UI. The spec provides
read access to four entity tabs, one per submission status:

| Entity | NEO path segment | Description |
|--------|-----------------|-------------|
| `facturasAceptadas` | `/facturasAceptadas` | Accepted invoices |
| `facturasParcialmenteAceptadas` | `/facturasParcialmenteAceptadas` | Partially accepted invoices |
| `facturasRechazadas` | `/facturasRechazadas` | Rejected invoices |
| `facturasInválidas` | `/facturasInválidas` | Invalid invoices |

Plus the header entity `cabeceraDeEmisor` (emitter header projection), for five entities total.

> **Note (corrected 2026-08-04, ETP-4254):** an earlier revision of this guide claimed
> `facturasParcialmenteAceptadas` had been renamed to `partiallyAcceptedInvoices` in ETP-3778.
> That rename never landed — `decisions.json`, `contract.json`, the committed
> `ETGO_SF_ENTITY.xml` row and `useFiscalMonitor.js:25` all use
> `facturasParcialmenteAceptadas`. The table above is the live name.

## How it is consumed

`useFiscalMonitor.js` and `VerifactuMonitorSection.jsx` fetch paginated rows from:

```
GET /sws/neo/monitor-verifactu/{entity}?adOrgId=...&page=...
```

The `VerifactuMonitorSection` component drives tab switching. KPI counts are derived in
`fiscalMonitor.utils.js → computeKpis()`.

## Parent guide

See [fiscal-monitor.md](fiscal-monitor.md) for the full functional specification,
debug mode, test plan, and known issues.

## API access — read-only except one entity (ETP-4254)

`decisions.json` declares `window.readOnly: true`, and `facturasParcialmenteAceptadas`
overrides it with an explicit allowlist. Resolved `ETGO_SF_ENTITY` flags:

| Entity | ISGET | ISGETBYID | ISPOST | ISPUT | ISPATCH | ISDELETE |
|--------|-------|-----------|--------|-------|---------|----------|
| `cabeceraDeEmisor` | Y | Y | N | N | N | N |
| `facturasAceptadas` | Y | Y | N | N | N | N |
| `facturasRechazadas` | Y | Y | N | N | N | N |
| `facturasInválidas` | Y | Y | N | N | N | N |
| `facturasParcialmenteAceptadas` | Y | Y | N | **Y** | **Y** | N |

`facturasParcialmenteAceptadas` keeps `PUT`/`PATCH` because it is the *subsanación* write path:
`VfSolveErrorModal.jsx:78-85` issues `PUT /sws/neo/monitor-verifactu/facturasParcialmenteAceptadas/{id}`
with `{"isSubsanation": true}`, served by the `mark-subsanation-handler` `NeoHandler`. Disabling
`PUT` would break that flow with a `405`.

`facturasInválidas` needs **no** write flag even though it has a handler: `Correct_Invoice` is a
Button-type process invoked as `POST …/facturasInválidas/{id}/action/Correct_Invoice`, and the
action path is dispatched (`NeoRequestRouter.java:191`) *before* the CRUD method gate
(`NeoCrudHandler.java:125`) — so actions, callouts, selectors, defaults and evaluate-display all
keep working on a fully read-only entity. (A plain `PUT` would be wrong here anyway: the backing
table is a view, so it returns `200` and writes nothing.)

The flags are shared by the React UI and the MCP agent — a disabled verb returns `405` to both.
Criteria and full mechanism:
[`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md).

## Automated evidence

The `decisions.json` declares `attachments: false`, so the Attachments tab is explicitly disabled for this window.
