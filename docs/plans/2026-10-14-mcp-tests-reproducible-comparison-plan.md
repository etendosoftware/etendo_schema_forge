# MCP tests — reproducible Etendo Go vs Holded comparison (ETP-5750) — Plan

**Status:** proposal, not started; user decisions of 2026-10-14 folded in (§9). **Epic:** ETP-5339. **Date:** 2026-10-14.
**Builds on:** `docs/plans/2026-09-11-mcp-test-harness-design.md` (the harness design; D-numbers
below refer to its §10). **Code location:** everything lives in `mcp-tests/` in this repo (D1, D9);
nothing here touches `schema_forge_core` or `com.etendoerp.go`.

## 1. Goal

One command

```
make mcp-compare SUITE=okr TARGETS=local,holded REPEAT=3
```

runs the same isolated business tasks against Etendo Go and Holded, N times each, and writes
`runs/<compareId>/summary.md` + `summary.json` with:

- per task, for each MCP, the 9 measured items, the winner, and which criterion decided it;
- the KR2.1 headline (% of evaluated tasks won by Etendo Go) and the stumble indicators;
- every pin needed to say what was measured (model, suite hash, rule version, builds);
- whether both systems were freshly initialized (§5.9); only a fresh run is an official number.

Acceptance target: two back-to-back runs on the same builds give the same winner in >= 90 % of
tasks.

## 2. Where the harness stands today (verified against the code)

| Need | State | Evidence |
|---|---|---|
| REPEAT | Not built. `repeat` is hard-coded to 1; every probe event says `attempt=1` | `runner/cli.py:13`, `cli.py:204`, `cli.py:452`; design D2 |
| Metrics / summary | Not built; no `report.py` | `cli.py:13`; design §6.6 |
| Multi-target | One `--target` per run; run id embeds it; preflight resolves one target | `cli.py:160-162`, `cli.py:339`, `cli.py:368-382`, `cli.py:635` |
| Per-target verification | `expectEffect` is one tool call, assumed NEO-shaped | `runner/suite.py:31-45`; `runner/mcp_client.py:664-676` (`count_rows` knows NEO keys only) |
| Read verification | None: `expectEffect` is rejected on non-write probes | `suite.py:92-95` |
| Agent's final answer | **Not recorded.** The probe file keeps tool calls and the English verdict, never the last answer the agent gave the user | `runner/agent.py:265-277` (`record()`), `agent.py:378` |
| Token cost | Not recorded; only `resultBytes` | `agent.py:197-203`; design §6.6 table (ACE-v ❌) |
| Server build | `serverBuild` always null; the MCP `initialize` result is discarded | `cli.py:196-197`, `mcp_client.py:629` |
| Silent-wrong result | Detected, but only printed, never stored as a field | `cli.py:531-534` |
| Setup/teardown | Built (D41), one list per probe, no per-target variant | `runner/steps.py`, `cli.py:260-315`, `cli.py:601-613` |
| Probe isolation | Mostly; `find-own-order` reads what a sibling wrote; `list-recent` reads tenant-wide state | `suites/sales-order.yaml:69-78` |
| Tests | `unittest`, three files (`test_steps`, `test_cli_steps`, `test_agent_empty_completion`) | `mcp-tests/tests/` |

## 3. The 9 items: where each comes from

"Attempt" = one execution of one probe against one target. "Measured" = an attempt with
`harnessError == null` (D12: harness errors carry no verdict and are excluded from metrics).

| # | Item | Derived from | Exists? | What must be added |
|---|---|---|---|---|
| 1 | Success | **Objective check only**: `effectVerified` (write) or new `answerVerified` (read), plus the refusal rule for error tasks (§5.5) | Writes ✅ (`cli.py:209-253`); reads ❌ | `expectAnswer` + `finalAnswer` recording (§5.5) |
| 2 | Consistency | successes / measured attempts | ❌ | REPEAT (§5.1) |
| 3 | Calls | median of `toolCallCount` over **successful** attempts (§5.6 rule) | ✅ `agent.py:270` | aggregation |
| 4 | First-call success | `toolCalls[0].error == false`, per attempt, reported as k/N | ✅ `agent.py:217` | aggregation |
| 5 | Unrecovered errors | Objective, from the transcript: an error call with **no later successful call to the same tool** in that attempt. Summed over attempts | data ✅, rule ❌ | rule in `report.py`, versioned |
| 6 | Self-corrected errors | error calls − unrecovered; shown as a ratio of all errors | data ✅ | aggregation |
| 7 | Stumbles | error calls (transcript) + `verdict.wastedCalls` (self-report, the only source of a useless 200). `frictions` and `suggestions` listed verbatim as the docs backlog | ✅ `verdict.py:61-78`, `verdict.py:148-162` | aggregation; label as partly self-reported |
| 8 | Silent wrong result | `verdict.outcome == "OKAY"` and the objective check failed | printed only (`cli.py:531-534`) | persist `silentWrong` in the probe file |
| 9 | Cost | model `usage_metadata` per agent turn (new) **and** sum of `resultBytes` (existing) | bytes ✅, tokens ❌ | §5.7 |

Two consequences worth stating:

- **Every decisive criterion is objective.** Success comes from a runner-made check, calls and errors
  from the transcript, tokens from the provider. `verdict.failures[].recovered` (`verdict.py:55`) is a
  self-report and is kept only as a cross-check column, never as item 5. Silent-wrong is a flag:
  a silent-wrong attempt already failed the objective check, so it cannot change the winner on its
  own. The only place the self-report enters a decision is the refusal rule of error tasks (§5.5).
- **Item 7 is partly subjective** (wasted calls exist only in the verdict). It does not decide a
  winner, so that is acceptable; the summary says so next to the number.

## 4. Design decisions to record

Proposed as new rows in the design's §10, each landing with the slice that implements it:

| Proposed | Decision |
|---|---|
| D43 | `REPEAT=N` runs each probe N times in independent MCP sessions; all attempts are kept, never averaged away. `mcp-test` keeps the D2 default of 1; `mcp-compare` defaults to 3. |
| D44 | A comparison run groups one standard run per target under one `compareId`. Targets run concurrently, and probes within a target run in parallel up to a configurable limit; the schedule is seeded and the actual start/finish of every attempt is recorded. |
| D45 | A suite v2 probe declares a vendor-neutral prompt and **per-platform** `setup` / `teardown` / `expectEffect` / `expectAnswer`. Narrows D34 further (still one post-condition, now per platform; adds a client-side `where`). |
| D46 | `expectAnswer` — a deterministic matcher over the agent's final answer. No LLM judge. Conservative false negatives accepted, as in D34. |
| D47 | The decision rule is code (`runner/decide.py`, `RULE_VERSION`) with its thresholds in the suite file. Changing either bumps the version recorded in every summary. |
| D49 | **"Not possible on this platform" is a first-class outcome**, distinct from a failed attempt. Declared per platform in the suite, checked against the live tool catalogue at preflight, never worked around outside the MCP (no REST, no manual seeding). The other platform wins the task by capability. |
| D50 | **Official numbers come only from a fresh run**: freshly initialized local Etendo and freshly initialized Holded account, verified at preflight and recorded in `compare.json`. A non-fresh run is still reported, marked unofficial. |
| D48 | Metrics are derived **only** from `compare.json`, `run.json` and the probe files. `events.ndjson` stays progress-only (`runner/events.py:7-11`); a test proves the report is identical with the event files deleted. |

## 5. Design per scope point

### 5.1 Repetition

- `--repeat N` in `cli.py:main` (`cli.py:634-673`), recorded in `run.json.repeat` (replaces the
  constant at `cli.py:204`) and as `attempt` on `probe_started` (`cli.py:452`) and in each probe file.
- **File layout (run schema v4):** `probes/<probeId>/attempt-<n>.json`. `ui/runs.py:180-191`
  (`load_probe`, `probe_files`) learns to read both layouts, keyed on `run.json.schemaVersion`, so
  old runs stay readable without migration (D14, D16).
- **Marker per attempt:** `{{marker}}` becomes `<compareId>-<probeId>-a<n>` (today
  `<runId>-<probeId>`, `suite.py:124-132`). It stays unique per probe *and* attempt, still starts with
  the run id (so the sweep in design §8 keeps working), and is **identical across targets** for the
  same attempt — which keeps the prompt text byte-identical between Etendo Go and Holded.
- **Harness errors are re-scheduled, not counted.** An attempt with `harnessError` is kept on file
  but does not count towards N; the runner schedules a replacement, at most N extra per probe and
  target. If a target still lacks N measured attempts, the task is **not evaluable** for that run:
  excluded from the KR denominator and listed separately in the summary, never silently dropped.
- Each attempt is a fresh MCP session and a fresh agent conversation, exactly as today
  (`cli.py:503`).

### 5.2 Multi-target

- `--targets local,holded` (comma list) plus `--subject local` (the side whose win rate is the KR;
  default: the first). One `compareId` (`<UTC>-cmp-<hex>`), and under it one standard run per target:

  ```
  runs/<compareId>/
    compare.json            # pins, targets, repeat, order seed, rule version (§6)
    summary.json  summary.md
    targets/<target>/       # a normal run dir: run.json, events.ndjson, probes/<id>/attempt-<n>.json
  ```

  The UI keeps working by pointing it at `targets/<target>/`; teaching it about `compare.json` is
  optional and not in scope.
- **Preflight every target before the first attempt** (extends D19): model check once, auth for each
  target, the tool catalogue (for the `notPossible` checks of §5.10), then the baseline verification
  of §5.4 and the freshness checks of §5.9. A target that fails preflight stops the comparison:
  a one-sided run cannot produce a winner.
- **Parallel from v1.** Targets run concurrently (one scheduler per target). Within a target,
  attempts run in parallel up to `--concurrency K` (config `run.concurrency`, default 4, `1` =
  sequential). The work list per target is the shuffled (seeded, seed recorded) product of probes ×
  attempts, so attempt 1 of every probe is not systematically run first, and provider-side drift does
  not correlate with one probe. Every probe file records `startedAt`, `finishedAt` and the worker
  slot, so the real schedule is on file.
