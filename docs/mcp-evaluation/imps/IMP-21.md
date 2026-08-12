# IMP-21 — Curate the actions catalog

**Registry row:** `mcp-improvements-registry.md` → IMP-21 (P2, C3, 0 / 3, `com.etendoerp.go` +
`schema_forge`).
**Registered:** 2026-08-06 run (§5), from evidence **B7**; re-confirmed 2026-08-10 from **C16**.
**Status:** implemented 2026-08-12. All three registered clauses closed in the generic layer, plus
four defects the row never named. Not yet verified live (§6).

Status lives only in the registry; this file describes the work.

---

## 1. What the registry cell said, and what the live catalog says

The cell read: *"13 of 19 labels are raw column names (`RM_ReceiveMaterials`); 10 buttons flagged
`required:true`; `businessCritical:false` on `documentAction` and `posted`"*, re-confirmed
2026-08-10 on a catalog that had grown to 22 actions.

Every clause holds in direction. Two of the three counts are stale, and the third understates the
defect by a factor of eleven.

| # | Clause | Registered | Measured 2026-08-12 on `sales-invoice/header` |
|---|--------|-----------|-----------------------------------------------|
| (i) | raw column-name labels | 13 of 19, then 3 of 22 | **3 of 22** — `EM_Psd2_Generate Bank Payment`, `EM_Aeatsii_Dup`, `EM_Aeatsii_Unsubscribe` |
| (ii) | buttons flagged `required:true` | 10, then 8 | **10 of 22** |
| (iii) | `businessCritical:false` on `documentAction` and `posted` | 2 actions | **all 22** — and on every button column in the instance |

Clause (iii) is the one worth restating. `businessCritical` is not merely uncurated on the two
consequential actions: `SELECT count(*) FROM etgo_sf_field f JOIN ad_column c USING (ad_column_id)
WHERE c.ad_reference_id = '28' AND f.isbusinesscritical = 'Y'` returns **0**. The flag has no
producer for buttons anywhere, so it never discriminated — it was emitted `false` 22 times out of
22. That is not a neutral default. `businessCritical:false` reads as *"nobody needs to think before
firing this"*, which is the opposite of true for the two actions that change a document's legal and
accounting state.

### 1.1 Four defects the cell never named

Reading the live catalog rather than the cell surfaced four more, and the first is larger than any
of the three registered:

| # | Defect | Count |
|---|--------|-------|
| (iv) | actions curated `visibility:"discarded"` and still advertised `invokeVia:"neo_action"` | **17 of 22** |
| (v) | an action advertised as callable with no `processName`/`processId` at all (`createLinesFrom`) | 1 |
| (vi) | two actions with identical semantics and nothing saying which to use (`aPRMProcessinvoice` duplicates `documentAction`: same 12 `actionValues`, same `actionParameter:"docAction"`, different `processId`) | 1 pair |
| (vii) | `agentPrompt` on `documentAction` only; `posted` — the other business-critical action — has none | 21 without |

(iv) is the defect that makes the catalog unusable rather than merely rough. An agent asking
`neo_schema({view:"actions"})` was handed 22 entries all claiming `invokeVia:"neo_action"`, with no
signal separating the handful the window actually exposes from the 17 that curation had deliberately
put out of scope. `visibility:"discarded"` was present on each of the 17 — the truth was in the
object — but it sat next to a contradicting claim, and a field-visibility value designed for form
fields is not where an agent looks to decide whether a button is callable.

---

## 2. Where each catalog field comes from

Before deciding what to fix and where, the producers. All of them are in
`McpSchemaFieldBuilder.buildSchemaField` / `addButtonInfo`; `McpActionsView` is a pure filter over
their output and produces nothing of its own (IMP-6).

| Catalog key | Producer | Why it was wrong for a button |
|---|---|---|
| `label` | `col.getName()`, overlaid by `applyCuratedLabels` from `AD_Field.name` | A module-contributed button has **no `AD_Field` in the tab**, so the overlay never fires and the label is the machine name the module author typed |
| `required` | `col.isMandatory()` | The AD column's NOT NULL flag. A button carries no payload value, so this says nothing about what the agent must send |
| `userRequired` | `addVisibility`, `editable && mandatory` | Honest, and therefore in direct contradiction with `required` on the same object |
| `businessCritical` | `ETGO_SF_FIELD.isBusinessCritical` | `N` on every button column in the instance — no producer (§1) |
| `visibility` | `ETGO_SF_FIELD.visibility` | Correct, but the actions view ignored it |
| `invokeVia` | written unconditionally in `addButtonInfo` | A claim asserted without checking either of the two things that make it false |
| `processName` / `processId` | `col.getProcess()` / `col.getOBUIAPPProcess()` / `NeoAccessHelper.resolveFallbackObuiappProcess` | Correctly omitted when nothing resolves — but `invokeVia` was emitted anyway |
| `actionValues` / `actionParameter` | `addActionValues`, from `AD_Reference_Value` | Correct; deliberately the full active AD list — see the `addActionValues` javadoc |

