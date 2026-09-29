# Entity-customization migrations — follow-up to ETP-5415

**Date:** 2026-09-28
**Status:** inventory, for scheduling as separate tickets
**Source ticket:** ETP-5415 (unified entity customization)

## Summary

ETP-5415 builds the base for per-entity customizations, replacing the pattern where one
entity's logic lives in shared code. What ships in that ticket is the **base**, not the
migration: a single `NeoExtensionDispatcher` serving all three channels (REST single, REST
batch, MCP), the `@NeoExtension` annotation binding, and the rule written into `CLAUDE.md`
and the agent definitions.

The migration itself happens afterwards, incrementally, and it is safe because **both
bindings coexist**: the dispatcher resolves the annotation first and `Java_Qualifier`
second. Entities migrate one at a time without touching the others.

Every number below was measured against the code on 2026-09-28, not estimated.

| Migration | Measured scope | Risk | Depends on |
|---|---|---|---|
| **M1** — annotation binding | 92 customizations, 0 migrated | low | — |
| **M2** — identity literals | 29 literals in 13 shared files | medium | M1 (partial) |
| **M3** — handler location | 80 of 92 outside `handlers/` | low | a prior decision |
| **M4** — write-path compensations | 4 classes, ~6 entities affected | medium | M1 |
| **M5** — selector policies | 12 policies + 1 registry | medium | M1 |

None of these blocks the ETP-5415 merge.

## M1 — The 92 customizations to annotation binding

**Measured:** 92 classes implement `NeoHandler` or extend `AbstractNeoHandler`. **None**
uses `@NeoExtension` yet; all 92 bind through `ETGO_SF_ENTITY.Java_Qualifier` + `@Named`.

**Why migrate.** The `Java_Qualifier` lives in the database, not in the code: finding out
which entity a class answers for means querying `ETGO_SF_ENTITY`, and a misspelled
qualifier does not fail — the customization simply never runs. `@NeoExtension(spec, entity)`
puts that link on the class, where it is read and where the compiler sees it.

**How, without breaking anything.** The dispatcher resolves annotation first, qualifier
second, so a migrated class and an unmigrated one coexist. Per class the migration is: add
the annotation, verify it still responds, and eventually clear the `Java_Qualifier` on the
`ETGO_SF_ENTITY` row.

**Documented trap:** `@Named` is not `@Inherited`. A customization annotated
`@ApplicationScoped` (or any normal scope) resolves to a Weld client proxy whose subclass
does not carry the `@Named`, and the lookup skips it silently. Do not add scopes while
migrating.

**Suggested task size:** by functional domain (sales, purchasing, inventory, finance), not
all 92 at once. Each batch is verified by exercising the customization once.

## M2 — The 29 identity literals in shared code

This is the migration that names the problem: shared code deciding on **which entity this
is** rather than on **what shape it has**.

**Measured:** 29 spec-name literals across 13 files that are not customizations:

| File | Literals |
|---|---|
| `NeoDocumentDownloadService` | 8 |
| `WidgetAccessPolicy` | 7 |
| `ReturnShipmentUtils` | 2 |
| `NeoFiltersService` | 2 |
| `NeoCommercialDocumentFactory` | 2 |
| `BatchService` | 2 |
| `McpSchemaFieldBuilder` | 1 |
| `NeoFavoritesService` | 1 |
| `NeoBackgroundDefaultsService` | 1 |
| `NeoReturnReceiptService` | 1 |
| `ReconciliationKpiTelemetry` | 1 |
| `ReportSelectorsServlet` | 1 |
| `NeoExtension` (javadoc example) | 1 |

**The criterion.** Branching on structure is allowed (`dalEntity.hasProperty("unitPrice")`,
whether an AD column is mandatory). Branching on identity is not (`"sales-order"`,
`"C_OrderLine"`). The first two files hold half the total and are the best starting point.

**The guardrail (E1) is part of this migration, not a prerequisite.** A test forbidding
identity literals is born red with these 29 entries, so it needs an allowlist that empties
as the migration proceeds. Writing the test and the allowlist first is what stops the count
growing while the work is in progress.

## M3 — The 80 customizations outside `handlers/`

**Measured:** of the 92 customizations, **12 are in `schemaforge/handlers/` and 80 are
outside**, mixed in with the shared services in `schemaforge/`.

This is a location problem rather than an architectural one, but it has a concrete
consequence: **a customization cannot be told from a shared service at a glance**. Opening
`schemaforge/` and seeing `CreateShipmentHandler` next to `NeoFiltersService`, nothing says
that entity logic is correct in the first and a defect in the second. The rule just written
into `CLAUDE.md` rests on exactly that distinction.

**There is a decision before the migration**, and it is one worth not leaving implicit:
either move the 80, or drop the `handlers/` convention and mark membership another way (the
`@NeoExtension` annotation from M1 may well be enough). Moving 80 files churns git history
and complicates pending merges; not moving them leaves a convention that is already false
in 87% of cases.

**Recommendation:** resolve it *after* M1. Once classes carry `@NeoExtension`, the
annotation says which entity each belongs to and the folder is no longer the only clue —
which makes the cheap option (dropping the convention) defensible.

## M4 — Write-path compensations as per-entity utilities

This migration came out of a discussion during the ticket and is recorded as **T12**.

**The classes:** `McpLinePriceInjector`, `McpBillToInjector`, `NeoCommercialLinePolicy`,
`DocTypeResolver`.

