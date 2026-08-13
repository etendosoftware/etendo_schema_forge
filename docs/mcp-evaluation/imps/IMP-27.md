# IMP-27 — A per-field MCP override axis (`I` / `RW` / `R` / `N`)

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P2**, cohort C5, 0 / 3, ♻️ same call. Registered 2026-08-12 on a human-authorised quota re-base (§8) |
| **Specification** | proposed by the user on 2026-08-12 during the IMP-21 run; evaluated against the code the same session |
| **Evidence** | not a defect — an extension point. Its need is measured indirectly: IMP-11's 1,422 uncurated fields, the ~60 kB `neo_schema` dumps, and the 15 accidentally-lost fields in IMP-26 §2.2 |
| **Repo** | `schema_forge` (config + pipeline) + `schema_forge_core` (writer + validator) + `com.etendoerp.go` (reader) |
| **Blocked by** | **IMP-26** — `I` cannot inherit from a source that disagrees with itself (IMP-26 §6) |
| **Implemented** | not started |

## 1. The proposal, in the user's terms

A selector on each spec entity field, settable from `decisions.json` and transmitted through the
pipeline, with four values:

| Value | Meaning for the MCP |
|---|---|
| **`I`** — inherited | **default.** Exactly today's behaviour: the MCP describes the field from its curated `visibility`. |
| **`RW`** | Present and writable to agents. |
| **`R`** | Present and read-only to agents, *regardless of what NEO allows*. |
| **`N`** | Absent from the agent's view of the entity. |

The load-bearing word is **override**. This is not a replacement for `visibility` and not a second
curation pass — it is a narrow escape hatch that changes what the MCP says about one field without
touching what NEO does with it. A field can be editable in the React UI and read-only to an agent.

## 2. Why this is the right shape

The current model has one source (`visibility`) and one derived projection (`isincluded` /
`isreadonly`) — see IMP-26 §2. The natural way to read this proposal is *a fourth axis*, and that
reading is wrong and more expensive than it needs to be.

**It is a second projection of the same source.** `visibility` stays the single curated statement
about a field; `isincluded`/`isreadonly` is its compilation for NEO's runtime; this new column is its
compilation for the agent surface, with `I` meaning "no divergence declared". That framing buys three
things:

- Nothing existing changes semantics. `I` on every row reproduces today's output byte for byte, which
  makes the whole change deployable with zero behavioural delta and testable as such.
- It cannot drift the way IMP-26 drifted, because it is not *derived* from `visibility` — it is an
  explicit exception to it. A stale exception is still the exception the human wrote.
- The React UI and the REST API are outside its blast radius by construction. Only
  `McpSchemaFieldBuilder` and the MCP resource/schema surface read it.

## 3. Surface control, not access control — write this down before the code

The single decision that determines whether this feature is honest.

**`R` and `N` must be understood as description, not as a gate.** They change what the agent is
*told*. They do not — and must not — cause NEO to reject a write that arrives anyway. An agent that
sends a field marked `N` still gets today's behaviour on the write path.

Two reasons, and the second is the stronger:

- Turning them into gates would put the MCP-only config on a path the React UI also drives
  (`NeoServlet` → `ETGO_SF_*`), which is exactly the risk IMP-21 §3.5 avoided by leaving
  `neo_action` ungated. A description-only change cannot break anything shipped.
- Anything that reads as security but is not enforced is worse than no feature. `N` on a salary
  column is a *tidier response*, not a protected column. If nobody writes that sentence down, the
  first person to reach for it will use it as an ACL. AD role/window access remains the only access
  control in the system, and this file must say so where the selector is documented.

## 4. Value by value, and what each is worth

### 4.1 `N` — ship this first, alone if necessary

Pure surface reduction, and the only value with a measured beneficiary.

`neo_schema` responses run around 60 kB; IMP-11 counts 1,422 fields in 89 uncurated entities; the ACE
cost of verbose responses is a standing concern the registry raises next to MARI (§2 of the
registry). `N` is the first tool that lets a human remove a field from an agent's view *without*
removing it from NEO — today the only way to shrink the surface is `visibility:"discarded"`, which
also stops NEO serving it, which is why nobody uses it for tidying.

It cannot break anything: a field the agent never sees is a field it never sends.

### 4.2 `R` — second, and it needs a guard

`R` on a field that is AD-mandatory and has no resolvable default produces an unsatisfiable create:
the agent is shown a required field it is told not to fill, and has no repair available. That is the
same class of unrecoverable instruction as IMP-26 §2.2 direction A, deliberately introduced.

