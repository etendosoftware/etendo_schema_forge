# MCP Corrections — Batch of 2026-09-14 Findings

**Status:** plan · nothing here is implemented
**Date:** 2026-09-15 · **Owner:** Valentin
**Evidence:** `mcp-tests/findings/` (eight files, all dated 2026-09-14) — read
[`mcp-tests/findings/README.md`](../../mcp-tests/findings/README.md) for the conventions
**Related:** [`docs/mcp-evaluation/mcp-improvements-registry.md`](../mcp-evaluation/mcp-improvements-registry.md)
(the IMP-* registry), [`docs/plans/2026-09-11-mcp-test-harness-design.md`](2026-09-11-mcp-test-harness-design.md)
(the harness that produced the runs)
**Target repo for almost all of the work:** `com.etendoerp.go` (`src/com/etendoerp/go/mcp/`)

---

> ### How to read this document
>
> This is a **batch work order**, not a report. The team's merge process favours grouping several
> small fixes into one branch rather than opening one Jira issue per defect, so this document is what
> a developer picks up to fix the whole batch. It is written to be worked from alone, by someone who
> was not in the 2026-09-14 session.
>
> **It carries no status, no priority and no score.** That authority belongs to the registry (§0 of
> the registry, and §0 below). Where a work item corresponds to an existing IMP-*, this plan cites the
> id and deliberately does **not** repeat its status — the registry may have moved since this was
> written, and a second copy of a status is how the first one stops being trusted.
>
> **It does not restate the findings' payloads.** Every item points at its finding file; the verbatim
> requests, responses and run ids live there and are not duplicated.

---

## 0. Scope and authority

| This document | The registry |
|---|---|
| Groups the 2026-09-14 findings into units of work, states what a fix must achieve, and records what is not known | Owns ID, priority, class, **status**, points, cohort and MARI |
| May describe severity **in prose**, where the evidence supports it | Owns any ranking |
| Cites IMP ids as pointers | The only place an IMP id is created or its status changed |

Two consequences the developer should act on:

1. **Do not create IMP entries from this plan.** Promoting a finding into the registry is a separate
   act with its own rules (registry §0/§1), and this plan is not that act. *(Update 2026-09-15: that
   separate act has since happened — five of the findings below were registered as **IMP-38…IMP-42**,
   one row per cause, and the ids are cited above and in each item. The instruction stands for anything
   still uncovered; in particular §5 must not be registered until its check runs.)*
2. **Read the registry before starting any item that cites an IMP.** An item may already be further
   along than this plan implies.

Work items are lettered (**A**, **B1**…, **C**) rather than numbered, on purpose: a parallel numeric
scheme would eventually be mistaken for IMP-*. The letters are labels, **not an order of priority**.

---

## 1. Finding → registry map

Done before anything else, because creating work for something already tracked is how a registry
loses its authority.

| Finding (`mcp-tests/findings/…`) | Registry coverage | Note |
|---|---|---|
| `2026-09-14-ref-key-breaks-every-gemini-model.md` | **none** | Fixed outside the registry — see §2 |
| `2026-09-14-neo-create-accepts-unknown-field-silently.md` | **IMP-18** | Direct instance. The registry's own 2026-08-13 sharpening already says the `unknownFields` mechanism exists on `neo_schema` and *"is simply not wired into the write verbs"*. This finding is new evidence on a new entity (`sales-order/header`, field `reference`), not a new item |
| `2026-09-14-orderreference-writable-filterable-never-readable.md` | **IMP-39** (registered 2026-09-15) · adjacent **IMP-26**, **IMP-28**, **IMP-27** | See §3.2 — the adjacency is real but none of the three describes *this* disagreement, which is why it was numbered separately |
| `2026-09-14-schema-understates-required-fields.md` | **IMP-40** (registered 2026-09-15) · partially **IMP-34**, **IMP-36** | IMP-34 covers a required **parent FK** omitted from `view:"create"`; IMP-36 covers a field missing from `metadata.unresolvedFields`. The `orderDate`-on-lines instance stays with those two. The `invoiceAddress` instance — a required **non-FK** field omitted from `view:"create"` — is covered by neither, and is what IMP-40 tracks |
| `2026-09-14-vector-search-targets-are-undiscoverable.md` | **IMP-41** (registered 2026-09-15) · adjacent **IMP-5**, **IMP-17**, **IMP-9** | |
| `2026-09-14-product-lookup-has-no-partial-text-search.md` | **IMP-42** (registered 2026-09-15) · adjacent **IMP-3**, **IMP-8** | |
| `2026-09-14-businesspartner-selector-wildcard-returns-empty.md` | **IMP-38** (registered 2026-09-15) · adjacent **IMP-8** | |
| `2026-09-14-no-discoverable-default-customer.md` | **none, and deliberately so** | **Not confirmed as a defect** — see §5. Not a candidate for anything until the check in §5 is done |

