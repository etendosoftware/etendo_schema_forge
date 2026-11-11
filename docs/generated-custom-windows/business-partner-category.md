# Business Partner Category

## Intent

Business Partner Category lets users maintain the category master record used to classify business partners (customers, vendors, employees, etc.) and configure the accounting accounts associated with each category per accounting schema. The main form covers the category header fields; the **Accounting** tab exposes the GL accounts linked to each accounting schema for that category.

## What this window should allow

Users should be able to:

- browse contact categories (columns depend on the `contact-category-type` flag, see below) and, with the flag on, narrow the list to customer or vendor/creditor categories with the contact-type quick filter
- open a category and maintain its header fields: Search Key, Name, Description, Default
- with the flag on, set the **contact type** (Customer and/or Vendor/Creditor — at least one is required) and the accounts of each type from the Accounting tab: Cliente (receivables, prepayment, write-off) and Proveedor/Acreedor (liability, prepayment) — see *Contact type — ETP-5791* below

> **Feature flag `contact-category-type` (ETP-5791, default OFF).** Everything under *Contact type —
> ETP-5791* is shown only while the flag is on. With the flag **off** the window looks and behaves
> as before ETP-5791: list columns Search Key and Name; form Search Key, Name, Description and
> Default (no "Tipo de contacto" group, no required type check); the generated inline-editable
> Accounting table; no "saved with associated contacts" notice. The flag is visual gating only —
> `com.etendoerp.go` evaluates the same key and enforces the contact-type rules on its own.
> Registry entry: `flags-registry.json` → `contact-category-type`.

## Interaction model

- **Route:** `/business-partner-category`, `/business-partner-category/:recordId`
- **Visibility:** visible in the **Settings** menu as **Business Partner Category** (EN) / **Categoría de Contacto** (ES) (AD window ID `192`)
- **Implementation type:** generated window behind a thin wrapper — `registry.js` points to `tools/app-shell/src/windows/custom/business-partner-category/index.jsx` (ETP-5791), which renders the generated entry point and is the toggle point of the `contact-category-type` flag for the record view: it passes a `Form` that excludes `etgoIscustomer` (and its required-gate entry) — always with the flag off, and with the flag on unless the role lacks "Show Accounting Fields" — and, while the flag is on, the Figma field order + `DefaultAssignmentField`, `DetailTable={null}` + `CustomLines={BpCategoryAccountingPanel}`, and the list's contact-type `baseFilter`. It also provides the window context (`custom/bpCategoryWindowContext.js`) that links the header form, the Accounting panel and the list quick filter. The list's columns are gated by the `customComponents.headerTable` component `BpCategoryTable`. Custom components live in `artifacts/business-partner-category/custom/`
- **Window shape:** master + detail; `businessPartnerCategory` is the header entity (table `C_BP_Group`) and `accounting` is the detail entity (table `C_BP_Group_Acct`), rendered by the generated inline grid (flag off) or by the custom `BpCategoryAccountingPanel` (flag on)
- **List behavior:** `decisions.json` declares every column (Search Key, Name, Customer, Vendor/Creditor, Default; `gridOrder` 1–5). Flag **off** → `BpCategoryTable` renders the generated table and hides the three flag-only columns through `hiddenColumns`: Search Key, Name (as before ETP-5791). Flag **on** → see *List* under *Contact type — ETP-5791*
- **Record behavior:** opening a category record renders a detail view with the category header form plus the **Accounting** tab (generated grid with the flag off, the custom panel with the flag on)
- **Accounting tab behavior (flag off — the generated grid):** shows one row per accounting schema. Each row exposes 20 ValidCombination FK selectors (`Customer Receivables No.`, `Customer Prepayment`, `Vendor Liability`, `Vendor Prepayment`, `Write-off`, `Write-off Revenue`, plus 15 secondary GL accounts covering non-invoiced receipts/receivables/revenue, payment discount expense/revenue, realized/unrealized gain/loss, unearned revenue, vendor service liability, and doubtful/bad-debt accounts). `Customer Receivables No.`, `Write-off`, and `Vendor Liability` are mandatory (`ismandatory=Y` in the AD). The five primary columns (`customerReceivablesNo`, `customerPrepayment`, `vendorLiability`, `vendorPrepayment`, `writeoff`) share the available width via `grow: true`; the remaining GL accounts are added as ordinary editable columns without `grow`.
- An **Attachments** tab is available in the detail tab strip (standard `AttachmentsTab` wiring, same as other generated master/detail windows).

