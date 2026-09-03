# Contacts

## Intent

The Contacts window should let users maintain a shared business-partner master record for organizations or individual people that the business treats as customers, vendors, or both. From one surface, users can maintain the commercial/person header, related people, bank accounts, addresses, and the financial preferences that drive downstream sales and purchasing behavior.

## What this window should allow

- Create and update a contact header with the fields currently exposed in the merged UI: read-only identifier, commercial name, Contact Category, first name, last name, tax-id type, tax ID, website, VIES status, email, phone. Contact Category (`businessPartnerCategory`) renders as a required selector bound to `C_BP_Group_ID`, positioned right after Razón Social and before First Name — see the ETP-4566 note below.
- Switch the header between Company and Person presentation from a top-bar toggle. In Company mode the form shows Commercial Name (required) and hides first/last name; in Person mode it hides Commercial Name and shows first/last name instead, both marked required with `*`.
- Keep one record visible in the People menu for contact maintenance instead of exposing separate customer and vendor windows.
- Review the list with quick segmentation: **All** (all records constrained to customer/vendor), **Personas** (contacts with `etgoIsperson = true`), and **Empresas** (contacts with `etgoIsperson = false`). All columns are visible under every subset.
- Read the list's Type column badges as customer/vendor business-role flags — **Cliente** (purple) and/or **Proveedor** (blue) — not as the Company/Person persona toggle used in the detail header. A record with neither flag shows "—".
- Inline-edit a contact directly from the list by hovering a row and clicking the pencil icon. The active row's editable cells become inputs without navigating to the detail view.
- Delete a single contact from the list by hovering a row and clicking the trash icon; a confirmation dialog appears before the DELETE is sent. If the record has associated elements the API error message is shown as a toast.
- Select multiple contacts with checkboxes and use the selection bar to bulk-delete them. All selected rows are deleted in parallel, so a record that cannot be deleted (e.g. it has associated elements) does not block the others from being deleted. Exactly one outcome toast is shown: a success toast when every row was deleted, an error toast when none were, or a single warning toast reporting how many were deleted and how many were not on a partial failure. On a partial failure the rows that failed stay selected/checked so the user can retry; rows that succeeded are deselected and the list refetches. Error messages are shown translated to Spanish, including a specific "cannot be deleted because it has associated records" message for FK-violation failures.
- Open a detail view with a General tab for the core record and a Financial tab for billing and credit preferences.
- Add and maintain child people in the Person area.
- Add and maintain bank accounts in the Bank Account area.
- Add and maintain addresses in the Location area, including shipping and invoicing flags.
- Add and maintain per-accounting-schema receivables and prepayment accounts in the Customer Accounting area.
- Add and maintain per-accounting-schema liability and prepayment accounts in the Vendor Accounting area.
- Start child-entry creation from a new unsaved contact; the detail view auto-saves the header first, navigates to `/contacts/:recordId`, and then opens the requested Person, Bank Account, Location, Customer Accounting, or Vendor Accounting editor.
- Maintain customer-side and vendor-side financial preferences once the header already exists.
- Edit the credit limit via a stepper widget (number input with − and + buttons) in the Financial tab. Rapid successive clicks are debounced at 400 ms — the UI updates immediately on every click, but only one PATCH is sent after the user stops clicking for 400 ms. Typing a value manually and leaving the field persists it via the same `onBlur` path. The minimum allowed value is 0; clicking − when the value is already 0 has no effect.
- Review and set the commercial discount for the contact through an inline dropdown selector (visible only after the header is saved).

## Interaction model

- Route: list route `/contacts`; detail route `/contacts/:recordId`.
- Visibility: visible as the only non-hidden item in the People menu group.
- Implementation type: custom `contacts` window registered in the app-shell registry. The wrapper adds a contacts-specific provider, header persona toggle, filtered header form, custom list table, financial panel, location modal, and right-side sidebar around the generated window contract. A scoped stylesheet (`contacts.css`) applies Figma-aligned input styles (default white, hover `#F5F7F9`, focus double-border `#121217`, disabled `#F5F7F9`) exclusively to the `.contacts-rows` scope without affecting other windows.
- Shape: master-child window. The master record is `businessPartner`; child work areas are `contact` (Person), `bankAccount`, `locationAddress`, `customerAccounting` (Customer Accounting), and `vendorAccounting` (Vendor Accounting), while the Financial tab also edits related customer/vendor preference fields and discount data.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Secondary tab layout: the three child work areas use `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right. For `contact` (Persona) and `bankAccount` (Cuenta Bancaria), clicking pencil flips the row into inline edit. For `locationAddress` (Dirección), clicking pencil opens the `LocationEditorModal` instead of inline editing, and so does clicking the row's content; ticking the row's **selection checkbox** only selects the row and never opens the modal (ETP-5029 — the checkbox cell stops the click from reaching the row-body handler, the same way `DataTable` does). When one or more rows are checked, a compact selection bar (28 px buttons) appears anchored below the add-line button. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. See `docs/ui-customization.md` section 13 for the full reference.

## Reactive behavior and dependencies

- The list is constrained to records marked as customer or vendor. Subset filters offer **All**, **Personas**, and **Empresas** (i18n keys `all`, `persons`, `companies`). Each filter applies client-side via a `rowFilter` predicate on `etgoIsperson`; the server constraint (customer/vendor) remains active for all subsets. This overrides the generated `BusinessPartnerPage.jsx` default filters (Todos/Clientes/Proveedores) through JSX prop last-wins precedence — `BusinessPartnerPage` spreads `{...props}` after its own `subsetFilters`, so the value from `ContactsWindow` wins.
- The custom list enriches each row with customer/vendor type badges and a derived location column by loading `locationAddress` records separately and showing the first address found for the business partner.
- The list supports hover actions (`hoverRowActions={true}`): hovering a row reveals a circular pencil icon (edit) and a circular trash icon (delete) at the right end of the row. When a row is in edit mode the pencil becomes a ✓ (confirm save) and the trash becomes an ✗ (cancel edit). Clicking the row while it is in edit mode does not navigate to the detail view.
- Inline editing is conditional on contact type (`etgoIsperson`): for **Persona** records only `etgoFirstname`, `etgoLastname`, `etgoWeb`, `etgoEmail`, and `etgoPhone` become inputs — `name` (Razón Social) remains read-only because `ContactNameSyncHandler` rebuilds it server-side from first + last. For **Empresa** records only `name`, `etgoWeb`, `etgoEmail`, and `etgoPhone` become inputs — `etgoFirstname` and `etgoLastname` remain read-only. The PATCH payload therefore contains different fields per type.
- The "Tipo" column in the advanced filter panel maps to a hidden virtual enum column (`__contactType`) that accepts "Cliente" and "Proveedor" as values and translates them via a `buildCriteria` hook into real backend boolean criteria (`customer = true/false`, `vendor = true/false`). The visible "Tipo" table column is separate and only displays the business-role badges.
- When one or more rows are selected, the shared floating `SelectionToolbar` (ETP-4972) appears as a viewport-fixed dark pill pinned bottom-center of the screen — additive, not a replacement of the idle toolbar above it — showing: count on the left; an icon-only red destructive trash button (`text-destructive`, transparent background, hover highlight — restyled in ETP-4972 for legibility on the dark pill; the previous 40 × 40 px white-bg/pink-border chip was invisible against it) on the right. There is no separate X button rendered by `selectionBarRightActions` anymore — `SelectionToolbar` always renders its own trailing close (×) button, so the window's former standalone X (40 × 40 px, no border, gray `#828FA3` icon) was removed as a duplicate. The **Imprimir** button is hidden for this window via `listViewOptions.hidePrint: true` (the **Vista Previa** button was removed unconditionally from every window's selection bar in ETP-4644, so it no longer needs a per-window flag). The X clears the selection immediately and also resets the DataTable's internal checkbox state via a `clearSelectionTrigger` counter passed from `ListView`.
- Single-row delete goes through the app's shared row-quick-actions pipeline (`RowQuickActions`'s `onDelete` → `ListView`'s `defaultRequestDelete` → `useRowDelete`, `tools/app-shell/src/hooks/useRowDelete.jsx`) — **not** `ContactsTable`'s own `confirmDelete`, which is unreachable dead code for this window (see the `ContactsTable.jsx` bullet in "Automated evidence" below). Bulk delete (ETP-4656) uses the shared `runBatchDelete`/`toastBatchDeleteOutcome` utilities (`tools/app-shell/src/lib/batchDelete.js`). Both single-row and bulk delete parse NEO Headless / Etendo JsonDataService error bodies through `extractErrorMessage` from `tools/app-shell/src/hooks/useEntity.js`, which maps FK-violation error shapes to the translated `deleteBlockedByReferences` message and displays it via `toast.error` (single-row) or `toast.warning`/`toast.error` (bulk, per outcome). Before ETP-3660, failed DELETEs were silently swallowed.
- The detail top bar exposes a Company/Person toggle backed by local contacts window context. That toggle changes which header fields are rendered: Company mode excludes first/last name; Person mode excludes commercial name and marks first/last name as required. The required constraint is frontend-only — the backend concatenates first + last name into the `name` column on save, so both fields must be filled for that to work correctly.
- The contacts window uses explicit save for the header form (no auto-save on blur). When a user edits header fields and presses **Save**, `DetailView` calls `hook.handleSave()`, which PATCHes the record; that PATCH is what triggers `ContactNameSyncHandler` to rebuild Razón Social. The per-field-blur auto-save that was added in ETP-3660 was removed in ETP-4533; `DetailView`'s `autoSaveOnBlur` prop defaults to `false` and the contacts window no longer overrides it.
- A server-side `ContactNameSyncHandler` (`EntityPersistenceEventObserver` in `com.etendoerp.go`) fires on every `C_BPartner` UPDATE. When `EM_Etgo_Isperson = true` and at least one of `EM_Etgo_Firstname` / `EM_Etgo_Lastname` changed, it rebuilds `Name` (Razón Social) as `trimmedFirstname + " " + trimmedLastname`. Guards: isPerson false/null → skip; neither name changed → skip; combined result blank → skip. The handler covers both Classic UI (OBDal save) and Etendo GO (NEO NeoCrudHandler, which also persists via OBDal). It does not interfere with `BusinessPartnerHandler`, which only derives `Name` on POST for new records with a blank name.
- The toggle is persisted via `EM_Etgo_IsPerson` (boolean column on `C_BPartner`, module `com.etendoerp.go`, default N). When an existing record is opened, the toggle initializes from `data.etgoIsperson`. Changing the toggle writes `etgoIsperson` into the form's editing state via `onChange` (the same mechanism used for `name`/`etgoFirstname`/`etgoLastname`); it is persisted only on the next explicit **Save**, which sends `etgoIsperson` in the **same** PATCH as the name fields. This is required: the backend `ContactNameSyncHandler` only keeps/rebuilds the person name fields when `EM_Etgo_Isperson` is true, so `etgoIsperson` and the person names must travel together — a separate, unordered PATCH for the toggle would let the name-Save land while `isperson` is still false and drop the names. For new records, the create POST is built from the same editing state, so the toggle choice made before the first save is carried by the POST — no separate PATCH is fired.
- Switching the toggle from **Person** to **Company** (Empresa) pre-fills the **Razón Social** (`name`) field from the person's typed names. When the current mode is Person and the user has entered a first name and/or last name, flipping to Company writes `First Last` (trimmed) into the `name` field. The pre-fill **re-syncs on every Person→Company switch as long as the Razón Social is still the auto-generated value** — i.e. the user has not manually edited it. So if the user flips back to Person, corrects the first/last name, and switches to Company again, Razón Social updates to match the corrected names. Once the user **manually edits** the Razón Social field, it is treated as user-owned and is never overwritten again. A **persisted Razón Social that was never auto-generated by this feature** (e.g. entered directly on an existing record) is likewise treated as user-owned and never clobbered. Switching Person→Company also **clears the person fields** (`etgoFirstname`, `etgoLastname`) since a company has no personal name and those fields are hidden in Company mode. Conversely, switching **Company→Person clears the Razón Social** (`name`): in Person mode the backend `ContactNameSyncHandler` rebuilds `Name` from first + last on save, so any company name would be stale. Both clears write into the editing state (like the pre-fill) and are persisted only on explicit Save. The pre-filled value is written into the form's editing state, so it is visible and remains editable; like every other header edit it is persisted only on explicit **Save** (there is no auto-PATCH of `name` on the toggle switch). Implementation lives in `ContactTypeToggle.jsx` (`handleSelect`), which tracks the last auto-written value in a ref (`lastAutoFilledNameRef`) and considers the field "auto-owned" when the current `name` is blank or equals that ref (the ref resets when the loaded record changes to a different existing id). It reads/writes form state through an `onChange` prop wired from the generic `DetailView` `topbarExtra` slot (`onChange={hook.handleChange}`). This `DetailView` change is additive — other windows' `topbarExtra` components simply ignore the extra prop, so their behavior is unaffected.
- Person, Bank Account, and Location child areas still require a persisted header ID, but the detail view now auto-saves a new header and reopens the requested child area instead of forcing the user to save manually first.
- The Financial tab behaves as a dependent surface:
  - credit limit is editable there via the debounced stepper;
  - a horizontal `<hr>` separator visually divides the Credit section from the Billing Preferences section;
  - customer billing fields appear only when the customer flag is enabled;
  - vendor billing fields appear only when the vendor flag is enabled;
  - the Customer and Vendor flags are rendered as inline checkboxes (label + checkbox on one row, no extra vertical padding) using a `[&_.pt-6]:pt-0` wrapper to remove EntityForm's default label-alignment offset;
  - "Bloqueo de cliente" and "Bloqueo de proveedor" are rendered as **No / Sí** radio groups (`YesNoRadio`) positioned next to the respective payment-terms selector in the same flex row, not as checkboxes;
  - the billing fields per side are split into two rows: top row (Price List, Payment Method, Account on the customer side / Expense Account on the vendor side) rendered by EntityForm in default 3-column grid; bottom row rendered as a flex row with Condiciones de pago (EntityForm, 1 column) and the blocking radio group side-by-side. The third selector in the top row uses `FIN_Financial_Account_ID` for customer ("Cuenta" / "Account") and `PO_Financial_Account_ID` for vendor ("Cuenta contable de gastos" / "Expense Account") — both labels are declared in `decisions.json → window.labelOverrides`.
