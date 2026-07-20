# List View Filters Reference

Complete reference for the filter stack rendered above every list view (`ListView` component in `tools/app-shell/src/components/contract-ui/ListView.jsx`).

The toolbar can show up to four filter surfaces, always in this left-to-right order:

```
┌──────────────────┐  ┌──────┐  ┌──────┐ ┌──────┐  ┌──┐
│ Subset | Subset  │  │Quick │  │Status│ │Date  │  │▽ │
│ (segmented)      │  │(pill)│  │      │ │range │  │  │
└──────────────────┘  └──────┘  └──────┘ └──────┘  └──┘
     ^                   ^          ^        ^       ^
     1. Subset           2. Quick   3. Document-type filters   4. Advanced
     filters             filters    (auto-added by column type)   filter popover
```

All four combine with AND at query time. Empty / default selections contribute nothing — a totally unfiltered list shows when every surface is at its default state.

## 1. Subset filters (`window.subsetFilters`)

Radio-style segmented control. **Always one active**, mutually exclusive, applied first in the query chain.

- Source: `decisions.json → window.subsetFilters` (propagated by `resolve-curated.js`, emitted by `generate-frontend.js`).
- Visual: a single rounded group of connected buttons, separated by thin dividers.
- Behavior: clicking a different entry switches selection. Clicking the currently active entry does nothing.
- When to use: "which universe am I looking at" — e.g. *All contacts* / *Customers* / *Vendors*, *Open* / *Closed* documents.
- Full schema + examples: [`decisions-reference.md → Subset Filters`](decisions-reference.md).

## 2. Quick filters (`window.quickFilters`)

Independent toggle pills. Each is on/off on its own — any subset (including empty) is valid. Refines whatever subset is active.

- Source (option A): `decisions.json → window.quickFilters`, for pure backend criteria.
- Source (option B): declared inline in a custom window (`tools/app-shell/src/windows/custom/{window}/index.jsx`) when the filter needs extra JSX wiring (e.g. URL-param hydration via `initialQuickFilterIndex`). Prefer a backend `filter` string (`criteria=...`) over `rowFilter` — `rowFilter` only sees rows already loaded by the current pagination batch, so it misses matches on later pages. Reserve `rowFilter` for conditions the backend cannot express.
- Visual: rounded outlined pills (same height and text size as the base doc filters). Active pill: primary-color border and text, subtle tint.
- Behavior: each pill toggles independently. Multiple active pills compose with AND.
- URL bootstrap: custom windows can pass `initialQuickFilterIndex` when the URL query string matches a known preset (e.g. `?filter=pendingDelivery`).
- Full schema + examples: [`decisions-reference.md → Quick Filters`](decisions-reference.md).

## 3. Document-type filters (`ListFilterBar`)

Automatic filters rendered by `ListFilterBar` based on the *types* of the columns exposed by the window's table. No configuration required in `decisions.json` — they appear when the column types are present.

| Column type | Control | Options |
|-------------|---------|---------|
| `status` | Status dropdown | `All` + every status code declared in `enumLabels` (or the global `statuses` dictionary). Single-select. |
| `date` (first date column) | Date range dropdown | `Any time`, `Today`, `Last 7 days`, `Last 30 days`, `Last 12 months` (default), `This year`. |

- Source: auto-discovered from the table's columns array (`columns.find(c => c.type === 'status' | 'date')`).
- Behavior: dropdown menus with a check-mark next to the active option.
- Default: the first `date` column applies `Last 12 months` on first render; the status dropdown starts at `All`.
- All selections write into the shared `columnFilters` state, so they compose with AND against the backend.

## 4. Advanced filter popover (funnel icon)

The funnel button on the far right opens a **conditional-filter builder**. Each row is `<Donde|Y|O> <field> <operator> <value>` with a trash icon to remove it. `+ Añadir condición` adds more rows. The `Y/O` connector is a single global choice (either every row joins with AND, or every row joins with OR — no per-row nesting). `Aplicar` commits the draft; `Limpiar` wipes both the draft and the applied filter. `Guardar filtro` is visible but disabled (planned for a later phase).

