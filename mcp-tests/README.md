# mcp-tests — agentic MCP test harness

A self-contained Python tool that fires natural-language tasks ("probes") at an MCP server through a
real LLM agent, and records what happened: the agent's verdict, the full tool-call transcript, and an
objective check of the effect or the answer. It also runs a **reproducible comparison** of two MCPs
(Etendo Go vs Holded) and turns it into a KR figure.

This file is the operator guide. The *why* lives elsewhere:

| Document | What it holds |
|---|---|
| `docs/plans/2026-09-11-mcp-test-harness-design.md` | The design and the record of what is built: file formats (§6.1, §6.2), metrics (§6.6), every decision (§10, D1–D50) |
| `docs/plans/2026-10-14-mcp-tests-reproducible-comparison-plan.md` | The Etendo Go vs Holded comparison (ETP-5750): decision rule, freshness, slices, open questions |
| `findings/README.md` | How a product defect surfaced by a run is written down |
| `docs/mcp-evaluation/mcp-improvements-registry.md` | The only place an IMP-* status lives. The harness produces evidence, never a status |

Every command below is a `make` target run from the **repository root**.

## 1. Prerequisites

1. **`uv`** on the `PATH`. Every target runs `cd mcp-tests && uv run …`, which creates and syncs
   `mcp-tests/.venv` on first use; nothing touches the system interpreter. To create it up front:
   `cd mcp-tests && uv sync` (add `--extra ui` for the optional Streamlit panel).
2. **`config.toml`** — copy the example and adjust it. It is gitignored.

   ```bash
   cp mcp-tests/config.example.toml mcp-tests/config.toml
   ```

   The file holds values, never secrets: for every credential it stores only the **name** of the
   environment variable that holds it. It wins over the environment; the only overrides are the
   visible flags `MODEL=` and `--max-steps`.
3. **Tokens, through environment variables:**

   | Variable (as named in `config.example.toml`) | For |
   |---|---|
   | `OPENAI_API_KEY` (`[provider] api_key_env`) | The LLM gateway. Without it nothing runs (exit 2). |
   | `MCP_TEST_TARGET_HOLDED_TOKEN` (`[targets.holded] token_env`) | Holded's API key, sent as a bearer. **Not yet verified against the live server**: if Holded rejects it, switch that target to `auth = "oauth"` and record which one worked in `config.example.toml`. |

   Etendo Go targets use `auth = "oauth"`: the first run opens a browser, and the token is cached
   in `mcp-tests/.auth/<target>.json` (0600, gitignored). `make mcp-login TARGET=<t>` pre-warms it;
   it is never required.
4. **A reachable target.** `local` is `http://localhost:3100/mcp` and needs `make dev` running (the
   Vite dev server serves the OAuth `.well-known` documents and proxies `/mcp`; Tomcat on `:8080`
   alone does not). Every target that takes part in a comparison needs `platform = "etendo-go"` or
   `"holded"` in its config block.

Tests: `cd mcp-tests && .venv/bin/python -m unittest discover -s tests -t .`

## 2. Commands

| Command | What it does | Key variables (default) |
|---|---|---|
| `make mcp-test` | One suite against one target. Writes `runs/<runId>/`. No summary. | `TARGET` (`local`), `SUITE` (`sales-order`), `PROBE`, `MODEL`, `REPEAT` (1), `CONCURRENCY` (1) |
| `make mcp-seed` | Loads the baseline dataset into a **freshly initialized** target through its own MCP and writes `.seeds/<target>.json`. | `TARGET` (required), `FIXTURE` (`okr-baseline`), `INITIALIZED_AT` (required), `CAPTURE=1` |
| `make mcp-compare` | The same suite against two targets, concurrently, under one `compareId`; ends by writing `summary.json` + `summary.md`. | `TARGETS` (`local,holded`), `SUITE`, `SUBJECT` (first target), `REPEAT` (3), `CONCURRENCY` (4), `SEED` (random), `MODEL` |
| `make mcp-report` | Re-derives `summary.json` + `summary.md` from a comparison's files. Never contacts an MCP or an LLM. | `RUN` (`<compareId>` or a path, required) |
| `make mcp-stability` | Winner agreement between two comparisons (the ≥ 90 % acceptance target). | `A`, `B` (`compareId`s, required) |
| `make mcp-login` | Pre-warm or refresh a target's OAuth token. Never a prerequisite. | `TARGET` |
| `make mcp-ui` | The optional Streamlit panel (design §9); it reads `runs/` and can launch single runs. | — |

What each variable means:

- **`SUITE`** — a file under `suites/` (bare name or path). A comparison verifies on both sides only
  with a **v2 suite** (`schemaVersion: 2`, a `platforms:` block per platform). The `okr` comparison
  suite is not written yet (plan S7); `suites/examples/collect-invoice.v2.yaml` shows the shape.
