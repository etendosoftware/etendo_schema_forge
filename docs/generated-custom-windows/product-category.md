# Product Category

## Intent

Product Category lets users maintain the category master record that classifies products and configure the accounting accounts associated with each category per accounting schema. The main form covers the category header fields; the Accounting tab exposes the GL accounts linked to each accounting schema for that category.

## What this window should allow

Users should be able to:

- browse product categories by Search Key and Name
- open a category and maintain its header fields: Search Key, Name, Description, Default, and Summary Level
- view and edit accounting accounts (Asset, Expense, Revenue, COGS) for the category directly from the Accounting grid, using inline editing with pencil and trash icons on hover

## Interaction model

- **Route:** `/product-category`, `/product-category/:recordId`
- **Visibility:** visible in the Inventory menu as **Product Category**
- **Implementation type:** custom window — `registry.js` points to `tools/app-shell/src/windows/custom/product-category/index.jsx`, which wraps the generated `ProductCategoryPage` and injects custom icons and a custom header form
- **Window shape:** master + inline-editable detail; `productCategory` is the header entity and `accounting` is the detail entity rendered as an inline-editable grid
- **List behavior:** the category list shows Search Key and Name and supports filtering by those same fields
- **Record behavior:** opening a category record renders a detail view with the category header form plus the **Accounting** tab with `linesLayout="inlineEditable"`
- **Accounting tab behavior:** shows one row per accounting schema. Each row exposes four ValidCombination FK selectors (Product Asset, Product Expense, Product Revenue, Product COGS). Rows are edited inline — hovering a row reveals a pencil (edit) and a trash (delete) icon. All four selector columns share the available width equally via `grow: true`.
- An **Attachments** tab is available in the detail tab strip.

## Layout configuration

The window uses these layout overrides (all set in `decisions.json → window`):

| Key | Value | Effect |
|-----|-------|--------|
| `detailEntity` | `"accounting"` | Accounting tab as the primary child entity |
| `linesLayout` | `"inlineEditable"` | Inline pencil/trash editing on Accounting rows |
| `noHeaderBorder` | `true` | Removes the border under the header form |
| `toolbarBorderBottom` | `true` | Adds a border below the toolbar |
| `formCardPadding` | `"p-2"` | Tighter padding on the form card |
| `formScrollPaddingX` | `"px-2"` | Horizontal padding on the scroll column |
| `toolbarPaddingX` | `"px-2"` | Horizontal padding on the toolbar |
| `tabsBarPaddingX` | `"px-2"` | Horizontal padding on the tabs bar |

## Header form layout

The header form is rendered by `ProductCategoryCustomForm` (a custom component, not the generated `ProductCategoryForm`). Layout:

- **Row 1:** Name input (325 px fixed) + Search Key input (325 px fixed) + **Configuración** checkbox group (flex-1): two checkboxes — *Valor por defecto* (`IsDefault`) and *Agrupable* (`Issummary`).
- **Row 2:** Description textarea (full width).

The custom form is section-aware: it returns `null` for any `section` prop other than `"principal"`, which suppresses the auto-generated *Más detalles* collapsible and the *Otros* tab that `DetailView` probes for.

Custom icons `SortIcon` and `RefreshIcon` from `packages/app-shell-core/src/components/ui/custom-icons.jsx` are injected via the `index.jsx` wrapper.

## Reactive behavior and dependencies

- The Accounting grid depends on the selected category record and loads rows filtered by `parentId`.
- The four accounting fields are ValidCombination FK selectors backed by the OBUISEL selector `A085BAFF89C74D7696A877C697DF350F`. The selector WHERE clause (`e.active = true and e.accountingSchema.id=@inpcAcctschemaId@`) drops the `@inpcAcctschemaId@` clause at runtime since that context param is not available in NEO's stateless selector requests, returning all active combinations.
- The selector display value uses the `combination` property of `C_ValidCombination` (e.g. `"35000 - Productos terminados A"`). Typing either the combination code (`"35000"`) or part of the account name (`"social"`) returns results — see backend fix below.
- No dependent selectors with query params are defined for this window.
- The category header exposes no status field, summary badges, or process actions.
- `assignedProducts` and `translation` entities are excluded from the window scope.

## Gap assessment

- Accounting rows are pre-created by Etendo (one per accounting schema). The window allows editing existing rows but adding/deleting accounting schema rows is not a typical use case and is not explicitly gated.
- No totals, financial reactions, or callout chains are visible in the accounting entity contract.

## Manual verification