- Before the header is saved, the financial panel suppresses effective billing-preference editing and clears prefilled billing values from the unsaved draft so those values are not posted too early.
- The discount selector (native `<select>`) is only visible after the header exists **and** there is at least one available discount option in the catalog. If the catalog returns no options the selector is not rendered, so the "Ninguno" empty state never appears without meaningful choices.
- Customer-side and vendor-side account selectors are filtered by the selected payment method, mirroring Etendo Classic. The `selectorContext` passes `Fin_Paymentmethod_ID` (for customer) and `PO_Paymentmethod_ID` (for vendor) to the selector request, so the eligible financial account list is filtered in real time as the payment method changes. The filter is applied in NEO Headless by a dedicated selector policy (`FinancialAccountPaymentMethodSelectorPolicy` in `com.etendoerp.go`), which emits an HQL `EXISTS` over the `FinancialMgmtFinAccPaymentMethod` link table — the generic SQL→HQL validation-rule fallback cannot translate the Classic subquery rule, so it is handled by the policy instead.
- Changing the payment method clears the account selection on that side (customer/vendor). `BillingPreferencesForm` wraps `EntityForm`'s `onChange` so that editing `paymentMethod`/`pOPaymentMethod` resets `account`/`pOFinancialAccount` (and its `$_identifier`), preventing a stale account that is no longer compatible with the new method. The wrapper fires only on user edits, so a compatible saved pair is preserved on initial load.
- The payment method fields also carry a payment-method callout in the contract, so account-related behavior reacts to payment-method choice.
- In the Location modal, country is required; choosing a country clears the region, reloads region options through country-filtered selectors, and keeps country/region option loading paginated behind searchable pickers.
- New locations default shipping address and invoicing address to true, and the modal creates or updates the business-partner location plus underlying location data through the same `locationAddress` endpoint.
- The same `LocationEditorModal` is also reused by the shared partner-address picker for inline "+ Add address" flows in other windows. That reuse is proved in code/tests, but it is not a distinct extra screen inside `/contacts` itself.
- The Location tab's own add-line button reads **"+ Añadir dirección"** (ETP-5021) — `secondaryTabs.locationAddress.addLineLabelKey: "addAddress"` in `decisions.json` swaps in the same standardized text used by the header-level partner-address picker mentioned above, instead of the generic tab-name-derived "Añadir Dirección". See `docs/decisions-reference.md`'s `addLineLabelKey` row for the mechanism.
- Bank account defaults are partially visible in current evidence: country defaults from configuration and bank format defaults to `GENERIC`. A bank-account format field exists, but current evidence does not prove how the form reacts between generic, IBAN, SWIFT, and Spanish modes.
- The detail view shows a **horizontal financial summary** in both primary tabs (no right-side sidebar): above the General form and at the top of the Financial tab. The summary widget shows three KPIs — **Balance Neto** (Net Balance, computed client-side as Income − Expenses), **Ingresos** (Income), and **Gastos** (Expenses) — each with a trend badge (green up-arrow `#EEFBF4`/`#17663A` for non-negative, red down-arrow `#FEF0F4`/`#D50B3E` for negative) whose text reads "vs últimos 3/6 meses" according to the selected period. A **Ver gráfico** button opens a dialog with the trend chart (`BPChartSVGContent`) and a 3M/6M toggle. KPI values come from `bp-stats` (current-month income/expenses; Net Balance = income − expenses). The trend badges are **period-aware**: they are computed from the `bp-trend` series via `windowTrend(arr, months)` as `((lastMonth − firstMonthOfWindow) / |firstMonthOfWindow|) * 100` over the last N months of the selected period (3M or 6M), so the percentage changes with the period and stays consistent with the chart. The badge is omitted when the window has fewer than 2 points or the first month is zero/non-finite.
- The **period selector** ("Últimos 3 meses") sits in the tabs bar, immediately to the right of the General/Financial tabs (`DetailView` `tabsBarAfter` slot — rendered right after the tab buttons, not pushed to the far right). It and the summary widget share the selected period and the fetched data through `ContactsFinanceContext`, so changing the period updates both badges and chart. Chart axis labels are localized based on the active locale.
- No parent/child total, tax, or document-status reactions are visible in current evidence.

## Gap assessment

- The surface clearly mixes customer and vendor semantics, but current evidence does not prove the full business rule for when a contact should be customer-only, vendor-only, both, or neither. The document should therefore treat those role semantics as supported flags, not as a fully explained business classification model.
- The Company/Person toggle is persisted via `EM_Etgo_IsPerson` on `C_BPartner`. The persistence model is resolved: opening a record initializes the toggle from DB, and changing the toggle writes `etgoIsperson` into the editing state so it is persisted with the single explicit Save (same PATCH as the name fields) — for new records the create POST carries the toggle choice. There is no separate toggle PATCH.
- New master records default `customer` to true in the contract, while the list only shows customer or vendor records. Current evidence does not prove whether a user is expected to create non-customer/non-vendor contacts here or what should happen if both flags are cleared.
- The contract exposes additional related entities such as `customer`, `vendorCreditor`, and `employee`, but the current UI evidence shows only the General tab, Financial tab, and the five child work areas (Person, Bank Account, Location, Customer Accounting, Vendor Accounting). It is ambiguous which deeper role-specific records are intentionally hidden, auto-managed, or still missing from the UI.
- `employeeAccounting` (table `C_BP_Employee_Acct`, `tabId: 214`) exists in the contract but is explicitly **out of scope** for ETP-4402 and remains unwired — no `secondaryTabs` entry, no field classification beyond the pre-existing default. It should be treated as a separate follow-up, not a gap in this change.
- Neither `customerAccounting` nor `vendorAccounting` restricts visibility by the corresponding `customer`/`vendor` role flag. No mechanism exists in the current generator to conditionally show/hide a whole secondary tab (`visibleWhen`/`displayLogic` only apply to fields and row actions), so both tabs are unconditionally visible regardless of whether the business partner is flagged as customer or vendor. This is a known generator limitation, not a decisions.json omission.
- **Resolved.** `accountingSchema` on both `customerAccounting` and `vendorAccounting` is now classified `system` (hidden, `addLineFromSibling: true`) — mirroring the Product Category precedent (`ProductCategoryAccountingHandler`, `com.etendoerp.go/src/com/etendoerp/go/schemaforge/`). Dedicated `CustomerAccountingHandler` (`@Named("customerAccountingHandler")`) and `VendorAccountingHandler` (`@Named("vendorAccountingHandler")`) now exist in `com.etendoerp.go`, each defaulting `C_AcctSchema_ID` to the client's active `AcctSchema` on POST when absent from the request body. Both entities declare `javaQualifier` in `decisions.json` (`entities.customerAccounting.javaQualifier` / `entities.vendorAccounting.javaQualifier`) to route through these handlers, so record creation no longer requires the user to pick an accounting schema manually.
- The contacts quick-create modal used outside the main `/contacts` route has explicit person/company save logic, but the inspected main window code only proves field-switching behavior. Manual verification is still needed to confirm how a new person created directly in the full Contacts detail route is persisted.
- The contract contains richer customer fields such as invoice terms and invoice schedule, but the current custom financial panel does not visibly expose all of them. That is a real gap or deliberate simplification; current evidence is not enough to state which.
- The custom list shows a single derived location string per record. Current evidence does not prove how users discover multiple addresses from the list alone.
- Bank-account behavior beyond defaults is only partially evidenced. The presence of bank format options implies conditional behavior, but the current code reviewed for this document does not prove the exact field-level reactions.

## Manual verification

