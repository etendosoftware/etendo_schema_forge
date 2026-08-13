# Payment Term

## Intent

Maintain the rules that determine when a receivable or payable becomes due and which term is treated as the default option for downstream document entry. In the current app-shell build, this window is the administrative place to name a term, define its visible due-date offsets, and mark whether it is the default term.

## What this window should allow

- List existing payment terms and find them by `Search Key` or `Name`.
- Open a term to review or edit the visible due-date rule fields: `Search Key`, `Name`, `Offset Month Due`, `Overdue Payment Days Rule`, and `Default`.
- Create, update, and delete payment-term headers through the standard generated CRUD flow.
- See whether a term is currently marked as the default through the `Default` boolean, which is rendered as a badge-style value in the generated UI.
- Use the maintained term later from other transaction windows that expose `Payment Terms` selectors, such as sales and purchase documents.

## Interaction model

- **Route:** `/payment-term` for the list and `/payment-term/:recordId` for detail.
- **Visibility:** visible in **System > Settings** from `tools/app-shell/src/menu.json`; not marked hidden.
- **Implementation type:** generated default-layout window loaded from `tools/app-shell/src/windows/registry.js` into the generic `/:windowName` shell route.
- **Window shape:** single-entity in the current frontend evidence. The visible screen is header-only even though the backend contract still declares a `lines` entity and `/lines` CRUD endpoints.
- **List/detail behavior:** the list exposes `Search Key`, `Name`, `Overdue Payment Days Rule`, and `Default`; the detail form exposes the five principal fields above and hides both **Print** and **More**.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- There are no visible dependent selectors, callout-driven field chains, status-driven actions, totals, tax reactions, or discount recalculations in the current Payment Term frontend contract.
- The `Default` field is the main visible reactive cue: the generated table and detail metadata render it as a badge-style boolean rather than plain text, so users can quickly identify which terms are flagged as default.
- Shared generated-window behavior still applies: opening a new record goes through the standard generated entity flow, which can request backend defaults before the form is shown, but there is no payment-term-specific defaulting rule documented in this window contract.
- No parent/child interaction is visible in the generated page. Although the backend contract models `lines`, the current decisions and generated frontend exclude that child structure, so users cannot manage installment or split-term detail from the current screen.

## Gap assessment

- Due-date semantics appear narrower in the shipped UI than in the backend model. The backend contract includes hidden header fields such as `fixedDueDate`, `maturityDate1/2/3`, `nextBusinessDay`, and `overduePaymentDayRule`, but the current frontend only exposes month offset and overdue days. If business users are expected to maintain fixed-date or multi-date due rules here, that is a current gap.
- The backend contract also defines a `lines` entity with percentage, remainder, payment method, exclude-tax, and due-date fields, but the generated frontend is explicitly header-only. If installment schedules or line-level term breakdowns are expected, that is a current gap.
- The business meaning of `Default` suggests it may need uniqueness or downstream auto-selection behavior, but the current frontend evidence only shows an editable boolean with badge rendering. No UI evidence confirms exclusive enforcement, warnings, or automatic propagation, so that remains an open ambiguity.
- The backend exposes additional header fields such as `Description`, but the current frontend decisions discard them. If users need explanatory text to distinguish similar payment terms, that capability is not visible in the current window.

## Manual verification

1. Open `/payment-term` and confirm the list loads and supports filtering by `Search Key` and `Name`.
2. Open `/payment-term/<recordId>` and confirm the detail page hides **Print** and **More**.
3. Confirm the detail form currently exposes only `Search Key`, `Name`, `Offset Month Due`, `Overdue Payment Days Rule`, and `Default`.
4. Change the `Default` checkbox, save, reopen the record, and confirm the saved state is reflected back in the badge-style display.
5. Attempt to find fixed-date, next-business-day, or child-line installment controls and confirm they are not currently exposed in the generated UI.
6. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- `artifacts/payment-term/contract.json` defines a default-layout frontend contract with `detailEntity: null`, visible header fields limited to the current five-field form, badge metadata for `default`, and supported list filters on `searchKey` and `name`.
- The same contract file also shows the backend still declaring a `lines` entity and `/lines` CRUD endpoints, which is why line-level term maintenance is documented as a gap rather than as shipped behavior.
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
