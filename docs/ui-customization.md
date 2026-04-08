# UI Customization Guide

How to extend and customize window frontends in Schema Forge. All customization is declared in `decisions.json` — the generator reads it and produces the correct imports and props automatically. Custom component files live in `tools/app-shell/src/windows/custom/{window}/` and are **never overwritten** by the pipeline.

## Core principle

```
decisions.json (source of truth)
    ↓
generate-frontend.js (reads window config)
    ↓
artifacts/{window}/generated/…Page.jsx (emits imports + props)
    ↓  reads from
tools/app-shell/src/windows/custom/{window}/ (your hand-written components)
```

**Never edit generated files.** If you need to change UI behavior, either:
- Add/change a key in `decisions.json` and re-run the generator, or
- Write/update a component in `windows/custom/{window}/` that the generator already imports via a config key.

---

## Customization options reference

### 1. `window.statusBar` — declarative summary bar

Generates a `{WindowName}StatusBar` component with colored metric cards and an optional progress indicator. No custom JSX needed — fully configured from `decisions.json`.

**Use when:** the detail view needs KPI tiles at the top showing numeric field values (e.g., depreciation progress, total amounts).

```json
"window": {
  "statusBar": {
    "cards": [
      { "field": "depreciatedValue", "label": "Depreciated Value", "color": "blue",   "icon": "TrendingDown" },
      { "field": "depreciatedPlan",  "label": "Depreciated Plan",  "color": "teal",   "icon": "TrendingDown" }
    ],
    "progress": {
      "numerator":      "depreciatedValue",
      "denominator":    "assetValue",
      "condition":      "depreciate",
      "label":          "Depreciation",
      "color":          "orange",
      "completedColor": "green",
      "completedIcon":  "CheckCircle2"
    }
  }
}
```

The generator emits a `{WindowName}StatusBar` component inside `@sf-generated` markers and wires it as `headerContent` on `DetailView`. **Real example:** `assets`.

---

### 2. `window.listKpiCards` — KPI row above the list

Imports a custom component and renders it as `headerContent` in `ListView` (above the table). The component lives in `windows/custom/{window}/{ComponentName}.jsx`.

**Use when:** the list view needs summary metrics or aggregated data above the records (e.g., total contacts, outstanding credit).

```json
"window": {
  "listKpiCards": {
    "customComponent": "ContactsKpiCards"
  }
}
```

Generator output:
```jsx
import ContactsKpiCards from '@/windows/custom/contacts/ContactsKpiCards';
// …
<ListView headerContent={(p) => <ContactsKpiCards {...p} />} … />
```

Props received: same as `ListView` (`token`, `apiBaseUrl`, `windowName`, `api`, …). **Real example:** `contacts`.

---

### 3. `window.headerExtra` — extra section at the bottom of the detail form

Imports a custom form component and passes it as `formFooter` to `DetailView`. Renders below the main entity form in the detail view.

**Use when:** the detail needs an extra non-standard section that doesn't map 1:1 to a tab (e.g., billing preferences, computed summaries).

```json
"window": {
  "headerExtra": {
    "customForm": "BillingPreferencesForm"
  }
}
```

Generator output:
```jsx
import BillingPreferencesForm from '@/windows/custom/contacts/BillingPreferencesForm';
// …
<DetailView formFooter={BillingPreferencesForm} … />
```

Props received: `recordId`, `data`, `token`, `apiBaseUrl`, `api`. **Real example:** `contacts`.

---

### 4. `window.customComponents` — replace or inject structural components

Injects custom components into specific structural slots of `DetailView`. Each key maps to a component name (file must exist at `windows/custom/{window}/{value}.jsx`).

**Use when:** a specific part of the standard layout needs a fully custom implementation.

```json
"window": {
  "customComponents": {
    "topbarRight":    "GoodsShipmentActions",
    "bottomSection":  "InvoiceBottomPanel",
    "sidePanel":      "PaymentActivityPanel",
    "sidePanelStyle": { "width": "40%", "minWidth": 260 },
    "headerTable":    "InvoiceHeaderTable"
  }
}
```

| Key | Prop emitted | Renders where | Props received |
|-----|-------------|---------------|----------------|
| `topbarRight` | `topbarRight={X}` | Right side of detail topbar (replaces status badge) | `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess` |
| `bottomSection` | `bottomSection={X}` | Bottom of detail view (replaces totals + footer) | `recordId`, `data`, `token`, `apiBaseUrl`, `api`, `summary`, `notesField`, `onFieldChange`, `notesFocused`, `setNotesFocused` |
| `sidePanel` | `sidePanel={X}` | Right-side panel alongside the detail form | `recordId`, `data`, `token`, `apiBaseUrl` |
| `sidePanelStyle` | `sidePanelStyle={…}` | CSS style for the side panel container | — (style object, not a component) |
| `headerTable` | replaces `{Entity}Table` import | List table in the master list view | Standard table props |

**Real examples:**
- `topbarRight`: `goods-shipment` (`GoodsShipmentActions`), `sales-invoice` (`InvoiceTopbarExtra`)
- `bottomSection`: `payment-in` (`PaymentBottomPanel`), `sales-invoice` (`InvoiceBottomPanel`)
- `sidePanel`: `payment-in` (`PaymentActivityPanel`)
- `headerTable`: `sales-invoice` (`InvoiceHeaderTable`)

---

### 5. `window.menuActions` — extra items in the "more" menu

