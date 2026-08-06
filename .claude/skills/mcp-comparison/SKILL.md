---
name: mcp-comparison
description: >
  Re-run the Holded vs Etendo GO MCP benchmark with live evidence, and update the IMP-*
  improvement registry (`docs/mcp-evaluation/mcp-improvements-registry.md`) — the single source of truth for
  which improvements are resolved, partial or open. Use when asked to repeat / redo / refresh
  the MCP comparison, to re-validate the improvement backlog after a wave ships, to verify that
  a shipped IMP-* actually behaves as claimed, to ask "how many improvements are still open?",
  or to benchmark the Etendo GO MCP against another vendor MCP.
  Also covers job C — **working a single item** ("let's fix IMP-11", "arreglemos IMP por IMP"):
  root-cause one improvement and write up the investigation in
  `docs/mcp-evaluation/imps/IMP-<n>.md` (refuted hypotheses kept, not overwritten; file:line and
  real query output required; no measurement, no status change).
  Requires the Holded MCP plus one or more Etendo GO MCPs — defaults to a single target and asks
  the user which environment(s) to probe (local / experimental / staging / ticket sandbox) when
  several are connected, because the answer changes what the report means.
  Every run must end with NEW improvement proposals for the Etendo GO MCP (to match or beat
  Holded), an explicit verdict on why an agent would prefer one MCP over the other, the
  four hard scoreboard metrics M1–M4 (calls-to-outcome ratio, first-call success, payload
  signal ratio, self-correctable errors), and a recomputed **MARI** — the 0–100 composite
  readiness index that is the headline progress number and the one a KR is set against.
  Probing is read-only by default; write/edit probes are allowed only under explicit per-run
  human authorization on disposable environments (see Step 0.1). Enforces: every claim backed
  by a cited live call, status written only to the registry, and reports stating deltas
  (added / advanced / resolved IMP-n) instead of restating status.
  Triggers on: "MCP comparison", "Holded vs Etendo", "comparativa MCP", "rehacer el
  reporte MCP", "repetir el reporte", "re-run the benchmark", "validate IMP-", "IMP-4",
  "IMP-6", "IMP-9", "IMP-15", "Wave 3", "agentic validation", "validacion agentica",
  "registro de mejoras", "improvements registry", "mejoras pendientes", "MARI",
  "arreglemos IMP", "fix IMP-", "imp por imp", "por que falla IMP-", "root cause IMP-",
  "puntaje de avance", "readiness index", "que metrica del MCP",
  "did the improvements land?", "post-mejoras".
---

# /mcp-comparison — Reproduce the Holded vs Etendo GO MCP Benchmark

Everything lives under **[`docs/mcp-evaluation/`](../../../docs/mcp-evaluation/)** — start at its
[`README.md`](../../../docs/mcp-evaluation/README.md), which is the canonical description of the
folder layout.

Four kinds of document, four distinct roles. **Do not confuse them** — the most common failure of
this skill is writing a status into the wrong one.

| Document | Role | May a status be changed here? |
|---|---|---|
| **[`mcp-evaluation/mcp-improvements-registry.md`](../../../docs/mcp-evaluation/mcp-improvements-registry.md)** | **The registry.** Every IMP-* item, its priority, class, repo, **status**, and evidence pointer. Plus **MARI** (§2.1–2.3), the M5 diagnostics (§2.4), the probe-surface list (§2.5) and the changelog. | **Yes — only here.** |
| [`mcp-evaluation/mcp-comparison-holded-vs-etendo-go.md`](../../../docs/mcp-evaluation/mcp-comparison-holded-vs-etendo-go.md) | **The baseline benchmark.** Architecture contrast, inventories, coverage matrix, and the full `BEFORE`/`AFTER` specification of each item. Reference material. | No |
| `mcp-evaluation/mcp-comparison-post-audit-<date>.md` | **One run report per execution.** Live evidence, defects, new proposals, preference verdict, M1–M4 — and a **delta** against the registry. | No |
| [`mcp-evaluation/imps/IMP-<n>.md`](../../../docs/mcp-evaluation/imps/) | **One working file per improvement.** Root-cause investigation: where the responsible code actually lives, what the DB actually contains, which hypotheses were refuted, what a fix must touch. Written **while the item is worked** — absent for unopened items, which is expected. See "Working an item" below. | No |

Status used to live in five places inside the base report and drifted every time. It now lives in
the registry. A run report states only what **changed**, in these three sentence shapes:

```
* Added IMP-15 — contradictory FK contracts across write verbs (P1, ⚙️).
* Advanced IMP-4 — resolves display names on neo_create; still absent from neo_batch. ✅ → ⚠️.
* Resolved IMP-6 — actions-only view shipped (McpActionsView, commit bbfce9db).
```

Then it updates the registry's master table + changelog, and recomputes **MARI** (registry §2.1). A
run that flips marks without moving MARI has not improved the product.

**Why MARI and not "% of IMPs resolved":** every count-based metric here shares one defect —
discovering a new IMP makes it look worse, and discovery *is* the work. MARI weights outcome (60 %:
first-call success + calls-to-outcome ratio) over activity (40 %: weighted points against a frozen
quota + probe coverage), so finding a new defect never drags the number down. Baseline 2026-08-05:
**MARI = 28**; scope-closed ceiling **88**.

The reports are **evidence-driven, not opinion-driven**: every finding in §7/§8 traces to a
numbered live call in §11, and every proposed change shows a verbatim `BEFORE`
response next to the target `AFTER`. Refreshing them means **re-running the calls**, not
re-reading the prose.

