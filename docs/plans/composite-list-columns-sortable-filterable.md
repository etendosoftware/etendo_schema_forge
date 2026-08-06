# Plan — `multiField` list columns (declarative, per-part sort + advanced-filter expansion)

**Status:** active
**Owner:** Schema Forge Developer (tooling)
**Jira:** ETP-4601
**Repos touched:** `schema_forge` only (local `DataTable`, `ListView`, generator, `decisions.json`
schema, `neoImage`/`BoxIcon` utils, Product). **No core edits / no package bump required** —
see §4.0.

---

## 1. Problem

The Product list shows an **"Identifier & Name"** column that visually stacks two real
`M_Product` fields — `Name` (title) and `Value` / Search Key (subtitle) — plus the product
image. It is a hand-written custom cell:

- `tools/app-shell/src/windows/custom/product/ProductCustomTable.jsx` — column def
  `nameAndSearchKey`, `type: 'custom'`, `sortable: false`.
- `tools/app-shell/src/windows/custom/product/ProductListCells.jsx` — `ProductNameCell`
  renders `row.name` + `row.searchKey` + image; `useProductImage.js` loads the image.

Because the cell is an opaque `type: 'custom'` column keyed `nameAndSearchKey` (not a real
NEO field), it has two limitations:

1. **Not sortable.** The header calls `onSort(col.key)` (`DataTable.jsx:1297`), and `col.key`
   is the NEO field name that ends up in `_sortBy` (`ListView.jsx:596` `handleColumnSort`).
   `nameAndSearchKey` is not a NEO field, so sorting is disabled (`sortable: false`).
2. **Invisible to advanced filters.** The advanced-filter builder enumerates filterable
   fields from its `columns` prop (`AdvancedFilterBuilder.jsx:140` `columns.filter(isFilterableColumn)`,
   keyed by `c.key`). Since `name` and `searchKey` are no longer standalone columns, neither
   appears as a filterable field.

Both fields "stop being individual columns" and collapse into one fictitious, hand-coded column
that no other window can reuse without writing its own JSX.

## 2. Goal & non-goals

**Goal.** A generic, `decisions.json`-driven **`multiField`** column that any window can declare
without writing a component, and that behaves like real columns for sort and filter:

- **G1 — Per-part sort.** The header renders each constituent field label as an independently
  clickable sort control. Click **"Identifier"** → sort by `searchKey`; click **"Name"** →
  sort by `name` — each with its own direction indicator, cycling none → asc → desc → clear,
  exactly like every other column title. Only one part is the active sort at a time; the arrow
  shows on the active part (confirmed UX).
- **G2 — Advanced-filter expansion.** Each constituent field appears in the advanced-filter
  builder as an **independent, separate filterable field** — exactly as if it had been its own
  column in the table. Filter by Name and/or Search Key independently.
- **G3 — Declarative & reusable.** Declared in `decisions.json`, emitted by the generator. A
  new window gets the same pattern via config — no custom component, no bespoke JSX. Survives
  pipeline re-runs. The name `multiField` is intentionally structural (not "identity"): it
  describes "one column composed of several fields", reusable for any pairing (Document + Date,
  Customer + Email, …).
- **G4 — Built-in renderer with authenticated media.** A built-in renderer produces the
  title + subtitle + optional image cell. Images needing an authenticated fetch (Product) use a
  built-in `neoImage` resolver, so Product needs **zero** custom JSX for this column.

**Decisions locked (from review):**

- `type` name = **`multiField`**.
- Header segment order = **"Identifier & Name"** (Identifier first — keep current header text).
- Advanced-filter field labels = **same wording as the header** ("Identifier"/"Identificador",
  "Name"/"Nombre"), *not* the canonical AD label ("Search Key").
- Built-in look = **fixed standard for now** (configurable styling is a later follow-up). MUST
  render **pixel-identical to today** — reuse the exact current Tailwind classes verbatim.

**Non-goals.**

- No visual change to the cell body.
- Not converting Name/Identifier into stored computed columns — they are already physical
  columns; this is purely presentation + sort/filter metadata.
- **Sale / Purchase / Stock stay custom and untouched** (runtime-derived; separate
  stored-computed-columns effort). `ProductCustomTable` is **not** retired in this feature — it
  keeps hosting those three custom cells. Making custom list columns fully declarative so the
  generated table can host them (and Product can drop `ProductCustomTable`) is **deferred** by
  explicit decision.
- Configurable `multiField` styling — later follow-up.

## 3. The `multiField` column contract

### 3.1 Runtime column shape (what the table consumes)

A built-in `type: 'multiField'` column. The table renders its cell from config (no `render`
function) and knows its constituent fields for sort/filter.

