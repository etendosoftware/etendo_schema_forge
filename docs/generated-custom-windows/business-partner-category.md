# Business Partner Category

## Intent

Business Partner Category lets users maintain the category master record used to classify business partners (customers, vendors, employees, etc.) and configure the accounting accounts associated with each category per accounting schema. The main form covers the category header fields; the **Accounting** tab exposes the GL accounts linked to each accounting schema for that category.

## What this window should allow

Users should be able to:

- browse business partner categories by Search Key and Name
- open a category and maintain its header fields: Search Key, Name, Description, and Default
- view and edit the accounting accounts (Customer Receivables, Customer Prepayment, Vendor Liability, Vendor Prepayment, Write-off, and a set of secondary GL accounts) for the category directly from the Accounting grid, using inline editing

## Interaction model

- **Route:** `/business-partner-category`, `/business-partner-category/:recordId`
- **Visibility:** visible in the **Settings** menu as **Business Partner Category** (EN) / **Categoría de Contacto** (ES) (AD window ID `192`)
- **Implementation type:** generated window — `registry.js` points directly to the generated entry point (`@generated/business-partner-category/generated/web/business-partner-category/index.jsx`); no custom wrapper exists for this window
- **Window shape:** master + inline-editable detail; `businessPartnerCategory` is the header entity (table `C_BP_Group`) and `accounting` is the detail entity (table `C_BP_Group_Acct`) rendered as an inline-editable grid
- **List behavior:** the category list shows Search Key and Name and supports filtering by those same fields
- **Record behavior:** opening a category record renders a detail view with the category header form plus the **Accounting** tab with `linesLayout="inlineEditable"`
- **Accounting tab behavior:** shows one row per accounting schema. Each row exposes 20 ValidCombination FK selectors (`Customer Receivables No.`, `Customer Prepayment`, `Vendor Liability`, `Vendor Prepayment`, `Write-off`, `Write-off Revenue`, plus 15 secondary GL accounts covering non-invoiced receipts/receivables/revenue, payment discount expense/revenue, realized/unrealized gain/loss, unearned revenue, vendor service liability, and doubtful/bad-debt accounts). `Customer Receivables No.`, `Write-off`, and `Vendor Liability` are mandatory (`ismandatory=Y` in the AD). The five primary columns (`customerReceivablesNo`, `customerPrepayment`, `vendorLiability`, `vendorPrepayment`, `writeoff`) share the available width via `grow: true`; the remaining GL accounts are added as ordinary editable columns without `grow`.
- An **Attachments** tab is available in the detail tab strip (standard `AttachmentsTab` wiring, same as other generated master/detail windows).

## Layout configuration

The window uses these layout overrides (all set in `decisions.json → window`, mirroring `product-category`):

| Key | Value | Effect |
|-----|-------|--------|
| `detailEntity` | `"accounting"` | Accounting tab as the primary child entity |
| `linesLayout` | `"inlineEditable"` | Inline editing on Accounting rows |
| `noHeaderBorder` | `true` | Removes the border under the header form |
| `toolbarBorderBottom` | `true` | Adds a border below the toolbar |
| `formCardPadding` | `"p-2"` | Tighter padding on the form card |
| `formScrollPaddingX` | `"px-2"` | Horizontal padding on the scroll column |
| `toolbarPaddingX` | `"px-2"` | Horizontal padding on the toolbar |
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
- No custom wrapper/header form exists yet — the window currently uses the fully generated form and table components. If a custom layout is needed later, follow the Product Category pattern (`tools/app-shell/src/windows/custom/product-category/`).

## Manual verification

1. Open `/business-partner-category` from the Settings menu and confirm the list filters by Search Key and Name.
2. Open an existing category and confirm the header form shows Search Key, Name, Description, and Default.
3. Confirm the **Accounting** tab is the active detail tab and shows one row per accounting schema.
4. Confirm the `Customer Receivables No.`, `Customer Prepayment`, `Vendor Liability`, `Vendor Prepayment`, and `Write-off` columns render as ValidCombination selectors and share the row width.
5. Confirm the secondary GL account columns (non-invoiced receipts, payment discount, realized/unrealized gain/loss, etc.) are present and editable.
6. Confirm `Processing` ("Copy Accounts") and `Status` do **not** appear anywhere in the UI.
7. Attempt to create a new Accounting row and confirm `accountingSchema` populates automatically from the client's default active `AcctSchema` — expected to succeed now that `businessPartnerCategoryAccountingHandler` is implemented (see Gap assessment).
8. Open the **Attachments** tab and confirm file upload, download, and delete work as expected.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Business Partner Category** under the Settings group (`windowId: "192"`), immediately after Tax Category.
- `tools/app-shell/src/windows/registry.js` registers the `business-partner-category` slug pointing directly at the generated entry point (no custom wrapper).
- `artifacts/business-partner-category/decisions.json` defines `businessPartnerCategory` as the header entity and `accounting` as the detail entity with `linesLayout: "inlineEditable"` and `javaQualifier: "businessPartnerCategoryAccountingHandler"`.
- `artifacts/business-partner-category/contract.json` carries the `javaQualifier` through to both the frontend and backend entity sections, and lists `accountingSchema` in the `hidden`/`addLineFromSibling` slot of `addLineFields`.
- `artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryPage.jsx` renders `ListView` for the list route and `DetailView` with `linesLayout="inlineEditable"` and the generated `AccountingTable`/`AccountingForm` for record routes.
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
