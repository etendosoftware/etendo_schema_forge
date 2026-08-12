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
* **(viii) `processNow` is a third alias of `documentAction`, and it is the one invokable action that
  still misleads.** Found by the live verification in §6, not by the code read. `Processing` and
  `DocAction` both point at `processId` `111` ("Process Invoice"), but `Processing` is a bare Yes/No
  trigger: no `actionValues`, no `actionParameter`, no `agentPrompt`, and therefore
  `businessCritical:false` from §3.3, whose derivation keys on the `docAction` binding that
  `Processing` does not have. So of the four actions the catalog now presents as callable, three are
  honestly described and the fourth invites an agent to fire the invoice-processing process with no
  document action attached and no warning. **What actually happens when it is fired was not tested** —
  that is a write against a real invoice and needs its own authorization. Two candidate answers, and
  they need different fixes: if `Processing` is a legacy internal flag that should never have been
  exposed, it belongs curated out like the other 17; if it is a real entry point, it needs the
  derivation to reach it. Do not widen §3.3 to cover it before knowing which — a derivation keyed on
  "shares a `processId` with a `docAction` button" is a guess dressed as structure.
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

* **It surfaced defect (viii)** — `processNow` shares `processId` `111` with `documentAction` and is
  callable, undescribed and unflagged. See §5. Fixing it needs a product answer first.
* **M4 is not re-measured.** The assertion that moves it is now true in the payload, but the metric
  is scored by `/mcp-comparison`, which has not been re-run — so this item's score stays at 0/3
  until it is. Status and score move on different evidence.

Also owed, and unrelated to the deploy: the MCP client is still serving the **pre-change
`tools/list`** — the `view` enum description it advertises is the old text, without the `invokeVia`
caveat or `invokableCount`. The server payload is current, so this is client-side tool caching, and
it needs a client reconnect to confirm — the same reconnect already owed for the five retired
`generate_*` tools.