Adds actions to the triple-dot menu in the detail view. Visibility can be gated by document status.

**Use when:** there are secondary document actions (cancel, duplicate, reverse) that don't fit in the main topbar.

```json
"window": {
  "menuActions": [
    { "key": "duplicate", "label": "Duplicate" },
    { "key": "cancel",    "label": "Cancel",          "destructive": true, "visibleWhenStatus": "CO" },
    { "key": "reverse",   "label": "Reverse Payment", "destructive": true, "visibleWhenStatus": ["RPPC", "RPR"], "columnName": "aPRMReversePayment" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier. |
| `label` | string | Display label in the menu. |
| `destructive` | boolean | Renders in red. |
| `visibleWhenStatus` | string \| string[] | Only show when `documentStatus` matches. Omit to always show. |
| `columnName` | string | If set, fires `hook.handleProcess(columnName)`. If omitted, an empty `onClick` placeholder is generated. |

**Real examples:** `goods-shipment` (cancel), `payment-in` (reverse), `sales-invoice` (duplicate, cancel).

---

### 6. `window.layoutType` — alternative page layouts

Switches the entire page to a different layout type.

**Use when:** the standard ListView/DetailView isn't suitable for the data model.

```json
"window": {
  "layoutType": "gallery"
}
```

| Value | Behavior | Extra config |
|-------|----------|-------------|
| `"default"` | Standard ListView + DetailView | — |
| `"kanban"` | `KanbanBoard` from `contract-ui` | `templateConfig.groupByField`, `columns`, `cardTitle`, etc. |
| `"calendar"` | `CalendarView` from `contract-ui` | `templateConfig.dateField`, `eventTitle`, etc. |
| `"gallery"` | Card gallery list + optional sidebar detail | Components in `windows/custom/{window}/`: `{Name}Gallery.jsx`, `{Name}Sidebar.jsx`, `{Name}DetailHeader.jsx` |
| `"custom"` | Pipeline generates a scaffold only; developer builds on top | Components in `windows/custom/{window}/index.jsx` |

See `docs/window-templates.md` for full `templateConfig` reference.

**Real examples:** `product` (gallery), many kanban/calendar windows.

---

### 7. `window.relatedDocuments` — related documents panel

Adds a "Related Documents" tab/section to the detail view. Requires a hand-written `RelatedDocuments.jsx` in `windows/custom/{window}/`.

**Use when:** the record links to other documents (orders, shipments, invoices) and users need to navigate between them.

```json
"window": {
  "relatedDocuments": true
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

### 8. `window.notesField` — notes panel

Renders a designated field as an expandable notes panel in the detail view footer.

```json
"window": {
  "notesField": "description"
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

### 9. `window.hideDeleteWhenComplete` — conditional delete button

Hides the delete button when the document is not in Draft status.

```json
"window": {
  "hideDeleteWhenComplete": true
}
```

**Real examples:** `goods-shipment`, `payment-in`, `sales-invoice`.

---

## Decision tree: which option to use?

```
I need to customize the UI of a window
│
├─ It's a completely different layout (kanban, calendar, gallery)
│   └─ → layoutType in decisions.json
│
├─ The whole window is too custom for any generated layout
│   └─ → layoutType: "custom" + write index.jsx in windows/custom/
│
├─ The standard layout works, but I need to extend specific parts:
│   │
│   ├─ KPI cards / metrics above the list (ListView)
│   │   └─ → window.listKpiCards
│   │
│   ├─ Numeric/progress summary bar above the detail form
│   │   └─ → window.statusBar (declarative, no JSX needed)
│   │
│   ├─ Extra section below the main detail form
│   │   └─ → window.headerExtra
│   │
│   ├─ Replace the right side of the topbar (actions/status)
│   │   └─ → window.customComponents.topbarRight
│   │
│   ├─ Replace the entire bottom panel (totals, footer)
│   │   └─ → window.customComponents.bottomSection
│   │
│   ├─ Add a side panel alongside the detail form
│   │   └─ → window.customComponents.sidePanel + sidePanelStyle
│   │
│   ├─ Replace the master list table
│   │   └─ → window.customComponents.headerTable
│   │
│   └─ Secondary document actions (cancel, reverse, duplicate)
│       └─ → window.menuActions
│
└─ Cross-cutting behavior (notes, delete protection, related docs)
    ├─ → window.notesField
    ├─ → window.hideDeleteWhenComplete
    └─ → window.relatedDocuments
```

---

## How custom components survive regeneration

Custom components live in `tools/app-shell/src/windows/custom/{window}/` (the app-shell source, **not** in `artifacts/`). The pipeline never touches files in that directory.

The generated `*Page.jsx` in `artifacts/{window}/generated/` imports them by name. On re-generation, the `*Page.jsx` is overwritten — but the imports are re-emitted from `decisions.json`, so the wiring stays correct.

```
tools/app-shell/src/windows/custom/contacts/
    ContactsKpiCards.jsx       ← hand-written, never touched
    BillingPreferencesForm.jsx ← hand-written, never touched

artifacts/contacts/generated/web/contacts/
    BpartnerPage.jsx           ← regenerated, imports the above via decisions.json
```

**Adding a new custom component:**

1. Create the component in `windows/custom/{window}/{ComponentName}.jsx`
2. Add the appropriate key to `decisions.json → window.*`
3. Run `node cli/src/generate-frontend.js {window}` (or full pipeline)
4. The generated `*Page.jsx` now imports and wires your component automatically

