# Internal Consumption

## Intent

Use this window to register stock consumed inside the organization rather than sold or transferred. It is an inventory document with a header record and operational lines: the user completes it with **Confirm** (moves it out of draft and consumes the stock), can **Void** a completed document, and can **Post / Unpost** it to accounting ("Contabilizar / Descontabilizar") once it is completed (ETP-5445).

## What this window should allow

- Create and review internal consumption headers with at least Movement Date and Name.
- Add one or more consumption lines under a header.
- Capture the product being consumed, the movement quantity, and the storage bin used for each line. The quantity is what the user declares — it is never prefilled with the product's on-hand stock.
- Review document status as it moves through Draft, Completed, and Voided states, and the accounting status (Posted / Not posted) in the list and in the detail header.
- Complete a draft document with the **Confirm** button that sits next to **Save** in the detail toolbar, or from the list (row-hover kebab or multi-select bulk bar).
- Void a completed document from the detail kebab (⋮) **Void** action.
- Post a completed document to accounting, and unpost a posted one, from the detail kebab, the list row-hover kebab, or the list multi-select bulk bar.

## Interaction model

- **Route:** `/internal-consumption`, `/internal-consumption/:recordId`.
- **Visibility:** visible from the Inventory menu as **Internal Consumption**.
- **Implementation type:** generated window wrapped by a custom loader. `tools/app-shell/src/windows/custom/internal-consumption/index.jsx` is registered in `customLoaders` in `tools/app-shell/src/windows/registry.js`; it forwards every prop to the generated `GeneratedApp` and adds only `bulkActions` (grid Confirm/Post/Unpost), `rowQuickActions` (row-hover Confirm/Post/Unpost kebab) and a `refreshTrigger`. The detail kebab keeps the generated wiring: decisions-driven `menuActions` (Post/Unpost) plus the custom `InternalConsumptionActions` component (Void), injected via `customComponents.moreMenuContent`.
- **Window shape:** master-child. The header entity is `internalConsumption` (`M_Internal_Consumption`, `AD_Table_ID 800168`) and the line entity is `internalConsumptionLine`. The list route opens headers; the record route opens a detail page with child lines.
- **Backend routing:** the header entity declares `javaQualifier: "internal-consumption"`, which routes it through the `InternalConsumptionHeaderHandler` NeoHandler in `com.etendoerp.go` (post/unpost). The line entity keeps `javaQualifier: "internalConsumptionLineHandler"` (`InternalConsumptionLineHandler`).

### List view

- **Columns, in order:** Movement Date, Name, Status, Posted ("Fecha del movimiento", "Nombre", "Estado", "Contabilizado"). Status comes before Posted, consistent with the other document windows — driven by `gridOrder` 3 on `status` and 4 on `posted` in `decisions.json` (grid only; the form is unaffected).
- **Posted badge:** `posted` is a read-only boolean badge — green **Posted / Contabilizado** or orange **Not posted / Sin contabilizar**. It is not a form field (`form: false`).
- **Toolbar trimmed:** the per-row link icon (`hideLink`), the Print button (`hidePrint`), and the **All statuses** filter dropdown (`hideStatusFilter`) are all hidden. Only the date filter and **Filters** remain on the left; sort and refresh remain on the right.
- **Custom toolbar icons:** sort and refresh use the same icon set as Contacts/Warehouse (`customListIcons`, which emits `SortIcon` / `RefreshIcon` from `@/components/ui/custom-icons`).
- **Tighter padding:** the list toolbar and table use `px-2` (8 px) horizontal padding. `px-2` is now the global `ListView` default, so the window relies on the default rather than per-window overrides.
- **No status dot on the date column:** `movementDate` sets `dot: false`, so the list does not render the red date indicator next to Movement Date.

### Detail view (single record)

