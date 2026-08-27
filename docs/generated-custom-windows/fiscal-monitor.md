# Fiscal Monitor

## Intent

Use this window to observe the real-time submission status of electronic invoices for an organization. It adapts to the active fiscal profile (SII, TBAI, SII+TBAI, or Verifactu) and surfaces the invoices that require attention — errors, rejections, and partial acceptances — alongside aggregate KPI counts fetched from NEO Headless.

The window is read-only. It does not create or modify invoice records; it only displays the status reported by AEAT or Hacienda Foral after submission.

## Theme roles

The monitor cards, tabs, filters and contact/error dialogs consume the shared
semantic theme. Structural roles control surfaces and input chrome, while
submission outcomes use success, warning, information, neutral and destructive
roles. The developer debug panel remains outside this UI-theme scope.

## What this window should allow

- Detect the active fiscal profile for the current organization and render only the relevant section(s).
- Display KPI cards (aggregate counts per status category) at the top of each section, each clickable to jump directly to the matching table tab.
- Show paginated invoice rows per status tab, with error codes and reasons inline when present.
- Synchronize tab state bidirectionally: clicking a KPI card activates the matching tab; clicking a section tab highlights the matching KPI card.
- Show skeleton loading states while data is being fetched and clear error messages on failure.
- Provide a developer debug panel (activated via keystroke sequence) for testing all profiles and layouts with mock data.

## Profile-based rendering

`useFiscalMonitor` runs the same `detectProfile` logic as `useFiscalConfig` — reading the three config entities from NEO — then renders sections conditionally:

| Profile | Sections rendered |
|---------|-------------------|
| `sii` | SII section only |
| `sii-navarra` | SII section only |
| `sii+tbai` | SII section + TBAI section (with a divider between them) |
| `tbai` | TBAI section only |
| `verifactu` | Verifactu section only |
| `unconfigured` | Empty state with setup call-to-action |
| `conflict` | Conflict warning only |

## Data architecture

```
useFiscalMonitor(orgId, apiBaseUrl)
  ├── detectProfile()           ← fetches 3 config records in parallel
  ├── fetchSiiMonitorData()     ← 4 parallel fetchCount calls (emitidas, recibidas, × 2 periods)
  ├── fetchTbaiData()           ← 5 parallel calls (total + 4 per-estado criteria filters: Recibido, Rechazado, Error, Pendiente)
  └── fetchVerifactuMonitorData() ← 4 parallel fetchCount calls (1 per status entity)
        ↓
  computeKpis(profile, monitorData) → kpis object
        ↓
  FiscalKpiCards (static display + click → tab navigation)
  SiiMonitorSection / TbaiMonitorSection / VerifactuMonitorSection (paginated tables)
```

Each section component fetches its own paginated rows independently, on tab/page/filter change.

## SII section (`SiiMonitorSection`)

**Tabs:** Emitidas | Recibidas (with upload/download icon)

**Period toggle:** Periodo actual | Periodo anterior (segmented control, right side of tab bar)

The tab × period combination maps to one of 4 NEO entities:

| Tab | Period | Entity |
|-----|--------|--------|
| Emitidas | Actual | `issuedInvoices` |
| Emitidas | Anterior | `issuedInvoices(previousPeriod)` |
| Recibidas | Actual | `receivedInvoices` |
| Recibidas | Anterior | `receivedInvoices(previousPeriod)` |

All entities live under spec `sii-monitor`. Pagination: 20 rows per page.

**Status filter row** (second row, below the tabs): Todas | Aceptado (CO) | Aceptado con errores (AE) | Con errores | Pendiente (PE)

The "Con errores" tab is a composite filter covering both `IN` (Rechazado) and `EE` (Error). For the real API it sends `operator: "inSet", value: ["IN","EE"]`; for mock data it filters both codes client-side. All other tabs send `operator: "equals"` with the single code.

**Columns:** Date · Invoice number · Cliente/Proveedor · Type (`aeatsiiClaveTipo` / `aeatsiiClaveTipoFc`) · Total · Status pill · Error reason · CSV AEAT

The Cliente/Proveedor column renders `businessPartnerIdentifier ?? businessPartner` — the Etendo FK identifier field when present, falling back to the raw FK id.

**Error reason** is a dedicated table column (header `fiscalMonitor.col.errorReason`), positioned right after Status — the same structural pattern `VerifactuMonitorSection` uses for its own "Error reason" column (see below). It renders `[errorCode] errorMessage` in red when present, or a dash (`—`) when the row has no error — always visible, never conditional on row status. This replaces the pre-ETP-4784-fix behavior where the reason was inline text painted below the status pill inside the Status cell.

#### Header-empty fallback to `*SiiData.motivo` (ETP-4784 correction #2)