Adjacency is noted so the developer reads the neighbouring investigation first (`docs/mcp-evaluation/imps/IMP-<n>.md`),
not because the item belongs there.

---

## 2. Already fixed — not part of this batch

### The `$ref` key that made the MCP unusable with every Gemini model

**Finding:** `mcp-tests/findings/2026-09-14-ref-key-breaks-every-gemini-model.md`
**Fixed on:** branch `feature/ETP-5306`, commit `f7b28a4c` in `com.etendoerp.go`, PR
`etendosoftware/com.etendoerp.go#1088`.

Every serialised row carried `$ref` (`<entityName>/<id>`), which is a **reserved key inside Gemini's
`function_response.response`**. Gemini tried to resolve it against `function_response.parts`, found
nothing, and rejected the whole request — on the key *name*, irrespective of its value. The failure
fires on the tool **result**, i.e. the first time an agent reads any record, so no prompt or retry
could route around it.

What landed, against the three-part fix the finding itself agreed:

1. ✔ `McpResponseSanitizer` strips the key on the way out of the **MCP surface only**; core, the NEO
   REST contract and the React SPA are untouched. The `neo_batch` placeholder *value* is deliberately
   left alone.
2. ✔ The construction rule (`<entityName>/<id>`, both halves already on every row) is now stated once
   per response in the `neo_schema` hint and the `docs` preamble, instead of on every row.
3. ✘ **The regression test named as part 3 was not written.** The commit message says so explicitly;
   the single test touched there adapts an existing docs-body assertion to the new preamble.

**Recorded here for completeness, and the residual is one line, not an item:** a test asserting that
no `$ref` survives anywhere in an MCP tool response — nested rows included — is still owed. Whether it
is picked up in this batch or scheduled elsewhere is the coordinator's call; it is not grouped with
the work below because it belongs to a change that has already shipped.

---

## 3. Work item A — the write side and the read side disagree, and the read side is wrong

**Three findings, one shape.** In each, a write verb behaves one way and the read surface describes a
different world; in each, the read surface is the one an agent has to plan from, and it is the one
that is wrong.

| | Write side says | Read side says |
|---|---|---|
| §3.1 unknown field on `neo_create` | stored (200, no warning) | the field is not there |
| §3.2 `orderReference` | accepted by `neo_update`, filterable by `neo_list` | `neo_get` projects nothing; `neo_schema` says `discarded` |
| §3.3 required fields | `neo_create` refuses without them | `neo_schema(view:"create")` / `neo_defaults` call them optional |

### Root-cause them together, first

**Do not fix these one at a time.** Fixing them separately may be wasted effort if the cause is
common: all three plausibly live in the same place — the field-mapping layer that `McpToolRouter`
uses on the request body versus the projection layer (`NeoFieldFilter` / `McpFieldProjection` /
`McpSchemaFieldBuilder`) that shapes the response and the schema. The registry already records that
for the closest sibling case the two are **not** the same code path: IMP-30 found that
`McpToolRouter.handleCreate` builds a `NeoFieldFilter` and uses it only on the *response*, while the
body goes through `mapFieldsToDalProperties`, which carries no equivalent logic. That asymmetry is
exactly the shape of all three symptoms above.

**What would confirm a common cause:** a single trace of one `neo_create` and one `neo_get` on
`sales-order/header` showing that (a) the request body is validated against a different field set
than the one the response and `neo_schema` are built from, and (b) that set is computed in one place
that all three symptoms reach. If they reach it, one change fixes three symptoms.

**What would refute it:** if §3.3's requirement turns out to be enforced by a **callout or validation
rule** rather than by `AD_COLUMN.IsMandatory` (the finding flags this as unverified and the agent's
"callouts/validation" attribution as a guess), then §3.3 is not a projection defect at all — it is a
schema that cannot see the enforcement, and it needs a different fix from §3.1/§3.2. **Establish this
before designing anything**, because it decides whether item A is one change or two.

