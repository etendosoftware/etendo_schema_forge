# IMP-7 — Lean / grouped `neo_defaults`

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P2**, cohort C1, 1.5 / 3, ⚙️ additive, ⚠️ partial |
| **Specification** | base report §7.8a / §12 |
| **Evidence** | A4 (2026-08-05), re-confirmed 2026-08-06 |
| **Repo** | `com.etendoerp.go` |
| **Investigated** | 2026-08-06, on `etendo-go-local` |

This file is a job-C investigation: root cause and design, no measurement and no status change.

## 1. Why the item is stuck at ⚠️

The registry's evidence cell names two defects in one line:

> `view:"minimal"` still returns 7 compliance keys; `partnerAddress:""` reported as resolved

Reading that as a single "not finished yet" is what has kept the row at 1.5 / 3 across two runs. The
two halves are **not comparable in cost**, and bundling them means the cheap half earns nothing while
it waits for the expensive one:

| Half | Nature | Cost |
|---|---|---|
| **A** — a blank value reported as resolved | A missing predicate. The correct destination already exists in the response. | ~15 lines + tests, `♻️` |
| **B** — 7 compliance keys survive `view:"minimal"` | No signal in the data distinguishes them from a legitimate `confirm` member. Needs a new criterion. | design decision, then `⚙️` |

## 2. Half A — a blank is not a resolved value

### 2.1 Root cause

`McpDefaultsView.apply()` classified **purely** by name:

```java
if (editableProps != null && editableProps.contains(baseProperty(key))) {
  confirm.put(key, value);      // ← the value was never examined
} else {
  systemManaged.put(key, value);
}
```

`metadata.unresolvedFields` looked like the natural place for a field the server could not fill, and it
already existed — but `NeoDefaultsService` populates it **only from `catch` blocks**
(`NeoDefaultsService.java:169` and `:198`). A column whose resolution *succeeded* and produced the empty
string never threw, so it never got listed. It went into `defaults` as `""`, and `apply()` forwarded it
into `confirm` looking exactly like a value the agent could accept.

The live case on `sales-invoice/header`: `partnerAddress` comes back `""` while
`metadata.unresolvedFields` is `[]`. **The one field the agent most needs to be told to supply was the
one that looked settled.** That is worse than omitting it — a missing key invites a question, a blank
key answers it wrongly.

Note the symmetry with [IMP-12 §13.1](IMP-12.md): both defects are the same mistake, reasoning about a
response's *keys* without looking at its *values*.

### 2.2 The fix

The grouping views now relocate blank-valued `confirm` members into `metadata.unresolvedFields`, whose
meaning already is exactly "the server knows this field and has no value for it". Details that are
decisions rather than mechanics:

- **Only `confirm` is filtered.** A blank in `systemManaged` is not the agent's problem, and reporting
  it would pad the list until nobody reads it.
- **A blank FK reports its base property once**, not the `$_identifier` companion — `baseProperty()`
  plus a `LinkedHashSet` collapse `partnerAddress` and `partnerAddress$_identifier` to one entry.
- **The existing array is merged, not replaced**, and de-duplicated: whatever `NeoDefaultsService`
  reported from a `catch` survives.
- **`apply()` copies the metadata object** instead of mutating it. It is handed the caller's response
  and must not modify it — the `full` view still has to return that object untouched.
- **The default (no `view`) response is unchanged.** Same reasoning recorded in
  [IMP-12 §14.3](IMP-12.md): the projections are the authoritative agent-facing surface, and the flat
  dump keeps its historical shape. Filtering it would be `⚙️` on a response other clients read.

The blank predicate is shared, not duplicated:
`McpDefaultsView.isUnresolvedValue(Object)` is now the single definition of "unresolved", called both
here and by `McpSchemaCreateView.resolvedDefaultNames` (IMP-12), so `view:"create"` and
`view:"grouped"` cannot drift on what the word means for the same field. It treats `null`, JSON `null`,
`""` and whitespace as unresolved — and deliberately **not** `false`, `0` or `"0"`, which are real
values a compliance flag legitimately carries.

### 2.3 What landed

| File | Change |
|---|---|
| `mcp/McpDefaultsView.java` | `isUnresolvedValue`, `KEY_UNRESOLVED_FIELDS`, blank routing in `apply()`, `withUnresolved()` merge helper |
| `mcp/McpSchemaCreateView.java` | inline blank check replaced by the shared predicate |
| `mcp/ToolRegistry.java` | `neo_defaults` `view` description states that blanks appear in `metadata.unresolvedFields` |
| `src-test/…/McpDefaultsViewTest.java` | `BlankValues` — blanks reported, `systemManaged` blanks left alone, FK base property, metadata merge + non-mutation, predicate |

### 2.4 Live probe (2026-08-06, `etendo-go-local`, commit `5c0d4a4c`)

`neo_defaults(spec:"sales-invoice", entity:"header", view:"minimal")`:

```
"confirm": { … 18 keys, partnerAddress absent … }
"metadata": { "sequenceFields": ["documentNo"],
              "unresolvedFields": ["partnerAddress"] }
```

Three things confirmed at once:

| Claim | Verdict |
|---|---|
| `partnerAddress` leaves `confirm` and is reported as unresolved | ✅ — was `""` in `confirm` with `unresolvedFields: []` |
| Sibling metadata keys survive the merge | ✅ — `sequenceFields: ["documentNo"]` intact, so `withUnresolved` copies rather than replaces |
| The default (no `view`) response is untouched | ✅ — still `partnerAddress: ""`, still `unresolvedFields: []` |
| No regression in IMP-12's view after the shared-predicate refactor | ✅ — `view:"create"` still 2 / 22, 13 flagged `serverDefaulted` |

**The "only `confirm` is filtered" decision validated itself.** The full dump carries two further blanks —
`paymentrule: ""` and `aeatsiiAuthorizationno: ""` — both non-`editable`, both correctly left in
`systemManaged` and not reported. Had the filter been applied to the whole body, `unresolvedFields`
would have three entries of which two are noise, on the very response whose point is to be short.

### 2.5 What the probe exposed: `unresolvedFields` is not "what you must supply"

Cross-reading the two views on the same entity:

| Field | `view:"create"` | `neo_defaults(view:"minimal")` |
|---|---|---|
| `partnerAddress` | `required` | `metadata.unresolvedFields` |
| `businessPartner` | `required` | **absent entirely** |

`NeoDefaultsService` never emits a key for `businessPartner` — not in `defaults`, so not in `confirm`,
`systemManaged` or `unresolvedFields`. The array can only ever report fields the service *attempted*:
`partnerAddress` is listed because something tried and produced `""`; `businessPartner` is missing
because nothing tried at all (ETP-3894 deliberately disabled FK preselection for Search-type
references, which is why).

So `unresolvedFields` means **"the server tried to fill this and could not"**, not "these are the fields
you owe". An agent using `view:"minimal"` as its to-do list on this window concludes that only the
address is missing and forgets the customer — the single most important field on an invoice.

This is not a defect introduced by §2.2; it is a pre-existing property of `neo_defaults` that §2.2 made
visible by giving the array its first non-empty value. It is also an argument for IMP-12's conclusion
rather than against it: **`neo_schema(view:"create")` is the only response that answers "what must I
supply" completely**, because it enumerates from the field metadata rather than from what defaults
resolution happened to touch. Candidate follow-up, deliberately not decided here: either state that
constraint in the `neo_defaults` description, or have the grouped views also list mandatory fields the
defaults body omitted — the second overlaps `view:"create"` and probably should not exist twice.

## 3. Half B — the 7 compliance keys are not a quick win

`view:"minimal"` on `sales-invoice/header` still returns these in `confirm`:

`etvfacInvType` · `etvfacReverseinvtype` · `etvfacSimpinvart7273` · `etvfacInvNoIDArt61d` ·
`aeatsiiClaveTipo` · `aeatsiiIsauthorization` · `etsgDateOperation`

They are there because they *pass* the classifier honestly: every one has `visibility = editable`, so
`editablePropertyNames` includes them and `confirm` is where they belong under the current rule. They
are **structurally indistinguishable** from a legitimate `confirm` member — same visibility, same
writability, same absence of any marker. There is nothing in the response to filter on.

What separates them is not a property of the field but of its **owner**: they belong to Spanish
e-invoicing modules (Verifactu, SII, TicketBAI), not to the document the agent is creating. The only
available signal for that is `AD_Column.AD_Module_ID` (or the `ETGO_SF_FIELD.ad_module_id` mirror)
differing from the core/document module.

That is a design decision, not a patch, and it carries a real risk: "field belongs to a localization
module ⇒ the agent should not confirm it" is a heuristic, and it is wrong for any tenant whose
localization fields genuinely need agent input. Options worth weighing when it is taken up — leaving it
open here rather than pre-deciding:

- Module-ownership exclusion, as above, with an opt-out.
- Reuse `isbusinesscritical` positively: `view:"minimal"` returns only `confirm ∩ businessCritical`.
  Cheap and already curated, but it changes `minimal`'s meaning from "writable" to "important".
- Leave `minimal` as-is and accept 7 keys as the floor, closing the item at ⚠️ with a documented
  reason.

**Recommendation:** split half B into its own registered item so half A can be credited. Bundled, the
row stays ⚠️ indefinitely because of the half nobody can cheaply finish.

## 4. What is not claimed here

No status is changed by this file. Half A is implemented and **probed live on `etendo-go-local`** (§2.4)
— but a probe is not a measurement: whether IMP-7's 1.5 / 3 moves, and whether half B is split into its
own item, is a `/mcp-comparison` run's call. Half B is untouched, and staging has not been verified.