`C_Invoice.EM_Aeatsii_Error_Msg` (the `aeatsiiErrorMsg` header field) can be **empty for an "Error" (EE) invoice** even though the related sub-tab data does carry the real reason. Each subtab already fetches its `*SiiData` sibling entity in parallel (`issuedInvoicesSiiData`, `receivedInvoicesSiiData`, `issuedInvoices(previousPeriod)SiiData`, `receivedInvoices(previousPeriod)SiiData` — used to resolve the CSV AEAT column's `cdigoCSV`); `fetchSubtab()` now also builds an invoice → `motivo` lookup from that same response via `pickMostRecentMotivo()` (`fiscalMonitor.utils.js`).

Resolution order for the "Motivo error" column, per row:
1. `row.aeatsiiErrorMsg` (header) if non-empty — used as-is, `*SiiData.motivo` is ignored.
2. Otherwise, the **most recent** `motivo` from `*SiiData` for that invoice (an invoice can have 2+ rows across resends). Recency is `fechaltimaModificacinSII` (`Fecha_Ultima_Modif_Sii`), falling back to the generic `updated`/`created` audit columns when that field is blank — all three are lexically-sortable strings, so this is a plain string comparison, never a `Date` parse.
3. Otherwise, a dash (`—`), same as before.

The error **code** (`aeatsiiErrorCode`) still comes only from the header — `*SiiData` has no equivalent code field.

TBAI does **not** need this fallback: its error reason already comes exclusively from the `resultadoValidación` join (see below), never from a header field that can be silently empty.

#### CSV export replicates the same fallback (ETP-4784 correction #3)

`handleExport()`/`fetchCsvAndDownload()` re-fetches the invoice list independently of the
on-screen state — it needs the **full** dataset for the active tab/period, not just the pages
already paginated into `rows`/`motivoMap`, so it cannot simply reuse the on-screen `motivoMap`.
Reusing it would silently export an empty Error cell for any invoice not yet scrolled into view.

Instead, `handleExport()` performs the same second fetch `fetchSubtab()` does: it queries the
tab's `*SiiData` sibling entity (`SUBTAB_SII_DATA_ENTITIES[entityKey]`, scoped by `organization`,
`_startRow`/`_endRow` covering the full range) and rebuilds a dedicated `exportMotivoMap` via the
same `pickMostRecentMotivo()` helper. The CSV column builder — `buildSiiExportCols(motivoMap)`
(replaces the old static `SII_EXPORT_COLS` array) — applies the identical resolution order as the
on-screen column: `row.aeatsiiErrorMsg || motivoMap[row.id] || ''`. If the SiiData re-fetch fails,
export proceeds with the header-only Error column rather than failing the whole export.

**KPI sync:** `onTabChange` callback encodes the combined key (`'emitidas'`, `'emitidas-anterior'`, `'recibidas'`, `'recibidas-anterior'`) and bubbles up to `FiscalMonitorPage`, which passes it back as `activeKey` to `FiscalKpiCards`.

#### Fallback gated by the invoice's CURRENT status (ETP-4784 correction #4)

**Bug:** `*SiiData` (`aeatsii_facturas`) keeps a full **history** of send attempts for an invoice, not just the latest one. The correction #2/#3 fallback (`row.aeatsiiErrorMsg || motivoMap[row.id]`) applied unconditionally whenever the header field was empty — so a purchase invoice that failed at some point (e.g. "La factura de compra debe contener información en el campo Referencia del proveedor."), was later corrected, and is now `CO` (Aceptado), kept showing that stale historical motivo forever, because the `*SiiData` row(s) for that invoice still carry it and the header field is typically empty for accepted invoices too.

**Fix — two layers:**
1. **Primary gate (both `SiiTableContent` and `buildSiiExportCols`):** the header message AND the `motivoMap` fallback are now only consulted when `isErrorStatus(row.aeatsiiEstado)` is true for the invoice's **current** status (`IN`/`EE`/`AE`). A `CO`/`PE`/`AN`/`BA`/`NR` invoice always renders/exports a dash, regardless of what its `*SiiData` history contains. `isErrorStatus` is the same shared predicate from `FmPrimitives.jsx` already used for the status pill's click behavior — no new status set was introduced.
2. **Defense-in-depth (`pickMostRecentMotivo()` in `fiscalMonitor.utils.js`):** each `*SiiData` row also carries its own `estadoRegistro` (the outcome of *that* specific send attempt — same enum as the header: `CO`/`AE`/`IN`/`PE`/`EE`/`AN`/`BA`/`NR`). A row whose own `estadoRegistro` is not an error status is now skipped as a `motivo` source. This guards the case where AEAT/Etendo Go reuses a single `aeatsii_facturas` row across resends — flipping `estadoRegistro` back to `CO` on success while leaving the stale `motivo` text from the previous failed attempt untouched in that same row. Rows that omit `estadoRegistro` (older payload shapes) are treated as unknown and still considered, for backward compatibility.