1. Open People -> Contacts and confirm Contacts is the only visible People window.
2. Confirm the list route loads at `/contacts` and shows the **All**, **Personas**, and **Empresas** subset filters (not Clientes/Proveedores). Confirm all eight columns are visible under every filter.
3. Confirm the list hides print, row-eye, counter, link, and filter affordances.
4. Open a record at `/contacts/:recordId` and confirm the detail top bar shows a Company/Person toggle in addition to the General and Financial tabs. Confirm there is NO right-side sidebar; instead a horizontal financial summary appears in both tabs (above the General form and at the top of the Financial tab) and a period selector ("Últimos 3 meses") sits to the right of the tabs.
5. Toggle between Company and Person and confirm the header swaps Commercial Name vs. First Name/Last Name fields without changing the list's customer/vendor meaning. In Person mode, confirm First Name and Last Name show the `*` required indicator; in Company mode, confirm Commercial Name shows `*` and first/last name are not visible.
6. From a new unsaved contact, trigger add in Person, Bank Account, and Location and confirm the header auto-saves, the route changes to `/contacts/:recordId`, and the requested child editor opens.
7. In the Financial tab, verify the Credit section shows as a horizontal row: descriptive text on the left, stepper on the right. Click + rapidly five times; confirm the UI updates immediately on each click but only **one PATCH request** is sent to the backend after you stop clicking (verify in the Network tab). Confirm − does not go below 0.
8. Verify a horizontal separator line (`<hr>`) appears between the Credit section and the Billing Preferences section.
9. In the Financial tab, verify the Customer and Vendor checkboxes are rendered inline (checkbox + label on a single row with no extra vertical spacing above).
10. When Customer is enabled, verify billing fields appear in two rows: top row (Tarifa, Método de pago, Cuenta); bottom row (Condiciones de pago selector on the left, Bloqueo de cliente No/Sí radio on the right, side by side). When Vendor is enabled, verify the equivalent block shows: top row (Tarifa de compra, Método de pago, Cuenta contable de gastos); bottom row (Condiciones de pago, Bloqueo de proveedor No/Sí radio).
11. Verify "Bloqueo de cliente" and "Bloqueo de proveedor" show as **No** / **Sí** radio buttons, not checkboxes. Default selection is No.
12. In the Financial tab, verify customer and vendor flags control the related billing-preference sections.
13. Select a payment method in the financial section and confirm the eligible financial account selector is filtered to only accounts compatible with that payment method.
10. Open the Location add flow and confirm it uses a modal, requires country, clears region when country changes, paginates/searches selector options, and defaults shipping/invoicing flags on a new address.
11. Add or edit a location and confirm the saved address is reflected back in the contact detail and list enrichment.
11. In the Dirección tab, tick a row's selection checkbox and confirm the row is marked as selected (and the selection bar appears) while the `LocationEditorModal` stays **closed**; untick it and confirm the modal stays closed. Tick the header select-all and confirm the same. Then click the row's content (outside the checkbox) and confirm the modal **does** open for that address. Repeat the checkbox check in the Persona and Cuenta Bancaria tabs to confirm pencil/inline-edit is unaffected.
12. Add a bank account and confirm the saved row stays linked to the current contact.
13. In both the General and Financial tabs, confirm the horizontal summary shows three KPIs — Balance Neto, Ingresos (green), and Gastos (red) — each with a trend badge. Click the period selector to the right of the tabs, switch between "Últimos 3 meses" and "Últimos 6 meses", and confirm the badge text updates ("vs últimos 3/6 meses"). Click **Ver gráfico** and confirm a chart dialog opens with a 3M/6M toggle. Confirm Balance Neto equals Ingresos − Gastos.
14. Reopen an existing person-like contact and verify the toggle shows Person mode (persisted via `EM_Etgo_IsPerson`). Create a new contact in Person mode, save it, and confirm the toggle stays in Person mode after the record is saved.
15. Change the toggle on an existing contact, press **Save**, then reload the page; confirm the selection persists. Also confirm that changing the toggle and reloading WITHOUT pressing Save does NOT persist the change (the toggle no longer auto-PATCHes on click — it is saved with the explicit Save alongside the name fields).
16. In **Person** mode, type a First Name and Last Name, then switch the toggle to **Empresa** (Company). Confirm **Razón Social** is pre-filled with `First Last`. Do NOT press Save yet and confirm no PATCH of `name` is sent on the switch (verify in the Network tab); the value persists only after pressing **Save**. Re-sync check: switch back to Person, **correct** the First/Last Name (without editing Razón Social manually), then switch to Empresa again — confirm Razón Social **updates** to match the corrected names. Manual-edit check: now **manually edit** Razón Social to a custom value, switch back to Person, change the First/Last Name, and switch to Empresa again — confirm the manually edited Razón Social is **NOT overwritten**. Also verify that opening an existing record whose Razón Social was entered directly (never auto-generated) and switching Person→Company does not clobber that value. Field-clearing check: in Person mode with First/Last Name filled, switch to Empresa and confirm First Name and Last Name are cleared (empty). Then switch back to Person and confirm Razón Social is cleared. Confirm neither clear is persisted until **Save**.
17. Open an existing person-type contact (isPerson = Y). Edit First Name or Last Name and press **Save**. Confirm Razón Social (Name) updates to `firstName + " " + lastName` on save (rebuilt server-side by `ContactNameSyncHandler`). Confirm that merely moving focus to another field without pressing Save does NOT persist the change (no auto-save on blur).
18. Open an existing company-type contact (isPerson = N). Edit any field and press **Save**. Confirm the field is persisted but Razón Social is not recalculated (handler only runs for person records).
19. Hover a row in the list and confirm the pencil and trash icons appear. Click the pencil on a **Persona** row and confirm Nombre/Apellidos become inputs while Razón Social is read-only text. Click the pencil on an **Empresa** row and confirm Razón Social becomes an input while Nombre/Apellidos are read-only text. Press Enter to save; confirm the row updates without navigating to the detail view.
20. In inline edit mode, press Escape and confirm the row reverts to display mode without saving.
21. Inline-edit a Persona row, change Nombre/Apellidos, save. Confirm the PATCH sends only `{etgoFirstname, etgoLastname, etgoWeb, etgoEmail, etgoPhone}` (not `name`).
22. Click the trash icon on a row that has associated elements (e.g. test9). Confirm the confirmation dialog opens. Confirm after clicking Delete a `toast.error` appears with the API's error message and the row is NOT removed.
23. Click the trash icon on a row that can be safely deleted. Confirm after clicking Delete the row disappears from the list.
24. Select two rows where one cannot be deleted (e.g. test9 + test6). Click the bulk trash button in the selection bar, confirm the dialog. Confirm neither row is deleted and a toast shows the error. Confirm the other row (test6) was NOT deleted.
25. Select two rows that can both be deleted. Click the bulk trash button, confirm. Confirm both rows disappear and the selection is cleared.
26. With rows selected, click the X button in the selection bar. Confirm the selection bar disappears AND all row checkboxes are visually unchecked.
27. In the advanced filter panel, confirm "Tipo" appears as a filterable field with "Cliente" and "Proveedor" options. Apply `Tipo = Cliente` and confirm only customer contacts are shown. Apply `Tipo = Proveedor` and confirm only vendor contacts are shown.
28. Confirm the Tipo column shows **Cliente** in purple (`#F4F1FD` bg / `#4316CA` text) and **Proveedor** in blue (`#F0FAFF` bg / `#0075AD` text).
29. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- `tools/app-shell/src/windows/registry.js` and `tools/app-shell/src/menu.json` confirm that `/contacts` resolves to the custom contacts wrapper and remains the only visible People menu entry.
- `tools/app-shell/src/windows/custom/contacts/index.jsx`, `ContactsContext.jsx`, `ContactsBusinessPartnerForm.jsx`, and `ContactTypeToggle.jsx` confirm the Company/Person toggle and the field-exclusion behavior applied on the header form. `ContactTypeToggle.jsx` reads `data.etgoIsperson` on record open and, on toggle change, writes `etgoIsperson` into the form's editing state via `onChange` — it no longer issues any PATCH of its own. Its `handleSelect` also pre-fills `name` (Razón Social) with the trimmed `First Last` when switching from Person to Company, re-syncing on every such switch as long as the field is still auto-owned. It tracks the last auto-written value in `lastAutoFilledNameRef` and treats `name` as auto-owned when the current value is blank or equals that ref, so a manually edited (or pre-existing, never-auto-generated) Razón Social is never overwritten; the ref resets when the loaded record changes to a different existing id. On Person→Company it also clears `etgoFirstname`/`etgoLastname`, and on Company→Person it clears `name` (the backend rebuilds it from first+last for persons). All of these — `etgoIsperson`, the `name` pre-fill/clear, and the person-field clears — are written to the form's editing state via the `onChange` prop wired from `DetailView`'s `topbarExtra` slot (`onChange={hook.handleChange}`) and persist together in the single explicit Save (or the create POST for new records). Sending `etgoIsperson` in the same request as the name fields is required so the backend `ContactNameSyncHandler` (which only keeps person names when `isperson` is true) does not drop the names — the previous separate fire-and-forget toggle PATCH could land after the name-Save and cause exactly that data loss. The `index.jsx` wrapper div carries `flex-1 min-h-0 flex flex-col` to preserve the app-shell flex height chain; without these classes the `ListView` scroll container has no bounded height and the list cannot scroll. `index.jsx` also declares `SUBSET_FILTERS` (Todos/Personas/Empresas) passed via `subsetFilters` prop to override the generated page's default, `selectionBarSize="default"` so toolbar buttons match the normal-state height (h-9), and `selectionBarRightActions` which renders the trash button in the selection bar (the X button it used to also render was removed in ETP-4972 — `SelectionToolbar` now provides its own built-in close button, so the two duplicated). ETP-4656 rewrote the bulk-delete handler in `index.jsx` (`handleBulkDeleteConfirm`) to use the shared `runBatchDelete` (`tools/app-shell/src/lib/batchDelete.js`), which attempts every selected row in parallel via `Promise.allSettled` and partitions the results into succeeded/failed; backend errors are translated through `extractErrorMessage` from `useEntity.js` (FK-violation → `deleteBlockedByReferences`). Exactly one outcome toast fires via `toastBatchDeleteOutcome`. On partial failure the failed rows are reselected (kept checked, for retry) via a `reselectFailed` callback threaded in from `ListView.jsx`'s `applyBulkDeleteOutcome`, while succeeded rows are deselected and the list refetches.
- `artifacts/contacts/generated/web/contacts/BusinessPartnerForm.jsx` and `BusinessPartnerPage.jsx` confirm the header fields, top-bar slot usage, General/Financial tabs, and the Person/Bank Account/Location child areas. `BusinessPartnerForm.jsx` declares `required: true` on `etgoFirstname` and `etgoLastname`; `ContactsBusinessPartnerForm.jsx` excludes those fields in Company mode, so the `*` indicator only appears in Person mode.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` confirms the new-header auto-save flow before opening require-saved secondary tabs. It also exposes `hideAddLineChevron` (hides the dropdown chevron on the Add Line button), `addLineButtonPaddingX` (left-padding wrapper around the button), `formScrollPaddingB` (bottom padding of the form scroll container), and `secondaryTabContentPaddingT` (top padding of secondary tab content areas). The previously inline nested ternary for `formScrollPaddingX` is extracted to `formScrollPaddingXResolved` before the JSX return to satisfy SonarQube's cognitive complexity rule.
- `tools/app-shell/src/components/ui/add-line-button.jsx` exposes a `hideChevron` prop (default `false`). When `true`, the divider and dropdown trigger are omitted and the primary button receives `borderRadius: 7` on all corners. The contacts window passes `hideAddLineChevron={true}` and `addLineButtonPaddingX="pl-2"` via `DetailView` to achieve a flat, left-padded "Añadir…" button without a split-button chevron.
- `tools/app-shell/src/windows/custom/contacts/contacts.css` provides scoped styles via the `.contacts-rows` class applied to the contacts wrapper. Key rules: `th button[role="checkbox"][aria-checked="false"]` receives `background-color: transparent` to prevent the unchecked select-all checkbox from covering the column header's `border-b` separator line; hover and focus-visible styles for inputs inside `.contacts-rows` use `rounded-lg` selectors consistent with Shadcn inputs.
- `tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx` confirms list enrichment and the following behavior: (a) eight always-visible columns — Commercial Name, First Name, Last Name, Type, Location, Website, Email, Phone; (b) hover actions (pencil/trash) for inline edit and single-row delete; (c) conditional inline editing where Persona rows expose `etgoFirstname`/`etgoLastname` inputs and Empresa rows expose the `name` input, with `etgoWeb`/`etgoEmail`/`etgoPhone` editable for both types; (d) a hidden virtual `__contactType` enum column with a `buildCriteria` hook that maps Cliente/Proveedor enum values to real backend boolean criteria (`customer`/`vendor`); (e) `TypeBadge` renders only the business-role badges (Cliente = purple, Proveedor = blue). `ContactsTable.jsx` still declares its own `confirmDelete`/`handleDeleteRow` (using `extractApiErrorMessage` and `toast.error`) and wires them into its internal `DataTable` as `onDeleteRow`, but this code path is unreachable in practice for this window: `hoverRowActions` is never set to `true` here (it defaults to `false` in `ListView.jsx`), and `rowQuickActions` is enabled, so `DataTable`'s `legacyDeleteEnabled` gate (`!!onDeleteRow && (hoverRowActions || !quickActionsEnabled)`) always resolves to `false` — the legacy hover-delete button is never rendered and `onDeleteRow` is never invoked. The pencil/trash icons actually visible in the UI (manual verification steps 19–23) are `RowQuickActions`'s overlay instead, whose `onDelete` resolves to `ListView`'s shared `defaultRequestDelete` (`useRowDelete`) — the same `extractErrorMessage`/`toast.error` pipeline bulk delete now uses (see the "Reactive behavior and dependencies" note above).
- `tools/app-shell/src/windows/custom/contacts/ContactsFinancialPanel.jsx` and `BillingPreferencesForm.jsx` confirm post-save financial editing, customer/vendor-dependent sections, credit-limit persistence, and discount-row maintenance. The Financial tab layout uses a horizontal two-column design (descriptive text fixed-width on the left, interactive widget on the right) for both the Credit and Billing Preferences sections. `ContactsFinancialPanel.jsx` includes an inline `CreditLimitStepper` sub-component that renders a numeric input with − and + buttons; rapid clicks are debounced (400 ms via `useRef + setTimeout + clearTimeout`) so at most one PATCH is sent per burst. An `<hr>` separator divides the Credit section from the Billing Preferences section. The container uses `space-y-2` for tight vertical rhythm. `BillingPreferencesForm.jsx` renders billing fields in a two-row layout: the top row holds price list, payment method, and financial account; the bottom row holds payment terms alongside a `YesNoRadio` for the customer/vendor blocking flag. Customer and vendor checkboxes are wrapped in a `[&_.pt-6]:pt-0` div to neutralize `EntityForm`'s label-alignment padding without removing the expand-on-click toggle behavior.
- `tools/app-shell/src/windows/custom/contacts/LocationEditorModal.jsx` confirms saved-header dependency, country/region selector dependency, paginated searchable country/region pickers, and atomic create/update/delete behavior through the `locationAddress` endpoint. All user-facing labels including the close button are i18n-driven via `useUI`.
- `tools/app-shell/src/components/contract-ui/PartnerAddressPicker.jsx` and `tools/app-shell/src/components/contract-ui/__tests__/PartnerAddressPicker.test.js` confirm that the same contacts location modal now supports inline "+ Add address" creation for partner-address selectors outside the Contacts window.
- `tools/app-shell/src/components/contract-ui/CreateContactModal.jsx` provides partial supporting evidence for person/company create payload semantics in the shared quick-create flow, but no contacts-window-specific automated test was found for the main detail-route save behavior.
- `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js` confirm menu visibility and route-to-loader registration for `/contacts`.
- `tools/app-shell/src/windows/custom/contacts/ContactsSummaryWidget.jsx`, `ContactsPeriodButton.jsx`, `ContactsFinanceContext.jsx`, and `ContactsFinancialPanel.jsx` implement the horizontal financial summary that replaced the former right-side sidebar (`BusinessPartnerSidebar.jsx`, deleted). `ContactsFinanceContext` holds the shared period state and fetches `bp-stats`/`bp-trend` by record id. `ContactsSummaryWidget` renders the three KPIs with period-aware trend badges and the "Ver gráfico" dialog (reusing the local `BPChartSVGContent` in `contacts/BPChartSVGContent.jsx`); Net Balance value is Income − Expenses and every badge trend is computed from the `bp-trend` series via `windowTrend` (last month vs first month of the selected period). In the General tab the widget is wired through `DetailView` `headerContent`; in the Financial tab it is rendered at the top of `ContactsFinancialPanel`, so the same summary is visible in both tabs. `ContactsPeriodButton` (wired via the `DetailView` `tabsBarAfter` slot) renders the period selector immediately to the right of the General/Financial tabs. The sidebar is removed by setting `window.sidebarLayout: false` in `decisions.json`, which stops the generator from emitting `sidebarContent`.
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.autoSaveOnBlur.test.js` is a static regression guard (ETP-3660) that reads `DetailView.jsx` as a string and asserts: `autoSaveOnBlur` prop has a `false` default; `handleFieldBlur` exists alongside `hook.editing`, `hook.selected`, and `hook.handleSave` usage; `onFieldBlur={autoSaveOnBlur ? handleFieldBlur : undefined}` appears on both Form instances (principal and collapsed sections).
- `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/ContactNameSyncHandlerTest.java` contains 14 JUnit 5 unit tests (>80 % coverage) for `ContactNameSyncHandler`: happy paths (first-name-only change, last-name-only, both changed, trimming, null partial names), isPerson guards (false, null), no-changes guard, blank-name guard, isValidEvent guards (TriggerHandler disabled, wrong entity), and getObservedEntities caching. Uses `MockedStatic<ModelProvider>` and `MockedStatic<TriggerHandler>`; resets the static `entities` field via reflection in `@BeforeEach`.
- `tools/app-shell/src/lib/apiError.js` is the shared utility for parsing non-ok fetch Responses into human-readable error messages. It supports NEO Headless format (`{error: {message}}`), Etendo JsonDataService format (`{response: {error: {message|string}}}`), top-level `{message}`, and falls back to `Error ${status}` for non-JSON bodies. `ContactsTable.jsx` is the only place in the app-shell that still imports it (its own `confirmDelete`), and that path is unreachable dead code for this window (see the `ContactsTable.jsx` bullet above) — `contacts/index.jsx`'s bulk-delete handler no longer uses it (ETP-4656 moved bulk delete onto `extractErrorMessage` from `useEntity.js` instead, see above).
- `tools/app-shell/src/components/contract-ui/DataTable.jsx` now accepts `clearSelectionTrigger` (number, default 0); a `useEffect` watching it resets the internal `selectedRows` Set when the value increments. `ListView.jsx` owns a `clearSelectionCounter` state, increments it as part of its `clearSelection` callback, and passes it as `clearSelectionTrigger`. This ensures checkboxes are visually cleared when the X button is pressed, not just the parent's array state.
- `tools/app-shell/src/lib/__tests__/apiError.test.js`, `tools/app-shell/src/components/ui/__tests__/checkbox.test.js`, `tools/app-shell/src/components/ui/__tests__/custom-icons.test.js`, and a new `buildCriteria` describe block in `tools/app-shell/src/lib/__tests__/gridQuery.test.js` provide automated regression coverage for the ETP-3660 additions.
- `tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.test.js` (ETP-3660) — 9 source-read assertions covering `CreditLimitStepper` debounce behavior (debounceRef declaration, clearTimeout before scheduling, 400 ms delay, null reset after firing, useEffect cleanup on unmount, absence of the old direct `setTimeout(onBlur, 0)`), the `<hr>` separator presence, and `BillingPreferencesForm` props wiring.
- `tools/app-shell/src/components/ui/__tests__/add-line-button-hide-chevron.test.js` (ETP-3660) — 5 source-read assertions verifying the `hideChevron` prop default, the `!hideChevron` guard around divider and dropdown, full `borderRadius: 7` when chevron is hidden, primary button always rendered, and `DIVIDER_STYLE` rendered only inside the `!hideChevron` block.
- No contacts-window-specific E2E test was found in the current repo. Generic route-loading and shared entity-flow evidence lives in `docs/generated-custom-windows/app-shell-functional-flows.md`, including registry-backed window loading and shared child-refresh/defaults behavior.
- The generated `BusinessPartnerPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_BPartner` AD table.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.

## Bank Account inline-add fixes — ETP-4009

The following issues in the **Cuenta Bancaria** inline add-row form were resolved:

**Column alignment.** The add-row form inputs now align pixel-perfectly with the existing table rows and column headers. Previously, the flex-based `InlineLinesPanel` and the `table-layout:fixed` `DataTable` drifted apart because the 40 px action column (legacy delete), a checkbox without `flexShrink:0`, and the first string column having a different flex-basis were not accounted for. All three mismatches are corrected.

**IBAN overflow truncation.** Long IBAN values no longer push adjacent columns out of alignment. Flex cells in `InlineLinesPanel` now carry `minWidth:0`, so long non-breaking strings are truncated with an ellipsis instead of overflowing their cell.

**Country default stripped at form init.** When creating a "Cuenta genérica" (Use Generic Account No.) row, the country field previously sent the literal string `@COUNTRYDEF@` to the backend, causing a "Country not present in import set" validation error. The add-row form now strips Etendo AD variable placeholders (`@…@`) from field defaults at initialization, so the country field starts empty and the record can be saved without error.

**Format dropdown uses Radix Select.** The "Formato cuenta bancaria" dropdown in the add-row form now uses the same styled Radix Select component as "País de Origen", with the chevron icon correctly contained inside the field border.

**SWIFT Code column added.** The "SWIFT Code" column is now visible in the Cuenta Bancaria table and in the inline add-row form, enabling entry of the SWIFT code when "Use SWIFT + Generic Account No." format is selected.

**Validation messages translated to Spanish.** Five backend validation messages for the bank account entity are now shown in Spanish:
- IBAN field empty when IBAN format is selected.
- Generic account number empty when Generic format is selected.
- Country field empty when IBAN format is selected.
- IBAN code invalid for the selected country.
- SWIFT code or generic account number empty when SWIFT format is selected.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## ETP-4262 — Contacts UI improvements

**Selection bar print/preview buttons hidden.** `ListView.jsx` now respects `listViewOptions.hideEye` and `listViewOptions.hidePrint` in the selection bar (bulk-selection mode), not only in the topbar. Previously those flags only suppressed the topbar Print button; the Vista Previa and Imprimir buttons in the selection bar were always shown. Contacts already had both flags set to `true` in `decisions.json`. (Superseded by ETP-4644: the Vista Previa button and the `hideEye` flag were removed entirely — see below.)

**Column width support added to the pipeline.** A new `columnWidth` field (integer, pixels) is accepted in `decisions.json` per entity field. It flows through `resolve-curated.js` → `generate-contract.js` → `generate-frontend.js` and becomes a `minWidth` property on the generated column object. `linesColumnWidth.js` reads `col.minWidth` as the flex-basis override in both `columnFlex()` and `columnMinWidthPx()`, giving that column more visual weight in the flex distribution.

**Person sub-tab email column widened.** `email` in the `contact` entity now declares `columnWidth: 320` so the column shows more of a typical email address before truncating.

**Bank Account sub-tab improvements.**
- `bankFormat` column label abbreviated to **Format** / **Formato** via `col.labels` (per-locale override in the contract, priority 1 in `resolveColumnLabel`). The full AD label "Bank Account Format" / "Formato cuenta bancaria" remains the form label.
- `bankFormat`, `accountNo`, and `iBAN` declare `columnWidth: 320`, `360`, and `400` respectively, giving them more room relative to the shorter columns.

