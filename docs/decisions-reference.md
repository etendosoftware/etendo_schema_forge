# Decisions.json Reference

Complete reference for all configurable options in `decisions.json` files. These files store human and AI-curated design decisions for each window/process, controlling what fields appear, how they behave, and how the UI renders.

## File Structure

```json
{
  "$schema": "decisions-v2",
  "version": 2,
  "window": { "category": "sales", "name": "Sales Order" },
  "discardPatterns": ["EM_*"],
  "entities": {
    "header": { ... },
    "lines": { ... }
  },
  "rules": { ... }
}
```

## Root-Level Properties

| Property | Type | Required | Default | Purpose |
|----------|------|----------|---------|---------|
| `$schema` | string | No | `"decisions-v1"` | Schema identifier (e.g., `"decisions-v2"`). Auto-set by migration runner. |
| `version` | number | No | `1` | Numeric schema version. Current: 2. See `docs/decisions-versioning.md`. |
| `window` | object | Yes | — | Window-level metadata. |
| `entities` | object | Yes | — | Entity definitions keyed by entity name. |
| `rules` | object | No | `{}` | Business rule catalog. |
| `discardPatterns` | array | No | `[]` | Glob patterns to auto-discard fields. |
| `labelOverrides` | object | No | `{}` | Per-locale label overrides for field columns. See below. |

## Label Overrides (`labelOverrides`)

Per-locale field label overrides. When the simplified interface needs to rename a field differently from the base Etendo AD translation, add it here instead of modifying the global locale dictionary.

**Schema:**
```json
{
  "labelOverrides": {
    "es_ES": {
      "C_BPartner_ID": "Cliente",
      "DateOrdered": "Fecha de Pedido"
    },
    "en_US": {
      "C_BPartner_ID": "Customer"
    }
  }
}
```

**Resolution chain** (frontend `useLabel`):
1. `labelOverrides[currentLocale][columnName]` — per-window override (this section)
2. `dictionary.fields[columnName].label` — Etendo AD translation from `extract-labels.js`
3. `null` — caller falls back to raw label from spec

**How to use:**
- Pass `spec?.window?.labelOverrides` to `useLabel()` in components that have access to the loaded spec
- `resolve-curated.js` forwards `labelOverrides` to `schema.window.labelOverrides` automatically
- Generated pages forward `labelOverrides` to `ListView`, which threads it down to:
  - `DataTable` (column headers)
  - The sort dropdown ("Ordenar por")
  - `ListFilterBar` → `AdvancedFilterBuilder` (column selector and "Selector de {label}" header in the funnel popover)
  - `DetailView` and `EntityForm` (form labels)

## Window Properties (`window.*`)