**Where they stand.** None branches on identity — they apply behind a structural guard
(`dalEntity.hasProperty("unitPrice") && hasProperty("listPrice")`, whether the `BillTo_ID`
column is mandatory in AD). So today they are formally correct.

**Why migrate them anyway.** They work because *every* matching entity wants the same
behaviour. The day one needs a different rule, shared code has nowhere to put it: the two
available moves are an identity `if` (forbidden) or a fork of the class. And since each
entity is maintained by a different person, "they all agree" is an assumption with an expiry
date, not an invariant. The structural guard is also a guess made in a file those entities'
owners do not read.

**The chosen shape:** not a generic default with an override — that keeps implicit behaviour
and adds another mechanism to maintain. Instead: the derivation becomes a **plain utility**,
with no entity selection and no guard, and **each entity that wants it calls it from its own
customization**. One implementation, N declared call sites. An entity needing a different
rule simply calls something else, or nothing.

**Steps:**

1. Enumerate against the database which entities each structural guard selects today
   (estimate: ~6). The number is the argument: with 6 explicit calls the cost is trivial.
2. Extract the four classes into utilities with no entity selection.
3. Call them from each customization; remove the guards and the shared-path invocations.
4. A guardrail so the next compensation does not land back in generic code.

**The usual objection does not apply here:** in the abstract, explicit call sites risk a new
entity forgetting the call. But onboarding new entities is rare in this codebase, so that
cost is paid almost never, against a divergence risk that grows with every person who owns
an entity.

## M5 — The 12 selector policies to per-field `@Selector`

**Measured:** 12 policies in `schemaforge/selector/policy/`, plus `SelectorPolicyRegistry`
and the `NeoSelectorPolicy` interface.

Among them: `CurrencyIsoAllowlistSelectorPolicy`, `AddressVirtualSelectorPolicy`,
`ProductPriceSelectorPolicy`, `InventoryProductSelectorPolicy`,
`InvoiceLineTaxSifSelectorPolicy`, `FinancialAccountPaymentMethodSelectorPolicy`,
`GoodsMovementProductSelectorPolicy`, `ProductSystemCategorySelectorPolicy`,
`ProductCategorySystemFlagSelectorPolicy`, `ContextParamSelectorPolicy`,
`ComboRowSelectorPolicy`, `ReferenceOverrideSelectorPolicy`.

**The concrete problem seen live during the ticket.** `CurrencyIsoAllowlistSelectorPolicy`
branches on the FK's **target** entity, not on the entity declaring the field. Result: the
EUR/USD/GBP allowlist applies to *every* currency selector product-wide, in any window.
Nobody asked for that; it is an effect of where the decision lives.

**Proposed shape:** a `@Selector("<field>")` annotation on methods of the entity's
customization, so the policy binds to the (entity, field) pair rather than to the target
type. An entity may have several selectors, each with its own behaviour — today that is
resolved with an `if` over `NeoContext.getFieldName()`.

**Status:** scoped and *not* built (plan §6.0.12). It carries the most open design of the
five — best treated as its own ticket, with its own shape decision before touching the 12.

## Suggested order

```
M1 (binding)  ─┬──► M2 (literals) ──► E1 guardrail with an empty allowlist
               ├──► M3 (location)  — cheap once the annotation exists
               ├──► M4 (write path)
               └──► M5 (selectors) — needs its own design first
```

**M1 goes first and alone.** It carries the least risk (both bindings coexist, nothing
breaks half-way) and it enables the other four: once each class declares which entity it
belongs to, "move this into entity X's customization" no longer requires a database query.

**M2 and M3 can run in parallel** — they touch different files and do not collide.

**M4 after M1**, because it needs the ~6 affected entities to already have a declared
customization to hold the call.

**M5 last**, and behind a design decision that has not been taken.

The identity-literal guardrail is best written **when M2 starts**, with an allowlist, not
when it finishes: that is what stops the count growing while the work is in progress.

## What is not a migration

Three things measured during the ticket that are **not** fixed by migrating customizations.
Each needs its own decision.

**1. `neo_batch` does not apply the read-only field filter.** Measured live: `neo_create`
refuses to write `salesOrder` on a line with `422 read_only_field`; `neo_batch` accepts and
persists it. It is a write permissiveness exposed by enabling the tool in this ticket, so it
belongs **before the merge**, not in a later migration.

**2. The divergence list in `neo-headless.md` §4.12.9 was wrong in five rows.** Each was
verified against the runtime:

| Row | Said | Is |
|---|---|---|
| `validateMandatoryFields` | missing in batch | runs — batch refuses identically |
| `injectCommercialAmounts` | in neither | runs on the shared path |
| `stripContactsPreCreateBillingDefaults` | batch only | both |
| `protectedCreateCalloutFields` | batch only | both |
| read-only filter | not listed | missing in batch |

Four false positives (work that would have been done for nothing) and one false negative,
which is the dangerous case. The operational lesson: that table is the definition of
"converged", and it must be measured against the runtime before decisions rest on it.

**3. Two loose ends, undiagnosed.** `grossUnitPrice` and `lineGrossAmount` persist as 0 on
both paths with `injectCommercialAmounts` running — cause not determined. And the
`warehouse` default differs between paths for the same body (batch resolved *Almacén
Principal*, create *Almacén Secundario*); whether that is a real divergence or a session
dependency is unknown.

## A note on method

The two most important findings of this ticket — the price 0 in batch and the missing
read-only filter — surfaced by **running real writes against an instance**, not by reading
code. In both cases the code read correctly: the price injection was present and simply ran
too early to see the parent. Budget that verification into each migration on this list.