## Layout configuration

The window uses these layout overrides (all set in `decisions.json → window`, mirroring `product-category`):

| Key | Value | Effect |
|-----|-------|--------|
| `detailEntity` | `"accounting"` | Accounting tab as the primary child entity |
| `detailVisibleWhenCapability` | `"showAccountingFields"` | **(ETP-5648)** The Accounting tab is this window's detail tab, so it is hidden, and never fetched, for a role without the capability; the header form stays available. The server refuses `<spec>/accounting` with `403` for such a role anyway |
| `linesLayout` | `"inlineEditable"` | Inline editing on Accounting rows |
| `noHeaderBorder` | `true` | Removes the border under the header form |
| `toolbarBorderBottom` | `true` | No effect since ETP-5601 (the record toolbar is standardized) |
| `formCardPadding` | `"p-2"` | Tighter padding on the form card |
| `formScrollPaddingX` | `"px-2"` | Horizontal padding on the scroll column |
| `toolbarPaddingX` | `"px-2"` | No effect since ETP-5601 (the record toolbar is standardized) |
| `tabsBarPaddingX` | `"px-2"` | Horizontal padding on the tabs bar |
| `hidePrint` / `hideLink` | `true` | Print and link actions hidden from the detail chrome |
| `maxDetailLines` | `1` | Accounting grid shows one row per accounting schema |

## Reactive behavior and dependencies

- The Accounting grid depends on the selected category record and loads rows filtered by `parentId`.
- All 20 accounting fields are ValidCombination FK selectors (`ad_reference_value_id = 95E2A8B50A254B2AAE6774B8C2F28120`, `OBUISEL_Selector Reference` type), the same selector family used by Product Category's accounting tab.
- `accountingSchema` (`C_AcctSchema_ID`) is classified as a `system` field with `addLineFromSibling: true` — it is not user-editable; it is filled from the sibling accounting-schema record when a new accounting row is created, exactly like Product Category.
- `Processing` (the "Copy Accounts" button) and `Status` are discarded — not exposed to the user.
- No callouts, display logic, or validation rules were found in the AD for either tab (`rules-raw.json` reports only the "Copy Accounts" process, no callout/validation/display-logic rows).

## Gap assessment

- **Java handler implemented.** `decisions.json → entities.accounting.javaQualifier` is set to `"businessPartnerCategoryAccountingHandler"`, matching the pattern used by `ProductCategoryAccountingHandler.java` in `com.etendoerp.go`. `BusinessPartnerCategoryAccountingHandler.java` exists on that repo's `feature/ETP-4402` branch (commit `7d86a652`, `@Named("businessPartnerCategoryAccountingHandler")`), with a matching `BusinessPartnerCategoryAccountingHandlerTest.java`. `C_AcctSchema_ID` has no native AD default value, so the handler's `handle()` auto-fills `accountingSchema` from the client's default active `AcctSchema` on POST when the field is absent, mirroring the `ProductCategoryAccountingHandler` pattern exactly.
- Accounting rows are pre-created by Etendo (one per accounting schema); the window allows editing existing rows, but adding/deleting accounting-schema rows is not a typical use case and is not explicitly gated.
- No totals, financial reactions, or callout chains are visible in the accounting entity contract.
- Since ETP-5791 a custom wrapper exists (`tools/app-shell/src/windows/custom/business-partner-category/index.jsx`, Product Category pattern) only to gate the contact-type UI behind its flag. When the flag is retired (shipped), move the panel back to `window.customLinesComponent` in `decisions.json` and drop the wrapper.

## Manual verification

Flag `contact-category-type` **off** (default):