```js
{
  key: 'nameAndSearchKey',
  type: 'multiField',
  partSeparator: ' & ',                 // header separator (default ' & ')
  media: { field: 'image', kind: 'neoImage', fallback: 'box' },   // optional
  title: 'name',                        // row field → bold title
  subtitle: 'searchKey',                // row field → chip subtitle
  parts: [                              // header sort/filter segments, in display order
    { key: 'searchKey', column: 'Value', type: 'string',
      labels: { en_US: 'Identifier', es_ES: 'Identificador' }, sortable: true, filterable: true },
    { key: 'name', column: 'Name', type: 'string',
      labels: { en_US: 'Name', es_ES: 'Nombre' }, sortable: true, filterable: true },
  ],
}
```

Contract rules:

- `title` / `subtitle` — row field keys for the **visual** cell body.
- `parts[]` — header sort segments and advanced-filter fields, in header display order
  (`Identifier` then `Name`).
  - `part.key` — the **NEO field name** for `_sortBy` and advanced-filter criteria (must be a
    real queryable field in `api.crud.<entity>.supportedFilters`).
  - `part.column` — AD column (metadata only; **not** used for the filter label, per the locked
    decision — the label comes from `part.labels`).
  - `part.labels` / `part.label` — header segment label per locale; also the advanced-filter
    field label.
  - `part.type` — drives the advanced-filter input widget.
  - `part.sortable` (default `true`), `part.filterable` (default `true`).
- Visual `title`/`subtitle` and the sort `parts` are declared independently, so header order
  ("Identifier & Name") can differ from body order (Name as title) — exactly today's behavior.
- Supports **N parts** and multiple `multiField` columns per table.

### 3.2 `decisions.json` shape (what the human declares)

> **Implementation note (ETP-4603, Phase 3 — Design A):** This section originally
> assumed a `window.listColumns` override array. That mechanism does **not** exist:
> list columns are derived entirely from the contract's grid fields
> (`generate-frontend.js` → `gridFields.map(...)`), and per-column behavior is set
> with **per-grid-field decorators** (`badge`, `gridReadOnly`, `gridOrder`, …). The
> `multiField` column was therefore implemented as a **per-grid-field decorator** on
> a "host" grid field, consistent with the existing pattern — not as a new
> `window.listColumns` key. The runtime shape (§3.1) is unchanged; only the
> declaration differs. Canonical, up-to-date declaration reference:
> `docs/decisions-reference.md` → "Composite list column (`multiField`)". The host
> field's decorator absorbs the sibling columns it references (`subtitle`,
> `media.field`, non-host `parts[].field`); their data still arrives because the
> list fetch sends no field projection. Validator rule **F18** enforces the field
> references and sort-part queryability. The `window.listColumns` block below is
> retained only as the original design sketch.

Extend `window.listColumns` to allow `multiField` entries. `part.field` references a contract
field; the generator resolves `key/column/type` from the contract.

```jsonc
"window": {
  "listColumns": [
    { "type": "multiField", "key": "nameAndSearchKey",
      "title": "name", "subtitle": "searchKey",
      "media": { "field": "image", "kind": "neoImage", "fallback": "box" },
      "parts": [
        { "field": "searchKey", "labels": { "en_US": "Identifier", "es_ES": "Identificador" } },
        { "field": "name",      "labels": { "en_US": "Name",       "es_ES": "Nombre" } }
      ] },
    { "field": "productCategory" },
    { "field": "uOM" },
    { "field": "productType" }
  ]
}
```

## 4. Implementation

### 4.0 Why it is all local (module resolution)

Vite aliases (`tools/app-shell/vite.config.js:220-242`): `@` → `./src` **always** (both
`make dev` and `dev-local-core`); `@etendosoftware/app-shell-core` → sibling
`../schema_forge_core/packages/app-shell-core/src` only under `LOCAL_CORE`.

- `DataTable.jsx` and `ListView.jsx` are **full local implementations** under `@/` → edited
  here, ship with this repo's build. No core dependency.
- `AdvancedFilterBuilder.jsx` and `lib/gridQuery.js` are **core** (local files re-export them).
  But we avoid editing them: `buildAdvancedFilterCriteria(advancedFilter, columns)` keys purely
  off `c.key` (`gridQuery.js:433`) and `AdvancedFilterBuilder` derives its field list from
  `columns.filter(isFilterableColumn)` (`AdvancedFilterBuilder.jsx:140`). So if **`ListView`
  (local) pre-expands** `multiField` parts into ordinary pseudo-columns before passing
  `columns`, core needs **no change** (§4.3).

### 4.1 Built-in `multiField` renderer — `DataTable.jsx` (local)

Add `CELL_RENDERERS.multiField` so `type: 'multiField'` needs no `render`. `renderCellValue`
already dispatches `CELL_RENDERERS[col.type]` (`DataTable.jsx:1847`). The body must be
**byte-for-byte the current visual**; copy the classes from `ProductNameCell`
(`ProductListCells.jsx:122-143`) verbatim:

