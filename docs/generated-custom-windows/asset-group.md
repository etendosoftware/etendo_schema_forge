# Asset Category

## Intent

Asset Category lets finance users maintain the master records that classify fixed assets. Each category defines a named grouping (e.g. "Machinery", "Vehicles"), the depreciation policy applied to assets in that category, and the two GL accounts required to post depreciation. The window lives in the Finance section of the menu, after Assets.

## What this window should allow

Users should be able to:

- browse and search asset categories by Name and Description
- create a new category by supplying a Name (required) and an optional Description
- open an existing category and update those same fields
- decide whether assets in this category depreciate by toggling the **Depreciate** checkbox, and — when it is on — configure the depreciation policy (depreciation type, calculation method, and the method-specific fields below)
- view and edit the two depreciation accounts (Accumulated Depreciation and Depreciation) for the category in the Accounting inline-editable grid
- delete a category through the standard generated CRUD flow

The depreciation policy fields are shown conditionally: they only appear when **Depreciate** is on, and the method-specific fields (annual percentage vs. amortize schedule + usable life) appear based on the selected calculation type. See [Header fields](#header-fields-assetcategory-entity) below for the full conditional tree.

## Interaction model

- **Route:** `/asset-group` for the list and `/asset-group/:recordId` for record detail.
- **Visibility:** visible in the Finance menu as **Asset Category** (after Assets).
- **Implementation type:** generated window loaded from `tools/app-shell/src/windows/registry.js` into the generic `/:windowName` shell route. No custom wrapper — the registry points directly to the generated `AssetCategoryPage`.
- **Window shape:** master + inline-editable child. `assetCategory` is the header entity (table `A_Asset_Group`, AD_Window_ID 252). `accounting` is the child entity (table `A_Asset_Group_Acct`, AD_Tab_ID 800204), rendered as an inline-editable grid.
- **List behavior:** the category list shows Name and Description. Both columns are visible in the grid.
- **Record behavior:** opening a category record renders a detail view with the header form (Name, Description, Depreciate, plus conditional depreciation-policy fields), plus the **Accounting** tab showing one row per accounting schema. The tab is editable inline — hovering a row reveals pencil (edit) and trash (delete) icons.
- An **Attachments** tab is available in the detail tab strip.

## Header fields (`assetCategory` entity)

### Always-visible fields

| Field | Column | Type | Required | Notes |
|-------|--------|------|----------|-------|
| `name` | `Name` | text | Yes | Free-text category name shown in the list and as the record title |
| `description` | `Description` | textarea | No | Optional description; spans 2 form columns, single-row height (`span: 2`, `rows: 1`) — shown in the list grid |
| `depreciate` | `IsDepreciated` | checkbox | — | Toggles whether assets in this category depreciate. Positioned right after Description. Defaults OFF on create (`defaultExpr: "N"`). Drives all conditional fields below |

### Conditional depreciation-policy fields

These fields are `editable`/`form: true` but use a **`displayLogicJs`** expression so they only render when their condition holds. The condition tree:

```
Depreciate (checkbox)
├─ OFF → no further fields shown
└─ ON  → show: Depreciation Type, Calculate Type
         ├─ Calculate Type = Percentage (PE) → show: Annual Depreciation %
         └─ Calculate Type = Time (TI)       → show: Amortize, Usable Life - Months
```

| Field | Column | Type | Required | Shown when | Options |
|-------|--------|------|----------|------------|---------|
| `depreciationType` | `Amortizationtype` | select | Yes | `depreciate` is on | `LI` = Linear |
| `calculateType` | `Amortizationcalctype` | select | Yes | `depreciate` is on | `PE` = Percentage, `TI` = Time |
| `annualDepreciation` | `Annualamortizationpercentage` | number | No | `depreciate` on **and** `calculateType === 'PE'` | — |
| `amortize` | `Assetschedule` | select | Yes | `depreciate` on **and** `calculateType === 'TI'` | `MO` = Monthly, `YE` = Yearly |
| `usableLifeMonths` | `UseLifeMonths` | number | No | `depreciate` on **and** `calculateType === 'TI'` | — |

### How conditional visibility is wired — `displayLogicJs`

Each conditional field declares a `displayLogicJs` property in `decisions.json` — a JavaScript expression string that references the live record. The generator emits it as a `displayLogic: (record) => ...` arrow function on the field metadata, and `EntityForm` evaluates it against the current form state to decide whether to render the field.

```json
// decisions.json — calculateType field
"calculateType": {
  "visibility": "editable",
  "form": true,
  "section": "principal",
  "required": true,
  "displayLogicJs": "record.depreciate === true || record.depreciate === 'Y'"
}
```

```jsx
// generated AssetCategoryForm.jsx — same field
{ key: 'calculateType', column: 'Amortizationcalctype', type: 'select', required: true,
  section: 'principal',
  options: [{ value: 'PE', label: 'Percentage' }, { value: 'TI', label: 'Time' }],
  displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' }
```

**The `|| record.depreciate === 'Y'` half is load-bearing.** NEO Headless may return a boolean field either as a real `true`/`false` or as the AD string `'Y'`/`'N'`, depending on the serialization path. Checking both forms keeps the conditional correct regardless of which representation the API returns for the loaded record. The `TI`-gated fields combine both checks: `(record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI'`.

### Backend-only (`system`) fields

The remaining depreciation columns stay `system` — present in the backend contract (NEO persists them with their DAL-supplied defaults) but never shown in the form: `usableLifeYears`, `everyMonthIs30Days`, `owned`, and `helpComment`. All standard audit/identity fields are also `system`: `client`, `organization`, `id`, `active`, `creationDate`, `createdBy`, `updated`, `updatedBy`.

The `depreciate` field (`IsDepreciated`) uses `defaultExpr: "N"`, so new categories are created with depreciation OFF and the conditional fields collapsed until the user opts in.

## Header form layout

The header form uses a 4-column grid. Field column span is controlled by the `span` property (default 1; valid values 1–4) and textarea height by the `rows` property.

- **Top row:** Name (1 col) + Description (`span: 2`, 2 cols) + Depreciate (1 col) = 4 columns. Description is a single-row textarea (`rows: 1`) so it stays visually compact while still spanning two columns.
- Because the top row consumes all 4 columns, the conditional depreciation-policy fields (Depreciation Type, Calculate Type, and the method-specific fields) wrap onto the following rows when Depreciate is on.

## Accounting subtab (`accounting` entity)

The Accounting tab maps to `A_Asset_Group_Acct` and exposes exactly two visible fields:

| Field | Column | Type | Required | Notes |
|-------|--------|------|----------|-------|
| `accumulatedDepreciation` | `A_Accumdepreciation_Acct` | ValidCombination selector | Yes | GL account that receives accumulated depreciation postings |
| `depreciation` | `A_Depreciation_Acct` | ValidCombination selector | Yes | GL account that receives periodic depreciation expense |

Both selectors use the `OBUISEL_Selector Reference` backed by `C_ValidCombination`, filtered by accounting schema. Both columns declare `grow: true`, which makes them share the available row width equally in the inline grid.

Hidden system fields in this entity: `accountingSchema` (derived `fromConfig` — General Ledger), `assetCategory` (derived `fromParent` — the FK back to the header), `disposalGain`, `disposalLoss`, `processNow`, plus all audit/identity fields.

**Tab ordering:** the Accounting tab renders before Attachments automatically. This is handled by `DetailView.buildInitialTabs`, which always places `secondaryTabs` before `customTabs` (Attachments). No extra configuration is needed for this ordering.

**Inline editing:** hovering over an accounting row shows pencil and trash icons. Clicking the pencil puts both selector cells in edit mode inline within the row. Adding new accounting rows follows the standard inline-editable add-row flow.

## Window configuration flags

All five flags are set in `decisions.json → window`:

| Key | Value | Effect |
|-----|-------|--------|
| `linesLayout` | `"inlineEditable"` | Accounting tab uses `InlineLinesPanel` — pencil/trash row actions instead of a side-panel form |
| `noHeaderBorder` | `true` | Removes the border/card around the header form fields |
| `hidePrint` | `true` | Hides the Print button from the detail view toolbar |
| `hideLink` | `true` | Hides the share/link icon from the list view toolbar |
| `customListIcons` | `true` | Replaces generic toolbar icons with the custom Sort and Refresh icons (`SortIcon`, `RefreshIcon`) from `packages/app-shell-core/src/components/ui/custom-icons.jsx` — matches the style used by Contacts and Warehouse |

## i18n notes

The dictionary key for this window is `"Asset Group"` — the stable AD window name. It never changes even if the display label is updated.

```json
// en_US.json → windows
"Asset Group": { "label": "Asset Category", "newLabel": "New category" }

// es_ES.json → windows
"Asset Group": { "label": "Categoría de Activos", "newLabel": "Nueva categoría" }
```

The breadcrumb and menu title both resolve via `useMenuLabel()`. That hook searches `menus` before `windows`, so if a `menus["Asset Group"]` entry ever exists it takes precedence over the `windows` entry for the title and breadcrumb. In the current build, only the `windows` section carries this key, which is the canonical source.

The generated page uses `entityLabel="Asset Category"` (for the detail title) and `entityLabel="Asset Group"` (for the list breadcrumb) — the list still reads the raw AD name; the detail renders the localized label from `windows[key].label`.

## Non-obvious gotchas

### `system` visibility vs. `discarded`

A field marked `system` is present in the `backendContract` and NEO persists it normally. It is absent from the `frontendContract` — the UI never sees or sends it. A field marked `discarded` is dropped from both contracts entirely.

For `asset-group`, the depreciation-policy fields that the form does not expose stay `system` (`usableLifeYears`, `everyMonthIs30Days`, `owned`, `helpComment`), not `discarded`. This is the correct choice for a master-data window whose mandatory columns must round-trip through NEO without user intervention. If they were `discarded`, NEO would omit them from insert/update payloads and Etendo would reject records that require non-null values on those columns. (The fields now exposed conditionally on the form — `depreciationType`, `calculateType`, `annualDepreciation`, `amortize`, `usableLifeMonths` — are `editable`, not `system`.)

### `section: "principal"` must be set explicitly for fields 5+ (MAX_PRINCIPAL = 4)

The generator auto-assigns only the **first 4 editable form fields** to `section: "principal"` (the main form). Fields 5 and beyond silently fall into `section: "other"`, which renders in a separate, easily-missed "Others" tab instead of the main form.

When the depreciation-policy fields were first added, `calculateType` and its dependents landed past the 4-field cutoff and disappeared into the Others tab — the conditional logic worked, but the fields were not where users expected them. The fix is to set `"section": "principal"` explicitly on **every** depreciation field in `decisions.json`, which is why all of them carry that property even though the first few would have gotten it automatically.

**Rule for future windows:** any window with more than 4 editable form fields that should all appear in the main form MUST set `"section": "principal"` explicitly on the fields beyond the 4th. Do not rely on the auto-split default.

### `defaultExpr` vs. `defaultValue`

`defaultExpr` in `decisions.json` is the property that `push-to-neo.js` writes to `ETGO_SF_FIELD.defaultvalue`. At create time, `NeoDefaultsService` reads that column and returns it as the field's starting value.

`defaultValue` in `decisions.json` is a frontend-only hint and is NOT copied to `ETGO_SF_FIELD`.

For `depreciate`, using `defaultExpr: "N"` ensures the backend serves `IsDepreciated = 'N'` on every new category record. This both satisfies the column's NOT NULL constraint and makes the checkbox start unchecked, which keeps all conditional depreciation-policy fields collapsed until the user opts in.

### No draftMode / Confirm button

The Confirm/Save button seen on transactional windows (Sales Order, Internal Consumption) is a `draftMode` completion flow — it reflects a document lifecycle with an explicit Complete action. Asset Category is a master-data window and has no such lifecycle. The standard Save button is correct here. The generated `AssetCategoryPage.jsx` confirms this: `const draftMode = null`.

## Pipeline commands

Regenerate the frontend after any `decisions.json` change:

```bash
# Standard iterate-and-regenerate (no DB hit)
make regen ONLY=asset-group

# Regenerate and push configuration to NEO Headless
make regen ONLY=asset-group PUSH_TO_NEO=1

# Reuse existing schema-raw.json (skip DB extract)
make regen ONLY=asset-group SKIP_EXTRACT=1
```

After `PUSH_TO_NEO=1`, run `./gradlew export.database` in the Etendo root to persist the NEO configuration to the repository. Without this, the config lives only in the database and will be lost on rebuild.

Push only (if already regenerated without it):

```bash
node cli/src/push-to-neo.js asset-group
```

## Automated evidence

- `tools/app-shell/src/menu.json` places **Asset Category** under the Finance menu (after Assets), using `"name": "asset-group"`.
- `tools/app-shell/src/windows/registry.js` maps `'asset-group'` to the generated page at `@generated/asset-group/generated/web/asset-group/...`.
- `artifacts/asset-group/generated/web/asset-group/AssetCategoryForm.jsx` defines the header form fields: `name`, `description` (`span: 2`, `rows: 1`), `depreciate` (checkbox), and the conditional depreciation-policy fields, each carrying a `displayLogic: (record) => ...` arrow function and `section: 'principal'`.
- `artifacts/asset-group/generated/web/asset-group/AssetCategoryPage.jsx` renders `ListView` for the list route and `DetailView` with `secondaryTabs` (Accounting), `linesLayout="inlineEditable"`, `hidePrint`, `noHeaderBorder`, and `AttachmentsTab` in `customTabs`.
- `artifacts/asset-group/generated/web/asset-group/AccountingTable.jsx` renders `InlineLinesPanel` when `linesLayout === "inlineEditable"`.
- `artifacts/asset-group/generated/web/asset-group/AccountingForm.jsx` is generated but not used in the current inline-editable layout.
- `artifacts/asset-group/decisions.json` is the source of truth for all field visibility, `displayLogicJs` conditions, layout (`span`/`rows`), and window config flags documented above.

### Design note — history

An earlier iteration built a dedicated `AssetCategoryDepreciationPanel.jsx` custom toggle-card panel for the depreciation configuration. It was reverted in favor of the generated inline conditional fields driven by `displayLogicJs`, which keep the configuration in `decisions.json` and survive pipeline re-runs. The custom panel no longer exists and is not part of the current window.

## Manual verification

1. Open the Finance menu and confirm **Asset Category** appears after Assets.
2. Open `/asset-group` and confirm the list loads with Name and Description columns.
3. Confirm the custom Sort and Refresh icons appear in the list toolbar and that the Print and Link icons do not appear.
4. Create a new category, confirm the **Depreciate** checkbox starts unchecked, and confirm the record saves with only Name supplied (no depreciation fields required while Depreciate is off).
5. Open the created record and confirm the header form shows Name, Description (wider, single-row), and Depreciate on the top row, with no border/card around the fields.
6. Check **Depreciate** and confirm **Depreciation Type** (Linear) and **Calculate Type** (Percentage / Time) appear, both required.
7. Set **Calculate Type** to *Percentage* and confirm **Annual Depreciation %** appears (and Amortize / Usable Life - Months do not).
8. Set **Calculate Type** to *Time* and confirm **Amortize** (Monthly / Yearly) and **Usable Life - Months** appear (and Annual Depreciation % does not).
9. Uncheck **Depreciate** and confirm all depreciation-policy fields disappear.
10. Confirm none of these fields appear in a hidden "Others" tab — they must all render in the main form.
11. Confirm the **Accounting** tab is present and shows one row per accounting schema.
12. Hover over an accounting row and confirm the pencil and trash icons appear.
13. Click the pencil icon and confirm both selector cells enter inline edit mode within the row.
14. In an editable selector, type part of an account code or name and confirm matching `C_ValidCombination` records appear.
15. Confirm both selector columns share the row width equally.
16. Save the accounting row and confirm the values persist on reload.
17. Confirm the **Attachments** tab appears after the Accounting tab (not before it).
18. Upload a file in the Attachments tab and confirm it persists. Download it and delete it.
19. Confirm no Print button or share/link icon appears anywhere in the window.