- The list shows Identificador and Nombre only; the form shows Identificador, Nombre, Descripción and Valor por defecto, with no "Tipo de contacto" group, and saves without any type; the Accounting tab is the generated one-row inline grid; saving a category with contacts shows only "Registro guardado".

Flag **on** (`VITE_FEATURE_FLAGS={"contact-category-type":true}` locally, or the remote control plane):

1. Open `/business-partner-category` from the Settings menu: the list shows Nombre (semibold, 240px), Cliente, Proveedor/Acreedor (158px each, Sí/No badges) and Valor por defecto, no Identificador column, the columns are not stretched, and each column filters and sorts.
2. Open the quick filter left of "Filtros": "Todos los contactos" is checked. Pick "Cliente": only categories with Cliente = Sí remain (Cliente/Proveedor included), and the request carries `criteria` `etgoIscustomer equals Y`. Same for "Proveedor/Acreedor". Back to "Todos los contactos" lists everything.
3. Open an existing category: row 1 is Identificador | Nombre | "Asignación predeterminada" + "Valor por defecto"; row 2 is Descripción. No type checkboxes in the header.
4. The Accounting tab shows a calculator icon and a badge with the number of checked types (0/1/2). Its left column reads "Tipo de contacto *" and "(Lo heredan solo los contactos nuevos)".
5. Uncheck/check Cliente and Proveedor/Acreedor: a checked card shows its accounts 3 per row, an unchecked one collapses to its header, re-checking shows the previous values; with neither checked the blue "Configuración contable" alert appears above the cards and the backend refuses the save with "Debe marcarse al menos un tipo de contacto…" (the toggle rolls back).
6. Create a category: on the Accounting tab both cards start unchecked and can be checked before saving; a checked card says "Guarda la categoría para configurar sus cuentas contables."; saving with neither type shows the backend error; after saving, the selects appear.
7. Change an account in a checked card: it saves on selection; the unchecked card's mandatory accounts do not block it.
8. Save a category that has contacts (toolbar Save, or ticking a type checkbox on an existing category): only the info toast "Categoría guardada. Tiene contactos asociados…" remains — no green "Registro guardado" stacked behind it, and it appears once. A category without contacts shows only "Registro guardado".
9. With a role without "Show Accounting Fields", the Accounting tab is absent and the header shows the full-width "Tipo de contacto *" group instead, so the type can still be set.
10. Open the **Attachments** tab and confirm file upload, download, and delete work as expected.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Business Partner Category** under the Settings group (`windowId: "192"`), immediately after Tax Category.
- `tools/app-shell/src/windows/registry.js` registers the `business-partner-category` slug pointing at the flag wrapper `windows/custom/business-partner-category/index.jsx` (ETP-5791), which renders the generated entry point.
- `artifacts/business-partner-category/decisions.json` defines `businessPartnerCategory` as the header entity and `accounting` as the detail entity with `linesLayout: "inlineEditable"` and `javaQualifier: "businessPartnerCategoryAccountingHandler"`.
- `artifacts/business-partner-category/contract.json` carries the `javaQualifier` through to both the frontend and backend entity sections, and lists `accountingSchema` in the `hidden`/`addLineFromSibling` slot of `addLineFields`.
- `artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryPage.jsx` renders `ListView` (with `BpCategoryTable`) for the list route and `DetailView` with `linesLayout="inlineEditable"` and the generated `AccountingTable`/`AccountingForm` for record routes; the wrapper overrides those with the custom panel while the flag is on.
- `node cli/src/validate-pipeline.js --scope=business-partner-category` reports 0 violations.
- No dedicated Business Partner Category browser test exists yet. Shared route/loading behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.

## Onboarding — ETP-4402

Window onboarded from scratch as part of feature/ETP-4402 (branch `feat/contact-category-window`):

