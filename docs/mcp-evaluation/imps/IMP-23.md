# IMP-23 — `neo_batch` was not atomic (options A + B implemented)

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C4, 0 / 5, ♻️ behavioural |
| **Specification** | [post-audit 2026-08-10](../mcp-comparison-post-audit-2026-08-10.md) §5.2 |
| **Evidence** | **C9** (FK failure, nothing persisted — inconclusive) and **C10** (281-char description against `c_order.description varchar(255)`: `committed:false` returned **and** order `1000027` persisted) |
| **Repo** | `com.etendoerp.go` |
| **Registered** | 2026-08-10, after a fourth reproduction |

> **Reading order.** §1–§9 describe the defect and **option A** (honest reporting), which shipped and
> was verified live on 2026-08-10. **Option B** — the batch is now genuinely atomic — is §11, verified
> live on 2026-08-11 in §12. §1 and §2 therefore no longer describe current behaviour: they are kept as
> the record of *why* B had to take the shape it did.
>
> **Current state:** the batch rolls back as a unit for plain CRUD ops (§12), it is **not hermetic**
> (§11.4), and the row's score still awaits a `/mcp-comparison` re-measure (§11.6).

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
merely expensive rather than impossible. **This table is the reason B is a fork and not a flag** — it
was re-checked line by line before B was written (§11.1), and the verdicts held.

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

**Option A was chosen** (2026-08-10), shipped and verified live (§9). **Option B followed the same
day** under this item, per §5.1 (§11).

- [x] `failureBody` receives `opResults` and returns `persisted:[{id, ok, recordId}]`
- [x] `atomic:false` and a `hint` on **every** failure body, including the ones where nothing survived
- [x] the `neo_batch` tool description stops promising all-or-nothing and points at `persisted`
- [x] `docs/neo-headless.md` §4.12.4 shows the real failure shape, with a new §4.12.4.1 on why
- [x] the tests that asserted the atomicity stop asserting it and guard the new contract instead
- [x] deployed and probed live: C10 re-run returns the surviving order id in `persisted` (§9)
- [x] `./gradlew test` — run green by the user on 2026-08-11 at a HEAD containing B (`7159376c`),
      alongside the compile and redeploy; this discharges the debt §8 opened
- [ ] registry row re-scored by a `/mcp-comparison` run (not a bookkeeping edit)
- [x] option B — actual atomicity (§5.1: closes this item, does not open a new one) — §11
- [x] **B deployed and probed live** (2026-08-11, §12): the same C10 vector that returned
      `persisted:[{recordId:"CEDA7318…"}]` in §9.1 now returns `persisted:[]` / `atomic:true`, and a
      DB sweep with a positive control confirms **no survivor exists**

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

## 9. Live verification (2026-08-10, `etendo-go-local`)

Deployed by the user, then probed. **Two batches, both authorised as write probes, one record created
and deleted, nothing pre-existing touched.**

### 9.1 The C10 re-run — the survivor is now named

Two `sales-order/header` creates: op `h0` valid, op `h1` identical but with a 281-char `description`
against `c_order.description varchar(255)` — the C10 vector verbatim, chosen because it fails at
**persist** time rather than validation time (§1.1's discriminator).

```json
{"committed": false, "atomic": false,
 "persisted": [{"id": "h0", "ok": true, "recordId": "CEDA7318DE814C679F0A0EE992A0FE92"}],
 "hint": "1 operation(s) that ran before the failure were already committed and were NOT rolled back …",
 "failedAt": {"index": 1, "id": "h1"},
 "error": {"status": 400, "error": "validation_error",
           "detail": "…description: Value too long. Length 281, maximum allowed 255 …"}}
```

`neo_get` on that id returned order `1000029`, `documentStatus: "DR"`, description
`"IMP23-PROBE op1 survivor"` — **the orphan the old response would have hidden.** It was then deleted
with `neo_delete` using the id the failure body itself supplied, and a sweep by date returned 0 rows.

**That round trip is the whole point of the fix, executed:** find the survivor from the response,
verify it, delete it. Doing this on 2026-08-05 would have needed a DB query nobody had a reason to
run, which is why `1000017` sat there for five days.

### 9.2 The empty case was verified too, by accident, and it is the better probe

The **first** attempt failed on op `h0` — `partnerAddress` omitted, so
`c_bpartner_location_id` violated its not-null constraint — and returned `persisted: []` with the
other branch of the hint (*"No operation persisted this time, but this endpoint is not atomic …"*).
So both hint branches are now confirmed against the live server, not just the one the probe was
designed for. This is the case §7 argued must never be an absent key: nothing survived here, and the
response says so explicitly instead of staying silent.

### 9.3 The tool description was stale in the client, and that limits option C

The `neo_batch` schema this session received still carried the **old** text — *"Run a sequence of
cross-spec create operations atomically … any failure rolls back everything (no partial writes)"* —
while the server was already returning the new body. The MCP client caches the tool list from session
start, so the descriptions do not refresh on redeploy.

Worth recording because it bounds what a description fix can do: **an agent in an already-open session
keeps reading the old promise until it reconnects.** The response body is the only channel that
updates immediately — which is a point in favour of A having been done in the body first rather than
in the docs alone (option C, §4).

### 9.4 Secondary finding, not registered

The two probes returned the same *class* of problem — a caller-supplied value the DB refuses — with
very different quality:

| Probe | Response |
|---|---|
| 281-char `description` | `400 validation_error`, naming the field, the length and the maximum. Clean |
| missing `partnerAddress` | **`500 server_error`** carrying a raw Postgres not-null violation, with `detail` dumping the entire failing row — ~90 columns of internals — and `&quot;`-escaped quotes inside a JSON string |

A required field the caller omitted is the caller's to fix, so it should be the `missingFields` 422
shape IMP-24 §2 already established, not a 5xx; and the row dump is both an internals leak and a
sizeable context cost (ACE). **Not registered here**: known scope already equals the quota (registry
§2.2), so opening an item is the user's call, and this most likely belongs to IMP-17 (raw errors
surfacing unmapped) rather than to a new number.

