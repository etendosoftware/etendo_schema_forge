# Currency Conversion (Conversión de divisas)

## Intent
Maintain the currency conversion rates the system uses when a document currency differs from the organization's base currency. Each rate defines, for an `organization currency → currency` pair over a validity range (date **and time**), the multiply rate; the server stores the inverse pair of the same range alongside it. These are the same rates the invoice completion guard (ETP-4030) looks up before allowing a foreign-currency invoice to be completed — see `purchase-invoice.md` and `sales-invoice.md`.

USD and GBP rates are downloaded daily by the conversion-rate downloader job (`com.smf.currency.conversionrate`) and are flagged **Synced** (origin *Automática*). Every other currency only takes **manual** rates (origin *Manual*). The audit trail for downloader runs lives in the companion window — see `conversion-rate-downloader-log.md`.

ETP-6365 renamed the window from *Conversion Rates* / *Rangos de conversión* to **Currency Conversion** / **Conversión de divisas** and replaced the generated read-only list with a hand-written page.

## What this window should allow
- list the conversion rates of each currency pair with their validity range (date and time)
- review the multiply rate and the divide rate of a pair for a validity range

These bullets stay read-only on purpose: the public API manifest publishes them as the
`conversion-rates` capabilities, and the public API is still read-only. In the window itself
(ETP-6365) a user can also: see, per currency, the rate in force now and its origin; browse the
history grouped by currency and filtered by currency, period, origin and status; add a first manual
rate for an active currency with no rates ("Nueva divisa"); add a new manual rate that closes the one
in force ("Nueva tasa"); edit or delete a manual rate not yet used in accounting.

`decisions.json` sets `window.readOnly: false`, so `make regen … PUSH_TO_NEO=1` writes
`ISPOST/ISPUT/ISPATCH/ISDELETE = Y` on `ETGO_SF_ENTITY` (REST and MCP can write). The **public API
stays read-only** (`entities.header.publicApi.readOnly: true` is kept): opening it to writes is a
separate decision.

## Interaction model
- **Route:** `/conversion-rates` and `/conversion-rates/:recordId` (unchanged). Both render the same page; there is no drill-in detail since the redesign.
- **Menu:** **Finance** group in `tools/app-shell/src/menu.json` (`windowId: "116"`, label `Currency Conversion`, translated through the `menus` / `windows` entries of the locale files). Breadcrumb *Finanzas / Conversión de divisas*.
- **Implementation type:** custom window — `layoutType: "custom"` in `artifacts/conversion-rates/decisions.json`; code in `tools/app-shell/src/windows/custom/conversion-rates/`, registered in `customLoaders` (`windows/registry.js`), which wins over the generated loader. The pipeline never overwrites these files (a regeneration writes `index.jsx.new` next to them at most).
- **Toolbar:** Filtros (shows / hides the history filters), Copiar enlace (the filters live in the URL: `currency`, `period`, `from`, `to`, `origin`, `status`, `all`), Ordenar (orders the rows inside each currency group by valid from, valid to or rate), Actualizar (reloads cards and history) and the primary **Nueva divisa**.
- **Vigentes hoy:** one card per currency in ONE horizontally scrolling row (scroll-snap). Each card: symbol, ISO, name, origin badge, `1 EUR = <rate> <ISO>` (forward rate only). Automatic cards end with *Automática por defecto · descargada hoy a las HH:mm* (or *… descargada el dd/MM/yyyy a las HH:mm* when the last download, `lastDownloadAt`, was not today); manual cards end with *Vigente desde dd/MM/yyyy HH:mm · sin fecha de fin* and a **+ Nueva tasa** link. Data: action `currentRates`.
- **Histórico:** filters Moneda (Todas + the currencies with a rate in force), Periodo (Últimos 30 días — default —, Este mes, Este año, Personalizado… with two date fields), Origen (Todos / Automática / Manual), Estado (Todos / Vigente / No usado / Usado en contabilidad). Rows are grouped by currency in collapsible groups; the group header shows symbol, ISO, name, origin, *Vigente: 1 EUR = X ISO*, *· N tasas* and, for a manual currency, **+ Nueva tasa**. Columns: Válido desde (fecha y hora), Válido hasta (fecha y hora), `1 EUR =` (rate + currency symbol), `1 [moneda] = EUR` (`divideRateBy` + €), Estado (badge, with a lock when `etgoUsedInAccounting`), Acciones. The table scrolls vertically under a sticky header row. Each group shows its 3 most recent rates; **Ver todas** shows every rate (*Ver solo las 3 más recientes* goes back). A legend explains the states and the hover actions.
- **Row actions:** hovering a **manual** row that is **not** used in accounting (`sMFCRSynced = false` and `etgoUsedInAccounting = false`: *No usado*, or *Vigente* without lock) shows **Modificar** (pencil) and **Eliminar** (trash) — the shared `ListModalRowActions` hover buttons (`contract-ui/ListModalRowActions.jsx`, the payment-term ones). Modificar opens a dialog styled like *Nueva tasa* that PATCHes `multipleRateBy` and/or `validFromDate`; Eliminar asks for confirmation (`DeleteConfirmDialog`) and DELETEs the row — the server removes both directions.

