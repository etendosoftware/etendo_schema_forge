# Tax

## Intent
Define reusable tax-rate records that describe the percentage to apply, whether the tax is meant for sales, purchases, or both, and which amount should be treated as the taxable base.

On `origin/develop`, the merged tax regeneration keeps this as a simple standalone maintenance window, but the list now has clearer visual semantics: the rate is rendered as a colored percentage tag (green for positive rates, neutral/gray for zero, red for negative rates such as withholdings) and the sales/purchase scope is rendered as colored tags instead of raw database codes.

## What this window should allow
Users should be able to review and update tax definitions by setting a tax name, a rate, an applicability scope, an effective date, and the base semantics used later by transactional documents. Creating a new tax rate record from the list view is disabled (`window.hideCreate: true`) — new tax rates are provisioned outside this window.

From the current generated form and decisions, the visible window allows a user to:
- name the tax rate record
- enter the rate as a numeric percentage value
- choose whether the tax applies to both flows, sales only, or purchases only
- set a valid-from date
- choose whether document-level or line-level amounts drive tax calculation
- choose the base amount definition, including line net amount, line net amount plus tax, tax amount, alternative base amount, or alternative base plus tax
- open the **Accounting** tab and maintain the Tax Due and Tax Credit GL accounts for each accounting schema the tax rate is posted under

The list also lets users scan existing definitions quickly by showing the rate as a colored percentage tag and the applicability as `Sales` / `Purchase` tags. When the tax applies to both flows, the list shows both tags side by side rather than a single `Both` badge. The rate tag has three visual states: a positive rate (e.g. 21) renders as a green `+21 %` tag; a zero rate renders as a neutral gray `0 %` tag; a negative rate (e.g. withholdings at −10) renders as a red `−10 %` tag.

## Interaction model
- **Route:** `/tax` and `/tax/:recordId`.
- **Visibility:** visible from the `System` section in `tools/app-shell/src/menu.json`.
- **Implementation type:** generated window loaded through `tools/app-shell/src/windows/registry.js`.
- **Window shape:** `tax` is the header entity; `accounting` (`C_Tax_Acct`) is the detail (child) entity, rendered with the standard `linesLayout: "classic"` add-line grid — one row per accounting schema, with Tax Due and Tax Credit as editable selector columns.
- No declared process endpoints in the generated index.
- **Screen chrome:** the generated detail view hides print and the generic More menu. The list toolbar hides the generic Create/New button (`window.hideCreate: true`).
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies
The visible dependencies are limited to selector semantics and list rendering:
- `Applicable To` changes the intended business scope of the tax record between `Both`, `Sales Tax`, and `Purchase Tax`.
- `Doc Tax Amount` changes whether tax is conceptually based on document-level or line-level amounts.
- `Base Amount` changes which monetary base downstream calculations should use.
- The merged decisions intentionally keep `Description` discarded, and the `Active` (`IsActive`) checkbox is left unclassified so it falls to the extractor default (`visibility: "system"`, hidden), so the current user-facing form is limited to the visible fields above.

No dependent selector behavior, automatic defaulting between these fields, status-driven actions, or visible total/discount/tax recalculation logic is shown in the current window code beyond the Accounting tab described below. Any other downstream reaction happens outside this definition screen.

**Accounting tab (`accounting` entity):**
- `accountingSchema` (`C_AcctSchema_ID`) is hidden from the form (`visibility: "system"`). On the first accounting row for a tax record, `TaxAccountingHandler` (a `NeoHandler` in `com.etendoerp.go`) auto-fills it with the client's default active `AcctSchema` when the field is absent from the POST body. On subsequent rows, `addLineFromSibling` copies the value from an existing sibling row instead.
- `Tax Due` (`T_Due_Acct`) and `Tax Credit` (`T_Credit_Acct`) are the two editable GL account selectors exposed per row.
- `Tax Expense`, `Tax Liability`, `Tax Receivables`, `Tax Due Transitory`, and `Tax Credit Transitory` are discarded — they cover non-recoverable tax, deferred-tax, and Cash-VAT-transitory scenarios that are out of scope for the simplified UI.