**Why both layers:** the header-status gate (#1) is the primary, sufficient fix for the reported case — it makes the column correct regardless of how `*SiiData` structures its history. Layer #2 is an additional safety net at the data-shaping level: without it, `pickMostRecentMotivo()` could still hand a currently-erroring invoice the wrong motivo if its most-recent-by-timestamp `*SiiData` row happens to be a stale/reused successful row sitting ahead of an older still-relevant error row. Neither layer alone was judged sufficient in isolation — #1 protects the UI meaning ("don't show a motivo for a non-error invoice"), #2 protects the map's data quality ("don't let a non-error row's text into the map at all").

Real-world repro (used for the regression tests): purchase invoice 10000009, Facturas recibidas, `*SiiData` motivo history mentioning "Referencia del proveedor", current status Aceptado (`CO`) — verified to render/export a dash, not the historical motivo.

This same invoice was re-checked manually against the running app (`localhost:3100`, real org data, no mocks) after correction #4 landed: the "Motivo error" column and the CSV export both showed a dash for invoice 10000009 instead of the stale "Referencia del proveedor" text. Corrections #1–#3 (dedicated column layout, header-empty fallback, CSV export parity) were verified the same way in the same manual pass. This manual confirmation is in addition to, not a replacement for, the automated tests listed under "Automated evidence" below.

## TBAI section (`TbaiMonitorSection`)

**Filter tabs:** Todas | Enviadas (Recibido) | Rechazadas | Con error | Pendientes

Status is server-filtered via a `criteria` JSON parameter on the NEO request (`fieldName: estado, operator: equals, value: <status>`). The "Todas" tab omits the criteria parameter.

Entity: `sincronización` under spec `tbai-facturas-enviadas`.

**Columns:** Date · Invoice number · Description · Signature (check icon when `estado === 'Recibido'`) · Status pill · Error reason

The Invoice number column renders `invoiceIdentifier ?? invoice` — the Etendo FK identifier field when present, falling back to the raw FK id.

KPI card "Con error / Rechazadas" aggregates both `rechazado` and `error` counts.

### Error reason (ETP-4784)

`TbaiMonitorSection` renders error reasons in a **dedicated "Error reason" table column**
(header `fiscalMonitor.col.errorReason`, last column, right after Status) — the same
structural pattern `VerifactuMonitorSection` uses for its own "Error reason" column: a
real `<th>`/`<td>` pair, always visible (present even when there are 0 rows or the row
has no error, showing a dash `—`), not text painted conditionally below the status pill.
An earlier version of this fix (and `SiiMonitorSection`, before the same correction) used
inline text under the pill instead — see "Same layout for all three monitors" below for
why that was wrong. There's no per-invoice error field on `sincronización` itself; the
reason comes from a separate entity:

- **Entity:** `resultadoValidación` (table `Tbai_Valcode`), same spec `tbai-facturas-enviadas`.
- **Fields:** `codigo` + `descripcion`.
- **Join key:** `resultadoValidación.tbaiSyncinvoiceID` → `sincronización` row `id`
  (both are `Tbai_Syncinvoice_ID`). A `sincronización` row can have **0..N** validation
  results — all are joined into the single cell with ` | ` when more than one applies.

`useFiscalMonitor.js` fetches the full `resultadoValidación` set for the org (up to
9999 rows, `_startRow`/`_endRow`, mirroring the `csvMap` pattern in `SiiMonitorSection`)
in parallel with the existing TBAI count fetches, and exposes it as
`tbaiValidationResults` in the hook's return value. `FiscalMonitorPage` threads it down
to `TbaiMonitorSection` as the `validationResults` prop (both the standalone `tbai` and
the `sii+tbai` combined render sites). `TbaiMonitorSection` builds a
`tbaiSyncinvoiceID → [{codigo, descripcion}]` map with `buildValidationMap` (memoized
via `useMemo`) and looks up `validationMap[row.id]` to render the column cell (empty
lookup renders the dash — in practice this is populated only for `Rechazado`/`Error`
rows, since only those ever get a validation result). The CSV export
(`buildTbaiExportCols(validationMap)`) joins the same map into an "Error Reason" column,
`[codigo] descripcion` entries joined with ` | ` — unchanged by this layout fix, since the
export was already column-shaped.

No `decisions.json` or contract changes were needed — `resultadoValidación` was already
published in NEO (`ETGO_SF_ENTITY.isget=Y`, GET-only, no `java_qualifier`).

### Same layout for all three monitors (ETP-4784 follow-up)

The first pass at this ticket gave `TbaiMonitorSection` the same inline-text-under-the-pill
pattern that `SiiMonitorSection` already used, reasoning that "SII already shows the data,
so matching SII is enough." Comparing screenshots against `VerifactuMonitorSection` in the
real app showed that judgment was wrong: Verifactu has always rendered its "Motivo error"
as a **dedicated table column** with its own header, visible even for error-free rows
(empty-dash cell) — not conditional text bolted under the status pill. The ticket
("de la misma forma que ya se hace para Verifactu") meant the column layout specifically,
not just "the data is present somewhere in the row." Both `SiiMonitorSection` and
`TbaiMonitorSection` were refactored in the same change to use the column layout, matching
Verifactu's header label, empty-cell style (`—`, `var(--fm-fg-3)` when empty,
`var(--fm-danger-fg)` when populated, `fontSize: 12`, `maxWidth: 280`) and colSpan
bookkeeping on the empty-state row.