Three distinct jobs this skill covers — decide which one you are doing before touching anything:

| Job | Scope | Sections touched |
|---|---|---|
| **A. Verify a shipped wave** (the common case) | Re-run the calls that back the shipped IMP-* items; flip their status; **then Step 3b — propose the next gaps and restate the preference verdict** | §1 delivery status, §10 bullets, the IMP-* entries + new IMP-n, their §11 rows, the affected §3/§8 rows |
| **B. Full re-benchmark** | Re-run the whole §11 call set against both MCPs; recount specs; re-score the matrix; **Step 3b applies equally** | All sections + `Date:` header |
| **C. Work a single item** ("let's fix IMP-11") | Root-cause one improvement and write up the investigation. **No measurement, no status change** — see "Working an item" below | `imps/IMP-<n>.md` only |

Step 3b (new proposals + preference verdict) is **not optional in job A or B** — it is the point of
the exercise; the status flips are just its input. Job C is exempt: it produces no measurement, so it
recomputes no MARI.

---

## Working an item (job C) — `imps/IMP-<n>.md`

A registry row is one line. That is the right size for a scoreboard and the wrong size for fixing
something. A run report records what was **observed**, which is not the same as what the code turns
out to be. The `imps/` file is the third thing: **the investigation**.

The distinction that matters, and the reason this file type exists: a run report may say *"0 of 157
fields carry `visibility`"*. That is an observation, and it is compatible with several very different
root causes — a serializer that never emits the key, a DB column nobody populates, a join that never
matches. Those need three different fixes in two different repos. The IMP file is where the
candidates get discriminated **with evidence**.

**How to work one:**

1. **Read the registry row and the cited evidence rows first.** They tell you what was observed and
   on which environment. Do not re-derive them.
2. **Enumerate the competing hypotheses before looking at code**, then knock them down one at a time.
   Record every one in a table with its verdict, including the refuted ones.
3. **Read the actual source and query the actual DB.** Cite file:line and paste the real query
   output. An IMP file asserting a root cause without either is worth nothing — same rule as Step 0.2
   for findings.
4. **State what a fix must touch**, in dependency order, per repo — and what it must *not* touch.
   Note anything that would make the response merely *look* compliant; that is a trap worth naming
   explicitly, because it is the tempting cheap fix.
5. **Write the `Done when:` as verifiable checkboxes**, ending with the re-measurement that closes
   it (job A or B). The item's status moves **only** after that re-measurement, **only** in the
   registry.

**Non-negotiable for this job:**

- **A wrong earlier diagnosis is kept, not overwritten.** When the investigation refutes something
  this skill or a previous run asserted, say so explicitly and leave the superseded claim visible
  next to the evidence that killed it. Silently replacing it is exactly how the old
  status-in-five-places drift started, and the wrong guess is usually the informative part — if the
  Java *looks* guilty and is not, the next reader needs to know that.
- **Investigating is not fixing.** Job C ends at the write-up. Do not change code as part of it
  unless the user asked for the fix too — and never run `gradlew`, `update.database`,
  `export.database` or restart Tomcat (the user builds and deploys).
- **Read-only probing still applies.** Diagnostic SQL must be `SELECT` only. Write probes need the
  Step 0.1 authorization, same as any run.
- **Say when you are blocked, in the file.** If part of the fix lives in a repo that is not cloned,
  record it as a blocker and state whether shipping the reachable half is safe. Often it is not: a
  parameter no caller sends leaves behaviour unchanged while looking done in the diff.
- Numbers are permanent. Never renumber, never recycle — the registry, the run reports and the base
  report all cross-reference them.
- Add the item to the README's index table when you create its file.

---

## Base-report anatomy — the 12 sections and how each is refreshed

This is the anatomy of the **base report** (the reference document). Status marks in it are legacy:
they defer to the registry now. Refresh a section here only when its *reference content* changed.

