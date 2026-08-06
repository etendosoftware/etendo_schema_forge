# Fiscal Models

## Intent

Use this window to manage Spanish tax declarations (modelos fiscales) — creating, tracking, and filing periodic returns such as Modelo 303 (quarterly VAT) and Modelo 349 (intra-community operations). It combines a declaration list with per-model detail pages that guide the user through a status lifecycle ending in submission.

The window fetches declarations from the NEO Headless fiscal API and auto-computes fiscal boxes in the background by polling for invoice changes.

## Theme roles

The declaration list, detail pages, filters, KPI cards and overlays consume the
shared semantic theme. Structural UI uses shared surface and control roles;
calculation, validation and filing outcomes use success, warning, information,
neutral and destructive roles. Generated PDF output and the developer debug
panel remain outside this UI-theme scope because they preserve document and
debug contracts.

## What this window should allow

- Fetch all declarations from `GET /fiscal303/declarations` and keep status changes in sync via `PUT /fiscal303/declarations?id=`.
- Auto-compute fiscal boxes for Modelo 303 draft declarations in the background every 3 minutes, updating the result column in the list without user interaction.
- Display an upcoming deadlines panel for unsubmitted declarations.
- Filter declarations by model type (303, 349) and status.
- Navigate into a per-model detail page when a declaration row is clicked, passing precomputed box data so the detail page renders immediately without a duplicate fetch.
- In detail pages, guide the user through the submission lifecycle via a numbered stepper.
- Generate and download the submission file (`.txt`) for Modelo 303.
- Show blocking and warning incident counts inline; a blocking count prevents file generation.

## Auto-compute architecture (`useFiscalAutoCompute`)

```
FmListPage
  └── useFiscalAutoCompute(decls, { computeFn, checkModifiedFn, token, apiBaseUrl, pollIntervalMs=180_000 })
        ├── On mount: calls computeFn for every decl in parallel
        │     result → computedMap[decl.id] = { boxes, summary, error, computedAt }
        │     null result → { boxes: null, summary: null, error: 'compute_failed', computedAt }  ← not "computing"
        └── Polling (every 3 min): calls checkModifiedFn per decl
              if modified → calls computeFn and updates computedMap
```

- `computeFn` = `computeBoxes303(decl, { token, apiBaseUrl })` → `GET /fiscal303/boxes?year=&period=`
- `checkModifiedFn` = `checkModified303(decl, sinceMs, { token, apiBaseUrl })` → `GET /fiscal303/modified?year=&period=&since=`
- `computedAtRef` tracks the last **successful** compute timestamp per declaration to bound the `since` query parameter. It is intentionally not updated on errors, so `sinceMs` stays at the last success and any subsequent invoice change still triggers a retry.
- Precomputed data (`decl._precomputed`) is seeded from `computedMap` when a row is opened, so the detail page loads instantly.

## Status lifecycle

```
Modelo 303:
(new) → draft → ready → submitted
                        ↘ submitted_ext
                        ↘ submitted_ack
          ↓
        skipped  (can be set from any non-submitted state)

Modelo 349:
(new) → pending → draft → ready → submitted
```

| Status | Color | Meaning |
|--------|-------|---------|
| `pending` | orange | Pending — initial state for Modelo 349 before drafting begins |
| `draft` | blue | Draft — boxes may still be computing |
| `ready` | green | Ready — review complete, file can be generated |
| `submitted` | teal | Filed via the standard channel |
| `submitted_ext` | violet | Filed via an alternative channel |
| `submitted_ack` | emerald | Filed with receipt acknowledgement |
| `skipped` | grey | Intentionally skipped |

Status transitions are driven by `StatusPillMenu` inline in the list and by the detail page action buttons.

## Modelo 303 detail page (`FmModel303Page`)

### Stepper

Three steps (0-based index):

| Step | Index | Status |
|------|-------|--------|
| Draft | 0 | `draft` |
| Ready | 1 | `ready` |
| Submitted | 2 | `submitted*` |

(`skipped` uses index `-1` — no step is highlighted.)

### Tabs

| Tab | Content |
|-----|---------|
| Boxes | `FmBoxes303` — grid of fiscal box values |
| Sources | Invoice rows that feed the boxes, filterable by incidents |
| Files | Generated `.txt` file download |
| Incidents | Blocking and warning validation messages |

### Identification section (`tipo_declaracion` + bank data)

The top of the Boxes tab shows the declaration type selector and, conditionally, the bank data section (`datos_bancarios`).

**`tipo_declaracion` options:** `C` (Complementaria), `D` (Devolución), `I` (Ingreso), `U` (Cuota cero), `N` (Sin resultado), `V` (Domiciliación — IVA), `X` (Domiciliación — extranjero).

**`datos_bancarios` visibility** (`sectionVisibleWhen`): shown when `tipo_declaracion ∈ {D, G, I, V, X, U}`. Hidden for `N` and `C`.

**Section title** varies by tipo:
- `D` → "Devolución"
- `G`, `I`, `V`, `U` → "Domiciliación"
- `X` → "Domiciliación (extranjero)"

**SWIFT/BIC field** is only shown when `tipo ∈ {D, V, X}`.

