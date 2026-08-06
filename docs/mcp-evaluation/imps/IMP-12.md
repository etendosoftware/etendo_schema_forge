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

## 11. Second live probe — the slim landed, and it exposed a deeper defect

Read-only, `etendo-go-local` serving `3954b29c` after a user-run deploy.

### 11.1 The slim works and the default response is provably untouched

`view:"create"` on `sales-invoice/header`: **7,853 chars / 7,869 UTF-8 bytes**, against 71,742 for the
full dump — **−89.1 %**, inside the corrected 8 KB target with 339 chars of headroom. The `hint` is
944 of those chars (12 %); nothing else in the envelope is compressible without losing meaning.

No emitted descriptor carries `visibility`, `readOnly`, `userRequired`, `required`,
`defaultExpression` or `defaultSource`. The two AEAT `@SQL=…` blobs (806 + 604 chars) are gone.

The ♻️ half of the contract is **verified, not assumed**: the full dump captured before the slim and
the one captured after are **byte-for-byte identical** (`diff`, 71,742 chars both). `slim` copies
rather than mutates.

`purchase-invoice/header` returns the same 6 / 18 shape and the same six required FKs, so the
predicate is not overfitted to one window.

### 11.2 `neo_defaults` contradicts `required` — 4 of the 6

This is the finding that matters, and it invalidates one of §7's checkboxes rather than ticking it.

`neo_defaults("sales-invoice","header",view:"minimal")` resolves live values for **four of the six
fields `view:"create"` reports as `required`**:

| Field | `view:"create"` says | `neo_defaults` returns |
|---|---|---|
| `transactionDocument` | **required** | `40EE9B1C…` — *AR Invoice* |
| `paymentMethod` | **required** | `EA002232…` — *Efectivo* |
| `paymentTerms` | **required** | `2113A017…` — *30 Días* |
| `priceList` | **782B468D…** — *Lista de venta (sin impuestos)* | |
| `partnerAddress` | **required** | `""` — present but unresolved |
| `businessPartner` | **required** | absent |

So the `required` group's own hint — *"they are mandatory and nothing else supplies them"* — is false
for four of its six entries. That is the **same class of defect as [IMP-11](IMP-11.md)**: a hint
asserting something the implementation does not deliver. Shipping it would replace one aspirational
promise with another, which is worse than the verbose response it fixes, because an agent that trusts
it will interrogate the user for four values the server already knows.

**Root cause.** `hasSuppliedDefault` tests `defaultExpression` / `defaultSource` on the schema
descriptor, and those come from `AD_Column.DefaultValue`. But these four columns have no
`AD_Column.DefaultValue` — their values are resolved at runtime by `NeoDefaultsService` from session
preferences, the business partner's own configuration and AD callouts. **`AD_Column.DefaultValue` is
an incomplete proxy for "the server will supply this."** The authoritative answer is whatever
`neo_defaults` returns, and only `neo_defaults` computes it.

The default-aware narrowing in §9.2 was therefore *directionally* right and *quantitatively* short: it
caught the 2 statically-defaulted fields (`invoiceDate`, `currency`) and missed the 4 dynamically
resolved ones. The genuinely agent-supplied set on this entity is closer to **1–2 fields**
(`businessPartner`, and `partnerAddress` as its callout consequence) than to 6.

### 11.3 Status of the §7 checkboxes after this probe

| Done-when | Verdict |
|---|---|
| Under the corrected 8 KB | ✅ 7,853 chars |
| Every returned field is one the agent may supply | ✅ no `readOnly`, no `DocumentNo`, no `GrandTotal`/`OutstandingAmt` |
| Server-defaulted fields absent, and agrees with `neo_defaults(view:"minimal")` | ❌ **§11.2** — 4 of 6 `required` are resolved by `neo_defaults` |
| `fields:["businessPartner","invoiceDate"]` returns those two | ⏳ unverifiable at the time — resolved ✅ in §13.2 after an `/mcp` reconnect |
| Omitted `view`/`fields` returns the previous response byte-for-byte | ✅ verified by `diff` |
| The `view` enum advertises `create` | ⏳ correct in `ToolRegistry`, unverifiable through the cached client — resolved ✅ in §13.2 |
| Re-verified on staging | ⏳ not released |

Two ❌/⏳ that need a decision and one that needs a reconnect. **The item stays ⏳ open at 0 / 5.**
(The reconnect happened — see §13.2. Revised verdict table: §13.3.)

### 11.4 Unrelated observation for IMP-1

