# List View Filters Reference

Complete reference for the filter stack rendered above every list view (`ListView` component in `tools/app-shell/src/components/contract-ui/ListView.jsx`).

The toolbar can show up to four filter surfaces. It is **one row**, in the same order as before
ETP-5509; the subset tabs move to a line of their own only when the row does not fit:

```
       ┌──────────────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──┐ ┌───────┐          ┌──┐ ┌──┐ ┌──┐ ┌─────────┐
       │ Subset | Subset  │ │Quick │ │Status│ │Date  │ │▽ │ │ ▤ | ▦ │  ≥ 16px  │⇅ │ │⟳ │ │… │ │ + New … │
       │ (segmented)      │ │(pill)│ │      │ │range │ │  │ │       │          └──┘ └──┘ └──┘ └─────────┘
       └──────────────────┘ └──────┘ └──────┘ └──────┘ └──┘ └───────┘          main actions (sort, refresh,
          ^                    ^         ^        ^      ^      ^              import/export, print, create)
          1. Subset filters    2. Quick  3. Document-type    4. Advanced  list / gallery
          (the "tab group")    filters   filters (auto-added  filter       view toggle
                                         by column type)      popover
──────────────────────────────────────────────────────────────────────────────────────────────────  separator

when the whole row does not fit, the subset tabs alone move below it:

line 1  [Quick] [Status] [Date] [▽] [▤|▦]                          [⇅] [⟳] [Print] [+ New …]
line 2  [ Subset | Subset | Subset ]
──────────────────────────────────────────────────────────────────────────────────────────────────  separator
```

All four combine with AND at query time. Empty / default selections contribute nothing — a totally unfiltered list shows when every surface is at its default state.

## Toolbar layout (ETP-5509)

The idle list bar is a single flex-wrap row (`list-toolbar-main-row`), closed by a separator line.
Its children, in this order:

- **The tab group (`list-toolbar-tabs`)** — the subset-filter segmented control. It opens the row
  **while the whole row fits**; when it does not, the same element moves — alone, by CSS
  (`order-last basis-full`), never remounted, so a focused tab keeps its focus — to a line of its
  own below. Only windows with `subsetFilters` have one; a window without subset tabs (Warehouse,
  Payments In, Product) is always a single row.
- **Filters cluster (`list-toolbar-filters`)** — the quick filters, a custom table's
  `ToolbarQuickFilter`, the status / date-range filters, the "Filtros" button and, last, the
  list/gallery view toggle (Product). This is the pre-ETP-5509 order: the toggle is not part of
  the tab group and never moves.
- **Actions cluster (`list-toolbar-actions`)** — the main actions (link, sort, refresh,
  import/export, print, "New …"). The link button (`list-share-link`) copies the current page
  URL, query string included (ETP-5593; it had no handler before).
- **Separator** — a `border-b` in `--border-subtle` on the toolbar container (`list-toolbar`),
  spanning the full width of the card. Every window that keeps the native bar gets it by
  construction. A window that drops the bar with `hideListBar` draws its own toolbar and therefore
  its own line (financial-account). *Provisional:* in a standard window this line is drawn in
  addition to the existing line under the column headers; keeping both is pending product
  confirmation.

**How the fit is decided** (`useListToolbarTabsFit.js`, next to `ListView.jsx`). It is a
measurement, never a breakpoint: the subset tabs stay on the first line when

```
tabs + gap + Σ(filter items) + their gaps + min cluster gap + actions  ≤  main row width
```

Every term is a **natural (max-content) width**: each element is briefly sized to `max-content`
and read, then its inline style is restored before the browser paints. So a filter item that grows
(`flex-1`, `w-full`) or wraps its own content (`flex-wrap`, e.g. the chart of accounts toolbar
slot) is counted at what it needs on one line, not at its current box, and the result does not
depend on where the tabs are or on whether the filters are wrapping — wrapped tabs always come
back once there is room. Filter items are the flex items of the cluster: an element rendered with
`display: contents` (`ListFilterBar` with `flowInParent`) is looked through to its children.
A `ResizeObserver` on the row, the clusters, the tabs and every filter item re-runs the check —
viewport resize, rail collapse/expand, a longer filter label once a status or date range is
applied — and a `MutationObserver` catches controls that appear later (the status filter once its
column metadata loads). Coming back to the first line requires 8px of slack
(`LIST_TOOLBAR_TABS_HYSTERESIS_PX`), so a width change caused by the move itself cannot make the
tabs oscillate. Before the first measurement, and wherever there is no layout (jsdom, a hidden
tab), the tabs stay inline. Measured live at 1280×720 with the rail expanded (es_ES): Purchase
Invoice and Contacts fit in one row; Sales Invoice — which also has Print — moves its tabs; all of
them fit in one row at 1920×1080.

