# Design: Fiscal Refresh Button + Invoice Fiscal Status

**Date:** 2026-05-11
**Branch:** feature/ETP-3778

---

## Scope

Two independent UI improvements to the fiscal module:

1. **Refresh button** — manual reload in `FiscalMonitorPage` and `FiscalConfigPage`
2. **Fiscal status rows** — per-system submission status in `InvoicePreviewModal`, below the "Estado" row

---

## Feature 1 — Refresh Button

### Approach

Both `useFiscalMonitor` and `useFiscalConfig` already expose `refetch: load`. The feature is purely wiring + a small UI component.

### FiscalMonitorPage

Add `refreshKey` (integer state, starts at 0) alongside the existing `refetch` call:

```js
const { loading, kpis, profile, refetch, ... } = useFiscalMonitor(orgId, token, apiBaseUrl);
const [refreshKey, setRefreshKey] = useState(0);

function handleRefresh() {
  refetch();
  setRefreshKey(k => k + 1);
}
```

Pass `refreshKey` to all three section components:

```jsx
<SiiMonitorSection ... refreshKey={refreshKey} />
<TbaiMonitorSection ... refreshKey={refreshKey} />
<VerifactuMonitorSection ... refreshKey={refreshKey} />
```

Each section adds `refreshKey` to its row-fetch `useEffect` dependency array. This re-triggers the current page/tab/filter fetch without changing any other state.

### OrgLead bar

Replace the static sync indicator:

```jsx
// Before
<div className="r">
  <span className="syncdot" />
  {ui('fiscalMonitor.synced')}
</div>

// After
<div className="r">
  <RefreshButton loading={loading} onRefresh={onRefresh} ui={ui} />
</div>
```

`RefreshButton` is a small inline component in `FiscalMonitorPage.jsx`:

- **Idle:** `RefreshCw` icon (Lucide)
- **Loading:** icon spins, button non-clickable
- Clicking while loading is a no-op (`disabled`)

`OrgLead` receives `onRefresh` and `loading` as new props from `FiscalMonitorPage`.

### FiscalConfigPage

Add a small icon button in the existing page header area (near the profile indicator). Calls the already-exposed `refetch`. No `refreshKey` propagation needed — config sections re-render completely on `refetch`.

The button uses the same `RefreshCw` icon from Lucide, styled consistently with the existing outline button style in the page.

### i18n

| Key | es_ES | en_US |
|-----|-------|-------|
| `fiscalMonitor.refresh` | `Actualizar` | `Refresh` |

---

## Feature 2 — Fiscal Status Rows in InvoicePreviewModal

### Placement

Inside `StatsPanel`, in the `SectionCard summary` ("Total" card), directly below the existing "Estado" row (the doc status badge). One row per active fiscal system.

Visibility is driven by `getInvoiceFiscalTargets(specName, profile)` — the same function already used by `getPendingSifTargets`. Only rows where `showSii`/`showTbai`/`showVerifactu` is `true` are rendered.

### New hook — `useFiscalStatus`

File: `tools/app-shell/src/windows/custom/shared/useFiscalStatus.js`

```js
useFiscalStatus(invoiceId, specName, profile, orgId, token, apiBaseUrl)
→ { sii: statusCode|null, tbai: statusCode|null, verifactu: statusCode|null, loading: bool }
```

Fires one `fetch` per active system on mount (parallel via `Promise.all`). Each request uses the same criteria pattern established in `SiiMonitorSection`:

| System | Spec | Entity | FK field | Status field |
|--------|------|--------|----------|--------------|
| SII (sales) | `sii-monitor` | `issuedInvoices` | `aeatsiiInvoice` | `aeatsiiEstado` |
| SII (purchase) | `sii-monitor` | `receivedInvoices` | `aeatsiiInvoice` | `aeatsiiEstado` |
| TBAI | `tbai-facturas-enviadas` | `sincronización` | `invoice` | `estado` |
| Verifactu | `monitor-verifactu` | `facturasAceptadas` | invoice FK | `verifactuSendingStatus` |

Query pattern for each:
```
GET /sws/neo/<spec>/<entity>?organization=<orgId>&_startRow=0&_endRow=1
  &criteria=[{"fieldName":"<fkField>","operator":"equals","value":"<invoiceId>"}]
```

Returns the first row's status field, or `null` if no row found.

**Verifactu note:** Accepted invoices live in `facturasAceptadas`, but errored/rejected ones live in other entities. A simpler strategy: query `facturasAceptadas` first; if null, query `partiallyAcceptedInvoices`; if null, query `facturasRechazadas`; if null, `facturasInválidas`. Return the first match. This is sequential (up to 4 requests) but only fires if `showVerifactu` is true and the status field is needed. An alternative is to add a single-entity query to the Verifactu spec that covers all statuses — if that entity exists, prefer it.

### Rendering

`StatsPanel` receives two new props: `orgId` and `profile`. It calls `useFiscalStatus` internally.

Each row:
```jsx
<div className="flex justify-between items-center py-1.5 text-sm">
  <span className="text-gray-400">{ui('invoicePreview.fiscalStatus.sii')}</span>
  {loading
    ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse" />
    : <StatusPill estado={sii ?? 'PE'} />}
</div>
```

`StatusPill` is imported from `../fiscal-monitor/FmPrimitives.jsx` (relative path from `shared/`).

No status returned from API → pill shows `PE` (Pendiente de envío).

### Props changes

`InvoicePreviewModal` already has `orgId` (from `useAuth`) and `profile` (from `useFiscalConfig`). Pass both down to `StatsPanel`:

```jsx
<StatsPanel
  ...
  orgId={orgId}
  profile={profile}
/>
```

### i18n

| Key | es_ES | en_US |
|-----|-------|-------|
| `invoicePreview.fiscalStatus.sii` | `Estado SII` | `SII Status` |
| `invoicePreview.fiscalStatus.tbai` | `Estado TBAI` | `TBAI Status` |
| `invoicePreview.fiscalStatus.verifactu` | `Estado Verifactu` | `Verifactu Status` |

---

## Files touched

### Feature 1
- `tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorPage.jsx` — `refreshKey`, `handleRefresh`, `RefreshButton` component, `OrgLead` props
- `tools/app-shell/src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx` — add `refreshKey` prop to row-fetch `useEffect`
- `tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx` — same
- `tools/app-shell/src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx` — same
- `tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx` — add refresh icon button
- `tools/app-shell/src/locales/es_ES.json` — 1 new key
- `tools/app-shell/src/locales/en_US.json` — 1 new key

### Feature 2
- `tools/app-shell/src/windows/custom/shared/useFiscalStatus.js` — new hook
- `tools/app-shell/src/windows/custom/shared/InvoicePreviewModal.jsx` — pass `orgId`+`profile` to `StatsPanel`; import `useFiscalStatus` in `StatsPanel`
- `tools/app-shell/src/locales/es_ES.json` — 3 new keys
- `tools/app-shell/src/locales/en_US.json` — 3 new keys

---

## Out of scope

- Refresh button per section (YAGNI)
- Auto-polling / live refresh
- Verifactu single-entity fallback spec (follow-up if needed)
- Clicking the fiscal status pill to navigate to fiscal-monitor
