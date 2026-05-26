# Fiscal Models

## Intent

Use this window to manage Spanish tax declarations (modelos fiscales) — creating, tracking, and filing periodic returns such as Modelo 303 (quarterly VAT) and Modelo 349 (intra-community operations). It combines a declaration list with per-model detail pages that guide the user through a status lifecycle ending in submission.

The window supports two data modes: **demo** (read-only mock data for exploration) and **real** (live declarations fetched from the NEO Headless fiscal API). In real mode, fiscal boxes are auto-computed in the background by polling for invoice changes.

## What this window should allow

- Switch between demo and real data modes via a toolbar toggle; mode persists in `sessionStorage` across navigation.
- In real mode, fetch all declarations from `GET /fiscal303/declarations` and keep status changes in sync via `PATCH /fiscal303/declarations?id=`.
- Auto-compute fiscal boxes for Modelo 303 draft declarations in the background every 3 minutes, updating the result column in the list without user interaction.
- Display an upcoming deadlines panel for unsubmitted declarations.
- Filter declarations by model type (303, 349) and status.
- Navigate into a per-model detail page when a declaration row is clicked, passing precomputed box data so the detail page renders immediately without a duplicate fetch.
- In detail pages, guide the user through the submission lifecycle via a numbered stepper.
- Generate and download the submission file (`.txt`) for Modelo 303.
- Show blocking and warning incident counts inline; a blocking count prevents file generation.

## Data modes

| Mode | Source | Auto-compute | Status writes |
|------|--------|--------------|---------------|
| `demo` | `MOCK_DECLARATIONS` constant in `FmListPage.jsx` | Disabled | Local state only |
| `real` | `GET /fiscal303/declarations` (NEO Headless) | Enabled for 303 borrador | `PATCH /fiscal303/declarations?id=` |

The toggle renders as `Demo` / `Real` pill in the toolbar. The selected mode is stored in `sessionStorage` under key `fm-data-mode` so it survives page navigation within the session.

## Auto-compute architecture (`useFiscalAutoCompute`)

```
FmListPage
  └── useFiscalAutoCompute(decls, { computeFn, checkModifiedFn, token, apiBaseUrl, pollIntervalMs=180_000 })
        ├── On mount: calls computeFn for every decl in parallel
        │     result → computedMap[decl.id] = { boxes, summary, error, computedAt }
        │     null result → { boxes: null, summary: null, error: null, computedAt }  ← not "computing"
        └── Polling (every 3 min): calls checkModifiedFn per decl
              if modified → calls computeFn and updates computedMap
```

- `computeFn` = `computeBoxes303(decl, { token, apiBaseUrl })` → `GET /fiscal303/boxes?year=&period=`
- `checkModifiedFn` = `checkModified303(decl, sinceMs, { token, apiBaseUrl })` → `GET /fiscal303/modified?year=&period=&since=`
- `computedAtRef` tracks the last successful (or errored) compute timestamp per declaration to bound the `since` query parameter.
- The hook is disabled (`enabled=false`) in demo mode.
- Precomputed data (`decl._precomputed`) is seeded from `computedMap` when a row is opened, so the detail page loads instantly.

## Status lifecycle

```
(new) → borrador → listo → presentado
                         ↘ presentadoOtra
                         ↘ presentadoAcuse
         ↓
       omitido  (can be set from any non-submitted state)
```

| Status | Color | Meaning |
|--------|-------|---------|
| `borrador` | blue | Draft — boxes may still be computing |
| `listo` | green | Ready — review complete, file can be generated |
| `presentado` | teal | Filed via the standard channel |
| `presentadoOtra` | violet | Filed via an alternative channel |
| `presentadoAcuse` | emerald | Filed with receipt acknowledgement |
| `omitido` | grey | Intentionally skipped |

Status transitions are driven by `StatusPillMenu` inline in the list and by the detail page action buttons.

## Modelo 303 detail page (`FmModel303Page`)

### Stepper

Three steps (0-based index):

| Step | Index | Status |
|------|-------|--------|
| Borrador | 0 | `borrador` |
| Listo | 1 | `listo` |
| Presentado | 2 | `presentado*` |

(`omitido` uses index `-1` — no step is highlighted.)

### Tabs

| Tab | Content |
|-----|---------|
| Boxes | `FmBoxes303` — grid of fiscal box values |
| Sources | Invoice rows that feed the boxes, filterable by incidents |
| Files | Generated `.txt` file download |
| Incidents | Blocking and warning validation messages |

### Live data

When in real mode, `FmModel303Page` reads `liveBoxes` / `liveSummary` from the `_precomputed` field passed at navigation. The compute button triggers a fresh `computeBoxes303` call. File generation calls `generate303File(decl, { token, apiBaseUrl })` → `GET /fiscal303/generate?year=&period=&tipo=`.

### Organization identity

A `GET /session` call on mount populates the NIF/nombre fields used in the generated `.txt` header when `token` and `apiBaseUrl` are provided.

## Modelo 349 detail page (`FmModel349Page`)

Uses a 4-step stepper including `pendiente` (index 0). The 349 page is structurally similar to 303 but does not have the auto-compute mechanism.

## Key files

| File | Role |
|------|------|
| `FiscalModelsPage.jsx` | Root — routes between list and per-model detail |
| `FmListPage.jsx` | Declaration table, toolbar, data mode toggle, auto-compute wiring |
| `useFiscalAutoCompute.js` | Background compute + polling hook |
| `fiscalModelsUtils.js` | `computeBoxes303`, `checkModified303`, `generate303File`, formatters, deadline logic |
| `models/303/FmModel303Page.jsx` | Modelo 303 detail — boxes, sources, stepper, file gen |
| `models/303/FmBoxes303.jsx` | Box grid renderer |
| `models/303/fm303Layouts.js` | Box layout definition (sections, rows, labels) |
| `models/349/FmModel349Page.jsx` | Modelo 349 detail |
| `FmCommon.jsx` | Shared components: `NumberedStepper`, `ResultPill`, `StatusPillMenu`, `SummaryCard` |
| `FmOverlays.jsx` | Modals and drawers: `PresentModal`, `FileGenModal`, `ConfigDrawer`, `CompareDrawer` |
| `FmDebugPanel.jsx` | Developer panel (keystroke-activated) for testing with fixture data |

## NEO Headless endpoints

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/fiscal303/declarations` | FmListPage — fetch all declarations |
| `PATCH` | `/fiscal303/declarations?id=` | FmListPage — persist status change |
| `GET` | `/fiscal303/boxes?year=&period=` | `computeBoxes303` |
| `GET` | `/fiscal303/modified?year=&period=&since=` | `checkModified303` |
| `GET` | `/fiscal303/generate?year=&period=&tipo=` | `generate303File` |
| `GET` | `/session` | FmModel303Page — org NIF/nombre for file header |

All query parameters are built with `URLSearchParams` to ensure correct encoding.