- **What makes in-target parallelism safe** — and the rules it imposes on suites:
  - every probe reads and writes only records tagged with its own per-attempt `{{marker}}` (§5.4),
    never tenant-wide state; a probe that cannot meet that is declared `exclusive: true` and runs
    alone (the scheduler drains the pool around it);
  - baseline records are never mutated by any probe (§5.4);
  - setup, agent, effect check and teardown of one attempt stay sequential inside that attempt.
  Expected contention: Etendo document sequences and row locks on shared baseline records (a
  partner's credit, a product's stock). The pilot of each new task runs it at K=1 and at K=4; a task
  whose result differs is marked `exclusive`.
- **Rate limits.** Holded's MCP and the LLM gateway may throttle. A 429 is a harness error
  (`kind: rateLimited`, rescheduled, §5.1), never a product result; the per-target `concurrency` can
  be set lower than the global default in its config block (it caps, never raises). As built (S3):
  the replacement of a `rateLimited` attempt waits `min(30, 2 × 2^(n−1))` seconds for the probe's
  n-th replacement, times a jitter in [0.5, 1], **holding its pool slot** so the pressure on whoever
  throttles actually drops; other harness errors are replaced at once.
- **Cancellation** (Ctrl-C, or the caller cancelling a target's pool): every attempt in flight is
  cancelled and awaited, so its teardown completes before the cancellation propagates, and it
  writes a partial record with `harnessError.kind: cancelled`. An attempt still in its backoff
  had not started and writes nothing. Design doc §6.1 (run schema v6) is the reference.
- `asyncio` already drives the runner (`cli.py:679`), so this is a task pool around the existing
  per-probe body (`cli.py:446-616`), which first has to be extracted into a function with no shared
  mutable state other than the event writer (one writer per target run, already serialised by its
  single file handle, `runner/events.py:85-110`).
- **Platform, not target name:** each config target gains `platform = "etendo-go" | "holded"`, and the
  suite keys its per-target blocks by platform. `local`, `experimental` and `staging` are all
  `etendo-go` and share one block.
- **Holded target:** `[targets.holded] url = "https://mcp.holded.com/mcp"` with `platform = "holded"`.
  Decided (§9): try the Holded API key as a bearer first — `auth = "bearer"`,
  `token_env = "MCP_TEST_TARGET_HOLDED_TOKEN"`, which `mcp_client.py` already supports
  (`mcp_client.py:76-94`, it sends `Authorization: Bearer`). If Holded rejects it, fall back to
  `auth = "oauth"` (auth code + PKCE with dynamic client registration, already built). Whichever
  works is written into `config.example.toml` in S3; no new auth code is planned.

### 5.3 Vendor-neutral tasks with per-platform verification

Suite schema v2 (a `schemaVersion: 2` key; v1 files load unchanged):

```yaml
schemaVersion: 2
window: okr
decision: { ruleVersion: 1, callsMargin: 0.20, tokensMargin: 0.10 }   # §5.6

probes:
  - id: q-customer-outstanding
    category: query            # query | write | flow | error
    mode: read
    prompt: >
      ¿Cuánto me debe {{fixture.customer.name}} de facturas sin cobrar?
    platforms:
      etendo-go:
        setup:    [ ... two completed invoices tagged {{marker}} ... ]
        expectAnswer: { all: [ { number: "{{steps.total.value}}", tolerance: 0.01 } ] }
        teardown: [ ... ]
      holded:
        notPossible:          # §5.10 — setup needs invoices, which its MCP cannot create
          kind: setup
          reason: "Holded's MCP has no tool to create an invoice."
          missingTools: [create_invoice]
```

- `prompt` stays shared. A loader lint fails the suite if a prompt contains any tool name from a
  catalogue cached at preflight (`etendo_`, `create_`, `list_` …), so neutrality is enforced, not
  hoped for. D20 is untouched: the system prompt is the same for both targets.
- `{{fixture.<path>}}` is a new token family, resolved from the neutral baseline dataset (§5.4), so
  both systems are asked about the same named entities.
- A missing platform block means the task is still run on that platform with **no verification**,
  and the loader rejects that for `okr`: every task must verify on every platform it is compared on.
- `expectEffect` gains an optional `where:` (exact-match conditions applied by the runner on the
  returned rows). Holded's list tools may not filter by a free-text field; matching client-side
  keeps the check deterministic without assuming server filters. `count_rows`
  (`mcp_client.py:664-676`) must learn Holded's payload shapes — unknown until probed (§9).
- A task that one platform's MCP cannot do at all is declared, not attempted — see §5.10.

### 5.4 Identical starting data and isolation

Two layers, because reference data and documents behave differently:

1. **Baseline dataset (read-only reference data).** `mcp-tests/fixtures/okr-baseline.yaml`, vendor
   neutral: ~3 customers, ~2 suppliers, ~5 products with identical prices and the same tax
   (21 % IVA), identical names. Loaded once per tenant by a separate command
   (`make mcp-seed TARGET=…`), **not** by the runner per probe: D41 steps have no conditionals, so
   "create if missing" is not expressible there, and it should not be. At comparison preflight a
   read-only **verify** pass checks every baseline record exists with the expected values and records
   a `fixtureHash` per target; a mismatch stops the comparison. Probes never mutate baseline records.
2. **Per-probe documents (everything a probe reads or changes).** Created in that probe's
   per-platform `setup`, tagged with `{{marker}}`, removed in `teardown` — the treasury pattern
   (`suites/treasury.yaml:11-26`). **Reads are scoped to records the probe created** (e.g. "how much
   does customer X owe" where X's open invoices were made in setup), never to tenant-wide
   aggregates, so a dirty tenant or another run's leftovers cannot move the expected answer. This
   rules out probes like `list-recent` in the `okr` suite.

**Seeding uses only each platform's own MCP (decided, §9).** `make mcp-seed` and every per-probe
setup/teardown are MCP tool calls through the same session helpers as today (`steps.py`,
`cli.py:260-315`) — on Etendo too, so both sides are seeded by the same mechanism. There is no REST
step, no manual seeding and no SQL. Whatever a platform's MCP cannot create, that platform cannot
have as a starting state, and any task that needs it is **not possible** there (§5.10).

What that means for Holded, from the catalogue visible in this session (to be confirmed with a
real `tools/list` at S3 preflight, because a client-side filter could hide tools): contacts,
products, sales orders, estimates, proformas and purchase orders can be created and deleted; there
is **no `create_invoice`, no payment registration and no invoice delete**. So in Holded:

- the baseline (contacts, products, prices) is seedable;
- any task whose **starting state** includes invoices or payments (e.g. "which invoices are pending")
  is `notPossible` on Holded, because setup cannot build it;
- any task whose **goal** is to create an invoice or register a payment is `notPossible` on Holded
  for the same reason the agent could not do it either.

Holded's `approve_*` / `send_*` may be used (decided, §9: the account is disposable). The
`/mcp-comparison` skill forbids them for its manual probes; this suite runs only on the disposable
account, and that exception is stated in the suite header.

### 5.5 Read verification (`expectAnswer`) and error tasks

- **Record the final answer.** `run_probe` adds `finalAnswer`: the text of the last AI message of the
  tool loop, before the reporting call (`agent.py:349`, `agent.py:378`). It is in the task's language;
  the verdict is in English (prompt v2), so names and numbers must be matched against
  `finalAnswer`, not `verdict.achieved`.
- **Matcher, deterministic and versioned (`MATCHER_VERSION`):**
  - `number: <value | {{ref}}>`, `tolerance` — every numeric token in the answer is normalised
    (`1.234,56`, `1,234.56`, `1234,56`, `€ 1.234`) and compared;
  - `text: "<s>"` — case- and accent-insensitive substring;
  - `all: [...]` must all hold, `none: [...]` must all be absent.
  Expected values may reference setup results (`{{steps.x.y}}`), reusing `resolve_refs` exactly as
  the effect check does today (`cli.py:233`).
- An LLM judge was considered and rejected: it adds its own variance to criterion 1 and would put a
  second model inside the measurement.
- **Error tasks** declare `expectOutcome: refused`: success = the objective post-condition shows no
  effect (`expect: none`) **and** the agent did not report `OKAY`. This is the one place the
  self-report enters success; it is what "honest refusal" means and is already how treasury's
  refusal probes are read (`suites/treasury.yaml:29-37`).
- New probe-file fields: `finalAnswer`, `answerVerified` (true / false / null = not checked or not
  verifiable, same convention as `effectVerified`), `answerCheck`, `success`, `silentWrong`.

### 5.6 Metrics derivation and the decision rule

- `runner/report.py` — pure: reads `compare.json` + each target's `run.json` and probe files,
  returns per-attempt measurements, per-task aggregates and the summary. **Never opens
  `events.ndjson`** (D48).
- `runner/decide.py` — `RULE_VERSION = 1`, parameters from the suite's `decision:` block. Per task,
  subject vs reference:

  0. **Capability** (D49, §5.10): if exactly one side is `notPossible`, the other wins
     (`decidedBy: 0-capability`). If both are, the task is excluded as invalid and listed. Otherwise
     both sides need N measured attempts, or the task is not evaluable (§5.1).
  1. More successful attempts wins.
  2. Tie → median calls **over successful attempts**; wins if `|a−b| / max(a,b) >= callsMargin` (0.20).
  3. Tie → fewer unrecovered errors (sum over attempts).
  4. Tie → median tokens over successful attempts; wins if the relative gap `>= tokensMargin`.
  5. Otherwise a tie (counts in the denominator).

  Each task records `winner` (`subject` | `reference` | `tie`), `decidedBy` (0–5) and the margin
  (how far the decisive values were from flipping), so fragile wins are visible.

  Gaps in the spec, closed (decided, §9):
  - **Both sides 0/N:** a tie — steps 2–4 would otherwise reward whoever gives up faster.
  - **Token margin:** 10 % — token totals always differ, so without a margin step 4 would never
    return a tie and would flip between runs.
  - **Calls:** median over successful attempts only.
  - **Tokens unavailable** (gateway returns no usage): step 4 falls back to `resultBytes` with the
    same margin, and `decidedBy` says `4-bytes`.
- **Run cost:** `summary.json` records the comparison's real cost: total tokens (loop and report,
  per target), wall time overall and per target, and attempt counts. No ceiling is enforced in v1
  (decided, §9). The first official baseline's figures are what a ceiling is later set from.
- **Summary indicators:** KR2.1 = subject wins / evaluated tasks, **always shown split** into wins
  by capability (step 0) and wins by measurement (steps 1–4), because the two say different things
  about the product; stumbles per task = total
  stumbles / (tasks × N), per target; % of tasks with any stumble, per target. Not-evaluable tasks
  are listed with their reason.
- **`summary.json`** (versioned `summarySchemaVersion`) holds everything; **`summary.md`** is the
  readable projection: headline, the freshness status (§5.9), a per-task table (9 items × 2 targets,
  or `not possible: <reason>` in place of the items, winner, criterion), the
  stumble backlog (frictions + suggestions grouped by `kind`), and the pins. It contains counts and
  verdict text only — never raw tool results — because the summary is the copy-paste path and
  redaction is still not built (D15).
- `make mcp-report RUN=<compareId>` re-derives the summary from files, so a rule change can be
  re-applied to an old run (with the new rule version recorded), and `mcp-compare` calls it at the end.

### 5.7 Token cost

- Each `AIMessage` from `ChatOpenAI` carries `usage_metadata` (input, output, cached-input tokens)
  when the gateway returns usage. `record()` (`agent.py:265`) sums it over the tool loop as
  `usage.loop`, and records the reporting call separately as `usage.report`, which is **not** cost:
  it is the instrument talking, not the task.
- Record `response_metadata.system_fingerprint` and the model id the gateway actually served, per
  turn, for the reproducibility pins (§6).
- **Expect priming to dominate.** Input tokens include the whole tool catalogue on every turn. From
  the 2026-08-19 ACE estimate (~2.1 KB per Holded tool, ~180+ tools; ~28 Etendo tools), Holded pays
  on the order of ~100k input tokens per turn against ~15–20k for Etendo (bytes ÷ 4, an estimate).
  Criterion 4 will therefore very likely favour Etendo Go on catalogue size alone. That is a real
  cost to the agent and the spec asks for it, but the `/mcp-ace-comparison` skill insists priming
  (ACE-p) and per-task cost (ACE-v) are never merged. Plan: the decision uses total loop tokens as
  the spec says; the summary also shows `priming ≈ catalogueTokens × turns` and the remainder, so
  the reader can see which half decided (decided, §9).

### 5.8 The `okr` suite — seeded with the `/mcp-comparison` tasks, grown incrementally

Decided (§9): no 30-task big bang. The suite starts from the five frozen `/mcp-comparison` tasks
(`.claude/skills/mcp-comparison/SKILL.md`, "The frozen task suite"), each rewritten to be isolated
(own setup, own marker, no reliance on tenant state or on a sibling probe), and grows toward ~30
one approved task at a time. Ids are permanent (D13), descriptive and prefixed by category
(`q-` query, `w-` write, `f-` multi-step flow, `e-` error).

| Frozen task | `okr` id (proposed) | Isolated form | Etendo Go | Holded |
|---|---|---|---|---|
| 1. Customer invoice for one product, mark it issued | `w-invoice-one-product-issued` | baseline customer + baseline product; `expectEffect` = a completed invoice tagged with the marker | possible | **not possible** (goal): no invoice creation in its MCP |
| 2. Pending invoices and amount outstanding | `q-pending-invoices-outstanding` | setup creates a customer named with the marker and two completed invoices for it; the question is scoped to that customer; `expectAnswer` = the two numbers and the total | possible | **not possible** (setup): invoices cannot be created |
| 3. One product with sale price, purchase price and stock | `q-product-prices-stock` | setup creates a product named with the marker, with both prices and a stock quantity; `expectAnswer` = the three values | to pilot: stock through Etendo's MCP needs an inventory document | possible (`create_product`, `update_product_stock`) |
| 4. Complete / process a sales order | `f-process-sales-order` | setup creates a draft order with one line, tagged; `expectEffect` = that order completed / approved | possible (`documentAction`) | possible (`approve_sales_order`); the read-back of its state is to verify, since no `get`/`list` of sales orders is visible |
| 5. Missing record + invalid write | `e-unknown-document`, `e-invalid-write` | split in two, because one probe should test one thing: ask for a document whose reference exists nowhere (`expectOutcome: refused`); ask for an order line with a negative quantity (`expectOutcome: refused`, `expect: none`) | possible | possible |

So the seed is **six** probes (task 5 split). Two are capability losses for Holded: the KR from the
seed alone will mostly measure capability, and that is why the summary splits capability wins
from measured wins.

**Growing the suite.** Each new task: proposed with its category and isolated form → approved by
the user → piloted alone on both platforms at concurrency 1 and 4 (§5.2) → merged with a permanent
id. An append-only `suites/okr.ids` list plus a test makes a removed or renamed id fail the build
(D13). Adding a task changes the suite sha, so `mcp-stability` refuses to compare runs across
different task sets, and every KR figure carries its task count.

Candidates for later growth, from today's ~13 business probes: `create-for-named-customer` → `w-`;
`find-own-order` → `q-` once it gets its own setup; the treasury collection and partial-payment
probes → `f-`; the treasury refusal probes → `e-`. `list-recent` reads tenant-wide state and stays out.

**Selection bias.** The KR is a function of which tasks are chosen: invoice- and payment-heavy
favours Etendo, contact/CRM-heavy favours Holded. Each task's proposal records the reason it is in
the suite (a common SMB back-office task, doable in the Etendo Go UI per D22), written before it is
first run against either platform.

### 5.9 Fresh environments (official numbers)

Decided (§9): official numbers come from a **freshly initialized local Etendo** and a **freshly
initialized Holded account**. Proposed meaning and verification:

- **Fresh** = initialized for this comparison, then seeded with `make mcp-seed`, with no other
  business activity. Order: initialize → seed → `mcp-compare`.
  - Etendo: a new database from install plus a new tenant (the `local-env` / `etendo-worktrees`
    flow), with `make dev` serving `:3100`.
  - Holded: a newly created account (or one reset by Holded), connected through its MCP.
- **Verified at preflight, through each platform's MCP only**, against a per-platform checklist in
  `fixtures/fresh.<platform>.yaml`:
  1. *No transactional documents:* the count of every document type the MCP can list (orders,
     invoices, payments, purchases, quotations, shipments …) is 0.
  2. *Master data is exactly the baseline:* every listable master-data type holds the baseline
     records plus an allowlist of what initialization itself creates (captured once from a freshly
     initialized environment and versioned with the checklist).
  3. *No harness leftovers:* nothing carries a marker-shaped value.
  4. *Baseline hash matches* (`fixtureHash`, §5.4).
  An entity type the MCP cannot list is recorded as `unverified`, never assumed clean. That gap is
  likely on Holded for contacts and products (§5.4).
- **Recorded** in `compare.json` per target: `freshness.status` (`fresh` | `clean` | `dirty`),
  each check with its counts, `checkedAt`, the tenant or account id, and an operator-declared
  `--initialized-at`. A run is **official** only if both targets are `fresh`. Otherwise
  `summary.md` says "unofficial" in its headline, and the run is still fully reported.
  `clean` (checks 1–3 fail only on records tagged with a previous run's markers) is recorded as a
  diagnostic label only; it is never official.
- **The stability pair (decided, §9).** Run B requires re-initializing **both** environments
  (local Etendo and the Holded account), then seeding again, exactly like run A. `clean` is not
  accepted. `make mcp-stability` refuses a pair unless both runs are official, i.e. every target
  was `fresh` in both.

### 5.10 "Not possible on this platform" (D49)

- **Declared, not inferred.** A per-platform block may say:

  ```yaml
  platforms:
    holded:
      notPossible:
        kind: goal            # goal | setup
        reason: "Holded's MCP has no tool to create an invoice."
        missingTools: [create_invoice]
  ```

  It is declared rather than inferred from a failed attempt because an agent cannot tell "this does
  not exist" from "I did not find it" (D38). A failed attempt stays a failed attempt.
- **Checked against the live catalogue at preflight.** Every name in `missingTools` must be absent
  from that target's `tools/list`. If one has appeared, the declaration is stale: the task is marked
  `invalidDeclaration` (not evaluable, printed in the summary), so a vendor update cannot keep
  awarding a loss silently. A declaration with no `missingTools` (e.g. the tool exists but lacks a
  needed field) is allowed, but is flagged `unchecked` in the summary.
- **Recorded as a first-class outcome.** No agent attempt runs (no budget is spent). The target's
  run gets `probes/<id>/not-possible.json` with `outcome: notPossible`, the declaration, the
  catalogue sha it was checked against and the check result. In `summary.json` the target's entry for
  that task is `capability: notPossible` in place of the 9 items. The summary counts these
  separately from failed attempts everywhere: per task, in the KR split (§5.6) and in a "capability
  gaps" section that lists each gap with its reason. That section is direct backlog material for
  whichever side lacks the capability.
- Symmetric. Etendo Go can be `notPossible` too, and per D22 that is a finding against its MCP.

## 6. Non-determinism and reproducibility

**What temperature 0 does not give.** Greedy decoding is not deterministic on hosted models:
batching, mixture-of-experts routing, floating-point order and silent model updates behind a
stable id all change outputs. Some reasoning models ignore or reject `temperature`. The OpenAI
`seed` parameter is best-effort. So the plan treats the agent as a stochastic process and makes the
**rule** robust, not the model:

- N = 3 attempts per side, and every decisive criterion objective (§3), so the only variance left
  is the agent's behaviour, not a judge's.
- Margins on steps 2 and 4, so a 9-vs-10-calls median does not decide a task.
- **Parallelism adds a source of variance** (contention on one tenant). Every attempt's real
  schedule is recorded, tasks that behave differently at concurrency 1 and 4 are `exclusive`
  (§5.2), and `mcp-stability` reports the concurrency used by both runs — it does **not** refuse a
  pair over it (as implemented, S4): concurrency is a lever of §6, so it may differ between A and B
  and is shown next to the agreement instead.
- A per-task **fragility flag**: a winner decided by one attempt in step 1 (e.g. 3/3 vs 2/3), or by
  a margin within 5 points of the threshold. Fragile tasks are the ones expected to flip.

**How the 90 % criterion is measured.** `make mcp-stability A=<compareId> B=<compareId>` (pure, from
files): over tasks evaluable in both runs, agreement = same `winner` (a tie equals a tie) / tasks.
It refuses to compare runs whose pins differ (below), or prints the differing pins first. It also
reports agreement over non-fragile tasks only, which shows whether instability is concentrated.

**Honest expectation.** With N = 3 and success-based ranking, a task whose true success rate is
around 2/3 on both sides will flip often. If the first pair of runs lands under 90 %, the levers,
in order: raise REPEAT for the whole suite (5), lower concurrency, widen margins, then — only with a recorded rule
version bump — treat fragile step-1 wins as ties. The 90 % target may not be reachable at N = 3; the
plan treats that as a finding to report, not something to tune away.

**What each comparison records (`compare.json`)** — everything that, if changed, invalidates a
stability comparison, **except** the run's own identity and timing (`compareId`, start/finish,
`--initialized-at`, `checkedAt`), `freshness` (checked separately: both runs must be official) and
**concurrency, which is reported next to the agreement, not compared** (S4, `report.py`
`_VOLATILE_PINS`):

| Pin | Source |
|---|---|
| harness commit + dirty flag | `git rev-parse HEAD` / `git status --porcelain mcp-tests` |
| suite file, `sha` (`suite.py:65-68`), suite `schemaVersion`, frozen date | suite |
| `RULE_VERSION`, rule parameters, `MATCHER_VERSION`, report version | `decide.py`, suite |
| `promptVersion` (`agent.py:32`), `VERDICT_SCHEMA_VERSION` (`verdict.py:13`) | code |
| provider, requested model id, served model id(s), temperature, seed, `system_fingerprint`s | config + responses |
| per target: url, platform, `serverInfo` name/version from MCP `initialize` (today discarded at `mcp_client.py:629`), `tools/list` catalogue sha and tool count, `fixtureHash` | preflight |
| Etendo `serverBuild` | `serverInfo.version` if it carries the module version; otherwise still null with a stated reason (D1) |
| schedule seed, concurrency per target, REPEAT, maxSteps, maxResultChars; per attempt start/finish and worker slot | runner |
| `freshness` per target (status, every check with counts, account/tenant id, `--initialized-at`) — §5.9 | preflight |
| `notPossible` declarations and their catalogue check results — §5.10 | preflight |

Holded's build is not ours to read; its catalogue sha is the proxy that tells two runs apart.

## 7. Slices

Ordered; each is independently mergeable and leaves `make mcp-test` working as today. Tests are
Python `unittest` under `mcp-tests/tests/`, written by **tester-functional** (the developer writes
only the failing repro test of a bug fix). Each slice extends the existing test file for the unit
it touches before creating a new one (`docs/testing/test-reuse-policy.md`).

| # | Slice | Size | Depends on | Tests (tester-functional) |
|---|---|---|---|---|
| S1 | **Run record v4 groundwork:** `finalAnswer`, `usage.loop` / `usage.report`, served model + fingerprint, `serverInfo` + catalogue sha at preflight, harness commit, persisted `silentWrong`. `RUN_SCHEMA_VERSION` 3 → 4. | S | — | final answer is the last loop message, not the report; usage summed over loop only; missing usage → null, not 0; v3 files still load in `ui/runs.py` |
| S2 | **REPEAT** (D43): `--repeat`, attempts layout, per-attempt marker, harness-error rescheduling, `ui/runs.py` reads both layouts. | M | S1 | N attempts → N files; marker unique per attempt; harnessError attempt rescheduled and capped; `attempt` in events; teardown still runs per attempt |
| S3 | **Multi-target, parallel, compare orchestrator** (D44): extract the per-attempt body of `cli.py:446-616` into a function; `--targets`, `--subject`, `platform` in config; targets concurrent, in-target pool with `--concurrency` / `run.concurrency` (per-target override) and `exclusive` probes; seeded schedule; all-target preflight; `compare.json`; `make mcp-compare`; Holded target in `config.example.toml` (bearer first, OAuth fallback). | M–L | S2 | schedule deterministic for a seed; concurrency never exceeds K; an `exclusive` probe runs alone; a 429 is rescheduled as a harness error; one attempt's failure does not cancel its siblings; teardown still runs in `finally` under cancellation; preflight failure on one target aborts all; `compare.json` carries every pin of §6 |
| S4 | **Metrics + decision rule + summary** (D47, D48): `report.py`, `decide.py` incl. step 0 capability, `summary.json` / `summary.md` with the KR split and the freshness/official label, `make mcp-report`, `make mcp-stability`. Can start in parallel with S2–S3 against hand-built fixture run directories. | M | S1 (shapes) | each of the 9 items from fixture files; every decision step incl. margin edges (19 % vs 20 %), both 0/N = tie, one side `notPossible` → other wins, both `notPossible` → excluded, tokens missing → bytes, not-evaluable tasks out of the denominator; KR split capability/measured; stumble indicators; unofficial label when a target is not `fresh`; report identical with `events.ndjson` deleted; stability agreement incl. tie = tie and pin mismatch |
| S5 | **Suite v2** (D45, D46, D49): `platforms:` blocks, `{{fixture.*}}`, `expectAnswer` matcher, `expectOutcome: refused`, `where:`, `notPossible` declarations + their preflight catalogue check + `not-possible.json` record, Holded payload shapes in `count_rows`, tool-name lint, v1 suites unchanged. | M–L | S3 | number normalisation table (Spanish and English formats, currency signs); accent-insensitive text; `none:` lists; refusal rule; `notPossible` with a tool that now exists → `invalidDeclaration`; without `missingTools` → `unchecked`; no agent attempt runs for a `notPossible` platform; lint catches a tool name; v1 suite loads byte-for-byte as before |
| S6 | **Baseline + freshness** (D50): `fixtures/okr-baseline.yaml`, `make mcp-seed` through each platform's MCP only (no REST, no SQL), preflight baseline verify + `fixtureHash`, `fixtures/fresh.<platform>.yaml` checklists + init allowlists captured from a freshly initialized environment, `freshness` in `compare.json`, `--initialized-at`. | M | S5 | verify detects a missing / changed baseline record; hash stable across runs; each freshness check: fresh / clean (only previous-run markers, diagnostic) / dirty; unlistable entity → `unverified`, never clean; `mcp-stability` refuses a pair that is not official on both sides |
| S7 | **`okr` suite, seeded and extendable:** the six probes of §5.8 (the five `/mcp-comparison` tasks, task 5 split), with Holded `notPossible` declarations where they apply, each piloted on both fresh platforms at concurrency 1 and 4; append-only `suites/okr.ids`. Later tasks are added one at a time through the same approval + pilot loop, outside this ticket's critical path. | M | S5, S6 | id-list test (append-only, no rename); every probe declares, for every platform, either a verification or `notPossible` |
| S8 | **Official baseline + acceptance:** freshly initialize local Etendo and the Holded account, seed, run the comparison (official); re-initialize **both** environments and seed again, run again; `mcp-stability`. If < 90 %, apply §6 levers with a rule version bump. Summary pasted into `docs/mcp-evaluation/` by hand (D6). | S–M | S7 | — (an acceptance run, not a test) |

Docs per slice: the design doc's §6.2, §6.6, §7, §10 and §12 rows updated in the same change as the
code (self-documentation policy); `mcp-tests/README` / `make help` lines for the new targets.

## 8. Risks

- **The KR will mostly measure capability at first.** With MCP-only seeding, every invoice- or
  payment-centred task is `notPossible` on Holded (§5.4); in the six-probe seed that is two tasks.
  The capability/measured split (§5.6) keeps this visible; it does not make it go away.
- **Holded read-back:** if its MCP cannot read a sales order back, `f-process-sales-order` cannot be
  verified there (`effectVerified: null`, a harness error, not a loss). To check at the S7 pilot.
- **Contention under parallelism** (§5.2) can turn into flaky results; mitigated by `exclusive` and
  by lowering concurrency, at the cost of wall time.
- **Cost is unbounded in v1 (decided: measure first).** At ~30 tasks × 2 targets × 3 attempts = 180 attempts per comparison (360 for
  the stability pair). With Holded's catalogue in every turn, a rough order of magnitude is tens of
  millions of input tokens per comparison (estimate; gateway prompt caching may cut it sharply).
  Wall time drops roughly by the concurrency factor against the ~6–8 h a sequential run would take;
  the six-probe seed is a small fraction of either. The baseline run records the real figure
  (§5.6), and that figure sets the ceiling.
- **Rule fragility at N = 3** (§6) — may need REPEAT = 5, doubling the budget.
- **D8 in practice:** every result still comes from one gateway model; a vendor bias applies to both
  sides equally, but stays unmeasured.
- **Holded drift:** Holded can change its MCP between the two stability runs; the catalogue sha
  detects it, it cannot prevent it.

## 9. Decisions and open questions

### Decided (user, 2026-10-14)

| # | Decision | Where it lands |
|---|---|---|
| 1 | A disposable Holded account exists; writes there are allowed, including invoices, payments and `approve_*` / `send_*`. | §5.4, S8 |
| 2 | No workaround outside the MCP. Whatever Holded's MCP cannot do, Holded cannot do: the task is recorded as **not possible on this platform**, a first-class outcome distinct from a failed attempt, and Holded loses it. No REST seeding. | §5.4, §5.10, D49, S5, S6 |
| 3 | Parallel from v1: targets concurrently, probes in parallel within a target up to a configurable limit. | §5.2, D44, S3 |
| 4 | The suite starts from the five `/mcp-comparison` tasks, rewritten to be isolated, and grows incrementally toward 30. The user approves each task; ids are permanent. | §5.8, S7 |
| 5 | Official numbers run against a freshly initialized local Etendo and a freshly initialized Holded account, and the run records that both were fresh. | §5.9, D50, S6, S8 |
| 6 | Model `openai/gpt-5.2`. | config |
| 7 | Holded auth: API key as bearer first, OAuth as fallback. | §5.2, S3 |
| 8 | Both sides 0/N → tie; token margin 10 %; median calls over successful attempts only. | §5.6 |
| 9 | Tokens decide on the total, tool catalogue included; the per-task breakdown (priming vs remainder) is shown. | §5.7 |
| 10 | Item 4 = "the first call did not error". | §3 |
| 11 | No token or time ceiling in v1: measure first. The first official baseline records the real cost (tokens, wall time), and that figure sets the ceiling later. Defaults: concurrency 4, REPEAT 3. | §5.6, §8 |
| 12 | Frozen task 5 is split into `e-unknown-document` and `e-invalid-write`, so the seed suite has six probes. | §5.8, S7 |
| 13 | Stability run B requires re-initializing both environments (local Etendo and Holded). `clean` is not accepted. | §5.9, S8 |

### Still open

None.