1. Open `/product-category` and confirm the list filters Search Key and Name.
2. Open an existing category and confirm the header form shows Name (325 px) and Search Key (325 px) inline in the first row, the Configuración checkbox group on the right, and Description full-width below.
3. Confirm **no** *Más detalles* collapsible and **no** *Otros* tab appear in the detail view.
4. Confirm the toolbar shows the custom Sort and Refresh icons.
5. Confirm the **Accounting** tab is the active detail tab and shows one row per accounting schema.
6. Hover over an accounting row and confirm the pencil and trash icons appear.
7. Click the pencil icon and confirm all four selector fields become editable inline within their column boundaries.
8. In an editable selector, type `"35000"` and confirm records with that combination code appear.
9. In an editable selector, type part of an account name (e.g. `"social"`) and confirm matching records appear (e.g. `"10000 - Capital social"`).
10. Confirm no UUIDs appear as selector values.
11. Confirm all four selector columns share the row width equally.
12. Open the **Attachments** tab and confirm file upload, download, and delete work as expected.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Product Category** under the Inventory menu.
- `tools/app-shell/src/windows/registry.js` registers the `product-category` slug pointing to the custom wrapper at `tools/app-shell/src/windows/custom/product-category/index.jsx`.
- `tools/app-shell/src/windows/custom/product-category/index.jsx` wraps the generated `ProductCategoryPage` with `Form={ProductCategoryCustomForm}`, `SortIconComponent={SortIcon}`, and `RefreshIconComponent={RefreshIcon}`.
- `tools/app-shell/src/windows/custom/product-category/ProductCategoryCustomForm.jsx` renders the two-row header layout (Name + Search Key + checkboxes, then Description). Returns `null` for non-`"principal"` sections to hide the *Más detalles* collapsible and suppress the *Otros* probe.
- `artifacts/product-category/contract.json` defines the window with `productCategory` as primary entity, `accounting` as detail entity with `linesLayout: "inlineEditable"`, and four ValidCombination selector fields.
- `artifacts/product-category/generated/web/product-category/ProductCategoryPage.jsx` renders `ListView` for the list route and `DetailView` with `linesLayout="inlineEditable"` and `DetailTable={AccountingTable}` for record routes.
- `artifacts/product-category/generated/web/product-category/AccountingTable.jsx` renders `InlineLinesPanel` when `linesLayout === "inlineEditable"`, otherwise `DataTable`. The three non-first selector columns declare `grow: true` so all four share the row width equally.
- `artifacts/product-category/generated/web/product-category/AccountingForm.jsx` is generated but not used in the current layout (inline editing replaces the side-panel form).
- No dedicated Product Category browser test was found. Shared route/loading behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.

## Custom window — ETP-4190

Changes shipped as part of feature/ETP-4190:

- **Custom wrapper introduced:** `registry.js` now points to `tools/app-shell/src/windows/custom/product-category/index.jsx` instead of the generated entry. The wrapper injects `SortIcon`, `RefreshIcon`, and `ProductCategoryCustomForm` into the generated page.
- **Custom header form:** `ProductCategoryCustomForm` replaces the generated flat form with a two-row Figma-matching layout (Name + Search Key + Configuración checkboxes / Description). The component is section-aware — returns `null` for `section !== "principal"` — which suppresses the auto-generated *Más detalles* collapsible and the *Otros* tab probe in `DetailView`.
- **Selector search by account name (backend fix):** `SelectorDescriptorResolver.addReferencedIdentifierPaths` (NEO Headless) now traverses non-primitive FK identifier properties (e.g. `AccountingCombination.account`) and adds sub-paths (`account.searchKey`, `account.name`) to the OBUISEL search predicate. Typing part of an account name (e.g. `"social"`) now returns results alongside combination-code matches.
- **i18n keys added:** `categoryConfiguration`, `categoryDefault`, `categoryGroupable` in `en_US.json` and `es_ES.json`.

## Pipeline regeneration — ETP-4192

Regenerated on 2026-06-09 as part of feature/ETP-4192.

**Changes in this cycle:**

- `detailEntity` changed from `assignedProducts` to `accounting`; `assignedProducts` and `translation` entities excluded.
- `linesLayout: "inlineEditable"` added — Accounting tab now uses `InlineLinesPanel` with pencil/trash row actions.
- Layout properties added: `noHeaderBorder`, `toolbarBorderBottom`, `formCardPadding`, `formScrollPaddingX`, `toolbarPaddingX`, `tabsBarPaddingX`.
- `description` field configured with `span: 2, rows: 1`; `image` field discarded.
- `grow: true` added to `productExpense`, `productRevenue`, and `productCOGS` so all four accounting selector columns share the row width equally.
- Pipeline additions used by this window: `span`, `rows`, `explicitType`, `formScrollPaddingX`, and `grow` support in `resolve-curated.js`, `generate-contract.js`, and `generate-frontend.js`.
- Backend fix (NEO Headless): `SelectorValidationResolver` now drops OBUISEL AND-clauses containing unresolvable `@param@` tokens instead of substituting `NULL`, which caused ValidCombination selectors to always return 0 results.
- Backend fix (NEO Headless): `SelectorDescriptorResolver.findIdentifierProperty` now returns `"combination"` for entities that have that property (e.g. `AccountingCombination`) before falling back to `"id"`.
- Frontend fix (`InlineSearchCombo`): root wrapper div now has `w-full` so selector inputs fill the full column width in inline edit mode.
- Frontend fix (`linesColumnWidth`): `columnFlex` for selector/search/foreignKey columns now honors `col.grow` to override the default `idx === 0` grow behavior.