| Property | Type | Default | Values | Purpose |
|----------|------|---------|--------|---------|
| `category` | string | Inferred | `"sales"`, `"purchases"`, `"inventory"`, `"finance"`, `"accounting"`, `"master"`, `"project"`, `"general"` | UI routing and navigation grouping. |
| `name` | string | From AD | — | Display name for breadcrumbs and titles. |
| `agentPrompt` | string | `null` | Free text | Spec-level guidance for AI agents that consume the NEO Headless MCP server. Surfaced in `agentProfile.agentPrompt` (contract) and persisted to `ETGO_SF_SPEC.AGENT_PROMPT`, from where `neo_discover` returns it per spec. Empty or whitespace-only values clear the persisted prompt and are omitted from the MCP response. |
| `layoutType` | string | `"default"` | `"default"`, `"kanban"`, `"calendar"`, `"list-modal"`, `"custom"` | Frontend rendering mode. See `docs/window-templates.md`. |
| `templateConfig` | object | `null` | Layout-specific | Extra config for non-default layouts. `kanban`/`calendar`: `groupBy`, `dateField`, etc. `list-modal`: `titleKey`, `editTitleKey`, `bannerKey`, `searchPlaceholderKey`, `newLabelKey`, `autoPriorityField`, `autoPriorityStep`, `sections` (ordered `[{ key, label }]`), `backLabelKey` (toolbar back-button i18n key; default `cancel`), `backTo` (route to navigate to on back; defaults to history `-1`), `toolbarFilters` (declarative dropdown filters `[{ key, field, allLabelKey, options: [{ value, labelKey }] }]`, applied client-side over the loaded rows). All strings are i18n keys. See the `list-modal` section in `docs/window-templates.md`. |
| `detailEntity` | string \| null | Auto-inferred | Entity name or `null` | Explicitly sets which entity is the detail/lines tab. When omitted, the generator picks the first non-primary entity automatically. Set to `null` to create a header-only page (no detail tab). Set to a specific entity name to override the auto-inference. |
| `relatedDocuments` | boolean | `false` | — | Enables the Related Documents footer in the detail view. Requires a hand-written `RelatedDocuments.jsx` in `artifacts/{window}/custom/`. The generator emits the import and `customTabs` prop automatically. |
| `attachments` | boolean \| object | `true` | See below | Adds an "Attachments" tab to the detail view. Auto-enabled on every window with `layoutType: "default"`. Set to `false` to opt out; pass an object to tune client-side limits. See the Attachments subsection below. |
| `notesField` | string | `null` | Any entity field name | Field to display as a notes/description panel in the detail view footer (e.g., `"description"`). Rendered as an expandable text input. |
| `documentPreview` | object | `null` | `{ titlePrefix: string }` | Enables the document preview button in the detail header. `titlePrefix` is shown in the preview drawer title (e.g., `"Order"`, `"Invoice"`). |
| `breadcrumb` | string | `"{category} / {name}"` | Any string | Overrides the auto-generated breadcrumb path shown in the topbar. Useful when the default category/name combination is too verbose (e.g., `"Product"` instead of `"Reference / Product"`). |
| `hidePrint` | boolean | `false` | — | Hides the print button in the detail view action bar. |
| `hideMoreMenu` | boolean | `false` | — | Hides the triple-dot "more" menu in the detail view action bar. |
| `hideStatusFilter` | boolean | `false` | — | Hides the status-filter dropdown ("All statuses") in the list toolbar, even when a `status`-typed column exists. The rest of the filter bar (date filter, Filters) is unaffected. |
| `customListIcons` | boolean | `false` | — | Swaps the list toolbar sort/refresh icons for the shared `SortIcon` / `RefreshIcon` set (`@/components/ui/custom-icons`), matching Contacts/Warehouse. Emits `SortIconComponent` / `RefreshIconComponent` on `ListView`. |
| `contentBg` | string | `"bg-white"` | Any Tailwind bg class | Background color of the main content card in the detail view (e.g., `"bg-slate-50"` for a light gray tone). |
| `formCardPadding` | string | `null` | Any Tailwind padding class | Override the Tailwind padding class applied to the form card div in the detail view. When `null`, `DetailView` falls back to `p-6`. Use `"px-2 pb-2"` for tighter (8px horizontal) padding, for example on windows with dense form layouts. |
| `hideDeleteWhenComplete` | boolean | `false` | — | Hides the delete button in the detail view when the document status is not Draft. Prevents accidental deletion of completed/processed records. |
| `customComponents` | object | `null` | See below | Override generated components with custom ones from `artifacts/{window}/custom/`. The generator emits the correct imports and props automatically. |
| `menuActions` | array | `[]` | See below | Additional actions in the detail view's "more" menu (triple dot). Each action can have visibility conditions based on document status. |
| `newActions` | array | `[]` | See below | Additional actions in the split "New" button dropdown in the list view. Each action can optionally open a custom modal component. |
| `processOverrides` | object | `{}` | See below | Override presentation and behavior of process buttons in the detail view. Keys are process names or column names. See Process Overrides subsection. |
| `detailSortBy` | string | `null` | Any valid sort expression | Default sort order for the detail entity tab (e.g., `"sEQNoAsset asc"`). Passed directly to DetailView as the `detailSortBy` prop. |
| `statusBar` | object | `null` | See below | Generates a summary status bar above the detail form showing key numeric fields and an optional progress indicator. |
| `subsetFilters` | array | `null` | See below | Segmented, radio-style filter above the list. One is always active, mutually exclusive, applied before any other filter. Ideal for "which universe am I looking at" selectors (e.g., All / Customers / Vendors). |
| `quickFilters` | array | `null` | See below | Independent toggle pills above the list. Each can be on/off; multiple can be active simultaneously. Combined with the active subset and column filters using AND. Ideal for "refinements" (e.g., only overdue, only pending delivery). |
| `rowQuickActions` | object | _absent_ (feature ON with canonical defaults) | See below | Hover-revealed action overlay on each grid row. The feature is ON by default for every window with canonical actions (Edit / Duplicate / Email / Delete) plus a kebab containing everything from `menuActions` — **no contract block is emitted in that case**. Declare the section only to disable the feature (`enabled: false`), override an action's visibility (`actions.<key>.show: false` / `visibleWhen`), or promote a process to a fixed button (`show: "fixed"`). |
| `sendDocument` | object | _absent_ (auto-enabled on documental windows) | See below | Send/Download envelope config forwarded to the generic `SendDocumentModal`. Auto-enabled when the header exposes `documentNo`; declare it only to disable (`enabled: false`), drop the email panel (`allowEmail: false`), or tune the recipient-edit policy (see the Send Document subsection below). |
| `balanceFooter` | object | `null` | `{ debitField, creditField }` | Renders a debit/credit balance footer (Σ debit, Σ credit, difference, balanced ✓/✗ badge) for double-entry windows (e.g. manual journals). Both fields must be amount-typed fields on the lines entity. When set, the generator emits `BalanceFooterPanel` instead of `DocumentTotalsPanel` and disables the Save button (with a tooltip) only when the entry is unbalanced (Σ debit ≠ Σ credit). An empty/zero entry is treated as balanced and is savable as a draft; the ✓/✗ badge is hidden until the lines carry amounts. Validator F17 enforces field existence. Example: `"balanceFooter": { "debitField": "amtSourceDr", "creditField": "amtSourceCr" }`. |
| `linesLayout` | string | `"classic"` | `"classic"`, `"inlineEditable"` | Lines tab rendering mode. `"classic"` keeps the side-panel edit flow (current behavior). `"inlineEditable"` switches the table to `InlineLinesPanel`: pencil + trash hover-action icons on the right, single-row inline edit triggered by the pencil, autosave on blur. All column types (string, number, amount, percent, date, selector, search) are inline-editable; selector/search columns use `InlineSearchCombo` (text input with server-side search) so FK fields with many options are filterable by typing. The add-line button, related-documents panel, notes panel and totals panel are unchanged. Validator F12 enforces the enum. |

### Send Document (`window.sendDocument`)

Recipient-edit policy overrides (ETP-4226). The generator copies these keys
verbatim into the generated `sendDocument` prop; ListView forwards the object
to `SendDocumentModal` as `sendPolicy`. Absence of a key means the shared
default applies — editable To/CC chips are the platform default, so **no
window needs this section at launch**.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `editableRecipients` | boolean | `true` | Set to `false` to restore the read-only To input (recipients locked to the server-resolved contact). |
| `cc` | boolean | `true` | Set to `false` to hide the "Add CC" affordance (no CC channel). |
| `maxRecipients` | number | `10` | Maximum recipients across To and CC. Must not exceed the backend contract limit. |

```json
{
  "window": {
    "sendDocument": {
      "editableRecipients": false,
      "cc": false,
      "maxRecipients": 5
    }
  }
}
```

### Status Bar (`window.statusBar`)

Generates a `{WindowName}StatusBar` component inside `@sf-generated` markers. The component renders colored metric cards and an optional progress bar.

```json
{
  "statusBar": {
    "cards": [
      { "field": "depreciatedValue", "label": "Depreciated Value", "color": "blue", "icon": "TrendingDown" },
      { "field": "depreciatedPlan",  "label": "Depreciated Plan",  "color": "teal", "icon": "TrendingDown" }
    ],
    "progress": {
      "numerator": "depreciatedValue",
      "denominator": "assetValue",
      "condition": "depreciate",
      "label": "Depreciation",
      "color": "orange",
      "completedColor": "green",
      "completedIcon": "CheckCircle2"
    }
  }
}
```

