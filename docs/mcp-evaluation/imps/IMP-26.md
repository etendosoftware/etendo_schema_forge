# IMP-26 — MCP and NEO describe the same field from two different columns

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C5, 0 / 5, ♻️ same call. Registered 2026-08-12 on a human-authorised quota re-base (§7) |
| **Specification** | registered from a code + DB investigation during the IMP-21 run (2026-08-12), not from a probe vector |
| **Evidence** | 22 `ETGO_SF_FIELD` rows across 6 specs where `visibility` and its own `mapVisibility()` projection disagree (§2), confirmed agent-visible on `tax` via `neo_schema` (§3) |
| **Repo** | `com.etendoerp.go` (reader) + `schema_forge_core` (writer) |
| **Related** | IMP-11 (uncurated entities — same `visibility` column, different failure), IMP-27 (cannot ship before this one, §6) |
| **Implemented** | not started |

## 1. The claim

`neo_schema` tells an agent a field is writable and required. NEO refuses to write it. Or
`neo_schema` tells the agent not to send a field at all, and NEO serves and accepts it.

Both happen today, on the same records, because **the MCP describes a field from one database column
and NEO gates it from two others**, and nothing keeps the three in agreement.

This is not a curation mistake. Every one of the 22 affected rows was produced by the pipeline
working as written.

## 2. The two axes are one source and one projection

`visibility` is the curated value (`editable` · `readOnly` · `system` · `discarded`).
`isincluded` / `isreadonly` are **derived from it** by `mapVisibility()` in `push-to-neo.js:56-69`:

| `visibility` | `isincluded` | `isreadonly` |
|---|---|---|
| `editable` | `Y` | `N` |
| `readOnly` | `Y` | `Y` |
| `system` | `Y` | `Y` |
| `discarded` | `N` | `N` |

So they are not independent axes that happen to disagree — they are a source and its compiled
projection, and a row where they disagree is a row where the compilation is stale on one side.

**Who reads which:**

- **MCP** reads `visibility` verbatim (`McpSchemaFieldBuilder#loadFieldMetadata`), because the two
  booleans collapse `system` and `readOnly` into the same `Y/Y` pair and agents are told to act on
  the difference. `push-to-neo.js:443-447` documents exactly that intent.
- **NEO** reads `isincluded` / `isreadonly` and never looks at `visibility` —
  `NeoFieldFilter:188,194`, and likewise `NeoDiscoveryHelper:258-259`,
  `NeoListIdentifierHelper:132`, `NeoLocatorIdentifierHelper:119`, `NeoDefaultsService:277`,
  `McpResourceProvider:386,424`.
- `McpQuerySupport:204,221-224` is the one place that already reads the projection instead, with a
  comment naming the derivation — so the split is known in one file and not in the others.

### 2.1 The 22 rows

```sql
SELECT s.name AS spec, e.name AS entity, c.name AS col, f.visibility,
       f.isincluded, f.isreadonly
FROM etgo_sf_field f
JOIN etgo_sf_entity e ON e.etgo_sf_entity_id = f.etgo_sf_entity_id
JOIN etgo_sf_spec s ON s.etgo_sf_spec_id = e.etgo_sf_spec_id
LEFT JOIN ad_column c ON c.ad_column_id = f.ad_column_id
WHERE f.visibility IS NOT NULL
  AND ( (f.visibility = 'editable'  AND NOT (f.isincluded='Y' AND f.isreadonly='N'))
     OR (f.visibility = 'readOnly'  AND NOT (f.isincluded='Y' AND f.isreadonly='Y'))
     OR (f.visibility = 'system'    AND NOT (f.isincluded='Y' AND f.isreadonly='Y'))
     OR (f.visibility = 'discarded' AND NOT (f.isincluded='N' AND f.isreadonly='N')) );
```