**`SecondaryTableTab` now forwards `labelOverrides`.** `DetailView.jsx` was passing `labelOverrides` to `SecondaryTableTab` as a prop but the component never forwarded it to the `Table` it renders. As a result, `useLabel(labelOverrides)` inside `DataTable` received nothing and `resolveColumnLabel` fell through to the base locale JSON, ignoring any window-level label overrides. The prop is now passed through.

**Discount selector hidden when no options exist.** `BillingPreferencesForm.jsx` now renders the `DiscountSelect` only when `discountOptions.length > 0`. Previously the selector was always shown (after header save), displaying "Ninguno" as the only option when no discounts were configured.

**Customer/Vendor checkboxes are now circular.** The Customer and Vendor toggles in `BillingPreferencesForm.jsx` use a new local `CircularCheckbox` (Figma radio-style indicator) instead of the square `EntityForm` checkbox.

**Person/Company toggle is now radio buttons.** `ContactTypeToggle.jsx` renders two radio buttons (circular indicator + label) instead of the pill-button toggle. Selection now writes `etgoIsperson` into the editing state and is persisted with the explicit Save (see the Person/Company toggle persistence notes above); the earlier immediate/fire-and-forget PATCH of `etgoIsperson` was removed because it could land after the name-Save and drop the person names.

**Sidebar replaced by a horizontal financial summary.** The right-side sidebar was removed (`decisions.json` → `window.sidebarLayout: false`). A horizontal summary widget (`ContactsSummaryWidget.jsx`) now sits above the General form via the `DetailView` `headerContent` slot and is also rendered at the top of `ContactsFinancialPanel.jsx`, so the same Balance Neto / Ingresos / Gastos summary with trend badges and a "Ver gráfico" dialog is visible in both primary tabs. The period selector (`ContactsPeriodButton.jsx`) moved next to the General/Financial tabs via a new `DetailView` `tabsBarAfter` slot (rendered right after the tab buttons, distinct from `tabsBarRight` which floats to the far right). Shared period + `bp-stats`/`bp-trend` data flow through a new `ContactsFinanceContext`. Net Balance value is Income − Expenses; all trend badges are period-aware, computed from `bp-trend` via `windowTrend` (last month vs first month of the 3M/6M window) and omitted when the window has fewer than 2 points or the base month is zero/non-finite. The old `BusinessPartnerSidebar.jsx` and its test were deleted. New i18n keys: `bpNetBalance`, `bpViewChart`, `bpVsLast3Months`, `bpVsLast6Months`.

## ETP-4402 — Customer Accounting and Vendor Accounting tabs

**Two new secondary tabs wired.** `customerAccounting` (table `C_BP_Customer_Acct`, tab ID 212) and `vendorAccounting` (table `C_BP_Vendor_Acct`, tab ID 213) are now declared in `decisions.json → window.secondaryTabs`, using `tabMode: "table-form"` (a genuine child table keyed by `accountingSchema`, not the header's own state — `tabMode: "form-only"` would have silently bound to the wrong record). Both entities already existed in `contract.json` from a prior raw extraction; the gap was that `resolve-curated.js`'s `buildCuratedEntities` includes any entity by default unless `exclude: true` is set, so they were present in the contract but never wired into a visible tab.

- **Customer Accounting** add-line fields: `accountingSchema` (General Ledger selector, required), `customerReceivablesNo` (Customer Receivables No., required), `customerPrepayment` (Customer Prepayment, optional).
- **Vendor Accounting** add-line fields: `accountingSchema` (required), `vendorLiability` (Vendor Liability, required), `vendorPrepayment` (Vendor Prepayment, optional).
- Both tabs follow the `requireSavedRecord: true` precedent from `contact`/`bankAccount` — they only become available once the business-partner header exists.
- `accountingSchema` is now classified `system` (hidden, `addLineFromSibling: true`) on both entities. `CustomerAccountingHandler` (`@Named("customerAccountingHandler")`) and `VendorAccountingHandler` (`@Named("vendorAccountingHandler")`) in `com.etendoerp.go` auto-fill `C_AcctSchema_ID` on record creation, closing the gap previously flagged above — no `NeoHandler` follow-up remains outstanding for this field.
- Both tabs are unconditionally visible; no role-flag gating (customer/vendor) exists at the tab level in the current generator.
- `employeeAccounting` was explicitly left unwired — out of scope for this ticket.

## ETP-4447 — CSV/TXT import

**Import button added to the list toolbar.** `decisions.json → window.import` (`enabled: true`, `spec: "contacts"`, `entity: "businessPartner"`, `formats: ["csv", "txt", "xlsx"]`) renders an Import action in `ListView.jsx`'s toolbar, opening the shared `ImportDialog` (dropzone → column mapping → review queue → send).

**Composite descriptor splits one CSV row into three records.** Contacts registers a custom import descriptor (`contactsImportDescriptor.js`, name `contacts`) instead of the plain single-entity default: a row builds a `businessPartner` op (with `oBTIKTaxIDKey` defaulted and `searchKey` falling back to `name`), and — only when address fields are present — a `locationAddress` op plus a `contact` (person) op, so a single "Company + contact person + address" row lands correctly across the three underlying tabs. `country` resolves through a dedicated FK resolver (`contactsFkResolvers.js`) rather than the generic per-field resolver, since it needs the composite descriptor's own SimSearch call. `region` used to have one too — see the ETP-4997 section below for why it does not any more.

**Row-level dedupe.** ⚠️ **Superseded by ETP-4995:** the key is now `["taxID"]`, not `["etgoEmail"]` — email is optional, and `dedupeRows` skips deduplication entirely when any key part is blank. `window.import.dedupe` was `{ scope: "file", key: ["etgoEmail"] }` — an in-file duplicate (same email seen twice) is flagged `skipped` rather than sent twice. The first row remains importable; the later row is not sent to `/batch`. Backend unique-constraint rejections use the same skipped-row treatment. The importer does not merge or overwrite an already persisted contact without an explicit upsert policy.

## ETP-4905 — Contact category resolution during import

The Contacts CSV import supports the same dependent-category behavior as the Product import. ⚠️ **Superseded by ETP-4995:** the three columns described here (`categoryCode`, `categoryName`, `category`) collapsed into a single `category` column, whose cell is matched as an exact `C_BP_Group.Value` first and as an accent/case/whitespace-insensitive `C_BP_Group.Name` otherwise. The resolution and auto-creation semantics below are unchanged. The descriptor resolves an existing `businessPartnerCategory` and writes its ID into the `businessPartner` operation before the composite batch is sent.

When no category matches, the descriptor creates one through the `business-partner-category` endpoint using a deterministic uppercase code derived from the category name. The resolver cache stores in-flight promises per import token, so concurrent rows with the same new category create one record and reuse its ID. Ambiguous normalized names fail the individual row without guessing; category-creation failures also remain row-level errors, while valid rows in the same file continue. Files without any category column preserve legacy behavior and let the backend defaults apply.

The import mapping exposes aliases for Spanish compact and spaced headers: `codigocategoria`, `nombrecategoria`, and `categoria` (plus accented/spaced variants). The complete functional and visual evidence is in [`artifacts/delivery-evidence/ETP-4905/README.md`](../../artifacts/delivery-evidence/ETP-4905/README.md), including the happy path, category reuse, ambiguous-category error, and category-creation failure.

**Company data and partial files.** The import also accepts company email, phone, website, tax-ID type, CIF/NIF, contact-person fields, and address/city/postal/country/region. Address-bearing rows create the location operation only after country resolution. First name, last name, and tax-ID type are optional at import level, so a file containing only legal name plus optional email is valid; the descriptor applies the technical tax-ID-type default and leaves absent person fields empty. The E2E evidence opens the saved Contact detail and verifies the imported header fields and location instead of relying only on the list grid.

**Review queue is a real per-field data grid.** Instead of collapsing a row into one cell, the queue renders one column per declared field with a frozen leading Status column (line number, status pill, inline Retry/Copy/Skip icons, and — for an already-skipped row — an "Edit again" action that brings it back for another look). A field that failed FK matching (e.g. `country`) renders as a click-to-open popover backed by the same SimSearch candidates already computed for it, with a live, debounced re-search as the user types and a "browse all" fallback when there were no close candidates at all — fixing the row is picking the right record, not retyping text and hoping "Re-validate" matches this time.

**Known gap.** The country SimSearch matching is only as good as Etendo's own SimSearch fuzzy scoring (e.g. "España" alone can rank real matches surprisingly low); the pick-a-value/browse-all UI above exists specifically to make that recoverable without re-editing the source file.
- Tab labels ("Customer Accounting" / "Vendor Accounting") already existed as AD-derived `tabs` dictionary entries in both `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json` ("Contabilidad cliente" / "Contabilidad proveedor"), so no new i18n keys were required.

## ETP-4533 — Explicit header save + Razón Social pre-fill

**Per-field blur auto-save removed.** The per-field-blur auto-save added in ETP-3660 was removed for the contacts header form. The `autoSaveOnBlur` prop is no longer passed by the Contacts `BusinessPartnerPage`, and `DetailView`'s `autoSaveOnBlur` prop now defaults to `false`. Header fields are persisted only when the user presses **Save** (`hook.handleSave()`), which is what triggers `ContactNameSyncHandler` to rebuild Razón Social. The other intentional contacts autosaves are unchanged: the `CreditLimitStepper` debounced PATCH (`ContactsFinancialPanel`) and inline list edit (`ContactsTable`). The Empresa/Persona toggle no longer auto-PATCHes — its `etgoIsperson` write now goes through the header editing state and is persisted with the explicit header Save (this was the fix for the name-drop regression: the toggle PATCH and the name-Save were two separate, unordered requests, so the names could be saved while `isperson` was still false and get dropped by `ContactNameSyncHandler`).

**Razón Social pre-fill on Person→Company switch.** When a contact is in Person mode and the user has typed a first name and/or last name, switching the type toggle to Company (Empresa) now pre-fills the **Razón Social** (`name`) field with the trimmed `First Last`. The pre-fill **re-syncs on every Person→Company switch as long as the Razón Social is still the auto-generated value** (the user has not manually edited it), so correcting the first/last name in Person mode and switching back to Company updates Razón Social to match. Once the user manually edits Razón Social — or when a record already carries a Razón Social that was never auto-generated by this feature — that value is treated as user-owned and is never overwritten. The value is written to the form's editing state (visible and editable) and is persisted only on explicit Save; there is no auto-PATCH of `name` on the switch. The logic lives in `ContactTypeToggle.jsx` (`handleSelect`): it records the last auto-written value in a ref (`lastAutoFilledNameRef`) and treats `name` as auto-owned when the current value is blank or equals that ref (the ref resets when the loaded record changes to a different existing id).

**Field clearing on type switch (QA follow-up).** Switching Person→Company now also **clears the person fields** `etgoFirstname` and `etgoLastname` (a company has no personal name; they are hidden in Company mode). Switching Company→Person now **clears the Razón Social** `name`, because in Person mode `ContactNameSyncHandler` rebuilds `Name` server-side from first + last on save — keeping a stale company name would be misleading. Both clears go through the same `onChange` editing state and persist only on explicit Save. It receives an `onChange` prop wired from the generic `DetailView` `topbarExtra` slot (`onChange={hook.handleChange}`). This `DetailView` change is additive; other windows' `topbarExtra` components ignore the extra prop and are unaffected.

## ETP-4566 — Business Partner Category exposed on General tab

**Field now visible and required.** `businessPartnerCategory` (`C_BP_Group_ID`, selector against `C_BP_Group`) was already extracted into `entities.businessPartner.fields` in `decisions.json` but fully hidden (`form: false`). It is now `form: true`, `required: true`, still `section: "principal"`. `C_BP_Group_ID` is mandatory in the AD source and already carried `required: true` in `contract.json`, so no AD/backend change was needed — this was a pure visibility flip.

**Reorder gap — resolved.** The change was intended to place the field right after Razón Social (position 3, before First Name), by setting `"order": 3` on `businessPartnerCategory` and shifting `etgoFirstname`/`etgoLastname`/`oBTIKTaxIDKey`/`taxID`/`oBTIKVIESStatus` up by one in `decisions.json`. This was initially blocked: `generate-contract.js` (`schema_forge_core`, `lockFieldOrderToPreviousContract`) pinned every field already present in the on-disk `contract.json` to its previous array position for stability across re-extractions, overriding `decisions.json`'s `order` for any field that already existed in the previous contract (just hidden, in this case). Fixed in `schema_forge_core` commit `a2ba69f` (Feature ETP-4566: *Let order/visibility changes beat the field-order lock*): a field now frees itself from the lock only when its own `order` or `visibility` changed since the previous contract; untouched fields keep resolving exactly as before. Verified against the local core checkout (`make regen ONLY=contacts LOCAL_CORE=1`): `businessPartnerCategory` now sits at index 3 in `contract.json`'s `businessPartner.fields` (right after `name`, before `etgoFirstname`), and the generated `BusinessPartnerForm.jsx` renders it in that same slot.

**Side effect — `oBTIKVIESStatus`/`etgoWeb`/`etgoEmail` order ties — fixed.** Verifying the lock fix surfaced a pre-existing data issue in `decisions.json`: `etgoWeb` already carried `"order": 7` (untouched by the ETP-4566 renumbering), and the renumbering that shifted `taxID` from `6`→`7` to make room for `businessPartnerCategory` created a tie at `order: 7` between `taxID` and `etgoWeb`. A second, previously unnoticed tie existed one step further down: `oBTIKVIESStatus` (bumped `7`→`8` by the same renumbering) collided with `etgoEmail`, which already carried `"order": 8`. Because the new lock-release rule frees a field from its locked slot whenever its own `order` or `visibility` changes, `oBTIKVIESStatus` re-resolved ahead of `etgoWeb` at the tied position — VIES status rendered after Website instead of before it, breaking the intended `taxID → oBTIKVIESStatus → etgoWeb` sequence. Resolved by renumbering `etgoWeb`/`etgoEmail`/`etgoPhone` in `decisions.json` to `9`/`10`/`11` respectively (leaving `taxID: 7` and `oBTIKVIESStatus: 8` untouched), which removes both ties while preserving every field's relative order. Verified with `make regen ONLY=contacts LOCAL_CORE=1`: `contract.json`'s `businessPartner.fields` now resolves `..., taxID, oBTIKVIESStatus, etgoWeb, etgoEmail, etgoPhone, description, ...` in that exact sequence, and a positional diff against the pre-fix `contract.json` confirms the *only* fields that moved are `etgoWeb`/`oBTIKVIESStatus` swapping back into their correct slots — no other field's position changed. `npx sf-validate-pipeline --scope=contacts` (via the local core checkout) reports 0 violations. This was a `decisions.json` data cleanup, not a generator issue.

**Label follow-up — product-facing name instead of the AD-native one.** The field's AD-native label ("Business Partner Category" / "Grupos de terceros", from the global `C_BP_Group_ID` dictionary entry used by every other window that exposes this column) did not match the product's naming for this window — the user confirmed via screenshot testing it's the same field, just needs a Contacts-specific display name. Fixed via `window.labelOverrides` in `decisions.json` (per `docs/decisions-reference.md` § Label Overrides and `docs/i18n-guide.md`), scoped to this window only — the global `en_US.json`/`es_ES.json` `fields.C_BP_Group_ID` dictionary entries (shared by other windows) were left untouched:
```json
"window": {
  "labelOverrides": {
    "en_US": { "C_BP_Group_ID": "Contact Category" },
    "es_ES": { "C_BP_Group_ID": "Categoría de contacto" }
  }
}
```
`resolve-curated.js` forwards this to `contract.json → frontendContract.window.labelOverrides`, and the generated `BusinessPartnerPage.jsx` threads it through as the `labelOverrides` prop consumed by `useLabel()` in the form/detail components — resolution order: `labelOverrides[locale][C_BP_Group_ID]` → global AD dictionary label → raw `field.label`. The field's raw `label` in `decisions.json` was also updated from `"Business Partner Category"` to `"Contact Category"` so the (English) fallback matches if the override chain is ever bypassed. Renders as **"Categoría de contacto"** in es_ES and **"Contact Category"** in en_US; unaffected by the reorder fix above — the field now renders with this label at position 3 (right after Razón Social).

## ETP-4564 — Shared cache lifecycle and invalidation (SEC T-01 3/3)

**All Contacts reads now go through the shared `@etendosoftware/app-shell-core` cache.** This closes finding T-01 (no shared client-side cache): reopening a contact, returning to the list, or reopening a tab reuses previously loaded data instead of refetching. The cache is provided app-wide by `DataProvider` (composed in `AppShellRuntime`) and is memory-only — no business data is written to `localStorage`.

**What is cached, and its freshness policy:**

| Data | Where | Query key (isolating dimensions) | Freshness |
| --- | --- | --- | --- |
| List (page 0) | generic `useEntity` (ETP-4563) | scope + spec + entity + sort + filters | record (30s) |
| Header record | `useEntity.fetchById` | scope + spec + entity + recordId | record (30s) |
| 5 child collections | `useEntity.fetchChildren` | scope + spec + childEntity + parentId | record (30s) |
| Finance KPIs `bp-stats` / `bp-trend` | `ContactsFinanceContext` | scope + spec `contacts` + entity `bp-stats`/`bp-trend` + recordId | record (30s) |
| Attachments | `useAttachments` | scope + `attachments` + tableName + recordId | record (30s) |
| Selector / catalog options | `SelectorInput` | scope + selectorUrl + normalized context + page offset | catalog (5min) |

"scope" is `{ auth, client, role, org }` from the cache provider, so **cached Contacts data cannot leak across a session, role, or organization** — a role/org change produces distinct keys (and `DataProvider` also clears the cache on identity change).

**Attachments are now truly lazy.** `useAttachments` no longer lists on mount; it fetches only once the Attachments tab becomes active (`isActive`), and reopening a fresh tab reuses the cache. Callers that don't pass `isActive` (e.g. `goods-receipt`) keep the previous eager behavior.

**Invalidation.** Mutations that go through the generic `useEntity` (header save/delete, child add/update/delete) already invalidate their list/record/child queries. The Contacts-specific raw-fetch mutations that bypass `useEntity` invalidate explicitly via the `useContactsCacheInvalidation` helper (`windows/custom/contacts/contactsCacheInvalidation.js`):

- inline table edit / row delete / bulk delete → invalidate `businessPartner` (list + record);
- credit-limit save (`ContactsFinancialPanel`) → invalidate `businessPartner` + finance KPIs (`bp-stats`, `bp-trend`);
- discount create/update/delete (`BillingPreferencesForm`) → invalidate finance KPIs + `businessPartner`;
- attachment upload/remove/update-description → invalidate that record's attachment list.

Explicit **Refresh** still forces a network revalidation (bypasses freshness).

**Limitations.**

- **Selection is not preserved across navigation** — that is T-05, tracked separately. T-01 only reduces request volume / improves reuse.
- **No server-side / HTTP caching** — this is a client-side, in-memory cache only; a full page reload starts cold.
- Selector option **pages beyond page 0** are cached per offset but the accumulated infinite-scroll list is not deduplicated across partial scroll positions.
- **Before/after network trace:** the historical "~19 requests" figure has no committed source report (`docs/reports/contacts-test-report.md` is an external assessment doc, not in this repo); a reproducible current measurement is captured separately as delivery evidence rather than embedded here.

## ETP-4156 — Contact name/username derivation moved server-side

**What changed.** The derivation of the two AD-mandatory `AD_User` columns that this window does not expose as editable fields moved out of the app-shell's generic `useEntity` hook into a dedicated `NeoHandler`. The hook used to branch on hardcoded entity names (`contact` / `adUser` / `user` / `businessPartner` / `bpartner`) inside `applyContactsRequiredFields`, violating the "no window-specific logic in generic services" principle — the metadata-driven runtime must stay entity-agnostic.

**New handler.** `ContactHandler` (`@Named("contactHandler")`, `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/ContactHandler.java`) is a `handle()` pre-hook on the contacts spec's `contact` entity, routed via `entities.contact.javaQualifier` in `decisions.json`:

- **`name`** (`AD_User.Name`, mandatory, declared `readOnly / form: false`) — derived as `firstName + " " + lastName` when the effective name is blank: the body value on POST, the persisted `ad_user.name` on PATCH/PUT (merging body and persisted parts for whichever half the body omits, mirroring `BusinessPartnerHandler#deriveNameFromPerson`). An explicit name always wins.
- **`username`** (`AD_User.Username`, AD-mandatory, not declared as a Schema Forge field at all) — derived from `name` on **POST only**, when blank. `NeoHiddenMandatoryDefaultsResolver` cannot cover it: that resolver only handles mandatory columns that are *not* exposed as SF fields **and** have an AD default, and it runs on the `/defaults` pre-fill path, so it cannot see values the user just typed.

Both are truncated to the column length — `AD_User.Name` and `AD_User.Username` are `NVARCHAR(60)`.

**Two deliberate behaviour changes** (previously implicit in the front-end code):

- Renaming a contact no longer rewrites its `username`. The old hook reassigned it on every PATCH whose payload carried a new `name`; `AD_User.Username` is unique and is the login identifier.
- The `user` window (spec `user`, which exposes `name` and `username` as editable fields) no longer receives a silent autofill. Its own handler is `UserRoleAssignmentHandler` (`@Named("user")`), which is unrelated to name derivation.

**Related backend fix.** `BusinessPartnerHandler` now truncates the placeholder `searchKey` it injects on POST to 40 chars (`C_BPartner.Value` is `VARCHAR(40)` while `Name` has 60). The app-shell used to pre-truncate this client-side, which masked the missing server-side guard — without it, a create with a 48-char commercial name fails with *"Value too long. Length 48, maximum allowed 40"*. `afterHandle()` replaces the placeholder with `em_etgo_identifier` anyway, so the truncation is lossless.

**Import descriptor.** `contactsImportDescriptor.js` keeps its own `contact.name` derivation: the CSV's contact-level `firstName`/`lastName` columns are frequently blank (the row's real name lives in the BP-level `etgoFirstname`/`etgoLastname`), so it falls back further to the BP's own name — a fallback the handler cannot reproduce because those values are not in the contact's request body. Its explicit `searchKey` is now redundant with the server-side guard but harmless, and was left in place.