The `required`/`userRequired` pair is the shape of the whole item: the catalog was not short of
information, it was carrying a second, unearned assertion beside the honest one. Fixing it is mostly
subtraction.

---

## 3. What was fixed, and where

The registry scopes this item to `com.etendoerp.go` **+** `schema_forge`, which is the right split —
but not evenly. Five of the seven defects are producer bugs in the generic Java layer: nothing
about them is per-window judgement, and fixing them per-window would mean re-deciding the same thing
89 times. Only (vi) and (vii) are genuine curation, and §5 keeps them open rather than guessing.

### 3.1 `required` is not emitted on buttons — clause (ii)

`buildSchemaField` now skips the key entirely for `type:"button"`, and passes `!isButton &&
col.isMandatory()` into `addVisibility` so `userRequired` cannot be derived from a flag that no
longer applies.

Not "set it to `false`". A button has no payload slot, so both values are wrong; the honest report is
the absence of the key. This also removes the contradiction rather than moving it — `userRequired`
stays where it was and no longer has a neighbour disagreeing with it.

### 3.2 `invokeVia` is a claim, not a decoration — clauses (iv) and (v)

`addButtonInfo` takes the curated `visibility` and emits `invokeVia:"neo_action"` only when the
button really is invokable. Otherwise it emits `invokable:false` plus a machine-readable
`notInvokableReason`, for one of two causes, in the order an agent cares about:

```java
if (VISIBILITY_DISCARDED.equals(visibility)) {
  blocker = "discarded: this action is not part of the curated agent surface for this window";
} else if (!hasProcess) {
  blocker = "no process: the AD button column has no process wired behind it";
}
```

Three decisions inside that:

* **The action stays in the catalog.** Knowing an action exists but is out of scope is useful — it
  stops an agent hunting for a capability the window genuinely lacks, and it keeps
  `neo_schema({view:"actions"})` a description of the window rather than of the curation. Being told
  an action is callable when it is not is the only unrecoverable case, and that is what changed.
* **An uncurated button (`visibility == null`) with a process stays invokable.** Absence of curation
  is not a decision to exclude, and treating it as one would silently retire actions on the 89
  entities IMP-11 counts as uncurated. This is also the pre-IMP-21 behaviour, so nothing regresses
  on an unconfigured window.
* **`discarded` is reported before `no process`.** They can both hold; the curation is the more
  informative answer, because it tells the agent a human decided this, not that AD is incomplete.

`neo_action` itself is unchanged. This clause corrects what the catalog *claims*, and deliberately
does not add a runtime gate — a gate would be a behaviour change on a path the React UI also drives,
and the defect registered here is a description defect.

### 3.3 `businessCritical` is derived when curation left it blank — clause (iii)

Curation still wins; the derivation only fills the gap, and never clears a flag someone set:

```java
isBusinessCritical = isBusinessCritical || isCriticalAction(fieldObj, dbColName);
```

`isCriticalAction` is true for two structural properties of core AD, not per-window judgement:

* the button carries `actionParameter` — i.e. it is bound to the shared `docAction` list reference,
  which is precisely what makes it drive the document state machine;
* the column is `Posted`, the accounting trigger present on every accountable document.

Both are readable off the column, hold on every document window in the instance, and stay true when
`ETGO_SF_FIELD` is empty. That is the test for "belongs in the generic layer" that
`McpSchemaFieldBuilder`'s own comment at `addActionValues` sets: *which* `docAction` value is legal
in a given state is per-window judgement and travels in `agentPrompt`; *that* a `docAction` button is
consequential is not.

Deliberately narrow. An ordinary process button (`CopyFrom`, `Calculate_Promotions`) is not promoted
— a derivation that flagged everything would fail the same way `false`-on-everything did, in the
other direction.

### 3.4 The label fallback chain — clause (i)

`applyActionLabelFallback` fires only when the **column name** starts with `EM_`, which is exactly
the module-extension case where no `AD_Field` exists to overlay. Core buttons are untouched because
their column names are already functional (`"Copy from"`, `"Document Action"`), and any button that
*does* have an `AD_Field` is overwritten afterwards by `applyCuratedLabels` at
`McpToolRouter:908` — which runs before the actions view, so the precedence is:

```
curated AD_Field label  →  process name  →  EM_<module>_ stripped from the column name
```

The process name comes second because it is a label a human wrote *for this action*;
`humanizeExtensionColumn` is the last resort and is mechanical (`EM_Psd2_Generate Bank Payment` →
`Generate Bank Payment`). It returns `null` rather than an empty string when nothing survives
stripping (`EM_Aeatsii_`), so the caller keeps the raw name instead of showing the agent a blank
action.

### 3.5 `invokableCount` — the summary an agent reads first

`McpActionsView.buildResponse` now emits `invokableCount` beside `actionCount`. Same pure-filter
property as the rest of the view: it counts the entries carrying `invokeVia` and performs no DAL
access.

It exists because per-action honesty is necessary but not sufficient. With 22 entries the split is
only visible by walking the array, and the count is what turns "here are 22 actions" into "here are
22 actions, most of which are not yours to fire" without the agent doing the arithmetic.

### 3.6 What (vi) got for free

`aPRMProcessinvoice` — the duplicate of `documentAction` — is curated `discarded`, so under §3.2 it
now reports `invokable:false` while `documentAction` keeps `invokeVia`. The ambiguity the defect
describes ("nothing says which to use") is answered as a side effect: one of the two is callable and
the other says why it is not. The underlying duplication in AD is untouched, and §5 keeps it open.

### 3.7 A button AD itself hides is not an action — clause (viii)

Added after the §6 live verification, which is what surfaced the defect: the fix above left a
misleading entry in the catalog — one that the analysis noticed, and, as §6.1 found, a second it did
not. `processNow` came back `invokeVia:"neo_action"` carrying no
`actionValues`, no `actionParameter`, no `agentPrompt` and `businessCritical:false` — and it points
at the **same** `AD_Process` as `documentAction`:

```
columnname | ad_process_id |     process     |  procedurename
DocAction  | 111           | Process Invoice | C_Invoice_Post0
Processing | 111           | Process Invoice | C_Invoice_Post0
```

So the catalog offered two doors to the invoice-processing process, one with a paragraph of
instructions and one with nothing, and no way to tell they were the same door. AD already answers
which is which:

```
window                 | field           | isdisplayed
Sales Invoice          | Process Invoice | N
Purchase Invoice       | Process Invoice | N
Business Partner Info  | Process Invoice | N
```

`Processing` is the classic procedure's internal "in progress" flag and is hidden in **every** window
that has a field for it, while `DocAction` and `Posted` are `isDisplayed='Y'` in both invoice
windows. `addInvokability` therefore gained a third blocker: a button whose `AD_Field` in this tab is
`isDisplayed='N'` reports `invokable:false` with a `hidden:` reason. Instance-wide there are 133
hidden button field-rows over 76 distinct columns against 369 displayed over 288.

Three things make this belong in the generic layer rather than in `decisions.json`:

* **It is structural.** That a button the UI never renders is not a user action is a fact about AD,
  on exactly the footing as §3.3's `docAction` binding — not per-window judgement.
* **Curation could not carry it anyway.** `Processing` *is* curated — as `system`. That value means
  "the server fills this, do not ask the user", a statement about a payload value which says nothing
  whatsoever about a button. This is the same category error §3.2 found with `discarded`: a
  visibility vocabulary designed for form fields, applied to buttons, where `discarded` happened to
  be the only value that meant anything. Curating `processNow` to `discarded` would have fixed one
  window and left the pattern intact on the other 88.
* **A missing `AD_Field` is deliberately *not* hidden.** Module-contributed buttons routinely have
  no tab field — that is the case §3.4's fallback exists for — so only an explicit `isDisplayed='N'`
  blocks. The opposite reading would have silently retired most module actions in the instance.

`discarded` is still reported ahead of `hidden`, on §3.2's reasoning: it tells the agent a human
decided this.

---

## 4. Blast radius

`neo_schema`'s default full-field dump changes for button fields only: `required` disappears,
`invokeVia` becomes conditional, `businessCritical` can now be `true`, and `EM_*` labels improve. No
non-button field changes in any way.