```
           spec            |         entity         |             col             | visibility | inc | ro
---------------------------+------------------------+-----------------------------+------------+-----+----
 financial-account         | account                | EM_Aprm_Glitem_Diff         | discarded  | Y   | N
 financial-account         | account                | Writeofflimit               | discarded  | Y   | N
 payment-in                | finPayment             | Write-off Amount            | discarded  | Y   | Y
 return-material-receipt   | returnMaterialReceipt  | Posted                      | discarded  | Y   | Y
 return-to-vendor-shipment | returnToVendorShipment | Posted                      | discarded  | Y   | Y
 tax                       | tax                    | Base Amount                 | editable   | Y   | Y
 tax                       | tax                    | DocTaxAmount                | editable   | Y   | Y
 tax                       | tax                    | em_etvfac_cause not taxable | discarded  | Y   | N
 tax                       | tax                    | EM_Etvfac_Exemption Cause   | discarded  | Y   | N
 tax                       | tax                    | em_etvfac_IGIC Regime       | discarded  | Y   | N
 tax                       | tax                    | EM_Etvfac_IPSI Regime       | discarded  | Y   | N
 tax                       | tax                    | EM_Etvfac_Vat Regime        | discarded  | Y   | N
 tax                       | tax                    | EM_TBAI_Causa de Exencion   | discarded  | Y   | N
 tax                       | tax                    | EM_Tbai_Claveregimeniva     | discarded  | Y   | N
 tax                       | tax                    | EM_Tbai_Nonsubjectcause     | discarded  | Y   | N
 tax                       | tax                    | Name                        | editable   | Y   | Y
 tax                       | tax                    | Not Taxable                 | discarded  | Y   | Y
 tax                       | tax                    | Rate                        | editable   | Y   | Y
 tax                       | tax                    | Sales/Purchase Type         | editable   | Y   | Y
 tax                       | tax                    | Tax Exempt                  | discarded  | Y   | Y
 tax                       | tax                    | Valid from Date             | editable   | Y   | Y
 user                      | user                   | Username                    | editable   | Y   | Y
(22 rows)
```

`tax` 16 · `financial-account` 2 · `payment-in` 1 · `return-material-receipt` 1 ·
`return-to-vendor-shipment` 1 · `user` 1. Against 6,468 field rows carrying a `visibility` (2,125
more have none — that is IMP-11, a different item).

**22 of 6,468 is small, and the count is the least interesting number here.** What matters is that
the two directions fail differently and one of them is unrecoverable for the agent (§3), and that
nothing in the pipeline detects the state — so the number is a snapshot, not a bound.

### 2.2 Two directions, not one bug

- **A — `editable` but `isreadonly='Y'`** (7 rows: `tax.Name`, `Rate`, `ValidFrom`, `SOPOType`,
  `BaseAmt`, `TaxAmt`, `user.Username`). MCP advertises the field as writable, and because it is
  also AD-mandatory it comes back **`userRequired:true`**. NEO refuses the write. The agent is being
  instructed to send a value that cannot land.
- **B — `discarded` but `isincluded='Y'`** (15 rows). MCP tells the agent the field is not part of
  the surface — *do not send it* — while NEO serves and accepts it. Nothing breaks; the agent simply
  cannot reach a field that is available.

A is the defect that justifies P1. B is lost surface, and is the same shape of loss IMP-27 exists to
control deliberately rather than accidentally.

## 3. Measured agent-visible, not inferred

`neo_schema` on `tax`:

- `name`, `rate`, `validFromDate` come back as ordinary writable fields with
  **`userRequired:true`** — while `ETGO_SF_FIELD` has them `isreadonly='Y'` and
  `artifacts/tax/contract.json` classifies all three as `readOnly`.
- `taxExempt` and `notTaxable` come back `visibility:"discarded"` — while NEO has them
  `isincluded='Y'` and serves them.

So both directions are reachable from a plain read call, with no write probe needed.

**A note on a non-defect.** The MCP's `readOnly` response key does **not** carry spec `isreadonly`;
it comes from `isReadOnlyColumn()` (primary key / `DocumentNo` / auto-sequence). That is two names
for two concepts, not a third inconsistency: read-only-ness reaches the agent through
`visibility:"readOnly"`/`"system"` plus the response `hint`. Deliberately not registered.

## 4. Mechanism, read from the writer

`upsertField` (`neo-writer.js:290-356`) has an asymmetric UPDATE branch:

- `isincluded` and `isreadonly` are in the **unconditional** `setClauses` (`:310-311`), and the
  destructuring defaults are `isIncluded = 'Y'`, `isReadOnly = 'N'` (`:295-296`). A caller who says
  nothing about them still writes `Y`/`N`.
- `visibility` is written **only when the key is present** (`:340-343`).

`populateSpec` — step 2 of *every* push — calls it at `:615` with `entityId`, `columnId`,
`moduleId`, `fieldId`, `seqNo`, `audit`. No `isIncluded`, no `isReadOnly`, no `visibility`. So each
push **resets every field row of every entity to `Y`/`N` and leaves `visibility` untouched.**

The two later steps repair only part of that:

- **Step 3** (`buildFieldUpdateParams`, `push-to-neo.js:434-465`) writes all three consistently —
  but only for fields present in the **backend contract**.
