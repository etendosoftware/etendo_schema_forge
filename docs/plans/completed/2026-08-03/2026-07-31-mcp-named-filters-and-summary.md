# MCP per-spec named filters + curated summary (ETP-4601, Wave 2 redesign)

**Status:** completed (2026-08-03 — verified live against the running MCP)
**Date:** 2026-07-31
**Repos:** `schema_forge` (authoring) · `schema_forge_core` (pipeline) · `com.etendoerp.go` (DB + MCP)

## Problem

Live verification of Wave 2 (IMP-2/3/7) against the running instance exposed three issues:

1. **IMP-3 `status:"overdue"` → HTTP 500.** The status HQL references `eTGODueDate`
   (`em_etgo_due_date`), a computed/transient column Hibernate cannot put in a WHERE clause
   (confirmed: even a bare `lt` on it throws at query creation). `outstandingAmount` **is** queryable
   (so `pending`/`partial`/`completed` work), but C_Invoice has **no persisted due-date column** — so
   overdue-by-date is not expressible via an HQL filter on the invoice entity at all.
2. **IMP-3 named statuses are hardcoded** in `McpBusinessFilters` with invoice-specific column
   constants — they only work for invoice specs and cannot be authored/extended per spec.
3. **IMP-7 `confirm` block always empty** — `editablePropertyNames` read a `visibility` text column
   that `push-to-neo` never writes (it maps visibility → `isIncluded`/`isReadOnly` booleans). Fixed
   independently: derive editable from `isIncluded && !isReadOnly`.
4. **IMP-2 `view:"summary"` no-op** — relies on `isBusinessCritical`, which is unpopulated
   (0 fields for sales-invoice). `mandatory` is not a usable proxy (59 mostly-technical columns on
   C_Invoice). The fix is to **author** business-critical fields in `decisions.json`.

## Decision

Make named filters **hand-authored per spec in `decisions.json`** (canonical Schema Forge flow),
carried through the contract + `push-to-neo` into a new `ETGO_SF_ENTITY.NAMED_FILTERS` column, and
consumed by the MCP — which also exposes them as documentation. Summary reuses the existing
`businessCritical` field decision (no new storage). `overdue` is simply not authored where it cannot
be expressed.

- **Format:** each named filter carries a hand-authored **HQL `where` fragment** (same power as
  today's hardcoded logic — field-to-field comparisons like `outstanding vs grandTotal`, `abs`,
  `now` — which SmartClient `criteria` cannot express). Authored by trusted humans in `decisions.json`,
  same trust level as the current hardcoded fragments. A human never authors a filter over a computed
  column, so the 500 class of bug disappears.

## decisions.json shape (per entity)

```jsonc
"entities": {
  "header": {
    "namedFilters": [
      { "name": "completed", "label": "Paid", "description": "Paid in full",
        "where": "e.paymentComplete = true" },
      { "name": "pending", "label": "Pending", "description": "Not yet paid",
        "where": "e.paymentComplete = false and abs(e.outstandingAmount) >= abs(e.grandTotalAmount)" },
      { "name": "partial", "label": "Partial", "description": "Partially paid",
        "where": "e.paymentComplete = false and abs(e.outstandingAmount) > 0 and abs(e.outstandingAmount) < abs(e.grandTotalAmount)" }
    ],
    "fields": { "documentNo": { "businessCritical": true }, "businessPartner": { "businessCritical": true }, "...": {} }
  }
}
```

`overdue` is intentionally omitted (no queryable due date on the invoice header).

## Storage

New column on `ETGO_SF_ENTITY` (CLOB precedent: `PRECONDITIONS`, `AGENTPROMPT`):

```xml
<column name="NAMED_FILTERS" primaryKey="false" required="false" type="CLOB" size="4000" ...>
```

Plus the `AD_Column` sourcedata entry (so the DAL property `namedFilters` is generated on
`SFEntity`). `AD_Field` on the Schema Forge Configuration window is optional (the column is populated
by `push-to-neo`, not hand-edited).

## Phases & repo ordering (build/publish handoffs are the user's)

- **P0 — DONE.** IMP-7 `confirm` fix (`isIncluded && !isReadOnly`) in `McpToolRouterSupport`.
- **P1 — go DB schema.** Add `NAMED_FILTERS` CLOB to `ETGO_SF_ENTITY` (model/tables XML +
  `AD_COLUMN` sourcedata, fresh UUID via `make uuid`). → **user runs `update.database` +
  entity generation** to get `SFEntity.getNamedFilters()`.
- **P2 — core pipeline.** `generate-contract.js`: carry `entity.namedFilters` into
  `backendContract.entities[e].namedFilters`. `push-to-neo.js`: write it to the new column.
  Tests + version bump + publish (or `LOCAL_CORE` for dev). → **user publishes / bumps pin.**
- **P3 — decisions authoring.** Author `namedFilters` (completed/pending/partial) + `businessCritical`
  fields in `sales-invoice` (and other invoice specs). → **user runs `make regen PUSH_TO_NEO=1` +
  `export.database`.**
- **P4 — MCP consumption.** `McpToolRouterSupport.appendStatusCondition` reads the entity's
  `NAMED_FILTERS` JSON and appends the matching `where`; unknown name → clean 400, not 500. Expose the
  available named filters per spec in `neo_schema` (documentation). Remove hardcoded
  `McpBusinessFilters` invoice status + invoice column constants; drop `overdue`. Update `ToolRegistry`
  descriptions. Tests.
- **P5 — docs.** `decisions-reference.md` (new `namedFilters` construct), `mcp-comparison` report
  (mark IMP-3 done via config), this plan → completed.

## Non-goals

- Making `overdue`-by-date work (needs a payment-schedule subquery; out of scope).
- SmartClient `criteria` format (cannot express field-to-field payment-status logic).
- Hand-editing `NAMED_FILTERS` in the AD UI (authored via `decisions.json`).
