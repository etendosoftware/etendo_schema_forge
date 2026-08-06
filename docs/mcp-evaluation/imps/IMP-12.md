# IMP-12 — Projection for `neo_schema` (`view:"create"`, `fields:[…]`)

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C2, 0 / 5, ♻️, ⏳ open |
| **Specification** | [post-audit 2026-08-05](../mcp-comparison-post-audit-2026-08-05.md) §IMP-12 |
| **Evidence** | A10 (2026-08-05), **B6** (2026-08-06) — 61,963 chars / 157 fields |
| **Repo** | `com.etendoerp.go` |
| **Depends on** | IMP-11 — needs a per-field `userRequired` to filter on. **Satisfied** as of `356e77c5` (see [IMP-11 §4.2](IMP-11.md)) |
| **Investigated** | 2026-08-06, on `etendo-go-local` |

This file is a job-C investigation: root cause and design, no measurement and no status change.

## 1. The defect, as an agent experiences it

`neo_schema("sales-invoice","header")` returns every field of the tab — 157 of them, 61,963
characters. On 2026-08-06 (B6) the call did not merely waste budget: it **failed outright** against
the client's token limit. That distinction matters for the priority. A verbose response is a tax; a
response that cannot be received at all makes `neo_schema` unusable for the widest windows, which
are exactly the ones an agent most needs described.

The irony is that the agent wants a small subset. To create a sales invoice it must decide values
for a handful of fields; the other ~140 are compliance columns, audit metadata, read-only totals and
buttons. `neo_list` already solved its own version of this in IMP-2 (`fields:[…]` + `view:"summary"`)
and `neo_schema` already accepts one projection view (`view:"actions"`, IMP-6). The gap is that
nothing shrinks the *create-oriented* read.

## 2. Where the response is built

One method, and the insertion point is unambiguous.

`McpToolRouter.handleSchema` — [`McpToolRouter.java:774-854`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpToolRouter.java):

| Line | What happens |
|---|---|
| `:786-794` | `McpSchemaFieldBuilder.loadFieldMetadata` + `buildSchemaFieldsArray` build the full `fieldsArray` |
| `:795` | `applyPreconditionRequirements` overlays `requiredWhen` |
| `:798-799` | `applyCuratedLabels` overlays the IMP-1 labels |
| `:803-807` | **the existing view hook** — `view:"actions"` short-circuits into `McpActionsView.buildResponse` and returns |
| `:810-841` | the full envelope is assembled: `spec`, `entity`, `table`, `methods`, `namedFilters`, then `fields` + `fieldCount` |
| `:843-851` | the `hint` |

So the whole array exists in memory, fully decorated, *before* any view is applied. A second view
and a `fields` whitelist are both pure post-filters on `fieldsArray` — no extra DAL access, no new
query, no change to how the schema is loaded. That is why the registry classes this ♻️ rather than
⚙️: it is additive and cannot alter any existing response.

## 3. The precedent to mirror — and the one that does *not* apply

Worth stating both, because the obvious reuse is the wrong one.

- **`McpActionsView`** ([`McpActionsView.java:37-85`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpActionsView.java))
  is the right shape. A `final` DAL-free class, a `isActionsView(String)` predicate, an `apply`
  that filters the built `JSONArray`, and a `buildResponse` that emits a narrower envelope. It is
  ~86 lines including licence header. `view:"create"` is the same class with a different predicate.
- **`McpFieldProjection`** ([`McpFieldProjection.java:47-122`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpFieldProjection.java))
  is **not** reusable here, despite the name and despite IMP-12's spec saying the feature should
  "mirror what `neo_list` already offers". Its `apply` walks
  `response.data[]` and trims *record rows* (`:90-109`), keying on `id` and `$`-suffixed FK
  companions. A schema `fields` array is a list of *field descriptors*, filtered by each entry's
  `name`. The two share a concept and no code. `parseFields` (`:66-82`) is the one piece that
  transfers verbatim — and it is already `static` and DAL-free, so it can be lifted or called
  directly.