* **`view:"create"`** — unaffected. `McpSchemaCreateView` already excludes buttons ("Buttons are
  actions, not payload — they belong to `view:"actions"`"), so it never read the keys that moved.
* **`McpResourceProvider`** — unaffected. It builds its own field JSON and borrows only
  `mapColumnType`/`mapSelectorType` from this class.
* **NEO REST / the React UI** — untouched. Nothing in this change is on the REST path; the UI reads
  buttons from its own metadata, not from `neo_schema`.
* **`neo_action`** — untouched (§3.2).

### 4.1 Tests

`addButtonInfo`'s signature gained the `visibility` argument, so seven reflective call sites in
`McpSchemaFieldBuilderTest` were updated. Three assertions were **rewritten rather than deleted**,
per the coverage-gate rule, and each rewrite guards the new behaviour at the exact point the old one
asserted the defect:

* `buttonColumnWithNoProcessEmitsOnlyTrigger` → `buttonColumnWithNoProcessIsNotInvokable`. The old
  name is worth keeping in mind: it asserted `invokeVia:"neo_action"` on a button with no process,
  i.e. it *pinned* defect (v).
* `buildSchemaFieldButtonIncludesTriggerValue` now also asserts `required` is absent.
* `buttonWhoseListLookupReturnsNullOmitsActionValues`'s "the rest is still emitted" assertion moved
  off `invokeVia` (which correctly no longer appears) onto `triggerValue`/`action`.

15 tests added: 5 on invokability and the label chain, 4 on the `businessCritical` derivation
(including "curated flag still wins" and "a plain process button is not promoted"), 4 on
`humanizeExtensionColumn` (including the degenerate inputs), 2 on `invokableCount`.

**§3.7 added 9 more** and migrated the 12 `addButtonInfo` reflective call sites to its fourth
parameter. Two cover the blocker itself (`buttonHiddenInTheTabIsNotInvokableEvenWithAProcess`, and
`discardedTakesPrecedenceOverHiddenInTheReason` for the both-blockers case); seven pin
`isHiddenButtonField`, and the load-bearing one is `columnWithNoTabFieldIsNotHidden` — the inverse
reading of that case would silently retire most module-contributed actions in the instance, which is
the one way this fix could do real damage. The rest cover the displayed case, an inactive field, a
field with no column, case-insensitive matching and a null tab.

---

## 5. Left open, deliberately

* **(vii) `agentPrompt` on the other actions.** `documentAction`'s prompt is the model — it names the
  preconditions for `CO`, warns that `RE` unposts, and explicitly says the `AP/PR/RA/RC/RJ/XL`
  values *"come from the shared AD list and are not part of this window's flow"*. `posted` has
  nothing, and it is now flagged `businessCritical` by §3.3, which makes the gap more visible rather
  than less. This is per-window prose and belongs in `decisions.json`; the generic layer cannot
  produce it.
* **(vi) the AD duplication itself.** §3.6 removes the ambiguity for an agent without deciding
  whether `aPRMProcessinvoice` should exist. Separately, `posted` shares `processId`
  `57496FB9CF9E4E8F847224017941570E` with `etblkpBulkposting` — the same process reached through two
  buttons — which is worth a look on its own.
* **(viii) — closed by §3.7, not left open.** It was recorded here first, from the §6 verification,
  as a product decision between curating `processNow` out and widening §3.3's derivation to reach it.
  Neither was right: AD already marks the column hidden in all three windows that expose it, so the
  answer was structural and generic. What *firing* `processNow` actually does is still untested —
  that is a write against a real invoice — but it no longer matters for the catalog's honesty, since
  the action is no longer advertised as callable.
* **The AD duplication behind (viii).** `Processing` and `DocAction` sharing `AD_Process` `111` is
  core Etendo, not something this work introduced or should change. §3.7 stops the MCP surface from
  presenting it as two independent actions; it does not deduplicate AD.
* **Which of the 17 discarded actions should be promoted.** With §3.2 the 17 are now honestly
  reported as out of scope, which is a true statement about the current curation — not a claim that
  the curation is right. Several are plausible agent capabilities (`aPRMAddpayment`,
  `EM_Aeatsii_Send`, `EM_Tbai_Xmlgenerator`), and promoting one is a product decision per window,
  not a defect to fix here. Recorded rather than guessed.
* **The other 88 entities.** Every measurement above is `sales-invoice/header`. The fixes are
  generic and unconditional, so they apply everywhere, but no other catalog was read.

## 6. Verified live — 2026-08-12

Read back from the deployed instance, `neo_schema({spec:"sales-invoice", entity:"header",
view:"actions"})`. All four owed assertions hold:

| Owed | Result |
|---|---|
| `actionCount:22`, `invokableCount` well below it | **`22` / `4`** — the four are `processNow`, `posted`, `documentAction`, `generateTo`: exactly the non-discarded buttons that have a process |
| the three `EM_*` labels gone | **gone** — `Generate Bank Payment`, `SII duplicated invoice correction`, `SII Unsubscribe Invoice`. No label in the catalog begins with `EM_` or `RM_` |
| no action carries `required` | **none of the 22** |
| `documentAction` and `posted` → `businessCritical:true` | **both true**, and `aPRMProcessinvoice` with them — **3 of 22**, so the derivation discriminates instead of flagging everything, which was the design constraint in §3.3 |

The two unregistered defects the fix targeted are closed in the response: `createLinesFrom` reports
`invokable:false` with `"no process: the AD button column has no process wired behind it"`, and the
17 discarded actions each carry the `discarded:` reason. §3.6 landed as predicted — of the
`documentAction` / `aPRMProcessinvoice` pair exactly one is callable and the other says why it is
not, and the same holds for the `posted` / `etblkpBulkposting` pair that shares a `processId`.

Two things this verification did **not** settle:

* **It surfaced defect (viii)**, which §3.7 then fixed — so §3.7 was itself unverified at the time
  this section was written. The owed re-probe was pre-specified here as: `processNow` must come back
  `invokable:false` with a `hidden:` reason, `invokableCount` must drop 4 → 3, and the other three
  (`posted`, `documentAction`, `generateTo`) must be untouched. The risk to watch is over-reach — a
  button that AD displays but that the code treats as hidden would silently retire real actions,
  which is why §3.7 treats a missing `AD_Field` as *not* hidden and why the test suite pins that case
  explicitly. **Settled in §6.1 — where the pre-specified count turned out to be the wrong number.**
* **M4 is not re-measured.** The assertion that moves it is now true in the payload, but the metric
  is scored by `/mcp-comparison`, which has not been re-run — so this item's score stays at 0/3
  until it is. Status and score move on different evidence.

Also owed, and unrelated to the deploy: the MCP client is still serving the **pre-change
`tools/list`** — the `view` enum description it advertises is the old text, without the `invokeVia`
caveat or `invokableCount`. The server payload is current, so this is client-side tool caching, and
it needs a client reconnect to confirm — the same reconnect already owed for the five retired
`generate_*` tools.

### 6.1 §3.7 re-probe — 2026-08-12, and a wrong prediction

Same call after the redeploy. The catalog is now `actionCount:22`, **`invokableCount:2`** — not the
3 predicted above.

| Action | Result | Blocker reported |
|---|---|---|
| `processNow` | `invokable:false` | `hidden:` — the target of §3.7 |
| `generateTo` | `invokable:false` | `hidden:` — **not predicted** |
| `createLinesFrom` | `invokable:false` | `no process:` — reached the *third* blocker, so the missing-`AD_Field` guard held |
| `posted` | `invokeVia:"neo_action"` | — |
| `documentAction` | `invokeVia:"neo_action"` | — |
| the other 17 | `invokable:false` | `discarded:` — still reported ahead of `hidden` |

**The number was wrong, not the fix.** The 4 → 3 prediction was written having checked
`isDisplayed` only for `Processing`. AD says the same about `GenerateTo`, in all three windows that
have a field for it:

```
columnname | window                 | tab              | isdisplayed
GenerateTo | Sales Invoice          | Header           | N
GenerateTo | Purchase Invoice       | Header           | N
GenerateTo | Business Partner Info  | Partner Invoices | N
Processing | Sales Invoice          | Header           | N
Processing | Purchase Invoice       | Header           | N
Processing | Business Partner Info  | Partner Invoices | N
```

So `generateTo` ("Generate Receipt from Invoice") was advertised as callable by an agent on a button
no Etendo UI has ever rendered. It is the same defect as `processNow`, found by the fix rather than
by the analysis — which is the outcome a generic fix is supposed to produce and a per-window curation
would not have.

The over-reach test the prediction was really guarding is the one that passed: every button AD
*displays* is still callable. `posted`, `documentAction` and `copyFrom` all have `isDisplayed='Y'`
fields, and none of them is reported `hidden` — `copyFrom` stops at `discarded:`, which is the
curation talking, not this change. `createLinesFrom` has **no** `AD_Field` at all and falls through
to `no process:`, which is the `columnWithNoTabFieldIsNotHidden` guard demonstrated live.

One process-note worth keeping: the query behind the wrong prediction filtered `AD_Column.name`
(the human label — `Process Now`, `Generate To`) instead of `AD_Column.columnname`. It returned one
row where six exist, and `Posted` only appeared because its label and column name happen to match.
Cheap mistake, and it is why the assertion was pre-registered — the number being wrong was visible
in one call instead of becoming a belief.