**Remaining structural differences vs. Verifactu (not fixed, noted for future reference):**
column *position* is not identical across all three — Verifactu's Error reason is the very
last column; SII's sits between Status and CSV AEAT (CSV stays last, matching its
pre-existing position); TBAI's is the last column. These positions were chosen to keep
Status → Error reason adjacent (mirroring Verifactu's adjacency) without reordering
pre-existing columns (CSV AEAT) that other code/tests may depend on being last. If a
future design pass wants byte-for-byte identical column order across all three monitors,
that's a separate follow-up, not implied by this ticket's "same visual pattern" ask.

Debug/mock mode: `MOCK_TBAI_VALIDATION_RESULTS` in `fiscalMonitorMockData.js` provides
matching mock reasons for `MOCK_TBAI_ROWS` (`t4`, `t6`, `t8` — `t8` carries two reasons
to exercise the 0..N render path). `FiscalMonitorPage`'s `useDebugState` swaps in this
mock array when the debug panel's mock-data toggle is on.

**Coverage of the ticket's three error states:** `Rechazada` and `No enviada` (failed
send) both map to TBAI's `Rechazado`/`Error` statuses, covered above. `Parcialmente
aceptada` has no TBAI equivalent — it is a VERI\*FACTU-only concept, already covered by
`VerifactuMonitorSection`'s "Error reason" column. SII already showed its own error
reason (`aeatsiiErrorCode`/`aeatsiiErrorMsg`) for all three of its own error states
(`IN` Rechazada, `EE` No enviada, `AE` Parcialmente aceptada) before this change — no
gap found there.

## Verifactu section (`VerifactuMonitorSection`)

**Status tabs:** Aceptadas | Parcialmente aceptadas | Rechazadas | Inválidas

Each tab maps to a dedicated NEO entity under spec `monitor-verifactu`:

| Tab | Entity |
|-----|--------|
| Aceptadas | `facturasAceptadas` |
| Parcialmente aceptadas | `facturasParcialmenteAceptadas` |
| Rechazadas | `facturasRechazadas` |
| Inválidas | `facturasInválidas` |

**Columns:** Invoice number · Issuer NIF · Type · CSV AEAT · Status pill · Error reason (`[codeError] errorReason`)

### Error resolution (`VfSolveErrorModal`)

Clicking the resolve button on a selected `IN` (Inválida) or `AE` (Parcialmente aceptada) row opens
`VfSolveErrorModal.jsx`, which resolves the two Verifactu error states through **two different backend
paths** — each depends on the underlying AD_Column type:

| Row status | Frontend call | Underlying column | Backend handler | Sets |
|---|---|---|---|---|
| `IN` (Inválida) | `POST .../facturasInválidas/{id}/action/Correct_Invoice` | Button (AD_Reference `28`), linked to OBUIAPP process `com.etendoerp.verifactu.process.CorrectedInvoice` | `CorrectInvoiceHandler` (`correct-invoice-handler`) | `em_etvfac_corrected_inv = 'Y'` |
| `AE` (Parcialmente aceptada) | `PUT .../facturasParcialmenteAceptadas/{id}` body `{isSubsanation:true}` | Plain YesNo checkbox | `MarkSubsanationHandler` (`mark-subsanation-handler`) | `em_etvfac_issubsanation = 'Y'` |

Both entities are backed by the **view** `etvfac_inv_sent_status_v` (`ISVIEW=Y`), so a default-CRUD PUT
against them returns `200` but silently writes nothing — this is why both actions need a dedicated
`NeoHandler` wired via `ETGO_SF_ENTITY.JAVA_QUALIFIER`, instead of relying on NEO's generic CRUD/action
bridge. `Correct_Invoice` additionally requires a **dedicated** handler (not the generic
`NeoButtonActionHelper` OBUIAPP bridge) because the generic path enforces an `OBUIAPP_Process_Access`
grant that was never configured for this process — `CorrectInvoiceHandler` bypasses that check the same
way `SiiSendHandler`/`TbaiXmlgeneratorHandler` do for their own legacy buttons.

**Gotcha (do not repeat):** the `JAVA_QUALIFIER` on `ETGO_SF_ENTITY` is a database value, not just an
XML sourcedata value. Hand-editing `ETGO_SF_ENTITY.xml` and running `./gradlew export.database` does
**nothing** for this — `export.database` reads DB → XML, not the other way around. To wire a new entity
handler you MUST: (1) declare `entities.<name>.javaQualifier` in `artifacts/monitor-verifactu/decisions.json`,
(2) run `node cli/src/resolve-curated.js --window monitor-verifactu --write` to refresh `contract.json`,
(3) run `node cli/src/push-to-neo.js monitor-verifactu` to write it to the live DB, then (4) run
`./gradlew export.database` in Etendo root to sync the XML sourcedata back to match.

## Status-pill click routing

`StatusPill` in `FmPrimitives.jsx` supports three click modes:

| Row state | Click action | Title (tooltip) |
|-----------|-------------|-----------------|
| Error (`isErrorStatus`) | Opens `ContactDetailModal` for the invoice's business partner | `fiscalMonitor.viewContact` |
| Pending (`isPendingStatus`) | Opens `InvoicePreviewModal` for the invoice | `fiscalMonitor.openInvoice` |
| Any other status | Not clickable | — |

`isPendingStatus` matches `PE` (SII) and `Pendiente` (TBAI). The `StatusPill` component accepts an optional `title` prop that overrides the default tooltip — callers that want the `openInvoice` label pass it explicitly.

For SII rows, the spec hint (`'sales-invoice'` or `'purchase-invoice'`) is derived from the active tab (Emitidas → sales, Recibidas → purchase) so `handleInvoiceOpen` tries the correct spec first. For TBAI rows the hint is always `'sales-invoice'` because TBAI applies to sales invoices only.

## Certificate expiry banner (`CertExpiryBanner`)

`FiscalMonitorPage.jsx` renders `<CertExpiryBanner daysLeft={certDaysLeft} variant="subtle" />` immediately after the `OrgLead` header bar. The subtle variant is a thin strip (no icon card), less intrusive than the prominent variant used in fiscal-config.

`useCertExpiry.js` fetches cert status on mount and is shared between both fiscal pages. See the [fiscal-config](fiscal-config.md#certificate-expiry-banner-certexpirybanner) doc for threshold details and i18n keys.

Debug: the debug panel exposes a "Cert expiry" toggle (None / 45d warn / 20d crit) that bypasses the API call and injects a mock `daysLeft` directly.

## KPI cards (`FiscalKpiCards`)

Each system gets a row of clickable metric cards above its section. Clicking a card calls `onPick(key)` which sets the parent's `siiInitialTab` / `tbaiInitialFilter` / `veriInitialTab` state, which flows down as `initialTab`/`initialFilter` to the section, triggering a `useEffect` that syncs the section's internal state.

| Variant | Cards |
|---------|-------|
| `sii` | Emitidas (actual) · Emitidas (anterior) · Recibidas (actual) · Recibidas (anterior) |
| `tbai` | Total enviadas · Recibido · Con error/Rechazadas |
| `verifactu` | Aceptadas · Parcialmente aceptadas · Rechazadas · Inválidas |

## Debug mode

Typing the sequence `debugfiscal` anywhere in the app (any page) activates the debug panel. State persists in `localStorage` under key `etendo-debug-fiscal` and survives page refresh. Typing the sequence again deactivates it.

`useDebugMode.js` manages activation using a module-level key buffer and a `Set` of React listener functions. This ensures all mounted instances of the hook respond simultaneously without polling.

When active, `FiscalMonitorDebugPanel` appears as a fixed dark panel (top-right, z-index 9999):
- **Profile override buttons** — clicking a profile renders that system's UI even without real config records in the DB. Clicking the active profile again clears the override and falls back to real data.
- **Cert expiry toggle** — three buttons (None / 45d warn / 20d crit) that inject a mock `daysLeft` into `useCertExpiry`, bypassing the API call.
- **Mock data toggle** — when on, section components receive `mockRows` from `fiscalMonitorMockData.js` instead of fetching from NEO. KPI counts are computed from `MOCK_MONITOR_DATA` (counts match the actual mock row arrays).

`FiscalConfigDebugPanel` appears in the same position on `/fiscal-config` and allows deleting config records per system (SII, TBAI, Verifactu, certificate) for the current org — useful for resetting onboarding state during development.

## Mock data (`fiscalMonitorMockData.js`)

Three arrays with realistic Spanish invoice data:

| Export | System | Rows | Period |
|--------|--------|------|--------|
| `MOCK_SII_ROWS` | SII | 9 issued (April 2025) + 5 issued previous (March 2025) + 8 received (April 2025) + 4 received previous (March 2025) = 26 total | `_siiTab` field distinguishes the 4 variants; `aeatsiiEstado` uses 2-letter codes (CO/AE/IN/EE/PE) |
| `MOCK_TBAI_ROWS` | TBAI | 10 rows, May 2025 — 5 Recibido, 2 Rechazado, 1 Error, 2 Pendiente | `estado` field used for filtering; `invoice` = raw FK id, `invoiceIdentifier` = document number |
| `MOCK_VF_ROWS` | Verifactu | 8 rows — 4 aceptadas, 2 parcialmenteAceptadas, 1 rechazadas, 1 invalidas | `verifactuSendingStatus` field used for filtering |
| `MOCK_MONITOR_DATA` | All | KPI counts | Must always match the array lengths above |

## Refresh

Both `FiscalMonitorPage` and `FiscalConfigPage` expose a manual refresh control.

**FiscalMonitorPage:** The `OrgLead` bar replaces the static "Sincronizado" indicator with a `RefreshButton` component. When idle it shows a `RefreshCw` icon (Lucide). When loading the icon spins and the button is non-clickable. Clicking calls `refetch()` (re-loads profile + KPIs via `useFiscalMonitor`) and increments `refreshKey` — a counter passed as prop to all three section components. Each section adds `refreshKey` to its row-fetch `useEffect` dependency array, re-triggering the current tab/page/filter fetch without resetting those states.

**FiscalConfigPage:** A small `RefreshCw` icon button in the page header calls `refetch` from `useFiscalConfig`. No `refreshKey` propagation needed — section components re-render completely on `refetch`.

i18n key: `fiscalMonitor.refresh` → "Actualizar" / "Refresh".

## Fiscal Status in InvoicePreviewModal

`StatsPanel` (inside `InvoicePreviewModal`) renders per-system submission status rows directly below the document "Estado" row. Visibility is driven by `getInvoiceFiscalTargets(specName, profile)` — only rows where `showSii`/`showTbai`/`showVerifactu` is `true` are rendered.

Status is fetched by `useFiscalStatus(invoiceId, specName, profile, apiBaseUrl)` from `tools/app-shell/src/windows/custom/shared/useFiscalStatus.js`. It queries in parallel (via `Promise.all`) once per active system on mount:

| System | Spec | Entity | FK field | Status field |
|--------|------|--------|----------|--------------|
| SII | `sii-monitor` | `issuedInvoices` (then `receivedInvoices` fallback) | `aeatsiiInvoice` | `aeatsiiEstado` |
| TBAI | `tbai-facturas-enviadas` | `sincronización` | `invoice` | `estado` |
| Verifactu | `monitor-verifactu` | `facturasAceptadas` → `facturasParcialmenteAceptadas` → `facturasRechazadas` → `facturasInválidas` (first match) | `invoice` | `verifactuSendingStatus` — raw DB code (CO/AE/ER/IN/PE) is normalized through `VF_STATUS_MAP` to a StatusPill key (`accepted`/`partiallyAccepted`/`rejected`/`invalid`/`pending`) before rendering |

No match → pill shows `PE` (SII/Verifactu) or `Pendiente` (TBAI). While fetching, rows show a skeleton shimmer.

i18n keys: `invoicePreview.fiscalStatus.sii`, `invoicePreview.fiscalStatus.tbai`, `invoicePreview.fiscalStatus.verifactu`.

## Interaction model

- Route: `/fiscal-monitor` (custom window).
- Implementation type: `layoutType: "custom"` — loaded from `customLoaders` in `tools/app-shell/src/windows/registry.js`.
- Entry point: `FiscalMonitorPage.jsx` — fetches profile + KPIs, renders OrgLead header, delegates to section components.
- The page container uses `overflow-y: auto` so long multi-section views (e.g. `sii+tbai`) are scrollable within the fixed app shell container.

## Manual verification

1. Open `/fiscal-monitor` with an org that has no fiscal config — confirm the unconfigured empty state renders with the setup CTA buttons.
2. Open with an SII org — confirm one KPI row (4 cards) and the SII table appear. Switch between Emitidas/Recibidas tabs and verify the table reloads. Switch period and verify a different entity is queried.
3. Open with an SII+TBAI org — confirm both sections render. Scroll down and confirm the TBAI section is reachable. Verify the "Y también" divider appears between them.
4. Click an SII KPI card (e.g. "Emitidas · periodo anterior") — confirm the section tab and period toggle both update to match.
5. Click a section tab — confirm the corresponding KPI card becomes active (highlighted).
6. Type `debugfiscal` anywhere on the page — confirm the debug panel appears top-right. Select "SII+TBAI" and enable mock data — confirm both sections render with mock rows and the KPI counts match the row counts in each tab.
7. Switch tabs in each section under mock data — confirm the rows change (e.g. TBAI "Rechazadas" shows only 2 rows).
8. Refresh the page with debug mode active — confirm the panel persists (localStorage). Type `debugfiscal` again — confirm it disappears.
9. Open `/fiscal-config` with debug mode active — confirm `FiscalConfigDebugPanel` appears and delete buttons work.
10. In the debug panel, enable "45d warn" — confirm the amber subtle strip appears below the OrgLead bar. Enable "20d crit" — confirm it turns red and the dismiss button disappears.
11. Click a Pending (PE) status pill on an SII row — confirm `InvoicePreviewModal` opens. Click a Pending (Pendiente) status pill on a TBAI row — confirm the same modal opens for that invoice.
12. In the debug panel, select TBAI (or SII+TBAI) and enable mock data — confirm rows `t4` and `t8` (Rechazado) and `t6` (Error) show red text in the dedicated "Error reason" column, with `t8` showing both reasons joined by ` | `. Confirm accepted (`Recibido`) and pending rows show a dash (`—`) in that column, not empty/missing text.
13. Compare `SiiMonitorSection`, `TbaiMonitorSection` and `VerifactuMonitorSection` side by side — confirm all three now show "Error reason" (or "Motivo error") as its own table column with its own header, not text under the status pill.

## Automated evidence

- `artifacts/fiscal-monitor/decisions.json` — `layoutType: "custom"`, window registered.
- `tools/app-shell/src/windows/registry.js` — `fiscal-monitor` in `customLoaders` at `customLoaders['fiscal-monitor']`.
- `tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorPage.jsx` — profile-routing orchestrator; debug mode integration.
- `tools/app-shell/src/windows/custom/fiscal-monitor/useFiscalMonitor.js` — parallel config + monitor data fetcher; exports entity/spec constants for section components; fetches `resultadoValidación` (TBAI error reasons) in parallel with the TBAI count fetches, exposed as `tbaiValidationResults`.
- `tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitor.utils.js` — `buildMonitorFetchPlan`, `computeKpis`, `pickMostRecentMotivo` (pure functions, fully tested). `pickMostRecentMotivo` builds the invoice → most-recent-`motivo` lookup used by `SiiMonitorSection`'s "Motivo error" header-empty fallback (ETP-4784 correction #2 — see above); since correction #4, it also skips a `*SiiData` row as a motivo source when that row's own `estadoRegistro` is not an error status (see "Fallback gated by the invoice's CURRENT status" above).
- `tools/app-shell/src/windows/custom/fiscal-monitor/FiscalKpiCards.jsx` — clickable metric cards per system variant.
- `tools/app-shell/src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx` — emitidas/recibidas × actual/anterior; `onTabChange` callback with combined key; dedicated "Error reason" column (`aeatsiiErrorCode`/`aeatsiiErrorMsg`) between Status and CSV AEAT, same visual pattern as Verifactu's column (see "Same layout for all three monitors" above); `fetchSubtab()` also builds a `motivoMap` (invoice → most-recent `motivo`) from the already-fetched `*SiiData` response, used to fill the column when the header field is empty (see "Header-empty fallback" above). `handleExport()` re-fetches the `*SiiData` sibling entity independently and rebuilds an `exportMotivoMap` via `pickMostRecentMotivo()`, feeding `buildSiiExportCols(motivoMap)` — the CSV export's Error column applies the same fallback as the on-screen column (see "CSV export replicates the same fallback" above). Since correction #4, both the on-screen `errorMsg` and `buildSiiExportCols` gate the header/`motivoMap` fallback on `isErrorStatus(row.aeatsiiEstado)` — the invoice's CURRENT status — so a `*SiiData` history entry never resurfaces after the invoice moves out of an error state (see "Fallback gated by the invoice's CURRENT status" above).
- `tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx` — server-side criteria filter per status; `onFilterChange` callback; `buildValidationMap`/`validationResults` prop joins `resultadoValidación` error reasons onto a dedicated "Error reason" table column (see "Error reason (ETP-4784)" above); `buildTbaiExportCols` joins the same reasons into the CSV export.
- `tools/app-shell/src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx` — entity-per-status tab; `onTabChange` callback.
- `tools/app-shell/src/windows/custom/fiscal-monitor/fmtDateUtils.js` — pure `fmtDate` helper (no React deps); converts `YYYY-MM-DD` → `DD/MM/YYYY`, passes through already-formatted dates, returns `'—'` for falsy input. Importable in Node.js tests without any alias setup.
- `tools/app-shell/src/windows/custom/fiscal-monitor/FmPrimitives.jsx` — shared `StatusPill`, `NumFactura`, `Pager`, `RowActionBtn` primitives; `isPendingStatus`/`PENDING_STATUSES` and error-status helpers; re-exports `fmtDate` from `fmtDateUtils.js` and `PAGE_SIZE = 20`.
- `tools/app-shell/src/windows/custom/fiscal-monitor/useDebugMode.js` — module-level keystroke sequence listener; localStorage persistence; multi-instance sync via listener Set.
- `tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorDebugPanel.jsx` — profile override + cert expiry toggle + mock data toggle panel.
- `tools/app-shell/src/windows/custom/fiscal-config/useCertExpiry.js` — `daysUntil` pure helper (re-exported from `certExpiryUtils.js`) + `useCertExpiry` hook; shared by fiscal-config and fiscal-monitor pages. Sources auth via `useApiFetch` — no token prop needed. Resets `daysLeft` to `null` immediately before each new fetch and on unmount. Uses `AbortController` to cancel in-flight requests on unmount or deps change, preventing stale responses from resolving after the component is gone or the org has switched.
- `tools/app-shell/src/windows/custom/fiscal-config/CertExpiryBanner.jsx` — cert expiry warning strip/card; `variant="subtle"` used here, `variant="prominent"` in fiscal-config.
- `tools/app-shell/src/windows/custom/shared/SifSendingModal.jsx` — shared confirm/sending/results modal with simulated progress bar; used by `SendToSifButton` and `InvoicePreviewModal`.
- `tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigDebugPanel.jsx` — config record deletion panel (shared debug mode).
- `tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitorMockData.js` — realistic multi-system mock rows + matching KPI counts; `MOCK_TBAI_VALIDATION_RESULTS` — mock error reasons joined to `MOCK_TBAI_ROWS` by `tbaiSyncinvoiceID`.
- `tools/app-shell/src/windows/custom/fiscal-monitor/fiscal-monitor.css` — `.fm-*` design-system CSS; `overflow-y: auto` on `.fm-page` for scroll in fixed shell.
- `cli/test/fiscal-monitor.utils.test.js` — 18 tests covering `buildMonitorFetchPlan` and `computeKpis` for all profiles and edge cases.
- `cli/test/fiscal-monitor.mockdata.test.js` — mock data integrity tests: KPI counts match actual row arrays; all rows have required fields.
- `cli/test/useFiscalMonitor.test.js` — 22 tests covering source guards (named export, Promise.all × ≥2, computeKpis/detectProfile wiring, entity constant exports), `get` helper (URL encoding, `useApiFetch` usage instead of manual Authorization headers, response parsing, error handling), `fetchCount` (totalRows extraction, zero fallback), `fetchSiiMonitorData` (4 parallel calls, correct entity names), `fetchVerifactuMonitorData` (4 parallel calls), and `fetchTbaiData` (5 calls: total + Recibido + Rechazado + Error + Pendiente, criteria filter with `estado` fieldName).
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/FiscalKpiCards.test.js` — 16 component source-guard tests: SII/TBAI/Verifactu variants, `activeKey` active-class logic, `onPick` callback dispatch, `de-DE` number formatting.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.test.js` — component source-guard tests: tab/period state, `initialTab` derivation, `mockRows` bypass, data fetching, pending-pill → `onInvoiceOpen` wiring, CSV export wiring. Correction #4 adds source-guard assertions that both the exported and on-screen `errorMsg`/Error-column expressions are gated by `isErrorStatus(...aeatsiiEstado)`.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.errorReason.vitest.jsx` — render tests for the ETP-4784 correction #2 fallback: header `aeatsiiErrorMsg` wins over SiiData `motivo` when present; falls back to SiiData `motivo` when the header is empty and there is one row; picks the most-recent `motivo` when there are 2+ SiiData rows for the invoice; shows a dash when the header is empty and there are no SiiData rows. Correction #4 adds: hides the SiiData motivo when the invoice's CURRENT status is Aceptado/`CO` (the reported purchase-invoice-10000009 repro), and confirms the fallback still shows when the current status IS an error (`EE`). `isErrorStatus` is mocked with real IN/EE/AE matching (no longer a stub returning `false`) so the new gate is actually exercised.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/fiscalMonitor.utils.vitest.js` — `pickMostRecentMotivo` tests: single row, most-recent-by-date across 2+ rows, `updated`/`created` fallback when `fechaltimaModificacinSII` is blank (mirrors the real ETP-4784 sample), no-invoice-FK skip, null/undefined/empty input, multi-invoice isolation. Correction #4 adds: skips a row whose own `estadoRegistro` is not an error status (`CO`); still picks a row whose `estadoRegistro` IS an error status; picks the most-recent ERROR row while skipping a later successful (`CO`) row for the same invoice; treats a missing `estadoRegistro` as unknown (back-compat).
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.export.errorReason.vitest.jsx` — ETP-4784 correction #3: exercises `handleExport()` end to end (real `fetchCsvAndDownload`/`buildCsvAndDownload`, mocked `apiFetch`) and asserts the downloaded CSV blob contains the SiiData `motivo` when the header `aeatsiiErrorMsg` is empty, and prefers the header message over `motivo` when both are present. Correction #4 adds: excludes the SiiData motivo from the export when the invoice's CURRENT status is Aceptado (`CO`); `isErrorStatus` is now real (`vi.importActual`), not stubbed to `false`, since the export gate depends on it.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.test.js` — expanded with pending-pill → `onInvoiceOpen` wiring tests (TBAI sales-only); `buildValidationMap`/`buildTbaiExportCols` source guards for the error-reason join; dedicated Error Reason column source guards (header key, `join(' | ')`, empty-cell dash).
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.errorReason.vitest.jsx` — 6 render tests: dash in the Error Reason column for accepted rows, `[codigo] descripcion` for a single reason, all N reasons joined for a multi-reason row, dash for an error row with no matching result, the reason renders in its own `<td>` separate from the status-pill cell, no crash when `validationResults` is undefined.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/FiscalMonitorPage.tbaiValidation.vitest.jsx` — verifies `FiscalMonitorPage` threads `tbaiValidationResults` from `useFiscalMonitor` to `TbaiMonitorSection`'s `validationResults` prop (standalone `tbai` profile).
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/fiscalMonitorMockData.test.js` — `MOCK_TBAI_VALIDATION_RESULTS` integrity: every `tbaiSyncinvoiceID` resolves to an existing `MOCK_TBAI_ROWS` row in `Rechazado`/`Error` state, every entry has `codigo`+`descripcion`, at least one row has >1 result.
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/fmtDateUtils.test.js` — 12 tests: exports guard, null/falsy → `'—'`, ISO→DD/MM/YYYY conversion, already-formatted pass-through, invalid/non-date inputs. Imports `fmtDate` from the real module (no local copy).
- `tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/FmPrimitives.test.js` — 41 source-guard tests: `isErrorStatus` (SII/TBAI/Verifactu/edge), `isPendingStatus`/`PENDING_STATUSES` export + status coverage, `StatusPill` onClick/title-prop guards, `fmtDate` re-export guard (matches `export.*fmtDate`), `PAGE_SIZE`, `WipBadge` i18n keys.
- `tools/app-shell/src/windows/custom/shared/__tests__/SifSendingModal.test.js` — 22 component source-guard tests: props contract (no `headers` — auth via `useApiFetch`), three-phase state machine, progress bar formula/cap/snap, `callProcess` action columns, results display, `onAfterSend` callback.
- `e2e/tests/flows/fiscal-monitor.mocked.spec.js` — 13 Playwright mocked E2E tests: no-org, unconfigured, SII/TBAI/Verifactu/combined/conflict profiles, KPI card → tab sync, period toggle; all assertions use `t()` i18n helper.
- i18n: 40+ `fiscalMonitor.*` keys in `en_US.json` / `es_ES.json`; all user-visible strings go through `useUI()`. E2E tests resolved via `e2e/tests/helpers/i18n.js` (locale-switchable).