| § | Title | Holds | Refresh rule | Job A touches? |
|---|---|---|---|---|
| — | Header | Jira/epic, labels (`plataforma`, `validacion-agentica`), `Method:`, `Date:` | `Date:` = benchmark date. Bump on **B** only. | date only, no |
| 1 | Executive Summary | The verdict + the `> **Delivery status (YYYY-MM-DD):**` line | The delivery line should point at the registry rather than restate counts that go stale | ✅ yes |
| 2 | Method & Scope | Per-server call inventory, call count, out-of-scope, the "no records were mutated" claim | Update the call list, the count, and **which Etendo GO environment(s)** were probed | ✅ yes |
| 3 | Architecture Contrast | ~19-row table (tool model, generic verbs, introspection, read/write parity, FK resolution, error signaling, response shape, pagination, agentic-safety, guidance/recipes, onboarding friction…) | Rewrite only the rows the wave changed — a shipped item must not still be described as the current gap | ✅ yes (affected rows) |
| 4 | Holded Tool Inventory (by domain) | Holded's tool catalog grouped by domain | Re-enumerate the catalog. Holded ships tools independently — do not assume it is unchanged | ❌ (B only) |
| 5 | Etendo GO Spec Inventory | The spec list + the count ("56 = 48 windows + 8 reports") | Recount from `neo_discover`; never carry the old number forward. **Counts are per environment** | ✅ yes |
| 6 | Domain Coverage Matrix | ~25 rows scored ✅/⚠️/❌ per side, with legend | Re-score only rows whose evidence changed. Keep the legend intact | ❌ usually |
| 7 | Overlapping Features Where Holded Is Better | 9 subsections, each `Observed:` / `Impact:` / `Improve:` + a side-by-side example. Maps to IMP-*: 7.1→IMP-1, 7.2→IMP-2, 7.3→IMP-3, 7.4→IMP-4, 7.5→IMP-5, 7.6→IMP-6, 7.7 walk-through (call-count table), 7.8a→IMP-7, 7.8b→IMP-8, 7.8c→IMP-9, 7.9→IMP-10 | `Observed:` is a historical observation — **keep it**. Annotate the `Improve:` bullet when it ships, pointing at the IMP-* item. Re-count 7.7's call table if a shipped item removed calls | ✅ yes (`Improve:` bullets, 7.7 counts) |
| 8 | Where Etendo GO Is Already Better | 10 numbered strengths + 2 examples (read parity, `businessCritical` guardrail) | Verify the strengths still hold — a strength can regress too. **Promote here anything the wave took from Holded's column** (Step 3b.2) | ✅ yes |
| 9 | Roadmap — Expose When the Functionality Ships | Table of domains **not** current defects (CRM, projects, HR, recurring docs, metering) + trigger + suggested shape | Only move a row out when the ERP functionality actually ships. Never reframe a roadmap row as a defect | ❌ rarely |
| 10 | Prioritized Recommendations | P1 / P2 / P3 bullets cross-referenced `[§7.x] — IMP-n` | Keep the prioritization; **drop the ✅/⏳ marks** — status is the registry's. Add a bullet for each new IMP-n | ✅ yes |
| 11 | Validation Evidence | The numbered live-call table — the evidentiary spine of the whole report | Add/replace a row per call re-run. **Keep row numbers stable** (§7/§12 back-reference them); append new probes as new numbers. Every row names its environment | ✅ yes |
| 12 | Improvement Backlog | Per item: priority, `ref §7.x`, repo(s), ⚙️/♻️ class, `BEFORE`/`AFTER`, `Done when:` — the **specification** of each IMP-n | Keep the specification current (real `AFTER` once it ships, prose describing what actually landed). **Status, wave tables and the closing status line defer to the registry.** Append the spec of each new IMP-n | ✅ yes |
| 13 | Scorecard *(to be created on the first run — Step 3c)* | M1–M4 + the frozen task suite | Lives in the run report now, one column per run; the frozen suite stays here | ✅ yes |

Two structural conventions the report relies on — do not break them:

- **`ref §7.x` ↔ IMP-n is a two-way link**, and now a three-way one with the registry. Renumbering a
  §7 subsection or an IMP item orphans references in §10, §11, §12 **and the registry**. Add, never
  renumber.
- **The `⚙️ Signature change` / `♻️ Same call` legend in §12** classifies each item's blast radius.
  If an item shipped with a *different* shape than proposed (e.g. IMP-3 landed config-driven rather
  than hardcoded), rewrite the item's prose to describe what shipped and say why it diverged — the
  report is documentation of the real system, not of the original plan.

---

## Step 0 — Non-negotiable rules