- wrapper `flex items-center gap-3`
- media box `w-10 h-10 rounded-lg bg-[#F5F7F9] flex items-center justify-center overflow-hidden flex-shrink-0`
- `<img>` `w-full h-full object-cover`, fallback `BoxIcon` (24px, `#828FA3`)
- text column `flex flex-col justify-center gap-0.5`
- title `text-sm font-semibold text-[#121217] leading-5` ← `row[title]`
- subtitle chip `inline-flex items-center px-2 py-0.5 bg-[#F5F7F9] rounded-full text-xs text-[#3F3F50] leading-4 w-fit` ← `row[subtitle]` (only when present)

`BoxIcon` moves to a shared local util (`@/components/ui/...`) as the default `fallback: 'box'`.

### 4.2 Header per-part sort — `DataTable.jsx` (local)

`renderColumnHeaderCell` (`DataTable.jsx:1276-1314`) renders a single label bound to
`onSort(col.key)` with `isSorted = sortColumn === col.key`.

Change: when `col.parts?.length`, render **N sort buttons** joined by `col.partSeparator`
(default `' & '`) instead of the single `colLabel`. Per part:

- label = `resolveColumnLabel(part, locale, t)` (reuse existing resolver).
- clickable when `onSort && part.sortable !== false`; `onClick={() => onSort(part.key)}`.
- `isSorted = sortColumn === part.key`; arrow (`▲`/`▼`) on the active part only.
- Non-`multiField` columns keep the existing single-label branch untouched.
- `data-testid` per segment: `column-header-sort-<part.key>`.

`ListView.handleColumnSort` needs **no change** — it treats the argument as an opaque field key
and cycles none→asc→desc→clear; passing `part.key` reuses it, emitting `_sortBy=<part.key> <dir>`.

### 4.3 Advanced-filter part-expansion — `ListView.jsx` (local)

`ListView` passes `columns={tableColumns}` to `AdvancedFilterBuilder` (`ListView.jsx:719`) and
calls `buildAdvancedFilterCriteria(advancedFilter, tableColumns)` (`ListView.jsx:278`). Insert a
memoized **expansion** that both consume:

- Replace every `type: 'multiField'` column with one pseudo-column per `part` where
  `filterable !== false`: `{ key: part.key, type: part.type, label: <locale-resolved part label>, ... }`.
- **Omit `column`** on the pseudo-column and set `label` to the locale-resolved header wording
  (`part.labels[locale] ?? part.labels.en_US`), because the builder computes its field label as
  `labelOf(col.column) ?? col.label ?? col.key` (`AdvancedFilterBuilder.jsx:195`); dropping
  `column` makes it fall through to our `label` → shows "Identificador"/"Nombre", not the AD
  "Search Key" (locked decision). `ListView` has `locale`, so it can resolve per current locale.
- Exclude the `multiField` parent itself from the expanded list (no queryable key).

Result: the advanced-filter dropdown lists Name and Search Key as two separate fields, and
`buildAdvancedFilterCriteria` resolves criteria on each — with **zero core edits**. Local
quick-search (`applyLocalSearch`, `DataTable.jsx:129`) already covers both via the `filters`
array; unchanged.

> Fallback: if pre-expansion misses an internal builder path that needs the parts, edit the
> core `AdvancedFilterBuilder`/`gridQuery` directly (allowed; iterate via `dev-local-core`).
> The **core preview publish + bump is done by the repo owner**, not by this pipeline.
> Pre-expansion is the primary path precisely to avoid needing that.

### 4.4 `neoImage` media resolver — local

Generalize `useProductImage.js` into a shared local `useNeoImage(imageId, token, apiBaseUrl)`
(fetch `{neoBase}/image/{id}` with Bearer token → blob → object URL, with cleanup). The
`multiField` renderer uses it for `media.kind === 'neoImage'`. Behavior identical; only location
becomes generic. The row must expose the image-id field named by `media.field` (Product: `image`).

### 4.5 Generator + `decisions.json` schema (local, `schema_forge`)

- Extend the `decisions.json` schema (+ `docs/decisions-reference.md`) to accept
  `window.listColumns` with `multiField` entries (§3.2). Resolve each `part.field`, `title`,
  `subtitle`, `media.field` against the contract to fill `key/column/type`.
- `generate-frontend.js` emits the `type: 'multiField'` column object (§3.1) into the generated
  `<Window>Table.jsx`. Windows using the **generated** table get the feature purely from config.
- Add a pipeline-validator rule (F-series): `part.field` / `title` / `subtitle` / `media.field`
  must be real contract fields; `title`/`subtitle`/each `part.field` must be queryable where
  used for sort. Update `docs/pipeline-validator-reference.md`.

### 4.6 Product application — pixel-identical, `ProductCustomTable` kept