### Live data

When in real mode, `FmModel303Page` reads `liveBoxes` / `liveSummary` from the `_precomputed` field passed at navigation. The compute button triggers a fresh `computeBoxes303` call. File generation calls `generate303File(decl, { token, apiBaseUrl })` → `GET /fiscal303/generate?year=&period=&tipo=`.

### Organization identity

A `GET /session` call on mount populates the NIF/nombre fields used in the generated `.txt` header when `token` and `apiBaseUrl` are provided.

## Modelo 349 detail page (`FmModel349Page`)

Full intra-EU recapitulative declaration view. Auto-compute runs via `useFiscalAutoCompute` (same hook as 303) using `compute349Operators` / `checkModified349`.

### Operator keys

| Key | Direction | Tax category |
|-----|-----------|--------------|
| `E` | Sales — Goods (Entregas) | Intra-EU supplies |
| `S` | Sales — Services (Servicios prestados) | Services supplied to EU |
| `A` | Purchase — Goods (Adquisiciones) | Intra-EU acquisitions |
| `I` | Purchase — Services (Inv. Sujeto Pasivo) | Reverse-charge services |

### Tabs

- **Operadores** — operator table with key filter chips and live name/NIF-IVA search. Null `name`/`nif` fields are guarded (`?? ''`) before case-folding to avoid runtime crashes.
- **Facturas origen** — source invoice drill-down. Clicking an operator's origin link pre-filters by NIF-IVA. Filter state shows `fm.m349.invoices.filtering_by` + count badge.
- **Rectificaciones / Incidencias / Ficheros / Historial** — coming soon.

### KPIs

Four cards (Operadores, Total operaciones, Rectificaciones, Pendientes VIES) sourced from `_precomputed.operators`.

### PDF preview and file generation

- `use349Pdf` hook renders a Modelo 349 draft PDF via Handlebars + `renderPdf`. Declarant NIF and org name are read from `_precomputed.orgNif` / `_precomputed.orgName`. The object URL is revoked on unmount to avoid memory leaks.
- File generation (`generate349File`) prompts for contact name and phone via `FileGenModal` before calling `POST /fiscal349/generate`. Contact/phone are sent in the request body to avoid PII in server logs.

### Result in list view

349 declarations show total intracomm volume (`totalE + totalS + totalA + totalI`) with `kind: 'info'` — no "a ingresar / a compensar" label, since 349 is informational only.

### Polling propagation

`FiscalModelsPage` keeps `FmListPage` mounted (hidden) while in a detail view so the auto-compute polling interval stays alive. When polling fires, `onComputeUpdate` propagates the updated `_precomputed` to `FmModel349Page` via a `useEffect` on `decl._precomputed`.

## List page toolbar (`FmListPage`)

`FmListPage` no longer has a row-level "3 dots" kebab menu at all — the `RowKebab` component, its `DEMO_DECLARATIONS` fixture data, the `showConfig` state, and the `ConfigDrawer` render/import were all removed from this file. The toolbar's visible actions are, in order: the year/model/status `FilterDropdown` filters, the search and sort icon buttons, the **"Catálogo de modelos (N)"** button (`N = activeCount`), and — only when `activeCount > 0` — **"+ Nueva declaración"**.

This is scoped to the list page's own toolbar. `ConfigDrawer` as a component still exists (in `FmOverlays.jsx`) and remains in active use elsewhere: the Modelo-303 detail page's own separate 3-dot menu (Comparar / Configuración / Generar — see `models/303/FmModel303Page.jsx`) still opens it, and the model catalog described below is a full drawer of its own (`FmCatalogPage`), unrelated to `ConfigDrawer`. No config/demo functionality was removed from the app as a whole — only the redundant row-kebab entry point on the declarations list.

## Model catalog (`FmCatalogPage`)

The catalog drawer is opened from the toolbar button described above — **"Catálogo de modelos (N)"**. It reuses `fm.catalog.title` for its label and calls `setShowCatalog(true)` inline on click. It uses the `fm-toolbar__btn` (non-`--primary`) style so it reads as a secondary action next to "+ Nueva declaración".

The catalog drawer lists the tax forms the tenant can enable/disable. It currently exposes only the two supported forms — no locked/"coming soon" entries:

| Model | Name | Periodicity tags | Description |
|-------|------|-------------------|--------------|
| `303` | Modelo 303 - Autoliquidación IVA | Trimestral + Mensual | Autoliquidación del IVA |
| `349` | Modelo 349 — Operaciones intracomunitarias | Mensual + Trimestral | Declaración informativa de operaciones con empresas de la Unión Europea |

Each catalog entry declares a `periodicities: string[]` array (not a single `periodicity` string) — `FmCatalogPage` renders one `.fm-catalog-card__pill` per value, reusing the existing `fm.catalog.periodicity.monthly/quarterly/annual` locale keys. The header's model-count badge (`CATALOG.length`) and the "active models" counter are always derived from the `CATALOG` array, never hardcoded.