- **`TARGETS`** — exactly two config target names, comma-separated. **`SUBJECT`** is the side whose
  win rate is the KR.
- **`REPEAT`** — measured attempts per probe. Each attempt is a fresh MCP session, conversation and
  `{{marker}}`. An attempt with a harness error is kept on file and replaced (at most `REPEAT`
  replacements per probe); a probe that still lacks `REPEAT` measured attempts is *not evaluable*.
- **`CONCURRENCY`** — attempts in flight per target. A target's own `concurrency` in config can only
  lower it (rate limits). `mcp-test` ignores `[run] concurrency` and stays sequential unless given.
- **`SEED`** — the seed of the shuffled attempt order. It is a pin: **run B of a stability pair
  passes run A's seed** (printed at start, `compare … · seed N`, and kept in `compare.json →
  schedule.seed`).
- **`FIXTURE`** — a baseline dataset under `fixtures/` (`okr-baseline` is a draft, not yet piloted).
- **`INITIALIZED_AT`** — when *you* initialized the environment, ISO-8601 with a timezone
  (`2026-10-20T09:00Z`). Operator-declared; it is recorded in the manifest and in every comparison.
- **`CAPTURE=1`** — seeds nothing. On a freshly initialized, **not yet seeded** target it prints the
  master data initialization itself created, as `allow:` lists for `fixtures/fresh.<platform>.yaml`.
  Paste them, review them, set `allowlistCaptured: true`, and commit the checklist. Until that is
  done for a platform, its master-data check reads `unverified` and no run on it can be official.

Exit codes: `0` ok · `1` the run completed but some attempt has a harness error · `2` refused before
measuring anything (config, auth, preflight, a dirty or half-seeded target, an invalid stability
pair).

## 3. The official-run workflow

An **official** number needs every target `fresh` (D50): initialized for this comparison, seeded,
and with no other activity. Freshness is proven at preflight through each target's own MCP, never
through REST or SQL. The order is always **initialize → seed → compare**.

> **Holded cannot be `fresh` today.** Its MCP offers no list tool for contacts, products, sales
> orders, estimates, proformas, purchase orders or waybills, so those checks read `unverified` and
> every comparison against Holded is **UNOFFICIAL**. Whether to accept that is plan §9, open
> question 14 — still undecided. The checks follow the *live* `tools/list`, so the day Holded adds
> those tools they run for real with no edit. The workflow below is still the one to follow.

**Once per checklist** (when `allowlistCaptured: false`): initialize the environment, then run
`make mcp-seed TARGET=<t> CAPTURE=1` *before* seeding, and commit the reviewed `allow:` lists.

**Run A**

```bash
# 1. Re-initialize BOTH environments.
#    Etendo: a new database from install + a new tenant (the local-env / etendo-worktrees flow),
#            with `make dev` serving :3100.
#    Holded: a newly created (or Holded-reset) disposable account.

# 2. Seed both, declaring when each was initialized.
make mcp-seed TARGET=local  FIXTURE=okr-baseline INITIALIZED_AT=2026-10-20T09:00Z
make mcp-seed TARGET=holded FIXTURE=okr-baseline INITIALIZED_AT=2026-10-20T09:05Z

# 3. Compare. Note the compareId and the seed it prints.
make mcp-compare SUITE=okr TARGETS=local,holded REPEAT=3
```

**Run B** — the same procedure from scratch, with run A's seed:

```bash
# 1. Re-initialize BOTH environments again. `clean` (only old markers left) is not accepted.
# 2. Seed again with the NEW initialization instants, then compare with run A's seed.
make mcp-seed TARGET=local  FIXTURE=okr-baseline INITIALIZED_AT=<new instant>
make mcp-seed TARGET=holded FIXTURE=okr-baseline INITIALIZED_AT=<new instant>
make mcp-compare SUITE=okr TARGETS=local,holded REPEAT=3 SEED=<run A's seed>

