# SII Monitor

> **API-only sub-window** — no standalone UI. Data is fetched directly by
> `FiscalMonitorPage` via NEO Headless. There is no route or menu entry for this spec.

## Purpose

Exposes SII (Suministro Inmediato de Información) invoice submission records to the fiscal
monitor UI. The spec provides read access to four entity tabs:

| Entity | Description |
|--------|-------------|
| `issuedInvoices` | Current-period issued invoices sent to AEAT SII |
| `issuedInvoices(previousPeriod)` | Prior-period issued invoices |
| `receivedInvoices` | Current-period received invoices |
| `receivedInvoices(previousPeriod)` | Prior-period received invoices |

Each entity also exposes a `*SiiData` sub-entity with the raw AEAT response fields.

## How it is consumed

`useFiscalMonitor.js` and `SiiMonitorSection.jsx` fetch paginated rows from:

```
GET /sws/neo/sii-monitor/{entity}?adOrgId=...&page=...
```

The `SiiMonitorSection` component drives tab/period switching and row filtering. KPI
counts are derived in `fiscalMonitor.utils.js → computeKpis()`.

## Parent guide

See [fiscal-monitor.md](fiscal-monitor.md) for the full functional specification,
debug mode, test plan, and known issues.

## Automated evidence

The `decisions.json` declares `attachments: false`, so the Attachments tab is explicitly disabled for this window.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which adds the
`EM_Psd2_Generate_Bank_Payment` ("Generate Bank Payment") column to the shared
core table this window sits on (`C_Order` / `C_Invoice` / `FIN_Payment`). Because
Schema Forge extracts from AD, that column surfaces in this window's contract as a
**system field** — present in the backend contract but **not** rendered in the
frontend (there is no `AD_Field` for it on this window). No UI or behavior change;
this note only records why the contract was regenerated when the PSD2 dependency
was added. Full rationale: [`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).
