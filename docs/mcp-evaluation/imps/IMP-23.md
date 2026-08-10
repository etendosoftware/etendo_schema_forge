# IMP-23 — `neo_batch` is not atomic

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C4, 0 / 5, ♻️ behavioural |
| **Specification** | [post-audit 2026-08-10](../mcp-comparison-post-audit-2026-08-10.md) §5.2 |
| **Evidence** | **C9** (FK failure, nothing persisted — inconclusive) and **C10** (281-char description against `c_order.description varchar(255)`: `committed:false` returned **and** order `1000027` persisted) |
| **Repo** | `com.etendoerp.go` |
| **Registered** | 2026-08-10, after a fourth reproduction |

## 1. The mechanism, read out of the code

The registry's one-line diagnosis is correct and this file confirms it by reading, not by inference.
The chain is four calls deep and only the last one is ours:

| Step | Where | What it does to the transaction |
|---|---|---|
| `McpToolRouter#handleBatch` | `McpToolRouter.java:988` | opens nothing; delegates |
| `BatchService#executeBatch` | `BatchService.java:218` | loops the ops, then **one** `commitAndClose()` at the end (`:239`), `rollbackQuietly()` on failure (`:232`) — *this code is correct* |
| `BatchService#createRecord` → `NeoCrudHandler#handleDefault` → `executePostCreate` | `NeoCrudHandler.java:539` | `jsonService.add(params, wrappedBody)` |
| `DefaultJsonDataService#update` (core) | `modules_core/org.openbravo.service.json/…:1152` | **`OBDal.getInstance().commitAndClose()` on every successful call** |

`add()` is a one-line delegate to `update()` (`:1007`), and `update()` ends its success branch with an
unconditional `commitAndClose()`. So **each op commits itself.** By the time op *n* fails,
ops *1…n−1* are already durable, and `BatchService`'s own `rollbackQuietly()` is rolling back a
session that contains nothing.

The converter-error branch is worse in the same direction: core calls
`OBDal.getInstance().rollbackAndClose()` itself (`:1060`), so a validation failure inside op *n*
closes the session out from under the batch before `BatchService` gets to decide anything.

**The bug is not in `BatchService`.** Its javadoc claim — *"runs them all in one OBDal transaction …
either commits everything or rolls back everything"* — was true of the code it wrote and false of the
code it calls.

### 1.1 Why three earlier runs saw it as intermittent

Confirmed at the source, and it is exactly the discriminator §5.2 isolated:

* A **FK-resolution** failure is caught by `McpToolRouter#resolveBatchFkNames` (`:1090`), which runs
  *before* `executeBatch` is ever called. Nothing has been persisted, so the batch really does look
  atomic (C9).
* A **persist-time** failure — a value the DAL accepts and Postgres does not, like the 281-char
  description — happens inside op *n*'s `add()`, after op *n−1*'s `add()` already committed (C10).

So the defect is invisible to exactly the probes an agent is most likely to trip first.

### 1.2 The blast radius is wider than MCP

`neo_batch` and the REST endpoint `POST /sws/neo/batch` share `executeBatch` verbatim. The REST one
is what the React invoice-scan ingest uses, and `BatchService`'s own javadoc names its purpose as
*"ingest a multi-record document atomically"*. **That path is non-atomic for the same reason and has
been since it shipped** (`c56628f0`, ETP-3590). This file records that; whether the UI path is
fixed in the same change is the §4 decision.

## 2. There is no supported way to stop the commit

Checked rather than assumed, because the cheap fix would be to ask core not to commit:

| Candidate | Verdict |
|---|---|
| A parameter on `add()` | none. The commit is unconditional in the success branch |
| `SessionHandler#setDoRollback(true)` | **no.** `doRollback` is only read by `DalThreadHandler` at thread end; `commitAndClose` never consults it (`SessionHandler.java:765`) |
| `commitAndStart()` / savepoints | not exposed for this; `commitAndClose` closes the connection outright (`:648`) |
| `TriggerHandler.disable()` | makes `commitAndClose` **throw** (`:602`) — a landmine, not a switch |

So the commit is a fixed property of the core datasource write path. Any real atomicity fix has to
avoid that path, not configure it.

What *is* available: `DefaultJsonDataService` is a plain public class and its `doPreAction` /
`doPostAction` hooks are `protected`, so a subclass can reuse them. That is what makes §4's option B
merely expensive rather than impossible.

## 3. The information the agent needs is already in memory, and is thrown away

This is the finding that changes the cost of the honest fix.

`processOperation` appends every successful op to `opResults` (`BatchService.java:312–316`). On
failure, `executeBatch` calls `failureBody(...)` — which builds a fresh object and **never looks at
`opResults`** (`:348`). Every id the batch committed is sitting in that array at the moment the
response is built, and the response drops it.

So today's answer to C10 is not merely incomplete, it is actively misleading: the agent is told
`committed:false` and given `failedAt`, with no hint that order `1000027` exists. It has no reason to
look for it — and *did not*: the 2026-08-05 run's orphan header `1000017` survived undeleted for five
days for precisely this reason, which is how this defect defeats the benchmark skill's own cleanup
discipline.