- **No form card border:** the header fields render without the rounded card/border/shadow (`noHeaderBorder`); fields remain fully visible.
- **Accounting status pill:** the detail header shows a status pill for `posted` (`statusPills` → **Contabilizado** / **Sin contabilizar**), next to the document-status badge. The `_note` in `decisions.json` records that it is intended for financial and admin roles only; that permission enforcement is still pending, so every role currently sees it.
- **No Others tab:** `description` is discarded, which removes both the field and the **Others** tab that previously held it.
- **Lines tab layout:** this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Lines columns:** the **Line No.** column is hidden in the grid (`lineNo.grid = false`). `movementQuantity` sets `columnWidth: 160` so the "Movement Quantity" header fits on one line; Product takes the remaining width.
- **Product picker:** the Product column on lines uses the shared, window-agnostic lookup drawer (`ProductStockSearchDrawer`), registered as `product-stock` in `lookupDrawers.js` (also used by `goods-movements`). The drawer groups results by product, filters by warehouse, and shows available stock per warehouse for the selected product, auto-filling the Storage Bin field (labeled by warehouse name) on selection. The stock shown in the drawer is informational only — it is not copied into the line quantity (see **New line quantity** below).
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

### Actions per access point

| Action | Detail toolbar | Detail kebab (⋮) | List row-hover kebab | List multi-select bulk bar | Visible when |
|---|---|---|---|---|---|
| **Save** | ✅ | — | — | — | Record not processed |
| **Confirm** ("Confirmar", completes the document) | ✅ | — | ✅ | ✅ | Draft (`status === 'DR'` and not processed). In the detail toolbar it is **enabled** only when Movement Date and Name are filled and at least one line exists; the list surfaces cannot see the line count (see below) |
| **Void** ("Anular", destructive) | — | ✅ (`InternalConsumptionActions`) | ❌ | — | `status === 'CO'` |
| **Post** ("Contabilizar") | — | ✅ (`menuActions.post`) | ✅ | ✅ | `processed` true and `posted` false |
| **Unpost** ("Descontabilizar", destructive) | — | ✅ (`menuActions.unpost`) | ✅ | ✅ | `posted` true |
| **Delete** (form toolbar icon) | ✅ | — | — | — | Draft only (`hideDeleteWhenComplete`; grid delete is the generic behavior, see ETP-4656) |

- `processed` is true for both Completed and Voided documents, so a voided original can still be posted (see **Void on a posted document** below).
- The bulk bar only offers **Confirm** when at least one selected row is a draft (`buildConfirmActions` / `confirmRowFilter` in the wrapper; non-draft rows are skipped with "No está en borrador"), **Post** when at least one selected row is processed and unposted, and only offers **Unpost** when at least one selected row is posted (`postRowFilter` / `unpostRowFilter` from the shared `BulkDocumentAction`). Rows that do not qualify are skipped.
- The row-hover kebab comes from the shared `buildDocumentRowQuickActionsPostMenu` (`tools/app-shell/src/windows/custom/shared/buildDocumentRowQuickActions.js`) with `includeUnpost: true`; a draft row shows neither Post nor Unpost, and instead gets a **Confirm** entry passed through `extraMenuActions`. Void is deliberately **not** offered in the row kebab — it stays in the detail kebab only. After a row action runs, the wrapper bumps `refreshTrigger` so the list reloads in place.
- Post/Unpost call `POST /sws/neo/internal-consumption/internalConsumption/{id}/action/post` (or `/unpost`) with `neoAction` mode; success toasts use `documentPosted` / `documentUnposted`.
- **Confirm from the list** sends exactly what the form's draftMode Confirm sends: `POST /sws/neo/internal-consumption/internalConsumption/{id}/action/processNow` with body `{"fieldValues":{"processNow":"CO"},"action":"CO"}`. The bulk bar declares it as `{ value: 'confirm', neoActionName: 'processNow', neoActionBody: … }` (the optional `neoActionBody` of `BulkDocumentAction`, see `docs/ui-customization.md`). The row entry uses an explicit `onClick` instead of a declarative `neoAction` (the row kebab's `neoAction` path always sends an empty body), and reports errors through the form's own `extractErrorMessage`. Success toasts use `documentConfirmed`.
- **Drafts with no lines:** a list row does not carry its line count, so Confirm is offered on any draft from the list. The backend refuses an empty draft with core's `InternalConsuptionNoLines` message ("No se puede procesar un consumo interno sin líneas." / "It is not possible to process an Internal Consuption without line."), already returned in the session language, shown as the error toast (single row) or counted as a failed row (bulk).

