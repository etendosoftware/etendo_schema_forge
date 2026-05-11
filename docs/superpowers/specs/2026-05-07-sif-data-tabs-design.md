# SIF Data Tabs — Sales Invoice Window

**Date:** 2026-05-07
**Feature branch:** feature/ETP-3778

## Context

The Sales Invoice window needs to expose SII and TBAI fiscal fields (currently discarded header fields on C_Invoice) in a dedicated tab UI inside the detail view. These fields are only relevant for organizations with SII or TBAI configured. The tab must appear conditionally based on the fiscal profile, show editable SII fields with auto-save on blur, and show read-only TBAI fields.

---

## Architecture

### Files

| File | Action |
|---|---|
| `artifacts/sales-invoice/custom/SifDataTabs.jsx` | **Create** — tab component (SII + TBAI panels) |
| `artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js` | **Create** — source-inspection tests |
| `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx` | **Modify** — import + one JSX line at top |
| `artifacts/sales-invoice/decisions.json` | **Modify** — reclassify SII and TBAI header fields from `discarded` to `editable`/`readOnly` |

No changes to generated files directly — reclassification in `decisions.json` + `make regen ONLY=sales-invoice SKIP_EXTRACT=1` updates the contract and generated components.

### Reused utilities

- `useFiscalConfig(orgId, token, apiBaseUrl)` — `tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js`
- `useUI()` — standard i18n hook
- `toast` from `sonner` — error feedback on PATCH failure

---

## Fiscal Profile → Tab Visibility

| Profile | Tab "SII" | Tab "TBAI" |
|---|---|---|
| `sii` / `sii-navarra` | ✓ | ✗ |
| `tbai` | ✗ | ✓ |
| `sii+tbai` | ✓ | ✓ |
| `verifactu` / `unconfigured` / `conflict` | ✗ | ✗ |

When `sii+tbai`: both tabs shown, SII active by default.

---

## Component: `SifDataTabs`

### Props

```js
{
  data: object,       // full header record (contains all reclassified SII/TBAI fields)
  recordId: string,   // invoice ID
  token: string,      // Bearer token
  apiBaseUrl: string, // base NEO URL
}
```

### Internal state

```js
activeTab: 'sii' | 'tbai'           // which tab is selected
siiForm: object                      // local controlled state for editable SII fields
savingField: string | null           // field key currently being PATCHed
```

### Logic flow

1. `orgId = data?.organization`
2. `useFiscalConfig(orgId, token, apiBaseUrl)` → `{ profile }`
3. Derive visible tabs: `showSii = ['sii','sii-navarra','sii+tbai'].includes(profile)`, `showTbai = ['tbai','sii+tbai'].includes(profile)`
4. If neither → `return null`
5. Initialize `siiForm` from `data` on mount (editable SII fields only)
6. Render tab bar + active panel

### Auto-save (SII editable fields only)

On `onBlur` of any editable SII input:
1. If value unchanged → skip
2. `PATCH /sws/neo/sales-invoice/header/{recordId}` with `{ [fieldKey]: newValue }`
3. Success → keep local state (no full refetch needed)
4. Error → `toast.error(...)` + revert field to original value from `data`

---

## Tab SII — Fields

All fields read from the header (`data` prop). Editable fields use `siiForm` local state.

| Label (classic Etendo) | API key (to identify in schema-raw.json) | Behavior |
|---|---|---|
| Fecha operación | TBD — identify in schema-raw.json | Editable (date) |
| Invoice type key | TBD | Editable (enum/selector) |
| Sil description master | TBD | Editable (FK lookup) |
| Sil Description | TBD | Editable (text) |
| SII - Cause Exemption | TBD | Editable (selector) |
| Authorization | TBD | Editable (checkbox) |
| Sil exercise | TBD | **Read-only** (display from `data`) |
| Sil period | TBD | **Read-only** (display from `data`) |

> **Implementation note:** Identify all API keys by searching `schema-raw.json` for fields currently classified as `discarded` whose labels match the above. Then reclassify in `decisions.json`.

---

## Tab TBAI — Fields

All read-only — no PATCH, display directly from `data`.

| Label (classic Etendo) | API key (to identify in schema-raw.json) | Behavior |
|---|---|---|
| Secuencia de encadenamiento | TBD | Read-only |
| Serie Factura | TBD | Read-only |
| Secuencia Factura | TBD | Read-only |

---

## decisions.json Changes

For each identified SII field:
- Editable fields: `"visibility": "editable"` (removes `discarded`)
- Read-only fields (`Sil exercise`, `Sil period`, TBAI fields): `"visibility": "readOnly"`

After editing `decisions.json`:
```bash
make regen ONLY=sales-invoice SKIP_EXTRACT=1
```

This updates `contract.json` and regenerated components. The fields then appear in `data` prop passed to custom components.

---

## Integration in InvoiceBottomPanel

```jsx
import SifDataTabs from './SifDataTabs';

// At the top of InvoiceBottomPanel's JSX return, before existing content:
<SifDataTabs data={data} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} />
```

`InvoiceBottomPanel` already receives `{ data, recordId, token, apiBaseUrl }` — no prop changes needed.

---

## Verification

1. Organization with SII profile → only "SII" tab appears inside InvoiceBottomPanel
2. Organization with TBAI profile → only "TBAI" tab appears
3. Organization with SII+TBAI → both tabs appear, SII active by default
4. `verifactu` / `unconfigured` → no tabs rendered, InvoiceBottomPanel unchanged
5. SII editable field: edit value → blur → PATCH called → no full page reload
6. SII field PATCH failure → toast error → field reverts to original value
7. TBAI fields: display only, no inputs
8. `make regen ONLY=sales-invoice SKIP_EXTRACT=1` completes without errors
9. Existing InvoiceBottomPanel content (RelatedDocuments, Notes, Totals) still renders correctly
