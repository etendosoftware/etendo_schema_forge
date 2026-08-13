# IMP-22 — Resolve display names on **context-dependent** FK selectors (write verbs)

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P2**, cohort C4, 0 / 3, ⚙️ signature change |
| **Specification** | [post-audit 2026-08-10](../mcp-comparison-post-audit-2026-08-10.md) — registered from **C4, C5** |
| **Evidence** | C4, C5 (2026-08-10) — `neo_create` on `sales-order/header` rejected `partnerAddress` with 422 `not_found`, using the **byte-identical** `$_identifier` that `neo_selectors` returns for the same column when given a `recordContext` |
| **Repo** | `com.etendoerp.go` |
| **Blocks** | **IMP-4** (⚠️ 1.5 / 3). IMP-4's two original clauses are closed; its remaining clause *is* this item |
| **Implemented** | 2026-08-11 (`c3ce6c5e`) — **live verification owed** |

## 1. The defect, and why it is not a bad input

The read path and the write path disagreed about the same string. `neo_selectors` on
`C_BPartner_Location_ID`, given `recordContext:{businessPartner:…}`, returns
`label:"Madrid, Avenida Independiente 23"`. Sending that exact label back as `partnerAddress` on
`neo_create` produced a 422 `not_found`.

So an agent doing the correct thing — read the selector, use what it returned — got a rejection for a
value the server had just handed it. That is worse than an unsupported feature, because the agent has
no way to tell the rejection is about *scope* rather than about its own value, and the obvious repair
(try a different label) cannot work.

**Distinct from IMP-4**, which is about *format*: UUID vs legacy numeric vs display name, all closed
by IMP-15. This is about *which selectors are reachable at all*.

## 2. Root cause — the write path had no record context to give

`McpFkResolver` did consult selectors. What it could not do was consult a selector whose candidate
set only exists **relative to a sibling field**: `partnerAddress` lists the locations *of a given*
`businessPartner`; a tax rate depends on `orderDate` and `priceList`. Without the partner, the
location selector has nothing to offer, and an empty result is reported as `not_found`.

All three call sites in `McpToolRouter` — create `:448`, update `:585`, batch `:1117` — build their
context with `McpSelectorContextHelper.buildSelectorContextParams(null, adTab)`, a literal `null`
where the read path passes `args`. So the resolver ran with **tab-derived context only**, never with
the record's own fields — even though the agent had already submitted the parent in the same body.

The old javadoc at `McpFkResolver:58-66` documented this limitation *and* why it had been deferred:
it "would require resolving fields in dependency order… a second, more invasive pass". That
assessment is what §3 revisits.

## 3. Why no dependency graph was needed

The deferral assumed dependency order implies modelling the dependency graph — reading which selector
depends on which column out of AD, and topologically sorting. That is the invasive version, and it is
avoidable: **order can be discovered by trying**.

`resolveFkNames` now runs in two stages:

