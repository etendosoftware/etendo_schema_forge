# ETP-4354 — Cross-domain plan: E2E integration tests for sales happy paths

## Why this change is cross-domain

The two new E2E specs exercise the **sales-order** and **sales-quotation**
windows end-to-end against a live backend. Both belong to the sales vertical
but are classified as separate windows by the domain boundary checker. Because
these are read-only test files (no runtime code, no generated artifacts, no
UI components modified), the cross-domain scope is limited to test assertions.

## Domains touched

- **window:sales-order** — `sales-order-happy-path.integration.spec.js`
  (E2E test only, no source changes).
- **window:sales-quotation** — `sales-quotation-happy-path.integration.spec.js`
  (E2E test only, no source changes).

## Tests

- **Playwright (integration)** — `sales-order-happy-path`: login → create order
  with 2 lines (Queso Sardo + Agua qty 3) → confirm with invoice → verify
  invoice has 2 lines → confirm invoice.
- **Playwright (integration)** — `sales-quotation-happy-path`: login → create
  quotation → add line → confirm DR→UE → confirm UE→order → verify closed.

## Rollback

Single-commit revert. Only additive test files — no runtime code, no DB
changes, no NEO push. Reverting removes the two spec files with zero side
effects on any other component.