## Reactive behavior and dependencies

- Header and lines are coupled through the standard detail flow. The detail page loads a header plus child lines, and child-row creation posts `parentId` and refreshes both the child list and the header record afterward.
- Status is the main document-state signal. The contract exposes `status` with Draft (`DR`), Completed (`CO`), and Voided (`VO`), defaulting new headers to Draft.
- **Complete (Confirm):** wired through the generic `draftMode` workflow on the header entity (`label: "confirm"`, `disableWhenEmpty: true`). The detail toolbar shows **Save** (outline) plus **Confirm** (filled, with a check icon). Confirm is **disabled** until the required header fields (Movement Date, Name) are filled **and** the document has at least one line — the same generic gating Physical Inventory and Goods Movements use. Confirm saves and then posts to `/internalConsumption/{id}/action/processNow`. The mandatory process parameter `action` is supplied via `draftMode.extraParams` as a flat `{ action: 'CO' }` body (validated against the request root by the backend). Save and Confirm hide once the record is processed (`processed === 'Y'`), which covers both Completed and Voided.
- **Void:** offered in the detail kebab (⋮) only, via `customComponents.moreMenuContent` (`InternalConsumptionActions`); it is not in the list row-hover kebab or the bulk bar. It is shown only when `status === 'CO'` and posts the same `processNow` endpoint with a flat `{ action: 'VO' }` body. It is one click (no confirmation dialog) and uses the **destructive** (red) menu-item style, like Unpost. The request lives in a shared helper, `tools/app-shell/src/windows/custom/internal-consumption/voidInternalConsumption.js`. It owns the request and the toasts: `internalConsumptionVoided` on success; `internalConsumptionVoidError` with the backend message (extracted like the form's process errors) on a rejection; `actionFailed` on a network error. Error toasts stay 8 s. The detail kebab refreshes and closes on success, and stays open on failure. The DB process `M_Internal_Consumption_Post` accepts `action` values `CO` (Complete) and `VO` (Void). The Void entry coexists with the Post/Unpost entries in the same kebab.
- **Void on a posted document:** core does not block it — `M_INTERNAL_CONSUMPTION_POST1` exempts `VO` and never reads `Posted`. Voiding creates a separate reversal document named `VO: <original name>`, which starts **unposted** and must be posted on its own (from this window or from "Documentos no contabilizados") for the accounting to net out.
- **Post / Unpost:** handled server-side by `InternalConsumptionHeaderHandler` (`@Named("internal-consumption")`), which delegates to the shared `DocumentPostingService`. Posting has two prerequisites the UI cannot fix by itself:
  1. **Active accounting-schema table:** the tenant's `c_acctschema_table` row for `AD_Table_ID 800168` must be `ISACTIVE = 'Y'`. The GOClient onboarding reference data now ships it active (new tenants); existing tenants get it from data-fix **R40** (`cli/src/data-fixes/sql/20260923T120000Z__R40-internal-consumption-table-active.sql`, gap **A4b** in `docs/etendo-ad/onboarding-gaps.md`). Without it, the posting engine skips the table.
  2. **Calculated cost:** every line's material transaction must have its cost calculated. If not, `DocumentPostingService` short-circuits before calling the accounting engine and returns core's `NotCalculatedCost` message, which the SPA maps (`tools/app-shell/src/lib/backendErrors.js`) to the actionable `backendError.costNotCalculated` copy — "No se pudo calcular el costo del producto." / "The cost of the product could not be calculated." The same mapping also improved Physical Inventory, which shares the pre-check.
  Posting additionally needs the product accounts (`M_Product_Acct.P_Cogs_Acct` / `P_Asset_Acct`); a missing account surfaces through the generic invalid-account enrichment of `DocumentPostingService`.
- `movementDate` has read-only logic tied to `processed === true`, and `name` has `readOnlyLogic: "@Processed@='Y'"`, so both stop being editable once the backend marks the document as processed.
- **New line quantity:** selecting a product no longer prefills Movement Quantity with the product's on-hand stock. Core's `SL_Internal_Consumption_Product` callout copies the stock (`inpmProductId_QTY`) into the quantity; `InternalConsumptionLineHandler.afterCallout` strips that `movementQuantity` update **only when the callout was triggered by the product field**. The second-UOM conversion callout (`SL_Internal_Consumption_Conversion`, on Order UOM / Order Quantity) is exempt, so a UOM conversion result is never dropped — although both second-UOM fields are discarded in this UI today. The contract's AD default for `movementQuantity` is `0`, and `min: 1` rejects it, so the user must type the consumed quantity.
- `lineNo` is derived from the next available line number for the current header (the value is still set even though its grid column is hidden).
- UOM is read-only on lines and is filled server-side from the product.
- No totals, discounts, or tax reactions exist on this document.

## Known limitations

- **`posted` is typed boolean.** Only `'Y'` renders as **Posted**; any other stored value — including core's `'D'` (posting disabled) or error states — renders as **Sin contabilizar**, and Post stays offered. Same behavior as Physical Inventory.
- **Unposting a never-posted document** is a `200` no-op server-side. The UI never offers it (Unpost is visible only when `posted` is true, and the bulk filter skips unposted rows).
- **"Documentos no contabilizados"** shows the document-type label of these rows as the raw English "Internal Consumption" (no translation), a pre-existing limitation shared by every document type there except Matched Invoices. The Internal Consumption filter option there appears only once the tenant's `c_acctschema_table` row for `800168` is active.
- **Accounting status pill visibility** is not role-restricted yet (see Detail view).

## Gap assessment

- The frontend proves the Void action is shown only for `CO` and the Save/Confirm buttons hide once `processed` is set. It does not prove whether the backend rejects repeated process or void requests safely. That is an open ambiguity.
- There is no window-specific Playwright flow covering header-create, line entry, Confirm, Void, Post/Unpost, and the post-process read-only state end to end. Current proof is contract/source-shape tests, wrapper Vitest tests, and backend unit tests (see **Automated evidence**).

## Manual verification

### List view
1. Open `/internal-consumption` and confirm the toolbar shows the date filter and **Filters**, but no **All statuses** dropdown, no Print button, and no per-row link icon.
2. Confirm the columns read Movement Date, Name, Status, Posted in that order, and that Posted shows a green **Contabilizado** or orange **Sin contabilizar** badge.
3. Confirm the sort and refresh icons match the Contacts/Warehouse style, the toolbar/table padding is tight (8 px), and there is no red dot next to the Movement Date values.

### Detail view — draft and Confirm
4. Create a new header; confirm Movement Date and Name are required and that the header fields render without a surrounding card border. Confirm there is no **Others** tab.
5. With Movement Date and Name filled but no lines, confirm **Confirm** ("Confirmar") is visible but **disabled**. Clear Name and confirm it stays disabled even after a line exists.
6. Before adding any line, confirm the lines tab shows the "No lines yet" / "+ Add lines" empty state.
7. Add a line: pick a product that has stock and confirm Movement Quantity is **not** filled with that stock. Enter a quantity; confirm the Storage Bin column label reads "Warehouse" / "Almacén", there is no **Line No.** column, and a zero or negative quantity is rejected.
8. With at least one line, confirm **Confirm** is enabled. Press it and confirm the status moves from Draft to Completed, and that Save and Confirm are no longer shown and Movement Date / Name are no longer editable.

### Detail view — Void and accounting
9. On the Completed record, confirm the header shows a **Sin contabilizar** pill. Open the kebab (⋮) and confirm it offers **Void** and **Contabilizar**.
10. Run **Contabilizar** on a tenant whose `c_acctschema_table` row for `800168` is active and whose products are costed. Confirm the success toast, the pill turns **Contabilizado**, and the kebab now offers **Descontabilizar** (red, destructive) instead of Contabilizar.
11. Run **Descontabilizar** and confirm the document returns to **Sin contabilizar**.
12. Post a document whose line products have no calculated cost yet and confirm the error toast reads "No se pudo calcular el costo del producto." instead of the raw core text.
13. Void a posted document and confirm a new `VO: <name>` document appears in the list as Voided and **Sin contabilizar**; post it too.
14. On a Draft record, open the kebab and confirm it offers neither Void nor Post/Unpost. On a Completed record, confirm **Anular** is red (destructive), like Descontabilizar.

### List actions
14b. Hover a draft row with lines and confirm the row kebab offers **Confirmar**; run it and confirm the success toast, and that the row moves to Completed without a full page reload. Run it on a draft with no lines and confirm the error toast reads "No se puede procesar un consumo interno sin líneas.".
14c. Multi-select draft rows and confirm the bulk bar shows **Confirmar**; mix in a completed row and confirm it is skipped as "No está en borrador".
15. Hover a processed, unposted row and confirm the row kebab offers **Contabilizar**; hover a posted row and confirm it offers **Descontabilizar**; hover a draft row and confirm neither appears (only **Confirmar**). Hover a completed row and confirm **Anular** is not offered there (Void is detail-only). Run one and confirm the row updates without a full page reload.
16. Multi-select processed-unposted rows and confirm the bulk bar shows **Contabilizar**; select posted rows and confirm it shows **Descontabilizar**. Run each and confirm the result toast and in-place refresh.

### Cross-window
17. Open "Documentos no contabilizados" (`/not-posted-documents`) and confirm Internal Consumption appears as a document-type filter option and that an unposted Internal Consumption row can be posted from there.
18. Open a saved record and confirm the **Attachments** tab works (upload, download, delete; 'Download all (ZIP)' and 'Delete all' with confirmation when multiple files exist).

## Automated evidence

- `artifacts/internal-consumption/__tests__/contract-integrity.test.js` (ETP-5445) — asserts on `decisions.json`, `contract.json` and the generated `InternalConsumptionPage.jsx`: the `confirm` label and `disableWhenEmpty`, `processNow=CO`, the Post menu action gated on processed-and-unposted, the destructive Unpost gated on posted, the `internal-consumption` `javaQualifier`, `posted` as a read-only grid badge (not a system field), `PROCESS_Posted` = Keep, and the Void `customMenuContent` still wired.
- `tools/app-shell/src/windows/custom/internal-consumption/__tests__/index.test.js` (source-shape) and `index.vitest.jsx` (rendered) — the wrapper renders two `BulkDocumentAction` instances for `internalConsumption` (Post applies only to processed-unposted rows, Unpost only to posted rows), the row kebab shows Post / Unpost / nothing for unposted / posted / draft rows (Y/N and boolean flags), `refreshTrigger` bumps after every executed action, the generated more-menu (Void) is not overridden, and the `customLoaders` registration.
- `tools/app-shell/src/lib/__tests__/backendErrors.test.js` — `translateBackendError — document-level NotCalculatedCost (ETP-5445)` maps both the en_US and es_ES core literals to `backendError.costNotCalculated`.
- `com.etendoerp.go`: `InternalConsumptionHeaderHandlerTest` (delegation to `DocumentPostingService`), `InternalConsumptionLineHandlerTest` (stock strip only on a product-triggered callout; conversion callout untouched), `DocumentPostingServiceTest` (cost pre-check for `M_Internal_Consumption`), `NotPostedDocumentsHandlerTest` (`"Internal Consumption"` → `800168` row enrichment).
- `cli/test/data-fixes-r40-internal-consumption-table-active.test.js` — data-fix R40 shape and behavior.
- `artifacts/internal-consumption/contract.json` and `generated/web/internal-consumption/InternalConsumptionPage.jsx` show the master-child structure, the Draft/Completed/Voided enum, the `draftMode` Save/Confirm workflow with `extraParams`, the `posted` status pill, the list-view trims (`hidePrint`, `hideLink`, `hideStatusFilter`, `customListIcons`), `noHeaderBorder`, the kebab `customMenuContent` + `menuActions` injection, child selectors, and the `processNow` action endpoint. `InternalConsumptionTable.jsx` shows the column order and the `posted` badge.
- `artifacts/internal-consumption/custom/InternalConsumptionActions.jsx` is the kebab Void action: it renders only when `status === 'CO'`, POSTs `{ action: 'VO' }` to the `processNow` endpoint, refreshes after success, disables while processing, and uses neutral styling.
- `artifacts/internal-consumption/custom/InternalConsumptionBottomPanel.jsx` exposes the shared `LinesEmptyState` as its `linesEmptyState` static.
- `tools/app-shell/src/components/contract-ui/__tests__/ListFilterBar.vitest.jsx` covers the generic `hideStatusFilter` behavior used by this window's list view.
- The generated `InternalConsumptionPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_Internal_Consumption` AD table.

## Design changes — ETP-4656

- Set `hideDeleteWhenComplete: true` in `decisions.json` so the Form-view toolbar delete icon is hidden once the record is completed ("Solo Borrador" per the delete-UX design doc). `statusField` here is `status`, a string document-status code (`DR`/`CO`/`VO`) already covered by the existing `DELETABLE_DOC_STATUSES` whitelist (`DR` deletable) in `tools/app-shell/src/utils/recordActions.js` — no shared-logic change was required for this window specifically, only enabling the flag. Grid hover/multi-select delete is untouched by this change.

## Design changes — ETP-5039

- **Storage bin label/value fixed to "Warehouse"/"Almacén":** `displayFromCatalog: true` on `storageBin` (`M_Locator_ID`) made `DataTable` (`buildDisplayCatalogMaps`, see `tools/app-shell/src/components/contract-ui/DataTable.jsx`) swap the value with the **locator's own catalog label** — which in this AD data is the bin's internal name (e.g. "Hueco X") — silently overriding the friendly warehouse name that the product's `onSelectMappings` had already written into `storageBin$_identifier`. Removing `displayFromCatalog` (and its `reason`) stops that override, so the warehouse name set at selection time is what actually renders. Separately, the column header/field **label** is now driven by `window.labelOverrides` — `{ "en_US": "Warehouse", "es_ES": "Almacén", "es_AR": "Almacén" }` — the same mechanism `goods-movements` already uses for its own locator labels; the field keeps its plain `label: "Warehouse"` as a redundant fallback with no runtime effect once `labelOverrides` is present.
- **Empty-state added to the lines tab:** `InternalConsumptionBottomPanel.jsx` now exposes the shared generic `LinesEmptyState` component (`@/components/contract-ui`) as its `linesEmptyState` static, so a draft record with no lines shows the standard "No lines yet" / "+ Add lines" empty state instead of a blank lines tab. This window has no import-from-document flow, so the generic component is used unmodified (no custom description or secondary action).
- **Pending-row warehouse label no longer clobbered by the product callout:** selecting a product in the `product-stock` drawer writes `storageBin$_identifier` = the warehouse name via `onSelectMappings`, but the `SL_Internal_Consumption_Product` callout fired by the same selection returned `M_Locator_ID` with the locator's own `_identifier` (`AS-0-0-0`), which overwrote it on the unsaved row. Two generic fixes: `applyOnSelectMappings` (`tools/app-shell/src/components/contract-ui/DataTable.jsx`) now registers every mapping target in `touchedFieldsRef`, and `applyCalloutUpdates` (`tools/app-shell/src/lib/applyCalloutUpdates.js`) makes a `X$_identifier` key inherit the base key `X`'s membership in `touched` and `forceCalloutFields` — the same rule `mergeDefaultsPreservingUserEdits` already applied to the header form in `hooks/useEntity.js`. No window-specific code. (The same callout's stock-to-quantity copy is handled server-side since ETP-5445 — see below.)
- **Negative (and zero) quantities blocked:** `movementQuantity` now declares `"min": 1` in `decisions.json`, which flows into `contract.json` as `validation.minimum: 1`. `min` is inclusive (`value >= min`, see `docs/decisions-reference.md`); no exclusive/"greater than" mechanism exists yet in the generator, so `1` was chosen over `0`/`0.01` to also reject zero — a separate, redundant backend validation already rejected zero with its own message before this change. Users can no longer enter a negative or zero consumption quantity in the add-line form or inline edit; the error toast reads "El valor debe ser al menos 1" (not an exact-wording "greater than 0" message, since that would require extending the generator with an exclusive-minimum flag).

## Design changes — ETP-5445

Internal Consumption previously declared posting as unsupported (`posted` was a `system` field and `PROCESS_Posted` was Omit). It now supports Post/Unpost end to end:

- **Frontend (`decisions.json`, contract `0.19.0`):** `posted` becomes a read-only grid badge (`badge`, `badgeLabels`, `badgeVariants`) plus a detail `statusPills` entry; `menuActions` adds `post` (visible when processed and not posted) and `unpost` (visible when posted, destructive), coexisting with the Void kebab entry; `PROCESS_Posted` goes from Omit to Keep; the header entity gets `javaQualifier: "internal-consumption"`; `draftMode` switches from the window-specific `internalConsumptionProcess` label ("Procesar") to the generic `confirm` label with `disableWhenEmpty: true`; `gridOrder` 3/4 puts Status before Posted in the list.
- **Frontend (custom loader):** new `tools/app-shell/src/windows/custom/internal-consumption/index.jsx` (grid bulk Confirm/Post/Unpost + row-hover Confirm/Post/Unpost kebab; Post/Unpost mirror `physical-inventory`) registered in `customLoaders`. Bulk Confirm needed a small generic extension: `useNeoAction.execute` takes an optional `requestBody` and `BulkDocumentAction` passes an action's optional `neoActionBody` (both default to the previous empty body).
- **Frontend (errors):** `backendErrors.js` maps core `NotCalculatedCost` (en_US and es_ES) to `backendError.costNotCalculated`.
- **Backend (`com.etendoerp.go`):** new `InternalConsumptionHeaderHandler` delegating post/unpost to `DocumentPostingService`; the cost-calculated pre-check extended to `M_Internal_Consumption`; `InternalConsumptionLineHandler.afterCallout` strips the stock-derived quantity on product-triggered callouts; `NotPostedDocumentsHandler` maps the `"Internal Consumption"` row label to `800168` so rows there are postable. Full reference: `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` (`DocumentPostingService` pre-check and `InternalConsumptionHeaderHandler` examples).
- **Tenant data:** GOClient reference data `C_ACCTSCHEMA_TABLE` for `800168` flipped `ISACTIVE` N → Y (new tenants); data-fix R40 activates it on existing tenants (gap A4b, `docs/etendo-ad/onboarding-gaps.md`, `docs/etendo-ad/tenant-remediation-knowledge.md`). R40 must be run on each existing tenant at deploy — until then, posting there fails and the Internal Consumption filter does not appear in "Documentos no contabilizados".

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
