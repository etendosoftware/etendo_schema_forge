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
history grouped by currency and filtered by currency, period, origin and status; print it; add a
first manual rate for an active currency with no rates ("Nueva divisa"); add a new manual rate that
closes the one in force ("Nueva tasa"); edit or delete any manual rate.

`decisions.json` sets `window.readOnly: false`, so `make regen … PUSH_TO_NEO=1` writes
`ISPOST/ISPUT/ISPATCH/ISDELETE = Y` on `ETGO_SF_ENTITY` (REST and MCP can write). The **public API
stays read-only** (`entities.header.publicApi.readOnly: true` is kept): opening it to writes is a
separate decision.

## Interaction model
- **Route:** `/conversion-rates` and `/conversion-rates/:recordId` (unchanged). Both render the same page; there is no drill-in detail since the redesign.
- **Menu:** **Finance** group in `tools/app-shell/src/menu.json` (`windowId: "116"`, label `Currency Conversion`, translated through the `menus` / `windows` entries of the locale files). Breadcrumb *Finanzas / Conversión de divisas*.
- **Implementation type:** custom window — `layoutType: "custom"` in `artifacts/conversion-rates/decisions.json`; code in `tools/app-shell/src/windows/custom/conversion-rates/`, registered in `customLoaders` (`windows/registry.js`), which wins over the generated loader. The pipeline never overwrites these files (a regeneration writes `index.jsx.new` next to them at most).
- **Toolbar:** Filtros (shows / hides the history filters), Copiar enlace (the filters live in the URL: `currency`, `period`, `from`, `to`, `origin`, `status`, `all`), Ordenar (orders the rows inside each currency group by valid from, valid to or rate), Actualizar (reloads cards and history), **Imprimir** and the primary **Nueva divisa**.
- **Imprimir:** the app's list print drawer (`contract-ui/ReportDrawer.jsx`: preview, PDF, Excel, CSV, the organization's list-print design) — the same one `ListView` opens. The page passes it the rows to print (`rows` prop, ETP-6365) instead of letting it read every record of the entity, because the history is a filtered, forward-only, grouped view: every rate matching the current filters (not only the 3 most recent), with Moneda, Origen, Válido desde, Válido hasta, `1 EUR =`, `1 [moneda] = EUR` and Estado, and the active filters in the header.
- **Vigentes hoy:** one card per currency in ONE horizontally scrolling row (scroll-snap). Each card: symbol, ISO, name, origin badge, `1 EUR = <rate> <ISO>` (forward rate only). Automatic cards end with *Automática por defecto · descargada hoy a las HH:mm* (or *… descargada el dd/MM/yyyy a las HH:mm* when the last download, `lastDownloadAt`, was not today); manual cards end with *Vigente desde dd/MM/yyyy HH:mm · sin fecha de fin* and a **+ Nueva tasa** link. Data: action `currentRates`.
- **Histórico:** filters Moneda (Todas + the currencies with a rate in force), Periodo (Últimos 30 días — default —, Este mes, Este año, Personalizado… with two date fields), Origen (Todos / Automática / Manual), Estado (Todos / Vigente / Histórico). Rows are grouped by currency in collapsible groups; the group header shows symbol, ISO, name, origin, *Vigente: 1 EUR = X ISO*, *· N tasas* and, for a manual currency, **+ Nueva tasa**. Columns: Válido desde (fecha y hora), Válido hasta (fecha y hora), `1 EUR =` (rate + currency symbol), `1 [moneda] = EUR` (`divideRateBy` + €), Estado (badge), Acciones. The table scrolls vertically under a sticky header row. Each group shows its 3 most recent rates; **Ver todas** shows every rate (*Ver solo las 3 más recientes* goes back). A legend explains the states and the hover actions, worded as the design.
- **Row actions:** hovering **any manual** row (`sMFCRSynced = false`), whatever its state, shows **Modificar** (pencil, *Modificar tasa*) and **Eliminar** (trash, *Eliminar tasa*) — the shared `ListModalRowActions` hover buttons (`contract-ui/ListModalRowActions.jsx`, the payment-term ones). Automatic rows show none. Modificar opens the *Modificar tasa* dialog; Eliminar asks for confirmation (`DeleteConfirmDialog` with this window's own impersonal title and question: *Eliminar tasa* / *Se eliminará la tasa de CHF desde … en los dos sentidos. Esta acción no se puede deshacer.*, plus the note on deleting the rate in force) and DELETEs the row — the server removes both directions.

## States
`etgoRateStatus`, served by `com.etendoerp.go`, is a real, filterable column with two values:
- `CURRENT` → **Vigente**: the rate that rules now (its range contains the current date and time);
- `HISTORIC` → **Histórico**: a rate that no longer rules.

The former lock (`etgoUsedInAccounting`) is gone: editing or deleting a rate never touches documents already posted (see *Edit rules*).

## Dialogs
- **Nueva divisa** (*Manual* badge): Moneda origen = organization currency, read-only (`EUR · Euro`); Moneda destino = action `manualCurrencyOptions {withoutRates: true}` (active currencies with no rates; never USD/GBP); Tasa `1 EUR = [X] ARS`; Válido desde (date + time). Summary *Se añadirá ARS como divisa manual con dos tasas* plus the two lines from `previewManualRate`. Buttons Cancelar / Crear divisa.
- **Nueva tasa · CHF:** destination fixed; *Tasa vigente: 1 EUR = 0,9420 CHF desde …* (from `currentRates`); Tasa; Válido desde with *Por defecto, ahora. Puede cambiarlo.*; summary *Se crearán dos tasas*, the two lines and *La tasa vigente de CHF (desde …) se cerrará el … a las HH:mm en los dos sentidos.* (from the preview's `closes`). Buttons Cancelar / Crear tasa.
- **Modificar tasa · CHF** (*Manual* badge): origin and destination read-only; the row's own range under them (*Tasa vigente desde … · sin fecha de fin* for an open range, *Tasa desde … · hasta …* for a closed one); Tasa and Válido desde editable; summary *Se actualizarán las dos tasas* with `EUR → CHF · old → new` and `CHF → EUR · old → new` (the new inverse is `1 / new rate`, display only — the server stores the real one); the amber note *El cambio solo afecta a las facturas nuevas con fecha contable dentro de este periodo. Las facturas ya contabilizadas conservan la tasa con la que se registraron.*; button **Guardar cambios**. PATCH sends only the changed fields.
- **Validation:** Tasa (> 0) and Válido desde (valid date and time, **not later than now**) are required: the confirm button stays disabled and the field shows its error until both are valid. The create preview is requested again (debounced, 350 ms) whenever an input changes; a preview `error` is shown in the error box and blocks the confirm button. A refused write (400 / 409 / 422, including the server's no-future refusal) shows the server's translated `error.message` as is. Enter confirms (the dialog is a form), Esc and the corner X close, the tab order follows the fields. On success the dialog closes and both the cards and the history reload.
- **"Now" comes from the server.** Each dialog reads action `serverClock` (`{now: "yyyy-MM-ddTHH:mm:00"}`, same action URL as the others) when it opens: that minute is the default of Válido desde for a new rate and the upper bound of every start (aged by the time the dialog has stayed open). The browser clock is only the placeholder until the answer arrives, or the fallback when the action cannot be read — the server refuses a future start anyway.

## Edit rules
- Every manual rate can be edited or deleted, current or historic. Automatic (USD/GBP) rates cannot.
- A start can never be later than now: a rate is never created or moved into the future (server-enforced, mirrored in the dialog).
- Editing a rate only affects documents posted afterwards with an accounting date in that range; documents already posted keep the rate they were recorded with.
- Deleting the rate in force leaves the currency without a rate from that date.

## Reactive behavior and dependencies
- **Server-owned rules (`com.etendoerp.go`).** The server creates the inverse rate, closes the previous open range at `start − 1 minute` in both directions, refuses overlapping ranges (`ETGO_ConvRateOverlap`, 409), refuses a future start and refuses any write on a synced rate. PATCH only accepts `multipleRateBy` and `validFromDate` (anything else → 400). The UI shows the preview and the messages; it only mirrors the required/positive/no-future checks.
- **Forward rows only.** The history lists only the rows whose `currency` is the organization currency (criteria `currency = <org currency id>`). The inverse rows exist but are never listed; the inverse value of a period is the forward row's `divideRateBy`.
- **Period filter = ranges in force during the period.** Criteria `validFromDate < periodEnd AND validToDate >= periodStart`, so a range that started before the period and is still open (`9999-12-31`) is listed. A day is `[D 00:00, D+1 00:00)`; *Últimos 30 días* is today and the 29 days before it.
- **Datetimes are server-local wall clock.** NEO answers `validFromDate` / `validToDate` as `yyyy-MM-ddTHH:mm:ss` with no offset (NeoDateFormat, ETP-5100). The page reads and writes them as text (`conversionRatesModel.js`), never through `new Date(string)`, shows them as `dd/MM/yyyy HH:mm` and sends `validFromDate` as `yyyy-MM-ddTHH:mm:00`.
- **Open range.** A `validToDate` in year 2999 or later (the open range, `9999-12-31`) is shown as «—» (*sin fecha de fin*).
- **Display rule for automatic daily ranges.** The downloader stores each daily range closing at `00:00` of the same day (`17/11/2026 00:00 → 17/11/2026 00:00`). For a synced row whose `validToDate` is at `00:00` on or after its `validFromDate` day, the page shows that day at `23:59` (`17/11/2026 23:59`). Manual ranges are shown as stored (`18/11/2026 14:29`).
- **Numbers.** Rates are shown with 4 decimals through `formatGroupedNumber` (instance separators); the rate is typed in the shared `MaskedAmountInput` (ungrouped, instance decimal separator) and parsed with `parseLocaleNumber`.
- **Downstream consumer:** these records are read at invoice completion by `InvoiceExchangeRateValidator.checkRateForCompletion()` (`com.etendoerp.go`) through the AD general-rate lookup. A missing rate for the needed pair is what triggers the `SMFCR_NoRateOnComplete` block on the invoice windows.
- **Residual: documents without a stored rate.** Documents that do not store their own rate are resolved by core at posting with its midnight rule (the range open at 00:00 of the accounting date): standalone payments, financial account movements, manual GL journals, invoices generated from shipments/returns, and costing. On the day a timed range is created (e.g. 14:30), those documents still use the range that was open at 00:00 that day.

## Shared components behind each control
| Control | Shared component |
|---|---|
| History filters Moneda / Periodo / Origen / Estado | `DistinctValuesFilter` (app-shell-core, the list filter of Not Posted Documents; opens on the committed value) |
| Custom period from / to, dialog date | `DateField` |
| Dialog time | shared `Input` with `type="time"` — the app has no time or datetime field component |
| Moneda destino (Nueva divisa) | `CreatableSearchSelect` with `staticOptions` (`value` + `displayValue`) |
| Rate | `MaskedAmountInput` (`bare`, `grouping={false}`), as the payment modal's conversion rate |
| Read-only origin / destination | shared `Input` (`readOnly`, `disabled`) inside `Field` |
| Dialogs | `Dialog` / `DialogContent`; delete: `DeleteConfirmDialog` (`title` / `message` overrides) |
| Badges | `StatusTag` (tones `info` / `warning` / `success` / `neutral`) |
| Buttons and links | `Button` (`outline`, `ghost`, `link`, default), `RefreshButton`, `ListSortPopover` |
| Row hover actions | `ListModalRowActions` |
| Print | `ReportDrawer` (`rows` prop) |
| Toasts | `sonner` `toast` |

Not shared (no generic equivalent exists): the square currency-symbol chip, the "Vigentes hoy" card and the group-header toggle row of the history table.

## Gap assessment
- The organization currency name in *Moneda origen* comes from `Intl.DisplayNames` (no action used here serves the AD currency name).
- Dates are always `dd/MM/yyyy HH:mm` (story ETP-6365), whatever the UI locale.
- Válido desde is a date field plus a time input: the app has no combined datetime field.

## Manual verification
1. Open `/conversion-rates` from **Finanzas**: the menu, the title and the breadcrumb read *Conversión de divisas*.
2. *Vigentes hoy* shows one card per currency with a rate in force, in one row that scrolls sideways; USD/GBP say *Automática*, the others *Manual* with *+ Nueva tasa*.
3. *Histórico*: change each filter and confirm the request carries the matching criteria (`toCurrency`, `validFromDate <` end and `validToDate >=` start, `sMFCRSynced`, `etgoRateStatus`) and that only `currency = EUR` rows are listed; an open manual rate started before the period is listed.
4. A synced row closed at `00:00` shows `23:59` of that day; an open range shows «—».
5. *Nueva divisa*: only currencies without rates are offered; Válido desde starts at the server's minute; a start later than now is refused in the field; *Crear divisa* adds the card and the group.
6. *+ Nueva tasa* on a manual currency: the summary says which range is closed and when; after creating, the old row shows its new end and the new one is *Vigente*.
7. Hover any manual row (Vigente or Histórico): Modificar / Eliminar appear; an automatic row shows none. Edit the rate (summary old → new, amber note, *Guardar cambios*); delete a row (impersonal confirmation).
8. An overlapping start date shows the server's message in the error box.
9. *Imprimir*: the preview lists the filtered history with the filters in the header; PDF / Excel / CSV export the same rows.

## Automated evidence
- `artifacts/conversion-rates/decisions.json` — `layoutType: "custom"`, `readOnly: false`, `etgoRateStatus` exposed read-only, `currency` / `divideRateBy` / `validToDate` / `organization` / `conversionRateType` read-only or hidden.
- `tools/app-shell/src/windows/custom/conversion-rates/` — `ConversionRatesPage.jsx` (page, filters in the URL, print, dialogs), `CurrentRatesSection.jsx`, `RateHistorySection.jsx`, `ManualRateDialog.jsx`, `ConversionRateBadges.jsx`, `conversionRatesApi.js` (requests), `conversionRatesModel.js` (pure helpers: wall clock, display rule, period bounds, criteria, grouping, no-future check).
- Shared: `contract-ui/ListModalRowActions.jsx`, `ReportDrawer.jsx` (`rows`), `DeleteConfirmDialog.jsx` (`title` / `message`).
- Backend: `com.etendoerp.go` (actions `currentRates`, `manualCurrencyOptions`, `previewManualRate`, `serverClock`, the write validation and `etgoRateStatus`); `com.smf.currency.conversionrate` owns the downloader.

## Public API — read-only `conversion-rates` — ETP-6174

The public API publishes the window as `GET`/`LIST` only (`/api/v1/conversion-rates`), declared with
`publicApi.readOnly: true` on `entities.header` in `decisions.json` (the entry renamed to the
contract entity `conversionRate`; the manifest generator finds it by that name). ETP-6365 keeps it
read-only although the window itself now writes. The window's category (`finance`) is excluded by
default; the window is published because it is listed in the generator's V1 allowlist. Every field
is read-only (`out`); a write answers `404`.

The entity is curated (`publicApi.exposed: true`) on `currency`, `toCurrency`, `validFromDate`,
`validToDate`, `multipleRateBy` and `divideRateBy`, so the downloader's `sMFCRSynced` flag and the
ETP-6365 status column stay out of the public API.

`multipleRateBy` and `divideRateBy` declare `"type": "number"` in `decisions.json`, and the public
API publishes them as `number`/`double`, the type NEO answers. The override was added while AD
reference 800019 (Rate) was not mapped by the core extractor; core 0.3.110 now maps that reference to
`decimal` (see the ETP-6342 section below), so the override is redundant. Removing it is a follow-up,
together with the generator test that pins it.
Contract: `docs/public-api.md` §3.

## Rate and cost fields are numeric — ETP-6342

Schema Forge core 0.3.110 maps AD reference `800019` (General Quantity: rates and costs) to `decimal` instead of the `string` fallback. **Multiple Rate By** (`multipleRateBy`, `MultiplyRate`) and **Divide Rate By** (`divideRateBy`, `DivideRate`) are `decimal` in the contract (`tsType: number`). While the ETP-6174 `"type": "number"` override on both fields is in place, the contract keeps them as `number`; the public API type is `number`/`double` either way.