**Activation.** The handler only fires once `ETGO_SF_ENTITY.Java_Qualifier` is populated for the `contact` entity: run `make regen ONLY=contacts PUSH_TO_NEO=1`. The qualifier is also committed to the module dataset (`com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml`, `contact` row) — without that line `update.database` resets the column to null and the handler silently stops firing, which is exactly what happened during this ticket's verification.

**Regeneration side effect.** The `make regen` this change required also brought `oBTIKVIESStatus` up to date in `contract.json` / `contract.mcp.json` / `BusinessPartnerForm.jsx` (`defaultValue: 'P'`, `maxLength` 10 → 60). That is not stray drift: it completes the contacts artifact regeneration called for by ETP-4144 (see `schema_forge_core/docs/plans/ETP-4144-cross-domain.md` § `window:contacts` — artifact regeneration), whose output never reached this repo's committed artifacts. Re-running the regen reproduces it, since it is a faithful read of AD.

**Automated evidence.** `ContactHandlerTest.java` — 16 JUnit 5 tests covering the method guards, POST name derivation (both parts, one part, explicit name wins, 60-char truncation), POST username derivation (from derived name, from explicit name, existing username respected, truncation), PATCH derivation from persisted parts, the persisted-name and blank-record-id guards, and the regression that PATCH never touches `username`. `BusinessPartnerHandlerTest#testHandlePostTruncatesInjectedSearchKeyToColumnLength` covers the 40-char guard. On the front end, the obsolete `applyContactNameDefaults` / `applyContactsRequiredFields` suites were removed and `buildPatchPayload`'s now-unused `entity` parameter dropped; `buildPatchPayload` gained a test asserting a contact PATCH carries only the changed fields.
## ETP-4565 — Customer/Vendor Accounting tabs: entity-level non-deletable