1. **Read-only by default; write probes only under explicit authorization.**
   The default mode is read-only: every probe is a read or an *intentional* error probe, and the
   report states "no records were mutated". In that mode, to document a write path (IMP-4, IMP-5
   validation errors) read its **schema** and quote the *documented* contract instead of executing
   the write.

   **But read-only cannot measure the write path** — M2 (first-call success rate) on
   `neo_create` is the single most important metric in the scoreboard, and it is unobservable
   without writing. So the skill supports a **write-probe mode**, gated as follows:

   - **The human must authorize it explicitly, per run.** Never infer authorization from a previous
     run, from the environment name, or from "it's just a test tenant". If the user has not said so
     in this conversation, you are in read-only mode. **Ask** (`AskUserQuestion`) when the run's
     findings would materially depend on a write measurement.
   - **Only on environments the user names as disposable.** `etendo-go-local` and the Holded demo
     tenant are the intended write targets — both exist to be probed. `etendo-go-staging` and any
     customer-facing instance are **never** write targets, authorization or not.
   - **Both sides or neither, per finding.** A write comparison is only meaningful if the same task
     runs against both MCPs. Do not write to one and quote documentation for the other.
   - **Scope discipline.** Create the minimum record that exercises the path; never mutate a
     pre-existing record (create your own and act on that); prefer draft/unposted documents; never
     run a completion/posting action (`documentAction`, `posted`, Holded's `approve_*`/`send_*`) —
     those have downstream accounting and outbound-email effects. `neo_delete` is allowed **only**
     on a record this run created.
   - **Tag the data.** Put an identifiable marker in a free-text field (e.g. a description
     containing `MCP-BENCHMARK <date>`) so every artifact this skill created is greppable later.
   - **Clean up, and report what you could not.** Delete what you created. If a record cannot be
     deleted (posted, referenced, no delete verb), say so explicitly in §2 with its id — an
     undeletable leftover is a finding about the MCP, not a footnote.
   - **Record it in the report.** §2 Method & Scope must state which mode the run used. When writes
     happened, replace the "no records were mutated" claim with the exact list of records created
     and their disposition. Never leave that claim standing after a write run.
   - **A failed write is a first-class result.** The point is to measure whether the first call
     succeeds. Do not retry until it works and then report success — record the *first* attempt
     verbatim, then the corrections it took, and count them. That count **is** M1/M2.
2. **No claim without a call.** If you cannot produce the response, the finding does not go in.
   Mark it `⏳ unverified` rather than asserting it.
3. **Do not rewrite history.** A `BEFORE` block is a historical record of the old behavior. When an
   item ships, keep the `BEFORE` and add/replace the `AFTER` with the *actual* new response —
   never silently overwrite `BEFORE` with today's output, or the report loses its evidence.
4. **English only** — the doc is versioned content.
5. Do not open Jira tickets or PRs from this skill; report findings and let the human decide.
6. **Never finish a run without new improvement proposals and a preference verdict** (Step 3b).
   "Everything is done, nothing to improve" is not an acceptable outcome of this skill.

---

## Step 1 — Preconditions: two MCPs, and **ask which Etendo GO**

The benchmark needs **Holded** (the reference) plus **one or more Etendo GO targets** connected and
healthy in this Claude Code session. Check the available-tools list — do not assume either is up.

### 1a. Pick the Etendo GO target(s) — **ask, never guess**

Several Etendo GO MCPs are configured for this repo, and **they are different environments running
different builds**. Which one(s) you probe changes what the report means. **Default to a single
target**, but the user may legitimately want several (e.g. local vs staging, to see what is
deployed where) — so when more than one is connected, **ask** (`AskUserQuestion`, multi-select),
stating what each implies:

| Server | Endpoint | What a finding there means |
|---|---|---|
| `etendo-go-local` | `http://localhost:3100/mcp` | The user's local build — the only target that reflects **uncommitted / undeployed** MCP work. Use for verifying a wave you just wrote. |
| `etendo-go-exp` | `go.experimental.etendo.cloud` | Experimental deploy — recently merged work, ahead of staging. |
| `etendo-go-staging` | `go.staging.etendo.cloud` | Staging deploy — closest to "what a customer-facing agent sees". Use for the published/official report. |
| `etendo` | `go.etp3591.etendo.cloud` | Per-ticket sandbox instance (`.mcp.json`). Use only if the user names it. |

Rules:

- **One target is the default.** Probing more than one is opt-in, and costs a full probe-set run
  per environment.
- **Never merge environments into one unattributed result.** Every response you record carries the
  environment it came from. With multiple targets, run the §11 set **once per environment** and keep
  the sets separate — either one §11 column per environment, or a per-environment sub-table. A §11
  row whose environment is unknown is unauditable and must not be written.
- When targets disagree, that **is** the finding: it tells you what is deployed where (e.g. IMP-3 ✅
  on local, ❌ on staging ⇒ shipped but not released). Report it as a deploy-gap, not as a
  regression.
- **Record the target(s) in the report**, in §2 Method & Scope and in the §11 table header — the
  original report says `etendo-go-local`, so a refresh against staging must say so explicitly.
  The report's own ✅/⏳ status marks must state **which environment** they hold on; when several
  were probed, the canonical status is the one the user names (usually staging, i.e. released).
- If only one Etendo GO MCP is connected, use it but **name it to the user** before probing, so
  they can redirect you if that is the wrong environment.
- Tenant data differs per environment (specs, invoices, taxes). A spec count or a `namedFilters`
  set that differs from the report may be an **environment difference, not a regression** —
  confirm the target before reporting a regression.

Smoke test the chosen target with `neo_discover()`. If it errors or the server is absent, **stop
and tell the user** which server failed — do not retry in a loop, do not silently fall back to
another environment, and never fabricate responses. `etendo-go-local` in particular has been
disconnected in past sessions; it is the single most common blocker.

### 1b. Holded

HTTP MCP at `https://mcp.holded.com/mcp` (`holded`). Smoke test: enumerate the tool catalog, then
`list_taxes`. Required for job **B**; job **A** (verifying our own wave) may run Etendo-only —
if Holded was not re-probed, say so explicitly in the report rather than implying its rows are fresh.

### 1c. Which build is behind each target

Record it per target — the servlet version is what the findings are actually about:

```bash
cd /Users/futit/Workspace/etendo_develop/modules/com.etendoerp.go && git log --oneline -1
```

That `git log` describes the **local** checkout. It only tells you what `etendo-go-local` serves
after a deploy; for `etendo-go-exp` / `etendo-go-staging` you must instead confirm **what is
deployed there** (which branch/commit was released) before crediting an IMP-* item — a remote
environment can easily be behind the local branch.

If the target has not been rebuilt/deployed since the MCP Java changed, you are probing stale
behavior. **The user compiles and deploys** — never run `gradlew`, `update.database`,
`export.database`, or restart Tomcat. Ask them to deploy, then re-probe.

---

## Step 2 — The canonical probe set (§11)

Run these in order; each maps 1:1 to a numbered row in §11. Record the **verbatim** response
excerpt for each — that excerpt is what lands in the report.

### Holded (job B only)

| # | Call | What it establishes |
|---|---|---|
| 1 | `list_taxes` | flat tax model |
| 2 | `list_invoices` | cursor pagination, documented business filters, inline payment aggregates |
| 3 | `get_invoice(<bad id>)` | error signaling (RFC-7807 problem details) |
| 4 | catalog scan | read/write parity gaps (create/update/delete without get/list) |
| 5 | `create_*`/`update_*` schemas (**read only**) | per-field prose, FK-by-name resolution |

### Etendo GO

| # | Call | What it establishes |
|---|---|---|
| 6 | `neo_discover()` | spec count + entities/methods (**and IMP-10 `guidance` pointer, IMP-9 `primaryEntity`**) |
| 7 | `neo_list` on `tax/tax` | reference-data shape |
| 8 | `neo_schema` on `sales-order/header` | field count, **IMP-1 curated labels + descriptions**, action discovery, `businessCritical`, **IMP-6 `view:"actions"`** |
| 9 | `neo_list` on `sales-invoice/header` | row verbosity, **IMP-2 `fields` projection + `view:"summary"`**, **IMP-3 `namedFilters`** |
| 10 | `neo_get` with a nonexistent id | **IMP-5 structured `not_found`** + **IMP-10 `seeAlso`** |
| 11 | `neo_defaults` on `sales-invoice/header` | **IMP-7 grouped `confirm`/`systemManaged` + `view:"minimal"`** |
| 12 | `neo_selectors` on `sales-invoice/header` | **IMP-8 `field` alias for `column`** + self-correcting missing-arg error |
| 13 | `docs(topic:"create sales invoice with lines")` | recipe quality + **IMP-10 tool-name drift (`etendo_neo_*` → `neo_*`)** |
| 14 | entity-name scan across specs | entity-naming convention / root-entity discoverability |

Two extra probes worth adding on a refresh (they were not in the original 14 and are the ones a
post-wave run most needs):

- `neo_list({spec:"sales-invoice", entity:"header", filters:{status:"<unknown>"}})` — IMP-3's
  *handled* error must list the valid names, not 500.
- `neo_list({..., filters:{outstandingAmount:{gt:0}}})` — IMP-3 range operators.

### Write probes (**authorized runs only** — see Step 0.1)

These are what actually measure M2 on the write path. Run the *same* task on both MCPs and count
the calls each one took, including the failures. The failures are the data.

| # | Etendo GO | Holded | What it measures |
|---|---|---|---|
| W1 | `neo_create` on `sales-order/header` using **only** what `neo_schema` said was required, first attempt, no corrections | `create_sales_order` from its tool schema alone, first attempt | **M2 first-call success** — the headline number |
| W2 | count the corrections W1 needed until it succeeded | same | **M1 calls-to-outcome** on the write path |
| W3 | `neo_create` with a **name** where a FK id is expected (e.g. `businessPartner: "Juan Perez"`) | pass a contact name where Holded wants an id | **IMP-4 FK-by-name** — the only way to verify it |
| W4 | `neo_create` omitting a genuinely required field | same | validation-error quality: does the error name the field and how to resolve it |
| W5 | `neo_batch` header+lines with `parentRef` | Holded's line-embedding equivalent | transactional integrity (an Etendo strength — verify it) |
| W6 | `neo_delete` the record W1 created | `delete_sales_order` on the record it created | cleanup path + read/write parity |

Do **not** extend this set to completion or posting actions. `documentAction`, `posted`, and
Holded's `approve_*` / `send_*` are out of scope in every mode — they book accounting entries and
send outbound email.

Recount the inventory for §5 (it says "56 specs = 48 windows + 8 reports") from `neo_discover`
itself; do not carry the old number forward.

---

## Step 3 — Verify each shipped IMP-* against its stated "Done when"

**Read the current status from the registry** — `docs/mcp-evaluation/mcp-improvements-registry.md` §3, never from
the base report's wave tables (they are historical narrative and have drifted before). The item's
own `Done when:` clause, in the base report §12, is the check; re-read it literally.

Baseline as of the 2026-08-05 run (`etendo-go-local`, build `c597c7c2`): **5 resolved · 5 partial ·
5 open · M5 = 10 of 15.** Partial items are the priority target of the next run — a ⚠️ means the
mechanism is there and only the outcome is missing, so it is usually the cheapest mark to move.

Rules for updating a status:

- ✅ **only** when the live response satisfies the `Done when:` clause. Strike through the clause
  (`~~…~~`) and append `✅ — <what shipped> (<class/file>, <ticket>)`, naming the implementing
  class so the claim is auditable (the shipped items cite `McpSchemaFieldBuilder`,
  `McpFieldProjection`, `McpDefaultsView`, `McpConstants`, `McpToolRouter(Support)`).
- ⚠️ **partial** when it works for some specs only — say which. IMP-3 is the live precedent:
  `namedFilters` are **hand-authored per spec** in
  `decisions.json → entities.{name}.namedFilters`, so a spec nobody authored has none. Check
  `artifacts/*/decisions.json` before calling it globally done, and keep the documented
  exception (`overdue` is intentionally not offered — computed `eTGODueDate` is unqueryable in HQL).
- ❌ **regression** when a previously-✅ item no longer holds. Do not quietly downgrade: report it
  to the user as a regression with the failing call, because it means a shipped behavior broke.

If an item's Java lives in `com.etendoerp.go`, confirm the code is actually on the probed build
before crediting it (`git log --oneline -S <ClassName>` in that repo) — a passing probe against a
stale deploy proves nothing.

---

## Step 3b — The two answers every run must produce (MANDATORY)

The point of this benchmark is **not** to tick off a backlog. It is to keep answering, run after
run, the two questions the report exists for:

> **What do we already have that is better than Holded — and what must we improve to match or beat
> them?**

Verifying the shipped wave is only the *input*. Every run must end with **both** deliverables below.
A run that only flips ✅ marks has failed.

### 3b.1 New improvement proposals — extend the backlog

Closing a wave does not close the gap; it moves the frontier. After re-probing, hunt for the
**next** gap and write it up as a new `IMP-n` item, numbered onward from the highest number in the
**registry** (`docs/mcp-evaluation/mcp-improvements-registry.md` §3) — never by recycling a retired or withdrawn
number. The item's full specification goes in the run report; its **row goes in the registry**, and
the registry's number is the one that counts.

Write-path items deserve special attention: they are invisible to a read-only run, so they
accumulate silently between authorized write probes. IMP-15 sat undetected across two runs for
exactly that reason.

Where to look, in order of yield:

- **Holded features with no §12 counterpart.** Walk §4 (Holded's catalog) and §6 (the coverage
  matrix) and ask, per row: does the *agent experience* of the Etendo equivalent match? §10 already
  names known ones with no IMP yet — **PDF/print + attachment tools**, **find-by-document-number
  convenience lookups**, **per-verb permission/role in the schema**, **cursor pagination alongside
  offset**. Any of these can be promoted to a full IMP item.
- **Whatever the wave exposed.** A shipped item routinely reveals the next friction: IMP-3 shipped
  but deliberately left `overdue` out (needs a payment-schedule subquery) — that is a candidate
  IMP. IMP-2's `view:"summary"` depends on `businessCritical` being authored per spec — coverage of
  that authoring is a candidate IMP.
- **Where you personally got stuck while probing.** You are the agent this report is about. Any call
  you had to retry, any argument you had to guess, any response you had to post-filter, is a
  first-hand finding — the original report's IMP-8 came from exactly that (a guaranteed first-try
  failure on `neo_selectors`).