**Gap and what yields.** The row's `gap-x-2` plus the actions cluster's `ml-2` keep a hard 16px
minimum between the filters and the actions at every width. The actions cluster never shrinks.
When space runs out the filters yield: first the subset tabs move to their own line, then the
filter controls wrap onto extra lines inside the cluster (`ListFilterBar` renders with
`flowInParent`, so its status / date / "Filtros" buttons are items of the wrapping cluster instead
of a nowrap row of their own). Only when the widest single filter control and the actions cannot
share a line — around 1000px of viewport with the rail expanded, depending on the window — does
the actions cluster drop to a line below the filters. The actions may leave the first line then,
but the two clusters never touch or overlap.

Stable test ids: `list-toolbar` (container, carries the separator), `list-toolbar-main-row` (the
flex-wrap row; carries `data-tabs-placement="inline" | "wrapped"` when the window has subset
tabs), `list-toolbar-tabs`, `list-toolbar-filters`, `list-toolbar-actions` (its children). There
is no separate second-row element: the moved tabs are still inside the main row. The controls keep
theirs: `filter-<key>` (subset entries — the entry's `key`, else its `label` lowercased),
`quick-filter-<key>`, `view-toggle`. The filters cluster also holds `filter-status`,
`filter-type`, `filter-date` and `filter-advanced`, which share the `filter-` prefix with the
subset entries, so scope prefix queries to `list-toolbar-tabs` or `list-toolbar-filters`. The
Playwright guard for the layout is described in `docs/e2e-testing-guide.md` → "Layout reference:
list toolbar at 1280×720 (ETP-5509)".

Out of scope of the shared layout: only what `ListView` itself renders is moved. A window that
replaces the bar through `hideListBar` (financial-account's `AccountsToolbar`, which has no tab
group — its account-type filter is a dropdown) and pages that are not a `ListView` at all (the
report catalog, which reuses `ViewToggle` in its own header; fiscal monitor; fiscal models) keep
their own layout.

## 1. Subset filters (`window.subsetFilters`)

Radio-style segmented control. **Always one active**, mutually exclusive, applied first in the query chain.

- Source: `decisions.json → window.subsetFilters` (propagated by `resolve-curated.js`, emitted by `generate-frontend.js`).
- Visual: a single rounded group of connected buttons, separated by thin dividers.
- Placement: the start of the toolbar row, before the quick filters; it moves to a line of its
  own only when the toolbar does not fit — see [Toolbar layout](#toolbar-layout-etp-5509).
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
- **Option order is fixed, not alphabetical** (ETP-4696, extended by ETP-4913): the status options are sorted with `compareStatusCodes` / `STATUS_ORDER` from `lib/statusBadge.js`, so the list follows the document flow (Temporary → Draft → In process → Awaiting → Completed → Re-opened → Closed → Voided → Unknown) and never changes between openings. The advanced filter's value dropdown for the same column sorts with the identical comparator — see [`decisions-reference.md`](decisions-reference.md) §"Option order in the two status dropdowns" for why the sort is gated to `type: 'status'` columns only.

## 4. Advanced filter popover (funnel icon)

The funnel button on the far right opens a **conditional-filter builder**. Each row is `<Donde|Y|O> <field> <operator> <value>` with a trash icon to remove it. `+ Añadir condición` adds more rows. The `Y/O` connector is a single global choice (either every row joins with AND, or every row joins with OR — no per-row nesting). `Aplicar` commits the draft; `Limpiar` wipes both the draft and the applied filter. `Guardar filtro` is visible but disabled (planned for a later phase).

- Component: `AdvancedFilterBuilder.jsx` (popover body). Criteria translation: `buildAdvancedFilterCriteria(filter, columns)` in `lib/gridQuery.js`.
- **Two hosts.** Generated windows get the funnel from `ListFilterBar` automatically. A window that draws its OWN toolbar mounts the shared `contract-ui/AdvancedFilterButton` instead (funnel + popover + active-condition badge) and evaluates the condition tree **client-side** through `applyConditions` (`windows/custom/financial-account/advancedFilterApply.js`) — the builder emits the tree but has no evaluator. Current consumers: the **Cuentas** list (ETP-5113) plus the financial-account detail's **Movimientos**, **Extractos importados** and **Conciliaciones** tabs. Each declares its filterable columns as a label-free `COLUMN_SPEC` in a `*AdvancedFilter.js` sibling, and MUST pass that spec's `key → { type }` map to `applyConditions` as `columnsByKey`, or every column silently degrades to the string operator table. `AdvancedFilterButton` takes an optional `className` for toolbars whose controls are not `h-9`.
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
- **Several values in one row: positive operators OR-compose, negative ones AND-compose (ETP-5009).** A multi-select picker (`DistinctEnumPicker`, `IdentifierMultiPicker`) sends an array; `buildRowCriteria` → `buildMultiValueCriteria` (`lib/gridQuery.js`, mirrored in core `app-shell-core/src/lib/gridQuery.js`) emits one clause per value. `Es A, B` means "A **or** B"; `No es A, B` means "neither A **nor** B", so `notEqual` (and every other negative operator: `iNotEqual`, `notContains`, `iNotContains`, `notStartsWith`, `iNotStartsWith`) is AND-composed — OR-ing `notEqual DR` with `notEqual CO` is always true and excluded nothing. Both junctions are wrapped in their own `AdvancedCriteria`, never returned flat, because `buildAdvancedFilterCriteria` spreads row items into an outer OR when the rows are joined with `O`. `No es Borrador, Completado` on `documentStatus` sends `{ _constructor: 'AdvancedCriteria', operator: 'and', criteria: [{ fieldName: 'documentStatus', operator: 'notEqual', value: 'DR' }, { fieldName: 'documentStatus', operator: 'notEqual', value: 'CO' }] }`. A single value still sends the plain clause. The client-side evaluators (`paymentInvoiceFilter.js`, `financial-account/advancedFilterApply.js`) already read an array `notEqual` as "not in the list".
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

**A bounded-value column declared `string` gets a useless free-text box.** Step 4's `text`
fallback offers only a free-text input, so the user must type the value exactly right with no
hint of which ones exist. Any column whose values are a BOUNDED set the user picks from rather
than types should be `selector` (→ `identifier`): "Is" / "Is not" then render the
`IdentifierMultiPicker` checkbox list of the values actually present, while "Contains" /
"Starts with" stay free text — a strict superset of the `enum` operator set, and it needs no
declared catalogue, because the picker falls back to the in-memory rows when the column's list
has no `entity`/`apiBaseUrl` behind it. Reserve `string` for genuinely free prose (a
description, a note), where a picker would list one option per row. This shipped wrong twice:
financial-account's Movimientos `documentNo`/`contact`/`glItem` (ETP-4956) and the Cuentas
list's País (ETP-5113).

**But `selector` is not the answer for every bounded set — the deciding question is whether a
TEXT operator adds anything the picker cannot do.** `enum` (→ `enumLabel`) also gives a
checkbox picker, and its operator set is only `equals / notEqual / isNull / isNotNull`, so an
`enum` column marked `required` lands on exactly "Is" / "Is not". Both pickers
(`DistinctEnumPicker` and `IdentifierMultiPicker`) ship their own search box, so "Contains" /
"Starts with" usually buy nothing — and on a short code they invite nonsense ("contains EU"
matching EUR). **Default to `enum` for any bounded set**, and reach for `selector` only when
the filterable universe is bigger than the loaded rows and the backend `_distinct` endpoint is
wired (`entity` + `apiBaseUrl` passed), where typing a fragment reaches values no picker page
is showing yet.

Mind `required` while you are there: it is what drops "Is empty" / "Is not empty". Set it only
when the field really is mandatory — a nullable column's empty bucket is often the most useful
filter on the list.

The Cuentas list walked this whole path publicly (ETP-5113): País shipped as `string` (a bare
text box, no hint of which countries exist), then both columns went to `selector`
(over-applied consistency — meaningless text ops on a 3-char ISO), and both finally settled on
`enum`, with `required` on Moneda only, because 248 of 448 accounts genuinely have no
country.

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

## State persistence across List -> Form -> List (ETP-4994)

Grid state survives leaving the list for a record and coming back. It is restored on ALL
three return paths — breadcrumb, the form's Cancel button, and the browser Back button —
because every one of them remounts `ListView`.

**What is restored:** column filters, the advanced (conditional) filter, the active subset
filter, the active quick filters, and the sort column + direction.

**Where it lives:** `sessionStorage`, one key per window — `listState:<windowName || entity>` —
written and read by `tools/app-shell/src/lib/listViewSession.js`.

Why sessionStorage rather than the URL or a router-level context:

| Option | Breadcrumb | Cancel | Browser Back | Refresh |
|---|---|---|---|---|
| Query params | needs the link rebuilt | needs the link rebuilt | yes | yes |
| Context above the Outlet | yes | yes | yes | no |
| **sessionStorage (chosen)** | yes | yes | yes | yes |

It is a per-viewer convenience — nothing else reads it back — which is the case browser
storage is allowed for. Scoped to the tab, so a second tab on the same window keeps its own
view, and it never outlives the session. Every access is `try`/`catch` guarded: a private
window or blocked site data degrades to "no saved state", never to a thrown render.

**Invariant — an untouched list stores NOTHING.** `persistListState` compares the live state
against the window's declared defaults and *removes* the key instead of writing a default
snapshot. A window that was never filtered behaves exactly as it did before this existed, and
clearing the filters cleans the key up rather than pinning a stale default.

**Not persisted:** scroll position / page. The grid pages in through `loadMore` (infinite
scroll), so restoring a deep scroll offset would mean replaying every page before the first
paint, against a row set that may have changed meanwhile. Explicitly out of scope.

**Not persisted (no feature to persist):** user column *order*. There is no column-reorder
affordance in the grid today — `DataTable`'s `onColumnsReady` only echoes the column array it
was given. If drag-to-reorder is ever added, its order belongs in this same snapshot.

To clear the saved state programmatically, call `clearListState(scope)`.

### Lifetime: the saved state lives only inside its window

A snapshot survives only while the user stays inside the window it belongs to — the list route
`/<window>` and every record route under it (`/<window>/<id>`, `/<window>/new`). As soon as a
navigation changes the first path segment (another window, the dashboard, the root), the state of
the window being left is cleared. The destination window's own state is never touched.

| Navigation | Saved state |
|---|---|
| List -> record -> list (breadcrumb, Cancel, browser Back) | kept |
| Record -> another record / `new` of the same window | kept |
| Refresh (F5) on the list or on a record | kept |
| Leave to another window, the dashboard or `/` | cleared for the window left |
| Re-enter afterwards (menu or browser Back) | default view |

Implementation: `ListStateRouteGuard` (`tools/app-shell/src/lib/ListStateRouteGuard.jsx`) is a
render-nothing component mounted once inside the router in `App.jsx`, next to
`ObservabilityRouteTracker`. On every `location.pathname` change it calls
`pruneListStateOnNavigation(prev, next)` from `listViewSession.js`, which compares
`windowScopeFromPath(prev)` against `windowScopeFromPath(next)` and calls `clearListState` for the
previous scope when they differ. A fresh page load has no previous pathname, which is why F5 keeps
the state. This also means a dashboard-shortcut filter (ETP-5009) does not stick: once the user
leaves the window, re-entering from the menu lands on the default view.

The scope is the route's first segment, which matches ListView's `listStateScope` because
`WindowLoader` passes the `/:windowName` route param as `windowName`. A `ListView` rendered inside
an `EmbeddedWindowRoute` runs under its own `MemoryRouter`, so its navigations never reach the
guard; its key (the embedded window's name) is cleared only when the user later leaves that
window's own route.

### Precedence: a URL deep-link beats the saved state (ETP-5009)

```
deep-link (URL) > sessionStorage snapshot > the window's declared default
```

A dashboard shortcut such as `/sales-invoice?filter=overdue` is an explicit intent for THAT
navigation and must win over whatever the user had filtered on their previous visit.
`ListView` cannot tell a URL-derived `initialAdvancedFilter` / `initialColumnFilters` from a
filter the window simply declares as its own default — the props are identical — so the window
states it explicitly:

```jsx
<ListView
  initialColumnFilters={initialColumnFilters}
  initialAdvancedFilter={initialAdvancedFilter}
  initialFiltersFromUrl={isInvoiceFilter || Boolean(docStatus)}  // <- the signal
/>
```

When `initialFiltersFromUrl` is true the snapshot is **not read at all**: the advanced filter,
the column filters, the subset index, the quick filters and the sort all come from the props.
It is deliberately all-or-nothing — restoring only some of them would leave the grid half
deep-linked and half restored.

The previous snapshot is then **discarded**, not kept — and it is *replaced*, not merely removed:
on a deep-linked mount the persistence effect measures "is the grid still at its default?" against
the EMPTY grid rather than against the URL-derived props, so the deep-linked view is what gets
written to the key. That matters because the breadcrumb and Cancel both navigate to the bare
`/<window>`, dropping the query string: with the key simply removed, returning from a record would
land on a completely unfiltered list.

For the user: after arriving from a dashboard card, opening a record and coming back, the
DEEP-LINKED view is restored — and the filter they had typed before going to the dashboard is gone
for good. That is the intended trade-off: the newest explicit intent wins, and no stale filter can
silently resurface one navigation later.

Windows that read filter params from the URL must pass this prop. Today: `sales-invoice`,
`purchase-invoice`, `goods-shipment`, `goods-receipt`, and anything built on
`windows/custom/shared/pendingDeliveryFilter.js` (which returns the flag ready to spread).

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
  - `tools/app-shell/src/lib/listViewSession.js` — session snapshot of the grid state (ETP-4994).
  - `tools/app-shell/src/lib/ListStateRouteGuard.jsx` — clears a window's snapshot when the user leaves it.
