# Recurring Invoice

## Intent
This window should let a finance user maintain recurring billing templates that can be reused to generate future invoices on a schedule. The current evidence describes a template-oriented record with scheduling dates, status, partner, amount, and currency, plus a read-only last-generation date.

## What this window should allow
Users should be able to:
- create a recurring invoice template with a business partner, frequency, next run date, amount, currency, status, and start date;
- optionally define an end date for templates that should stop after a fixed period;
- review when the template last generated an invoice;
- browse existing templates and narrow the list by name, business partner, or status;
- open an existing template directly by record URL to review or update it.

The available fields make this look like a recurring-template maintenance screen, not a posted invoice transaction window.

## Interaction model
- **Route:** `/recurring-invoice` for the list and `/recurring-invoice/:recordId` for direct record access.
- **Visibility:** Route-only (ETP-5795). `menu.json` marks the item `hidden: true` with `"routeOnly": true`, so it stays out of the sidebar but remains reachable by URL (`/recurring-invoice`). Without `routeOnly` or `redirect` a hidden item is not registered and resolves to "Window not found".
- **Implementation type:** Generated window using the shared app-shell `ListView` and `DetailView`, backed by generated `RecurringInvoiceTable.jsx` and `RecurringInvoiceForm.jsx`.
- **Window shape:** Single-entity window for `recurringInvoice`. No master-child structure, child tabs, or related line entities are visible in the contract or generated UI.

## Reactive behavior and dependencies
Current evidence shows a simple header-only form with reference-driven inputs, but no explicit window-specific reactive logic.

Visible dependencies:
- **Business Partner** uses search input behavior, so the user is expected to resolve the template against an existing partner record.
- **Frequency**, **Currency**, and **Status** use selector inputs, so those values depend on existing reference data.
- **Last Generated** is read-only, which implies it is updated by some external generation flow rather than by direct user editing.

Behavior not visible in current evidence:
- No parent/child interaction is present because the window is single-entity.
- No totals, tax, discount, or line-level recalculation behavior is visible.
- No status-driven actions such as activate, pause, resume, or generate-now are exposed in the contract or generated window.
- No recurring-invoice-specific defaulting logic is visible. The shared app-shell can request generic defaults for new records, but this window does not show any documented template defaults of its own.

## Gap assessment
- The business meaning strongly suggests a downstream invoice-generation workflow, but the current evidence does not show where or how generation is executed. There are no process endpoints, action buttons, child entities, or documented background-job hooks for generating invoices from these templates.
- The presence of **Next Date**, **Frequency**, **Status**, **Start Date**, **End Date**, and **Last Generated** suggests lifecycle control for scheduled billing, but the allowed status model and status transitions are not visible.
- The window stores a single **Amount**, but there is no visible evidence of tax handling, discount handling, invoice-line derivation, or how the eventual generated invoice is composed.
- There is no visible link from a template to previously generated invoices, so traceability from template to generated transactions remains an open ambiguity.
- Because the route is hidden from the visible menu, access semantics are incomplete from a user workflow perspective: current evidence supports direct URL entry, but not a standard navigation path from the Finance menu.

## Manual verification
1. Sign in and confirm the Finance side menu does not show a visible **Recurring Invoice** entry.
2. Navigate directly to `/recurring-invoice` and confirm the list loads.
3. Verify the list supports filters for **Name**, **Business Partner**, and **Status**.
4. Create or edit a template and confirm the required fields are **Name**, **Business Partner**, **Frequency**, **Next Date**, **Amount**, **Currency**, **Status**, and **Start Date**.
5. Confirm **End Date** is optional and **Last Generated** is read-only.
6. Open `/recurring-invoice/:recordId` for an existing record and confirm the same template loads in detail mode.
7. Check whether the UI exposes any explicit generation action, pause/resume action, or link to generated invoices; if none appear, treat that as a confirmed product gap rather than assumed hidden behavior.

## Automated evidence
- `artifacts/recurring-invoice/contract.json` defines a single `recurringInvoice` entity with the template fields, searchable fields (`name`, `businessPartner`, `status`), CRUD endpoints, and no process endpoints.
- `artifacts/recurring-invoice/generated/web/recurring-invoice/index.jsx` wires the window to shared `ListView` and `DetailView` components using the `recurringInvoice` entity.
- `artifacts/recurring-invoice/generated/web/recurring-invoice/RecurringInvoiceTable.jsx` exposes list columns for schedule/template fields and filters for `name`, `businessPartner`, and `status`.
- `artifacts/recurring-invoice/generated/web/recurring-invoice/RecurringInvoiceForm.jsx` shows the editable form fields, selector/search input modes, and read-only `lastGenerated` field.
- `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js` together show hidden-menu but routable visibility.
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the generic generated-window route model and the shared defaults behavior used by the app shell.
- No dedicated recurring-invoice frontend test file was found in the current worktree.