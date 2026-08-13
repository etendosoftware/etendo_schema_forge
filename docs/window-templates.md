# Window Template Extensibility

Windows can opt into alternative layouts by setting `layoutType` in `schema-curated.json` (`window` object).

## Layout Types

| `layoutType` | Behavior |
|---|---|
| `"default"` (or absent) | Standard ListView/DetailView — no change to existing behavior |
| `"kanban"` | Generated page uses `KanbanBoard` from `@/components/contract-ui` |
| `"calendar"` | Generated page uses `CalendarView` from `@/components/contract-ui` |
| `"list-modal"` | Generated page uses `ListModalWindow` from `@/components/contract-ui` — a grid (list) + create/edit MODAL, with NO drill-in detail view |
| `"custom"` | Pipeline generates a scaffold in `windows/custom/` — developer builds on top |

## `list-modal`

For catalog / master-data windows that are a **grid + create/edit modal** with **no drill-in detail view** (e.g. Match Rule, a future product catalog). Records are created/edited in a modal; the list supports an inline `toggle` column and inline-editable cells.

The generated page is **self-contained**: the generator emits only `<Header>Page.jsx`, `index.jsx` and `mockCatalogs.js` — no per-entity `Table`/`Form` files and no `mockData.js`. Everything (grid columns, modal fields grouped by section, the NEO CRUD endpoint, the i18n title/banner) is read from the contract by the generic `ListModalWindow` component, so the same template serves any window that opts in.

CRUD follows the generic NEO Headless **W** convention (no per-window Java unless custom validation is needed):

```
list   GET    {baseUrl}/{entity}
create POST   {baseUrl}/{entity}
update PUT    {baseUrl}/{entity}/{id}
patch  PATCH  {baseUrl}/{entity}/{id}   (inline toggle / inline edit)
delete DELETE {baseUrl}/{entity}/{id}
```

### decisions.json

```json
"window": {
  "layoutType": "list-modal",
  "templateConfig": {
    "titleKey": "matchRuleNewTitle",          // i18n key for the create-modal title
    "editTitleKey": "matchRuleEditTitle",      // i18n key for the edit-modal title
    "bannerKey": "matchRuleBanner",            // optional info banner above the grid
    "searchPlaceholderKey": "matchRuleSearchPlaceholder",
    "newLabelKey": "matchRuleNew",             // "+ New" button label
    "autoPriorityField": "priority",           // field auto-seeded on create…
    "autoPriorityStep": 10,                     // …as max(field) + step (computed in the frontend, no backend endpoint)
    "sections": [                               // ordered modal sections (label is an i18n key, optional)
      { "key": "general" },
      { "key": "dimensions", "label": "matchRuleSectionDimensions" }
    ]
  }
}
```

All `templateConfig` strings are **i18n keys** (added to both `en_US.json` and `es_ES.json`), never raw user text.

### Field-level flags

The list-modal grid and modal reuse the standard field flags from `decisions.json → entities.<e>.fields`:

| Flag | Effect |
|------|--------|
| `grid: true` + `gridOrder: N` | include the field as a grid column at position N |
| `inlineToggle: true` | render a boolean column as a `Switch` that `PATCH`es `{entity}/{id}` on change |
| `inlineEdit: true` | mark a column as inline-editable (carried in the contract; editing also available via the modal) |
| `badge: true` | render an enum/list column as a badge |
| `form: true` + `section: '<key>'` + `seq: N` | include the field in the modal under the given section, ordered by `seq` |
| `required: true` | required in the modal (client-side guard before save) |
| `inputMode: 'selector'` | FK field rendered as a dropdown selector (EntityForm builds the `/selectors/<column>` URL automatically) |

## Setting layoutType

Edit `artifacts/{window-name}/schema-curated.json` and add to the `window` object:

```json
"window": {
  "layoutType": "kanban",
  "templateConfig": {
    "groupByField": "documentStatus",
    "columns": [{ "value": "DR", "title": "Draft", "color": "gray" }],
    "cardTitle": "documentNo",
    "cardSubtitle": "businessPartner",
    "cardValue": "grandTotal"
  }
}
```

For calendar:
```json
"layoutType": "calendar",
"templateConfig": {
  "dateField": "orderDate",
  "endDateField": null,
  "eventTitle": "documentNo",
  "eventType": "documentStatus"
}
```

For custom (no templateConfig needed):
```json
"layoutType": "custom"
```

## Custom Windows Convention

Custom windows live in `tools/app-shell/src/windows/custom/{window-name}/`:
- `index.jsx` — the hand-written React component (receives same props as generated windows)
- `mockCatalogs.js` — FK reference data for local development

The pipeline generates the initial scaffold with rich JSDoc comments (all entities, fields, processes, API patterns). The developer builds on top.

**Regeneration safety:** If `index.jsx` already exists when the pipeline runs again, the new scaffold is written as `index.jsx.new`. The existing file is never touched. Same for `mockCatalogs.js`. Use AI or a diff tool to merge updated metadata.

## Registry: customLoaders

`tools/app-shell/src/windows/registry.js` contains a `customLoaders` map alongside `windowLoaders`. When the pipeline creates a custom scaffold for the first time, it auto-registers the loader. Resolution order:

```
windowLoaders[name] || customLoaders[name] || PlaceholderWindow
```

## Flow: layoutType → contract → generator

```
schema-curated.json (layoutType, templateConfig)
    ↓
generate-contract.js → frontendContract.window.layoutType
    ↓
generate-frontend.js → generatePageComponent() branches by layoutType
    - "custom"     → generateCustomScaffold() → windows/custom/{name}/
    - "kanban"     → generateKanbanPage() → artifacts/{name}/generated/
    - "calendar"   → generateCalendarPage() → artifacts/{name}/generated/
    - "list-modal" → generateListModalPage() → <ListModalWindow> (grid + modal, no detail)
    - "default"    → generatePageComponent() [unchanged]
```

For `list-modal`, `generateAll()` also skips the per-entity `Table`/`Form` files — the
`<Header>Page.jsx` carries the `columns`/`fields`/`sections` literals and `ListModalWindow`
renders them.

## Flow: linesLayout → contract → generator

`window.linesLayout` is an orthogonal flag — it modifies how the Lines tab inside the
`default` (header-detail) layout renders, regardless of `layoutType`. It does not introduce
a new top-level page template.

```
decisions.json (window.linesLayout)
    ↓
resolve-curated.js → schema.window.linesLayout (via WINDOW_TRUTHY_PROPS)
    ↓
generate-contract.js → frontendContract.window.linesLayout (defaults to "classic")
    ↓
generate-frontend.js → emits linesLayout="<value>" on <DetailView>
    ↓
Generated <Window>LineTable.jsx switches at runtime:
    - "classic"        → <DataTable columns={columns} ... />          (current behavior)
    - "inlineEditable" → <InlineLinesPanel columns={columns} ... />   (Figma redesign)
```

`InlineLinesPanel` lives in `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx`.
Validator F11 enforces the enum. Default is `"classic"`, so windows that don't opt in are
unaffected by the new component.