- **Multi-environment gaps** (if you probed several): shipped-but-not-released is a delivery
  finding, not an IMP.

Each new item must carry the same anatomy as the existing ten, or it does not go in: **priority ·
`ref §7.x`** (add the §7 subsection if the gap has no home yet) **· repo(s) touched · ⚙️/♻️ class ·
verbatim `BEFORE` from your own live call · target `AFTER` · a falsifiable `Done when:`**. Then add
its row to the registry master table and its `* Added IMP-n — …` line to the registry changelog.

If the gap is real but you cannot yet specify it to that standard, record it under the registry's
**unnumbered candidates** list instead of minting a number. A number with no `Done when:` can never
be closed.

Rank by the same three criteria the existing rollout uses — **leverage** (how many agent failures it
removes), **risk** (breaking vs additive vs same-call), **dependencies** — and prefer ♻️ same-call
items: they cost nothing to existing integrations.

### 3b.2 Preference verdict — when would an agent choose which MCP?

State it plainly, for both directions, grounded in the calls you just ran. This is what §8 and §7
are *for*, but the report never states the conclusion as a decision rule — do it explicitly, and
keep it honest in both directions:

- **Why an agent would prefer Etendo GO** — the current, verified basis: runtime introspection so a
  new spec needs no new tool; uniform read/write across every spec (Holded has no `get`/`list` for
  contacts or products at all, while its own `update_*` docs tell the agent to "GET first");
  `businessCritical` confirm-before-write guardrails; callout-aware dependent selectors; inline
  `$_identifier` FK labels; real accounting and ES/EU fiscal compliance; `neo_batch`/`neo_action`
  and the report generators; the `docs` recipe layer. Re-verify — do not copy §8 forward unchecked.
