# Conversion Rates

## Intent
Maintain the general currency conversion rates the system uses when a document currency differs from the organization's base currency. Each record defines, for a `Currency → To Currency` pair over a validity window, the multiply rate and its inverse divide rate. These are the same rates the invoice completion guard (ETP-4030) looks up before allowing a foreign-currency invoice to be completed — see `purchase-invoice.md` and `sales-invoice.md`.

Rates can originate from historical manual maintenance or from the conversion-rate downloader job (`com.smf.currency.conversionrate`). Auto-downloaded rates are flagged **Synced**. The audit trail for downloader runs lives in the companion window — see `conversion-rate-downloader-log.md`.

## What this window should allow
The window is view-only. Users should be able to:

- list the conversion rates of each currency pair (Currency, To Currency) with their validity dates
- review the multiply rate and the divide rate of a pair for a validity window

The window also shows whether a rate was downloaded automatically (**Synced**); the public API does
not publish that flag.

ETP-4474 added `window.readOnly: true`; ETP-4254 applies that existing declaration consistently to
the API as well as the React UI. Create and Delete are hidden, and DetailView blocks edit and save.
`ETGO_SF_ENTITY` exposes only `ISGET=Y` + `ISGETBYID=Y` (POST/PUT/PATCH/DELETE are `N`), and a
rejected CRUD write returns `405 "<METHOD> not enabled for conversionRate"` to both the React app
and MCP agents. These implementation facts are prose, not bullets, on purpose: the public API
manifest publishes the bullets of this section as the `conversion-rates` capabilities.

The generated fields still carry the older `readOnlyLogic: "@sMFCRSynced@='Y'"` cascade, but the window-wide lock supersedes it. If manual maintenance becomes a requirement again, remove `window.readOnly` in `decisions.json` and re-evaluate the per-record lock; never hand-edit the contract. See [`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md).

## Interaction model
- **Route:** `/conversion-rates` and `/conversion-rates/:recordId`.
- **Visibility:** visible from the **Finance** group in `tools/app-shell/src/menu.json` (`windowId: "116"`). Fiscal Monitor and Fiscal Models, which used to sit next to it, moved to the **Taxes** (Impuestos) group in ETP-6380.
- **Implementation type:** generated window loaded through `tools/app-shell/src/windows/registry.js`; `category: finance`.
- **Window shape:** single-entity window (`conversionRate`) with no child entities and no declared process endpoints in the generated index.
- **List columns:** Currency, To Currency, Valid From Date, Valid To Date, Multiple Rate By, Divide Rate By, and Synced.
- **Form sections:** the `principal` section holds Currency, To Currency, Valid From/To, and the read-only Synced flag; Multiple Rate By and Divide Rate By sit in the `other` section.

## Reactive behavior and dependencies
- **Synced lock:** the generated fields retain the `sMFCRSynced`-driven read-only cascade, but it is currently redundant because the whole window is read-only. There is no automatic computation of the divide rate from the multiply rate (or vice versa) in the generated form.
- **Currency defaults:** Currency and To Currency retain their base-currency defaults in metadata. They would apply if creation is re-enabled in the future; the current window-wide lock hides Create.
- **Downstream consumer:** these records are read at invoice completion by `InvoiceExchangeRateValidator.checkRateForCompletion()` (`com.etendoerp.go`) through the AD general-rate lookup. A missing rate for the needed pair is what triggers the `SMFCR_NoRateOnComplete` block on the invoice windows.

## Gap assessment
- The window displays the rate definition, but the business rules around overlapping validity windows are enforced outside this view.
- `Multiple Rate By` and `Divide Rate By` are stored independently; this view does not verify that one is the reciprocal of the other.
- The `Synced` flag is populated by the downloader job; there is no in-window action to unlock or re-sync a record because that lifecycle belongs to `com.smf.currency.conversionrate`.

## Manual verification
1. Open `/conversion-rates` from the **Finance** menu group and confirm the list loads with the Currency / To Currency / validity / rate columns and the Synced column.
2. Open a record and confirm the form displays the values but blocks editing and saving.
3. Confirm the list does not offer Create and the detail view does not offer Delete.
4. Attempt POST/PUT/PATCH/DELETE through NEO and confirm each returns `405 "<METHOD> not enabled for conversionRate"`.
5. Confirm a foreign-currency invoice can still read an existing matching rate during completion; the view-only restriction must not affect downstream lookup.

## Automated evidence
- `artifacts/conversion-rates/decisions.json` declares the `conversionRate` header entity, marks `sMFCRSynced` as `readOnly`, and sets `readOnlyLogic: "@sMFCRSynced@='Y'"` on every editable field.
- `artifacts/conversion-rates/generated/web/conversion-rates/ConversionRateForm.jsx` defines the seven visible fields, the base-currency `@SQL` defaults for Currency/To Currency, and the `record['sMFCRSynced'] === true` read-only cascade.
- `artifacts/conversion-rates/generated/web/conversion-rates/ConversionRateTable.jsx` and `index.jsx` confirm the list columns, the `finance` category, and the standalone generated layout.
- `tools/app-shell/src/menu.json` places the window in the Finance group with `windowId: "116"`.
- Backend: `com.etendoerp.go` `InvoiceExchangeRateValidator` consumes these rates at completion; `com.smf.currency.conversionrate` owns the downloader that writes `Synced` records and the `conversion-rate-downloader-log` audit rows.

## Public API — read-only `conversion-rates` — ETP-6174

The public API publishes the window as `GET`/`LIST` only (`/api/v1/conversion-rates`), declared with
`publicApi.readOnly: true` on `entities.header` in `decisions.json` (the entry renamed to the
contract entity `conversionRate`; the manifest generator finds it by that name). The window's
category (`finance`) is excluded by default; the window is published because it is listed in the
generator's V1 allowlist. Every field is read-only (`out`); a write answers `404`, as NEO itself
refuses one with `405`.

The entity is curated (`publicApi.exposed: true`) on `currency`, `toCurrency`, `validFromDate`,
`validToDate`, `multipleRateBy` and `divideRateBy`, so the downloader's `sMFCRSynced` flag stays out
of the public API while the window keeps showing it (and keeps using it in `readOnlyLogic`).

`multipleRateBy` and `divideRateBy` declare `"type": "number"` in `decisions.json`, and the public
API publishes them as `number`/`double`, the type NEO answers (the default CRUD serializes the
`BigDecimal` as is). The override was added while AD reference 800019 (Rate) was not mapped by the
core extractor, which extracted the fields as `string`. Core 0.3.110 now maps that reference to
`decimal` (see the ETP-6342 section below), which the manifest generator also maps to
`number`/`double`, so the override is redundant. Removing it is a follow-up, together with the
generator test that pins it. Same override as `sales-invoice` `exchangeRates.rate`. Regenerated
with `make regen-check FROM_CACHE=1` (contract `0.7.0`).
Contract: `docs/public-api.md` §3.

## Rate and cost fields are numeric — ETP-6342

Schema Forge core 0.3.110 maps AD reference `800019` (General Quantity: rates and costs) to `decimal` instead of the `string` fallback. **Multiple Rate By** (`multipleRateBy`, `MultiplyRate`) and **Divide Rate By** (`divideRateBy`, `DivideRate`) are now `decimal` in the contract (`tsType: number`): the form renders them as number inputs and the list as numeric columns, without the former 22-character `maxLength`. While the ETP-6174 `"type": "number"` override on both fields is in place (see the section above), the contract keeps them as `number` with `validation.maxLength: 22`; the public API type is `number`/`double` either way.