### 3.1 `neo_create` accepts an unknown field silently and discards it

**Evidence:** `mcp-tests/findings/2026-09-14-neo-create-accepts-unknown-field-silently.md`
**Registry:** **IMP-18** — this is an instance, not a new item.

*What happens.* A field name that does not exist on the entity is accepted, the record is created,
200 is returned with no warning and no `unknownFields` annotation, and the value is never persisted.
A later read cannot contradict it, because the field simply is not there.

*Why this is the worst of the three.* A silent success is worse than a loud failure: a loud failure
costs one retry, a silent success costs the data and leaves nothing — in the response or in any later
read — from which an integration could detect the loss. The read path already reports `unknownFields`
for a bad projection; the write path has no equivalent, which is precisely what IMP-18's registry cell
describes.

*UI test (D22).* **Fails against the server, in the agent's favour.** A person cannot type into a
field that does not exist, so the mistake is unreachable in the UI and silently destructive here.

*What a fix must achieve.* A write verb that receives a name the entity does not have must say so in
the response, using the mechanism that already exists on the read side — not a new one. The
symmetric outcome is the target: the same `unknownFields` key, the same validation source
(the spec's emittable keys, not the returned row — IMP-18's own implementation note), on
`neo_create`, `neo_update` and `neo_batch`.

*Explicitly not known.*
- Whether `neo_update` and `neo_batch` behave the same way. **Only `neo_create` was probed.** Probe
  the other two before deciding the shape of the fix.
- Whether this shares a root cause with **IMP-30** (the read-only rejection path has zero call sites
  in `mcp/`) and **IMP-31** (the `Java_Qualifier` exemption is all-or-nothing per entity). The finding
  raises the possibility and does not resolve it. **Note a discrimination the finding does not make:**
  IMP-30/31 concern *known* fields that are read-only and should be rejected; this concerns *unknown*
  fields that have no metadata at all. They can share a call site without sharing a cause. Do not
  assume the overlap — establish it.

*Blocked on this.* Harness decision **D3** relies on the `{{runId}}` marker landing in the record so a
sweep is one query. It does not land today. Until this is fixed, the probes use a field that exists
(`description`) — see §3.2.

### 3.2 `orderReference` is writable and filterable, but never readable

**Evidence:** `mcp-tests/findings/2026-09-14-orderreference-writable-filterable-never-readable.md`
**Registry:** **IMP-39**, registered 2026-09-15. Read **IMP-26** (MCP and NEO describe one field from two
different columns), **IMP-28** (`visibility` and `readOnly` contradict each other) and **IMP-27** (the
proposed per-field MCP override axis) first — they are the neighbourhood, and none of them is this.

*What happens.* `orderReference` (AD column `POReference`) on `sales-order/header` is declared
`"visibility": "discarded"` by `neo_schema`. That turns out to affect **only the read projection**:
`neo_update` accepts a value and returns 200, `neo_list` filters on it and finds the row, and
`neo_get` returns `None`. Three tools, three different answers about whether the field exists.

*Why it matters.* Same shape as §3.1 — the write reports success and the read cannot contradict it.
An agent sets a value, is told it worked, and every subsequent read says the field is empty.

*UI test (D22).* **Does not apply as a user-task claim, and the finding says so.** A person cannot set
this field in the Etendo GO UI at all, because `visibility: "discarded"` removes it from the window,
so no user task is blocked. The claim is narrower: it is about the MCP's **internal consistency**.
A developer should hold that line — this item is not "restore the field to users".

*What a fix must achieve.* The three tools agree. **Which way they agree is an open question, not a
decision this plan makes** (below).

*Explicitly not known — and this changes the fix, so it is carried here rather than resolved.*
- **Whether the read projection is intended behaviour for `discarded` fields.** If it is, the defect
  is on the write/filter side accepting a field the read side considers absent, and the fix is to
  reject the write. If it is not, the fix is the opposite. The finding establishes the disagreement
  and deliberately does not establish which side is wrong. **Settle this first; it inverts the fix.**