- **Why an agent would still prefer Holded** — and this is the half that must not be softened:
  fewer calls to the same outcome (§7.7: ~2–3 vs ~6–8 from a cold start), named verbs that are
  self-evident, per-field prose, FK-by-name resolution, business-native query semantics, focused
  response shapes, RFC-7807 errors, and prose shipped *inside* every tool so there is nothing to
  discover.
- **Then the decision rule**: which MCP an agent should pick for which task class (e.g. regulated
  invoicing / accounting / anything needing introspection → Etendo GO; quick simple-SMB CRUD with
  minimal round-trips → Holded), and **what would have to change for Etendo GO to win that second
  class too**. That last clause is the deliverable — it feeds 3b.1.

If a shipped wave genuinely closed a Holded advantage, **move it**: it leaves the "prefer Holded"
list and joins §8. That migration, run after run, is the actual scoreboard of this whole exercise —
so state it as a delta ("this run moved X from their column to ours; Y remains theirs").

---

## Step 3c — The scoreboard: MARI plus the four hard numbers (MANDATORY)

Prose verdicts drift; numbers don't. Every run records the same metrics, **measured from the
probe set you just ran** (no extra calls), into the run report's scorecard — one column
per run, appended, never overwritten. Progress is the **delta between columns**.

### The headline: MARI

**MARI (MCP Agent Readiness Index)**, 0–100, defined in registry **§2.1–2.3**. It is the number a KR
is set against, and the only one you quote as "progress". Recompute it every run:

```
MARI = 0.30 × M2                       # first-call success rate, as a percentage
     + 0.30 × (100 / M1)               # calls-to-outcome ratio; 1.0× → 100
     + 0.25 × (earned / quota × 100)   # weighted points, registry §3 `Pts` column
     + 0.15 × (probed / 6 × 100)       # probe surfaces, registry §2.5
```

Baseline to carry forward: **2026-08-05 → MARI = 28** (M2 0 % · M1 2.4× · 29.5/73 · 2/6).
Projections on record: next wave **66**, scope closed **88**. The ceiling is 88, not 100 — see §2.3.

Two rules that keep MARI honest:

- **Never re-derive the quota from today's row count.** It was frozen when the OKR period opened
  (61 known points × 1.20 = 73). Registering a new IMP spends reserve; it must not move the
  denominator. If you overrun the quota, **stop and tell the user** — re-basing it is their call.
- **If M2 or M1 is not measurable this run, report MARI as a range**, with the unmeasured component
  at 0 and at its last known value. Never fill a component with an estimate and present the sum as
  a single number.

### The components, and where each is measured