- **Step 4** (`stepExcludeNonContractFields`, `:797-830`) sets `isincluded='N'` for non-contract
  columns, and only for columns **extracted from AD in this run** — deliberately, so that specs are
  not toggled by extension modules absent from the current environment.

Any field outside both sets keeps a `visibility` from one era and flags from another. That accounts
for direction B exactly: the `EM_*` rows belong to extension modules that no longer extract, so step
4 skips them and step 2's `Y` default stands next to a `discarded` written when they did extract.

**Direction A is not explained by that path and I am not going to pretend it is.** Step 2 writes
`isreadonly='N'`, so something wrote `Y` *after* `visibility='editable'` was written, and step 3 —
the only writer of `Y` — writes both columns in the same statement. The remaining explanation is
**writer version skew**: rows last touched by a CLI release whose step 3 did not yet carry the
`visibility` column, which the "Stored alongside — not instead of" comment at `push-to-neo.js:443`
reads like the fix for. That is a hypothesis with a cheap settling probe (§5.1), and it changes the
size of the fix but not its shape.

### 4.1 Direction A settled — the skew is confirmed, and the fix already exists

§5.1's probe was run on 2026-08-12. The hypothesis holds, and the fix for it is **already written
and has never run against this database**.

`schema_forge_core` carries `0b712f843` *"Feature ETP-4793: Persist curated field visibility on push
to NEO"*, dated **2026-08-06**, and `git branch --contains` returns exactly one branch:
`feature/ETP-4793`. It is not in `develop` and not in `main`. So every published CLI release that has
ever pushed to this instance had a step 3 that wrote `isincluded`/`isreadonly` and **not**
`visibility` — which produces direction A exactly: a `decisions.json` change from `editable` to
`readOnly` moved the projection and fossilised the source.

The timestamps close it, and one of them looked like a counterexample first:

```
spec | column   | visibility | inc/ro | updated
tax  | Name     | editable   | Y / Y  | 2026-08-07 12:12:00   (all 6 tax rows, one push)
user | UserName | editable   | Y / Y  | 2026-08-12 11:45:00   (today)
```

A row written *today* would refute the skew if today's writer were the fixed one. It is not: the
installed package is `0.3.32-preview.feature-ETP-4793.20260812143756.518e1b8`, built at **14:37:56**,
and the row was written at **11:45**. No row in `ETGO_SF_FIELD` has been written by a
`visibility`-persisting writer yet. There is no counterexample and no second mechanism to look for.

**What this changes about the item.** Direction A is now a data repair (§5.2) whose code fix is
in flight on this very branch, not new work — but the re-push is also the *first* live exercise of
`0b712f843`, so it verifies the fix rather than merely applying it. **Direction B is untouched by
that commit** and remains a live defect of the writer as it stands: step 2 still defaults
`isincluded='Y'` and step 4 still skips columns that no longer extract, so §5.3's guard is still
owed in full.

### 4.2 A third writer of these rows, which models the column not at all

Found while probing: `--dump-delta` does not go through `populateSpec`/`buildFieldUpdateParams` at
all. It builds its own picture via `computeWindowDelta`, and in the 78 `ETGO_SF_FIELD` upserts it
emits for `tax`, **`VISIBILITY` appears zero times** — every row carries `ISINCLUDED`/`ISREADONLY`
and nothing else. Meanwhile the module's own `src-db/database/sourcedata/ETGO_SF_FIELD.xml` *does*
carry the column, on 4343 of its 6468 rows, so `export.database` and `update.database` are not the
culprits here.

Two models of the same write, disagreeing about which columns exist, is the same shape of defect as
the one this item registers — one column, two writers, no cross-check. It is recorded here rather
than registered separately because the F11+ validator rule in §5.3 detects the *state* regardless of
which writer produced it, which is the argument for putting the guard there and not in a writer.

## 5. The fix

### 5.1 Settle the cause first (one dry-run, no writes) — **done 2026-08-12**

`sf-push-neo tax --dry-run` prints the planned `visibility` / `isIncluded` / `isReadOnly` per field
(`reportDryRunPlan`, `:485-503`). The plan shows all three agreeing, so the 22 rows are stale rather
than continuously re-broken — see §4.1 for the confirmation and §4.2 for what else the probe turned
up.

Two notes for whoever runs it next, since the invocation in the line above is not the one in this
repo's older docs. Post-split the script is the published bin, not `cli/src/push-to-neo.js`, and it
resolves `artifacts/` relative to its own package unless told otherwise — so it needs
**`SF_ROOT="$PWD"`**:

```bash
SF_ROOT="$PWD" npx sf-push-neo tax --dry-run
SF_ROOT="$PWD" npx sf-push-neo tax --dump-delta /tmp/tax-delta.json   # also read-only
```