`purchase-invoice/header`'s `aeatsiiCauseExemption` comes back with
`label: "EM_Aeatsii_Cause_Exemption_ID"` and no `description` — the raw column name, i.e. no curated
`AD_Field` label for that column on that tab. The same field on `sales-invoice/header` is labelled
*"SII - Cause Exemption"*. An IMP-1 gap, not an IMP-12 one; recorded here because this is where it
surfaced.

## 12. The `neo_defaults` cross-check (2026-08-06, committed `977daf85`, unprobed)

The fix the user authorized for §11.2, from three candidates. The two rejected ones are recorded
because the reason they lost is the reason this one is right:

| Option | Why not |
|---|---|
| Reword the `hint` to stop claiming `required` is exhaustive | Makes the doc honest and the data still wrong. The agent's problem is not the sentence, it is that it will ask the user for `paymentTerms`. |
| Drop `required`/`optional` and emit one flat list | Throws away the only thing that made the view worth 7.8 kB. The grouping *is* the answer to "what do I have to decide". |
| **Cross-check against `neo_defaults` inside the view** | Chosen. `required` becomes true by construction rather than by assertion. |

### 12.1 The rule

`view:"create"` now asks the authoritative source instead of a proxy. A field whose name
`neo_defaults` resolves a **usable** value for is routed to `optional` and flagged
`serverDefaulted: true` — however mandatory AD says it is.

Three keys are excluded from "resolved", each for a distinct reason:

- `metadata` — `neo_defaults`' own envelope, not a field.
- `*$_identifier` — the display name of a FK, not something the agent could send.
- `""` / blank / `null` — **the server knows the field and could not resolve it.** `partnerAddress`
  returns `""`, which is exactly the case where the agent must still supply a value. Treating an
  empty string as resolved would have silently demoted a genuinely required field, i.e. re-created
  §11.2 in the opposite direction.

`serverDefaulted` exists so the agent can distinguish *"optional because nobody needs it"* from
*"optional because the server already has it"*. Only the second means **do not ask the user**;
collapsing them into a bare `optional` would lose the actionable half.

### 12.2 Cost, and why it is acceptable

One `NeoDefaultsService.resolveDefaults` call, paid **only** when `view:"create"` is requested. The
default response and `view:"actions"` do no extra work at all, so the ♻️ guarantee proved by `diff`
in §11.1 is untouched.

That cost buys back more than it spends: the agent was going to call `neo_defaults` anyway before
creating a record. This is the same resolution, moved earlier, in exchange for not interrogating the
user four times.

Resolution is **best-effort**: a throw, a `null` response, or `httpStatus >= 400` falls back to the
static `AD_Column.DefaultValue` rule and logs a warning. An over-reported `required` field is a worse
answer, not a broken one — a `neo_schema` call must never fail because the cross-check failed.

### 12.3 What landed

| File | Change |
|---|---|
| `McpSchemaCreateView.java` | `resolvedDefaultNames(JSONObject)`; `buildResponse` takes the resolved-name set and routes/flags on it; `CREATE_HINT` rewritten so the `required` claim is true and `serverDefaulted` is explained |
| `McpToolRouter.java` | `serverDefaultedNames(...)` — builds a `NeoContext` per the `handleDefaults` pattern, calls `resolveDefaults(ctx, null)`, swallows any failure into an empty set. Called only inside the `isCreateView` branch |
| `ToolRegistry.java` | The tool description said only *"mandatory but carries a default"*. Widened to name the four real sources (AD default, session preference, business-partner configuration, callout) and to document `serverDefaulted` |
| `McpSchemaCreateViewTest.java` | 4 `resolvedDefaultNames` cases (including that `""` does not count and that `metadata`/`$_identifier` are skipped) + 3 `buildResponse` routing cases, one of which pins the fallback when the set is `null` |

### 12.4 Expected shape, to be confirmed after the next deploy

Predicted for `sales-invoice/header` — recorded **before** the probe so a wrong prediction stays
visible, as in §10.1:

```
required: [ businessPartner, partnerAddress ]      requiredCount: 2
optional: [ 22 fields, 4 of them serverDefaulted ] optionalCount: 22
```

`partnerAddress` stays required because `neo_defaults` returns `""` for it. If the live run shows
anything other than 2 / 22, the `resolvedDefaultNames` predicate is what to re-examine first.

**The item stays ⏳ open at 0 / 5** — nothing here has been compiled or probed, and the §11.3 verdict
row that reads ❌ is not re-ticked until a live `view:"create"` shows `requiredCount: 2`.

