# Payment Term

## Intent

Maintain the rules that determine when a receivable or payable becomes due and which term is treated as the default option for downstream document entry. In the current app-shell build, this window is the administrative place to name a term, define its visible due-date offsets, and mark whether it is the default term.

## What this window should allow

- List existing payment terms and find them by `Search Key` or `Name`.
- Open a term to review or edit the visible due-date rule fields: `Search Key`, `Name`, `Offset Month Due`, `Overdue Payment Days Rule`, `Default` and `Next Business Day` (ETP-5826).
- Create, update, and delete payment-term headers through the standard generated CRUD flow.
- See whether a term is currently marked as the default through the `Default` boolean, which is rendered as a badge-style value in the generated UI.
- Use the maintained term later from other transaction windows that expose `Payment Terms` selectors, such as sales and purchase documents.

## Interaction model

- **Route:** `/payment-term` for the list and `/payment-term/:recordId` for detail.
- **Visibility:** visible in **System > Settings** from `tools/app-shell/src/menu.json`; not marked hidden.
- **Implementation type:** generated default-layout window loaded from `tools/app-shell/src/windows/registry.js` into the generic `/:windowName` shell route.
- **Window shape:** header-only. `decisions.json` excludes the `lines` (`C_PaymentTermLine`) and `translation` entities, so neither the contract nor the NEO spec exposes them (`ETGO_SF_ENTITY.IsIncluded = 'N'`); there are no `/lines` endpoints.
- **List/detail behavior:** the list exposes `Search Key`, `Name`, `Overdue Payment Days Rule`, and `Default`; the detail form exposes the six principal fields above and hides both **Print** and **More**.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- There are no visible dependent selectors, callout-driven field chains, status-driven actions, totals, tax reactions, or discount recalculations in the current Payment Term frontend contract.
- The `Default` field is the main visible reactive cue: the generated table and detail metadata render it as a badge-style boolean rather than plain text, so users can quickly identify which terms are flagged as default.
- Shared generated-window behavior still applies: opening a new record goes through the standard generated entity flow, which can request backend defaults before the form is shown, but there is no payment-term-specific defaulting rule documented in this window contract.
- No parent/child interaction is visible in the generated page. The `lines` child structure is excluded in decisions, so users cannot manage installment or split-term detail from this screen.

## Gap assessment

- Due-date semantics appear narrower in the shipped UI than in the backend model. The backend contract includes hidden header fields such as `fixedDueDate`, `maturityDate1/2/3` and `overduePaymentDayRule`, but the frontend only exposes month offset, overdue days and next business day. If business users are expected to maintain fixed-date or multi-date due rules here, that is a current gap.
- The AD tab model has `C_PaymentTermLine` lines (percentage, remainder, payment method, exclude-tax, due-date fields), but they are excluded from this window. If installment schedules or line-level term breakdowns are expected, that is a current gap.
- The business meaning of `Default` suggests it may need uniqueness or downstream auto-selection behavior, but the current frontend evidence only shows an editable boolean with badge rendering. No UI evidence confirms exclusive enforcement, warnings, or automatic propagation, so that remains an open ambiguity.
- The backend exposes additional header fields such as `Description`, but the current frontend decisions discard them. If users need explanatory text to distinguish similar payment terms, that capability is not visible in the current window.

## Manual verification

1. Open `/payment-term` and confirm the list loads and supports filtering by `Search Key` and `Name`.
2. Open `/payment-term/<recordId>` and confirm the detail page hides **Print** and **More**.
3. Confirm the detail form currently exposes only `Search Key`, `Name`, `Offset Month Due`, `Overdue Payment Days Rule`, `Default` and `Next Business Day`.
4. Change the `Default` checkbox, save, reopen the record, and confirm the saved state is reflected back in the badge-style display.
5. Attempt to find fixed-date or child-line installment controls and confirm they are not currently exposed in the generated UI.
6. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, tick two rows and confirm the selection bar appears with the selected count, that its ZIP download brings only the ticked files, and that its delete asks for confirmation first. The table header carries no 'Download all (ZIP)' or 'Delete all' control any more (ETP-5526).

## Automated evidence