# 3. Agreement.
make mcp-stability A=<compareId of run A> B=<compareId of run B>
```

Why the new `INITIALIZED_AT` matters: the seed never duplicates, so it decides what to do from
`.seeds/<target>.json`. An `INITIALIZED_AT` different from the manifest's `initializedAt` is your
claim that the environment was re-initialized: the seed then ignores the old manifest, runs every
preflight refusal as for a new environment and, once it is about to create, moves the old
manifest to `.seeds/archive/<target>-<seedId>.json` (it prints that it did) and seeds with a new
`seedId`. A false claim is still caught wherever the baseline is readable: on Etendo a target that
still holds its baseline records is refused, and the old manifest stays where it was. On
**Holded**, which cannot read its baseline back, the claim is all the seed has — so re-initialize
before passing a new instant. With the **same** `INITIALIZED_AT` nothing changes: a complete
manifest whose baseline still holds is a no-op, anything else is refused. Never delete or move
the manifest of an environment that is still seeded by hand: it is the only thing that stops a
second seed from creating the Holded records again.

The seed refuses a target it can *prove* is not fresh (documents present, unexplained master data,
harness-marker rows, a half-finished earlier seed) and only warns about what it cannot judge
(`unverified`). A refused or interrupted seed leaves an incomplete manifest: re-initialize.

`mcp-stability` exits 2 (the agreement is printed but does not count) when any pin differs (model,
suite sha, rule version, catalogue sha, fixture hash…), when either run is unofficial, or when run B
reuses run A's `seedId` on any target. Concurrency may differ; it is shown, not compared.

## 4. Reading `summary.md`

`runs/<compareId>/summary.md` is the copy-paste projection of `summary.json`. It holds counts and
verdict text only, never tool results or the agent's final answer. Section by section:

**Headline — official or not, and the KR split.** `OFFICIAL` only when every target is `fresh`;
otherwise `UNOFFICIAL`, and the figure is still fully reported but is not a KR number. The KR line
is *subject wins / evaluated tasks*, always split in two because they say different things about
the product:

- **won by capability** — the other platform declared the task `notPossible` (decision rule step 0);
- **won by measurement** — both sides ran it and steps 1–4 decided (successes, median calls with a
  20 % margin, unrecovered errors, median tokens with a 10 % margin).

Ties count in the denominator; not-evaluable and excluded tasks do not. The next line pins the rule
version, its parameters sha, `REPEAT` and the report version.

**Freshness.** One row per target (`fresh` > `clean` > `unverified` > `dirty`, from least to most
severe; `unknown` = no checklist), with the initialization instant and `seedId`, then one line per
check that is not ok — e.g. `contacts: unverified — tool not offered: list_contacts …`. `clean` means
only leftovers of earlier harness runs; it is a diagnostic label and never official.

**Tasks.** Two rows per task (subject, reference) with the nine items: success, consistency
(successes/N), median calls, first-call success (k/N), unrecovered errors, self-corrected errors,
stumbles, silent-wrong attempts, median cost (tokens · bytes, with the catalogue *priming* estimate).
The last columns are the winner and the step that decided it. In place of the items a side may show
`not possible (<kind>): <reason>`, `invalid declaration (…)` or `not evaluable: <reason>`.

- **Fragile results** carry `(fragile)` next to the winner: a step-1 win by a single attempt (3/3 vs
  2/3), a step-3 win by a single error, or a calls/tokens gap within 5 points of its threshold.
  These are the tasks expected to flip between runs; read the headline with their count in mind.
- **Silent wrong** = the agent reported success while the objective check failed. It never decides
  a winner (that attempt already failed), but it is the most serious per-attempt signal.
- **Stumbles** are partly self-reported (the agent's own "wasted calls"); they never decide a winner.

**Stumble indicators.** Stumbles per attempt and the share of tasks with any stumble, per target.

**Capability gaps.** Every `notPossible` declaration that counted, with its reason and the missing
tools. This is direct backlog material for whichever side lacks the capability. A declaration
without `missingTools` is `unchecked`; one whose missing tool has since appeared is an *invalid
declaration*, makes the task not evaluable, and is never awarded.

**Catalogue changes since the previous comparison.** Per target, the tools added and removed since
the previous comparison of the same target (same name and URL) under `runs/`, or `noPrevious`. A
bold line flags a change to a tool that a `notPossible` declaration or a freshness checklist names:
**review that declaration** — a vendor that ships the missing tool turns a capability win into an
invalid declaration, and a new list tool turns an `unverified` freshness check into a real one.

**Success on the agent's word** (only when present). Tasks whose success rests on the agent's own
report — a read refusal with no objective check. Treat them with that in mind.

**Not counted.** Tasks excluded (both sides `notPossible`) or not evaluable (too few measured
attempts, an invalid declaration), each with its reason.

**Stumble backlog, run cost, pins.** Frictions and suggestions verbatim, grouped by phase and kind;
attempts, harness errors, tokens and wall time per target; and every pin needed to say what was
measured. A number transcribed into `docs/mcp-evaluation/` is always transcribed by hand (D6).

## 5. Data hygiene

`runs/`, `.auth/`, `.seeds/` and `config.toml` are gitignored. **`runs/` is not redacted** (D15 is
not built): tool results and tracebacks are stored verbatim, so never paste a probe file anywhere
public. `summary.md` is the copy-paste path: it carries no tool result, but the verdict text in it
is not redacted either, so read it before sharing it.