- Whether `neo_create` (as opposed to `neo_update`) also accepts it.
- Whether this is specific to `sales-order/header` or applies to **every** `visibility: "discarded"`
  field on every entity. **One field was tested.** The blast radius is unmeasured; a query over
  `ETGO_SF_FIELD` would give it cheaply, and it is the difference between a one-line fix and a
  contract decision.

*Tenant side effect left in place as evidence.* The follow-up set
`orderReference = "HARNESS-PROBE-XYZ"` on order `1000355`
(`F6BFDCD2D3084DE4A90803B9893D4CA9`). Do not be surprised by it; clear it when the item closes.

### 3.3 `neo_schema` and `neo_defaults` understate what a write actually requires

**Evidence:** `mcp-tests/findings/2026-09-14-schema-understates-required-fields.md`
**Registry:** **IMP-40**, registered 2026-09-15, which tracks the `invoiceAddress` instance only.
**IMP-34** and **IMP-36** cover the adjacent halves and keep the `orderDate`-on-lines instance. See §1.

*What happens.* Two independent agent sessions, two entities, the same defect, both reported
unprompted through `neo_feedback` while doing something else:

- `neo_schema(view:"create")` did not list `invoiceAddress` as required; `neo_create` rejected the
  request without it.
- `sales-order` line creation required `orderDate` even though `parentId` was supplied;
  `neo_defaults` for lines did not surface it as unresolved or required.