**`entities.customerAccounting.hideDelete: true`** and **`entities.vendorAccounting.hideDelete: true`** added — both accounting tabs' rows can no longer be deleted (`apiPrediction.crud.customerAccounting.delete` / `crud.vendorAccounting.delete: false`). **Resolved (follow-up pass):** both tabs are now capped at one record via `window.secondaryTabs.customerAccounting.maxDetailLines: 1` and `window.secondaryTabs.vendorAccounting.maxDetailLines: 1` — the same generic `secondaryTabs`-pattern capability added for `product`/`asset-group` (see `product.md` for the full mechanism). Each tab's cap is independent (declared per-key), which is exactly why this window motivated the per-tab shape instead of a window-wide flag. Regenerated via `make regen ONLY=contacts`; `sf-validate-pipeline --scope=contacts` reports 0 violations. Regression tests: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js` (decisions.json assertion) and `tools/app-shell/src/components/contract-ui/__tests__/DetailView.secondaryTabsMaxLines.vitest.jsx` (behavioral, shared across the family).

**Regen hit the known `AD_Ref_List_Trl` translation-stripping gap** on `businessPartner.oBTIKVIESStatus` (unrelated field) — see `docs/feedback.md` ("ETP-4565 — `contacts` hit the known `AD_Ref_List_Trl` translation-stripping gap"). The 3 dropped `es_ES` labels were restored by hand; `BusinessPartnerForm.jsx` (which had no other change from the regen) was reverted to its committed version rather than hand-patched.

**Auto-creation (requirement 3, DB-verified):** `customerAccounting` rows are auto-created reliably (100% of recently-created customer business partners have a `C_BP_Customer_Acct` row). `vendorAccounting` is a near-miss (9/10 recently-created vendor business partners) — one record created 2026-06-05 has no `C_BP_Vendor_Acct` row. Flagged for follow-up investigation in `com.etendoerp.go`, not fixed in this pass.

## ETP-4644 — "Vista Previa" button removed

The selection bar's **Vista Previa** (eye) button never had a working backend — clicking it
always errored — and did not apply to any current window. It was removed unconditionally from
`ListView.jsx` (shared component, affects every window), so the `listViewOptions.hideEye`
flag this window set in `decisions.json` became meaningless and was removed along with it.
The **Imprimir** button and `hidePrint` flag are unaffected — that is a separate, working
action. Regenerated via `make regen ONLY=contacts`.

**Out of scope for this ticket, confirmed by design (Financial Account precedent):** `financial-account`'s equivalent "Contabilidad" tab (`accountingConfiguration` entity) already satisfies both single-record and non-deletable requirements structurally — `FinancialAccountAccountingHandler` always resolves a find-or-create single row per ledger (no "Add" affordance exists) and no delete UI was ever built for it. No decisions.json change was needed there; see the ETP-4565 coordinator report for the full per-window breakdown.

## ETP-4835 — Stray VIES status badge hidden from header

A red "✕ P" status pill rendered next to the Cancelar button in the header, but only on
**new** (unsaved) Contact records — existing records never showed it. Root cause: the
window has no real document-status column, so the generator's `statusField` resolution
(`generate-frontend.js`) fell back to name-sniffing the first `readOnly` field whose name
contains "status" — which for `businessPartner` is `oBTIKVIESStatus` (the EU VIES tax-ID
validation status), an unrelated field that happens to default to `'P'` ("Pendiente") via
`/businessPartner/defaults`. On existing records that field is usually `null`, so the pill
never appeared there — matching the "only on new records" symptom exactly.

**Fix is scoped to this window only** — `decisions.json` → `window.statusField: "none"`,
which uses the existing explicit-override escape hatch in `generate-frontend.js` (already
shipped for `assets` since ETP-4103) to force `statusField = null` for `businessPartner`,
bypassing the name-sniffing fallback entirely. No generator change was made: the fallback
itself is still frágil for other windows in principle, but tightening it for every window
is a separate, cross-window concern with its own risk budget — out of scope here. Verified
with `make regen ONLY=contacts` (published core, no `LOCAL_CORE` needed): `BusinessPartnerPage.jsx`'s
`statusField` resolves to `null` and the pill no longer renders on new or existing records.

## ETP-4784 (part 2) — SII/TicketBAI Business Partner defaults exposed

Three Classic Business Partner fields, used as **billing-time defaults** by the Etendo
Classic AEAT SII / TicketBAI modules, are now exposed in the Go Contacts window. These are
plain configuration values with **no callout/derivation logic of their own** on the Business
Partner — they are only *read* later when an invoice is generated. Architecture investigation
has **confirmed, by code inspection and live DB-trigger verification**, that consumption of
these defaults at invoicing time already works automatically in Go with no additional code:
the `aeatsii_invoice_trg` DB trigger was confirmed to exist with correct logic for reading
`aeatsiiDefaultsiikey`/`aeatsiiSiikeylist`, and `XMLUtils.java` was confirmed to read the
`tbaiIssimplifiedinv` field directly off the Business Partner at TBAI send time — both fire
the same way regardless of whether the invoice originates in Classic or Go. **Not yet
verified end-to-end through the Go UI** — that check requires a running Tomcat/Go
environment, which was not available during this ticket's development, so it remains a
pending manual verification (steps below) rather than a follow-up ticket.

**Pending manual end-to-end verification (requires a live Go environment):**
1. Start Tomcat / the local Go environment.
2. In Go Contacts, create or edit a Business Partner with `Customer = true`, "Clave por
   defecto" checked, "Clave tipo factura" = `F1`, and "Factura Simplificada" checked. Save.
3. Create and complete a sales invoice for that Business Partner from Go.
4. In Classic, open the invoice → AEAT SII tab → confirm "Clave tipo factura" was populated
   with `F1`.
5. Trigger/inspect that invoice's TBAI submission → confirm the XML carries
   `<FacturaSimplificada>S</FacturaSimplificada>`.

| Classic field | Go field (camelCase) | Entity | Where it lives in Go |
|---|---|---|---|
| "Clave por Defecto" | `aeatsiiDefaultsiikey` | `customer` | Toggle in the Financial tab → **Default fiscal values** section, "SII" sub-block, `FiscalDefaultsSection.jsx` — shown only when `data.customer` is true (see part 3 below) |
| "Clave tipo factura" | `aeatsiiSiikeylist` | `customer` | Enum selector (`R`/`F1`/`F2`/`F4`) in the same "SII" sub-block, visible only when `aeatsiiDefaultsiikey` is checked |
| "Factura Simplificada" | `tbaiIssimplifiedinv` | `businessPartner` | Toggle in the "TicketBAI" sub-block, `FiscalDefaultsSection.jsx` — always shown, unconditional (see part 3 below) |

**SII (`aeatsiiDefaultsiikey` / `aeatsiiSiikeylist`):** both fields were already `editable`
and already pushed to NEO from earlier work — only the UI wiring was missing. **Correction
(part 4 below):** that classification was only correct for the `customer` entity; the fields
were never declared for `businessPartner`, which is the entity the UI actually persists
through, so saves were silently discarded until part 4's fix. Deliberately
**not** declared with an explicit `fieldGroup`/entity-level customization in `decisions.json`:
the generated `CustomerForm.jsx` for the `customer` entity is never imported by
`BusinessPartnerPage.jsx` or any custom component — every `customer`/`vendor` entity field in
this window (`priceList`, `paymentMethod`, `purchasePricelist`, …) is hand-wired directly via
small local `fields` arrays passed to `EntityForm`. `aeatsiiDefaultsiikey`/`aeatsiiSiikeylist`
follow that same established pattern, but from `FiscalDefaultsSection.jsx` (see below) rather
than `BillingPreferencesForm.jsx`.

**Hide ≠ strip.** Unchecking "Clave por defecto" hides `aeatsiiSiikeylist` via
`displayLogic` — it does **not** clear the stored value. The field simply stops being
visible and stops being required while hidden; its previously-saved value persists
untouched, and reappears if "Clave por defecto" is checked again. This is intentional
parity with Classic's own behavior for the same field, not a bug. Covered by a regression
test in `FiscalDefaultsSection.vitest.jsx` ("does not clear aeatsiiSiikeylist when the
default-key checkbox is off").

Field labels are resolved
automatically by `EntityForm` via `useLabel()`/`t(column)` against the AD dictionary
(`EM_Aeatsii_Defaultsiikey` → "Default Key", `EM_Aeatsii_Siikeylist` → "Invoice type key" in
both `en_US.json` and `es_ES.json` — the AD reference data itself has not been translated to
Spanish yet; that is a pre-existing AD/i18n data gap, not something this change introduces).
The four enum option labels (`R`/`F1`/`F2`/`F4`) are hardcoded in the component with their
`labels.es_ES` overrides copied verbatim from `contract.json`, following the same static-enum
pattern already used by `AssetsConfigPanel.jsx`/`TaxSifField.jsx` — `F1` ("Invoice") has no
AD-side Spanish translation either, same underlying data gap.

## ETP-4784 (part 2, UX follow-up) — Fiscal defaults grouped into one section

Part 2 (above) shipped the 3 fields as **stray fields** split across two unrelated spots:
`aeatsiiDefaultsiikey`/`aeatsiiSiikeylist` inside the Cliente billing block, and
`tbaiIssimplifiedinv` auto-rendered in the header form's General tab — with no visual
indication that all three configure the same thing (billing-time defaults consumed by SII /
TicketBAI when an invoice is generated for this Business Partner). Human feedback: group them
under one clearly-labeled section, regardless of which Classic tab each field originally came
from.

**New component — `tools/app-shell/src/windows/custom/contacts/FiscalDefaultsSection.jsx`.**
Self-contained: it renders its own title/description (i18n keys `fiscalDefaults` /
`fiscalDefaultsDescription`, both locales) plus the 3 fields, so `ContactsFinancialPanel.jsx`
only needs to mount it — no layout duplication. It follows the label-left / content-right row
convention already used by the sibling Credit and Billing Preferences sections in the same
panel. Rendered in the Financial tab, directly below the Billing Preferences row (own `<hr>`
separator).

- `tbaiIssimplifiedinv` — always rendered, unconditional (it never depended on the
  Customer/Vendor flags to begin with).
- `aeatsiiDefaultsiikey` / `aeatsiiSiikeylist` — moved out of `BillingPreferencesForm.jsx`
  verbatim, keeping the exact same `displayLogic`/gating wiring: both only render when
  `data.customer` is true, and `aeatsiiSiikeylist` stays hidden-not-cleared behind
  `aeatsiiDefaultsiikey` (unchanged AD parity behavior, see above).

**`decisions.json` — `tbaiIssimplifiedinv.form` flipped `true` → `false`** (visibility stays
`editable`). This removes it from the header form's auto-rendered field array
(`BusinessPartnerForm.jsx`) and from the generated `requiredHeaderFields` gate on
`BusinessPartnerPage.jsx` (used only to gate the "+ Add Line" affordance on child tabs) —
harmless here since it's a boolean checkbox that is always "filled" (`defaultValue: "N"`), so
the required-flag never actually blocked anything. The field itself is unaffected in
`contract.json`/the API: `form: false` only silences the auto-form emission, it does not
touch `visibility`, so the field keeps flowing through `resolve-curated.js` →
`generate-contract.js` exactly as before — `FiscalDefaultsSection.jsx` reads/writes it
directly off `data`/`onChange`, same mechanism `BillingPreferencesForm.jsx` already used for
the other two fields.

No other generator or `decisions.json` change was needed — this was a pure UI-grouping
task on top of the already-working part 2 wiring. Verified with `make regen ONLY=contacts`
(published core, no `LOCAL_CORE` needed): `BusinessPartnerForm.jsx` no longer emits
`tbaiIssimplifiedinv`, `BusinessPartnerPage.jsx`'s `requiredHeaderFields` array dropped it,
and all Contacts vitest suites (`BillingPreferencesForm.vitest.jsx`,
`FiscalDefaultsSection.vitest.jsx`, `ContactsFinancialPanel.vitest.jsx`) pass.

## ETP-4784 (part 3) — Simplified back to Classic parity, no "SII/TBAI active" gating

Parts 3 and 4 of this ticket (see git history for the discarded intermediate design)
explored gating the "SII"/"TicketBAI" blocks on whether the contact's organization actually
had SII/TicketBAI configured — first by fetching and filtering the `sii-config`/`tbai-config`
lists, then by reading 3 server-maintained flags off `AD_OrgInfo`
(`etsgHasSIIConfig`/`etsgHasTbaiConfig`/`etsgHasVfactuConfig`). **That gating was reverted.**

Investigation of the real `AD_FIELD.DisplayLogic` in Classic for the 3 fields
(`aeatsiiDefaultsiikey`, `aeatsiiSiikeylist`, `tbaiIssimplifiedinv`) confirmed **none of them
depend on whether the organization has SII/TicketBAI active** — they are shown whenever the
containing tab is visible. Human decision: **"be faithful to Classic, don't invent
show/hide logic"**. `FiscalDefaultsSection.jsx` final behavior:

- **"SII" block** (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`) — shown only when
  `data.customer` is true. This is the same `data.customer` gate `BillingPreferencesForm.jsx`
  uses for its own Cliente block, and matches where these two fields live in Classic (the
  Customer tab). `aeatsiiSiikeylist` still stays hidden-not-cleared behind
  `aeatsiiDefaultsiikey` via `displayLogic` (unchanged, see part 2 above).
- **"TicketBAI" block** (`tbaiIssimplifiedinv`) — always shown, unconditional. No
  organization-level or Customer/Vendor gating at all.
- The section title/description (`fiscalDefaults`/`fiscalDefaultsDescription`) always render
  — no `loading` state, no early `return null`.

**Removed:** `tools/app-shell/src/windows/custom/contacts/fiscalDefaults.utils.js` (the
`useSiiTbaiActive`/`resolveOrganizationId` hook and its `organization/information/{orgId}`
fetch) and its test file — deleted outright, nothing else in the repo imported them.
`FiscalDefaultsSection.jsx` no longer takes an `apiBaseUrl`-driven network dependency; it is
now a pure presentational component driven entirely by `data`/`onChange`, same contract as
`BillingPreferencesForm.jsx`.

The `organization` spec's 3 `AD_OrgInfo` flags added in the discarded intermediate design
(`etsgHasSIIConfig`/`etsgHasTbaiConfig`/`etsgHasVfactuConfig`, `system` visibility) were
**kept as-is** in `artifacts/organization/decisions.json` — they remain legitimate
Organization-window information exposed on the backend contract, just no longer consumed
from Contacts. See `docs/generated-custom-windows/organization.md` for that side.

No `decisions.json` or generator change was needed for this simplification — pure
custom-component revert. Verified with `npx vitest run src/windows/custom/contacts` (all
Contacts suites pass; `FiscalDefaultsSection.vitest.jsx` rewritten to cover: SII block
visible/hidden by `data.customer`, TicketBAI block always visible, and both toggles' wiring
to `onChange`).

## ETP-4784 (part 4) — SII fields silently discarded on save (fix)

**Bug:** editing "Clave por Defecto" (`aeatsiiDefaultsiikey`) or "Clave tipo factura"
(`aeatsiiSiikeylist`) in `FiscalDefaultsSection.jsx` and saving appeared to succeed (`PATCH`
returned `200 OK`), but reloading the record showed the old value — the change never
persisted.

**Root cause:** part 2 above documented these two fields against entity `customer`, but that
was only true for their *read* classification. `FiscalDefaultsSection.jsx` is mounted by
`ContactsFinancialPanel.jsx` on the `businessPartner` entity's own `data`/`onChange` — it
writes through `PATCH /businessPartner/{id}`, not `/customer`. In `artifacts/contacts/decisions.json`
neither field was explicitly declared under `entities.businessPartner.fields`, so both fell
back to the extractor's default classification for that entity/tab: `visibility: "system"`
(a leftover from pre-ETP-4784 classification). `system` visibility maps to
`ETGO_SF_FIELD.isreadonly='Y'`, so NEO's `businessPartner` PATCH handler accepted the request,
silently dropped the two fields (not in the writable set), and returned 200 — masking the
failure. The sibling `customer` entity (a different sub-tab on the same `C_BPartner` table)
happened to classify the same two columns as `editable`, which is why part 2 wrongly assumed
the fields were already correctly configured end-to-end.

**Fix:** declared `aeatsiiDefaultsiikey` and `aeatsiiSiikeylist` explicitly under
`entities.businessPartner.fields` in `artifacts/contacts/decisions.json` with
`visibility: "editable"`, `form: false` (rendered by hand in `FiscalDefaultsSection.jsx`, not
by the auto-generated form), matching the existing `tbaiIssimplifiedinv` entry right above
them. Regenerated with `make regen ONLY=contacts PUSH_TO_NEO=1`; confirmed in
`ETGO_SF_FIELD` that both columns now have `isreadonly='N'` for the `businessPartner` entity,
and confirmed end-to-end with a live `PATCH` + `GET` against
`/sws/neo/contacts/businessPartner/{id}` that the new value survives a reload.

No frontend code changed — `FiscalDefaultsSection.jsx` was already reading/writing the right
entity; this was purely a backend field-classification gap. `npx vitest run
src/windows/custom/contacts` still passes unchanged (167 passed, 1 skipped).

**Lesson:** an entity table in this doc records *where a field is rendered*, not *which
entity's PATCH endpoint persists it*. When a custom component reads `data`/`onChange` from a
different entity than the one implied by a field's original Classic tab, always verify the
`decisions.json` classification against the entity the component is actually mounted on.
## ETP-4995 — CSV import fixes and cleanup

**P0 — the downloaded template could not be imported.** `buildTemplateCsv` emits every
declared field's first alias as a column, so the template always carried
`clave nif pais residencia` (`oBTIKTaxIDKey`). An empty cell in that column arrives as `''`
(defined), not `undefined`, and the descriptor spread the AD default `'1'` *before*
`...bpFields` — so the blank cell overwrote it and the mandatory column failed with
`MISSING_REQUIRED_FIELDS` for **every** row. The only workaround was deleting the column
from the file. Defaults are now applied after the row's own fields, and only a non-blank,
valid cell may override one.