M1 and M2 are the outcome half (60 % of MARI) — they cannot be moved by moving paperwork. Delivery
and Coverage are the activity half (40 %). If they ever disagree, **lead with M1/M2**.

| # | Metric | Definition | Source | Direction |
|---|---|---|---|---|
| **M1** | **Calls-to-outcome ratio** | Calls an agent needs, from a cold start with no cached ids, to complete the frozen task suite — Etendo GO ÷ Holded. **1.0 = parity** | §7.7 walk-through, extended to the suite below | ↓ toward 1.0 |
| **M2** | **First-call success rate** | Of the suite's calls, the fraction where the *natural* first call shape succeeds (no retry, no arg guessing) | Count retries during your own probing | ↑ toward 100% |
| **M3** | **Payload signal ratio** | Useful fields ÷ total fields returned, on the three canonical shapes: `neo_list` row, `neo_defaults`, `neo_schema` | Count keys in the responses | ↑ |
| **M4** | **Self-correctable error rate** | Of the error probes, the fraction whose response alone lets an agent fix the call (structured status + names the offending field/arg + `seeAlso`) | The error-path probes | ↑ toward 100% |
| **Delivery** | `earned / quota` | Sum the registry's `Pts` column: weight P1 5 · P2 3 · P3 1, credit ✅ 1.0 · ⚠️ 0.5 · ⏳/❌ 0 | registry §3 | ↑ |
| **Coverage** | `probed / 6` | A surface counts as probed only if this or a past run recorded a verbatim response from it | registry §2.5 | ↑ toward 6/6 |

M3 and M4 are **not** MARI components — they are diagnostics that explain M1 and M2. Keep recording
them; a run where M3 jumps but M1 does not tells you the payload got leaner without removing a
round-trip.

### The diagnostics: the M5 family

M5, M5a, M5b, M5c and M5d live in registry **§2.4**, recomputed every run. They are **not KR
material** — M5's denominator grows every time you find something, so it punishes discovery. That is
the whole reason MARI exists. Use them to read *what changed*, never as the progress headline.

M5 counts **partials as open**, deliberately: a mechanism that ships and reaches 1% of the surface
has not delivered its outcome. This is why M5b can *fall* between runs without any code regressing.
When it does, apply the registry's correction-vs-regression rule (§2.4): a **correction** re-bases
the past column with a footnote; a **regression** breaks the series and is escalated to a human as
an incident. Never let the two look like the same fall.

**M5d — cohort closure** is the one count-based number that is dilution-proof: its denominator
freezes at the run that registered the items, so newly found IMPs open a new cohort at 0 % instead of
diluting the old one. Assign every new IMP-n to the current cohort in the registry's `C` column.

### The frozen task suite (M1/M2 denominator)

M1 is only comparable across runs if the tasks are identical. **Freeze these five; add, never
change:**

1. Create a customer invoice for one product and mark it issued (the §7.7 walk-through).
2. Answer "which invoices are pending payment, and how much is outstanding?".
3. Show one product with its sale price, purchase price and stock.
4. Complete / process a sales order (action discovery + invoke).
5. Read a record that does not exist, and attempt an invalid write (error paths).

Count **calls actually issued**, including failed attempts and lookups (`neo_selectors`,
`neo_schema`, `neo_defaults`) — the round-trips are the cost. For writes, count the calls the
documented contract requires; do not execute them (Step 0 rule 1).

### Baseline (2026-07-21, from the report's own live calls)

Carry this column forward as the origin; do not recompute it:

| Metric | Etendo GO | Holded | Notes |
|---|---|---|---|
| M1 task 1 | ~6–8 calls | ~2–3 calls | ratio ≈ **2.7×** (§7.7) |
| M2 | ≥1 guaranteed first-try failure (`neo_selectors` `column` vs `field`) | — | §7.8b / IMP-8 |
| M3 `neo_list` invoice row | ~5 useful of ~60 → **~8%** | ~8 of ~8 → ~100% | §7.2 |
| M3 `neo_defaults` | ~5 of ~70 → **~7%** | n/a (params *are* the short list) | §7.8a |
| M3 `neo_schema` to find an action | 97 fields | 1 named verb | §7.6 |
| M4 | 0 of 2 (`{data:[],status:0}` ambiguous; missing-arg error unhelpful) → **0%** | 1 of 1 (RFC-7807) → 100% | §7.5 |

### Rules

- **Same environment per column.** A column is one environment; label it. Comparing local against a
  previous staging column is meaningless.
- **Report M1 as a ratio, not as raw calls.** Raw counts drift with tenant data; the ratio against
  Holded on the same task is the honest signal.
- **Never let backlog burn stand in for progress.** M5 can go to zero while M1 is still 2×. That is
  why Delivery is only 25 % of MARI. Report both, and if they disagree, lead with M1/M2 and say so.
- If a metric is not measurable this run (e.g. Holded not re-probed), write `n/m` — not an estimate —
  and report MARI as a range per the rule above.
- Each new IMP-n from Step 3b.1 must state **which MARI component it moves**, and by roughly how
  much. An improvement that moves none of them is probably not worth a wave slot — say so.
- **Projections are labelled as projections.** A forward MARI row (registry §2.3) states the reasoning
  ("IMP-15 removes the FK retry loop") and never gets promoted to a measured column.

---

## Step 4 — Write the results: registry first, then the run report

Status goes in **one** place. Write it there first, and derive everything else from it.

### 4a. The registry — `docs/mcp-evaluation/mcp-improvements-registry.md`