- **Pass 0 — the cheap checks only.** Every value that is already an id (UUID, legacy numeric, or an
  existing record id) is settled without a single selector call. This is not just an optimization:
  it means a field the agent *did* supply as an id is available as context **before** the first
  selector call, which is the common case (C4's own vector) and costs nothing.
- **Passes 1..n — retry what is left, deferring failures.** Each pass rebuilds the context from the
  body's currently-resolved fields and retries every pending field. A field that resolves drops out;
  a field that fails is deferred rather than reported.

Termination is `!progressed` — a pass that resolves nothing ends the loop. The load-bearing point is
that this is *the same condition* that makes the deferred error trustworthy: if no field resolved
this pass, no further context is coming, so the `not_found` is final rather than an artefact of
missing context. The loop's exit criterion and the error's validity are one fact, not two.

Worst case is O(n²) selector calls for `n` FK-by-name values in one body. Typical bodies carry one or
two, and pass 0 removes every id-valued field from the count before it starts.

## 4. The exclusion list is the whole design

The naive version of this fix is worse than the bug.

If the body still holds `businessPartner:"Tercero España"` — an unresolved search string — copying it
into `C_BPartner_ID` as context would narrow the location selector to a partner id that does not
exist, returning **zero** candidates. A field that was resolvable would become a `not_found`, and the
error would point at `partnerAddress` while the actual cause sat in a sibling.

So `McpSelectorContextHelper.withBodyContext(base, body, excludedKeys)` takes an exclusion list, and
two categories go into it:

1. **Still pending** — not yet resolved, so its value is a search string, not an id.
2. **Unusable** — the column could not be found, or the selector returned `>= 400`. These will never
   become ids, and must not be retried as context either.

A sibling that is merely unresolved must look **absent**, not **wrong**. Absent context yields the
full candidate set, which is recoverable; wrong context yields an empty one, which is not.

## 5. Why the change is small

`copySelectorContext` already existed (`McpSelectorContextHelper:152`) and already mapped body-style
keys onto classic selector params: `businessPartner` → `C_BPartner_ID`, `partnerAddress` /
`invoiceAddress` → `C_BPartner_Location_ID`, price list, sales context, and the two classic dates.
The read path had been doing this from `recordContext` all along. `withBodyContext` reuses it
verbatim with the body as the source and an exclusion filter on top.

Fixing it **inside the resolver** rather than at the three call sites means create, update and batch
all benefit with `McpToolRouter` untouched.

## 6. What landed

`com.etendoerp.go` `c3ce6c5e`:

| File | Change |
|---|---|
| `McpSelectorContextHelper.java` | `withBodyContext(base, body, excludedKeys)` — merges base context with the body's usable sibling fields |
| `McpFkResolver.java` | `resolveFkNames` split into `classify()` (pass 0) + `resolveByDependencyOrder()` (the retry loop) + `lookupOneField()` (the selector half of the old `resolveOneField`) |
| `McpFkResolverTest.java` | `@Nested ContextDependentSelectors` — 3 tests; stale class javadoc corrected |
| `SelectorContextParamsTest.java` | 4 `withBodyContext` tests |

**39 tests pass, 0 fail** (7 new), including IMP-15's value-format matrix — which is the regression
that mattered, since pass 0 rewrote the id-detection path those tests cover.

The tests assert **what context each selector call was given**, not merely that the field ended up
resolved. A test checking only the end result would pass against a resolver that guessed right for
the wrong reason, and this item exists precisely because the resolver was reaching the right-looking
outcome by a path that could not generalize.

## 7. Done when

- [x] A dependent FK sent as a display name resolves when the sibling parent is present as an id
- [x] It also resolves when **both** are display names (dependency order discovered, not modelled)
- [x] An unresolved sibling never leaks into the selector context as a parent id
- [x] A genuinely absent value still reports `not_found` once, without looping
- [x] Unit tests green, no regression to IMP-15's format matrix
- [x] **Compiled and deployed** (the user's step) — 2026-08-13
- [x] **C4 / C5 re-run live** — the same `partnerAddress` label that returned 422 now creates the record
- [ ] Registry re-scored by a `/mcp-comparison` run (+3, and IMP-4 1.5 → 3)

### 7.1 The live C4/C5 run — 2026-08-13

Ran against the deployed build, `sales-order` / `header`, exactly the vector that opened the item:

```
neo_selectors partnerAddress recordContext:{businessPartner:"6BD084B9C1744044B9691AD373F96A93"}
  → { id: "20363AD155354047AD5E52D8A93D9465",
      label: "San Sebastian, C/ EUSTASIO AMILIBIA 10, 7º 4ª" }

neo_create fields:{ businessPartner: "Tercero España",
                    partnerAddress:  "San Sebastian, C/ EUSTASIO AMILIBIA 10, 7º 4ª", … }
  → 200, C_Order 79441FC15F3742088DC94BE0D435CD92, documentNo 1000030, DR
     partnerAddress = 20363AD155354047AD5E52D8A93D9465
```

Both FK values were sent as **display names**, so the resolution ran through the multi-pass path —
`partnerAddress` cannot be looked up until `businessPartner` has been resolved to an id and fed to
the selector as context. That is the §7 line "resolves when both are display names", now confirmed
live rather than against a stub. The label also carries a `/` and the ordinals `7º 4ª`, so the run
incidentally covers the value-format path IMP-15 pinned.

The remaining §7 box is not ours: the registry is only re-scored by a `/mcp-comparison` run.

### 7.2 A different field blocked the same call — `invoiceAddress`

The first `neo_create` attempt, carrying every `userRequired` field, still failed:

```
422 validation_error — "Missing required fields that could not be auto-resolved"
missingFields: [ { name: "invoiceAddress", column: "BillTo_ID", type: "foreignKey" } ]
```

`invoiceAddress` is `required: true` in `neo_schema` but `visibility: "discarded"`, and the same
response's own hint says *"Fields with visibility=discarded are excluded — do not send them"*. The
call only succeeded once I sent it anyway. So an agent that follows the documented contract cannot
create a sales order, and the only way through is to break the rule the tool just stated.

This is **not** an IMP-22 regression — it is on the create path, not the FK resolver, and the 422
names a different field.

Nor is it a runtime defect, which is how this section first framed it. Checked against AD instead of
assumed:

| Source | `BillTo_ID` in the sales-order Header tab |
|---|---|
| `ad_field` / `ad_column` | `isdisplayed = 'Y'`, `ismandatory = 'Y'`, `isupdateable = 'Y'`, **no `defaultvalue`** |
| `artifacts/sales-order/schema-raw.json` | extracted as `visibility: "editable"`, with its own validation rule `C_BPartner_Location.IsBillTo = 'Y'` |
| `artifacts/sales-order/decisions.json` | overridden to `visibility: "discarded"` |

So the field **is** in the Etendo UI, AD requires it, and the extractor classified it correctly. The
`discarded` is a **curation decision in `decisions.json`** that the runtime then honours faithfully:
excluded from the agent surface, and with no default and no derivation there is nothing left to fill
a mandatory column. The 422 is the runtime reporting the curation, not misbehaving.

Note also that `invoiceAddress` is not merely a copy of `partnerAddress`: its validation rule filters
`IsBillTo`, where the shipping address filters ship-to. They coincide in this tenant only because
`Tercero España`'s single location carries every flag — a derivation that assumed equality would be
right here and wrong on the first partner with separate billing and delivery addresses.

The fix therefore belongs in `decisions.json` and goes through the Window Change Integrity Protocol,
not in `com.etendoerp.go`. Still not registered (the quota is the user's call, registry §2.2).

**Fixed and live — 2026-08-13** (`f2c87f69e`, contract 0.26.0 → 0.27.0 additive). The override is
gone; the field is back as an editable dependent selector filtered by `businessPartner`. Verified
across all three layers after the user's push and `export.database`:

| Layer | State |
|---|---|
| `etgo_sf_field` | `ISINCLUDED='Y'`, `ISREADONLY='N'`, `VISIBILITY='editable'` — exactly `mapVisibility('editable')` |
| `ETGO_SF_FIELD.xml` | the *only* rows changed: `N`→`Y` and `discarded`→`editable`, nothing else touched |
| `neo_schema view:"create"` | `invoiceAddress` now under **`required`**, `hasSelector:true`, `requiredCount: 4` |

The last row is the one that closes the loop the §7.2 above opened: the create view now *asks* for
the field whose 422 it previously could not explain, so an agent following the documented contract
can create a sales order without breaking the rule the tool stated.

A sweep of every artifact found **220** `discarded` fields that AD marks mandatory, of which **35**
are not booleans-with-a-DB-default or audit columns the DAL fills. Those 35 are *candidates*, not
confirmed defects — each needs its own tab-level display-and-default check, which is the shape of a
validator rule rather than of a one-off fix, and is the same argument F23 makes for its own
invariant.

## 8. What this does not settle

Compiling is not deploying and unit tests are not a live call. The registry row is therefore **🔧
fix implemented**, worth **zero**, not ⚠️ and not ✅ — the mark was added to
[the status vocabulary](../mcp-improvements-registry.md) §1 for exactly this state, after IMP-14
demonstrated three separate gates that each looked like delivery from the inside.

What the unit tests cannot show is that the selector **agrees with the live AD data**: they stub
`NeoSelectorService`, so they pin the resolver's contract and say nothing about whether a real
`C_BPartner_Location_ID` selector accepts the context params we now feed it. Only the C4/C5 vector
against a deployed build can close that, and it is the same vector that opened the item — which is
the right property for a reproducer to have.

> **2026-08-13** — the two paragraphs above are now historical: the build is deployed and §7.1 is
> that live call, so the selector is confirmed to agree with real AD data. The row is still worth
> zero until a `/mcp-comparison` run re-scores it, but for a bookkeeping reason now, not an
> evidentiary one.

Also unverified: the multi-pass path on a body with **three or more** chained dependencies (e.g.
partner → address → tax), and the O(n²) worst case has been reasoned about rather than measured.
§7.1's body chains **two** deep (partner → address); the other four FK names in it resolve without
context, so they exercise pass 0, not the retry loop.