## 4. The three ways out

The registry row's own wording — *"Make `neo_batch` atomic, **or** stop documenting it as atomic"* —
admits either direction. They are not mutually exclusive and they are not the same size.

### Option A — report the truth (small, no regression surface)

Thread `opResults` into `failureBody` and return it as `persisted:[{id, recordId}]`, alongside a
`atomic:false` / `hint` telling the agent those records exist and are its to clean up. Fix the tool
description and `docs/neo-headless.md` to stop promising all-or-nothing.

* Closes the *agent-facing* half of the defect: an agent that gets the ids can delete them, retry, or
  continue from where the batch stopped. Today it cannot do any of the three.
* Zero behaviour change on the success path, so nothing shipped can regress.
* Does **not** make the batch atomic. A caller who needs atomicity still does not get it.

### Option B — actually make it atomic (real fix, real risk)

Subclass `DefaultJsonDataService` with an `addNoCommit` that replicates `update()`'s success branch
minus the `commitAndClose()`/`rollbackAndClose()`, delegating to the inherited `protected` hooks, and
route `NeoCrudHandler` through it when a batch owns the transaction. `BatchService` then really does
hold the single commit it already believes it holds.

* This is the fix the item asks for, and it fixes the React ingest path (§1.2) at the same point.
* Cost: ~90 lines of core's `update()` body forked into this module, which will drift silently on a
  core upgrade — a signature change breaks the build, a behaviour change does not.
* Risk: it changes the persistence internals of a shipped feature (invoice-scan ingest) that has no
  automated integration coverage, and the batch loop would newly hold an open transaction across
  callout cascades and business-event handlers.
* Incomplete on its own anyway: a handler in the batch can still commit behind our back —
  `AbstractInvoiceHeaderHandler`'s completion path goes through `ProcessInvoiceUtil#process`, which
  commits internally by design.

### Option C — documentation only

Already partly done in `etendo-go-docs` (`18eb0dd`). Necessary in both A and B; sufficient in
neither, because the response itself is what misleads.

## 5. Recommendation

**A now, B afterwards — under this same item, not a new one.**

A is provably correct from §3 — the data already exists, the change is to stop discarding it — and it
converts an unrecoverable failure into a recoverable one, which is the whole of what an agent needs.
B is a genuine improvement and a genuine regression risk on a UI feature this item never mentioned;
bundling the two into one change would make a P1 agent-ergonomics fix wait on a core-fork review, and
would put the invoice ingest path in the blast radius of a change nobody asked for.

### 5.1 Correction — B does not need its own IMP number

This section originally read *"A now, B as its own item."* **That recommendation was obsolete the
moment A was implemented, and it was wrong on the registry mechanics.**

The reason it gave was scope-of-review: don't make a P1 ergonomics fix wait on a core fork. That
reason is *satisfied*, not pending — A shipped as its own commit, reviewable on its own. What is left
is a sequencing question, and sequencing does not need a second row.

It also would have cost MARI for nothing. This item's own title is *"Make `neo_batch` atomic, **or**
stop documenting it as atomic"* — B is the first clause. Doing it here takes this row from ⚠️ (0.5)
to ✅ (1.0): **+2.5 earned points, known scope and quota untouched.** Registering it separately adds
5 points of P1 scope against a known scope that already equals the quota exactly (97, registry §2.2),
forcing a re-base to `102 × 1.20 = 122` — the same earned points against a larger denominator, so
Delivery falls 51 → 40, MARI 73 → ~70, and the scope-closed ceiling 92 → ~88. Same code, same fix,
three points worse, purely from where the row was filed.

So: **B closes IMP-23; it does not open IMP-26.** The discovery-reserve conversation registry §2.2
demands is therefore not triggered by this work at all.

### 5.2 Why B waits for A to be verified live rather than following it immediately

Not a cost argument — a verifiability one, and it is the same wall §2 hit from the other side.

**No test in this repo can observe B working.** The per-op commit lives inside the
`NeoServletSupport.handleWithHooks` seam that the unit tests must stub (§8), so a mocked test cannot
distinguish "the batch now holds the transaction" from "nothing downstream ran" — that is the exact
false pass that made the old atomicity assertions meaningless. Only a DB-backed `OBBaseTest` could
see it, and it does not boot here. **B's only real verification is a live probe**, which means B ships
blind and waits on a deploy regardless of when it is written.

Given that, writing it before A is probed live would put two unverified changes on the same write
path in one deploy, and a failure could not be attributed to either. A is verified by re-running C10;
that has to happen first.

**One limit B does not remove even done well:** a handler inside the batch can still commit behind
it — `AbstractInvoiceHeaderHandler`'s completion path goes through `ProcessInvoiceUtil#process`, which
commits internally by design. B makes the batch atomic for plain CRUD ops, not hermetic.