*Why it matters beyond one flag.* The read side of the contract is the only thing an agent can plan
from. When it says optional and the write refuses, the truth is discoverable only by failing — so
**every** agent creating one of these documents burns a failed write to learn what the schema should
have told it. It is a tax on the whole write path, and it is invisible to any metric that counts only
eventual success. (The first session still reported `OKAY`: it recovered. The defect is visible only
because the harness's honesty clause forces recovered failures to be reported.)

*UI test (D22).* **Passes.** A form shows the fields it will demand and marks the required ones before
save — that is the entire function of a form. `neo_schema(view:"create")` / `neo_defaults` is the
MCP's equivalent of that form, and it is not telling the truth.

*What a fix must achieve.* Whatever enforces the requirement at write time is visible in
`view:"create"` (as required) or in `neo_defaults` (as unresolved), before the write. A blind agent
assembles a valid create body from the read surface alone, with no failed round trip — the same
`Done when:` shape IMP-34 already uses.

*Explicitly not known.*
- **Where the requirement actually comes from.** The agent guessed "callouts/validation"; nobody
  confirmed it. If these fields are enforced by a **callout** rather than by `AD_COLUMN.IsMandatory`,
  that is likely the root cause and it changes the fix entirely — and, as noted above, it also decides
  whether this belongs in work item A at all.
- Whether other entities are affected, or only `sales-order/header` and `sales-order/lines`.
- Whether `view:"create"` differs from the default schema view in what it omits.

---

## 4. Work items B — discoverability failures

**Three findings, independent of each other.** They share a theme (an agent cannot find out what the
server will accept) but not a cause, and they can be fixed in any order or by different people.

### B1 — `neo_vector_search` target keys are undiscoverable, and a wrong key answers 403

**Evidence:** `mcp-tests/findings/2026-09-14-vector-search-targets-are-undiscoverable.md`
**Registry:** **IMP-41**, registered 2026-09-15. Adjacent: **IMP-5** / **IMP-17** (the structured-error envelope this response
does not honour), **IMP-9** (`neo_discover` surface).

*What happens.* A **DB Extended search-target key is not a spec name**, and nothing on the MCP surface
tells an agent what the valid keys are: no list tool, no enum in the input schema, and `neo_discover`
does not enumerate them. The only strategy left is guessing — which is what two probes did, using the
spec names they knew. The guess then fails as `403 "Access denied to vector target"`, which is
**indistinguishable from a genuine permission problem**. The agent cannot tell *this key does not
exist* from *this key exists and your role cannot use it*, and the message offers no next step.

*Why it compounds.* Every other NEO error observed in the same run does better — `unknown_filter_field`
returns the `available` list plus a `hint`; `validation_error` returns `missingFields` with labels and
selector availability. This is the one path that regressed to an opaque denial. It also removes the
fallback for B2: the tool that exists precisely for fuzzy lookup is the one that cannot be used.

*UI test (D22).* **Inconclusive, and deliberately not claimed either way.** Semantic search is not a
window a person opens, so the test does not map. The defect claimed is the **error contract** — the
undiscoverable keys and the 403 that conflates *absent* with *forbidden* — not the denial itself.
A developer must keep that framing: making the denial go away is not the fix.

*What a fix must achieve.* Two things, and they are separable:
1. The valid target keys are discoverable through the MCP (an enum, a list, or `neo_discover`).
2. An **unknown** target is not reported as a permission denial. It gets the IMP-5-shaped envelope the
   rest of the surface already uses: what was wrong, what is available, what to do next.

*Explicitly not known.*
- **Whether DB Extended is installed, or has any search target configured in this tenant.** Not
  checked. It may be entirely legitimate that no target exists here — in which case the *denial* is
  correct and only the message and the undiscoverability are the defect. **Check this first**; it does
  not invalidate the item (both branches lead to the same two requirements above), but it tells the
  developer whether they can test the happy path at all.
- Whether a correctly-named key succeeds for this role. **No valid key was ever found** — which is the
  finding.
- Whether the 403 is emitted by the MCP layer or propagated from DB Extended. This decides where the
  envelope has to be applied.

### B2 — products cannot be looked up by partial name

**Evidence:** `mcp-tests/findings/2026-09-14-product-lookup-has-no-partial-text-search.md`
**Registry:** **IMP-42**, registered 2026-09-15. Adjacent: **IMP-3** (business query semantics on `neo_list`), **IMP-8**
(`neo_selectors`).

*What happens.* Asked for *"tres cervezas de las ALE"*, the agent could not resolve a product: no
product is named or keyed `ALE`, only a generic `Cerveza` exists. It spent three extra list calls, then
proceeded with the generic product — a `MIXED` outcome with a **verified effect**: an order was
created, just not the one that was asked for.

*The line between data and defect, which the finding draws and this plan keeps.* That no product is
named "ALE" is **data, not a defect**. The defect is that there is no way to *find out* by partial
match. A person types "cerv" into the product selector and gets a filtered list; the agent has
`neo_list` with exact-ish filters.

*UI test (D22).* **Passes.** A person opens the product selector on the order line and types part of
the name. That the result is ambiguous is fine — a person resolves ambiguity by looking. That the
agent cannot perform the partial search at all is the gap.

*What a fix must achieve.* A partial/contains lookup for products that an agent can find and use — a
`contains`/`ilike` mode on the existing filter vocabulary (the IMP-3 neighbourhood) or a product
selector endpoint. Either satisfies it; this plan does not choose, because of the open question below.

*Explicitly not known — and it changes which fix is right.*
- **Whether `neo_selectors` already supports a contains/ilike mode for `product` that the agent did
  not find.** If it does, this is a **discoverability** defect (the mode exists and is not
  advertised), which is a different and much cheaper fix than adding a capability. **Establish which
  before implementing.**
- Whether the same limitation applies to other selectors or only to product.

### B3 — the `*` wildcard returns fewer results than no filter at all

**Evidence:** `mcp-tests/findings/2026-09-14-businesspartner-selector-wildcard-returns-empty.md`
**Registry:** **IMP-38**, registered 2026-09-15. Adjacent: **IMP-8**.

*What happens.* On `neo_selectors(businessPartner)`:

| Call | Result |
|---|---|
| `query: "*"` | `{items: [], totalCount: 0, hasMore: false}` — **empty** |
| `query: ""` | real partners |
| no `query` | real partners |

`*` is Etendo's own search convention and the UI selectors accept it. Here it does not expand — it
returns **strictly less** than the empty string.

*Why an empty answer is worse than an error.* An empty result is a *meaningful* answer: it says
*there is nothing*. An agent that reasons "let me list everything with the wildcard" concludes the
tenant has no customers and abandons the task — which is what happened: **the probe failed in 2 of 3
runs for this reason alone**, while the data was there the whole time. An unsupported wildcard that
errored would cost one retry; one that answers `[]` costs the task.

*Not part of this item.* `query: "default"` also returns empty, and that is **correct** — no partner is
named "default". An earlier reading of the run folded it into the defect; it is not part of it. (The
*separate* question of what a "default customer" is lives in §5.)

*UI test (D22).* **Passes.** The data exists and is visible to the same role and client — proved by the
unfiltered call returning it, and by the OKAY run creating an order with one of those partners.

*What a fix must achieve.* `*` either expands (matching the UI convention and returning at least what
the empty query returns) or fails loudly enough that an agent retries. What it must never do is return
a smaller, confident, wrong answer.

*Explicitly not known.*
- **The UI behaviour was not observed directly.** The claim rests on the data being reachable with the
  same credentials and role. One minute of manual checking would harden it — do that before writing
  code, because it is the cheapest possible confirmation.
- Whether other selectors (`product`, `warehouse`, …) share the behaviour, or whether it is specific to
  `businessPartner`.

---

## 5. Not confirmed — verify before treating this as a defect

### There is no discoverable "default customer"

**Evidence:** `mcp-tests/findings/2026-09-14-no-discoverable-default-customer.md`
**Registry:** no entry, and it must not get one until the check below is done.

> **This is not a correction to make. It is a check to run.** Its finding deliberately records the UI
> test as **UNCLEAR**, and the two outcomes are opposite: one makes it a gap, the other makes it a
> broken probe. Implementing a "fix" before the check means changing behaviour that may be correct.

*What happened.* Asked to create an order "for the default customer", the agent had no way to find out
who that is. It reported through `neo_feedback` that it *"could not find a 'default customer' via
businessPartner selector search"* and *"had to infer it from the most recent similar order"* — cost, 2
wasted selector calls plus a list call. In an earlier run the same agent reported *"some ambiguity
about what constitutes the true default customer"*: it knew it was guessing and said so.

*Why it would matter if confirmed.* "The usual customer", "the default one", "same as last time" is how
people talk, and an agent in front of a user will get that phrasing constantly. Inferring it from the
most recent document is a guess that is silently wrong the first time the last order was an exception —
and the agent has no way to know it guessed.

*UI test (D22) — genuinely borderline, stated as unclear rather than forced.* If Etendo carries a
default business partner for the user/role (a preference, or a window default), then a person
*effectively does* get one in the UI — the field arrives pre-filled — and the MCP not exposing it is a
gap. If no such default exists anywhere, the probe is asking for something nobody can do, and the file
is a record of a false alarm, not a defect.

**The check, in order:**

1. Does a default business partner exist at all in this tenant — as a preference, a window default, or
   a user setting? This single answer decides everything.
2. Does `neo_defaults` already return one for `businessPartner` on some **other** spec? If so, this is
   an **inconsistency** between specs rather than an absence, which is a different and smaller fix.

**If (1) is no:** close the finding as a broken probe, keep the file as the record, and rewrite the
probe. Nothing is fixed in the product.
**If (1) is yes:** the item becomes "expose the existing default through `neo_defaults`", and *then* it
is a candidate for the registry.

---

## 6. Second source — Santiago Alaniz

*Reserved, deliberately empty.* A second tester's feedback exists and was not available when this plan
was written. Nothing is assumed about its contents.

**How to merge it in, without restructuring this document:**

- Feedback that **corroborates** an item above → add a dated evidence line inside that item's
  *"Explicitly not known"* block, or strike the specific unknown it resolves. Do not rewrite the item's
  prose to look as though it was always certain; say what the second source settled and when.
- Feedback that **contradicts** an item → record the contradiction in place, both readings visible. A
  contradiction between two testers is a more useful fact than a quietly-picked winner.
- Feedback that is **new** → a new subsection here (§6.1, §6.2, …) in the same shape as the items
  above: what happens · evidence pointer · UI test (D22) · what a fix must achieve · what is not known.
  Move it into §3 or §4 only if it demonstrably shares a cause with an item there.

---

## 7. What this plan deliberately does not do

- **Does not assign priority, score or status.** See §0. If the batch needs an order of execution, the
  only technical constraint stated here is inside item A: root-cause §3.1/§3.2/§3.3 together before
  fixing any of them.
- **Does not create or modify IMP-* entries.** *(Update 2026-09-15: five findings were subsequently
  registered as IMP-38…IMP-42 by a separate act in the registry. This plan cites those ids; it did not
  and does not create them, and it still carries no status, priority or score.)*
- **Does not propose implementations the evidence cannot support.** Where the right fix is genuinely
  unclear — §3.2 (which side of the contract is wrong), §3.3 (whether a callout is the enforcer), B2
  (capability versus discoverability) — the plan states the open question and what would settle it,
  rather than guessing.
- **Does not duplicate the findings.** Run ids, verbatim requests and verbatim responses stay in
  `mcp-tests/findings/`.