## Gap assessment
- The window captures tax-definition inputs, but the current evidence does not show where or how those choices are enforced in sales or purchase documents.
- The list now gives friendlier visual cues for rate and scope, but the current evidence still does not document the business meaning of when each base-amount mode should be chosen.
- The visible rate field is a numeric input and the list renders a colored percentage tag (green `+N %` for positive, neutral `0 %` for zero, red `−N %` for negative), but the inspected code still does not explain rounding rules or whether business users are expected to enter `10` vs `0.10`.
- No current evidence shows validation rules that constrain incompatible combinations between applicability, document-tax amount mode, and base-amount mode.

## Manual verification
1. Open `/tax` from the `System` menu and confirm the list view loads.
2. Confirm the list renders the rate as a colored percentage tag (`+N %` green for positive rates, `0 %` neutral/gray for zero, `-N %` red for negative/withholding rates) and `Applicable To` as `Sales` / `Purchase` tags.
3. For a tax whose applicability is `Both`, confirm the list shows both tags together instead of a raw code.
4. Open `/tax/<recordId>` and confirm the form exposes `Name`, `Rate`, `Applicable To`, `Valid From`, `Doc Tax Amount`, and `Base Amount`. Confirm `Active` is NOT shown.
5. Confirm `Applicable To` offers `Both`, `Sales Tax`, and `Purchase Tax`.
6. Confirm `Doc Tax Amount` offers `Document Amount` and `Line Amount`.
7. Confirm `Base Amount` offers `Line Net Amount`, `Line Net Amount + Tax`, `Tax Amount`, `Alternative Base Amount`, and `Alternative Base + Tax`.
8. Confirm the visible form does not show `Description`, and that print / generic More actions are not present.
9. Save a change and reopen the record to confirm the updated definition persists.
10. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
11. Open the **Accounting** tab on a tax record with no existing accounting rows and add a new line without touching the (hidden) accounting schema field. Confirm the row saves successfully — `TaxAccountingHandler` should auto-fill `accountingSchema` server-side.
12. Add a second accounting row and confirm it inherits `accountingSchema` from the first (sibling) row rather than requiring the handler default again.
13. Confirm only `Tax Due` and `Tax Credit` selectors are editable on each accounting row, and that Tax Expense, Tax Liability, Tax Receivables, and the two transitory accounts are not shown.

## Automated evidence
- `origin/develop` commit `15a2288a` added the tax-table cell helpers that drive the current badge/tag rendering.
- `origin/develop:artifacts/tax/decisions.json` marks `rate` with `cellType: taxRate`, `applicableTo` with `cellType: taxScope`, discards `description`, and hides `isActive` from the visible form.
- `origin/develop:artifacts/tax/generated/web/tax/TaxTable.jsx` renders the rate via `renderTaxRate` using three visual states: green `+N %` tag for positive rates, neutral `0 %` tag for zero, red `−N %` tag for negative rates (withholdings). Scope is rendered as `Sales` / `Purchase` tags.
- `origin/develop:artifacts/tax/generated/web/tax/TaxForm.jsx` defines the six visible form fields and the selector options for applicability, document-tax amount, and base amount.
- `origin/develop:artifacts/tax/generated/web/tax/index.jsx` confirms the route, standalone generated layout, breadcrumb, and the hidden print/More controls.
- The generated `TaxPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_Tax` AD table.
- `artifacts/tax/decisions.json` sets `window.detailEntity: "accounting"` and configures the `accounting` entity fields, including `javaQualifier: "taxAccountingHandler"`.
- `artifacts/tax/contract.json` exposes `accounting` (table `C_Tax_Acct`, tab `333`) as a detail entity with `accountingSchema` as `visibility: "system"` and `Tax Due` / `Tax Credit` as the two editable fields.
- `artifacts/tax/generated/web/tax/TaxPage.jsx` declares `addLineFields` for the `accounting` entity: `taxDue`/`taxCredit` as entry fields and `accountingSchema` in `hidden` with `fromSibling: 'accountingSchema'`.
- `com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/TaxAccountingHandler.java` — new `NeoHandler` (`@Named("taxAccountingHandler")`) that auto-fills `accountingSchema` with the client's default active `AcctSchema` on POST when the field is absent from the request body.
## Field name overrides — ETP-4016