**`cards` array** — each card is a colored metric tile:

| Property | Type | Purpose |
|----------|------|---------|
| `field` | string | Entity field name to display (formatted as a number). |
| `label` | string | Label shown below the value. |
| `color` | string | One of `blue`, `teal`, `orange`, `green`. Controls Tailwind color classes. |
| `icon` | string | Lucide icon name (e.g., `TrendingDown`, `CheckCircle2`). Auto-imported. |

**`progress` object** — optional progress bar card (shows percentage):

| Property | Type | Purpose |
|----------|------|---------|
| `numerator` | string | Entity field for the numerator of the percentage. |
| `denominator` | string | Entity field for the denominator. |
| `condition` | string | Boolean entity field — progress only renders when this is `true` or `'Y'`. |
| `label` | string | Label shown below the percentage. |
| `color` | string | Color when progress is incomplete (e.g., `orange`). |
| `completedColor` | string | Color when progress reaches 100% (e.g., `green`). |
| `completedIcon` | string | Lucide icon shown at 100% (e.g., `CheckCircle2`). |

The generator emits `headerContent={(data) => <{WindowName}StatusBar data={data} />}` on the DetailView prop automatically.

### Attachments (`window.attachments`)

Adds a generic "Attachments" tab to the detail view, sitting alongside the standard tabs (Lines, Notes, Related Documents, etc.). The tab is **auto-enabled** on every window whose `layoutType` is `"default"` — no opt-in required. Set `attachments: false` to disable it on a specific window, or pass an object to tune client-side limits.

**Layout gate:** the tab only renders when `window.layoutType === "default"`. Kanban, calendar, gallery, and custom layouts never get the tab, regardless of the `attachments` value.

**Short form** (boolean toggle):
```json
{
  "window": {
    "attachments": true
  }
}
```

**Opt-out:**
```json
{
  "window": {
    "attachments": false
  }
}
```