- Registered in `cli/config/regen-windows.json` (`windowId: "192"`) — required before `make regen ONLY=business-partner-category` will pick up the window, since `regen-all.js` only processes entries that are **both** in the registry **and** have an on-disk `decisions.json`.
- `decisions.json` written mirroring Product Category's accounting-entity shape: real GL fields classified `editable` + `grid`/`grow` on the five primary columns, `accountingSchema` classified `system` with `addLineFromSibling: true`, `Processing`/`Status` discarded.
- `window.category` set to `"contact"` to align with the sibling `contacts` window (both classify business-partner-family data), rather than a new/unused category value.
- 8 missing AD field labels added to both `en_US.json` and `es_ES.json` (`fields` section): `NotInvoicedReceivables_Acct`, `NotInvoicedRevenue_Acct`, `PayDiscount_Exp_Acct`, `PayDiscount_Rev_Acct`, `RealizedGain_Acct`, `UnEarnedRevenue_Acct`, `UnrealizedGain_Acct`, `V_Liability_Services_Acct` — Spanish labels sourced from `ad_element_trl` (`ad_language='es_ES'`), English labels/descriptions sourced from `ad_column`/`ad_element`. The `windows → "Business Partner Category"` entry already existed in both locales (EN: "Business Partner Category", ES: "Grupos de Terceros") and needed no change at the time.

**ETP-4402 update:** the Spanish label for this window was renamed from "Grupos de Terceros" (and the tab-section variant "Grupos de terceros") to **"Categoría de Contacto"**, matching the ticket's original Spanish terminology. All three `es_ES.json` occurrences of the `"Business Partner Category"` key — `windows`, `tabs`, and `menus` sections — were updated to the new label. The English label (`en_US.json`) and the unrelated `C_BP_Group_ID` / `bpGroupField` field-level labels (which also read "Grupos de terceros" but refer to the generic Business Partner Group selector field, not this window) were left untouched. No pipeline regeneration or NEO push was needed — window/menu/tab display labels are resolved client-side from these locale JSON files via `useMenuLabel()`/`tMenu()`, independent of the pushed contract config.
- **Resolved:** `businessPartnerCategoryAccountingHandler` Java NeoHandler referenced by `decisions.json` is implemented in `com.etendoerp.go` (`feature/ETP-4402`, commit `7d86a652`) — see Gap assessment.

## ETP-4565 — Accounting tab: entity-level non-deletable