## 13. Third live probe — the prediction was wrong, and `fields:[…]` finally ran

`etendo-go-local` serving `977daf85` after a user-run deploy **and a `/mcp` reconnect**, which is what
unblocked §10.4: the reconnect refreshed the cached tool list, so `fields` is now a declared property
and reaches the servlet.

### 13.1 The §12.4 prediction failed: 6 / 18, not 2 / 22

`view:"create"` came back with `requiredCount: 6` — the exact pre-cross-check numbers — and **no field
carried `serverDefaulted`**. The cross-check ran and had no effect.

**Root cause: I read the wrong shape.** `NeoDefaultsService.resolveDefaults` builds its body as

```java
response.put("defaults", defaults);
response.put("metadata", metadata);
```

so the body is `{defaults:{…}, metadata:{…}}`. The flat map I had been looking at all along is what
`neoResponseToMcpResult` / `McpDefaultsView` produce **downstream**, for the agent. `resolvedDefaultNames`
iterated the top level, skipped `metadata`, and collected the single literal key `"defaults"` — which
matches no field name, so every field kept its static classification.

I predicted the shape of the service's body from the shape of the MCP response instead of reading
`resolveDefaults`' own return. §11.2's diagnosis stands unchanged; only my access path was wrong.

**Why the tests said nothing.** All 7 tests added with the cross-check were green, and every one of
them built a **flat** body — none used the shape the router actually passes. A test suite that only
exercises the shape the author imagined will confirm the author's imagination. The fix (`fed3902a`)
adds the nested-body case, which fails against `977daf85`.

Fixed in `fed3902a`: read `defaults` when present, fall back to the body itself so an `afterHandle`
hook that returns a flat map still works. **Not yet re-probed** — §12.4's prediction stands as written
and is still unconfirmed.

### 13.2 `fields:[…]` works, and echoes the typo

`fields:["businessPartner","invoiceDate","buisnessPartner"]` on `sales-invoice/header`:

- `fieldCount: 2`, exactly the two requested descriptors, in the array's original order.
- `unknownFields: ["buisnessPartner"]` — the deliberate typo comes back instead of vanishing, which is
  the IMP-18 defect pre-empted at birth on this projection.
- `table`, `methods`, `namedFilters` and the default `hint` are all still present, i.e. `fields` is a
  filter on the full envelope rather than a separate view. That is the intended split: `view:"create"`
  reshapes, `fields:[…]` narrows.
- The descriptors keep `visibility` / `readOnly` / `userRequired` / `defaultExpression`. Correct — the
  point of asking for a named field is to see its full descriptor; only `view:"create"` slims.

The `view` enum advertising `create` is also confirmed now: the reconnected client's loaded schema
shows `enum: ["create","actions"]` and the widened tool description.

### 13.3 §11.3 verdicts, revised

| Done-when | Verdict |
|---|---|
| Under the corrected 8 KB | ✅ 7,853 chars (§11.1) |
| Every returned field is one the agent may supply | ✅ (§11.1) |
| Server-defaulted fields absent, and agrees with `neo_defaults(view:"minimal")` | ❌ still — cross-check written twice, effective zero times so far (§13.1) |
| `fields:["businessPartner","invoiceDate"]` returns those two | ✅ **§13.2**, plus `unknownFields` |
| Omitted `view`/`fields` returns the previous response byte-for-byte | ✅ verified by `diff` (§11.1) |
| The `view` enum advertises `create` | ✅ **§13.2**, confirmed through the reconnected client |
| Re-verified on staging | ⏳ not released |

Three ⏳/❌ became one ❌ and one ⏳. **The item stays ⏳ open at 0 / 5** — the `required` group is still
over-reporting 4 of 6 live, which is the defect that matters most here.

## 14. Fourth live probe — the cross-check works, 2 / 22 as predicted

`etendo-go-local` serving `fed3902a` after a user-run deploy. Read-only.

### 14.1 The §12.4 prediction is confirmed, exactly

| | Predicted (§12.4) | Live |
|---|---|---|
| `requiredCount` | 2 | **2** |
| `optionalCount` | 22 | **22** |
| `required` members | `businessPartner`, `partnerAddress` | **`businessPartner`, `partnerAddress`** |

All four fields §11.2 caught over-reported — `transactionDocument`, `paymentMethod`, `paymentTerms`,
`priceList` — are now under `optional` with `serverDefaulted: true`. `partnerAddress` correctly stayed
`required`: `neo_defaults` returns `""` for it, and the blank-value guard is what kept it there. That
guard was the one part of §12.1 with no live evidence behind it; it now has some.

