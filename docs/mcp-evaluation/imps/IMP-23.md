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

**A now, B as its own item.**

A is provably correct from §3 — the data already exists, the change is to stop discarding it — and it
converts an unrecoverable failure into a recoverable one, which is the whole of what an agent needs.
B is a genuine improvement and a genuine regression risk on a UI feature this item never mentioned;
bundling it here would make a P1 agent-ergonomics fix wait on a core-fork review, and would put the
invoice ingest path in the blast radius of a change nobody asked for.

**The P1 label stays.** Unlike [IMP-24](IMP-24.md), nothing here is merely cosmetic: the current
response causes orphan records to be left behind, and that has already happened once in this
project's own evidence trail.

## 6. Done when

- [ ] *(pending the §4 decision — filled in when the option is chosen)*

## 7. Status

Investigated 2026-08-10. **No code written yet** — §4 is a decision the fix cannot be written without.
The registry row stays ⏳ open.