## 10. Status after option A

Investigated, **option A implemented, deployed and verified live** 2026-08-10 (§9). At that point the
registry row moved ⏳ open → ⚠️ partial with the **score staying 0 / 5**: re-scoring is a
`/mcp-comparison` measurement, and in any case A does not make the batch atomic, so the item could not
reach 5 / 5 without option B.

What the live run settles and what it does not: the recovery loop works end to end — the failure body
named the survivor, `neo_get` confirmed it, `neo_delete` removed it using that id, and both hint
branches (survivors / none) were exercised (§9.1–§9.2). What it does not settle is atomicity, which
was never A's claim. `./gradlew test` is still owed (§8).

**Option B stays under this item** ([§5.1](#51-correction--b-does-not-need-its-own-imp-number)) — it is
the first clause of this row's own title, so doing it closes IMP-23 rather than opening IMP-26, and
the discovery-reserve conversation registry §2.2 demands is not triggered. Its blocker
([§5.2](#52-why-b-waits-for-a-to-be-verified-live-rather-than-following-it-immediately)) was
**cleared** by the live run: A is verified, so B no longer risks stacking two unverified changes on
one write path. B followed the same day — §11.

## 11. Option B — the batch is now atomic (2026-08-10, `7159376c`)

Committed on `feature/ETP-4793` in `com.etendoerp.go`. **Not yet deployed**, so not yet verified live
(§6, last box).

### 11.1 What was re-checked before writing a line of it

§2's table was re-read against the actual sources rather than trusted, because the whole cost of B
rests on it being right:

* `SessionHandler#commitAndClose(pool)` → `commitAndCloseNoCheck` → `trx.commit()`, **unconditional**
  (`/Users/futit/Workspace/etendo_develop/src/org/openbravo/dal/core/SessionHandler.java:580–691`).
  Note the path: this file is **not** under `modules_core`.
* `setDoRollback` / `getDoRollback` are read **only** by `DalThreadHandler` at thread end. There is no
  deferred-commit or nested-transaction mode to switch on.
* `DefaultJsonDataService`'s own class javadoc sanctions the fork outright: *"This class can however
  also be extended and instantiated directly."*

So B forks the two lines that commit, and nothing else: core's `update()` success branch
(`:1152 commitAndClose()`) and its converter-error branch (`:1060 rollbackAndClose()`).

### 11.2 The three pieces of code

**1. `NeoBatchJsonDataService`** (new, ~330 lines) — `extends DefaultJsonDataService`, overrides
`update()` and reproduces core's success and converter-error branches **minus those two lines**,
delegating to the inherited `protected doPreAction`/`doPostAction`.

Two non-obvious constraints, both documented in the class javadoc because both cost a build:

* **It must be a CDI bean, not `@Vetoed` + `new`.** Core injects `cachedPreference` (`:89`) and
  `@Any Instance<JsonDataServiceExtraActions> extraActions` (`:1205`), and `doPreAction` dereferences
  the latter — a hand-constructed instance NPEs. Making it a bean is safe because
  `WeldUtils.getInstanceFromStaticBeanManager` matches `bean.getBeanClass() == type` **exactly**, so
  core's own lookup cannot see the subclass and the shipped write path is untouched.
* **Its accessor is `deferredCommitInstance()`, not `getInstance()`.** Core's `getInstance()` is
  `public static`; a package-private override is *"attempting to assign weaker access privileges"* and
  does not compile. It is also **lazy** — merely loading this class runs core's static initializer,
  which resolves a bean through Weld.

**2. `BatchService` — transaction ownership.** A `ThreadLocal<Boolean> CALLER_OWNS_TRANSACTION` set by
`executeBatch` around the loop (cleared in `finally`), plus the resolver every write goes through:

```java
static DefaultJsonDataService currentJsonService() {
  return Boolean.TRUE.equals(CALLER_OWNS_TRANSACTION.get())
      ? NeoBatchJsonDataService.deferredCommitInstance()
      : DefaultJsonDataService.getInstance();
}
```

The flag and the resolver live **here, not in the subclass**, and that placement is load-bearing: with
them on `NeoBatchJsonDataService`, simply setting the flag loaded the class and dragged core's
Weld-dependent static initializer in — which failed the unit tests with
`ExceptionInInitializerError` and would have been a production fragility too.

**3. `NeoCrudHandler:237`** — one line, `DefaultJsonDataService jsonService = BatchService.currentJsonService();`,
thereafter passed by parameter through `dispatchCrud` / `executePostCreate` / `executeUpdate`. That
single injection point covering the whole create path is why B turned out cheap.

### 11.3 The failure body had to change direction, not just value

After B, reporting `atomic:false` with every op listed as `persisted` would be **the mirror image of
the original bug**: it would send an agent hunting for records that were correctly rolled back. So
`atomic` is now computed, `atomic = (survivors.length() == 0)`, with two distinct hints — *"nothing was
persisted, fix `failedAt` and retry the whole batch"* vs *"N operation(s) were committed by a process
running underneath this batch … retrying as-is will create duplicates"*.

Survivors are detected **generically**, not from a maintained list of handlers that commit internally
(which would rot and over-report). `commitAndClose()` closes the Hibernate session, so a new
`TransactionTracker` compares `OBDal.getInstance().getSession()` identity after each op: a changed
session means the transaction ended underneath the batch, and the ops completed so far are snapshotted
as durable. **This is the one part of B a mocked test can actually observe** — the atomicity itself
cannot be (§11.4).

### 11.4 What B still does not fix, and what no test here can see

* **Not hermetic.** `ProcessInvoiceUtil#process` — reached by `AbstractInvoiceHeaderHandler`'s
  completion path (`:562`, `:591–592`) — commits internally by design. A batch op that triggers it is
  outside B's transaction. That is exactly the case §11.3's `atomic:false` + `persisted` now reports.
* **Two silent-drift risks**, both flagged in the class javadoc: `ADD_FLAG = "_doingAdd"` and
  `getContentAsJSON` are duplicated from core's **private** surface. A signature change in core breaks
  the build; a behaviour change does not. (Precedent: `SecureJsonDataService` duplicates the same two.)
* **No test in this repo can prove the batch is atomic**, for the same reason it could not prove it was
  not (§8): the per-op commit lives inside the stubbed `NeoServletSupport.handleWithHooks` seam, and
  `OBBaseTest` does not boot in this sandbox. The tests were rewritten to guard the *reporting*
  contract, which they can see:

| Test | Change |
|---|---|
| `duplicateKeyStopsBatchAndReportsTheSurvivingRecord` | renamed `duplicateKeyRollsBackTheWholeBatchAndReportsNothingPersisted`; asserts `atomic:true`, `persisted` empty, "retry the whole batch" |
| *(new)* `aCommitUnderneathTheBatchIsReportedWithTheSurvivingRecord` | mocks the `Session` swap — the tracker's only observable behaviour — and asserts `atomic:false` with the one surviving id |
| `failureOnFirstOpReportsAnEmptyPersistedArray` | now asserts `atomic:true` and the "nothing was persisted" hint |
| `ToolRegistryTest#testBuildBatchToolSchema` | this assertion has now been wrong twice in **opposite** directions, so it stopped checking the adjective and checks the caller-visible consequence: `atomically`, `'atomic':false`, `persisted` |

Standalone: **19 successful, 0 failed** (`BatchServiceRobustnessTest` + `ToolRegistryTest`). Per
IMP-16 §9.2 that is not load-bearing; `./gradlew test` remains owed.

### 11.5 Blast radius, checked

Nothing in `tools/app-shell/src` or `cli/src` reads the batch's `atomic` or `persisted` keys (the
React invoice-scan ingest checks only `committed`), so no consumer breaks. That path shares
`executeBatch` via `POST /sws/neo/batch`, so it **silently gains atomicity** — which is §1.2's wider
blast radius closing in the same change.

### 11.6 Scoring

The row can now go ⚠️ partial → ✅: the defect no longer reproduces, verified live (§12). The **score**
is a separate question from the **status**, and conflating them is a mistake this file made when §11.6
was first written — it treated *"⚠️ → ✅ (+2.5)"* as one gated event. They are two:

* **Status** reflects what the product measurably does, so the live probe settles it. ✅ as of §12.
* **Score** (0 / 5 → 5 / 5, **+2.5 earned, known scope and quota untouched** per §5.1) is credited by a
  `/mcp-comparison` run, never by an edit here. Still owed.

The precedent is IMP-14, which sat at ⚠️ while explicitly *"still worth 0"* through three separate
gates. Status and score move on different evidence.

## 12. Live verification of option B (2026-08-11, `etendo-go-local`)

Compiled, redeployed and `./gradlew test` run green by the user at a HEAD whose tip is `7159376c`
(verified: `git log` on the module shows B as the tip of `feature/ETP-4793`, working tree clean). Then
one batch, authorised as a write probe. **Nothing pre-existing was touched, and this time nothing was
created either — which is the result.**

### 12.1 The C10 vector, third time

Same two-op `sales-order/header` batch as §9.1: op `h0` valid, op `h1` identical but with a 281-char
`description` against `c_order.description varchar(255)`. Chosen for the third time because it fails at
**persist** time rather than validation time — §1.1's discriminator, and the only kind of failure that
ever exposed the defect.

```json
{"committed": false, "atomic": true, "persisted": [],
 "hint": "Nothing was persisted: the batch was rolled back as a unit, so no partial records were
          left behind. Fix the operation reported in 'failedAt' and retry the whole batch.",
 "failedAt": {"index": 1, "id": "h1"},
 "error": {"status": 400, "error": "validation_error",
           "detail": "Operation 'h1' rejected by server: description: Order.description: Value too
                      long. Length 281, maximum allowed 255 […]"}}
```

**`atomic:true`, `persisted:[]`** — where the identical call returned `persisted:[{id:"h0",
recordId:"CEDA7318DE814C679F0A0EE992A0FE92"}]` twenty-four hours earlier.

### 12.2 The response was not taken at its word

That mattered, because *"nothing was persisted"* is the exact claim that was **false** before B: the old
javadoc asserted all-or-nothing, and `verify(obDal, never()).commitAndClose()` passed while orphans
accumulated. A self-report of atomicity is worth nothing here on its own.

So the DB was queried directly: `neo_list` filtered on op `h0`'s marker description → **0 rows**; and a
sweep for any header dated on or after 2026-08-11 → **0 rows**.

**With a positive control**, because a `0` can just as easily mean a filter that never matches: an
unfiltered `neo_list` ordered by date returned **7 headers, newest 2026-06-24**, none carrying an
`IMP23B-PROBE` marker. The query sees data, and the data does not contain op `h0`. Worth noting the
same listing shows the orphans of the earlier runs (`1000017`, `1000024`, `1000027`, `1000029`) are all
gone — the top document number is `1000015`, so option A's recovery loop cleaned up after itself.

### 12.3 What this settles, and what it does not

**Settles:** the batch rolls back as a unit for plain CRUD ops. The defect registered on 2026-08-10 and
reproduced four times does not reproduce against this build. This is the verification §5.2 said was the
only one possible — no unit test in the module could have produced it (§11.4).

**Does not settle:**

* **Hermeticity.** The probe's failing op was a plain CRUD write. A batch op that triggers
  `ProcessInvoiceUtil#process` still commits internally, and the `atomic:false` + `persisted` branch that
  reports it (§11.3) **has not been exercised live** — only against a mocked `Session` swap. That is
  the one part of B still resting on a unit test.
* **The empty-`persisted` hint's other reading.** `persisted:[]` now means *"rolled back, nothing
  exists"*, whereas before B the same empty array meant *"nothing survived this particular failure,
  but the endpoint is not atomic anyway"*. Both live probes (§9.2, §12.1) produced the empty array, so
  its **wording** has been seen in both eras — but only the new hint text is now correct, and §9.2's
  reading is retired.
* **Tool descriptions in open sessions**, again. The `neo_batch` schema this session holds is still the
  **pre-A original** — *"atomically … any failure rolls back everything (no partial writes)"*, with no
  `atomic`/`persisted` in its returns clause. §9.3 found this after A and it repeated verbatim after B:
  the MCP client caches the tool list at session start, so **a connected agent reads a description two
  deploys stale** while the response body is already current. The irony is that this stale text is now
  *accidentally true* — but it still omits `persisted` and the process-commit exception, so an agent
  trusting it would not know to check `atomic`. This is a client-side caching limit no server change
  reaches, and it is the strongest argument in the file for having put the contract in the response body.