**Extended form** (object with client-side limits):
```json
{
  "window": {
    "attachments": {
      "enabled": true,
      "maxSizeMB": 10,
      "allowedMimeTypes": ["application/pdf", "image/*"]
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master toggle. Set to `false` for the same effect as `attachments: false`. |
| `maxSizeMB` | number | `10` | Max file size enforced client-side before upload. The NEO servlet has its own hard limit of 10 MB (`MultipartConfig`); raising this beyond 10 will surface a server error. |
| `allowedMimeTypes` | string[] | `undefined` (any) | MIME-type allow-list applied client-side. Supports wildcards like `"image/*"`, `"application/*"`. When omitted, every MIME type is accepted. |

**Note:** the frontend resolves the target `tableName` from `frontendContract.entities.header.tableName` automatically — you do **not** configure it in `decisions.json`. The tab does a lazy fetch on activation (no request until the user opens it). Backend storage uses the standard Etendo `AttachImplementationManager` and the `C_FILE` table.

### Custom Panel Tabs (`window.customPanelTabs`)

Adds custom tabs to the bottom tab strip in the detail view, alongside the standard Attachments tab. The generator reads this array and emits the corresponding `customTabs` prop on `DetailView`. Each tab maps to a component imported from `tools/app-shell/src/windows/custom/{window}/`.

Use this when a window needs supplementary panels (e.g., a pricing breakdown, a related-document viewer, a custom notes area) that sit at the same level as Attachments without modifying generated code.

```json
{
  "customPanelTabs": [
    { "key": "pricing", "labelKey": "price", "component": "ProductPriceBar" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique tab identifier. Used as the tab's `key` prop. |
| `labelKey` | string | i18n key resolved through `useUI()`. Rendered as the tab label. |
| `component` | string | Component name from `tools/app-shell/src/windows/custom/{window}/`. The generator imports it automatically. |

**Note:** Use `customTabsAfterBottom: true` alongside this property to position the custom tabs after the standard bottom section (lines, notes, etc.) rather than interleaved with primary tabs.

### Subset Filters (`window.subsetFilters`)

> See [`list-filters.md`](list-filters.md) for the full toolbar layout (subset / quick / document-type / advanced), URL-param conventions, and when to use which surface.

Radio-style segmented control above the list. Exactly **one** entry is always active (first one by default). Clicking a different entry switches selection; clicking the already-active entry does nothing. Filters are applied to the backend query **before** quick filters and column filters.

Use when the window exposes mutually exclusive views of the data — i.e., the user is choosing "which slice am I looking at".

```json
{
  "subsetFilters": [
    { "label": "all" },
    {
      "label": "Customers",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22customer%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"
    },
    {
      "label": "Vendors",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22vendor%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"
    }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | i18n key resolved through `useUI()`. Rendered as the button text. |
| `filter` | string | Optional. URL-encoded `criteria=...` string applied to the list API query. Omit for an "All" / no-filter option. |
| `rowFilter` | function | Optional. Client-side predicate `(item) => boolean` used in addition to the backend `filter`. Only relevant when the generator passes a JS function reference (not used in plain `decisions.json`). |

**Behavior:**
- Always exactly one active — first entry wins on initial mount.
- Replaces (never adds to) the selection — pure segmented control.
- Combined with `quickFilters` and column filters via AND at the backend query level.

### Quick Filters (`window.quickFilters`)

Independent toggle pills above the list. Each pill can be on or off — any subset (including empty) is valid. Refines the active `subsetFilters` row selection further.

Use when the window has optional refinements that the user turns on or off individually — e.g., "show only overdue", "only pending delivery".

```json
{
  "quickFilters": [
    {
      "label": "overdueOnly",
      "filter": "criteria=%5B%7B%22fieldName%22%3A%22dueDate%22%2C%22operator%22%3A%22lessThan%22%2C%22value%22%3A%22today%22%7D%5D"
    },
    {
      "label": "pendingDeliveryOnly",
      "filter": "criteria=..."
    }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | i18n key resolved through `useUI()`. Rendered as the button text. |
| `filter` | string | URL-encoded `criteria=...` string applied when the pill is active. |
| `rowFilter` | function | Optional. Client-side predicate, same semantics as `subsetFilters.rowFilter`. |

**Behavior:**
- Multi-select — clicking toggles the pill independently.
- All active pills' criteria are merged with the active subset via AND.
- Starts empty unless the parent component passes `initialQuickFilterIndex` (only the 4 custom sales/purchase windows do this today).

### Row Quick Actions (`window.rowQuickActions`)

Hover-revealed action overlay on each row of the list grid. Mirrors the edit-view toolbar so users can run common actions without opening the record. ETP-3914.

**Feature is ON by default for every window — no contract block is needed.** The runtime renders the four canonical actions plus the kebab automatically when `decisions.json` does not declare the section. You only declare this block to:
- disable the feature on a specific window (`enabled: false`),
- hide one of the canonical actions (`actions.<key>.show: false`),
- promote a non-canonical process to a fixed button (instead of the kebab),
- attach a `visibleWhen` predicate to an action.

When you do declare it, write **only the delta** — there is no need to repeat `enabled: true` or `actions.edit.show: true`. Defaults are resolved at runtime.

```json
{
  "rowQuickActions": {
    "enabled": true,
    "editMode": "navigate",
    "actions": {
      "edit":      { "show": true },
      "duplicate": { "show": true },
      "email":     { "show": true },
      "delete":    { "show": true },
      "completeOrder": { "show": "fixed", "visibleWhen": "@DocumentStatus@='DR'" },
      "voidIt":        { "show": "kebab" }
    }
  }
}
```

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `enabled` | boolean | `true` | Toggle the entire overlay for this window. When `false`, the generator skips emission and the list behaves as before. |
| `editMode` | string | `"navigate"` | `"navigate"` opens the detail view (same as double-click). `"inline"` is reserved for inline-row editing and currently shows a "coming soon" toast. |
| `actions` | object | Canonical four shown | Per-action overrides. Keys are either canonical (`edit`, `duplicate`, `email`, `delete`) or a process key declared in `menuActions[].key` / `processOverrides`. |

Each entry in `actions` accepts:

| Property | Type | Purpose |
|----------|------|---------|
| `show` | boolean \| string | `true` (default) renders the action. `false` removes it from both the fixed buttons and the kebab. `"fixed"` promotes a non-canonical action to a fixed button slot (after the canonical four, before the kebab). `"kebab"` forces an action into the kebab dropdown only. |
| `visibleWhen` | string | Optional Etendo display-logic predicate (`@Field@='Value'`, AND-chained, `!=` supported). Evaluated against the row data and ANDed with the existing edit-view visibility rules (delete gate, `documentPreview`, `action.visible`). |

**Canonical keys are always valid** — `edit`, `duplicate`, `email`, `delete` never need a matching `menuActions` entry. Non-canonical keys must exist in `window.menuActions` or `window.processOverrides`; the pipeline validator F11 enforces this.

**Resolution behavior** (`resolve-curated.js`):
- Section absent in `decisions.json` → no `rowQuickActions` block is written to the contract. The feature still mounts at runtime with canonical defaults.
- Section declared → copied verbatim to the contract. The runtime merges canonical defaults on top, so a partial declaration like `{ actions: { email: { show: false } } }` hides email without affecting the other canonical buttons.

**Generator behavior** (`generate-frontend.js`):
- When the contract has `enabled === false`, the `rowQuickActions` prop is omitted from `<ListView>` and no row overlay is mounted.
- Otherwise the prop is always emitted — either with the declared delta or as `{}` for windows that use full defaults. Runtime handlers (`onEdit`, `onClone`, `onEmail`, `onDelete`, `onMenuActionExecuted`) are wired by the host page or `ListView` itself.

### Subset vs Quick — when to use which

| Signal | Use `subsetFilters` | Use `quickFilters` |
|--------|---------------------|--------------------|
| "Which slice am I viewing?" (tabs/segments) | ✅ | ❌ |
| "Refine the current slice" (on/off flags) | ❌ | ✅ |
| Always at least one active | ✅ | ❌ |
| Can all be off | ❌ | ✅ |
| Mutually exclusive | ✅ | ❌ |
| Combinable | ❌ | ✅ |

The two can coexist in the same window — subsets render first (segmented control), quick filters render after (toggle pills).

### Custom Components (`window.customComponents`)

Override generated components with custom implementations from `artifacts/{window}/custom/`. The generator emits the correct imports and DetailView props automatically.

```json
{
  "customComponents": {
    "headerTable": "InvoiceHeaderTable",
    "bottomSection": "InvoiceBottomPanel",
    "topbarRight": "InvoiceTopbarExtra"
  }
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `headerTable` | string | Custom table component name. Replaces the generated `{Entity}Table` import. File must exist at `artifacts/{window}/custom/{value}.jsx`. |
| `bottomSection` | string | Custom bottom panel component. Replaces the default totals + footer layout. Receives `recordId`, `data`, `token`, `apiBaseUrl`, `api`, `summary`, `notesField`, `onFieldChange`, `notesFocused`, `setNotesFocused`. |
| `topbarRight` | string | Custom component rendered on the right side of the detail topbar (before icon buttons). Receives `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `onProcess`. When present, the default status badge is hidden. |

### Menu Actions (`window.menuActions`)

Additional actions shown in the detail view's "more" menu (triple dot icon). Each action can have visibility conditions based on document status.

```json
{
  "menuActions": [
    { "key": "duplicate", "label": "Duplicate" },
    { "key": "cancel", "labelKey": "cancel", "destructive": true, "visibleWhenStatus": "CO" },
    { "key": "reactivate", "labelKey": "reactivate", "visibleWhenStatus": "CO", "visibleWhenFieldFalse": "hasLinkedDocuments", "documentAction": "RE", "successKey": "actionCompleted" },
    { "key": "reverse", "label": "Reverse Payment", "destructive": true, "visibleWhenStatus": ["RPPC", "RPR"], "columnName": "aPRMReversePayment" },
    { "key": "post", "label": "Post", "labelKey": "post", "action": "post", "successKey": "documentPosted" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier for the action. |
| `label` | string | Display label in the menu. |
| `labelKey` | string | i18n key for the label (alternative to `label`). |
| `destructive` | boolean | If `true`, renders in red as a destructive action. |
| `visibleWhenStatus` | string or string[] | Only show the action when document status matches. Omit to always show. |
| `visibleWhenFieldTrue` | string | Show the action only when the named field in the record `data` **is** truthy. Etendo `'Y'`/`'N'`-aware: the field is treated as true when it equals the string `'Y'` or boolean `true`. Combines with `visibleWhenStatus` using AND. Requires the backend to expose the field (e.g. via a NeoHandler `afterHandle`). When used, the generator emits `({ data, status }) =>` instead of `({ status }) =>`. Emitted as `(data?.<field> === 'Y' || data?.<field> === true)`. |
| `visibleWhenFieldFalse` | string | Show the action only when the named field in the record `data` is **not** true — the exact logical complement of `visibleWhenFieldTrue`. Etendo `'Y'`/`'N'`-aware: a field of `'N'` (which is a truthy JS string!) correctly counts as "false", so an unposted (`posted='N'`) document still shows the action. Combines with `visibleWhenStatus` using AND. Requires the backend to expose the field. When used, the generator emits `({ data, status }) =>` instead of `({ status }) =>`. Emitted as `!(data?.<field> === 'Y' || data?.<field> === true)`. |
| `documentAction` | string | Invokes the standard DocAction endpoint with this value (`"RE"`, `"CO"`, `"VO"`, etc.). The record refreshes automatically on success. |
| `columnName` | string | If set, triggers the named process column via `hook.handleProcess`. If omitted (and no `action`), generates an empty `onClick` placeholder. |
| `action` | string | Invokes a generic NEO action endpoint (`POST {apiBaseUrl}/{entity}/{recordId}/action/{action}`) via the `useNeoAction` hook — e.g. `"post"` / `"unpost"`. The backend must handle the named action server-side. Emitted as `neoAction: '<value>'` in the contract. **Handler precedence:** `documentAction` > `columnName` > `action` > empty `onClick`. |
| `successMessage` | string | Text shown in the success banner after `documentAction` resolves. |
| `successKey` | string | i18n key for the success banner message (alternative to `successMessage`). |

### New Actions (`window.newActions`)

Additional actions shown in the dropdown of the split "New" button in the list view. The `ChevronDown` caret is only visible when at least one action is declared.

```json
{
  "newActions": [
    { "key": "import-csv", "label": "Import from CSV", "component": "ImportCsvModal" },
    { "key": "duplicate", "label": "Duplicate last" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier for the action. Also used as `data-testid="action-new-{key}"`. |
| `label` | string | Display label in the dropdown menu. |
| `component` | string | Optional. Name of a custom component in `tools/app-shell/src/windows/custom/{window}/`. When set, the generator imports it, creates a `show{Key}Modal` state, and passes `onClick: () => setShow{Key}Modal(true)`. If omitted, generates an empty `onClick` placeholder. |

The component receives: `token`, `apiBaseUrl`, `windowName`, `onClose`. The `token` prop remains for legacy compatibility while existing generated custom components are migrated. New or migrated components that need authenticated API calls should use `useApiFetch(apiBaseUrl)` instead of constructing raw auth headers.

### Process Overrides (`window.processOverrides`)

Override the presentation and behavior of process buttons rendered in the detail view. Each key is a process name or column name from the backend contract. The generator matches overrides by `p.name` first, then falls back to `p.columnName`.

```json
{
  "processOverrides": {
    "completeOrder": { "label": "Approve", "style": "positive" },
    "voidOrder": { "exclude": true },
    "customAction": { "add": true, "label": "Custom Action", "style": "neutral", "displayLogicRaw": "data.status === 'DR'" }
  }
}
```

Each override entry supports the following properties:

| Property | Type | Purpose |
|----------|------|---------|
| `label` | string | Override the default process label. |
| `style` | string | Button style: `"positive"`, `"destructive"`, `"neutral"`. Default inferred from name. |
| `displayLogicRaw` | string | JavaScript expression controlling button visibility (e.g., `"data.status === 'DR'"`). |
| `exclude` | boolean | If `true`, hides this process button entirely. |
| `add` | boolean | If `true`, defines a new process button not present in the backend contract. |
| `columnName` | string | Column name to include in the action POST payload (used with `add: true` when the process maps to a specific column). |
| `requiresLines` | boolean | If `true`, the button is disabled until at least one line exists. |
| `requiresFieldMax` | array | Validation rules checked before firing the action. Each entry: `{ field, max, conditionalOnField?, conditionalValue?, errorKey }`. |
| `params` | array | Parameter definitions for a pre-process dialog. When at least one non-hidden param is present, clicking the button opens `ProcessParamDialog` first; the collected values are passed to `handleProcess` as `paramValues`. Each entry: `{ key, type, label, required?, hidden?, options? }`. Supported `type`: `"select"` (renders a dropdown using `options: [{ value, label }]`). The first option is pre-selected. See [Process Parameter Dialog](#process-parameter-dialog-params) below. |

When `style` is not specified, the generator defaults to `"destructive"` for processes whose names contain destructive keywords (e.g., `void`, `cancel`, `reverse`) and `"positive"` for all others.

#### Process Parameter Dialog (`params`)

When a `processOverrides` entry contains a `params` array with at least one entry where `hidden !== true`, the detail toolbar button opens `ProcessParamDialog` before invoking the process. The dialog collects the user's choices and passes them as `paramValues` to `hook.handleProcess(process, paramValues)`, which merges them into the `fieldValues` POST body.

**Example — Open/Close Period Control:**

```json
"processOverrides": {
  "openClose": {
    "params": [
      {
        "key": "openClose",
        "type": "select",
        "label": "Action",
        "required": true,
        "options": [
          { "value": "O", "label": "Open" },
          { "value": "C", "label": "Closed" },
          { "value": "P", "label": "Permanently closed" }
        ]
      }
    ]
  }
}
```

The backend NeoHandler receives the chosen value via `context.getRequestBody().optJSONObject("fieldValues").optString("openClose", null)`.

Hidden params (`hidden: true`) are excluded from the dialog but can be used in future for server-side context passing.

## Entity Properties (`entities.{entityName}.*`)

Entity keys use **camelCase from tabName** (e.g., `"header"`, `"lines"`, `"basicDiscounts"`).

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `name` | string | Entity key | Override display name. |
| `exclude` | boolean | `false` | Omit entire entity from schema. |
| `fields` | object | `{}` | Field-level decisions. |
| `draftMode` | object | `null` | Draft/Processed workflow config. |
| `javaQualifier` | string | `null` | CDI qualifier for custom NeoHandler. |
| `handlesDefaults` | boolean | `true` | **HandleDefaults.** When `true` (default), a new detail line's add-row fetches `GET /{detailEntity}/defaults?parentId=…` on open and pre-fills empty editable fields from the backend-resolved defaults (reusing the header-defaults normalization). Set `false` to opt this detail entity out — the add-row keeps literal-only seeding and no `/defaults` request is made. Emitted to the contract / runtime `api.crud` only when `false`. |

### Line HandleDefaults (`entities.{name}.handlesDefaults`)

When a user opens a new detail line, `DetailView` calls `useEntity.fetchChildDefaults(parentId)` → `GET /{detailEntity}/defaults?parentId=…`, normalizes the response with the same `normalizeDefaultValue` the header uses, and passes it to the add-row as `resolvedDefaults`. `DataTable.buildEmpty` then fills **empty** editable fields (fill-empties-only: literal defaults, the client `lineNo`, parent-derived display seeds, and `skipDefault` fields are never overridden). This is how a line field whose AD default is a macro — e.g. a journal line `Description` defaulting to `@DESCRIPTION1@` (the parent journal's description, resolved by NEO's auxiliary-input pipeline) — gets pre-filled. On by default; opt out per entity (`handlesDefaults: false`) or per field (`skipDefault: true`). Covers the inline add-row of the primary lines tab and secondary detail tabs.

### Draft Mode (`entities.{name}.draftMode`)

Enables a two-button save workflow: "Save Draft" (save only) + "Save & {label}" (save + execute process).

```json
{
  "draftMode": {
    "enabled": true,
    "processField": "documentAction",
    "processValue": "CO",
    "label": "Complete"
  }
}
```

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `enabled` | boolean | `false` | Activate draft mode for this entity. |
| `processField` | string | `"documentAction"` | Field name that controls the process. Used both as the action endpoint name (`/action/{processField}`) and as the key inside `fieldValues`. |
| `processValue` | string | `"CO"` | Value to submit for processing (e.g., `"CO"` = Complete). |
| `label` | string | `"Process"` | Button label suffix: "Save & {label}". |
| `extraParams` | object | `null` | Extra params merged at the **top level** of the action POST body (not inside `fieldValues`). Required when the AD process validates a mandatory parameter against the request root rather than `fieldValues` — e.g. `M_Internal_Consumption_Post` needs `{ "action": "CO" }`. Example: `"extraParams": { "action": "CO" }`. |
| `completedStatuses` | string[] | _(falls back to `processed`/`documentStatus==='CO'`)_ | When set, only these `documentStatus` values hide the Save/Confirm pair. Omit to let the generic `processed === 'Y'` flag drive button hiding. |

**When disabled** (default): single "Save" button.
**When enabled**: "Save draft" + "Save & {label}" buttons, plus process buttons from `processEndpoints`.

## Field Properties (`entities.{name}.fields.{fieldName}.*`)

Field keys use **camelCase from raw schema** (e.g., `"businessPartner"`, `"orderDate"`).

### Visibility & Display

| Property | Type | Default | Values | Purpose |
|----------|------|---------|--------|---------|
| `visibility` | string | From extraction | `"editable"`, `"readOnly"`, `"system"`, `"discarded"` | User interaction level. See `docs/field-visibility-types.md`. |
| `grid` | boolean | Per visibility | `true`/`false` | Show in list/grid view. |
| `form` | boolean | Per visibility | `true`/`false` | Show in detail/form view. |
| `searchable` | boolean | `false` | `true`/`false` | Enable as filter parameter in list API. |
| `section` | string | `null` | `"principal"`, `"other"`, custom | Group fields into form sections. |
| `inline` | boolean | `false` | `true`/`false` | When `true`, keeps the field in the normal form grid flow even if the generator would otherwise pull it out. Currently relevant for image-type fields: an image field with `inline: true` renders inside the form grid using `row-span-2`, spanning two rows for visual balance instead of being extracted to a separate slot. |
| `skipDefault` | boolean | `false` | `true`/`false` | **HandleDefaults opt-out (per field).** When `true`, the line add-row never applies a backend-resolved default to this field (it stays empty / keeps its literal seed) even when the entity's `handlesDefaults` is on. Emitted to the contract / add-row literal only when `true`. |
| `clearsField` | string | `null` | Sibling field key | **Mutual exclusion.** Names a sibling field that is cleared (set to `0`/empty) whenever this field gets a non-zero value — e.g. a journal line where entering a Debit clears the Credit, and vice versa. The two fields form a "one-of" group: in the inline add-row's required-field check, an empty member is **not** flagged as missing while its partner carries a value (so a debit-only line submits). A required boolean/checkbox is likewise never treated as missing (unchecked is valid). |

**Visibility defaults** (when not overridden):

| Visibility | `grid` | `form` | `searchable` |
|-----------|--------|--------|-------------|
| `editable` | false | true | false |
| `readOnly` | false | true | false |
| `system` | false | false | false |
| `discarded` | false | false | false |

### Grid cell flags

Applied to fields with `grid: true` to control how the list cell renders.

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `gridOrder` | integer | `null` | 1-based insertion position of the column in the grid. Only tagged fields move; untagged fields keep their relative order. |
| `badge` | boolean | `false` | Render an enum/list value as a badge/chip. |
| `inlineToggle` | boolean | `false` | Render a boolean column as an inline `Switch` that `PATCH`es `{entity}/{id}` with `{ [field]: checked }` on change (used by `list-modal` and inline-line layouts). |
| `inlineEdit` | boolean | `false` | Mark a column as inline-editable (carried into the contract as `inlineEdit: true`). Consumed by `list-modal`; editing is also available via the modal. |
| `gridReadOnly` | boolean | `false` | Make an otherwise-editable column read-only in the grid. |
| `grow` | boolean | `false` | Let the column grow to fill available width. |
| `cellType` | string | `null` | Selects a cell renderer from the registry (see below). Generic to any grid; the `list-modal` layout ships a styled set. |

#### Status column rendering (`columnType` and `enumValues`)

Two field-level props control how the grid column renders raw values as labeled badges — without touching the underlying Etendo AD column reference.

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `columnType` | string | Inferred | Forces the grid column renderer. `"status"` renders the cell as a status badge. When absent, the renderer is inferred from the field name/type via `mapFieldType` in `generate-frontend.js`. |
| `enumValues` | array | `null` | Maps raw cell values to display labels. Each entry: `{ "value": "<raw>", "name": "<i18nKeyOrLabel>" }`. The generator emits these as `enumLabels: { '<raw>': '<name>' }` on the table column descriptor. |

**How `enumValues` is resolved at runtime:**

1. `statusLabel()` in `tools/app-shell/src/lib/statusBadge.js` looks up `name` in `dictionary.genericLabels[name]`, then via the active `translate` function, and falls back to rendering `name` literally.
2. `DistinctEnumPicker` (in `AdvancedFilterBuilder.jsx`) reads `enumLabels` to populate the advanced/conditional filter value dropdown — so the filter shows translated labels instead of raw values.
3. `ListFilterBar.jsx` uses the same `enumLabels` to drive the status quick-filter pills above the list.

**Key rules:**

- This is a **Schema Forge display mapping only** — the Etendo AD column reference is never modified.
- The mapping is **per-window**: the same raw value (e.g. `false`) can map to `statusDraft` in one window and a different key (e.g. `statusIncomplete`) in another. The shared `statusLabel` function stays generic.
- `name` should be an existing key in `genericLabels` (in `packages/app-shell-core/src/locales/{es_ES,en_US}.json`) so both locales resolve correctly. If you use a literal string it renders as-is in all locales.
- If you introduce a **new** key, add it to **both** `en_US.json` and `es_ES.json` (per `docs/i18n-guide.md`).
- If the raw schema already supplies `enumValues` (from an AD list reference), `decisions.json` `enumValues` **overrides** them.

**Example — `goods-movements` `processed` field** (an Etendo `YesNo` boolean the API serializes as `true`/`false`):

```json
"processed": {
  "visibility": "readOnly",
  "label": "Status",
  "grid": true,
  "form": false,
  "columnType": "status",
  "enumValues": [
    { "value": "true",  "name": "statusProcessed" },
    { "value": "false", "name": "statusDraft" }
  ],
  "gridOrder": 4
}
```

This renders the badge as "Processed"/"Draft" (EN) and "Procesado"/"Borrador" (ES), reusing the existing `statusProcessed`/`statusDraft` keys from `genericLabels`. The advanced filter and the status quick-filter pill also show these labels instead of raw `true`/`false`.

#### `list-modal` cell renderers (`cellType`)

The `list-modal` grid renders each cell through a registry keyed by `cellType`
(`tools/app-shell/src/components/contract-ui/listModalCells.jsx`). The renderers
are generic and backend-agnostic — every cell reads only from the row payload and
the column descriptor. Set them per grid field in `decisions.json`; the generator
emits them into the contract column descriptors and the page consumes them. When
no `cellType` is set, the cell falls back to a plain value (with enum-label / FK
identifier resolution).

| `cellType` | Extra keys | Renders |
|------------|-----------|---------|
| `priorityPill` | — | A bordered neutral pill with the numeric value. |
| `nameWithSubline` | `subField` (field name whose `$_identifier` feeds the sub-line), `subPrefix` (default `"→ "`) | Bold name plus a muted sub-line sourced from another field. |
| `conditionChip` | `kindField` (discriminator field, e.g. `C`/`S`/`R`), `patternField` (literal-text field), `kindLabels` (map of kind value → i18n key) | A chip with derived text `<kindLabel>: "<pattern>"`. |
| `typePill` | `tones` (map of enum value → tone: `neutral`/`blue`/`green`/`amber`/`red`) | A rounded-full pill showing the enum label, optionally toned. |
| `percent` | — | The numeric value rendered as `N%`. |
| `boldText` | — | The value in semibold (e.g. a count column). |
| `toggle` | — | An inline `Switch` that `PATCH`es `{entity}/{id}` with `{ [field]: checked }`. Equivalent to `inlineToggle`. |

### Reference & Input Mode (FK fields)

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `reference` | string \| null | Auto from targetTable | Catalog name for FK lookup (e.g., `"BusinessPartner"`). Set `null` to omit. |
| `inputMode` | string \| null | Auto from reference type | `"selector"` (dropdown), `"search"` (searchable), `"dependent"` (cascading). Set `null` to omit. |
| `searchSelect` | boolean | `false` | Opt-in: render an `inputMode: "selector"` FK field as the **searchable combobox** (`CreatableSearchSelect`) — text search + select — instead of the plain pick-only dropdown (`SelectorInput`). When absent/false the dropdown rendering is unchanged. Preserves `required`, the empty/null choice (`emptyOptionLabelKey`), and the same selector URL/context. **Not** the same as `searchable` (which enables a field as a list-API filter parameter). |
| `allowCreate` | boolean | `false` | Opt-in (future): on a `searchSelect` field, surface the inline "+ create" action in the combobox. Currently OFF for all windows — the flag flows through the pipeline so a field can wire `createLabel`/`onCreateRequest` later without a generator change. |
| `dependsOn` | object \| null | `null` | Parent field dependency for cascading selectors. |

**dependsOn format:**
```json
{
  "field": "businessPartner",
  "filterKey": "C_BPartner_ID"
}
```

Setting `dependsOn` automatically sets `inputMode` to `"dependent"`.

### Logic & Behavior

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `name` | string | Raw field name | Override field's public API name. |
| `required` | boolean | From AD mandatory | Force field as required. |
| `min` | number | `undefined` | Minimum allowed value for numeric fields. On blur the UI autocorrects values below this limit to `min`. Travels through the full pipeline (`decisions.json` → contract → generated FieldDefs). |
| `max` | number | `undefined` | Maximum allowed value for numeric fields. On blur the UI autocorrects values above this limit to `max`. Travels through the full pipeline (`decisions.json` → contract → generated FieldDefs). Example: `"max": 100` on a discount (%) field prevents values above 100. |
| `readOnlyLogic` | string \| null | `null` | Expression for conditional read-only. Set `null` to omit. |
| `displayLogic` | string \| null | `null` | Expression for conditional visibility. Set `null` to omit. |
| `businessCritical` | boolean | `false` | Advisory-only metadata flag. When `true`, marks the field as business-critical data. This flag does **not** change any functional behavior (validation, read-only logic, visibility, etc.). It travels through the pipeline (`decisions.json` → `resolve-curated` → `contract.json` → `push-to-neo` → `ETGO_SF_FIELD.ISBUSINESSCRITICAL`) so that downstream consumers (e.g., AI agents reading `neo_schema`) know they must confirm with the user before creating or updating records that include this field. |
| `agentPrompt` | string | `null` | Per-field guidance for AI agents. Carried into the curated field and persisted to `ETGO_SF_FIELD.AGENT_PROMPT`, from where `neo_schema` returns it inside each field object. Empty or whitespace-only values clear the persisted prompt and are omitted from the MCP response. |

### Explicit null

Setting a property to `null` removes it from the curated output and contracts:
```json
{
  "reference": null,
  "inputMode": null,
  "readOnlyLogic": null
}
```

## Discard Patterns (`discardPatterns`)

Array of glob patterns to auto-exclude fields. Supports:

| Pattern | Match | Example |
|---------|-------|---------|
| `"prefix*"` | Starts with | `"EM_*"` matches `EM_Aprm_AddPayment` |
| `"*suffix"` | Ends with | `"*_old"` matches `price_old` |
| `"exact"` | Exact match | `"someField"` matches only `someField` |

Case-insensitive. **Explicit field `visibility` overrides discard patterns** (human decision wins).

```json
{
  "discardPatterns": ["EM_*"],
  "entities": {
    "header": {
      "fields": {
        "emSomeImportantField": { "visibility": "editable" }
      }
    }
  }
}
```

## Rules (`rules.{ruleName}.*`)

Rule keys use **extended names** (including trigger column suffix for multi-trigger rules).

| Property | Type | Values | Purpose |
|----------|------|--------|---------|
| `type` | string | `"callout"`, `"displayLogic"`, `"readOnlyLogic"`, `"validation"`, `"process"`, `"eventHandler"` | Rule category. |
| `entity` | string | Entity name | Which entity this rule applies to. |
| `decision` | string | `"Keep"`, `"Omit"`, `"Simplify"`, `"Replace"`, `"pending"` | Whether to implement this rule. |
| `description` | string | — | What the rule does. |
| `impactIfOmitted` | string | — | Business impact of not implementing. |
| `translated` | string | — | JavaScript translation of Etendo logic expression. |

## Common Patterns

### Enable draft mode for a transactional window
```json
{
  "entities": {
    "header": {
      "draftMode": { "enabled": true, "label": "Complete" },
      "fields": {
        "documentAction": { "visibility": "editable" }
      }
    }
  }
}
```

### Make a field searchable in the grid
```json
{
  "entities": {
    "header": {
      "fields": {
        "businessPartner": { "grid": true, "searchable": true }
      }
    }
  }
}
```

### Cascading dependent selector
```json
{
  "entities": {
    "header": {
      "fields": {
        "partnerAddress": {
          "reference": "BusinessPartnerLocation",
          "dependsOn": { "field": "businessPartner", "filterKey": "C_BPartner_ID" }
        }
      }
    }
  }
}
```

### Exclude an entire entity
```json
{
  "entities": {
    "legacyTab": { "exclude": true }
  }
}
```

### Custom NeoHandler for an entity
```json
{
  "entities": {
    "accounting": { "javaQualifier": "factAcctHandler" }
  }
}
```

## Key Invariants

1. **Entity keys = tabName (v2+)** — Use simplified names from raw schema's `tabName`, not table names.
2. **Field names are stable** — The raw field `name` is the decision key, unchanged across extractions.
3. **Explicit `null` = omit** — Different from absent. `"readOnlyLogic": null` removes the property from contracts.
4. **Visibility priority:** `discardPatterns` → raw extraction → `field.visibility` (human decision wins).
5. **Reference auto-derived** — FK catalog name stripped from targetTable if not explicitly set.
6. **draftMode is entity-level** — Typically on the header/primary entity only.
7. **Rules are declarative** — Metadata only; actual logic lives in Etendo AD tables.

## Pipeline Flow

```
decisions.json
    │
    ├─→ resolve-curated.js    (merges raw + decisions → curated schema)
    ├─→ generate-contract.js  (visibility, reference, inputMode, draftMode → contracts)
    ├─→ generate-frontend.js  (grid, form, section, name, dependsOn → React components)
    └─→ push-to-neo.js        (visibility → isIncluded/isReadOnly in NEO DB)
```