So `R` ships with a validator rule (F11+): **`R` is invalid on a field that is `userRequired` and has
no `defaultvalue` / server-side injection.** Per CLAUDE.md the rule is implemented in
`schema_forge_core` and documented in `docs/pipeline-validator-reference.md`, which is canonical.

Its real use case is narrow and worth stating: a field the agent should *see and reason about* but
never set — a computed-looking total, a status a human owns, a field whose write path has side
effects nobody wants an agent triggering. Today the only way to express that is `readOnly`, which
also removes it from the React form.

### 4.3 `RW` — the least useful value, and possibly a mistake

`RW` promotes a field the curation marked `readOnly` or `system` back to writable *for agents only* —
strictly more permissive than the human UI. That is the one direction where a description-only change
becomes a trap: the MCP would advertise a write that NEO then refuses, which is **exactly IMP-26
direction A, re-introduced by configuration**.

For `RW` to be honest it would have to be a gate, and §3 says the axis is not a gate.

**Recommendation: implement the column with all four values in the reference list, and have the
builder treat `RW` as a validator error rather than a behaviour** — the value exists so the vocabulary
is complete and so a later decision can turn it on, and refuses to be set until someone has a case
that survives §3. Cheaper than shipping it and discovering the trap in production.

### 4.4 Buttons

`RW` and `R` are meaningless on a button — there is nothing to write. Only `I` and `N` apply, and `N`
is genuinely useful there: it is the clean way to retire an action from the agent catalog after
IMP-21 made the catalog honest about which ones are invokable. The builder must ignore `RW`/`R` on
button columns rather than half-apply them.

## 5. The pieces

Six touchpoints, plus a seventh that is already built and worth reading before the other six.
Nothing here is architecturally novel — `agent_prompt` and `isbusinesscritical`
already traverse this exact path, and copying one of them is the cheapest way to build it.

1. **`ETGO_SF_FIELD`** — one new column (`ETGO_SF_FIELD` currently has 19). **`varchar(2)`**, not
   `char(1)`: `RW` is two characters, and the neighbouring flags on this table being `char(1)` makes
   copying one of them the obvious mistake. Default `'I'`, plus an AD reference list for the four
   values. New AD records (`AD_Column`,
   `AD_Field`, `AD_Reference`, `AD_Ref_List`, messages) each need an id from **`make uuid`** — never
   hand-typed, per CLAUDE.md. Followed by `./gradlew export.database`.
2. **`decisions.json`** — a per-field key, and a documented one: `docs/decisions-reference.md` is
   where a human will look for it. Absent = `I`.
3. **`resolve-curated.js` → `generate-contract.js`** — carry it into the backend contract next to
   `visibility` / `businessCritical`.
4. **`push-to-neo.js` / `neo-writer.js`** — one more field in `buildFieldUpdateParams` and
   `upsertField`. **Read IMP-26 §4 first**: the UPDATE branch's conditional-key pattern is precisely
   what let `visibility` go stale, so the new column must be written on the same statement as the
   value it overrides, and `populateSpec` must not reset it.
5. **`McpSchemaFieldBuilder#loadFieldMetadata` + the builder** — the only reader. `N` drops the field
   from the schema array (and from `neo_list`/`neo_get` projections, or the agent gets values for a
   field it was never shown); `R` forces the reported visibility to `readOnly` and clears
   `userRequired`.