## Dialogs
- **Nueva divisa** (*Manual* badge): Moneda origen = organization currency, read-only (`EUR · Euro`); Moneda destino = action `manualCurrencyOptions {withoutRates: true}` (active currencies with no rates; never USD/GBP); Tasa `1 EUR = [X] ARS`; Válido desde (date + time), default now rounded to the minute. Summary *Se añadirá ARS como divisa manual con dos tasas* plus the two lines from `previewManualRate`. Buttons Cancelar / Crear divisa.
- **Nueva tasa · CHF:** destination fixed; *Tasa vigente: 1 EUR = 0,9420 CHF desde …* (from `currentRates`); Tasa; Válido desde with *Por defecto, ahora. Puede cambiarlo.*; summary *Se crearán dos tasas*, the two lines and *La tasa vigente de CHF (desde …) se cerrará el … a las HH:mm en los dos sentidos.* (from the preview's `closes`). Buttons Cancelar / Crear tasa.
- **Modificar tasa · CHF:** same layout, prefilled with the row; no preview; Guardar sends only the changed fields.
- Tasa (> 0) and Válido desde (valid date and time) are required: the confirm button stays disabled and the field shows its error until both are valid. The preview is requested again (debounced, 350 ms) whenever an input changes; a preview `error` is shown in the error box and blocks the confirm button. A refused write (400 / 409 / 422) shows the server's translated `error.message` as is. Enter confirms (the dialog is a form), Esc and the corner X close, the tab order follows the fields. On success the dialog closes and both the cards and the history reload.

## Reactive behavior and dependencies
- **Server-owned rules (`com.etendoerp.go`).** The server creates the inverse rate, closes the previous open range at `start − 1 minute` in both directions, refuses overlapping ranges (`ETGO_ConvRateOverlap`, 409) and refuses any write on a synced or accounting-locked rate (409). PATCH only accepts `multipleRateBy` and `validFromDate` (anything else → 400). The UI enforces none of these; it shows the preview and the messages.
- **Forward rows only.** The history lists only the rows whose `currency` is the organization currency (criteria `currency = <org currency id>`). The inverse rows exist but are never listed; the inverse value of a period is the forward row's `divideRateBy`.
- **Status.** `etgoRateStatus` (`CURRENT` → *Vigente*, `POSTED` → *Usado en contabilidad*, `UNUSED` → *No usado*) and `etgoUsedInAccounting` (the lock) are columns served by `com.etendoerp.go`; both are real, filterable columns, so every history filter runs in the backend.
- **Period filter.** Datetime bounds on `validFromDate`, half-open: a day is `[D 00:00, D+1 00:00)`; *Últimos 30 días* is today and the 29 days before it.
- **Datetimes are server-local wall clock.** NEO answers `validFromDate` / `validToDate` as `yyyy-MM-ddTHH:mm:ss` with no offset (NeoDateFormat, ETP-5100). The page reads and writes them as text (`conversionRatesModel.js`), never through `new Date(string)`, shows them as `dd/MM/yyyy HH:mm` and sends `validFromDate` as `yyyy-MM-ddTHH:mm:00`. The default *now* is the browser's local minute.
- **Open range.** A `validToDate` in year 2999 or later (the open range, `9999-12-31`) is shown as «—» (*sin fecha de fin*).
- **Display rule for automatic daily ranges.** The downloader stores each daily range closing at `00:00` of the same day (`17/11/2026 00:00 → 17/11/2026 00:00`). For a synced row whose `validToDate` is at `00:00` on or after its `validFromDate` day, the page shows that day at `23:59` (`17/11/2026 23:59`). Manual ranges are shown as stored (`18/11/2026 14:29`).
- **Numbers.** Rates are shown with 4 decimals through `formatGroupedNumber` (instance separators); the typed rate is parsed with `parseLocaleNumber` (comma or point, no grouping).
- **Downstream consumer:** these records are read at invoice completion by `InvoiceExchangeRateValidator.checkRateForCompletion()` (`com.etendoerp.go`) through the AD general-rate lookup. A missing rate for the needed pair is what triggers the `SMFCR_NoRateOnComplete` block on the invoice windows.

## Gap assessment
- The organization currency name in *Moneda origen* comes from `Intl.DisplayNames` (no action used here serves the AD currency name).
- The design's *Imprimir* toolbar button is not offered: the page is not a `ListView` and has no printable list.
- Dates are always `dd/MM/yyyy HH:mm` (story ETP-6365), whatever the UI locale.

## Manual verification
1. Open `/conversion-rates` from **Finanzas**: the menu, the title and the breadcrumb read *Conversión de divisas*.
2. *Vigentes hoy* shows one card per currency with a rate in force, in one row that scrolls sideways; USD/GBP say *Automática*, the others *Manual* with *+ Nueva tasa*.
3. *Histórico*: change each filter and confirm the request carries the matching criteria (`toCurrency`, `validFromDate` bounds, `sMFCRSynced`, `etgoRateStatus`) and that only `currency = EUR` rows are listed.
4. A synced row closed at `00:00` shows `23:59` of that day; an open range shows «—».
5. *Nueva divisa*: only currencies without rates are offered; the summary lists the two rates; *Crear divisa* adds the card and the group.
6. *+ Nueva tasa* on a manual currency: the summary says which range is closed and when; after creating, the old row shows its new end and the new one is *Vigente*.
7. Hover a manual, unlocked row: Modificar / Eliminar appear; a synced or locked row shows none. Edit the rate; delete a *No usado* row.
8. An overlapping start date shows the server's message in the error box.

## Automated evidence
- `artifacts/conversion-rates/decisions.json` — `layoutType: "custom"`, `readOnly: false`, `etgoRateStatus` / `etgoUsedInAccounting` exposed read-only, `currency` / `divideRateBy` / `validToDate` / `organization` / `conversionRateType` read-only or hidden.
- `tools/app-shell/src/windows/custom/conversion-rates/` — `ConversionRatesPage.jsx` (page, filters in the URL, dialogs), `CurrentRatesSection.jsx`, `RateHistorySection.jsx`, `ManualRateDialog.jsx`, `ConversionRateBadges.jsx`, `conversionRatesApi.js` (requests), `conversionRatesModel.js` (pure helpers: wall clock, display rule, period bounds, criteria, grouping).
- `tools/app-shell/src/components/contract-ui/ListModalRowActions.jsx` — shared hover buttons.
- Backend: `com.etendoerp.go` (actions `currentRates`, `manualCurrencyOptions`, `previewManualRate`, the write validation and the status columns); `com.smf.currency.conversionrate` owns the downloader.

## Public API — read-only `conversion-rates` — ETP-6174

The public API publishes the window as `GET`/`LIST` only (`/api/v1/conversion-rates`), declared with
`publicApi.readOnly: true` on `entities.header` in `decisions.json` (the entry renamed to the
contract entity `conversionRate`; the manifest generator finds it by that name). ETP-6365 keeps it
read-only although the window itself now writes. The window's category (`finance`) is excluded by
default; the window is published because it is listed in the generator's V1 allowlist. Every field
is read-only (`out`); a write answers `404`.

The entity is curated (`publicApi.exposed: true`) on `currency`, `toCurrency`, `validFromDate`,
`validToDate`, `multipleRateBy` and `divideRateBy`, so the downloader's `sMFCRSynced` flag and the
ETP-6365 status columns stay out of the public API.

`multipleRateBy` and `divideRateBy` declare `"type": "number"` in `decisions.json`, and the public
API publishes them as `number`/`double`, the type NEO answers. The override was added while AD
reference 800019 (Rate) was not mapped by the core extractor; core 0.3.110 now maps that reference to
`decimal` (see the ETP-6342 section below), so the override is redundant. Removing it is a follow-up,
together with the generator test that pins it.
Contract: `docs/public-api.md` §3.

## Rate and cost fields are numeric — ETP-6342

Schema Forge core 0.3.110 maps AD reference `800019` (General Quantity: rates and costs) to `decimal` instead of the `string` fallback. **Multiple Rate By** (`multipleRateBy`, `MultiplyRate`) and **Divide Rate By** (`divideRateBy`, `DivideRate`) are `decimal` in the contract (`tsType: number`). While the ETP-6174 `"type": "number"` override on both fields is in place, the contract keeps them as `number`; the public API type is `number`/`double` either way.
