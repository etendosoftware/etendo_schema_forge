# Window Template Extensibility

Windows can opt into alternative layouts by setting `layoutType` in `schema-curated.json` (`window` object).

## Layout Types

| `layoutType` | Behavior |
|---|---|
| `"default"` (or absent) | Standard ListView/DetailView — no change to existing behavior |
| `"kanban"` | Generated page uses `KanbanBoard` from `@/components/contract-ui` |
| `"calendar"` | Generated page uses `CalendarView` from `@/components/contract-ui` |
| `"custom"` | Pipeline generates a scaffold in `windows/custom/` — developer builds on top |

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
generate-frontend.js → generateAll() dispatches by layoutType
    - "custom"   → generateCustomScaffold() → windows/custom/{name}/
    - "kanban"   → generateKanbanPage() → artifacts/{name}/generated/
    - "calendar" → generateCalendarPage() → artifacts/{name}/generated/
    - "default"  → generatePageComponent() [unchanged]
```