**AD-coded columns accept the labels a human types.** `EM_OBTIK_Tax_ID_Key` is an AD List
(`1`=NIF, `2`=NOI, `3`=Pasaporte, `4`=Documento oficial de identificación expedido por el
país, `5`=Certificado de residencia fiscal, `6`=Otro documento probatorio, `7`=No Censado —
`1` also accepts `CIF`/`CIF/NIF`, which is not an AD list name but is what users type, the
window's own tax-id column being labelled "CIF/NIF")
and `EM_Etgo_Isperson` is an AD **Yes/No** (`Y`=Persona, `N`=Empresa, AD default `N`) — not
a list, despite reading like one. Neither can go through `matchEntity` FK resolution, which
queries SimSearch by DAL *entity* name; a reference list is not an entity. Both now resolve
through a per-descriptor synonym table (`lib/codedValue.js`), accent- and case-insensitively,
with the raw code always accepted so an Etendo-exported CSV round-trips. An unrecognized
value fails its own row with a message naming the accepted values, instead of a bare 400.

**`etgoIsperson` is importable at all.** It had no column, was absent from `BP_TARGETS`, and
`mapColumns` only ever matches a header against a field's `label`/`aliases` — never against
the target name — so every imported row landed on the same contact type.

**A bare `nombre` column no longer produces a nameless business partner.** `nombre` was an
alias of `etgoFirstname`, so a CSV whose only name column was `nombre` left `name` (razón
social) and the derived `searchKey` empty. `nombre` is now an alias of `name`; the descriptor
additionally falls back to first+last name, and fails the row when neither is present.

**`searchKey` no longer collides.** `C_BPartner.Value` is capped at 40 chars and was derived
with a blind `.slice(0, 40)`, so two commercial names sharing a 40-char prefix collapsed onto
one key. Names that fit are used verbatim; longer ones keep a 32-char prefix plus a
deterministic FNV-1a hash of the *full* name, so re-importing a file is idempotent.

**Dedupe key changed from `etgoEmail` to `taxID`.** `dedupeRows`'s `buildKey` returns `null`
when any key part is blank, and email is optional — so the default path deduplicated nothing.
`taxID` is `required: true` (see above), so it is always present, and two rows sharing a tax id
are the same legal entity — a stronger identity than a matching commercial name, which two
distinct companies can share.

**Category columns 3 → 1.** `categoryCode`/`categoryName`/`category` were three columns for
one concept. Only `category` survives; the cell is probed against the existing category codes
first and treated as a name otherwise (`lib/dependentEntityCell.js`), preserving both the
exact-code match and the derived-code auto-create.

**`creditLimit` removed from `BP_TARGETS`** — no declared column could ever populate it.

**CIF/NIF is required at import level, on purpose.** `C_BPartner.TaxID` is *not* mandatory
in AD (`ismandatory='N'`, 20 chars) and a contact created by hand can be saved without one —
but a contact loaded in bulk without a tax id is not useful, so `decisions.json` declares
`taxID` as `required: true`. This is the import being deliberately stricter than the
dictionary, which is precisely what a per-window import config is for. The explicit flag also
survives the generator's AD backfill, which would otherwise mark it optional.

**`required: true` is now declared, and `required: false` is deliberate.**
`requiredTargets` (`ImportDialog.jsx`) is built from `f.required`; with nothing declared it
was empty and `validateRow` validated nothing, so the user learned about a missing mandatory
field from a backend 400. Note that `generate-contract.js` **backfills `required` from AD**
when `decisions.json` is silent: `etgoIsperson` and `etgoFirstname` are AD-mandatory but must
stay optional in the CSV (the descriptor defaults the first, and a company legitimately has
no first name), so both declare `required: false` explicitly. Omitting that flag re-breaks
the plain template exactly like the P0 bug did.

Regression coverage: `contactsImportDescriptor.vitest.js`, plus
`windows/custom/__tests__/importTemplateRoundTrip.vitest.js`, which downloads the template,
fills it without deleting a column, and asserts it maps, validates and builds operations —
the end-to-end path none of the per-unit tests covered.

## ETP-4996 — Import engine: duplicate policy, review-time validation, template i18n

**Duplicates are detected before the send, not after.** `window.import.dedupe.scope` is now
`"database"`. Before confirming, the review queue queries `businessPartner` for the file's
`taxID` values through the same `criteria=` list request the grid uses (so it inherits the
window's org/client security filtering), and marks matching rows **Saltada**. Re-importing an
already-imported file therefore shows **0 rows in Correctas and N in Saltadas** instead of
showing everything as Correcta and surfacing the duplicates only after the send.

⚠️ **The dedupe key and the unique index are not the same thing, and that is deliberate.**
`c_bpartner`'s only unique index is on `value` (the searchKey, derived from the name), so the
database alone can never reject two contacts that share a CIF/NIF under different trade names —
they were silently created twice. Checking the *declared* dedupe key (`taxID`) is what makes that
case detectable at all. **Upsert/overwrite remains out of scope**: skip is the only policy. The
pre-flight check is not a lock either — a record created between the check and the send still
collides server-side, and that path is unchanged.

**The AD-coded columns are validated during review.** `oBTIKTaxIDKey` and `etgoIsperson` are
checked by the descriptor's registered row validator (`registerImportRowValidator('contacts', …)`)
in the same pass as `validateRow`. Previously `resolveCodedCellOrThrow` only ran inside
`buildOperations`, so a mistyped "Persona Fisica" showed up in Correctas and the user learned it
was wrong only after confirming. Both halves share `resolveCodedValue` and one message builder
(`codedCellError` / `resolveCodedCellOrThrow` in `lib/codedValue.js`), so the preview cannot
accept a value the send would reject. Blank still falls back to the AD default — that
distinction is the ETP-4995 blocker and must not regress.

**Template.** Required columns carry a trailing `*` and the file ships a sample row built from
each field's `example` in `decisions.json`. Headers are written in the session language via the
field's AD `column`, backfilled into `window.import.fields` by `generate-contract.js`;
`mapColumns` strips the `*` and the localized header joins the field's aliases, so the template
round-trips in any language.

**i18n.** The review queue's own messages were hardcoded English in `validateRows.js`
("Required field is missing.", "Not a valid email address.", the FK-unmatched message) plus the
two skip messages in `ImportDialog.jsx`. All six now resolve through `translate` with the English
text kept as fallback; keys live in `genericLabels` in all three locales.

Regression coverage: `importRowValidators.vitest.js`, the extended
`importTemplateRoundTrip.vitest.js`, and in app-shell-core `existingRecordLookup.test.js`,
`parseImportNumber.test.js`, `rowValidators.test.js`, plus the ETP-4996 block in
`ImportDialog.test.jsx`.

## ETP-4992 — Tax ID field relabelled "CIF/NIF" -> "NIF" (Spanish locale)

CIF was abolished in Spain and folded into NIF in 2008, so the header's tax-identification
field ("CIF/NIF") no longer matches the correct terminology. The field itself
(`taxID` on `businessPartner`, AD column `TaxID`) is unchanged; only its Spanish display
label is renamed to **NIF**, in every place it is rendered by this window: the General tab
form field, the grid column (if ever surfaced), the advanced-filter field list, and the
CSV/TXT import's column-mapping step and review-queue column header.

**Mechanism.** `useLabel()`'s resolution chain (`labelOverrides[locale][column] →
dictionary.fields[column].label → raw spec label`) always finds the global AD dictionary
entry for `TaxID` (`"CIF/NIF"`, shared by every other window that exposes this column), so a
plain per-field `label` in `decisions.json` would never be reached and would not change what
renders. The window-scoped override that actually wins is
`decisions.json → window.labelOverrides.es_ES.TaxID: "NIF"` — the same mechanism already used
for `C_BP_Group_ID` -> "Contact Category" (see the ETP-4566 note above). The global
`es_ES.json`/`es_AR.json` dictionary entries for `TaxID`/`Taxid` were left untouched, since
they are shared by other windows. English (`en_US`) and `es_AR` are unchanged — this is a
Spain-specific fiscal-terminology fix.

The import field-mapping entry (`window.import.fields`, `target: "taxID"`) also had its
`label` changed from `"CIF/NIF"` to `"NIF"`, since `ImportColumnMapping.jsx` and
`ImportReviewQueue.jsx` (both in the published `@etendosoftware/app-shell-core` import
components) render `field.label` directly in the column-mapping dropdown and the review
queue's column header — both are part of this window's own Import flow.

**Scope broadened to `CreateContactModal.jsx` (human decision, same day).** The shared
quick-create modal's own `taxIDField` locale key (`genericLabels.taxIDField` in
`es_ES.json`) was initially left out of scope because `CreateContactModal.jsx` is not part
of the `/contacts` window itself — it is the partner-selector "+ crear contacto" flow opened
from *other* windows (Sales Order, Sales Quotation, Purchase Order, Purchase Invoice, Goods
Shipment — see the ETP-4700 E2E coverage in `e2e/tests/flows/contacts-integration.spec.js`).
The human asked for it anyway for real-world consistency: it is the same fiscal field (CIF no
longer exists in Spain), so a stale "CIF/NIF" in the quick-create modal while the main window
says "NIF" would just be confusing. `genericLabels.taxIDField` in `es_ES.json` is now `"NIF"`
too (`es_AR.json` is untouched — Argentina's own fiscal-ID terminology, CUIT/CUIL, is a
separate matter this ticket does not touch). `CreateContactModal.jsx` and `contactModalConfig.js`
have no hardcoded "CIF"/"NIF" strings of their own — the field is declared as
`{ id: 'taxID', labelKey: 'taxIDField', ... }` and rendered via `{ui(f.labelKey)}` in
`EntityCreationModal.jsx`, so the locale-key edit is the only change needed for it to take
effect. `e2e/tests/flows/contacts-integration.spec.js`'s two ETP-4700 tests, which fill this
modal's tax-ID input by locating its label text, were updated from
`page.getByText(/^cif\/nif/i)` to `page.locator('label', { hasText: /^nif$/i })` — scoped to
`<label>` specifically because the sibling "Clave NIF país residencia" `<select>` also has a
literal `<option>NIF</option>`, which a plain `getByText(/^nif/i)` would ambiguously match too.

The import's `TAX_ID_KEY_VALUES` alias list in `contactsImportDescriptor.js` (accepting
user-typed `'CIF'`/`'CIF/NIF'`/`'NIF/CIF'` as synonyms for the *Tax ID Type* enum value `NIF`)
remains unchanged — it recognizes what users type in their own CSV files and is unrelated to
the displayed field label. Likewise the `taxID` import field's own `aliases` array in
`decisions.json` (`["cif/nif", "cif", "nif", ...]`) is unchanged, so old import templates and
files with a "CIF/NIF" column header still map correctly — only the *displayed* label changed,
not what the importer recognizes as input.

**`generated/core.es_ES.json` note.** The app does not read `es_ES.json` directly at runtime —
`useLocaleDictionaries` loads the gitignored, build-time-sliced
`src/locales/generated/core.<locale>.json` instead (see `vite-plugins/slice-labels.js`, ETP-4300/
ETP-4830). That file is regenerated automatically from `es_ES.json` on every `make dev` boot and
on every save to a top-level locale file while `make dev` is already running — no manual step or
extra commit is needed for the `taxIDField` change (or the `TaxID` `labelOverrides` change above)
to take effect; it was spot-checked locally by re-running the slicer once, confirming
`generated/core.es_ES.json` picked up `"NIF"`.

## ETP-5031 — Text-field length and unsafe-character validation

Free-text fields accepted any content with no length limit and no charset guard — a phone
field took `abc!@#`, a name field took `<script>alert(1)</script>`, and the record saved
without objection. The prior fix (email/website/phone **format**, name-heuristic, applies
repo-wide) never covered **length** or the **Name** field, and left grid/inline-edit
inconsistent with the form (missing the website check there).

**Scope is deliberately this window only.** `getContactsTextFieldError` (new module,
`tools/app-shell/src/components/contract-ui/contactsFieldValidation.js`) gates on
`windowName !== 'contacts'` as its very first check, so importing it into the shared
components (`EntityForm`, `useEntity`, `DataTable`, `InlineLinesPanel`) cannot affect any
other window. This was a deliberate tradeoff over wiring the repo-wide `validation` object
already resolved in every window's `contract.json` (via the generic `validateRecord` engine
published in `@etendosoftware/app-shell-core`) — that would have turned on `maxLength`
enforcement across all 47+ windows at once, out of scope for this fix.

**Length limits are hardcoded**, sourced directly from `artifacts/contacts/contract.json`'s
resolved `validation.maxLength` for each text field of `businessPartner` (`name`,
`etgoFirstname`, `etgoLastname`, `taxID`, `etgoWeb`, `etgoEmail`, `etgoPhone`) and `contact`
(`firstName`, `lastName`, `email`, `phone`, `position`, `comments`) — not read from the
contract at runtime, because the generator does not emit `maxLength` into the field literals
the components receive (only `key`/`column`/`type`/`label`/`required`/`section`).

**Unsafe characters** (`hasUnsafeChars`): ASCII control characters (excluding tab/newline/CR,
the normal editing ones) and any `<`/`>` — enough to catch the `<script>` injection case
without attempting full HTML sanitization. Checked after length, so a value failing both
surfaces the length error first.

Wired at the same 4 call sites as the existing numeric/format validators: `EntityForm`'s
on-blur toast, `useEntity`'s hard save-block gate, `DataTable`'s inline-add row, and
`InlineLinesPanel`'s inline cell edit — `windowName`/`specName` now threads all the way from
`DetailView` through `SecondaryTableTab` into both grid components, closing a gap where it
previously stopped short. While there, the grid/inline-edit paths also gained the
`getWebsiteFieldError` check that the form already had but they were missing.

The save-block gate in `useEntity` is scoped to fields the user actually edited **this
session** (same scoping as the email/website/phone checks), not every registered field — a
pre-existing over-limit or unsafe value on an untouched legacy record never blocks an
unrelated edit.

New i18n keys (`genericLabels`, both `en_US.json`/`es_ES.json`): `fieldMaxLengthError`
(interpolates `{maxLength}`) and `fieldInvalidCharacters`.

Regression coverage: `contactsFieldValidation.test.js` (length, unsafe chars, `<script>`, and
the window-scoping gate — asserts `null` for any window other than `contacts` regardless of
value).

**Follow-up — keystroke-level phone filtering.** The save-time format check above (`abc!@#`
blocked with a toast on Save) left a UX gap: the user could still type the disallowed text
into the field and see nothing happen until they tried to save. `filterContactsInputValue`
(same module) closes that gap for phone-like fields (`etgoPhone`, `phone`, any field whose
key/column contains "phone") by stripping every character outside the phone charset
(`\d+()-. ` and whitespace) as the value is typed — a disallowed character never appears in
the input at all, instead of appearing and then being rejected on Save. Same `windowName
!== 'contacts'` gate. Wired into the header form's plain `<Input onChange>` in `EntityForm.jsx`
and the inline-add row's `onChange` in `DataTable.jsx`. The `InlineLinesPanel` inline-edit
cell (editing an existing Person's phone in the grid) still relies on the save-time block only
— its `<Input>` is uncontrolled and reaching it would need threading `specName` through two
more render layers (`renderLineCell` → `EditCell`), left for a follow-up if needed.

**Follow-up — "Página web" required a real domain shape, not just the scheme.**
`isSecureUrl` (`recipientEdits.js`, repo-wide, not Contacts-scoped) only checked that the
value started with `https://` followed by any non-whitespace — `"https://asda"` passed as
"secure", a real value that shipped on this window. Tightened to require a domain-shaped host
after the scheme: at least one `label.` segment followed by a 2+ letter TLD (`SECURE_URL_RE`).
`"https://asda"` is now correctly rejected; `"https://acme.com"` / `"https://sub.acme.co.uk"`
still pass. The `websiteInsecureUrl` message text was also corrected — since both Contacts and
Organization always show a fixed, non-editable `https://` chip via `inputPrefix`, the actual
mistake is never "wrong scheme", it's an incomplete domain, so the old "must use a secure URL"
wording was misleading (the URL genuinely was already `https://`). New text: "Introduce un
dominio válido, por ejemplo dominio.com" / "Enter a valid domain, e.g. example.com". This is a
generic, repo-wide fix (not gated to `windowName === 'contacts'`) — it strengthens the same
shared validator both Contacts and Organization already call.

Regression coverage: `recipientEdits.test.js` (`isSecureUrl` — rejects a dotless host, accepts
a multi-label domain and a domain with a port).

## ETP-4997 — CSV export from the list

**Export button beside Import.** The list toolbar (`ListView.jsx`) now carries an Export action
on the same `window.import.enabled` gate: a window with no import template has no columns to
export either. It streams the current list as CSV through the backend's generic
`export=csv` flag (`NeoCsvExportService`, com.etendoerp.go) via the `useCsvExport` hook, so a
5000-row export never materializes in the browser. A column whose key is absent from the row
serializes as an empty cell, which is what the contact-scoped columns below rely on.

**`NeoCsvExportService` had to learn the generic list envelope (com.etendoerp.go).** Its
`locateRows` only recognized `{response:{data:{<key>:[…]}}}` — the shape a custom handler
(bank statements, movements) returns. A generic CRUD list goes through
`DefaultJsonDataService.fetch`, whose standard Openbravo envelope puts the rows in
`response.data` **as the array itself**, so `optJSONObject("data")` returned null, `tryExport`
declined, and the servlet wrote its normal JSON. The bug was invisible from the outside: the
browser saved a 200 response under the `.csv` name, so the first symptom was the import
rejecting the downloaded file. `locateRows` now accepts both shapes, and `useCsvExport` refuses
to download a response whose `Content-Type` is not a CSV, so a future decline surfaces as the
export-failed toast instead of a corrupt file.

**Filters are honoured by re-running the query, not by exporting what is on screen.** The list is
filtered, sorted and paginated server-side, so the rows already in memory are only the pages the
user happened to scroll. `useEntity` now exposes `buildListQuery()` — the same `_sortBy` +
`criteria` composition `refresh` uses — and the export re-issues it with the row window widened
to `window.import.limit.maxRows` (5000 here, the same ceiling the import honours).

**Columns come from the import template, not from a second config.** There is no
`window.export` block: `importExportColumns.js` derives the column spec from
`window.import.fields` at runtime, and the headers come from app-shell-core's own
`resolveTemplateHeaders` — the function `ImportDialog` calls to write the downloadable template.
So an export and a template are byte-identical, including the session language (resolved through
the same `importFieldLabel` passed to `ImportDialog` as `fieldLabelFn`), the collision handling
that keeps `parseDelimited` from rejecting duplicate headers, and the trailing `*` on required
columns (which `mapColumns.stripRequiredMarker` removes again on the way back in).

**The header qualifier now names the right tab.** A Contacts row is split across THREE records —
the business partner, its contact person (`AD_User`) and its address (`C_BPartner_Location` +
`C_Location`) — but `headerScope` had a single value, `"contact"`, covering everything not on the
header entity. `ListView.importFieldLabel` rendered that as the word "Contacto", so an exported
file labelled its address columns `Dirección (Contacto)`, `Ciudad (Contacto)`, … — naming the
wrong tab, which is exactly how a reader was misled. The five `C_Location` columns now carry
`headerScope: "address"` and render as `(Dirección)`. The qualifier is driven by a lookup, so an
unknown scope adds nothing rather than printing a raw key, and it is skipped when the column's own
label already IS the scope word (otherwise the address column reads "Dirección (Dirección)").
Renaming a header is safe by construction: `mapColumns` matches the declared `label` and `aliases`
too, and `ImportDialog` adds the localized header to the aliases before matching — asserted by the
round-trip test in both languages.

**The ten child-scoped columns are filled by the handler, not by the list row.** `email`,
`firstName`, `lastName`, `phone`, `position` (scope `contact`) and `address`, `city`, `postal`,
`country`, `region` (scope `address`) live on `AD_User` and `C_BPartner_Location` + `C_Location`.
A `C_BPartner` row carries none of them: of its 45 contract fields the only address-shaped one is
`eTGOLocation`, an AD virtual column (`SQLLOGIC = select etgo_get_location(c_bpartner_id)`)
returning ONE concatenated display string that cannot be split back into columns. There is no
expansion escape hatch either — the `fields` projection is an MCP argument, not a REST param, and
is a flat whitelist over the entity's own keys.

So `BusinessPartnerHandler.attachChildData` (ETP-4997) attaches each partner's primary contact
person and primary address under `etgoChildData` on a LIST GET carrying `includeChildData=1`,
which the export always sends. The export reads them by dotted path
(`etgoChildData.city`) — `NeoCsvExportService` already resolves dotted column keys into nested
values, and nesting keeps the added keys from ever colliding with a DAL property.

Three properties worth keeping:

- **The address is the one the grid already shows.** The ranking is copied from
  `ETGO_GET_LOCATION`, the SQL function behind the `eTGOLocation` column: bill-to, then ship-to,
  then most recently created. A second rule here would let the list and the file disagree.
- **The contact is the one `etgoEmail` already picks** — the oldest active `AD_User` — so the
  export and the email fallback can never name different people for one partner.
- **One statement per child set, not one per row.** Both queries use a window function over
  `c_bpartner_id = ANY(?)`, so a 5000-row export costs two queries, not ten thousand.

The flag is opt-in because the normal grid does not need the data and should not pay for it, and
enrichment failure is non-fatal: the handler declines, the default result stands, and the user
gets empty columns instead of a failed export. Country and region are emitted as
`C_Country.name` and `COALESCE(C_Region.name, C_Location.regionname)` — the base names the
import's own simSearch resolves against, which is what makes them re-importable, and the
`regionname` fallback covers the free-text regions Etendo stores when no `C_Region` row exists.
`category` needs the
one source-key override this window declares (`registerExportHints` in
`contactsImportDescriptor.js`), because the list row spells it `businessPartnerCategory` and
carries the readable half in `businessPartnerCategory$_identifier`.

**Coded columns are exported as words, not codes.** A raw list row carries `etgoIsperson` as
`true`/`false` and `oBTIKTaxIDKey` as `1`…`7`. Those re-import fine (the code is always accepted)
but they are unreadable in a spreadsheet, which defeats the edit half of the loop, so the export
writes `Empresa`/`Persona` and `NIF`/`Otro documento probatorio` instead.

The labels are NOT read from the AD `$_identifier`: they are inverted from the descriptor's own
synonym tables with `codeLabels()` (`codedValue.js`), the very tables `resolveCodedValue`
validates against. That is what makes the round trip structural — a word this writes is one the
import accepts, rather than one that merely happens to match today and stops matching when a
translation changes. `importExportColumns.vitest.js` asserts exactly that: every label resolves,
and to the same code its raw value means. `etgoIsperson` is mapped from both `true`/`false` and
`Y`/`N`, since it is an AD Yes/No column that NEO serializes as a JSON boolean.

Because the CSV is serialized server-side, the map travels as the `valueMaps` query param
(`{"column":{"raw":"Label"}}`) and `NeoCsvExportService` applies it per column after reading the
value. A blank cell is never translated — empty means "this row says nothing about the field",
which is how the import reads it back too — and a malformed param degrades to raw codes rather
than failing the export.

**The non-fatal enrichment hides its own bugs — hence a DB-backed guardrail.** The first
version of `PRIMARY_LOCATIONS_SQL` selected `loc.postcode`. `C_Location`'s postal-code column is
`postal`; `postcode` does not exist, so every execution threw a `SQLException`, `attachChildData`
swallowed it exactly as designed, and the ten contact-person and address columns came out blank
for every partner — indistinguishable from a partner that genuinely has no contact and no address.
Nothing failed anywhere: not the export, not the headers, not CI.

`BusinessPartnerHandlerTest` could not have caught it, and this is the general point rather than
an oversight: its mocked `ResultSet` declared its own column names, so it asserted the *test's*
idea of the schema. It agreed with `postcode` and would have agreed with any other invented name.
That mock now reads `BusinessPartnerHandler.LOCATION_COLUMNS` / `CONTACT_COLUMNS` — the very
arrays `queryChildData()` walks — so it can no longer disagree with the code it exercises, but a
mock still cannot say whether those names exist in the database.

`BusinessPartnerHandlerDbTest` (OBBaseTest) answers that half: it executes both statements against
the live schema with the same `= ANY(?)` varchar-array binding the handler uses, and asserts each
result set exposes `c_bpartner_id` plus every column name read by name, and that each returned row
is readable through them. A wrong column name now fails a test instead of silently emptying a
column. It deliberately asserts nothing about *which* contact or address is primary — those are
ordering decisions, not schema facts, and the two `row_number()` rankings are covered by the
mocked test.

**SHELL-02 — icon direction.** The arrow now follows the DATA, not the file: Import uses
`Download` (records coming into Etendo), Export uses `Upload` (records going out). The import
button previously carried the outward arrow, which read as an export.

The rule applies **inside** the import popup too, which is the half that was missed: the dropzone
(`ImportDropzone`, app-shell-core) shipped with `Upload`, so the dialog contradicted the very
button the user had just clicked. It now renders `Download`, and
`ImportDropzone.test.jsx` asserts the icon directly — an icon swap is invisible to every other
test in that file, which is how the mismatch survived. The component lives in
`schema_forge_core`, so the fix arrives here as a published `@etendosoftware/app-shell-core`
bump (see `docs/repo-topology.md`).

### Excel (.xlsx), on both ends — ETP-4997

Import accepts `.xlsx` alongside `.csv`/`.txt`, and both the template and the export offer CSV or
Excel. What makes that safe is a single boundary rather than a second pipeline: `parseXlsx`
(app-shell-core) is contracted to return **exactly** what `parseDelimited` returns —
`{ headers, rows }` of plain strings — so `mapColumns`, `validateRows`, the coded-value synonym
tables, the FK resolvers, the database dedupe and the review queue are all format-blind and
unchanged. `parseXlsx.test.js` asserts that equivalence against `parseDelimited` itself rather
than a hand-written expectation, so the two cannot drift.

**Every cell the app writes is a text cell**, and that is the decision the round trip rests on.
Measured against the reader the import uses: a text cell comes back byte-exact — `08018` keeps its
leading zero, `1.234,56` keeps its separators, a date keeps the exact `dd-MM-yyyy` the CSV writes.
A typed cell does not: written as a number, `08018` returns as `8018` and the zero is gone
unrecoverably. Prettier sorting in Excel is not worth the feature's only real guarantee.

Two consequences that are easy to get backwards:

- **The CSV formula apostrophe must NOT be applied to xlsx.** A workbook string cell is inert — a
  formula is a different cell type — so `=SUM(A1)` stored as a string is just text, and the
  apostrophe would be a literal character in the user's spreadsheet. Verified by reading a written
  workbook back.
- **A date cell reads at UTC midnight, so local getters lose a day.** A cell holding 2026-08-31
  arrives as `2026-08-31T00:00:00.000Z`, whose local getters on `America/Cordoba` give **30
  August**. `parseXlsx` reads dates with `getUTCDate()`/`getUTCMonth()`/`getUTCFullYear()`. It
  deliberately does NOT use `formatCalendarDate`/`parseCalendarDate`: those exist for date-only
  *strings* and build their `Date` with the local-time constructor, so handed an already-correct
  UTC instant they would reintroduce the ETP-4031 / ETP-4850 shift they were written to prevent.

**A workbook with two data sheets is rejected**, not silently half-imported. The error names the
sheets so the user knows which to remove.

**Server-side, `export=xlsx` joins `export=csv`** in `NeoCsvExportService`, which is now the entry
point for both formats. The cell projection — column spec, dotted paths, date reformatting,
`valueMaps`, the `ids` filter — moved to `NeoExportTable`, shared by both writers so the two
formats cannot disagree cell for cell. `NeoXlsxExportWriter` uses `SXSSFWorkbook` with a sliding
row window, so the documented invariant that a 5000-row export never materializes now holds in the
JVM too. It writes to `getOutputStream()`; that is mutually exclusive with the CSV branch's
`getWriter()` on one response, and `neverTouchesTheWriterOnAnXlsxExport` pins it. Apache POI needed
no new dependency — it is already in the Etendo core compile classpath and deployed in
`WEB-INF/lib`, so the module declares it `compileOnly`.

**`window.import.formats` finally governs something.** It was declared and unread, with
`ImportDropzone` hardcoding both `accept='.csv,.txt'` and its hint text — config that could say
anything without consequence. It now drives the `accept` attribute and the hint. Input and output
formats are not the same set: `txt` is input-only (it exists because Spanish Excel's *Guardar como
→ Texto (delimitado por tabulaciones)* produces one, which is why `parseDelimited` detects tabs),
so the writable set is derived — `outputFormats = formats ∩ {csv, xlsx}` — rather than declared
separately. One declaration per window, and the export structurally cannot offer a format the
import cannot read back. A window declaring CSV alone keeps the single-click export button it had
before; the menu appears only when there is a real choice.

Full design, including the measurements behind each decision:
`docs/plans/2026-08-31-xlsx-import-export-support.md`.

Regression coverage: `importExportColumns.vitest.js` (source resolution per field, plus header
parity and a full re-import round trip asserted against `buildTemplateCsv`/`mapColumns` in both
a Spanish and an English session), `ListViewExport.vitest.js`, the `baseUrl` and
non-CSV-response cases in `useCsvExport.vitest.jsx`, the `codeLabels` block in `codedValue.vitest.js`, the child-data block
in com.etendoerp.go `BusinessPartnerHandlerTest` (attachment, a partner with no children, the
flag absent, a failing query, and a single-record GET), `BusinessPartnerHandlerDbTest` (both child
statements executed against the live schema), and `NeoCsvExportServiceTest` — which now covers the flat list envelope, an absent
column key, a `$_identifier` companion, a non-list GET that must still decline, value
translation, and an unmapped/blank/malformed `valueMaps`.

### The province was never imported — ETP-4997

An imported address arrived with street, city, postal code and country, and **no province**, with
no error anywhere. Two independent causes, both of which had to go:

**1. The scoping fetch hit an endpoint that does not exist.** Region names collide across
countries ("Córdoba" is both Spanish and Argentine) and `simSearch`'s webhook cannot scope a query
by a second column, so `contactsFkResolvers.js` searched unscoped and then asked
`GET /sws/neo/contacts/region` for each candidate's own country in order to filter. No NEO spec
exposes a region entity — verified against `ETGO_SF_ENTITY`, which has none in any spec — so every
one of those calls 404'd, every candidate was filtered out, and the descriptor's
`if (regionResult.status === 'auto-resolved')` guard skipped the field without raising anything.
The `else` branch that would have complained did not exist.

**2. Every Spanish province exists twice, and no client-side rule can choose.** A stock instance
carries the 52 provinces at System level (`AD_Client_ID = '0'`) **and** once for the tenant, the
tenant copy with a trailing space (`'MADRID '` vs `'MADRID'`) — 104 rows, all active, all readable.
So even with the entity exposed, the two rows score identically and fall inside the resolver's
15-point ambiguity gap. Choosing between them requires the session's client, which the browser has
no business deciding.

**The fix moves the lookup to where both halves resolve.** The province travels as free text
(`regionName`) on the `locationAddress` operation, and
`ContactsLocationAddressHandler.resolveRegionByName` resolves it: it already holds the country from
the same payload — the only scope the lookup ever needed — and runs inside the tenant's
`OBContext`. Matching is trimmed, accent-folded and upper-cased, so the System/tenant pair collapses
to one name and a hand-typed "Alava" or "A Coruna" still matches; the tenant's own row then wins
over the System one, mirroring how Etendo treats every client-overridable master record. An
explicit `region` id still takes precedence, so the Location modal's selector-driven save is
untouched.

**A blank province is not an instruction to erase one.** `regionName` is set-if-provided: the
descriptor trims before deciding whether to send the key at all, and the handler reads it with
`trimToNull`, so a cell holding only spaces is indistinguishable from a cell that was never
filled in. Both halves are needed and both were missing (found in PR review): a whitespace value
is truthy in the browser, so the key shipped; and `nullIfEmpty` only rejects `""`, so it reached
the resolver, which answers null for a blank name — and the region was **cleared**. Harmless on
the import, which only ever POSTs a new address, but a PUT would have erased a province the file
never mentioned. Clearing is now exclusively the `region` id field's job.

**It now refuses instead of degrading.** A province that cannot be resolved fails the row with a
message naming the region and the country, where before it imported an address quietly missing a
field. That is a deliberate behaviour change: a file that used to "work" can now fail. The failure
the user can see and fix is worth more than the one they cannot.

The browser-side `contacts-region` resolver and its `/sws/neo/contacts/region` fetch are deleted
rather than left dead — `contactsFkResolvers.js` keeps a comment explaining why there is no region
resolver, so the next person does not re-add one. Coverage:
`ContactsLocationAddressHandlerTest` (System-vs-tenant preference, System-only fallback, accent and
case folding, blank without querying, unknown name, missing country, a genuine same-client
ambiguity, and a whitespace-only name leaving the region untouched) plus the `regionName` assertions in `contactsImportDescriptor.vitest.js`.

### A skipped row showed no data — ETP-4997

Rows the import skips because the record already exists appeared in the review queue as
`Omitida` — and nothing else. Every data column was blank, in both Contacts and Products.

The entries were never the problem: they carry their full `row`. `ImportReviewQueue` rendered a
skipped row as two cells — the status pill, then a single cell spanning the entire grid whose
content was the word "Skipped" again. So the user read the same label twice and lost the row's
data, which for the commonest skip reason — *this record already exists* — is precisely the
information needed to tell **which** record it was.

The data cells are now shared with the OK branch through one `RowDataCells` renderer (muted, not
hidden: a skipped row is inactive, not empty), and the freed space carries the **reason** instead
of repeating the status. Only a blank-target error counts as the reason — a field-level error
belongs to a cell, and printing it there would read as if a bad email were why the row was
skipped. A row the user skipped by hand has no reason and shows none.