Two fields use a `name` override in `decisions.json` because their AD display name diverges from the DAL property name that NEO Headless returns in GET responses:

- `salesPurchaseType` (raw name from "Sales/Purchase Type") → overridden to `applicableTo` (the actual DAL property NEO returns for `SOPOType` column).
- `validFromDate` (raw name from "Valid From Date") → overridden to `validFrom` (the actual DAL property NEO returns for `ValidFrom` column).

Without these overrides the fields render empty on load because the frontend reads `data['salesPurchaseType']` / `data['validFromDate']` while the API response contains `applicableTo` / `validFrom`.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## `Active` field exposure reverted — ETP-4464

An earlier iteration briefly exposed the `active` (`IsActive`) checkbox in the principal section (by renaming the previously misspelled `isActive` decision key to `active` and classifying it `editable`/`form: true`). This was **reverted by functional decision** — the `Active` field is not shown in the Tax window.

- The `active` entry was removed entirely from `artifacts/tax/decisions.json → entities.tax.fields`. With no classification, the field falls to the extractor default (`visibility: "system"`) and stays hidden from the form.
- Regenerated via `make regen ONLY=tax SKIP_EXTRACT=1`; `TaxForm.jsx` no longer emits any `active`/`IsActive` field and `contract.json` no longer exposes it in the form.
- `./node_modules/.bin/sf-validate-pipeline --scope=tax` reports 0 violations.
- Note (kept for history): do not re-add the field under the key `isActive` — that spelling is a silent no-op because `resolve-curated.js` matches on the raw field name `active`.

## List-view delete disabled at the API level — ETP-4464 (known UI gap)

`window.hideDelete: true` was added to `artifacts/tax/decisions.json` (same precedent as `open-close-period-control`) to remove the ability to delete a `tax` or `accounting` record. Regenerated via `make regen ONLY=tax SKIP_EXTRACT=1`; `node cli/src/validate-pipeline.js --scope=tax` (via `make validate-pipeline`) reports 0 violations for this window.

- Confirmed effect: `contract.json` and the generated `TaxPage.jsx` now expose `api.crud.tax.delete: false` and `api.crud.accounting.delete: false` — the backend-facing capability declaration is correctly disabled for both entities.
- **Known gap, not fixed here:** `tools/app-shell/src/components/contract-ui/ListView.jsx` / `RowQuickActions.jsx` do not read `api.crud[entity].delete` (or a `hideDelete` prop) when deciding whether to render the row-level delete (trash) icon in the **list/grid view** — that gate (`isDeleteVisibleForRecord`, in `utils/recordActions.js`) only consults `hideDeleteWhenComplete` + `statusField`, neither of which `TaxPage.jsx` passes. The same is true for `open-close-period-control`, which sets `hideDelete: true` but whose generated `PeriodControlPage.jsx` also passes `rowQuickActions={{}}` with no `hideDeleteWhenComplete`/`statusField`. `DetailView.jsx`'s child-lines table, by contrast, already gates its own delete affordances on `crud?.[entity]?.delete`.
- **Net result:** the list-view trash icon is still visually present for `tax` after this change. Removing it requires a Schema Forge Developer to wire `api.crud[entity].delete` (or thread `hideDelete` through as `hideDeleteWhenComplete`-equivalent) into `ListView.jsx`/`RowQuickActions.jsx`'s `showDelete` gate — a generic-component fix, not a per-window `decisions.json` change. Filed for follow-up; `hideDelete: true` was kept in `decisions.json` since it is the correct declarative intent and already disables the delete capability at the API/contract level (defense in depth) even though the UI icon fix is still pending.

## Accounting tab onboarded — ETP-4402

The `accounting` entity (`C_Tax_Acct`, tab `333`) was un-excluded and classified, closing the same accounting-schema-defaulting gap already fixed for `product`, `product-category`, `assets`, `contacts`, and `business-partner-category` in this ticket.