13 of the 22 optional fields carry `serverDefaulted`, 9 do not. The `required` group's hint — *"neither
an AD default nor neo_defaults resolves a value for them"* — is now **true as measured**, which is what
§11.2 said it had to become.

### 14.2 Not overfitted: `purchase-invoice/header` gives 2 / 22 too

Same shape, same `required` pair (`businessPartner`, `partnerAddress`), 12 of 22 optional flagged. The
flagged set differs where the window differs — `salesRepresentative`, `chargeAmount`, `userContact` and
`aeatsiiClaveTipoFc` are resolved here and absent or unresolved on sales — which is the right kind of
difference: it tracks the tenant's actual configuration rather than a hardcoded list.

### 14.3 The ♻️ guarantee survives, and that creates a divergence worth naming

`fields:["paymentTerms","partnerAddress"]` on the default path returns `paymentTerms` with
`userRequired: true` and **no** `serverDefaulted`. So the untouched-by-default contract holds: no
defaults resolution is paid outside `view:"create"`.

The honest consequence: **the two views now disagree about the same field.** The full dump says
`paymentTerms` is `userRequired`; `view:"create"` says the server already has it. Both are internally
consistent — the full dump only ever claimed to report `AD_Column.DefaultValue`, and §11.2 established
that this is an incomplete proxy — but an agent that reads the full dump still gets the misleading
answer, which is precisely the harm this item set out to remove.

Three ways out, none of them free:

| Option | Cost |
|---|---|
| Pay the defaults resolution on the default path too | Every `neo_schema` call gets slower, including the ones that never create anything. Breaks the ♻️ classification measured by `diff` in §11.1. |
| Drop `userRequired` from the default dump and point at `view:"create"` | ⚙️ on the default response — the shape IMP-11 just backfilled. Removes the wrong answer instead of correcting it. |
| Leave it, and treat the default dump's `userRequired` as documented-as-approximate | Free, and honest only if the tool description says so. It currently does say so, since `fed3902a` widened it. |

**Decided 2026-08-06: option 3.** The user chose to leave the default path alone and make the
approximation explicit. Reasons, in the order they mattered:

- Paying the resolution on the default path turns a `♻️` call into one that runs three passes over the
  tenant's configuration — and it would pay that cost on the response we are actively trying to steer
  agents *away* from. It makes the 60 kB dump slower without making it useful.
