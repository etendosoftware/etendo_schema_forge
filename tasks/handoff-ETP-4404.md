# Handoff — ETP-4404: Rectificative Invoices in Etendo GO

## Goal

Implement rectificative invoices in Etendo GO:
- "Rectificaciones" tab on sales and purchase invoices with custom accordion design (per Ale's UX spec)
- Fields: original invoice lookup (`Reversed_C_Invoice_ID`), "Correctiva del 349" checkbox + tooltip, and conditional AEAT349 fields (Year FK, Period list, read-only Products/Services base amounts)
- "Rectificativa" badge in the header when `C_Invoice_Reverse` rows exist
- Jira: https://etendoproject.atlassian.net/browse/ETP-4404

## Status: FEATURE COMPLETE — pending review

All functionality works end-to-end and matches Ale's design. Tests green:
Vitest green (custom windows), Playwright 4/4 (`rectificaciones-tab.mocked.spec.js`).

### Active branches (both rebased on latest epic/ETP-3504)
- `schema_forge`: `feature/ETP-4404` — 5 thematic commits (backup of the original 22-commit history: `feature/ETP-4404-backup`)
- `com.etendoerp.go`: `feature/ETP-4404` — handlers + NEO field config export
- `schema_forge_core`: NO changes needed (the 4 exploratory commits were reverted; published package suffices)

## Architecture

- Tab implemented as a custom component via `window.extraTabs` with `placement: 'tab'`
  (`decisions.json`). The `reversedInvoices` ENTITY stays declared in decisions
  (NEO needs it for CRUD), but there is NO `window.secondaryTabs.reversedInvoices`
  entry — the old generated Form/Table files were deleted as orphans.
- Component: `tools/app-shell/src/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx`
  (reused by purchase-invoice). Accordion table, expandable rows, InvoicePickerModal,
  YearPickerSelect, batched AEAT-349 PATCH.

## Key backend facts (verified against local instance)

- `apiBaseUrl` passed to customTabs is SPEC-level (`/sws/neo/{spec}`), no recordId.
  Data endpoints are entity-level: `{spec}/header`, `{spec}/reversedInvoices`,
  `/sws/neo/fiscal-calendar/year`.
- NEO selector endpoints for the reversedInvoices entity return no data — the panel
  bypasses them and queries entity endpoints directly.
- NEO IGNORES arbitrary query-param filters (`businessPartner=X` returns everything).
  All candidate filtering is client-side. NEO also does not expose `updated`; the
  picker sorts by `invoiceDate` desc + `documentNo` desc.
- POST to `reversedInvoices` REQUIRES the parent FK in the body: `{ invoice: <headerId>, reversedInvoice: <id> }`.
- DB trigger `c_invoice_reverse_trg`: same-BP rule applies only when the org has no
  Verifactu or invoice type is F1/F2 — so the UI does NOT restrict by business partner;
  backend errors are surfaced in the add-form.
- AEAT349 trigger validates the whole group atomically: `aEAT349IsCorrective='Y'`
  requires year + period in the SAME statement. The panel accumulates the group
  locally and PATCHes `{corrective, year, period}` together once complete.
- Purchase-invoice wrapper (`custom/purchase-invoice/index.jsx`) must pass the
  `hasRectifications` extraBadge explicitly — its `extraBadges` prop overrides the
  generated config (`posted` intentionally suppressed since ETP-3569).

## Known follow-ups (out of scope for this PR)

1. `displayLogic` for the custom tab: "Rectificaciones" is visible even on
   non-rectificative invoices (generator does not emit displayLogic for extraTabs).
2. Negative amounts blocked on credit-memo lines: introduced by commit `9acde6457`
   (ETP-4005, IV-10) — `min: 0` on line fields in decisions.json of all 4 document
   windows, with no exception for rectificative doctypes. Team decision pending.
3. E2E specs for the accordion interactions (expand row, create line, 349 group)
   — current specs cover the badge; panel flows are covered by Vitest.