**The P1 label stays.** Unlike [IMP-24](IMP-24.md), nothing here is merely cosmetic: the current
response causes orphan records to be left behind, and that has already happened once in this
project's own evidence trail.

## 6. Done when

**Option A was chosen** (2026-08-10). B is deferred to its own item, per §5.

- [x] `failureBody` receives `opResults` and returns `persisted:[{id, ok, recordId}]`
- [x] `atomic:false` and a `hint` on **every** failure body, including the ones where nothing survived
- [x] the `neo_batch` tool description stops promising all-or-nothing and points at `persisted`
- [x] `docs/neo-headless.md` §4.12.4 shows the real failure shape, with a new §4.12.4.1 on why
- [x] the tests that asserted the atomicity stop asserting it and guard the new contract instead
- [ ] `./gradlew test` (owed — the module tests were run standalone, see §8)
- [ ] deployed and probed live: re-run C10 and confirm the persisted order id comes back in
      `persisted` rather than having to be hunted for in the DB
- [ ] registry row re-scored by a `/mcp-comparison` run (not a bookkeeping edit)

## 7. What was implemented

Three surfaces, no behaviour change on the success path.

**1. The response (`BatchService.java`).** `failureBody` gained a `JSONArray persisted` parameter and
all 9 call sites pass `opResults` (the two that cannot have survivors — a null `operations` array —
pass `null`, which becomes an empty array, not an absent key). The `hint` is written for the two
cases separately: with survivors it says the records exist, are not rolled back, and that retrying
the whole batch duplicates them; with none it says the endpoint is not atomic anyway and that
`persisted` is the thing to read rather than `committed:false` the thing to infer from. **The empty
array is emitted on purpose** — "nothing survived" and "we are not telling you" must not look alike
to a caller, which is exactly the confusion that cost five days in §3.

**2. The tool description (`ToolRegistry.java`).** The old text — *"Run a sequence of cross-spec
create operations atomically … any failure rolls back everything (no partial writes)"* — was worse
than saying nothing, because an agent that believes it has no reason to look for the survivors. It
now leads with `NOT atomic`, names `persisted`, and says a plain retry duplicates.

**3. The docs (`docs/neo-headless.md`).** §4.12.4's failure example updated to the real shape, plus a
new §4.12.4.1 with the mechanism, the validation-time vs persist-time table from §1.1, and the
recovery instruction. The stale method-gate row ("whole batch rolled back") is corrected too.

The class and method javadoc in `BatchService` now state the non-atomicity as **a defect of the
write path below, not a design choice**, and name the three suppression routes §2 ruled out — so the
next reader does not repeat that search.

## 8. Tests

Rewritten rather than deleted, because the coverage they gave is real — only their *claim* was wrong.

`BatchServiceRobustnessTest` asserted `verify(obDal, never()).commitAndClose()` and read it as
all-or-nothing. That assertion **passed for a reason unrelated to atomicity**: the per-op commit
happens inside the stubbed `NeoServletSupport.handleWithHooks` seam, so with the stub in place
nothing downstream ever ran. It was pinning `BatchService`'s own lifecycle — which was never the
broken part. The class javadoc now says this outright, so nobody reads those verifies as evidence
again; only a DB-backed `OBBaseTest` could observe the leak, and this sandbox cannot boot one.

| Test | Change |
|---|---|
| `duplicateKeyRollsBackWholeBatchAtomically` | renamed `…StopsBatchAndReportsTheSurvivingRecord`; now asserts `persisted` names the first op's record |
| *(new)* `failureOnFirstOpReportsAnEmptyPersistedArray` | the empty-array case, so the key can never become conditional |
| `oversizedFieldValueFails…` | its second assertion was a tautology (`400` is in `4xx`) standing in for a claim the code could not make; replaced by the claim it can make |
| `ToolRegistryTest#testBuildBatchToolSchema` | asserted the description "must mention atomic transaction" — it did, and the claim was false. Inverted to require `not atomic` **and** `persisted`; note it would still have passed against the corrected text, which is why leaving it was not an option |

Standalone: `BatchServiceRobustnessTest` 6/6, `BatchServiceTest` 10/10, `ToolRegistryTest` 12/12.
Per IMP-16 §9.2 a standalone run is not load-bearing — `./gradlew test` is owed.

## 9. Status

Investigated and **option A implemented** 2026-08-10. Compiled locally; **not deployed, not probed
live.** The registry row moves ⏳ open → ⚠️ partial and the **score stays 0 / 5**: re-scoring is a
`/mcp-comparison` measurement, and in any case A does not make the batch atomic, so the item cannot
reach 5 / 5 without option B.

**Option B stays under this item** ([§5.1](#51-correction--b-does-not-need-its-own-imp-number)) — it is
the first clause of this row's own title, so doing it closes IMP-23 rather than opening IMP-26, and
the discovery-reserve conversation registry §2.2 demands is not triggered. It waits on A's live probe
([§5.2](#52-why-b-waits-for-a-to-be-verified-live-rather-than-following-it-immediately)), not on a
registry decision.