### 5.2 Repair

Re-push the six specs (`tax`, `user`, `financial-account`, `payment-in`,
`return-material-receipt`, `return-to-vendor-shipment`). Requires the usual
`./gradlew export.database` afterwards.

Per §4.1 this is also the **first live run of `0b712f843`**, so it is a verification and not only a
repair. Assert afterwards that the direction-A query returns **0 rows**
(`visibility='editable' AND isincluded='Y' AND isreadonly='Y'`) and that the direction-B count has
not grown. It writes to `ETGO_SF_FIELD`, so it needs explicit authorisation per run — and it must be
the fixed writer that runs it, i.e. the `feature/ETP-4793` preview package or `LOCAL_CORE=1`, never a
published release, or it will re-fossilise the rows it is meant to repair.

### 5.3 Stop it recurring

Two candidates, and they are not equivalent:

- **Make `visibility` unconditional in the UPDATE**, mirroring `isincluded`/`isreadonly`. Symmetric
  and small — but it means `populateSpec` would null `visibility` on every push, destroying curation
  on any field step 3 does not revisit. **Wrong on its own.**
- **Stop `populateSpec` resetting the flags.** Have step 2 leave `isincluded`/`isreadonly` alone on
  *existing* rows (defaults still apply to inserts). Then the projection only ever changes where the
  source does, and the asymmetry disappears without touching curation. **This is the one to take** —
  and its blast radius is real, because today's `Y`/`N` reset is load-bearing for any spec that
  relies on step 3 + step 4 to re-establish state each run.

Either way the guard belongs in the validator, not only in the writer: a rule (F11+) asserting that
every `ETGO_SF_FIELD` row satisfies `mapVisibility(visibility) == (isincluded, isreadonly)`, so the
state is detected the next time it appears instead of after 22 rows accumulate. Per CLAUDE.md that
rule is implemented in `schema_forge_core` and documented in
`docs/pipeline-validator-reference.md`, which is canonical.

#### 5.3.1 The guard as built — **F23, 2026-08-13**

Built as validator rule **F23**, and building it changed three things about the finding.

**It reads the exported XML, not the DB.** The validator runs without DB access by design, so the
only DB-free view of pushed state is `com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_*.xml`.
That makes F23 the one rule reading state from outside the repo, and the one rule whose verdict can
move with no commit at all. It also makes it **inert — no violation, no `skipped` entry — without a
runtime-module checkout**: a per-artifact skip would print 50+ identical lines for one repo-global
reason, and the cost of that choice is that a silent F23 and a clean F23 look the same. Verified
against the live DB the same day: XML and DB agree exactly (0 / 409 / 6468), so the XML is a faithful
proxy here.

**The invariant splits into two classes, and only one of them can block.** §2.1's query carries
`WHERE f.visibility IS NOT NULL`, so the 22 rows it found are all *contradictions* — a curated value
projecting to a pair other than the one stored. The larger population is the opposite shape:
`visibility` never written at all while the flags say included. So F23 **BLOCKs** contradictions
(only a writer bug or a hand-edit reaches that state) and **WARNs** the unwritten rows (the runtime is
unaffected; `neo_schema` just reports no visibility, so an agent cannot tell `readOnly` from
`system`). Had it been one BLOCKing rule it would have gone red on 409 rows on day one and been
skipped within a week.

An absent `visibility` on a *closed* row is deliberately **not** reported: `N`/`N` **is**
`mapVisibility(null)`. The ETP-4793 `exclude: true` fix produces exactly those rows, and there is a
test pinning that so a future tightening cannot quietly make 398 correct rows look like debt.

**Measured 2026-08-13, DB and XML agreeing:** **0 contradictions** — §2.1's query now returns 0 rows,
so the 22 are gone — and **409 unwritten rows across 6,468 active**, in only **6 specs**
(`return-to-vendor` 219, `return-from-customer` 121, `purchase-invoice` 31, `sales-order` 30,
`bp-location` 6, `warehouse` 2).

Two things that concentration exposed, neither of which was visible before the rule existed:

1. **340 of the 409 rows — 83 % — are inside `aggregate` artifacts,** not windows. F23 was first
   registered for `kind === 'window'` only, which is the obvious reading of "a rule about pushed
   fields", and it reported 69 of 409. An aggregate pushes its own `ETGO_SF_SPEC` and its field rows
   drift identically. F23 is now registered for `window`, `aggregate` and `aggregate-section`, and
   reports 409/409. Worth generalising: any future rule about *pushed* state must be registered for
   every artifact kind that pushes, and "it fired, so it works" is not the check — "it fired on the
   population I measured independently" is.