6. **Docs** — `docs/decisions-reference.md` and `neo-headless.md`, and §3's sentence in both.
7. **The entity-level twin, already shipped (ETP-4793) — read it as the worked example.** §4.1's `N`
   removes one field from the agent's view; `ETGO_SF_ENTITY.ISINCLUDED = 'N'` removes a whole entity,
   and that is the same idea one level up. It needed no new column and no Java: the column already
   existed, `upsertEntity` already accepted it, and **24 call sites across the REST and MCP surfaces
   already filtered on `SFEntity.PROPERTY_ISINCLUDED`** before resolving an entity — including
   `McpToolRouterSupport.findIncludedEntity` / `listIncludedEntities` and `ToolRegistry`. Nobody had
   ever set it: every one of 257 entity rows read `'Y'`.

   What was broken is the write path, and the shape of the bug is the one §5.4 warns about. `exclude:
   true` in `decisions.json` was a single `continue` in `resolve-curated.js`; its whole effect was
   "absent from `contract.json`". But `populateWindowSpec` derives its entity rows from
   `SELECT … FROM ad_tab WHERE ad_window_id = $1`, never from the contract — so an excluded entity
   still got a row at `'Y'` plus one field row per AD column. **94 entities and 1,438 field rows the
   curation had decided not to expose were served anyway**, and served with *more* verbs than their
   curated siblings, because a tab with no contract entity falls through to the window-level method
   default. Three things in it transfer directly to the six pieces above:

   - **One predicate, both write paths.** The fix lives in `cli/src/lib/entity-methods.js`
     (`isEntityExcludedFromContract`) because `push-to-neo.js` and `lib/neo-delta.js` must not
     diverge or `regen-check` goes red. IMP-27's column has the same constraint: §5.4 is not done
     until the offline XML delta writes it too.
   - **Close the children, even when it is redundant.** Every reader filters the entity before it
     reaches a field, so flipping the entity alone would have been enough behaviourally. The field
     rows were closed as well because 1,438 rows claiming `'Y'` under a closed entity misreport the
     agent surface — which is precisely how this went unnoticed. Expect the same of `N`: whatever the
     column's reader ignores, a counter somewhere still reads.
   - **Do not zero what you cannot reach.** The six method flags were left at the window default
     rather than set to `'N'`: they are unreachable once the entity is closed, and an all-`N` set
     would break the "GET and GETBYID are always granted" invariant `entity-methods.js` enforces.
     §4.3's treatment of `RW` is the same instinct — leave the incoherent state unrepresentable
     instead of writing a value nothing honours.

   **This moves §4.1's and §6's denominator.** The 1,422 fields in 89 uncurated entities (IMP-11) and
   the ~60 kB `neo_schema` responses were measured on a surface that still included these 1,438 field
   rows. Whatever a follow-up pass with `N` is worth, it is worth it against the post-ETP-4793
   surface, not the one those figures describe.

## 6. What this does not solve

- **It is not a substitute for curating IMP-11's 89 entities.** `N` on 1,422 fields one at a time is
  worse than one curation pass. This is for exceptions; bulk absence is `visibility`'s job.
- **It does not shrink anything by itself.** The column ships with every row at `I`, so the 60 kB
  dumps are unchanged until a human sets values. The measurable win is in a follow-up pass, and
  claiming it here would be claiming credit for work not done.
- **It does not fix IMP-26**, and cannot be used to paper over it: setting `R` on `tax.name` would
  make the symptom disappear while the underlying rows still disagree.

## 7. Done when

- The column exists with `'I'` as default and every existing row at `'I'`.
- A deploy with the column in place produces `neo_schema` output **identical** to the pre-change
  output for at least one spec — the zero-delta assertion is the whole safety argument for `I`.
- `N` on one field of one spec removes it from `neo_schema`, `neo_list` and `neo_get`, and NEO's REST
  path still serves it — the two surfaces diverging on purpose is the feature.
- `R` on a `userRequired` field with no default is refused by the validator, with a test.
- §3's sentence — surface control, not access control — is in `decisions-reference.md` and
  `neo-headless.md`, not only here.

## 8. Registration, and the argument that was dropped

Registered on 2026-08-12 with IMP-26, on a human-authorised quota re-base: known scope 97 → 105,
quota 97 → **126**, Delivery 51 → 39, MARI 73 → 70.

**An earlier draft of this section argued for holding the number back to protect the score, and that
argument was wrong on the arithmetic.** Once IMP-26's 5 points overrun the quota, the re-base happens
regardless; adding this item's 3 points moves the quota 122 → 126 and Delivery 40 → 39, i.e. **≈0.25
MARI points**. The expensive decision is *whether to overrun at all*, not *by how much*. Recording
the mistake rather than quietly replacing it, per this directory's own convention.

The honest reason to hesitate is different and has nothing to do with MARI: **numbers are permanent.**
If nobody ever needs `N` on a concrete field, this row cannot be deleted — only marked `🗄️ withdrawn`,
which keeps it visible forever. It was registered anyway because the design is already written down
here, and a file in `imps/` with no registry row is the exact five-places-status problem the README
says this structure exists to prevent.

**What this row must not be used for:** it is ⏳ open and worth 0 / 3, and it stays there until `N`
demonstrably removes a field from the agent surface on a live call (§7). Shipping the column with
every row at `I` is not partial credit — it is the zero-delta deploy, which is a safety property, not
an outcome.