- `artifacts/payment-term/contract.json` defines a default-layout frontend contract with `detailEntity: null`, visible header fields limited to the current six-field form, badge metadata for `default`, and supported list filters on `searchKey` and `name`. It declares only the `header` entity.
- `artifacts/payment-term/decisions.json` explicitly excludes `lines` and discards the additional due-date fields from the current frontend surface.
- `artifacts/payment-term/generated/web/payment-term/HeaderForm.jsx`, `HeaderTable.jsx`, and `HeaderPage.jsx` confirm the current list/detail rendering, the visible field set, and the hidden **Print**/**More** controls.
- `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js` confirm menu visibility and route registration.
- There is no dedicated SPA test for the visible Payment Term window; current automated evidence is contract- and generated-shape based rather than browser-level UI coverage.
- The generated `HeaderPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_PaymentTerm` AD table.
## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## Read-only role tier: no attachment uploads — ETP-5830

With a `read-only` tier on this window the Attachments tab lists, previews and downloads files but shows no upload dropzone and no delete or description edit (`AttachmentsTab` `accessReadOnly`). Before ETP-5830 the dropzone stayed enabled and the upload failed with the raw backend 403; that error is now translated too. Full list of gates: [`app-shell-functional-flows.md`](app-shell-functional-flows.md) → *Read-only role access — every write path is gated*.

## Days validation, duplicates and days-only create — ETP-5826

Payment terms can now be created from every payment-term selector ("+ Crear condición de pago") by typing only a number of days. The server-side rules live in `PaymentTermHandler` (`com.etendoerp.go`, `@NeoExtension(spec = "payment-term", entity = "header")`) and apply to this window too, on every channel (REST, batch, MCP). Full contract: `modules/com.etendoerp.go/docs/neo-headless.md` §5.3.5.

- **Days (`Overdue Payment Days Rule`)** must be a whole number between 0 and 365. Anything else answers 400 (`ETGO_PaymentTermDaysInvalid` / `ETGO_PaymentTermDaysOutOfRange`). On update the range is only checked when the days change, so a legacy term stays editable.
- **No duplicates by days:** a second *simple* term (no lines, not fixed-due, month offset 0 or empty) with the same days in the same client — any organization, active or inactive — answers 409 `ETGO_PaymentTermDaysDuplicate`, naming the existing term. Saving an edited term that keeps its days does not trigger the check.
- **Messages in the SPA:** these refusals are translated by the shared `lib/backendErrors.js` (by message key, with `messageParams`), so this window's save and the "+ Crear condición de pago" modal show the same sentences: out of range "El número de días debe estar entre {min} y {max} (indicado: {value}).", duplicate by days "Ya existe la condición de pago «{name}» con esos días" and by name (`ETGO_PaymentTermNameDuplicate`) "Ya existe una condición de pago llamada «{name}» en esta organización", each adding "pero está desactivada. Reactívala en Condiciones de pago" when the existing term is inactive.
- **No duplicate names:** a name another term of the same client already uses in the same organization (exact match, active or inactive) answers 409 `ETGO_PaymentTermNameDuplicate` instead of a database error. This covers a non-simple term (month offset, fixed due date, lines) named like the `N Días` a days-only create derives (QA BUG-1). Checked on create and when a term is renamed.
- **Create defaults:** when not sent, the name is derived as `N Días` (`1 Día`), the search key as `ND` (`12D`), `Offset Month Due` = 0 and `Next Business Day` = on — the same shape as the seeded terms (zero days follows `Inmediato`).
- **`Next Business Day`** (`IsNextBusinessDay`) is now an editable checkbox in the form (it was discarded), so the derived value is persisted and can be changed here. When on, a due date falling on a weekend moves to the next Monday.

### Manual verification

1. Create a term with only `Overdue Payment Days Rule` = 12 (via the selector in a sales invoice): it is saved as `12 Días` / `12D`, offset 0, `Next Business Day` on.
2. Create another term with 30 days: refused with "already exists", nothing created.
3. Enter 366, -5 or 7.5 days in this window and save: refused with the range / whole-number message.
4. Edit the name of an existing term without touching its days: saves normally.
5. Create a term with 22 days, month offset 1 and name `22 Días`, then create `22` from a selector: refused with "a payment term named '22 Días' already exists", no 500.