Toggling a model on/off in the drawer updates the `activeModels` map (`{ [modelId]: boolean }`) that `FmListPage` owns and persists via `onSave`. That same map is threaded down to `NewDeclModal` (see below) so the "new declaration" flow only ever offers models the tenant actually activated.

### "Nueva declaración" respects the active catalog

`NewDeclModal` (in `FmOverlays.jsx`) receives an `activeModels` prop from `FmListPage` and builds its model `<select>` from `Object.keys(activeModels).filter(id => activeModels[id])` instead of a hardcoded `303`/`349` option list. If the previously-selected default (`303`) is not active, the modal falls back to the first available active model. If **no** model is active, the select and the "Crear" button are disabled and the modal shows `fm.new_decl.no_active_models` instead of leaving an empty, non-functional dropdown. Callers that don't pass `activeModels` (e.g. older tests) keep the legacy behavior of offering both `303` and `349`.

This in-modal guard is now **defense in depth**: `FmListPage`'s "+ Nueva declaración" toolbar button only renders when `activeCount > 0` (see below), so in practice `NewDeclModal` should never open with zero active models. It stays in place in case the toolbar is customized further or the modal is reused elsewhere.

### No active models — hides the CTA and shows a dedicated empty state

`FmListPage` derives `activeCount = Object.values(activeModels).filter(Boolean).length` and uses it for two UX guards:

- **"+ Nueva declaración" toolbar button is not rendered at all** (not just disabled) when `activeCount === 0` — there is nothing productive to create until a model is enabled.
- **Table region shows a dedicated empty state** — `EmptyState` with only `title = fm.list.empty_no_active_models` ("No tienen modelos activos, configure desde el Catálogo de modelos."). It no longer renders a `cta` button: the always-visible "Catálogo de modelos (N)" toolbar button (see above) already covers that action, so a second, redundant "open catalog" entry point inside the empty state was removed. The `fm.list.empty_no_active_models_cta` locale key still exists in `en_US.json`/`es_ES.json` — it is simply unused in source now. This message takes priority over the generic `fm.list.empty` state even when `filtered` still holds stale rows from before all models were deactivated — the check is `activeCount === 0`, evaluated before `filtered.length === 0`.

### Active catalog gates the declarations list, not just the create flow

`activeModels` (the catalog's per-model enabled/disabled map) now filters what the list shows, not only what "Nueva declaración" offers:

- `activeDecls = decls.filter(d => activeModels[d.model])` is computed first, before any user-facing filter (model/year/status).
- `modelYearFiltered` — and therefore `filtered`, the row table, and `KpiCardsRow` — derives from `activeDecls`, not the raw `decls` array.
- `modelOptions` (the "Todos los modelos" filter dropdown) is filtered to `.filter(opt => activeModels[opt.value])`, so a deactivated model's option disappears from the dropdown along with its declarations.

Practical effect: deactivating a model in the catalog immediately hides all of its existing declarations from the list and KPI cards, and removes it from the model filter — nothing is deleted, and reactivating the model in the catalog makes its declarations reappear.

## Key files

| File | Role |
|------|------|
| `FiscalModelsPage.jsx` | Root — routes between list and per-model detail |
| `FmListPage.jsx` | Declaration table, toolbar, auto-compute wiring |
| `FmCatalogPage.jsx` | Model catalog drawer — enable/disable tax forms, drives `activeModels` |
| `useFiscalAutoCompute.js` | Background compute + polling hook |
| `fiscalModelsUtils.js` | `computeBoxes303`, `checkModified303`, `generate303File`, formatters, deadline logic |
| `models/303/FmModel303Page.jsx` | Modelo 303 detail — boxes, sources, stepper, file gen |
| `models/303/FmBoxes303.jsx` | Box grid renderer |
| `models/303/fm303Layouts.js` | Box layout definition (sections, rows, labels) |
| `models/349/FmModel349Page.jsx` | Modelo 349 detail |
| `FmCommon.jsx` | Shared components: `NumberedStepper`, `ResultPill`, `StatusPillMenu`, `SummaryCard` |
| `FmOverlays.jsx` | Modals and drawers: `PresentModal`, `FileGenModal`, `NewDeclModal`, `ConfigDrawer`, `CompareDrawer` |
| `FmDebugPanel.jsx` | Developer panel (keystroke-activated) for testing with fixture data |

## NEO Headless endpoints

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/fiscal303/declarations` | FmListPage — fetch all declarations |
| `PUT` | `/fiscal303/declarations?id=` | FmListPage — persist status change |
| `GET` | `/fiscal303/boxes?year=&period=` | `computeBoxes303` |
| `GET` | `/fiscal303/modified?year=&period=&since=` | `checkModified303` |
| `GET` | `/fiscal303/generate?year=&period=&tipo=` | `generate303File` |
| `GET` | `/session` | FmModel303Page — org NIF/nombre for file header |
| `GET` | `/fiscal349/operators?year=&period=` | `compute349Operators` — returns operators + invoices + orgNif/orgName |
| `GET` | `/fiscal349/modified?year=&period=&since=` | `checkModified349` |
| `POST` | `/fiscal349/generate` (body: year, period, phone, contact) | `generate349File` |

All query parameters are built with `URLSearchParams` to ensure correct encoding.