2. **105 field rows carry no `AD_COLUMN_ID`, no `JAVA_QUALIFIER` and no `SEQNO`** — only the two
   flags — split `sales-order` 56 / `purchase-invoice` 49, with **61 of them at `ISINCLUDED='Y'`**.
   A field row pointing at no AD column cannot resolve to anything at runtime. This is a *different*
   defect from the visibility skew and is **not** registered here; it is noted so it is not lost, and
   whether it earns a registry item is the user's call (§2.2 — a run does not widen the quota).
   F23 labels these rows by primary key rather than emitting `entity.undefined`.

**One copy of the projection, not three.** `mapVisibility` existed twice — exported from
`push-to-neo.js`, inlined into `lib/neo-delta.js` to dodge a circular import — and F23 would have
been a third. A validator that re-implements the projection cannot detect a drift *in* the
projection, which is the whole point of the rule. It now lives in `cli/src/lib/field-visibility.js`
alongside `visibilityMatchesFlags()`; `push-to-neo.js` re-exports it (public API), `neo-delta.js`
imports it, F23 imports it. Same lesson as IMP-27 §5.4, reached from the other direction.

**Not done by this guard:** §5.3's writer-side choice. F23 detects the state; it does not stop
`populateSpec` producing it. The 409 rows stay until a re-push revisits those fields, and the
"stop resetting the flags" change with its load-bearing blast radius is still open.

### 5.4 What is explicitly *not* the fix

Making the MCP read `isincluded`/`isreadonly` instead of `visibility`. That would silence the
symptom and lose the distinction the column exists for — `system` and `readOnly` are the same `Y/Y`
pair, and an agent needs to know whether a field is *displayed to it but not editable* or *filled by
the server and not its business*. `McpQuerySupport` already reads the projection where it needs a
gate; the schema view needs the source.

## 6. Why IMP-27 waits on this

IMP-27's proposal has `I` (inherit) as its default: a per-field MCP override that, unset, behaves
exactly as today. **`I` cannot inherit from a source that disagrees with itself.** Shipping the
override first would layer a new axis on top of an inconsistency and make both harder to reason
about — and the first bug report would be indistinguishable from this one.

## 7. Registration cost a quota re-base

When this file was written the registry had known scope (97) equal to the quota (97) exactly, and the
rule is explicit: **a run cannot register a new IMP without the user re-basing the quota** — *"A run
that finds a new defect and has no room for it must stop and say so rather than quietly widening the
denominator."* So the write-up existed for a while and the registry row did not.

**Re-base authorised by the user on 2026-08-12**, registering this item together with IMP-27: known
scope 97 → 105, quota 97 → 126, **Delivery 51 → 39 and MARI 73 → 70 on unchanged earned (49.0)**.

Three notes, because the price is easy to misread:

- **The drop bought nothing, and that is correct.** No code shipped and no status moved. MARI fell
  purely because two known defects stopped being unrecorded — the same reading the registry insists
  on for the 2026-08-06 fall from 40 to 30.
- **Closing this item does not repay it.** ✅ here takes earned to 54 and MARI to ~71, not back to
  73; a Delivery of 51 against 126 needs ~15 points of closed work, not the 5 this item weighs. That
  asymmetry is structural to a frozen denominator and is why Delivery is capped at 25 % of the index.
- **Folding it into IMP-11 was considered and refused.** Same column, and IMP-11's uncurated fields
  are the `visibility IS NULL` population this query excludes — but IMP-11 is *absence* of curation
  and this is *disagreement between two writes of it*. Folding would have hidden a P1 inside a P2 and
  kept the headline at 73, which is the outcome the quota rule exists to prevent.

## 8. Done when

- The §5.1 dry-run has settled the cause and is recorded here.
- The query in §2.1 returns **0 rows**. — measured 0 on 2026-08-13, in the DB and in the exported
  XML independently (§5.3.1). Note what this does *not* cover: that query only sees the
  contradiction class, and 409 rows of the unwritten class remain.
- `neo_schema` on `tax` no longer reports `userRequired:true` for `name` / `rate` / `validFromDate`,
  and `taxExempt` / `notTaxable` are either genuinely excluded from NEO or no longer reported
  `discarded` — the two stacks agreeing is the assertion, not either one's value.
- The recurrence guard is in place, with its blast radius (§5.3) checked rather than assumed.
  — the **detection** half is built and measured (F23, §5.3.1). The **writer** half of §5.3 is not:
  `populateSpec` still produces unwritten rows, so this box is partly, not wholly, ticked.
