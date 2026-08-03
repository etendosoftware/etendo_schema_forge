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
- **`Está vacío` / `No está vacío` are dropped for any column with `required: true`** (ETP-4609) — a mandatory field can never legitimately be empty, so those two operators are filtered out of the list regardless of mode. This applies to every column in every window; `required` is read straight off the column object (same one DataTable renders), not from a separate config.
- `Es cualquiera de` (inSet) is **only ever offered for `enum`/status-mode columns** — it is not a general "any field" operator. A text or selector column will never show it in the operator list; that's by design, not a bug (see `docs/generated-custom-windows/` guides for which columns of a given window are enum-typed).
- Value input adapts to the column type: text/number/date input; enum dropdown using `enumLabels`; boolean dropdown using `badgeLabels`; `Entre` renders two inputs; `Es cualquiera de` takes a comma-separated list of **raw codes** (not translated labels) via a plain text box, matched **case-insensitively** (ETP-4609) — `i,s` matches the same rows as `I,S`. Internally each code is sent as a separate `iEquals` criterion OR-composed together (`buildRowCriteria` → `generateInSetCriteria` in `lib/gridQuery.js`), since the backend's plain `inSet`/`equals` operators are case-sensitive and there is no native case-insensitive "in" operator.
- The funnel button turns primary-tinted whenever **any** filter is active (column header row *or* advanced).

### Which columns are offered

`AdvancedFilterBuilder` filters the `columns` array it receives (`isFilterableColumn` in
`AdvancedFilterBuilder.jsx`) before building the field dropdown:

- `type: 'discarded'` / `type: 'system'` and `filterable: false` are excluded (unchanged).
- **`type: 'custom'` columns with no `column` (AD field) and no `backendFilterKey` are excluded by default** (ETP-4609). A purely client-rendered cell (e.g. a composite avatar combining two fields, a computed badge) has no real backend property to filter against — offering it showed the column's raw internal `key` as the label (nothing else to fall back to) and silently matched nothing when applied. Opt back in with `filterable: true` only if the custom column genuinely maps to a queryable field via a custom `buildCriteria`.
- If a window needs to filter by a field that is only *shown* merged into a custom cell (e.g. Product's `nameAndSearchKey` avatar shows both `name` and `searchKey`), declare the real fields as separate column entries (`{ key: 'name', column: 'Name', type: 'string' }`) and hide them from the rendered grid via the `hiddenColumns` prop on `DataTable` — they stay reported to `ListFilterBar` (which reads the full `columns` prop, not the rendered subset) so they appear as correctly labeled, working filters. See `tools/app-shell/src/windows/custom/product/ProductCustomTable.jsx` for a worked example.

### How a column's filter mode is resolved

Which operator set and which value input a column gets is decided by
`resolveFilterMode(col)` in `lib/gridQuery.js`, in this order:

1. An explicit **`col.filterMode`** always wins.
2. A **recognized `col.type`** is mapped by `inferFilterMode`: `date` → `date`;
   `selector` → `identifier`; `status` / `enum` → `enumLabel`; `boolean` →
   `booleanLabel`; `number` / `amount` / `percent` / `signedDelta` → `numeric`.
3. Otherwise, an AD **`col.column` ending in `_ID`** (e.g. `C_BPartner_ID`) is
   treated as a foreign key → `identifier`.
4. Fallback: `text`.

**`type: 'custom'` carries no filter semantics.** A custom cell has a bespoke
`render`, so the underlying data type is invisible to the filter layer — it is
*not* in the recognized set of step 2 and therefore resolves through steps 3-4.
That is correct for FK columns (the `_ID` heuristic catches them) and for text
columns, but **a custom cell over a numeric or date column must declare
`filterMode` explicitly** or it silently degrades to text operators (ETP-4681).

The failure this prevents: `?filter=overdue` preloads
`outstandingAmount greaterThan 0`, but `outstandingAmount` renders as a
`type: 'custom'` cell (status pills + payment button). In text mode the operator
set has no `greaterThan`, so the operator `<Select>` found no matching item and
rendered its placeholder — a visibly malformed condition. The emitted backend
criteria happened to stay correct (the text branch of `buildRowCriteria` passes
the operator through), but opening the dropdown lost `greaterThan` for good.

### Authorable per-column filter overrides

Two optional column props, honored unconditionally by `lib/gridQuery.js`:

| Prop | Effect |
|------|--------|
| `filterMode` | Forces the mode — `'text' \| 'date' \| 'identifier' \| 'enumLabel' \| 'booleanLabel' \| 'numeric'`. Overrides `type` (`resolveFilterMode` checks it first), so the cell keeps its custom `render` while the filter behaves correctly. |
| `backendFilterKey` | Overrides the entity property the criteria is built against, in both the quick-filter path (`buildBackendFilter`) and the advanced path (`getFilteredKey`). Only needed when the render key differs from the backend property — if `col.key` already *is* the entity property, omit it. |

Worked example — a rich amount cell that still filters numerically:

```js
{
  key: 'outstandingAmount',
  column: 'OutstandingAmt',
  type: 'custom',          // rich cell: "Cobrada" / "Saldo a favor" pills + payment button
  filterMode: 'numeric',   // ...but filter with =, ≠, >, ≥, <, ≤, Entre and a number input
  render: (row) => /* ... */,
}
```

Where to declare them:

- **Hand-written custom tables** (`artifacts/<window>/custom/*.jsx` and
  `tools/app-shell/src/windows/custom/<window>/*.jsx`) — edit the column literal
  directly. These files are hand-owned: the pipeline writes `.new` siblings and
  never overwrites them, so no `make regen` is involved.
- **Generated tables** — via `decisions.json` on the field; the props flow
  `decisions.json → curated → contract.json → generated column`. Only relevant
  when a `columnType` override hides the real type, since the generator otherwise
  emits a type that step 2 already recognizes.

Rule **F19** of `sf-validate-pipeline` blocks a commit that adds a `type: 'custom'`
column over a numeric/date/enum contract field without a `filterMode` — see
[`pipeline-validator-reference.md`](pipeline-validator-reference.md).

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
| Ad-hoc filter on any column the user picks | **Advanced filter popover** (funnel icon) |

## Visual parity

All four toolbar surfaces use the same size tokens (`h-9`, `px-3`, `text-xs`) so they align visually. When adding a new control, keep the same dimensions to avoid jagged baselines.

## Related

- [`decisions-reference.md`](decisions-reference.md) — full schema for `subsetFilters` and `quickFilters`.
- [`ui-customization.md`](ui-customization.md) — where custom windows live and how `rowFilter` functions get wired in.
- Source files:
  - `tools/app-shell/src/components/contract-ui/ListView.jsx` — filter state + toolbar layout.
  - `tools/app-shell/src/components/contract-ui/ListFilterBar.jsx` — document-type filters + advanced filter popover.