- Dropping `userRequired` from the dump is `⚙️` on the field shape IMP-11 had just backfilled, and it
  deletes information that is still correct for its own stated question ("does this column carry a
  default?") rather than correcting the misleading one.
- Option 3 costs one sentence, and that sentence does double duty: it tells the agent which answer is
  authoritative *and* pushes it toward `view:"create"`, which is the outcome IMP-12 wants anyway.

What landed (`ToolRegistry.buildSchemaTool`): *"In the full dump `userRequired` is a static
approximation — it reads the column's own default only, so it over-reports fields the server resolves
from elsewhere; `view:"create"` cross-checks against the real defaults and is the authoritative answer
to 'must I ask the user for this?'."*

**No new IMP is registered for this.** The divergence is now a documented property of the default
response, not an open defect. If a future run measures an agent still being misled by the full dump,
that measurement — not this note — is what should open an item.

## 15. `view:"create"` on an uncurated entity returns an empty view **and tells the agent to stop looking**

Found while sizing the uncurated-entity gap (2026-08-06, `etendo-go-local`). This is a defect of the
projection IMP-12 built, which is why it is recorded here rather than against the curation backlog.

### 15.1 The response

```
neo_schema(spec:"bp-location", entity:"bpLocation", view:"create")
→ { "required": [], "optional": [], "requiredCount": 0, "optionalCount": 0,
    "hint": "…Anything omitted from this view is either auto-derived, read-only or excluded —
             do not send it, and do not call neo_schema again to look for it. …" }
```

`isAgentSuppliable` filters on `visibility`, and every `ETGO_SF_FIELD` row of this entity has
`visibility = NULL`, so nothing survives the filter. The empty arrays are the honest output of the
rule. **The `hint` is not**: it is written for the case "these are all the fields, the rest are
excluded on purpose", and on an uncurated entity it asserts, confidently and falsely, that there is
nothing to send — then instructs the agent not to check. An agent trying to create a business-partner
location concludes the entity takes no input.

### 15.2 How much of the model is in this state

Counted over what the MCP actually exposes (`ETGO_SF_SPEC.showinmcp = 'Y'`, `ETGO_SF_ENTITY.isincluded
= 'Y' AND ispost = 'Y'`, active rows only):

| Cut | Entities | Fields |
|---|---|---|
| All active POST-able entities | 105 / 246 | 1,892 |
| …restricted to MCP-exposed specs | **89 / 230** | **1,422** |
| …of those, `AD_Tab.tablevel = 0` (root) | **4** | 29 |
| …`tablevel ≥ 1` (sub-tabs) | 85 | ~1,393 |

`return-from-customer` and `return-to-vendor` carry `showinmcp = 'N'`; the 328-field difference between
the first two rows is theirs, and no agent can reach it. An earlier note in this session put the gap at
"105 entities / 1,892 fields" — that figure is real but not agent-visible, and should not be quoted as
the MCP's gap.

The 85 sub-tabs are dominated by auxiliary and system tabs: `accounting` ×12, `translation` ×6,
`intrastat` ×6, `tax`/`lineTax` ×8, `exchangeRates` ×4, `basicDiscounts` ×4. **These are not
curation debt — they are write surfaces that should not exist.** An agent has no business POSTing to
an invoice's accounting-entry tab. The four uncurated roots are small and all configuration windows:
`bp-location/bpLocation` (10), `chart-of-accounts/element` (10), `end-year-close/endYearClose` (5),
`fiscal-calendar/calendar` (4).

### 15.3 Where the switches are

There is **no MCP-specific visibility flag below spec level**, which constrains the fix:

| Level | Flag | Scope |
|---|---|---|
| `ETGO_SF_SPEC` | `showinmcp` (Y/N) | the only explicitly MCP-facing gate |
| `ETGO_SF_ENTITY` | `isincluded`, plus per-verb `isget` / `isgetbyid` / `ispost` / `isput` / `ispatch` / `isdelete` | shared with the React SPA |
| `ETGO_SF_FIELD` | `isincluded`, `visibility`, `isreadonly`, `isbusinesscritical` | shared with the React SPA |

So an auxiliary sub-tab can be removed from the write path with `ispost = 'N'` while staying readable —
but because the entity-level flags are **not** MCP-specific, doing so also removes it from the SPA's
write path. For the `accounting` tabs that is arguably correct on both surfaces; it is still a
consequence to accept deliberately, not a side effect. Adding an entity-level `showinmcp` would isolate
the change, at the cost of a new column and a second axis duplicating one that already exists — not
recommended yet.

### 15.4 Proposed shape — candidate IMP, not registered here

1. **Java, small:** when the create view emits zero fields, replace the closing "do not call
   `neo_schema` again" clause with one that says the entity is not curated for agent input and points
   at the full dump. A false statement is worse than a verbose one.
2. **Schema Forge data, larger:** set `ispost = 'N'` on the auxiliary sub-tabs, closing ~85 write
   surfaces that should never have been offered.

Curating the four roots is functional work outside this epic's scope. As with §14.3, registration is
the next `/mcp-comparison` run's call — this section is the investigation, not the decision.

### 14.4 §7 done-when, final state on `etendo-go-local`

| Done-when | Verdict |
|---|---|
| Under the corrected 8 KB | ✅ 7,853 chars (§11.1) |
| Every returned field is one the agent may supply | ✅ (§11.1) |
| Server-defaulted fields absent, and agrees with `neo_defaults(view:"minimal")` | ✅ **§14.1** — 2 / 22, agrees field-for-field |
| `fields:["businessPartner","invoiceDate"]` returns those two | ✅ §13.2, plus `unknownFields` |
| Omitted `view`/`fields` returns the previous response byte-for-byte | ✅ `diff` (§11.1), re-confirmed §14.3 |
| The `view` enum advertises `create` | ✅ §13.2 |
| Re-verified on staging | ⏳ **not released** |

Six of seven ✅ on `etendo-go-local`. **The status flip is not mine to make**: it belongs to a
`/mcp-comparison` run, which also has to re-measure M1/M2 before the 5 points count. The one open
row is a release, not a code gap.

### 14.5 IMP-1 gap re-confirmed

`purchase-invoice/header`'s `aeatsiiCauseExemption` still comes back with
`label: "EM_Aeatsii_Cause_Exemption_ID"` and no `description`, while `sales-invoice/header` labels the
same column *"SII - Cause Exemption"* (§11.4). Unchanged by this wave, as expected — it is an IMP-1
missing-`AD_Field`-label gap and needs its own fix.
