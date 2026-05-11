# Send to SIF Button — Sales Invoice Window

**Date:** 2026-05-07
**Feature branch:** feature/ETP-3778

## Context

The Sales Invoice window in Etendo GO lacks the ability to manually trigger fiscal submission to Spain's digital tax reporting systems (SII and/or TBAI). Classic Etendo exposes two separate buttons (`Em_aeatsii_send` → SII, `Em_Tbai_Xmlgenerator` → TBAI), but Etendo GO needs a single unified **"Send to SIF"** button that auto-detects which fiscal system the organization has configured and acts accordingly.

Verifactu is explicitly excluded: it triggers automatically via a DB extension point when the invoice is completed, so no manual button is needed.

---

## Architecture

### Files

| File | Action |
|---|---|
| `artifacts/sales-invoice/custom/SendToSifButton.jsx` | **Create** — new self-contained component |
| `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx` | **Modify** — 1 import + 1 JSX line |
| `tools/app-shell/src/i18n/locales/en_US.json` | **Modify** — 10 new i18n keys |
| `tools/app-shell/src/i18n/locales/es_ES.json` | **Modify** — 10 new i18n keys |

No changes to `decisions.json` or generated files — the button lives entirely in the custom layer.

### Reused utilities

- `useFiscalConfig(orgId, token, apiBaseUrl)` — `tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js`
- `detectProfile(sii, tbai, verifactu)` — `tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js`
- `useUI()` — standard i18n hook

---

## Fiscal Profile → Visibility + Systems

| Profile (`detectProfile()`) | Button visible | Systems called |
|---|---|---|
| `sii` / `sii-navarra` | ✓ | SII only |
| `tbai` | ✓ | TBAI only |
| `sii+tbai` | ✓ | SII then TBAI (sequential, independent) |
| `verifactu` | ✗ | DB extension point (automatic on completion) |
| `unconfigured` / `conflict` | ✗ | — |

**Additional visibility gate:** `status !== 'CO'` → return null. The button only appears on confirmed invoices.

---

## API Endpoints

Direct fetch calls (same pattern as `PurchaseOrderActions.jsx`) to retain Promise-based control for per-system result tracking:

- **SII:** `POST /sws/neo/sales-invoice/header/{id}/action/Em_aeatsii_send` body: `{}`
- **TBAI:** `POST /sws/neo/sales-invoice/header/{id}/action/Em_Tbai_Xmlgenerator` body: `{}`

Auth: `Authorization: Bearer {token}` header (token available from `InvoiceTopbarExtra` props).

---

## Component: `SendToSifButton`

### Props

```js
{
  recordId: string,   // current invoice ID
  status: string,     // document status (gate: must be 'CO')
  data: object,       // full record data (for orgId extraction)
  token: string,      // Bearer token
  apiBaseUrl: string, // base NEO URL
}
```

### Internal state

```js
modalOpen: boolean
phase: 'confirm' | 'sending' | 'results'
results: {
  sii?: { ok: boolean, error?: string },
  tbai?: { ok: boolean, error?: string },
}
```

### Logic flow

1. Derive `orgId` from `data?.organization` (or `data?.organization$_identifier`)
2. Call `useFiscalConfig(orgId, token, apiBaseUrl)` → get `profile`
3. If `status !== 'CO'` OR `profile` not in `{sii, sii-navarra, tbai, sii+tbai}` → return null
4. Render topbar button (`sendToSif` label), styled consistently with existing topbar buttons in `InvoiceTopbarExtra`
5. **On click:** `modalOpen = true`, `phase = 'confirm'`
6. **On confirm:** `phase = 'sending'`, then:
   - `sii` / `sii-navarra`: call SII endpoint → capture `{ok, error}`
   - `tbai`: call TBAI endpoint → capture `{ok, error}`
   - `sii+tbai`: call SII (try/catch) → then call TBAI (try/catch independently) → capture both
7. `phase = 'results'`, populate `results`
8. **On close:** reset all state

---

## Modal UX

### State 1 — Confirmation

- **Title:** `sendToSifTitle`
- **Body:** dynamic per profile:
  - `sii` / `sii-navarra` → `sendToSifBodySii`
  - `tbai` → `sendToSifBodyTbai`
  - `sii+tbai` → `sendToSifBodyBoth`
- **Buttons:** Cancel | Send

### State 2 — Sending (blocking)

- Spinner + `sendToSifSending` message
- Modal not dismissible during send
- SII runs first, TBAI after — each in independent try/catch so a SII failure does not block TBAI

### State 3 — Results

- One row per system: ✓ success label **or** ✗ + error message from response
- **Close** button to dismiss and reset

---

## i18n Keys

| Key | en_US | es_ES |
|---|---|---|
| `sendToSif` | "Send to SIF" | "Enviar a SIF" |
| `sendToSifTitle` | "Send to Tax System" | "Enviar al sistema fiscal" |
| `sendToSifBodySii` | "This invoice will be sent to SII." | "Esta factura se enviará al SII." |
| `sendToSifBodyTbai` | "This invoice will be sent to TBAI." | "Esta factura se enviará a TBAI." |
| `sendToSifBodyBoth` | "This invoice will be sent to SII and TBAI." | "Esta factura se enviará al SII y a TBAI." |
| `sendToSifSending` | "Sending… this may take a few seconds." | "Enviando… esto puede tardar unos segundos." |
| `sendToSifSuccessSii` | "Sent to SII successfully." | "Enviado al SII correctamente." |
| `sendToSifSuccessTbai` | "Sent to TBAI successfully." | "Enviado a TBAI correctamente." |
| `sendToSifErrorSii` | "Error sending to SII." | "Error al enviar al SII." |
| `sendToSifErrorTbai` | "Error sending to TBAI." | "Error al enviar a TBAI." |

---

## Verification

1. Confirmed invoice, SII profile → "Enviar a SIF" button visible in topbar
2. Draft invoice (`status !== 'CO'`) → button not rendered
3. `verifactu` / `unconfigured` / `conflict` profile → button not rendered
4. Click button → modal opens with correct body text per profile
5. Confirm → modal blocks, spinner shown, processes called via fetch
6. `sii+tbai` with SII failure → TBAI still attempted; both results shown
7. Existing payment badge and send-document button in `InvoiceTopbarExtra` still work
8. `make regen ONLY=sales-invoice` completes without errors (custom files are not overwritten)
