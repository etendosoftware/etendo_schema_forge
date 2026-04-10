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

## Window Properties (`window.*`)

| Property | Type | Default | Values | Purpose |
|----------|------|---------|--------|---------|
| `category` | string | Inferred | `"sales"`, `"purchases"`, `"inventory"`, `"finance"`, `"accounting"`, `"master"`, `"project"`, `"general"` | UI routing and navigation grouping. |
| `name` | string | From AD | — | Display name for breadcrumbs and titles. |
| `layoutType` | string | `"default"` | `"default"`, `"kanban"`, `"calendar"`, `"custom"` | Frontend rendering mode. See `docs/window-templates.md`. |
| `templateConfig` | object | `null` | Layout-specific | Extra config for non-default layouts (e.g., `groupBy`, `dateField`). |
| `detailEntity` | string \| null | Auto-inferred | Entity name or `null` | Explicitly sets which entity is the detail/lines tab. When omitted, the generator picks the first non-primary entity automatically. Set to `null` to create a header-only page (no detail tab). Set to a specific entity name to override the auto-inference. |
| `relatedDocuments` | boolean | `false` | — | Enables the Related Documents footer in the detail view. Requires a hand-written `RelatedDocuments.jsx` in `artifacts/{window}/custom/`. The generator emits the import and `customTabs` prop automatically. |
| `notesField` | string | `null` | Any entity field name | Field to display as a notes/description panel in the detail view footer (e.g., `"description"`). Rendered as an expandable text input. |
| `documentPreview` | object | `null` | `{ titlePrefix: string }` | Enables the document preview button in the detail header. `titlePrefix` is shown in the preview drawer title (e.g., `"Order"`, `"Invoice"`). |
| `breadcrumb` | string | `"{category} / {name}"` | Any string | Overrides the auto-generated breadcrumb path shown in the topbar. Useful when the default category/name combination is too verbose (e.g., `"Product"` instead of `"Reference / Product"`). |
| `hidePrint` | boolean | `false` | — | Hides the print button in the detail view action bar. |
| `hideMoreMenu` | boolean | `false` | — | Hides the triple-dot "more" menu in the detail view action bar. |
| `contentBg` | string | `"bg-white"` | Any Tailwind bg class | Background color of the main content card in the detail view (e.g., `"bg-slate-50"` for a light gray tone). |
| `hideDeleteWhenComplete` | boolean | `false` | — | Hides the delete button in the detail view when the document status is not Draft. Prevents accidental deletion of completed/processed records. |
| `customComponents` | object | `null` | See below | Override generated components with custom ones from `artifacts/{window}/custom/`. The generator emits the correct imports and props automatically. |
| `menuActions` | array | `[]` | See below | Additional actions in the detail view's "more" menu (triple dot). Each action can have visibility conditions based on document status. |
| `processOverrides` | object | `{}` | See below | Override presentation and behavior of process buttons in the detail view. Keys are process names or column names. See Process Overrides subsection. |
| `detailSortBy` | string | `null` | Any valid sort expression | Default sort order for the detail entity tab (e.g., `"sEQNoAsset asc"`). Passed directly to DetailView as the `detailSortBy` prop. |
| `statusBar` | object | `null` | See below | Generates a summary status bar above the detail form showing key numeric fields and an optional progress indicator. |

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
    { "key": "cancel", "label": "Cancel", "destructive": true, "visibleWhenStatus": "CO" },
    { "key": "reverse", "label": "Reverse Payment", "destructive": true, "visibleWhenStatus": ["RPPC", "RPR"], "columnName": "aPRMReversePayment" }
  ]
}
```

| Property | Type | Purpose |
|----------|------|---------|
| `key` | string | Unique identifier for the action. |
| `label` | string | Display label in the menu. |
| `destructive` | boolean | If `true`, renders in red as a destructive action. |
| `visibleWhenStatus` | string or string[] | Only show the action when document status matches. Omit to always show. |
| `columnName` | string | If set, triggers the named process column via `hook.handleProcess`. If omitted, generates an empty `onClick` placeholder. |

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

When `style` is not specified, the generator defaults to `"destructive"` for processes whose names contain destructive keywords (e.g., `void`, `cancel`, `reverse`) and `"positive"` for all others.

## Entity Properties (`entities.{entityName}.*`)

Entity keys use **camelCase from tabName** (e.g., `"header"`, `"lines"`, `"basicDiscounts"`).

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `name` | string | Entity key | Override display name. |
| `exclude` | boolean | `false` | Omit entire entity from schema. |
| `fields` | object | `{}` | Field-level decisions. |
| `draftMode` | object | `null` | Draft/Processed workflow config. |
| `javaQualifier` | string | `null` | CDI qualifier for custom NeoHandler. |

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
| `processField` | string | `"documentAction"` | Field name that controls the process (sent in action POST). |
| `processValue` | string | `"CO"` | Value to submit for processing (e.g., `"CO"` = Complete). |
| `label` | string | `"Process"` | Button label suffix: "Save & {label}". |

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

**Visibility defaults** (when not overridden):

| Visibility | `grid` | `form` | `searchable` |
|-----------|--------|--------|-------------|
| `editable` | false | true | false |
| `readOnly` | false | true | false |
| `system` | false | false | false |
| `discarded` | false | false | false |

### Reference & Input Mode (FK fields)

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `reference` | string \| null | Auto from targetTable | Catalog name for FK lookup (e.g., `"BusinessPartner"`). Set `null` to omit. |
| `inputMode` | string \| null | Auto from reference type | `"selector"` (dropdown), `"search"` (searchable), `"dependent"` (cascading). Set `null` to omit. |
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
| `readOnlyLogic` | string \| null | `null` | Expression for conditional read-only. Set `null` to omit. |
| `displayLogic` | string \| null | `null` | Expression for conditional visibility. Set `null` to omit. |

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