**`entities.accounting.hideDelete: true`** added — the pre-existing `window.maxDetailLines: 1` already caps the Accounting tab at one record; this pass adds the matching entity-level delete guard (`apiPrediction.crud.accounting.delete: false`). Regenerated via `make regen ONLY=business-partner-category`; `sf-validate-pipeline --scope=business-partner-category` reports 0 violations. Regression test: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js`.

**Auto-creation gap (requirement 3, DB-verified):** of the 33 most-recently-created `C_BP_Group` records, only 29 (88%) have a corresponding `C_BP_Group_Acct` row — a partial gap, not a total failure like `financial-account`/`warehouse` (see the coordinator report on ETP-4565). Flagged for follow-up investigation in `com.etendoerp.go`, not fixed in this pass.

## Account selectors — ETP-5681

Every account field of the **Accounting** tab (all 21 customer/vendor account fields) declares `"lookup": true` +
`"lookupDrawer": "account"` in `decisions.json`: the cell (inline edit and add row) and the side
form open the shared centered account search popup (`AccountLookupPopup` → `SearchPopup`, the one
the report filters use for "Desde la cuenta") instead of a dropdown that cut long names off. The
popup is titled with the translated field label, shows each `"<code> - <name>"` in full, searches
by code or name and lists **posting accounts only** (`PostingAccountCombinationSelectorPolicy` in
`com.etendoerp.go` hides summary headings).
Reopening the popup on a field that already holds an account opens on that account: it is marked with a check and centred, and arrows start from it (ETP-5948, see `docs/ui-customization.md`).

## Contact type — ETP-5791

**Behind the `contact-category-type` feature flag (default off).** This whole section describes the
flag-on behaviour; with the flag off the window is the pre-ETP-5791 one (see the note at the top).
The DB columns, the agent prompts (MCP) and the `C_BP_Group` data-fixes R55/R56 are not gated.

A category now defines whether its contacts are **Customer**, **Vendor/Creditor** or both. Backend
(`com.etendoerp.go`): columns `EM_Etgo_Iscustomer` / `EM_Etgo_Isvendor` on `C_BP_Group` (API
`etgoIscustomer` / `etgoIsvendor`, YesNo, default `N`) and `BusinessPartnerCategoryHandler`, which
refuses a category saved with neither (`messageKeys: ["ETGO_BPGroupContactTypeRequired"]`). The
flags are copied into a contact when the contact is created; they never change existing contacts.

**Design (Figma "Etendo-AI-2026", node 2670-14516).** The flag-on window follows the designer's
frames: list "Categoría de Contacto Tabla" / "Filtro Cliente", form "Form View Categoría de
contacto" (no type, only Cliente, both types).

**List.** `BpCategoryTable` declares its own columns while the flag is on (the generated literal
cannot carry flag-only layout): **Nombre** (semibold, fixed 240px) | **Cliente** | **Proveedor/Acreedor**
(Sí/No badges — `badge` + `badgeVariants` green/neutral, i.e. `StatusTag`; fixed 158px) | **Valor por
defecto** (badge, the single `grow` column, so it absorbs the leftover width and the other columns are
not stretched). Identificador stays declared but hidden, so the advanced filter still offers it. Every
column is the real AD column (`Name`, `EM_Etgo_Iscustomer`, `EM_Etgo_Isvendor`, `IsDefault`): all of
them filter and sort server-side. Row hover, the sticky edit/delete actions and the row height are the
standard list ones (`rowQuickActions`). The literal must stay in step with `decisions.json`.

**Contact-type quick filter.** Left of "Filtros": a single-select dropdown (the shared
`DistinctValuesFilter` without its search box, check mark on the active option) with "Todos los
contactos" (default) / "Cliente" / "Proveedor/Acreedor" (the AD labels of the two columns). It is
`BpCategoryTable.ToolbarQuickFilter` (`custom/ContactTypeQuickFilter.jsx`); its value lives in the
window wrapper's context (`custom/bpCategoryWindowContext.js`), and the wrapper passes it to ListView as
`baseFilter` (`contactTypeBaseFilter` in `custom/bpCategoryContactTypes.js`):
`criteria=[{fieldName: "etgoIscustomer"|"etgoIsvendor", operator: "equals", value: "Y"}]`, so the
filtering is **server-side** and "Cliente" also lists the categories that are both. The value is window
state, not URL or saved-preset state: it survives opening a record and coming back (same wrapper
instance), not a page reload.

**Header form.** Row 1: Identificador | Nombre | "Asignación predeterminada" (caption) with the
"Valor por defecto" checkbox | (empty); row 2: Descripción (`textarea`, `span: 2`). The wrapper passes
the generated fields in that order and swaps the `default` field's renderer for
`custom/DefaultAssignmentField.jsx` (the same field and write path, the shared `SquareCheckbox`,
plus the caption the generic checkbox lacks). The contact type is **not** in the header — it moved to
the Accounting tab. **Description** stays unconditionally (PM decision, as before ETP-5791). With the
flag off the form is the generated one (Search Key, Name, Description, Default).

*Fallback for a role without "Show Accounting Fields":* the Accounting tab is hidden for such a role
(`detailVisibleWhenCapability`), and it must still be able to set a type (the backend refuses a
category with none). So, with the flag on and no capability, the header keeps the full-width "Tipo de
contacto *" group (`custom/ContactTypeField.jsx`, the pre-Figma header group) and the gate exclusion of
`etgoIscustomer` is dropped. `ContactTypeField` is no longer declared in `decisions.json`: the wrapper
sets it as the `customRenderer` of `etgoIscustomer` for that case only.

**Accounting tab — `BpCategoryAccountingPanel`.** Passed by the window wrapper as `CustomLines`
(label `customLinesLabel: "Accounting"`, with `DetailTable={null}` so it replaces the generated
grid) while the flag is on — not declared in `decisions.json`, so the generated grid stays
available with the flag off. The tab shows a **calculator icon** (the panel's static `tabIcon`, see
`docs/ui-customization.md` → *Bottom tab-strip icons*) and its **badge is the number of contact types
checked** (0, 1 or 2, through `onCountChange`), not a row count.

- Layout: a left column (148px) with "Tipo de contacto *" and the hint "(Lo heredan solo los
  contactos nuevos)", and a right column with one muted card per type (`bg-muted`, radius 8px,
  padding 12px): **Cliente** and **Proveedor/Acreedor**, each headed by its type checkbox
  (`SquareCheckbox`, the AD labels `EM_Etgo_Iscustomer` / `EM_Etgo_Isvendor`).
- A **checked** card lists its accounts, 3 per row, each an `AccountSelect` (label above, red `*`
  when mandatory, the centered account `SearchPopup`):

  | Card | Accounts |
  |---|---|
  | Cliente | Recibos de clientes (`customerReceivablesNo`), Prepago del cliente (`customerPrepayment`), Cancelaciones (`writeoff`) |
  | Proveedor/Acreedor | Pasivo del proveedor/acreedor (`vendorLiability`), Pagos por adelantado del proveedor/acreedor (`vendorPrepayment`) |

  The Figma labels the second vendor account "Prepago del cliente": a copy-paste slip in the
  design; the ticket's label is kept.
- An **unchecked** card collapses to its header; its stored account values are kept and come back
  when it is re-checked (`resolveAccountSections` returns only the checked sections; nothing is
  cleared). Hiding instead of a read-only variant is the confirmed PO behaviour.
- With **no type checked**, an info alert sits above the two cards: "**Configuración contable**
  Selecciona Cliente o Proveedor/Acreedor para configurar sus cuentas contables."
  (`bpCategoryAccountingSetupTitle` + `bpCategoryNoTypeAccounts`; the Figma info colours `#EBEFFF` /
  `#2B48BC` are literal, as in the order global-discount tag, because no token resolves to them).