- Component: `AdvancedFilterBuilder.jsx` (popover body). Criteria translation: `buildAdvancedFilterCriteria(filter, columns)` in `lib/gridQuery.js`.
- State: **ephemeral** — lives in `ListView` `useState`. Refreshing the page clears it.
- Precedence: subset → quick → document-type filters → advanced. All four always combine with AND, *except* the rows inside the advanced block which honor the `Y/O` connector (wrapped in a single `AdvancedCriteria` object when OR is selected).
- Operators per column type:
  - string / selector: `Contiene`, `No contiene`, `Empieza por`, `Es`, `No es`, `Está vacío`, `No está vacío`
  - enum (status): `Es`, `No es`, `Es cualquiera de`, `Está vacío`, `No está vacío`
  - number / amount: `=`, `≠`, `>`, `≥`, `<`, `≤`, `Entre`, `Está vacío`, `No está vacío`
  - date: `Es`, `Antes de`, `Después de`, `Entre`, `Está vacío`, `No está vacío`
  - boolean: `Es` (value picker uses the column's `badgeLabels`)
- Value input adapts to the column type: text/number/date input; enum dropdown using `enumLabels`; boolean dropdown using `badgeLabels`; `Entre` renders two inputs; `Es cualquiera de` takes a comma-separated list of codes.
- The funnel button turns primary-tinted whenever **any** filter is active (column header row *or* advanced).

### Backend criteria shape

The builder emits a single `criteria=...` string and appends it to the other filter parts inside `effectiveFilter`. For AND, rows are spread flat into the top-level criteria array; for OR, rows are wrapped in an `AdvancedCriteria` object:

```json
[
  { "_constructor": "AdvancedCriteria", "operator": "or", "criteria": [ ... ] }
]
```

This keeps AND composition with the surrounding subset/quick/document-type filters intact while still honoring OR inside the advanced block.

## Composition rules

Every filter surface writes into one of two places:

1. **Backend `criteria=` string** — subset filter, quick filters that provide a `filter` string, and document-type filters (status / date range). `ListView` merges all active backend filters into a single `criteria=[ ... ]` URL-encoded JSON array and passes it as `baseFilter` to `useEntity`.
2. **Client-side `rowFilter`** — subset/quick filters may provide a `rowFilter(row) => boolean` (only from custom-window code, never from JSON). All active row filters + any parent-supplied `rowFilter` compose with AND inside `DataTable`.

Active filter surfaces always combine with AND. There is no OR composition.

## URL-param initialization

Custom windows may hydrate default filter state from the URL so that menu links can deep-link into a specific view. The conventions in use today:

| URL param | Effect |
|-----------|--------|
| `?DocStatus=<code>` | Pre-fills the status dropdown (column filter on `documentStatus`). |
| `?filter=<preset>` | Activates a matching quick filter preset by index. Custom windows define the mapping (e.g. `filter=pendingDelivery` → index 0 of `QUICK_FILTERS`). |

`decisions.json`-driven windows do not have a URL-param hook today — if you need one, declare the filter in the custom window file instead.

## Choosing the right surface

| Need | Surface |
|------|---------|
| Mutually exclusive "view modes" that partition the dataset | **Subset filters** (one always active) |
| Independent on/off refinements inside the current view | **Quick filters** (toggle pills) |
| Standard status / date-range pickers | **Document-type filters** (automatic — just expose the column types) |
| Ad-hoc filter on any column the user picks | **Advanced filter popover** (once the builder ships) |

## Visual parity

All four toolbar surfaces use the same size tokens (`h-9`, `px-3`, `text-xs`) so they align visually. When adding a new control, keep the same dimensions to avoid jagged baselines.

## Related

- [`decisions-reference.md`](decisions-reference.md) — full schema for `subsetFilters` and `quickFilters`.
- [`ui-customization.md`](ui-customization.md) — where custom windows live and how `rowFilter` functions get wired in.
- Source files:
  - `tools/app-shell/src/components/contract-ui/ListView.jsx` — filter state + toolbar layout.
  - `tools/app-shell/src/components/contract-ui/ListFilterBar.jsx` — document-type filters + advanced filter popover.