- `window.detailEntity` changed from `null` to `"accounting"` — the Accounting tab is now the primary detail entity, rendered as a classic add-line grid (one row per accounting schema).
- `accountingSchema` is `visibility: "system"` with `addLineFromSibling: true` — hidden from the form; the first row is auto-filled server-side (see below), later rows copy the value from an existing sibling row.
- `taxDue` and `taxCredit` are the two editable, required GL account selectors (`grid: true`, `grow: true`).
- `taxExpense`, `taxLiability`, and `taxReceivables` were already discarded by the raw extractor's default classification (not displayed in AD by default); `taxDueTransitory` and `taxCreditTransitory` were explicitly discarded here — both are Cash-VAT-only transitory accounts, out of scope for the simplified UI.
- `javaQualifier: "taxAccountingHandler"` registers `TaxAccountingHandler` (`com.etendoerp.go`), a `NeoHandler` that auto-fills `accountingSchema` with the client's default active `AcctSchema` on POST when the field is absent from the request body — mirrors `ProductCategoryAccountingHandler` exactly.
- Regenerated via `make regen ONLY=tax`; `node cli/src/validate-pipeline.js --scope=tax` reports 0 violations.

## List-view delete icon now hidden — ETP-4464 follow-up (closes the gap from the section above)

The known gap documented above ("List-view delete disabled at the API level") is now closed by a new generic decisions.json slot: `window.hideDeleteButton`. Unlike `window.hideDelete` (which only disables the CRUD delete capability in `contract.json`/the API), `hideDeleteButton` unconditionally hides the Delete button/icon in **both** the detail toolbar (`DetailView.jsx`) and the list-row hover actions (`RowQuickActions.jsx`, via `DataTable`'s `rowQuickActions.hideDeleteButton`), for every record regardless of status.

- Generator support for `hideDeleteButton` shipped in `@etendosoftware/schema-forge-cli@0.3.6` (already installed — no core bump needed for this change).
- Added `"hideDeleteButton": true` to `artifacts/tax/decisions.json → window` (alongside the pre-existing `hideDelete: true`).
- Wired the receiving side in this repo (`tools/app-shell/src/components/contract-ui/`):
  - `RowQuickActions.jsx` — new `hideDeleteButton` prop (default `false`); `showDelete` is now `!hideDeleteButton && isDeleteVisibleForRecord(...)`, short-circuiting before the status-based gate.
  - `DataTable.jsx` — forwards `hideDeleteButton={rowQuickActions.hideDeleteButton}` to `RowQuickActions`.
  - `DetailView.jsx` — new `hideDeleteButton` prop (default `false`); `isDeleteButtonVisible(...)` now takes it as a trailing argument and returns `false` immediately when set, ahead of the existing `hideDeleteWhenComplete`/`isProcessed` logic.
- Regenerated via `make regen ONLY=tax SKIP_EXTRACT=1`. `artifacts/tax/generated/web/tax/TaxPage.jsx` now emits `hideDeleteButton` as a literal prop on `DetailView` and `rowQuickActions={{"hideDeleteButton":true}}` on the list `DataTable` — the trash icon no longer renders in either the detail toolbar or the list-row hover actions.
- `./node_modules/.bin/sf-validate-pipeline --scope=tax` reports 0 violations.
- Regression tests added in `tools/app-shell/src/components/contract-ui/__tests__/hideDeleteButton.test.js` (13 cases covering `isDeleteButtonVisible` and `RowQuickActions`' `showDelete`, both behavioral and source-lock-step assertions); full `contract-ui` + `utils/recordActions` suite (498 tests) passes.

## ETP-4565 — Accounting tab: single record, entity-level non-deletable

**`window.maxDetailLines: 1`** added — the `accounting` detail entity (`window.detailEntity: "accounting"`) now caps at exactly one row; the add-line affordance disappears once the row exists. **`entities.accounting.hideDelete: true`** added as defense-in-depth alongside the pre-existing window-level `hideDelete`/`hideDeleteButton` (ETP-4464) — the accounting row's delete capability is now also explicitly disabled at the entity/API level (`apiPrediction.crud.accounting.delete: false`), not just implied by the window-wide flags. Regenerated via `make regen ONLY=tax`; `sf-validate-pipeline --scope=tax` reports 0 violations. Regression test: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js`.