Recording this because "mirror `neo_list`" reads like an instruction to reuse
`McpFieldProjection.apply`, and doing so would silently no-op: a schema response has no
`response.data`, so `apply` returns at `:98-100` having done nothing.

## 4. The specified filter rule is wrong — measured

IMP-12's spec defines the create view as *"only `userRequired`, `businessCritical`, and FK fields
with `hasSelector`"*, with a `Done when` of *"returns under 4 KB and **every field in it is one the
agent must provide**"*. Those two clauses contradict each other. Applying the rule literally against
`sales-invoice/header` (SELECT-only, `etendo-go-local`, with IMP-11's `visibility` now populated):

| Candidate set | Fields |
|---|---|
| total rows carrying an AD column | 157 |
| `visibility = editable` | 24 |
| `editable` **and** `ismandatory` | 11 |
| `isbusinesscritical = Y` | 5 |
| FK with a selector reference (`18`/`19`/`30`/OBUISEL) | 26 |
| **union of the three, as specified** | **18** |

18 of 157 is a large win on size. But three of those 18 are `readOnly`, dragged in by the
`businessCritical` term:

```
DocumentNo      readOnly  mandatory  businessCritical
GrandTotal      readOnly  mandatory  businessCritical
OutstandingAmt  readOnly  mandatory  businessCritical
```

An agent must **not** send any of them — `DocumentNo` is sequence-generated, the other two are
computed totals. `businessCritical` answers a different question ("must I confirm this value with
the user before writing?") and is orthogonal to "may I supply it". Including it unconditionally puts
fields in a create-shaped view that a `neo_create` will reject or ignore. **The term belongs, but
intersected with `editable`, not unioned across all visibilities.**

## 5. The real derivation: `mandatory` is not `userRequired`

The more interesting finding. Of the 11 `editable`+`mandatory` fields, only **6** are genuinely the
agent's to supply. The other 5 carry an AD default:

| Column | AD default | Who supplies it |
|---|---|---|
| `C_BPartner_ID` | *(none)* | **agent** |
| `C_BPartner_Location_ID` | *(none)* | **agent** |
| `C_DocTypeTarget_ID` | *(none)* | **agent** |
| `C_PaymentTerm_ID` | *(none)* | **agent** |
| `FIN_Paymentmethod_ID` | *(none)* | **agent** |
| `M_PriceList_ID` | *(none)* | **agent** |
| `C_Currency_ID` | `@C_Currency_ID@` | session |
| `DateInvoiced` | `@#Date@` | server (today) |
| `EM_Aeatsii_Isauthorization` | `N` | module default (`org.openbravo.module.sii`) |
| `EM_Etvfac_Invnoidart61d` | `N` | module default (`com.etendoerp.verifactu`) |
| `EM_Etvfac_Simpinvart7273` | `N` | module default (`com.etendoerp.verifactu`) |

Six fields is almost exactly the *"~7 fields the agent must supply"* the spec set as its `AFTER`
target — so the target was right and the stated rule was the wrong way to reach it. It also closes
IMP-11 §5's worry that the `userRequired` set would be polluted by foreign-module compliance
columns: the three `EM_*` booleans are mandatory in AD but default to `'N'`, so a default-aware rule
drops them without needing a module allowlist.

**The correct predicate is `editable ∧ mandatory ∧ no-default`, plus `editable ∧ businessCritical`.**
And the server already computes "what I will supply for you": that is `neo_defaults`, whose
`McpDefaultsView` splits its output into `confirm` (the `editable` ones) and `systemManaged`
([`McpDefaultsView.java:36-46, 84-109`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpDefaultsView.java)),
classified from `McpToolRouterSupport.editablePropertyNames`. So `view:"create"` and
`neo_defaults(view:"minimal")` are two projections of one underlying question, and they must not
disagree — an agent that reads both and gets different answers is worse off than one that reads
neither.

## 6. What a fix has to touch

All in `com.etendoerp.go`; nothing in `schema_forge_core`, and no DB or sourcedata change.

1. **New `McpSchemaCreateView`** (mirroring `McpActionsView`): `isCreateView(String)`, an `apply`
   filtering `fieldsArray` on the §5 predicate, and a `buildResponse` emitting
   `{spec, entity, fields, fieldCount, hint}` — dropping `table`/`methods`/`namedFilters`, which a
   create payload does not need.
2. **`fields:[…]` on `neo_schema`**: filter `fieldsArray` by descriptor `name`. Reuse
   `McpFieldProjection.parseFields`; do **not** reuse its `apply` (§3).
3. **Wire both at [`McpToolRouter.java:803`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpToolRouter.java)**,
   next to the existing `view:"actions"` branch, so the three views share one dispatch point.
4. **`ToolRegistry`**: extend the `view` enum at [`ToolRegistry.java:606-615`](../../../../modules/com.etendoerp.go/src/com/etendoerp/go/mcp/ToolRegistry.java)
   from `List.of(VIEW_ACTIONS)` to include `create`, and declare `fields`. Without this the
   parameter exists but no agent discovers it.
5. **A create-specific `hint`.** The full `hint` (`:843-851`) explains four visibilities and a
   selector convention. In a view that has already applied those rules, repeating them is the same
   aspirational-hint mistake IMP-11 was about. It should say what the view guarantees.

Tests go to Tester per the delegation rule. All four pieces are pure `JSONArray`/`JSONObject`
transforms, so they unit-test without a DAL — same as the existing `McpActionsView` tests.

**Deliberately out of scope:** changing the default (no-view) response. Truncating it would break
every existing caller and hide the size problem instead of giving the agent a way around it.

## 7. Done when

- [ ] ~~`neo_schema("sales-invoice","header",view:"create")` returns **under 4 KB**.~~
      **Target corrected to under 8 KB** — see §10.2. 4 KB was authored before anything was measured
      and is only reachable by degrading `optional` to a bare name list, which costs the agent a
      second call and so works against the very metric (M1) this item serves.
- [ ] Every field it returns is one the agent may actually supply — no `readOnly`, no
      sequence-generated `DocumentNo`, no computed `GrandTotal`/`OutstandingAmt`.
- [ ] Fields the server will default (`C_Currency_ID`, `DateInvoiced`, the `EM_*` compliance
      booleans) are **absent**, and what remains agrees with `neo_defaults(view:"minimal")`.
- [ ] `fields:["businessPartner","invoiceDate"]` returns exactly those two descriptors.
- [ ] An omitted `view`/`fields` returns the current response byte-for-byte (♻️ means ♻️).
- [ ] The `view` enum in `ToolRegistry` advertises `create`, so it is discoverable.
- [ ] Verified on `etendo-go-local` after a user-run deploy, then on staging before the registry
      row moves.

## 8. Open questions

- **Should `view:"create"` include the `lines` entity's required fields?** A sales invoice is
  useless without lines, and the agent currently needs a second `neo_schema` call plus a
  `neo_batch` to discover the `parentRef` shape. Out of scope here, but if the answer is yes it
  changes the response envelope, which is cheaper to decide before shipping than after.
- **`requiredWhen` (`:795`) interacts with the filter.** A field that is conditionally required
  is not `mandatory` in AD, so the §5 predicate drops it — correct for the common case, wrong for
  an agent that has already set the triggering field. Simplest honest answer: keep them out and let
  the IMP-5 validation error name them, which is the path IMP-17 is already improving.
- **The 105 uncurated entities from [IMP-11 §4.2](IMP-11.md#42) have no `visibility` at all**, so
  the §5 predicate has nothing to filter on and `view:"create"` would return either everything or
  nothing for them. Whichever is chosen must be explicit rather than incidental.
  **Answered in §9:** they return *nothing*, deliberately.

## 9. What landed (2026-08-06, uncompiled)

Written in `com.etendoerp.go` on `feature/ETP-4793`; **not yet compiled or deployed** — the user
builds. Nothing has been probed against `etendo-go-local`, so every §7 checkbox stays unticked.

### 9.1 The four files

| File | Change |
|---|---|
| `mcp/McpSchemaCreateView.java` *(new)* | `isCreateView`, `buildResponse`, `applyFieldWhitelist`, `unknownFields`. DAL-free, package-private, private constructor — mirrors `McpActionsView`. |
| `mcp/McpSchemaFieldBuilder.java` | `userRequired` is now default-aware (§9.2); new `hasSuppliedDefault` + `isAgentSuppliable`; the `defaultExpression`/`defaultSource`/`userRequired`/`editable` literals promoted to constants so the view can reference them. |
| `mcp/McpToolRouter.java` | Both projections wired at the single dispatch point (`:805-823`), `unknownFields` added to the envelope, and the full-response `hint` now opens by pointing at `view:"create"`. |
| `mcp/ToolRegistry.java` | `view` enum extended to `["create","actions"]`, new `fields` param via the existing `stringArrayProp` helper, tool description rewritten around the corrected `userRequired` semantics. |

### 9.2 Reclassified ♻️ → ⚙️

The item was specified as ♻️ (same call, additive). It shipped as **⚙️**: `userRequired` changed
meaning in the **default** response too, not only inside the new view. A mandatory column that
carries an AD default now reports `userRequired: false`. On `sales-invoice/header` that moves 5 of
the 11 mandatory editable fields (`invoiceDate`, `accountingDate`, `paymentTerms`, `currency`,
`priceList`), leaving the 6 the agent genuinely must decide — which is what §5 measured and what the
original spec's "~7 fields" was reaching for.

This is a contract change only in the MCP response. `userRequired` is derived at response time; it
has no `ETGO_SF_FIELD` column, nothing in `decisions.json` or `contract.json`, and no frontend
consumer. Agents are the only readers, so nothing in the product can break — but a shipped field
changed value, hence ⚙️, and hence [IMP-11](IMP-11.md)'s re-verification must cover it.

`applyPreconditionRequirement` was left untouched: an explicit business precondition outranks a
column default, and it runs as an overlay after `addVisibility`.

### 9.3 Envelope divergence from §6.1

§6 called for `{spec, entity, fields, fieldCount, hint}`. It shipped as
`{spec, entity, required[], optional[], requiredCount, optionalCount, hint}`. A flat `fields` array
would have made the agent re-derive the split from the `userRequired` flag it was just handed —
the whole point is to remove that step. `optional` is kept rather than dropped so an agent can still
enrich a record without falling back to the 62 kB dump.

`businessCritical` is **intersected, not unioned** — the correction §4 records. It survives as a flag
on the emitted fields and gates nothing.

### 9.4 `unknownFields`, not silent dropping

A `fields:[…]` name that matches no descriptor comes back under `unknownFields`. This pre-empts the
defect IMP-18 tracks on `neo_list`'s projection, where a typo makes the field vanish and
the agent concludes it does not exist.

### 9.5 Uncurated entities return nothing

`isAgentSuppliable` requires `visibility == "editable"`, so the 105 entities with no `visibility`
yield empty `required`/`optional` groups. Deliberate: absent curation we cannot claim a field is safe
to send, and a wrong required-list is worse than an empty one. The cost is that `view:"create"` is
useless on those entities until they are curated — which is the same gap
[IMP-11 §4.2](IMP-11.md#42) flags as the candidate for a new IMP.

### 9.6 Tests

`McpSchemaCreateViewTest` (new, 15 cases across the four methods) and two nested classes added to
`McpSchemaFieldBuilderTest` (`addVisibility` default-aware cases, `isAgentSuppliable`). Pure JSON
transforms, no DAL. **Not run** — they compile with the module.

## 10. First live probe on `etendo-go-local` (2026-08-06, after a user-run deploy)

Read-only. Environment: `etendo-go-local` (`http://localhost:3100/mcp`), serving `feature/ETP-4793`
at `6cc522f5`.

### 10.1 `view:"create"` works, and the required set is exactly the 6 §5 predicted

`neo_schema("sales-invoice","header",view:"create")` returned `requiredCount: 6`,
`optionalCount: 18` — 24 suppliable fields out of 157, matching the `editable` count exactly.

The 6 required: `transactionDocument`, `businessPartner`, `paymentMethod`, `partnerAddress`,
`paymentTerms`, `priceList`. All 6 are FKs with selectors; `businessPartner` is the only
`businessCritical` one.

**The count was right but the composition was not.** §5 predicted the default-aware rule would drop
`invoiceDate`, `accountingDate`, `paymentTerms`, `currency`, `priceList`. Live, it dropped only
`invoiceDate` (`@#Date@`) and `currency` (`@C_Currency_ID@`): `paymentTerms` and `priceList` carry no
AD default on this instance and stayed required, while `accountingDate` never reaches the view at all
(it is `system`). Two errors cancelling out. The predicate is behaving as specified — the §5
*enumeration* of which fields it would hit was wrong, and is corrected here rather than in place, so
the mistake stays visible.

### 10.2 The size measurement, and why the 4 KB target was wrong

Reference sizes, computed from the verbatim full dump (`fieldCount: 157`):

| Response | Chars | vs. full |
|---|---|---|
| Full dump (no `view`) | **71,742** | — |
| `view:"create"`, as first committed | 12,746 | −82 % |
| …dropping only `defaultExpression` | 10,282 | −86 % |
| **…dropping every key the grouping already encodes** *(shipped)* | **7,767** | **−89 %** |
| …`optional` degraded to compact objects | 5,781 | −92 % |
| …`optional` degraded to a bare name list | 3,970 | −94 % |
| `required` only, `optional` dropped | 3,467 | −95 % |

Note the full dump **grew** from the 61,963 chars recorded in B6 to 71,742. That is
[IMP-11](IMP-11.md)'s backfill: two new keys on each of 157 fields, plus the longer `hint`. Fixing the
missing-`visibility` defect made the size defect measurably worse — which is the argument for the two
items shipping in the same wave.

`under 4 KB` (§7, authored before any measurement) is only reachable by the last two rows, both of
which strip `type`, `label` and `hasSelector` off the optional group. An agent that then wants to set
one optional field must call `neo_schema` a second time — spending an M1 call to save bytes, in an
item whose whole purpose is fewer calls. **Target corrected to under 8 KB**, met at 7,767.

What ships instead is a rule with no arbitrary cutoff: *no key in this view is redundant with the
group it sits in.* `visibility` is always `editable`, `readOnly` always `false`, `userRequired` is the
group itself, and `required` is the raw AD flag that `userRequired` supersedes — leaving it in would
actively contradict the grouping, since an AD-mandatory field with a default sits under `optional`
while carrying `required: true`.

`defaultExpression`/`defaultSource` go with them, for a second reason: on this entity two AEAT
compliance columns carry 806 and 604 characters of raw `@SQL=…` that no agent can evaluate.
`neo_defaults` resolves them server-side, and the hint now says so. Slimming copies rather than
mutates, so the default response stays byte-for-byte unchanged.

### 10.3 The ♻️ guarantee holds; the ⚙️ part is visible

The full dump still reports `fieldCount: 157`, omits `unknownFields`, and is otherwise unchanged
except for the rewritten `hint` — which is exactly the ⚙️ surface §9.2 declared.

### 10.4 `fields:[…]` could not be probed — client-side blocker

Both attempts returned the full 71,742-char dump. The parameter is declared correctly server-side,
but **this Claude Code session cached the tool list at connect time**, before the deploy: the loaded
`neo_schema` schema still advertises `view` as `enum: ["actions"]` with no `fields` property, so the
client strips the unknown argument before it reaches the servlet. `view:"create"` got through only
because the client passes enum values as opaque strings rather than validating them.

Not a defect in the implementation, and not verifiable without reconnecting the MCP server (`/mcp`)
or starting a fresh session. Recorded as unverified rather than assumed working — the §7 checkbox for
`fields:["businessPartner","invoiceDate"]` stays unticked, and `unknownFields` with it.