Because Sale/Purchase/Stock stay custom (non-goal), Product keeps its custom table override.
Migrate only the identity column inside it:

- In `ProductCustomTable.jsx`, replace the hand-written `nameAndSearchKey` column
  (`type:'custom'` + `render`) with the generic `type:'multiField'` object (§3.1) — no `render`,
  no `ProductNameCell`. Drop `sortable: false`.
- Remove `ProductNameCell` and `useProductImage` (replaced by built-in renderer + `useNeoImage`).
- Keep `ProductSalePriceCell` / `ProductPurchasePriceCell` / `ProductStockCell` and the rest of
  `ProductCustomTable` unchanged.
- Also declare the `multiField` in `artifacts/product/decisions.json` (§3.2) for consistency and
  so the validator/docs cover it; Product's *generator-emitted* consumption (dropping
  `ProductCustomTable`) rides with the deferred custom-columns work.
- Net visual diff on the identity cell: **zero** — validate with a DOM/class snapshot vs the
  current `ProductNameCell` output before deleting it.

## 5. i18n

Part / title / subtitle labels resolve via `resolveColumnLabel` (header) and the locale-resolved
`label` we bake in for the filter (§4.3). Product uses inline `labels`
(Identifier/Identificador, Name/Nombre) — no new locale keys. Any non-inlined labels go in both
`en_US.json` and `es_ES.json`.

## 6. Tests (delegate to Tester / `test-generator`)

- **`multiField` renderer (Vitest):** body renders title + subtitle chip + media/fallback with
  the exact classes; DOM parity vs current `ProductNameCell` output.
- **`useNeoImage` (Vitest):** authenticated fetch → object URL; cleanup on unmount; fallback
  when no image id. Ported from `useProductImage`.
- **`DataTable` header (Vitest):** a `parts` column renders N clickable segments; each click
  calls `onSort(part.key)`; arrow on the active part; cycle none→asc→desc→clear; non-`multiField`
  headers unchanged. Extend `contract-ui/__tests__/DataTable.helpers.vitest.jsx`.
- **`ListView` filter expansion (Vitest):** a `multiField` column expands into one separate
  filter field per part, labeled with the header wording (not the AD label); the parent is
  excluded; `buildAdvancedFilterCriteria` resolves criteria on `name` and `searchKey`
  independently. Extend `contract-ui/__tests__/ListView.vitest.jsx`.
- **Generator (Node test):** `decisions.json` `multiField` → emitted `type:'multiField'` column;
  validator rejects bad `part.field`/`title`/`subtitle`/`media.field`.
- **E2E (Playwright, mocked):** on the Product list, click "Identifier" and "Name" in the header
  (assert `_sortBy=searchKey` / `_sortBy=name` per click and the arrow), and add an advanced
  filter on each field independently. Follow `docs/e2e-testing-guide.md`; base on
  `e2e/tests/flows/row-quick-actions.mocked.spec.js`.

## 7. Rollout / phases (all in `schema_forge`)

1. **Phase 1 — Renderer + media:** `CELL_RENDERERS.multiField` (§4.1), `useNeoImage` + `BoxIcon`
   (§4.4); unit tests.
2. **Phase 2 — Sort + filter:** header per-part sort (§4.2) and `ListView` filter expansion
   (§4.3); unit tests.
3. **Phase 3 — Declarative:** `decisions.json` schema + `generate-frontend.js` emission +
   validator rule (§4.5); generator tests.
4. **Phase 4 — Product:** migrate the identity column in `ProductCustomTable`, retire
   `ProductNameCell`/`useProductImage`, declare in `decisions.json`, `make regen ONLY=product`,
   verify pixel-identical; E2E + docs.

No core publish/bump unless the §4.3 fallback is triggered.

## 8. Risks & open questions

- **`_sortBy` field validity** — confirm NEO accepts `name` and `searchKey` in `_sortBy` (they
  are in `supportedFilters`, but sort ≠ filter server-side). First thing the dev verifies.
- **Filter-label override (§4.3)** — the "omit `column`, set `label`" trick depends on
  `AdvancedFilterBuilder.jsx:195` label resolution; re-confirm that path on the installed core
  version. If the builder ignores `col.label` for some field kinds, fall back to the core edit.
- **Header width / wrapping** — two clickable segments + separator must fit existing widths in
  the normal and gallery layouts.
- **Pixel parity** — the built-in renderer must reproduce the current cell exactly; validate
  with a DOM/class snapshot against `ProductNameCell` before deleting it.

## 9. Documentation to update (same change)

- `docs/ui-customization.md` — the `multiField` list-column contract + `neoImage` media.
- `docs/decisions-reference.md` — `window.listColumns` `multiField` entries.
- `docs/pipeline-validator-reference.md` — the new F-rule.
- `docs/generated-custom-windows/product.md` — sortable/filterable header behavior.
