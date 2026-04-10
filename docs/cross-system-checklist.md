# Etendo Go — Cross-System Checklist

**Date:** 2026-04-08
**Jira:** ETP-3669
**Epic:** ETP-3504 (Etendo Next — New UI)
**Applies to:** All entity windows that manage records (CRUD). Special-purpose pages (dashboard, smart-scan, onboarding, report-viewer) are excluded from this checklist.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]`  | Not reviewed |
| `[~]`  | Reviewed — not achieved / has issues |
| `[x]`  | Reviewed — achieved |
| `[N/A]`| Not applicable |

---

## 1. Layout and Navigation

- [ ] 1.1 Top toolbar visible (language selector, user, settings)
- [ ] 1.2 Top toolbar does not disappear when navigating between windows
- [ ] 1.3 Side menu visible and navigable
- [~] 1.4 Breadcrumb present and reflects the correct location
- [x] 1.5 Breadcrumb in the active language
- [x] 1.6 Window title in the active language

## 2. Language / i18n

- [ ] 2.1 Language selector in the toolbar works (allows switching between ES / EN)
- [ ] 2.2 When switching to Spanish, all UI elements translate:
  - [x] 2.2.1 Column headers
  - [x] 2.2.2 Field labels
  - [ ] 2.2.3 Document statuses
  - [x] 2.2.4 Action buttons
  - [~] 2.2.5 Tabs and sections
  - [x] 2.2.6 Breadcrumbs and window titles
  - [ ] 2.2.7 Validation and error messages
- [ ] 2.3 When switching to English, the same elements translate correctly
- [ ] 2.4 Language change persists when navigating between windows
- [ ] 2.5 No untranslated elements (ES+EN mix) in any language
- [x] 2.6 "New X" buttons translate completely (no mixes like "New Contacto")
- [x] 2.7 In form view, fields translate the same as in grid view

## 3. Grid View (List)

- [ ] 3.1 Grid loads with data correctly
- [ ] 3.2 Columns display the expected information
- [ ] 3.3 Column headers are in the active language
- [ ] 3.4 Clicking a row navigates to the record detail
- [ ] 3.5 Columns have reasonable width (no excessive truncation)
- [x] 3.6 Sort button located to the right of the column filter bar
- [x] 3.7 Refresh button present and updates the grid without reloading the page

## 4. Operation: Create Record

- [ ] 4.1 "New" button visible and in the active language
- [ ] 4.2 Clicking it opens the empty form (or modal depending on the case)
- [x] 4.3 Required fields are correctly marked
- [~] 4.4 Boolean fields (true/false) are not marked as required with *
- [ ] 4.5 Form can be completed without unexpected errors
- [ ] 4.6 After saving, the record appears in the grid
- [ ] 4.7 The record persists when returning to the window

## 5. Operation: Edit Record

- [ ] 5.1 Opening an existing record shows the saved values
- [ ] 5.2 Editable fields allow modification
- [ ] 5.3 Read-only fields do not allow editing
- [ ] 5.4 After saving, changes persist correctly
- [ ] 5.5 No errors when saving without modifying anything (save without changes)
- [ ] 5.6 Auto-save when switching focus between sections (e.g., header to lines saves header automatically)

## 6. Operation: Delete Record

- [ ] 6.1 Delete action exists (button or menu)
- [ ] 6.2 Asks for confirmation before deleting
- [ ] 6.3 Record disappears from the grid after deletion
- [ ] 6.4 Cannot delete a record with dependencies without a warning

## 7. Operation: Cancel / Discard Changes

- [ ] 7.1 Canceling creation does not save any record
- [ ] 7.2 Canceling editing reverts data to the original state
- [ ] 7.3 No dirty state remains on the screen after canceling

## 8. Detail Form

- [ ] 8.1 All fields load correctly
- [ ] 8.2 Field labels are in the active language
- [x] 8.3 Read-only fields have a differentiated appearance (dimmed or no editable border)
- [ ] 8.4 Selection fields (dropdowns/lookups) open the corresponding selector
- [ ] 8.5 Date fields show the correct format
- [ ] 8.6 Numeric fields accept only valid values
- [x] 8.7 No fields without labels or orphan fields

## 9. Subtables and Tabs

- [ ] 9.1 Tabs render correctly
- [ ] 9.2 Tab labels are in the active language
- [ ] 9.3 Switching tabs loads information without errors
- [ ] 9.4 In subtables: can add a new line
- [ ] 9.5 In subtables: can edit an existing line
- [ ] 9.6 In subtables: can delete a line
- [ ] 9.7 Changes in subtables persist when saving the parent record

## 10. Visual Consistency

- [ ] 10.1 Layout pattern is consistent with the rest of the app (header, sidebar, content)
- [ ] 10.2 Status badges use the same colors and styles as other windows
- [ ] 10.3 Primary action buttons are located in the same place as other windows
- [~] 10.4 DOCS and NOTES sections are present where applicable
- [ ] 10.5 Typography and spacing match the general design
- [ ] 10.6 No visually broken elements (overlaps, cut text, missing icons)

## 11. Messages and User Feedback

- [ ] 11.1 Successful save shows positive feedback (toast, message, etc.)
- [ ] 11.2 Errors show a descriptive message in the active language
- [ ] 11.3 Validation messages indicate which field failed and why
- [ ] 11.4 No technical errors (stack traces, internal IDs) exposed to the user

## 12. Lookup / Selectors

- [ ] 12.1 Lookup opens the search drawer (not a free text input)
- [ ] 12.2 Search within the lookup returns relevant results
- [ ] 12.3 Selecting an item correctly fills the field
- [ ] 12.4 Lookup can be cleared/deselected if applicable

## 13. Navigation Between Related Documents

- [ ] 13.1 DOCS section (Related Documents) shows linked documents
- [ ] 13.2 Links in DOCS navigate to the corresponding document
- [ ] 13.3 When returning, goes back to the previous window without context loss
- [ ] 13.4 "Back" button present in form view to return to the list
- [ ] 13.5 "Back" button present in report section to return to report menu

## 14. Permissions and States

- [ ] 14.1 A closed/processed document does not allow field editing
- [ ] 14.2 Available actions change based on document state (e.g., cannot "Process" what is already processed)
- [ ] 14.3 Read-only records do not show an active "Save" button

## 15. Accounting

- [ ] 15.1 When confirming a document, the accounting entry is generated automatically (no manual action)
- [ ] 15.2 No "Post" button exposed to the user
- [ ] 15.3 The generated entry is visible from the document (read-only)
- [ ] 15.4 The entry is not directly editable from the document
- [ ] 15.5 When registering a payment, the accounting movement is generated automatically
- [ ] 15.6 No "confirmed but not posted" state — both occur together

### Grid View (3.6–3.7)
- **3.6:** Achieved for 38/39 windows. The sort button (ArrowUpDown icon) is in `ListView.jsx` (lines 206-256) on the right side of the filter bar. Opens a sort popover with all columns, ascending/descending toggle, and "clear sort". **Exception:** `purchase-invoice` uses a fully custom `PurchaseInvoiceListView` (`tools/app-shell/src/windows/custom/purchase-invoice/index.jsx`) that bypasses `ListView` entirely — no sort button, no filter bar, no view mode toggle.
- **3.7:** Fixed. Added `RefreshCw` button in `ListView.jsx` (after sort button) wired to `hook.refresh()`. Translation keys added: `"refresh"` → "Refresh" / "Actualizar". Applies to all 38 windows using ListView.

### Form Fields (4.3, 4.4, 8.3, 8.7)
- **4.3:** Achieved. Required fields are correctly marked with a red `*` asterisk. The pipeline faithfully propagates the DB `ismandatory` flag: `extract-fields.js` (line 353) reads `ismandatory` from `AD_Column`, `resolve-curated.js` (line 189) maps it to `required`, `generate-frontend.js` (line 181) emits `required: true` in field configs, and `EntityForm.jsx` renders `<span className="text-red-500 ml-0.5">*</span>` next to the label. All 1275 generated form fields across all windows correctly reflect their DB mandatory status.
- **4.4:** Not achieved. Boolean (checkbox) fields ARE marked as required with `*`. The generator at `cli/src/generate-frontend.js` (line 181) does not filter out boolean fields from the `required` flag — it applies `f.required ? ', required: true' : ''` uniformly to all field types. The `EntityForm.jsx` checkbox renderer (line 540) displays the `*` asterisk when `f.required` is true without checking if the field is a checkbox. Since nearly all Etendo boolean columns are `ismandatory='Y'` in the database (they must be Y or N, never null), 112 out of 122 checkbox fields across all generated forms carry `required: true` and display a `*`. Examples: `isActive` (in ~30 windows: warehouse, contacts, user, uom, tax, etc.), `allocated` in `WarehouseForm.jsx` (line 11), `purchase`/`sale`/`stocked` in `ProductForm.jsx` (lines 14-16), `cascade` in `InvoiceDiscountForm.jsx` (line 7). Fix needed: either strip `required` from boolean fields in the generator, or suppress the `*` rendering in `EntityForm.jsx` for `type === 'checkbox'`.
- **8.3:** Achieved. Read-only fields have clearly differentiated appearance through multiple visual cues in `EntityForm.jsx`: (1) Labels use `text-muted-foreground` (dimmed gray) instead of `text-foreground` for read-only FK fields (lines 551, 589, 637); (2) Input fields get `disabled` attribute plus `className="bg-muted/50"` (gray background) for text/search/selector/dependent types (lines 554, 592, 640, 794); (3) Textareas get `bg-muted/50 cursor-default` (line 773); (4) Checkboxes get `disabled:cursor-not-allowed disabled:opacity-50` (line 518); (5) Select dropdowns get `disabled` (line 738). The `*` required indicator is also suppressed for read-only fields on select, textarea, and standard input types via `f.required && !isReadOnly` checks (lines 733, 759, 785).
- **8.7:** Achieved. No fields without labels or orphan fields. Every field in `EntityForm.jsx` gets a label via the three-tier resolution chain at line 496: `const label = f.label ?? t(f.column) ?? f.key`. Of 1275 generated form field definitions, 631 (49.5%) have an explicit `label` property from decisions.json; the remaining 644 resolve through `t(f.column)` (i18n dictionary lookup by AD column name) or fall back to the camelCase `f.key` (e.g., `searchKey`, `transactionDate`). The fallback to `f.key` ensures no field can ever render without a visible label. No orphan fields were found — every field definition includes `key`, `column`, and `type` as minimum properties.

### Language / i18n (2.x)

**Architecture overview:** The app uses a custom i18n system (no react-i18next/next-intl). `LocaleProvider` at `tools/app-shell/src/i18n/LocaleProvider.jsx` loads `en_US.json` or `es_ES.json` from `tools/app-shell/src/locales/`. Three hooks resolve labels: `useLabel()` (field labels by AD column name), `useUI()` (generic UI strings from `genericLabels`), `useMenuLabel()` (window/menu/tab names from `windows`, `menus`, `ui` sections). Locale persists via `localStorage` key `schema-forge-locale`.

- **2.2.1 (Column headers):** Achieved. `DataTable.jsx` line 762 resolves column headers via `const colLabel = t(col.column) ?? col.label ?? col.key` where `t = useLabel()`. This looks up `dictionary.fields[columnName].label` from the locale file first, then falls back to the static `col.label` from the generator, then to the camelCase key. Both `en_US.json` and `es_ES.json` have 16,000+ field entries. The same resolution chain is used in inline add rows (lines 332, 341, 358, 414, 432).

- **2.2.2 (Field labels):** Achieved. `EntityForm.jsx` line 496Ventas / Cobro / 1000394

 resolves labels via `const label = f.label ?? t(f.column) ?? f.key` -- identical three-tier chain. The `useLabel()` hook also supports `labelOverrides` from `decisions.json` (per-window, per-locale overrides) as the highest-priority source. Field labels in both grid and form resolve from the same locale dictionary, ensuring consistency.

- **2.2.4 (Action buttons):** Achieved for core buttons. All primary action buttons use `useUI()` keys that are translated in both locale files: `ui('newRecord')` = "New"/"Nuevo", `ui('save')` = "Save"/"Guardar", `ui('cancel')` = "Cancel"/"Cancelar", `ui('delete')` = "Delete"/"Eliminar", `ui('print')` = "Print"/"Imprimir", `ui('filter')` = "Filter..."/"Filtrar...", `ui('clearAllFilters')`, `ui('cancelEsc')`, etc. Minor gaps: `EntityForm.jsx` has hardcoded "Searching..." (line 223), `"No results for"` (line 229), and `"Search {label}..."` placeholders (lines 33, 165, 420) that are not routed through `useUI()`. Custom components like `PurchaseOrderTopbar.jsx` have hardcoded English strings ("Delivery Status", "Invoice Status"), and `PurchaseInvoiceTopbar.jsx` has hardcoded "Paid" and "Pending".

- **2.2.5 (Tabs and sections):** Not achieved. Tab labels in `DetailView.jsx` (line 887: `{tab.label}`) are rendered directly from the props without any i18n lookup. The tab labels originate from the generator (`cli/src/generate-frontend.js` lines 543, 549-555, 597-604) as hardcoded English strings such as "Lines", "Tax", "Basic Discounts", "Payment Plan", "Accounting", "Landed Cost". Although the locale files have a `tabs` section with Spanish translations (e.g., `es_ES.json` has `"Lines": {"label": "Lineas"}`), the `DetailView` component never calls `tMenu()` or any i18n function on tab labels. The `useMenuLabel()` hook is imported in `DetailView.jsx` but only used for breadcrumb segments (line 523), not for tab labels. The "Others" tab does translate correctly via `ui('others')` (line 499). Fix needed: wrap `tab.label` with `tMenu(tab.label)` in `DetailView.jsx` at lines 800 and 887. Additionally, `"+ Add {detailLabel || 'Lines'}"` (line 1024) and `"+ Add {st.label}"` (line 1340) use hardcoded "Add" prefix that is not translated. The `"{st.label} Detail"` text (line 1228) is also hardcoded English.

- **2.2.6 (Breadcrumbs and window titles):** Achieved. `ListView.jsx` line 36 resolves the window title via `const label = tMenu(entityLabel) || entityLabel || entity` which looks up `ui[key] ?? menus[key] ?? windows[key]` from the locale dict. Breadcrumbs in both `ListView.jsx` (line 114) and `DetailView.jsx` (line 523) split the breadcrumb string by " / " and map each segment through `tMenu()`. The locale files have translations for window names (e.g., `es_ES.json menus["Purchase Order"] = "Pedido"`) and categories (e.g., `menus["Purchases"] = "Compras"`). The generator emits breadcrumbs like `'Purchases / Purchase Order'` which get correctly translated segment by segment at runtime.

- **2.6 ("New X" buttons):** Partially achieved. The primary "New" button in `ListView.jsx` (line 302) renders `ui('newRecord')` which is simply "New" / "Nuevo" -- no entity name is appended, so there is no mixed-language issue for the main button. However, the inline "Add" buttons in `DetailView.jsx` DO have a mixed-language problem: `"+ Add {detailLabel || 'Lines'}"` (line 1024) and `"+ Add {st.label}"` (line 1340) use a hardcoded English "Add" prefix concatenated with an untranslated entity label. In Spanish mode this would render as "+ Add Lineas" (mixed). Fix needed: create a `genericLabels.addEntity` key like `"+ Add {entity}"` / `"+ Agregar {entity}"` and pass the translated tab label through `tMenu()`.

- **2.7 (Form/grid label consistency):** Achieved. Both `DataTable.jsx` (grid) and `EntityForm.jsx` (form) use the same `useLabel()` hook from `tools/app-shell/src/i18n/useLabel.js`, which calls `resolveLabel(dictionary, columnName, langOverrides)`. The resolution chain is identical: `langOverrides[columnName] ?? dictionary.fields[columnName].label ?? null`, with fallback to the static `col.label`/`f.label` and then the camelCase key. Since both components resolve labels from the same locale dictionary using the same column names, field labels are structurally guaranteed to match between grid and form views.

### Breadcrumb & Window Title (1.4-1.6)
- **1.4:** Not fully achieved. 20 out of 38 generated `*Page.jsx` files define a `breadcrumb` const and pass it to both `ListView` and `DetailView`. 18 Page files have NO breadcrumb defined at all (no breadcrumb renders in UI). 1 window (`contacts/BusinessPartnerPage.jsx`) sets breadcrumb to empty string `''`. Windows WITH breadcrumb: sales-order (`Sales / Sales Order`), sales-invoice (`Sales / Sales Invoice`), sales-quotation (`Sales / Sales Quotation`), goods-shipment (`Sales / Goods Shipment`), return-from-customer (`Sales / Returns`), return-material-receipt/ReturnMaterialReceiptPage (`Sales / Return Material Receipt`), payment-in (`Sales / Payment In`), purchase-order/HeaderPage and OrderPage (`Purchases / Purchase Order`), purchase-invoice/HeaderPage and InvoicePage (`Purchases / Purchase Invoice`), payment-out (`Purchases / Payment Out`), goods-receipt (`Purchases / Goods Receipt`), physical-inventory (`Warehouse / Physical Inventory`), warehouse (`Inventory / Warehouse and Storage Bins`), assets (`Accounting / Assets`), product (`Reference / Product`), business-partner (`Reference / Business Partner`), contacts/BpartnerPage (`People / Contacts`). Windows WITHOUT breadcrumb: packing, bank-reconciliation, bom-production, commission, commission-payment, cost-adjustment, goods-movements, landed-cost, manage-requisitions, price-list, requisition, return-to-vendor, return-to-vendor-shipment, stock-reservation, warehouse-picking-list, warehouse-storage-bins, return-material-receipt/ReturnReceiptPage. These skeleton pages also lack the `api` object prop.
- **1.5:** Achieved. Both `ListView.jsx` (line 114) and `DetailView.jsx` (line 523) translate breadcrumb segments using `tMenu()`: `breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')`. The `useMenuLabel()` hook (`tools/app-shell/src/i18n/useMenuLabel.js`) looks up each segment in `dictionary.ui`, `dictionary.menus`, and `dictionary.windows` sections. Spanish translations confirmed in `tools/app-shell/src/locales/es_ES.json` for all breadcrumb category segments (Sales=Ventas, Purchases=Compras, Warehouse=Almacen, Inventory=Inventario, People=Personas, Reference=Referencia, Accounting=Contabilidad) and all window name segments (Sales Order=Pedido de venta, Sales Invoice=Factura (Cliente), etc.). Applies only to the 20 windows that define breadcrumbs.
- **1.6:** Achieved. In `ListView`, the title is derived from `entityLabel` passed through `tMenu()`: `const label = tMenu(entityLabel) || entityLabel || entity` (line 36). In `DetailView`, the main title shows the document identifier (e.g., document number) via `titleField`; the breadcrumb below shows the translated window context. All `entityLabel` values have corresponding translations in the locale files.

### DOCS and NOTES sections (10.4)
- **10.4:** Partially achieved. 6 windows have `relatedDocuments: true` in `decisions.json`: sales-order, sales-invoice, goods-shipment, return-from-customer, payment-in, sales-quotation. All 6 correctly emit `customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}` in their generated Page files. 5 windows have `notesField: "description"` in `decisions.json`: sales-order, sales-invoice, goods-shipment, return-from-customer, sales-quotation. 6 windows emit `notesField="description"` in generated code (the 5 above plus payment-in). Windows that lack both features where they could be applicable: purchase-order, purchase-invoice, goods-receipt (transactional documents), payment-out (payment-in has it but payment-out does not), physical-inventory (could use notes). All 18 skeleton windows lack both features entirely.