1. **Master table (§3)** — for every item you probed: the status mark, the `Pts` cell (weight ×
   credit), the cohort `C`, the evidence pointer (the run report row id), and the one-line reason a
   ⚠️ is not a ✅. Add a row for each new IMP-n, in the current cohort. Re-sum the totals line under
   the table — a `Pts` cell that disagrees with its status mark makes MARI unauditable.
2. **Changelog (§4)** — a new dated entry with the run's environment and build, then one
   `* Added / * Advanced / * Resolved IMP-n — …` bullet per change. Append; never edit a past entry.
   Close the entry with `MARI <before> → <after>`.
3. **Metrics (§2)** — a new MARI column in §2.1 with all four components shown, and a new column in
   the §2.4 diagnostics table (M5, M5a, M5b, M5c, M5d). Update §2.5 if a surface was newly probed.
   Do **not** touch the quota in §2.2. If M5b fell, add the sentence explaining which statuses were
   corrected and that no behavior regressed.
4. **Environment line** — the master table header states which environment all its marks hold on.
5. If an item needs a long explanation to be actionable (IMP-15 is the precedent), add an
   **appendix** rather than inflating the table row.

### 4b. The run report — `docs/mcp-evaluation/mcp-comparison-post-audit-<date>.md`

One file per run. It holds the evidence and the argument, and a **delta** section, not a status
table. Sections: headline · verification matrix (evidence per item, with the registry as the status
authority) · live evidence rows · write-path evidence if authorized · defects · new backlog items
with full `BEFORE`/`AFTER`/`Done when:` · preference verdict · **the MARI computation with all four
components and the before → after** · M1–M4 scorecard · what was **not** tested (this is where the
unprobed surfaces of registry §2.5 get named) · next actions. Every ✅ or ⚠️ it cites must name the
live-call row behind it.

### 4c. The base report — `docs/mcp-evaluation/mcp-comparison-holded-vs-etendo-go.md`

Touch it **only** when reference material changed, and only with human authorization (it is the
published document):

- **§5** spec count, recounted from `neo_discover` — never carried forward.
- **§3** rows that still describe fixed behavior as current.
- **§7** `**Improve:**` bullets annotated as shipped, pointing at the IMP-n. Leave `**Observed:**`
  intact — it is the historical record. Re-count **§7.7's call table** if round-trips changed.
- **§8** — promote anything the wave took from Holded's column.
- **§12** — the full `BEFORE`/`AFTER` spec of new items.
- **Its status surfaces (§1 delivery line, §10 marks, §12 headings, `Done when:` strikethroughs, wave
  tables)** now say *"see the registry"* rather than carrying a mark of their own. Do not reintroduce
  a status there — that duplication is what this registry exists to end.

### 4d. The item working files — `docs/mcp-evaluation/imps/IMP-<n>.md`

Job C's output, and the only file job C writes. Full rules in "Working an item" above. From a run's
point of view (job A/B) there are only two obligations:

- When a run's evidence **refutes or sharpens** what an existing IMP file claims, update that file
  too — keeping the superseded claim visible. A run report and an IMP file that disagree about the
  root cause is a worse state than either being merely incomplete.
- Never create one speculatively for an item nobody has opened. An empty or guessed IMP file is
  indistinguishable from an investigated one at a glance, which defeats the purpose.

### Sanity check before finishing

```bash
cd /Users/futit/Workspace/etendo_develop/schema_forge
R=docs/mcp-evaluation/mcp-improvements-registry.md
grep -o 'IMP-[0-9]*' $R | sort -uV                    # every number present, no gaps, no reuse
grep -c '^| \*\*IMP-' $R                              # row count == highest IMP number
grep -o 'IMP-[0-9]*' docs/mcp-evaluation/mcp-comparison-post-audit-*.md | sort -u   # no item cited but unregistered
ls docs/mcp-evaluation/imps/                          # every file here is listed in the README index
```

Every IMP-n mentioned in any run report must have a row in the registry; the registry's M5 must equal
the number of ⚠️ plus ⏳ rows you can count by hand; and the `Pts` column must sum to the `earned`
figure the MARI computation used. If the sums disagree, the metric is wrong, not the table.

---

## Step 5 — Report back

Give the user, in Spanish (conversation language):

- **which Etendo GO environment(s)** were probed (and whether Holded was re-probed), on which
  build/commit each, and which calls were **not** run and why;
- if several environments were probed: where they disagree, i.e. what is shipped but not released;
- **MARI before → after, first**, broken into its four components so it is clear *which* moved. This
  is the headline of the whole run. If a component was not measurable, say so and give the range;
- **the registry delta** — the `Added / Advanced / Resolved IMP-n` bullets, each with the one call
  that decided it, plus **M5 before → after** as a diagnostic. If M5b (resolved) fell, or if M5 rose
  because you found things, explain it in the same breath — and point at MARI, which is the number
  that did not lie;
- **the new proposals** (IMP-11+) with their priority and wave — at least the strongest one, and why
  it is next;
- **the preference verdict as a delta**: what moved from Holded's column to ours this run, what
  remains theirs, and what would have to change to take it;
- **M1–M4 vs the previous column**, leading with M1 (the calls-to-outcome ratio) — the one-line
  version of the whole run;
- any regression found (highest priority — call it out first);
- the diff summary of the report, and the remaining backlog.

Commit only if the user asks. Convention: `Feature ETP-4793: Refresh MCP comparison report`
(first line ≤80 chars, no `Co-Authored-By`, never `--no-verify` on an epic-feeding branch).