- **The type checkboxes are the header fields** `etgoIscustomer` / `etgoIsvendor`. The panel reads
  DetailView's editing record (`data`) and writes through the header form's own callbacks
  (`onChange` + the deferred `onFieldBlur`, handed over by the form wrapper through the window
  context's `formBridge`), so a toggle behaves exactly like the former header checkbox: on an
  existing record it autosaves (`autoSaveOnBlur`); unchecking the last type is refused by the backend
  with "Debe marcarse al menos un tipo de contacto: Cliente o Proveedor/Acreedor"
  (`ETGO_BPGroupContactTypeRequired`, `lib/backendErrors.js`) and the toggle rolls back; it is
  dimmed and inert when the window is read-only (`editing === false`).
- **New (unsaved) category:** the type cards are fully usable before the first save (the types are
  header fields and are saved with the category); a checked card shows "Guarda la categoría para
  configurar sus cuentas contables." in place of its selects, because the accounts live on the
  `C_BP_Group_Acct` row the backend creates with the category. After the first save the selects
  appear.
- Account catalog: each `AccountSelect` is fed by the field's own NEO selector
  (`<apiBaseUrl>/accounting/selectors/<column>`, the endpoint the generic `lookupDrawer:
  'account'` popup uses) through `loadPage={useAccountSelectorPages(url)}`, so search and paging
  are server-side and only **posting accounts** are listed (`PostingAccountCombinationSelectorPolicy`).
  The selected label is the row's `<key>$_identifier`. No backend change.
- Each account is PATCHed on its own (an optional one cleared with ✕ PATCHes `null`; a refused
  PATCH shows the error toast and restores the previous value). The mandatory accounts of an
  unchecked type never take part in a save: the row is created by `c_bp_group_trg` with the
  accounting schema defaults (verified on the shared DB: all 739 `C_BP_Group_Acct` rows have
  receivables, write-off and vendor liability filled). A load error or a category without an
  accounting row shows its message inside the checked card.
- The tab stays gated by `detailVisibleWhenCapability: "showAccountingFields"` — the gate also
  covers a `CustomLines` tab (`gateDetailTab`).
- The 16 secondary GL accounts of `C_BP_Group_Acct` are not shown in the UI; their values are
  untouched.

**"Saved with associated contacts" notice.** After a category is saved — toolbar Save or
autosave (including a type toggle in the Accounting tab), detected as a change of the record's
`updated` token by the header form wrapper (its `principal` instance only, so one save toasts once) —
or after an account is changed in the panel, the window reads one row of `contacts/businessPartner` filtered by
`businessPartnerCategory`. If there is one, an info toast says "Categoría guardada. Tiene
contactos asociados: los cambios no los modifican y solo se aplicarán a los contactos nuevos."
(`custom/useAssociatedContactsNotice.js`). The notice **replaces** the generic "Registro guardado"
toast instead of stacking on it: it is raised with the generic save toast's own id
(`RECORD_SAVE_TOAST_ID`, `hooks/useEntity.js`), which sonner turns into an in-place update — the
same mechanism the User window uses for its create toast. A category without contacts keeps the
plain "Registro guardado". A role that cannot read Contacts gets no notice.

**Labels.** `fields.EM_Etgo_Iscustomer` / `fields.EM_Etgo_Isvendor` are in the locales (the module
has no es_ES translation pack). The two vendor accounts are renamed **in this tab only**: their
entries in `ACCOUNT_SECTIONS` (`custom/bpCategoryContactTypes.js`) carry a `labelKey`, which the
panel resolves with `useUI()` instead of the AD column label — `bpCategoryVendorLiability`
("Pasivo del proveedor/acreedor" / "Vendor/Creditor Liability") and `bpCategoryVendorPrepayment`
("Pagos por adelantado del proveedor/acreedor" / "Vendor/Creditor Prepayment"). Every other
account keeps `t(column)`. The global `fields.V_Liability_Acct` / `fields.V_Prepayment_Acct` labels
and the posting-error names `backendError.account.vendorLiability` / `vendorPrepayment` are
unchanged ("Pasivo del proveedor" / "Pagos por adelantado del proveedor"), so Contactos (Vendor
Accounting), Configuración contable and the posting error messages keep the AD wording (PO
decision).

**MCP schema hints.** `etendo_schema view:"create"` lists `etgoIscustomer` / `etgoIsvendor` as
optional with `serverDefaulted: true` (the AD default `N` is resolved), which on its own suggests
both can be omitted, but with the flag on omitting both is refused with
`ETGO_BPGroupContactTypeRequired`. Each field therefore declares an `agentPrompt`
(`agent-prompts/business-partner-category/category.etgo-iscustomer.md` / `category.etgo-isvendor.md`,
persisted to `ETGO_SF_FIELD.AGENT_PROMPT`) that explains what the flag means and that at least one of
the two should be set. The prompt is flag-agnostic: it does not claim the server always refuses N/N or
always copies the flags into new contacts (with the flag off it does neither). With the flag off the
two fields stay exposed in the MCP schema although the UI hides them — tracked as the `cosmetic`
deferred item `mcp-exposed-category-fields` of `contact-category-type` in `flags-registry.json`.

## ETP-5693 — Posting accounts only, on write

Saving an account field of the accounting tab now refuses a summary (heading) account, an inactive account or combination, and an account of another accounting schema than the row's; on update the row's accounting schema cannot change. The account selectors already hide those accounts (ETP-5681), so in the UI this only shows up in a race, as a translated toast (`backendError.accountIsSummary` / `accountIsInactive` / `accountWrongLedger` / `ledgerNotUpdatable`); REST and MCP callers get a 400 whose text names the field and the account. A value already stored is not re-checked, so existing rows stay saveable. Backend: `PostingAccountGuard` via `BusinessPartnerCategoryAccountingHandler` (`com.etendoerp.go`, see `neo-headless.md`).

## Read-only role tier: no attachment uploads — ETP-5830

With a `read-only` tier on this window the Attachments tab lists, previews and downloads files but shows no upload dropzone and no delete or description edit (`AttachmentsTab` `accessReadOnly`). Before ETP-5830 the dropzone stayed enabled and the upload failed with the raw backend 403; that error is now translated too. Full list of gates: [`app-shell-functional-flows.md`](app-shell-functional-flows.md) → *Read-only role access — every write path is gated*.
