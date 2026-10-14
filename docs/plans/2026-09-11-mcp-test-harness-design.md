# MCP Test Harness + Telemetry — Design (v1.0)

**Status:** design **and**, since 2026-09-14, a partial record of what exists ·
**Date:** 2026-09-11, last updated 2026-09-14 · **Owner:** Valentin
**Related:** `docs/mcp-evaluation/` (manual benchmark), `/mcp-comparison` skill, IMP-* registry,
`mcp-tests/findings/` (D35)

> ### How to read this document
>
> Track A (§3–§12) started as a design. Much of it is now built, and this version says which parts.
> Where the implementation matched the design the text is unchanged. Where it diverged, the
> divergence is stated **in place** and the old text is not quietly rewritten to look like it was
> always right — the divergence is usually the more useful fact. §B2 and §B3b are the precedent.
>
> **Nothing described here is tested.** No test was written for any of the 2026-09-14 work, on
> either track: `mcp-tests/` has no test suite at all, and the Java classes added for the `$ref`
> fix and for `neo_feedback` v3 ship without one. Wherever this document says something "is
> implemented", that means *the code exists and was exercised by hand against a live server* —
> never *it is covered*. Tests are outstanding on both tracks and are not scheduled here.
>
> **Improvement status is not here.** `docs/mcp-evaluation/mcp-improvements-registry.md` remains
> the single source of truth for whether an IMP-* is open, partial or resolved. This document
> records design and evidence; it never states an IMP's status (D35).

---

## 1. Problem

Today the Etendo GO MCP is evaluated by a **human driving an agent by hand** through the
`/mcp-comparison` skill. That produces excellent depth (the IMP-* investigations) but it is:

- **Not repeatable** — each run is a fresh improvisation; two runs are not comparable.
- **Not cheap** — a full run costs hours of human attention.
- **Not regression-proof** — nothing tells us a shipped fix broke a previously working flow.

We want a **command** (and a small panel) that fires a fixed set of agent tasks at a chosen MCP
endpoint and returns structured feedback, so the same suite can be re-run after every wave.

## 2. What this is NOT

- Not a unit test suite for the Java MCP code (that already exists).
- Not a replacement for the IMP-* registry. **Status still lives only in the registry.** The harness
  produces *evidence*; a human decides what it means.
- Not (in v1) a Holded comparison. Single-target only.
- Not a CI gate. It is a measurement instrument (§7).

---

## 3. Core concept

```
suite file (prompts)  ──▶  runner  ──▶  LLM agent  ◀──MCP──▶  Etendo GO server
                              │             │
                              │             ▼
                              │   structured verdict + raw transcript
                              ▼             │
                        events.ndjson ◀─────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Streamlit UI        run report (JSON + MD)
```

*(As built: the Streamlit UI and the JSON run files exist; the MD report does not — see §6.6.)*

One **probe** = one natural-language task given to a fresh agent with the MCP tools attached, e.g.
*"Create a sales order for the default customer, with no lines."*

### Isolation rules (v1)

| Axis | v1 decision |
|---|---|
| Between probes | **Fully independent.** New conversation, new MCP client, no shared memory. |
| Order | Irrelevant. Probes may run in any order. |
| Between files | Irrelevant. One file per window is just organisation. |

Chained scenarios ("create the order, *then* book it") are v2. Independence is what makes the suite
diff-able.

---

## 4. Layout

`mcp-tests/` is a **self-contained Python tool**. It shares no code with `cli/` (Node) and does not
belong to the app build.

Annotated with what exists as of 2026-09-14. **✅ built · ❌ not built.**

```
mcp-tests/
  pyproject.toml                  ✅  (the UI is an optional `ui` extra)
  config.example.toml             ✅  see the Configuration note in §5 — the env-var scheme
                                      sketched below was NOT what got built
  config.toml                     ✅  gitignored
  suites/
    sales-order.yaml              ✅
    discoverability.yaml          ✅  (read-only probes: can a naive agent find its way?)
    full-flows.yaml               ✅  (one long chained write flow, Spanish, D21)
    business-partner.yaml         ❌  never written; discoverability.yaml covers that ground
  findings/                       ✅  D35. One dated file per product defect, plus a README
  runner/
    __init__.py                   ✅
    cli.py                        ✅  entry point, arg parsing, per-probe orchestration
    suite.py                      ✅  YAML load + prompt templating + `expectEffect` (D34)
    agent.py                      ✅  THE ONLY file that imports LangChain / a provider
    mcp_client.py                 ✅  MCP connection, bearer + OAuth (PKCE), effect-check helpers
    events.py                     ✅  append-only NDJSON event log (§6.5)
    verdict.py                    ✅  Pydantic schema for structured output (§6.3, now v3)
    prompts/probe_system.md       ✅  the naive system prompt, promptVersion 4 (D17/D20)
    redact.py                     ❌  NOT BUILT — D15 is unimplemented, see §6.7
    report.py                     ✅  comparison metrics, KR summary, stability (§6.6, D48) — reads files only
    decide.py                     ✅  the versioned decision rule, `RULE_VERSION` (§6.6, D47)
  ui/
    app.py                        ✅  Streamlit panel (§9)
    runs.py                       ✅  pure file-reading, no Streamlit import — the testable half
    launch.py                     ✅  shells out to the CLI (D11)
  .auth/                          ✅  gitignored token cache, 0600, never copied into runs/
  runs/                           ✅  gitignored (D6)
    .ui/                          ✅  the UI's own subprocess logs — not runs; skipped when listing
    20260911T1402-local-a3f1/
      run.json                    ✅  metadata header, written first
      events.ndjson               ✅  append-only, live
      probes/
        create-empty-default-customer.json   ✅
      summary.md                  ❌  not produced
      summary.json                ❌  not produced
```

Two absences are load-bearing rather than cosmetic and are called out where they belong: **§6.7**
(credentials are not scrubbed on the way to disk) and **§6.6** (no metric is derived by the tool —
a run is read by a human or by the UI).

### Suite file shape

```yaml
window: sales-order
probes:
  - id: create-empty-default-customer
    mode: write
    prompt: >
      Create a sales order for the default customer, with no lines.
      Put the reference {{runId}} in the order's description field.

  - id: create-simple
    mode: write
    prompt: >
      Create a sales order for Juan Perez with 3 ALE beers.
      Put the reference {{runId}} in the order's description field.

  - id: list-recent
    mode: read
    prompt: "Show me the last 5 sales orders with their totals."
```

`mode` is metadata for the human reading the suite. It gates exactly one thing (D34): a probe may
only carry an `expectEffect` if it is `mode: write`, and the loader refuses the suite otherwise. It
does **not** gate execution (D3), and the `MODE=` command-line subset it was also meant to drive was
never implemented — see §5.

A write probe's post-condition, as implemented (D34):

```yaml
  - id: create-empty-default-customer
    mode: write
    prompt: >
      Necesito armar un pedido para el cliente de siempre. Poné {{marker}} en la descripción.
    expectEffect:
      tool: neo_list
      args: { spec: sales-order, filter: "description==*{{marker}}*" }
      expect: atLeastOne          # atLeastOne | none
```

A probe may also declare a deterministic **`setup:`** and **`teardown:`** (D41): lists of MCP
tool calls the runner makes itself, outside the agent, each in a session of its own. Setup runs
before the agent; teardown runs after the agent and the effect check, in a `finally`, whatever
happened — including a setup that failed halfway.

```yaml
  - id: collect-full-sales-invoice
    mode: write
    prompt: "Cobrame entera la factura con referencia {{marker}}."
    setup:
      - tool: neo_create
        args: { spec: sales-invoice, entity: header, data: { description: "{{marker}}", … } }
        saveAs: invoice                      # result readable as {{steps.invoice.<path>}}
      - tool: neo_action
        args: { spec: sales-invoice, entity: header, id: "{{steps.invoice.id}}", action: documentAction, … }
    expectEffect: { … }                      # may use {{steps.…}} too
    teardown:
      - tool: neo_action                     # list what the agent left behind …
        args: { …, action: invoicePayments }
        saveAs: payments
      - tool: neo_action                     # … and undo each one
        forEach: "{{steps.payments.items}}"  # once per element, element is {{item.<path>}}
        args: { …, id: "{{item.paymentId}}" }
```

- `{{steps.<name>.<path>}}` reads a saved result; `<path>` is dotted and a numeric segment
  indexes a list. A value that is exactly one reference keeps its type; one embedded in text is
  spliced as text. The prompt may use it too (it is expanded after setup).
- An unresolvable reference fails the step **without calling the server** — for a destructive
  teardown call that is the safe answer.
- Setup stops at the first failure and the probe is **not measured** (`harnessError.kind:
  setup`, the agent never runs). Teardown keeps going after a failure.
- `teardownClean` is `false` as soon as **any** teardown step failed. There is no "expected
  failure": a step that only makes sense in some states is made conditional by reading the state
  first and looping over the answer — `neo_list` with `filters: {id: …, posted: "Y"}` saved as
  `posted`, then `forEach: "{{steps.posted.data}}"` runs the unpost zero or one times. That keeps
  the runner free of conditionals and every recorded failure meaningful.
- The calls are recorded in the probe file (`probes/<id>/attempt-<n>.json` since v5, §6.1) as `setup[]` and `teardown[]` (tool, resolved
  args, `ok`, `error`, capped `result`, `ms`) plus `teardownClean` (`null` = no teardown declared,
  `false` = something may be left on the server), and streamed as `setup_step` / `teardown_step`
  events. They are never part of `toolCalls[]` or `toolCallCount`: those stay the agent's.

**Probe ids are permanent** (D13). Never renamed, never recycled — same rule as IMP numbers. An id
is the only thing that lets us say *"this probe passed last week and fails today"*.

---

## 4b. How probes are written

**A probe is phrased the way a non-technical person with little knowledge of the system would ask
for it.** Not the way a developer would, and not the way the MCP would like to be asked.

The reasoning: the real user of an agent sitting on top of this MCP is a person who does not know
what an entity, a spec or a field is, and who may not know the system's own vocabulary. A probe
written in developer language measures a user who does not exist.

| Not this | This |
|---|---|
| "Create a `sales-order` record for the default business partner with no lines." | "Necesito armar un pedido para el cliente de siempre, después le cargo los productos." |
| "Create an order for BP `Juan Perez` with 3 units of product `ALE`." | "Hacele un pedido a Juan Pérez, tres cervezas de las ALE." |
| "List the last 5 sales orders including `grandTotalAmount`." | "¿Qué pedidos entraron últimamente y por cuánto?" |

### Vagueness is part of the measurement

Colloquial wording, a partial name, the wrong word for something, an unstated field the system needs
anyway — these are not noise to be cleaned out of the prompts. They are what the MCP will actually
receive in production. If the server only works when addressed in its own exact vocabulary, **that
is a finding**, and only a realistically-worded probe will surface it.

### The limit, and the arbiter: the UI

A probe is valid if **a human could carry the task out in the Etendo GO UI**, in that tenant, with
that data.

> **If it can be done in the UI, it must be possible through the MCP.**

That sentence is the whole acceptance criterion, and it does two jobs at once:

- **It validates the probe.** If nobody could do it in the UI either — the data does not exist, the
  window does not offer it, *"the usual customer"* identifies nothing — then the probe is broken, not
  the server. A failure there is unattributable and the probe wastes a slot in the run.
- **It qualifies the failure.** When a probe does fail, the question *"could a person have done this
  in the UI?"* has an objective answer, and a `yes` turns the failure into a defect claim with a
  concrete reference point: here is the window, here is the field, here is what a person does.

Ambiguity in the *wording* is wanted (that is what a real user sounds like); a task with **no
resolvable answer in the UI** is a broken probe. The probe author owns that check.

Corollary worth stating, because it is where most of the value will come from: the MCP and the UI are
served from the same configuration, so a gap between them is almost always a defect rather than a
design choice — and this criterion is what makes that gap nameable instead of arguable.

### Diagnosing a realistic probe

The earlier worry that a realistic probe fails for several reasons at once and therefore cannot be
diagnosed does **not** hold here, and it is worth saying why so nobody re-introduces artificial
probes later: the transcript records exactly which call broke (§6.1) and `frictions[].phase`
attributes each difficulty to `discovery | schema | write | action | read` (§6.3). Attribution comes
from the *recording*, not from keeping the task small. Probes therefore do not need to be narrowed
for diagnosability.

## 5. The runner

`make mcp-test` wraps the Python CLI.

```bash
make mcp-test TARGET=local SUITE=sales-order            # ✅ one suite against one target
make mcp-test TARGET=experimental SUITE=discoverability # ✅
make mcp-test SUITE=sales-order PROBE=create-simple     # ✅ one probe
make mcp-test SUITE=sales-order MODEL=gemini-3.6-flash  # ✅ visible model override
make mcp-login TARGET=experimental                      # ✅ pre-warm the OAuth token
make mcp-ui                                             # ✅ launch the Streamlit panel (§9)
```

**Diverged from the design above.** `SUITE=` is **required**, not optional: there is no "all
suites" mode, so the sketched bare `make mcp-test` does not run. `MODE=` and `REPEAT=` were never
implemented (§7 explains what that costs), and the CLI additionally grew `--interactive`, which the
design did not anticipate — the Streamlit UI spawns the CLI without a TTY, so headless
auto-detection would (correctly, for a script) refuse to open a browser and turn every probe into
`harnessError: auth`. Only the caller knows a human is sitting there, so the caller says so.

### Configuration

**This is the part of §5 the implementation contradicted most directly, and deliberately.** The
`MCP_TEST_*` environment scheme sketched here was built the other way round:

> **Policy: secrets by reference, everything else by value.** `config.toml` (gitignored) holds the
> **literal** provider, model, `base_url`, temperature, `max_steps`, `max_result_chars` and every
> target URL. The API key is the only thing that stays in the environment, and the config file
> stores only the **name** of the variable holding it (`api_key_env`), never the key. **The config
> file wins over the environment**; the only overrides are the two visible CLI flags `--model` and
> `--max-steps`.

The reasoning, which is why this is recorded rather than patched away: an ambient environment
variable that silently beat the config is exactly the invisibility the policy exists to remove —
you would learn what you ran with only *after* you ran it. Everything a run depends on is therefore
either in a file you can read at a glance, or in the command line you typed. The CLI prints the
whole effective configuration as its banner before the first probe, for the same reason.

The original sketch (`MCP_TEST_MODEL`, `MCP_TEST_TARGET_*_URL`, …) is **dead**: none of those
variables is read. One survivor: `MCP_TEST_AUTH_WAIT` is still an environment variable, because it
is the default for a CLI flag rather than a description of the run.

The design also assumed a static `token_env` per target. `bearer` targets do still work that way,
but every target that ships in `config.example.toml` is `auth = "oauth"` and needs **nothing but
its url**: the discovery pointer is read off the server's own 401 challenge, the client registers
itself dynamically, and tokens cache per target under `mcp-tests/.auth/`.

### Library choice

**Requirement (D8): provider neutrality comes first.** The harness must not be easier to run on one
vendor than another — partly so we can swap on price, and partly for a methodological reason: an
Etendo GO MCP measured only with Claude is measured with the same bias it was designed under.

**Stack: LangChain Python** — `langgraph.prebuilt.create_react_agent` for the tool loop,
`langchain-mcp-adapters` to expose the MCP server's tools as LangChain tools, one thin provider
package per vendor (`langchain-openai`, `langchain-google-genai`, `langchain-anthropic`), and
`.with_structured_output(Verdict)` with a Pydantic model for the verdict.

**Default provider: OpenAI** (Gemini equally acceptable) — deliberately *not* Anthropic, per the bias
argument above. Swapping is a config change, not a code change.

**Design rule that protects this choice:** the agent library and the provider are imported in exactly
one file (`runner/agent.py`). Nothing else in the harness imports them. If LangChain turns out to be
the wrong bet, the suites, the verdict schema, the event log and the UI are unaffected. This rule
held: `verdict.py`, `events.py`, `suite.py`, `config.py`, `cli.py` and the whole of `ui/` are free
of any LangChain or provider import.

#### How D8 is actually satisfied (narrower than the design implies)

`build_model()` wires **exactly one client**, `ChatOpenAI`, and raises `NotImplementedError` for
any other provider name. There is no `langchain-google-genai` and no `langchain-anthropic` in the
harness.

That is not a retreat from D8, but it is a thinner form of it than "one thin provider package per
vendor" suggests, and the distinction matters: **`name = "openai"` names the CLIENT, not the
vendor.** The default `base_url` is the internal gateway `https://llm.etendo.software/v1`, and the
model id is the gateway's own routed spelling (`openai/gpt-5.2`, `gemini/gemini-3.8-flash`), passed
through verbatim and never translated to a vendor-native id. A non-Anthropic model is therefore one
config line, which is the property D8 asked for — but a vendor whose API is not OpenAI-compatible
would need code, which the design implied it would not.

**Gemini is currently unreachable in practice**, for two unrelated reasons, both verified against
the live gateway on 2026-09-14 and both written down in `config.example.toml` next to the setting
they affect:

- `vertex_ai/*` routes answer **403 BILLING_DISABLED** — a project-level billing gap, unchanged
  under a second API key on a different project, so not a credential problem.
- `gemini/*` routes answer chat and structured output fine but **always** died in the multi-turn
  tool loop against this MCP. That one turned out to be a defect in our own server rather than in
  the gateway — see §B5 and `mcp-tests/findings/2026-09-14-ref-key-breaks-every-gemini-model.md`.
  It is fixed on `feature/ETP-5306` and has not yet been re-measured end to end.

The consequence for D8 is worth stating plainly: **every result recorded so far was produced by a
single vendor's model.** The bias D8 exists to avoid is not yet actually avoided — only made cheap
to avoid.

### MCP connection and authentication

**The harness must support OAuth, not just a static bearer token.** The Etendo GO MCP endpoints
expose the MCP-spec OAuth flow (`authenticate` / `complete_authentication`), and an endpoint that
only accepted a hand-pasted token would be unrunnable against exactly the deployments we most want to
measure.

Auth is a **per-target** property, declared in config, and `mcp_client.py` is the only module that
knows about it (the same containment rule as `agent.py` for providers):

```toml
# As implemented. Note the local target is OAuth too, and points at :3100, not :8080.
[targets.local]
url  = "http://localhost:3100/mcp"   # needs `make dev`: the .well-known documents are served by
auth = "oauth"                       # Vite's mcpWellKnownPlugin, which also proxies to Tomcat.
                                     # Going direct to :8080 is what skips the mechanism.
[targets.experimental]
url  = "https://go.experimental.etendo.cloud/mcp"
auth = "oauth"                    # authorization code + PKCE, per the MCP spec
scopes = "neo:read neo:write"     # optional; defaults to what the AS advertises
redirect_port = 8765              # optional; registered with the server, so it must stay stable

# A target you already hold a token for. The token lives in the environment;
# only the name of the variable is written down.
[targets.some-bearer-target]
url  = "https://.../mcp"
auth = "bearer"
token_env = "MCP_TEST_TARGET_SOME_TOKEN"
```

Three modes were designed. **Two are implemented.** `oauth_client_credentials` raises rather than
degrading to something weaker: there is no IdP to test it against, and an untested auth path is
worse than an absent one.

| Mode | Flow | Use |
|---|---|---|
| `bearer` | A token from config | Local dev, fastest path |
| `oauth` | Authorization code + PKCE with a **loopback redirect** (`http://127.0.0.1:<port>/callback`), dynamic client registration where the server offers it | Real deployments a human can log into |
| ~~`oauth_client_credentials`~~ | Machine-to-machine, no browser | Unattended / scheduled runs — **not implemented**, raises |

#### When the browser opens: interactive by default, at preflight

Authorization-code OAuth needs a browser once. A human sitting at the terminal is the **normal** case,
so the run just does it: no valid token ⇒ open the browser, wait for the callback, continue. The run
**pauses**; it does not fail, and `make mcp-login` is not a prerequisite.

**But it happens at preflight, never lazily.** Before the first probe runs, the runner resolves auth
for every target the run will touch. Reasons:

- A 20-minute run that stops at probe 7 waiting for a browser is a run that finishes only if the
  human never walked away. Front-loading means: once probe 1 starts, no human is needed again.
- The failure mode *"the credentials are wrong"* is then discovered in second 2, not minute 12.

Around that, three controls:

| Control | Behaviour |
|---|---|
| default | Open the browser at preflight, wait, continue |
| `--no-interactive` | Never open a browser; no usable token ⇒ `harnessError: auth` and the run reports *not measured* |
| auto-detected headless | No TTY, no `DISPLAY`, or `CI=1` ⇒ behaves as `--no-interactive` without being asked |
| `MCP_TEST_AUTH_WAIT` (default 180s) | How long preflight waits for the callback before giving up. A run must never hang forever on a human who left. |

`make mcp-login TARGET=x` stays, but demoted: it is a **convenience to pre-warm the token** (and to
re-authenticate deliberately), not a required first step.

**The UI does not auto-open.** In Streamlit the sane presentation is a *Login* link/button per target
with its token state (valid / expiring / absent), not a browser popping up from under a web page. So
`mcp_client.py` exposes the two halves separately — *"give me the authorize URL"* and *"wait for the
callback"* — and the caller decides whether to auto-open (CLI) or render a link (UI). One
implementation, two presentations.

#### Consequences that have to be respected elsewhere

- **Tokens are refreshed, so they change mid-run.** The redaction layer (§6.7) must scrub by
  *pattern and key name*, not by matching a token string captured at startup — otherwise a
  post-refresh token lands in a transcript in the clear.
- **A token can expire between probes** on a long run. The client refreshes transparently; if the
  refresh itself fails, only the remaining probes become `harnessError`, and the ones already
  measured stay valid. A run is never retroactively invalidated.
- `mcp-tests/.auth/` is gitignored and is **never** copied into `runs/`.

### The probe system prompt is part of the instrument

The system prompt handed to the probe agent determines the results as much as the model id or the
temperature does. It is stored in the repo (`runner/prompts/probe_system.md`), **versioned**
(`promptVersion: 1`) and recorded in every run's metadata header. Editing it invalidates
comparability with earlier runs exactly like changing the model — the header is what makes that
visible instead of mysterious.

#### The choice hiding inside it

How much we tell the agent about Etendo decides **which product we are measuring**:

| What the prompt contains | What the suite then measures |
|---|---|
| Nothing about Etendo | Whether the MCP is **discoverable** — can an agent that knows nothing find its way? |
| Where things live, which tool to call first | Whether the MCP **executes** well, once you already know how to drive it |

These are different products and the difference is not academic: most of the IMP-* backlog is
discoverability (naming, schemas that contradict themselves, errors that do not say what to do next).
A helpful system prompt would **hide exactly the defects we are trying to find** — the agent would
route around them using knowledge we handed it, report `OKAY`, and the suite would flatter the
product. This is the same failure the manual benchmark already caught in itself: the 2026-08-10 run
report flags that its frozen suite had started to flatter the product.

**Decision (D20): the default probe agent is naive.** Zero Etendo domain knowledge, zero hints about
tool names, zero hints about the data model. Whatever it needs it must discover through the MCP
itself — which is precisely the thing under test.

#### What the prompt *may* contain

The distinction that makes this workable: **instrument calibration is not domain knowledge.**
Telling the agent *how to report* is fair; telling it *where sales orders live* is not.

Allowed (and necessary):

- its role — it is performing a task on a business system through the tools it has been given;
- that it must **actually attempt** the task rather than describe how it would;
- that **failing is an acceptable and valuable answer** — see the honesty clause below;
- the reporting contract: report every failed call verbatim, including self-corrected ones;
- that it must not fabricate data it could not find (an invented id is a failure, not a success).

Forbidden:

- tool names, spec names, entity names, field names;
- the shape of the Etendo data model, or that Etendo exists at all;
- any recipe for the specific task in the probe.

#### The honesty clause (the one that earns its place)

Models are agreeable. Left alone, an agent asked to self-report will round `MIXED` up to `OKAY`, will
omit the three calls it got wrong before the one that worked, and will present a partial result as a
completed task. The suite is worthless if that happens, because a self-corrected failure is **exactly**
the signal the IMP-* backlog feeds on.

So the prompt states explicitly that an honest `ERROR` is a better outcome than an optimistic `OKAY`,
and that a call which failed and was then fixed **must still be reported as a failure**.

This is also why the transcript exists (§6.1): the honesty clause improves the verdict, it does not
make it trustworthy. The objective record is what keeps it accountable.

#### Draft (`runner/prompts/probe_system.md`, promptVersion 1)

```markdown
You are an autonomous agent operating a business system through the tools you have been given.
You have no prior knowledge of this system: everything you need — what exists, what it is called,
what fields it has — must be discovered through the tools themselves.

Carry out the task you are given. Actually perform it; do not describe what you would do.
If you need information you do not have, look for it with the tools. Never invent an identifier,
a name, or a value you could not find.

Stopping without completing the task is an acceptable outcome. An honest report of failure is more
useful than an optimistic one, and you will not be judged on whether you succeeded.

When you are finished, report:
- what you actually accomplished, not what you attempted;
- every tool call that failed, with the exact arguments you sent and the exact error you received —
  INCLUDING calls that failed and that you afterwards fixed yourself. A mistake you recovered from
  still counts and must still be reported;
- anything that was hard to find, ambiguous, or that you had to guess at, and what it cost you;
- what would have made this task easy.

Report the outcome as OKAY only if the task was fully completed. Use MIXED if it was partially
completed, and ERROR if it was not completed.
```

#### Deferred: knowledge levels (v2)

The natural extension is to run the same probe at several `knowledgeLevel`s — `naive`, `oriented`
(told where to look), `expert` (told exactly how) — because the *gap between the levels* is the
measurement that separates "the MCP cannot do this" from "the MCP cannot be figured out". Worth
having, not worth building before the naive level produces its first results.

### Step cap

`run.max_steps` in `config.toml` (default 25, overridable with `--max-steps`) caps the agent loop
**per probe**. There is no global run budget: a run always completes, so two runs stay comparable.

As implemented, the cap becomes LangGraph's `recursion_limit = max_steps * 2 + 1` — one agent turn
is a model node plus a tool node, plus one for the final answer. Blowing it raises
`GraphRecursionError`, which is caught and turned into `exhausted: true`; the agent is then still
asked for its verdict over the transcript it did produce, and **the runner overrides an
over-optimistic self-report**: an `exhausted` probe that answers `OKAY` is rewritten to `MIXED`.
That last part is not in the design and is the runner asserting something objective over something
subjective, which is §6.1's rule applied.

Token recording exists since run schema v4 (§6.1): every probe file carries provider tokens for
the tool loop (`usage.loop`) and, separately, for the reporting call (`usage.report`). No budget is
enforced on them — a global cost cap is still not built; the data to set one now exists.

---

## 6. Output

### 6.1 Two sources of truth

This is the most important design point in the document.

| Source | What it is | Trust |
|---|---|---|
| **The verdict** | The agent's own structured self-report | Subjective. It may claim success it did not achieve, or not notice friction it routed around. |
| **The transcript** | Every tool call, argument payload, response, latency and byte count, recorded by the runner | Objective. Cannot lie. |

**Both are always recorded.** The verdict tells us *why*; the transcript tells us *what*.

D34 later added a **third** axis that neither of these can see — `effectVerified` — because both
sources agreed a write had succeeded when the record was never created. See §6.4b.

#### 2026-09-14: tool RESULTS are recorded, not just the calls

Originally each `toolCalls[]` entry held the tool name, the arguments and an error flag. **The
response body was thrown away.** That was found to be the wrong trade the hard way: the `$ref`
defect (§B5) was invisible in every run file the harness had ever written, precisely because the
evidence for it was in the tool result, and it had to be reproduced by hand against the live server
to be diagnosed at all. A record that drops the answer is not an objective record.

Each entry now carries:

| Field | Meaning |
|---|---|
| `id` | The provider's tool-call id. Makes the call↔result correlation explicit rather than implied by list position. |
| `result` | The response body, as text, truncated to `run.max_result_chars`. |
| `resultBytes` | The **true** UTF-8 size, measured **before** truncation. |
| `resultTruncated` | Whether the stored body was cut. |

The cap (`[run] max_result_chars`, default 20000) exists because one `neo_discover` answer is
~79 KB and would otherwise dominate every probe file. Splitting the size from the body is what keeps
that cheap: **the cap costs detail, never the metric** — §6.6 reads `resultBytes`, which stays
honest whether or not the body next to it was cut. A call with no result at all (the loop died on
it) stores an empty body and `resultBytes: 0`, which says exactly that and is distinguishable from
a response that genuinely was empty only because the run schema version says results are recorded
at all — hence the bump below.

Deliberately not capped by tool name: a per-tool cap would put product knowledge into the recording
layer, which is exactly what the harness keeps out of itself.

#### 2026-09-14: a probe that dies keeps its transcript

A provider 400 mid-loop used to escape as a bare exception, and the probe file was written with
`toolCalls: null` — **zero evidence at precisely the moment evidence mattered most.** That is how
run `20260914T1811-local-71aa` was nearly lost, and that run is the one that produced the `$ref`
finding.

`agent.py` now raises `ProbeAborted`, carrying `.cause` (the original exception, so the message a
human reads is unchanged by the wrapper) and `.partial` (the run record minus the verdict). `cli.py`
merges `.partial` **first**, then sets `harnessError`. The probe still has no verdict — a crashed
probe must never be credited with one — but it has its transcript, and the console says how many
calls were salvaged.

Finding the wrapper is itself non-trivial and worth recording: `run_probe` is awaited inside the
MCP session's anyio task group, which re-raises the body's exception wrapped in an `ExceptionGroup`,
sometimes nested. A plain `isinstance` check would silently drop the salvaged transcript exactly
when the session *also* failed on the way out, so `cli.py` walks the whole exception tree
(`exceptions`, `__cause__`, `__context__`) looking for it.

**`RUN_SCHEMA_VERSION` 1 → 2** for both changes together. The keys are additive, but a consumer
computing payload metrics must be able to tell *"results were never recorded"* from *"the results
were empty"*, and only the version says which (D14 doing its job).

#### 2026-10-14: run schema v4 — what a comparison needs pinned (ETP-5750 S1)

Groundwork for the reproducible Etendo Go vs Holded comparison
(`docs/plans/2026-10-14-mcp-tests-reproducible-comparison-plan.md`, §2, §5.5, §5.7, §6). (v3 had added `setup[]`,
`teardown[]` and `teardownClean` — D41.) **`RUN_SCHEMA_VERSION` 3 → 4.**
New on every probe file:

| Field | Meaning |
|---|---|
| `finalAnswer` | Text of the last AI turn of the **tool loop**, in the task's language — what the user was told. Never the verdict, which is asked for afterwards, in English. `null` when the loop did not end on an answer (last AI turn still asked for tools, e.g. a blown step cap, or no AI turn at all); `""` when it answered with nothing. Reasoning blocks are dropped. |
| `usage.loop` | Tokens summed over the loop's AI turns: `inputTokens`, `outputTokens`, `totalTokens`, `cachedInputTokens` (`input_token_details.cache_read`), plus `turns` and `turnsWithUsage`. **Missing is `null`, never `0`**: a total is given only when every turn reported it, because a sum over the turns that happened to carry usage would understate the cost silently. Turns dropped as empty completions are not counted (they are in `emptyCompletions`). |
| `usage.report` | Same shape, for the reporting call alone. **Not cost**: it is the instrument talking, not the task. `null` until the reporter has answered (so `null` on a probe aborted before it). |
| `servedModel` | `{models, systemFingerprints}` — the distinct `model_name` / `system_fingerprint` values the gateway returned, loop and report, in order of first appearance; `[]` when not reported. The requested id stays in `run.json.model`. |
| `silentWrong` | Persisted, no longer only printed: `true` when the verdict is `OKAY` and `effectVerified` is `false`; `false` when both exist and that is not the case; `null` when there is no verdict or no check. A flag — such an attempt already failed the objective check. |

`finalAnswer`, `usage` and `servedModel` are `null` on a probe whose agent never ran (setup or auth
failure); a probe that crashed mid-loop keeps them in its salvaged partial record, as it keeps its
transcript. `run.json` gains `harness` and `server` (§6.2). `events.ndjson` is unchanged and stays
non-authoritative: none of these fields exists only in the event stream. `ui/runs.py`
(`record_v4`) reads them and returns `None` for an older file, which never recorded them — not "a
v4 file with nulls".

#### 2026-10-14: run schema v5 — one file per attempt (ETP-5750 S2, D43)

**`RUN_SCHEMA_VERSION` 4 → 5.** `--repeat N` (default 1, D2) asks for N **measured** attempts of every
probe. The layout changes, which is what the version is for:

```
runs/<runId>/
  run.json                       # "repeat": N
  events.ndjson
  probes/<probeId>/attempt-<n>.json    # v5; v1–v4 wrote probes/<probeId>.json
```

Each attempt file is a full probe record of the v4 shape (every field above) plus:

| Field | Meaning |
|---|---|
| `attempt` | 1-based, unique per probe within the run. Planned attempts are `1..N`; replacements continue at `N+1`. |
| `replaces` | `null` for a planned attempt; for a replacement, the number of the harness-errored attempt it stands in for. |
| `marker` | The resolved `{{marker}}`: `<runId>-<probeId>-a<n>`. Unique per probe **and** attempt, still prefixed by the run id (the §8 sweep keeps matching). The prefix is a parameter (`suite.attempt_marker`), so the comparison orchestrator can pass its `compareId` and keep the marker — and the prompt — byte-identical across targets for the same attempt. |

Rules, all in `cli.py` (the `for probe in probes` scheduler around `run_attempt`):

- Each attempt is independent: its own setup, MCP session, agent conversation, effect check and
  teardown — teardown in `finally`, per attempt, exactly as D41 had it per probe.
- **A harness error does not count.** The errored attempt stays on file; after the N planned
  attempts, replacements run oldest error first, **at most N per probe**. A replacement that errors
  is itself eligible for replacement while the cap lasts.
- A preflight auth failure is **never** rescheduled (it would fail identically): every planned
  attempt is written with that `harnessError`, no replacement.
- A probe that ends with fewer than N measured attempts (`harnessError == null`) is *not
  evaluable* for that run. The runner does not pad it; deciding that is the report's job (plan §5.1).
- A provider configuration error (401/403/404) still stops the whole run at once.

Events: `run_started` carries `repeat`; **every probe-scoped event** (`probe_started`, `tool_call`,
`tool_result`, `setup_step`, `teardown_step`, `probe_finished`, `probe_aborted`, `effect_checked`)
carries `attempt`, and `probe_started` carries `replaces` on a replacement. Still progress only.
The run-finished tally counts attempts, replacements included.

Readers: `ui/runs.py` picks the layout from `run.json.schemaVersion` (≥ 5 → attempts; no header →
whatever is on disk) and exposes `probe_files`, `attempt_numbers(run, probe)` and
`load_probe(run, probe, attempt=1)`; an older run is attempt 1 of each probe. Report code (S4)
should read through the same rule.

### 6.2 Run metadata header (`run.json`, written before the first probe)

Without this a run is unreadable three weeks later.

As implemented:

```jsonc
{
  "schemaVersion": 5,               // 1 -> 2 on 2026-09-14, 3 -> 4 and 4 -> 5 on 2026-10-14, see §6.1
  "runId": "20260911T1402-local-a3f1",
  "startedAt": "2026-09-11T14:02:11Z",
  "target": { "name": "local", "url": "http://..." },
  "serverBuild": null,              // ALWAYS null: not resolved, see below
  "server": {                       // v4: read once at preflight, after auth
    "serverInfo": { "name": "...", "version": "1.0.0" },   // the MCP initialize answer
    "protocolVersion": "2025-06-18",
    "catalogue": { "sha": "<sha256>", "toolCount": 28, "bytes": 58000 },   // tools/list, every page;
                                    // bytes = UTF-8 size of the canonical (compact, sorted) form
    "error": null                   // a failed read: { "kind": "auth" | "server", "detail": "..." },
                                    // the shape of a probe's harnessError (§6.4); never fatal
  },                                // null when preflight auth already failed
  "harness": { "commit": "<sha>", "dirty": false },        // v4; null values = git unavailable
  "provider": "openai",             // the CLIENT, not the vendor — see §5
  "model": "openai/gpt-5.2",        // the gateway's routed id, verbatim
  "temperature": 0,
  "promptVersion": 4,               // 1 -> 4, see §6.3
  "maxSteps": 25,
  "maxResultChars": 20000,          // added with the result recording (§6.1)
  "repeat": 1,                      // --repeat N: measured attempts per probe (D43, §6.1)
  "suites": [{ "file": "sales-order.yaml", "sha": "e3b0c442" }]
}
```

One field does not yet keep its promise. **`serverBuild` is always `null`** — D1's accepted
consequence was that a run pins a `.go` build id it does not own, and nothing resolves it. Since v4
`server.serverInfo` is recorded, but it cannot fill `serverBuild`: Etendo's `serverInfo.version` is a
constant of the MCP implementation (`McpModernResults.SERVER_VERSION`, `1.0.0`), not the module
build. The **catalogue sha** is the proxy that tells two builds apart — the whole tool definitions
are hashed (name, description, schemas, annotations), order-independently, so a reworded description
moves it — and it is the only build proxy available for Holded at all. `catalogue.bytes` is the
size of that canonical form, recorded as the base of the report's priming estimate (≈ bytes ÷ 4
tokens per turn); compact JSON, so it understates what a client actually sends. `harness.dirty` looks at
`mcp-tests/` only.

### 6.3 Verdict schema (structured output)

**The schema has moved v1 → v3.** The design's v1 is below the current shape, kept because runs in
`runs/` still carry it and are never rewritten.

```jsonc
// v3 — runner/verdict.py, VERDICT_SCHEMA_VERSION = 3
{
  "schemaVersion": 3,
  "outcome": "OKAY | ERROR | MIXED",
  "summary": "one sentence, what happened",
  "achieved": "what the agent believes it actually accomplished",

  // --- v2 -------------------------------------------------------------------
  "plannedApproach": "the plan the agent believed it had BEFORE starting, or null",
  "howKnown": "where that plan came from — a named tool, a tool description, prior knowledge, or a guess",

  "frictions": [
    { "what": "Could not tell which spec held sales orders",
      "cost": "3 wasted calls",
      "phase": "discovery | schema | write | action | read" }
  ],
  "failures": [
    { "tool": "neo_create",
      "payload": { "...": "the exact arguments sent" },
      "error": "verbatim error returned",
      "recovered": true,
      "howRecovered": "re-read the schema and added businessPartner as an id" }
  ],
  // --- v2 -------------------------------------------------------------------
  "wastedCalls": [
    { "tool": "neo_selectors",
      "expected": "what the agent expected BEFORE the call",
      "whatHappened": "what came back, and why it was of no use" }
  ],
  // --- v3: was list[str] --------------------------------------------------
  "suggestions": [
    { "what": "what should exist, or what should change",
      "kind": "shortcut | missingCapability | clearerDocs | betterMetadata | other",
      "wouldHaveSaved": "what it would have saved on THIS task — 'nothing here' is a valid answer" }
  ]
}
```

**v2 added three things**, each answering a question the v1 verdict could not:

- **`wastedCalls[]` — the call that returned 200 and got the agent nowhere.** Distinct from
  `failures`, which errored. A successful-but-useless call is the invisible cost bad metadata
  produces: *nothing in the transcript marks it, because nothing went wrong*. It gets its own list
  rather than being folded into `frictions` so it can be counted. Before v2 it was not reported as
  zero — it was not reported at all, because nothing asked.
- **`plannedApproach` / `howKnown`** — see D40 below for why these are accepted despite being
  recall rather than the plan.

**v3 restructured `suggestions`.** It was a flat array of prose: the one place an agent could say
what should exist, and the one field that could not be counted, grouped or compared across runs —
in a harness whose entire output is suggestions. It is now a record with a `kind` and with
`wouldHaveSaved`. See **D38** (why no `kind` means "defect") and **D39** (why `other` is
first-class and why unclassified is not `other`).

`failures[].payload` and `tool` are demanded verbatim, because *"it failed once but I fixed it"* is
exactly the signal the IMP-* backlog feeds on — a silently self-corrected error is still a product
defect.

`schemaVersion` is not decoration: the schema **will** change, and old runs must stay readable
without a migration (D14). It has now changed twice, and D14 paid for itself both times: `ui/runs.py`
reads the old string-shaped `suggestions` and the new record-shaped one **per entry**, so a
half-migrated or hand-edited list still renders, and no run in `runs/` was ever rewritten.

#### The field descriptions are part of the instrument

`runner/verdict.py`'s `Field(description=...)` strings are not documentation — **they are the text
the model actually reads** when it fills the structure, exactly like the system prompt is (D17).
Editing one changes what agents report, invisibly. They travel with `PROMPT_VERSION`, which went
**2 → 4** for these two schema changes (v3 for `wastedCalls` + the plan fields, v4 for classified
suggestions and the instruction not to judge whether anything is broken).

One implementation note that constrains the schema: the reporter is invoked with
`method="function_calling"`, **not** OpenAI's strict structured-output mode, because strict mode
rejects `failures[].payload` — a free-form object by design (*"the exact arguments sent"*) that
therefore cannot declare `additionalProperties: false`. Keeping the verdict schema verbatim was
judged worth more than strict mode.

### 6.4 Harness failure is a separate axis (D12)

A network timeout, an expired API key, a provider rate-limit, or the model refusing the task are
**not defects of the product under test**. Folding them into `outcome: ERROR` means eventually
opening an IMP against Etendo GO for our own broken config.

So each probe result carries, *outside* the model-authored verdict:

```jsonc
{ "harnessError": null | { "kind": "network|auth|rate_limit|provider|model_refusal|timeout|verification|setup",
                           "detail": "...",
                           "traceback": "..." } }   // on `provider`, kept: the only reason a
                                                    // nested failure is diagnosable at all
```

When `harnessError` is set, the probe has **no verdict** and is excluded from every metric. A run
reports `3 OKAY · 1 ERROR · 1 MIXED · 2 not measured`.

**As implemented, the taxonomy is aspirational.** Only four kinds are ever emitted — `auth`,
`verification` (D37), `setup` (D41: the probe's own fixture could not be built, so the agent never
ran) and `provider` — and `provider` is the catch-all: a network timeout, a
rate-limit and a genuine 400 all land in it. The finer kinds (`network`, `rate_limit`,
`model_refusal`, `timeout`) are declared but nothing classifies into them. The axis itself works,
which is what D12 was for; the classification does not, and a report that counted `rate_limit`
separately today would count zero.

One classification the runner *does* make, and which is worth stating because it is the opposite of
a taxonomy entry: a provider **401/403/404** stops the whole run rather than being recorded once per
probe. Those are misconfiguration, they would fail identically on every remaining probe, and a run
full of identical useless lines is worse than a run that stops and says why.

### 6.4b The third axis: `effectVerified` (D34)

Not in the original design, and forced by evidence on the very first write probe: the agent
reported `OKAY`, the transcript agreed with it, and the record had silently not been written.
**Neither source of truth in §6.1 can see an effect the server accepted and discarded.**

So a `mode: write` probe may declare one post-condition (`expectEffect`, §4), which the runner
executes **after** the agent finishes, in a **fresh MCP session** so nothing the agent's session
held can reach it. Three fields land on the probe file:

```jsonc
{ "effectVerified": true | false | null,
  "effectCheck": { "tool": "neo_list", "args": { … }, "expect": "atLeastOne", "rows": 1 } }
```

`null` means *could not verify*, which is deliberately **not** the same as *verified absent* — the
distinction D37 added a `harnessError.kind` for. And `effectVerified` is never folded into
`outcome`: an agent reporting `OKAY` while the effect is missing is a different and more dangerous
result than an honest failure, and merging them would erase exactly the case the check exists to
catch.

Made cheap by `{{marker}}` (§8), which is unique per *probe* — and since run schema v5 per
*attempt* (§6.1) — not per run, so one probe's effect check can never pass on another probe's or
another attempt's record.

### 6.5 Event stream (`events.ndjson`)

**Implemented** (`runner/events.py`). Append-only, one JSON object per line, flushed immediately.
This is what makes live progress possible **without the UI talking to the runner** — the filesystem
is the API (D11).

The schema differs from the sketch above; this is the real one. **Every line carries `ts`**, which
the sketch omitted and which is what makes a run readable after the fact rather than only live.

```
{"t":"run_started","ts":"…","runId":"…","probes":12,"target":"local","model":"openai/gpt-5.2","suite":"sales-order.yaml","maxSteps":25}
{"t":"probe_started","ts":"…","probe":"create-simple","attempt":1,"mode":"write"}
{"t":"tool_call","ts":"…","probe":"create-simple","tool":"neo_discover","id":"call_x","argsBytes":42,"args":{…}}
{"t":"tool_result","ts":"…","probe":"create-simple","tool":"neo_discover","id":"call_x","ok":true,"bytes":80917,"ms":340,"preview":"…","previewTruncated":true}
{"t":"effect_checked","ts":"…","probe":"create-simple","verified":true,"rows":1}
{"t":"probe_finished","ts":"…","probe":"create-simple","outcome":"MIXED","steps":7,"exhausted":false}
{"t":"probe_aborted","ts":"…","probe":"create-simple","kind":"provider","detail":"…","toolCalls":4}
{"t":"run_finished","ts":"…","ok":10,"error":1,"mixed":1,"notMeasured":0}
```

Two event types are new since the design:

- **`probe_aborted`** — the terminal event for a probe that has **no outcome**. It is distinct from
  `probe_finished`, which always carries one: reporting a crash as "finished" would invent a
  result, and reporting nothing at all would leave a tailing UI spinning forever on a probe that is
  already dead. It carries how many tool calls were salvaged (§6.1).
- **`effect_checked`** — the D34 post-condition (§6.4b), emitted only for probes that declare one.

`probe_finished.steps` is worth reading carefully: it is the **tool-call count**, not graph steps.
The cap is on agent steps and one step is a model turn plus a tool turn, so this is a lower bound on
how close a probe came to the cap, never an equality. The UI says so on screen.

#### Two preview caps, and why the asymmetry is deliberate

A result body and an argument blob are capped differently: **`EVENT_PREVIEW_CHARS = 400`** for
results, **`EVENT_ARGS_PREVIEW_CHARS = 4000`** for arguments.

They are not the same kind of value. A **result** is large by default and its *head* is diagnostic —
the `$ref` defect is recognisable in the first 60 characters of a row — and the full body lives in
the probe file anyway. **Arguments** are tiny by default (a filter, an id), so the cap almost never
fires; the one call that breaks that rule is `neo_feedback`, whose arguments are a whole
verdict-shaped report (D27), and for which a 400-character head is *worthless*: truncated JSON does
not parse, so the live view cannot render it as the report it is. The cost is bounded and it is not
per-call — in practice one report per probe.

Deliberately **not** a per-tool cap. Keying the limit on `neo_feedback` would put product knowledge
into the event layer, which is precisely what the harness keeps out of itself.

#### Two rules that keep the stream honest

1. **The event stream is never the source of truth for results.** It is a progress feed: small,
   lossy-tolerant, and explicitly subordinate. `run.json` and the probe files are the record, and
   where the two disagree — a probe finished between two polls, a line lost to a full disk — the
   probe file wins. Nothing downstream may derive a metric from events that it could have derived
   from the probe files.
2. **A broken event file degrades the UI, never the measurement.** Every failure mode is swallowed,
   and after one failed write the writer disables itself rather than raising once per event for the
   rest of the run. On the reading side a malformed or half-written line is skipped, not raised on —
   the file is read *while* it is being appended to, so the last line can legitimately be truncated.

Side benefit worth having on purpose: if the process dies mid-run, everything up to that point
survives, instead of losing the run.

### 6.6 Metrics derived from the transcript (free, objective)

**Implemented 2026-10-14 for comparisons (ETP-5750 S4, D47, D48).** `runner/report.py` derives
every metric of the Etendo Go vs Holded comparison from files, and `runner/decide.py` applies the
decision rule. Plan: `docs/plans/2026-10-14-mcp-tests-reproducible-comparison-plan.md` §3, §5.6,
§5.7, §6.

```
make mcp-report RUN=<compareId>|<path>     # writes <compareDir>/summary.json + summary.md
make mcp-stability A=<compareId> B=<compareId>   # exit 2 if a pin differs or a run is unofficial
```

**Inputs, and the one thing never read.** `compare.json`, each `targets/<t>/run.json`, and
`targets/<t>/probes/<id>/attempt-<n>.json` / `not-possible.json`. **`events.ndjson` is never
opened** (D48): a test deletes it and asserts the summary is byte-identical. `load_target`
reads attempts through `ui/runs.py` (`probe_files`, `attempt_numbers`, `load_probe` — stdlib only),
so both layouts (v5 attempts, pre-REPEAT flat file as attempt 1) have one owner; it reads only
`not-possible.json` itself, which has no attempt. The summary carries no generation timestamp, so re-running the report on the same files
produces the same bytes — that is what lets a rule change be re-applied to an old run and diffed.

**Per attempt** (`measure_attempt`), the plan's nine items:

| # | Item | Rule as implemented |
|---|---|---|
| 1 | success | `success` if the runner recorded it (suite v2); else every objective check present (`effectVerified`, `answerVerified`) must hold; **none present → `null`**, and one such attempt makes that side *not evaluable* — never a quiet failure. Never the verdict. |
| 2 | consistency | successes / counted attempts |
| 3 | calls | median `toolCallCount` over **successful** attempts only |
| 4 | first-call success | `toolCalls[0].error == false`, k/n; an attempt with no call is out of `n` |
| 5 | unrecovered errors | an error call with no **later** successful call to the same tool, summed |
| 6 | self-corrected | error calls − unrecovered, shown over all errors |
| 7 | stumbles | error calls + `verdict.wastedCalls` — flagged `partlySelfReported` |
| 8 | silent wrong | count of attempts with `silentWrong == true` |
| 9 | cost | median `usage.loop.totalTokens` over successful attempts (catalogue included), plus median summed `resultBytes`; `priming ≈ catalogueTokens × turns` shown as an **estimate** next to it, from `run.json.server.catalogue.bytes` (recorded at preflight, §6.2) ÷ 4; absent on runs that predate it. The bytes are the compact canonical catalogue, so the estimate **understates** what a client actually sends each turn |

`verdict.failures[].recovered` is reported only as `crossCheck.selfReportedUnrecovered`, never as
item 5.

**Which attempts count.** Harness-errored attempts are kept on file and listed, but excluded (D12);
the first N measured attempts by attempt number are counted (N = `compare.json.repeat`). Fewer than
N → the side is *not evaluable*, and so is the task.

**The rule (`decide.py`, `RULE_VERSION = 1`).** Step 0 capability (one side `notPossible` → the
other wins, provided it was itself measured; both → *excluded*; `invalidDeclaration` → *not
evaluable*), then successes (both 0/N = tie, `1-noSuccess`), median calls with `callsMargin` (0.20,
inclusive: 8 vs 10 decides, 81 vs 100 does not), unrecovered errors, median tokens with
`tokensMargin` (0.10) — or bytes when any successful attempt lacks token usage (`4-bytes`) — and
otherwise `5-tie`. Every task records `winner`, `decidedBy`, the decisive values with their
`distance` to the threshold, and `fragile` (+ reasons): a step-1 win by one attempt, a step-3 win by
one error, or a step-2/4 gap within `fragileBand` (0.05) of its threshold on either side.

**Versioning.** The step logic is `RULE_VERSION`; the thresholds come from the suite's `decision:`
block, copied into `compare.json`, over `DEFAULT_PARAMETERS`. A declared `ruleVersion` the code does
not implement is refused (`RuleMismatch`). Every summary records `rule.version`, `rule.parameters`,
`rule.parametersSha` and `rule.versionAtRun` (what `compare.json` declared), and the same block sits
in `pins`.

**`summary.json`** (`summarySchemaVersion` 1, `reportVersion` 1): `kr` (subject vs reference, tasks,
evaluated, wins split `byCapability` / `byMeasurement` for both sides, ties, `winRate` and its two
halves, fragile count), `official` + `freshness` per target (official only when every target is
`fresh`; a missing status is `unknown`), `stumbleIndicators` per target (stumbles per counted
attempt, tasks with any stumble), `tasks[]` (decision + both sides' items and per-attempt rows),
`capabilityGaps`, `excluded`, `notEvaluable`, `backlog` (frictions by phase, suggestions by kind,
verbatim; a legacy prose suggestion is `unclassified`), `cost` (per target: attempts incl.
replacements, harness errors, loop and report tokens, attempts without usage, wall time), `pins`.

**`summary.md`** is the projection: headline with OFFICIAL / UNOFFICIAL and the KR split, freshness
table, one row per task × target (or `not possible (<kind>): <reason>` in place of the items),
stumble indicators, capability gaps, uncounted tasks, backlog, run cost, pins. It holds counts and
verdict text only — **no tool result and no `finalAnswer`** — because it is the copy-paste path and
§6.7 is still not built.

**Stability.** `stability(A, B)`: agreement = same `winner` (a tie equals a tie) over tasks decided
in both runs, plus the same over tasks fragile in neither. Pins are compared flattened, minus the
ones that legitimately vary (`compareId`, timestamps, `freshness`, `concurrency` — concurrency is
reported instead). A pin difference or an unofficial run makes the pair `valid: false` (exit 2):
the number is still printed, it does not count.

The transcript-level metrics of the registry, unchanged:

| Metric | Derivable as | Data present? |
|---|---|---|
| **M1** calls-to-outcome | `toolCallCount` per probe | ✅ item 3 |
| **M2** first-call success | first non-error call of each phase | ⚠️ item 4 is the first call of the attempt, not of each phase |
| **M3** payload signal ratio | `resultBytes` vs. bytes the agent actually referenced | ⚠️ numerator only — nothing measures what was *referenced* |
| **ACE-v** context cost | tokens consumed by tool results | ⚠️ item 9: provider totals per attempt; priming split out as an estimate from `server.catalogue.bytes` ÷ 4, now recorded at preflight — a lower bound, since that size is compact JSON and a client's serialisation is larger |
| latency | wall clock per call | ⚠️ events only (`ms`), and it is the *step boundary*, so it includes the agent loop's own overhead and is not the server's latency |

A single-target `make mcp-test` run is still not summarised: `report.py` needs a comparison
(exactly two targets). Transcribing a number into the registry stays a manual act (D6).

### 6.7 Redaction (D15)

**NOT IMPLEMENTED.** `redact.py` does not exist. Nothing scrubs anything on the way to disk, and
`cli.py`'s own docstring lists redaction as out of scope for the slice that was built.

The design, unchanged and still wanted:

> `redact.py` scrubs **credentials** on the way to disk: `Authorization` headers, bearer tokens, API
> keys, anything matching the configured token patterns. Business data is written **in full** — it
> is the evidence, and the test tenant is not expected to hold real customer records.
>
> The real leak path is not git (`runs/` is ignored); it is **copy-paste into a ticket or a doc**.
> Credential scrubbing at write time is what makes that paste safe by default.

What mitigates the gap today, and what does not:

- The LLM API key never reaches a run file — `config.py` records only the *name* of the variable it
  came from, and the CLI banner prints the name, never the value.
- `mcp-tests/.auth/` (mode 0600, gitignored) is never copied into `runs/`.
- **But** a tool result is now stored verbatim (§6.1), and `harnessError.traceback` is stored in
  full. Neither is filtered. Until `redact.py` exists, **a `runs/` directory must be treated as
  unredacted** and a probe file pasted into a ticket must be read before it is pasted — which is
  precisely the manual discipline D15 exists to remove.

---

## 7. Non-determinism (designed for, not discovered)

An LLM probe is not a deterministic test. Two runs of the same prompt can differ.

1. **`REPEAT=N` — how many times the same prompt is asked of the agent. Default `1`.**
   One run is the default (cheap, fast, enough to spot a hard regression). Raising it measures
   *variance* when a result looks suspicious: with `N > 1` the report shows `OKAY 2/3` instead of a
   boolean, and the per-attempt verdicts are all kept, not averaged away.
   **Implemented 2026-10-14 (D43, ETP-5750 S2):** `--repeat N` on the CLI, one file per attempt,
   harness-errored attempts replaced up to N per probe — see §6.1, run schema v5. The `OKAY 2/3`
   aggregation belongs to the report (`report.py`), not to the runner.
2. **Temperature 0** where the provider allows it; the model id, provider and `promptVersion` are
   pinned in the run header — an upgrade changes results and the report must make that visible.
   Implemented, and it has already earned its place: `promptVersion` went 1 → 4 in three days, so
   runs from 2026-09-14 morning are not comparable with runs from that afternoon, and the header is
   what makes that visible instead of mysterious. The one pin still missing is `serverBuild` (§6.2).
3. **Never fail the build on a probe** in v1. Gating comes later, once we know the natural variance.

---

## 8. Data hygiene — per-probe judgement, not a runner policy

Write probes create real records in a real tenant. The runner does **not** police this: no enforced
cleanup, no read-only default, no "every write must be undoable" rule. Suites are authored
deliberately, and whoever writes a `mode: write` probe decides what it may leave behind.

What the runner *does* provide is the thing that makes that judgement cheap to act on: a
**templating token for the run id**.

| Token | Expands to | Example |
|---|---|---|
| `{{marker}}` | `<runId>-<probeId>` — **the one a write probe should use** | `20260911T1402-local-a3f1-create-simple` |
| `{{runId}}` | Id of this run, unique per execution | `20260911T1402-local-a3f1` |
| `{{probeId}}` | The probe's own id | `create-simple` |
| `{{timestamp}}` | ISO timestamp of the run | `2026-09-11T14:02:11Z` |

`{{marker}}` is not in the original design and was added with D34. `{{runId}}` identifies the
**run**, so two write probes in the same run tag their records identically — and that let one
probe's effect check (§6.4b) pass on another probe's record. The marker is unique per probe, and
because it still *starts* with the run id the run-wide sweep below keeps working unchanged.

An unknown `{{…}}` is left **untouched** rather than silently blanked, so a typo is visible in the
prompt the agent actually received rather than producing a quietly malformed task.

Every record the suite creates carries a searchable marker, so a sweep is one query
(`description LIKE '%20260911T1402%'`) instead of an archaeology session. It also makes a run's own
records distinguishable from the previous run's when a probe reads back what it wrote.

**Caveat the probe author owns:** the token only lands in the data if the target entity has a
free-text field *and* the prompt tells the agent to use it. On an entity without one the marker
cannot be placed — a property of the window, and the author decides whether to skip the marker or the
probe.

---

## 9. The UI (Streamlit) — IMPLEMENTED 2026-09-14

`make mcp-ui` launches a local Streamlit panel. It is **strictly optional**: it starts runs by
shelling out to the same CLI a human would type, and follows them by tailing `events.ndjson`. It
holds no state of its own and the runner does not know it exists.

D11 survived contact with the implementation intact. `ui/launch.py` builds the exact command line a
person could paste into a terminal; no runner internal is imported to *execute* anything. The one
import of runner code is `load_suite`, to **read** suite files for display. The split inside `ui/`
is itself deliberate: `ui/runs.py` is pure functions over files and contains no Streamlit import,
which is what makes the reading logic verifiable without launching a browser — although, per the
note at the top of this document, **no such test has been written.**

All four v1 views were built:

| View | Shows |
|---|---|
| **Suites** | Every suite file and its probes; trigger one probe or one whole suite against a chosen target |
| **Live run** | Progress from `events.ndjson`: current probe, tool calls as they happen, sizes, latencies, result previews, and the pending OAuth authorization link |
| **Run detail** | Per probe: verdict, frictions, failures with payloads, wasted calls, classified suggestions, `effectVerified`, and the full transcript with stored result bodies |
| **History** | Past runs from `runs/` with their metadata headers |

Two things the design did not anticipate that the implementation needed:

- **One verdict renderer, two callers.** A probe's own verdict and the *arguments* of a
  `neo_feedback` call are rendered by the same function, because they carry the same schema on
  purpose (D27). A second renderer for one schema is how two renderings drift apart. The UI checks
  the shape as well as the tool name before doing this, so that if the two schemas ever diverge it
  falls back to showing the raw value — which is always correct — instead of confidently
  misreading a payload it no longer understands.
- **The OAuth wait is read off the CLI's stdout**, not off the event stream: preflight runs
  *before* the run directory exists (D19 front-loads auth), so there is no stream to announce it
  on. The panel renders the authorization URL as a link, per §5's rule that the UI never pops a
  browser from under a web page.

Deliberately **not** built, as designed: run comparison (D16), editing suites from the UI, auth
management, remote hosting. Also not built, and not previously listed: any aggregate view across
runs — no counts of suggestion kinds, no friction frequencies. That is the view the whole schema-v3
restructuring (§6.3) exists to make possible, and it is the obvious next thing.

### Three defects found on first use — recorded as constraints, not as bugs

Each of these is a property the UI has to keep, not a one-off fix, so they belong here rather than
in a changelog.

1. **The target selector must default to `local`.** It defaulted to `experimental` — a shared remote
   server — purely because the target list was sorted alphabetically, and a write suite was very
   nearly fired at it. **The cost of the two mistakes is not symmetric:** running locally when you
   meant remote wastes a minute; running remote when you meant local writes sales orders onto a
   server other people share. The list is now rendered in `config.toml`'s own insertion order
   (`tomllib` preserves it, and that order is the author's intent), *and* the default index is
   pinned to `local` independently — belt and braces, because either mechanism alone is one config
   edit away from failing. A write suite aimed at a non-local target now also carries a warning
   naming the probes, stated **before** the button rather than behind a confirmation dialog: running
   writes against a remote target is legitimate when it is deliberate, and the thing that must never
   happen is doing it without knowing.
2. **Run status colour must derive from the counts, never from "the run finished".** It was green
   on reaching `run_finished` — but a run that measured *nothing* reaches `run_finished` too, and
   rendering that green claims a success that did not happen. The precedence also resolves a real
   ambiguity: an aborted probe is both "a probe that failed" (red) and "partially unmeasured"
   (amber). A run where nothing at all was measured is **red**; a run that measured some probes and
   lost others is **amber**, because the measured part is real.
3. **A loopback-port bind failure must say when the holder is another run of the harness.** The
   generic *"port taken, change `redirect_port`"* advice is **actively wrong** here: the redirect
   port is registered with the authorization server, so changing it breaks OAuth rather than fixing
   it. The overwhelmingly likely holder is a previous run of this same harness still waiting for a
   browser, so the error now identifies the holding process by pid and command line, says it is one
   of ours and what it is waiting for, and tells the reader **not** to change `redirect_port`.

---

## 10. Decisions taken

| # | Decision | Date | Note |
|---|---|---|---|
| D1 | **The harness lives in the functional module** (`etendo_schema_forge`, this repo). | 2026-09-11 | Tentative (*"en principio"*). Puts it next to `docs/mcp-evaluation/`, which consumes its output. Accepted consequence: the thing under test (the Java MCP server) lives in the other repo, so a run pins a `.go` build id it does not own — hence `serverBuild` in the run header. |
| D2 | **`REPEAT` defaults to `1`.** | 2026-09-11 | Non-determinism is real but not paid for on every run. §7. Raisable since D43 (`--repeat N`); the default is unchanged. Even at `REPEAT=1` a harness-errored probe is now retried once (D43's replacement rule), so a write probe that crashed mid-loop can leave a **second agent-created record** on the tenant: teardown only removes what setup created, never what the agent wrote. |
| D3 | **No enforced data-hygiene policy.** Writes are a per-probe decision by the suite author; the runner offers `{{marker}}` instead of a rule. | 2026-09-11 | §8 — the token is `{{marker}}` (`<runId>-<probeId>`) rather than the `{{runId}}` this row originally named; D34 needed per-probe uniqueness. Accepted consequence: the tenant accumulates records and nothing prevents it — the marker makes the sweep cheap, it does not perform it. |
| D4 | **Probes are hand-written, grown incrementally.** The first one is deliberately simple in *what it asks for* (a sales order for the default customer, no lines) so that the first failure is unambiguous while the harness itself is still unproven. | 2026-09-11 | Simple in scope — **not** simple in phrasing; see D21. |
| D43 | **`--repeat N` runs each probe N times, each attempt in its own MCP session, conversation and `{{marker}}`; every attempt is kept as `probes/<id>/attempt-<n>.json`, never averaged away.** A harness-errored attempt does not count and is replaced after the planned ones, at most N replacements per probe; a preflight auth failure is never replaced. | 2026-10-14 | ETP-5750 S2; plan `2026-10-14-mcp-tests-reproducible-comparison-plan.md` §5.1. Variance was unmeasured (§11 q4). Replacing harness errors keeps a transient provider fault from shrinking N, and the cap keeps a deterministically broken probe from looping. The `mcp-compare` default of 3 lands with S3. |
| D47 | **The decision rule is code (`runner/decide.py`, `RULE_VERSION`) and its thresholds are data** (the suite's `decision:` block, copied into `compare.json`, over `DEFAULT_PARAMETERS`). Every summary records the version, the parameters and their sha. | 2026-10-14 | ETP-5750 S4; plan §5.6. A KR figure without the rule that produced it is unreadable later, and a rule tweak must be re-appliable to an old run (`make mcp-report`) and visible in the diff. A declared `ruleVersion` the code does not implement is refused, never silently re-interpreted. |
| D48 | **Metrics come only from `compare.json`, `run.json` and the probe files; `events.ndjson` is never read by the report.** | 2026-10-14 | ETP-5750 S4. Restates §6.5 rule 1 as a property of the report and guards it with a test that deletes the event files and asserts a byte-identical summary. |
| D42 | **An empty model turn is asked again, not read as the end of the probe.** A turn with no text and no tool call is retried from the same state, the empty message dropped, at most `MAX_EMPTY_COMPLETIONS` (3) times, then the probe is a provider failure (`harnessError.kind: provider`, `EmptyCompletion`). The count is recorded as `emptyCompletions`. | 2026-10-01 | Run `20261001T1912-local-45e9`: three probes ended with 0 tool calls and a verdict saying *"no tools were provided"* while 28 tools were bound — the Gemini route of the gateway answered the first turn with an empty `stop` 4 times out of 5 in a direct reproduction. LangGraph reads that as *the agent is done*, so a provider fault was being reported as a product result. Not a change to the instrument: an empty turn carries no decision, so asking again is the call that never answered, not a second chance at one. A resumed stream gets only the remaining step budget. |
| D41 | **Deterministic `setup:` / `teardown:` per probe** — runner-made MCP calls around the agent, with `saveAs` / `{{steps.<name>.<path>}}` to pass ids forward and `forEach` for the one loop teardown needs. Teardown always runs (`finally`); a failed setup makes the probe not measured. | 2026-10-01 | **Relaxes D3 for the suites that opt in, does not reverse it**: the runner still imposes no hygiene policy, it only lets an author make a probe self-contained (its own fresh record, created before the agent) and reversible (undone after it). Forced by treasury (ETP-5558): a collection probe needs a completed, unpaid invoice, and either reusing the tenant's few pending ones made the suite non-replicable, or asking the agent to create one put the fixture inside the measurement. Deliberately not a mini-language: no conditionals, no retries, one loop. Fixture calls stay out of `toolCalls[]`, so a fixture never inflates the agent's metrics (§6.6). |
| D40 | **`plannedApproach` is RECALL, not the plan, and must never be read as ground truth.** Kept anyway. | 2026-09-14 | It is asked *after* the task has ended, so the agent already knows how things turned out and will reconstruct something more coherent than what it actually had — a polished story, not a record. Accepted deliberately, for one reason: **the objective tool-call sequence is recorded alongside it** (§6.1), so the contrast between the claimed plan and the executed one is informative *even when the claim is polished* — a plan that matches the transcript and a plan that visibly does not are both findings. `howKnown` exists to make the contrast sharper by forcing a named source ("I guessed" is explicitly a valid and valuable answer; "from the tools" is of no use). The honest alternative — asking for the plan *before* the task — was rejected as a bigger change to the instrument than the signal justifies: it would put a planning step into the loop the naive agent (D20) is supposed to run without. The UI says so next to the value, not only in the schema. |
| D39 | **`other` must stay easy to choose, and "unclassified" is never `other`.** | 2026-09-14 | Two halves of one principle, both about not manufacturing data. **(a)** A closed enum makes an agent cram a bad fit into a real category, which corrupts the corpus *silently* — nothing marks a miscategorised suggestion. So both the schema description and the prompt tell the agent to pick `other` freely, and state that a suggestion in the wrong category is worse than one in `other`. What accumulates under `other` is how the next missing category gets discovered; that is the field's job, not a failure state. **(b)** A legacy or unrecognised `kind` is stored as **null**, never as `other`: *"did not classify"* and *"chose other"* are different facts, and merging them destroys precisely the signal in (a) — an `other` pile polluted by unclassified entries can no longer tell you what category is missing. Both surfaces implement this (`ui/runs.py` `normalize_suggestions`, `McpFeedbackVerdict#toSuggestion`), and an unknown `kind` is recorded as null rather than rejected, so a client that invents a category still gets its suggestion stored — it simply does not get to invent a column. |
| D38 | **The agent never labels anything a defect.** `SuggestionKind` contains only constructive categories; no `bug`, no `error`, no severity. | 2026-09-14 | An agent cannot distinguish *"the product is broken"* from *"I failed to find it"* — and the naive agent (D20) is, by construction, the party least able to tell those apart. Letting it label its own ignorance as a product error would fill the corpus with confident false claims that are individually plausible and collectively worthless, and they would be indistinguishable from real ones. So the verdict asks only what should **exist** (`shortcut`, `missingCapability`, `clearerDocs`, `betterMetadata`, `other`), the system prompt says in as many words *"do not judge whether anything is broken"*, and defect-vs-gap stays a human judgement under the UI test (D22) — the only criterion with an objective answer. This **settles the open question** about classifying feedback into ERROR / improvement / suggestion: there is no ERROR category and there will not be one. If a `bug` value ever looks necessary, it is this design that needs revisiting, not that list. Corollary: it is `mcp-tests/findings/` (D35) and the IMP registry, not a verdict field, that carry a defect claim. |
| D37 | **`verification` is a first-class `harnessError.kind`** (added to §6.4's taxonomy). | 2026-09-14 | A post-condition that could not run is not a network fault and not an absent effect. Filing it under `network` would have been false, and merging it with `effectVerified: false` would destroy the distinction D34 exists to make. |
| D34 | **`expectEffect` — a thin post-condition on `mode: write` probes only.** One check, run by the runner in a fresh MCP session after the agent finishes: did the claimed effect actually happen? Reported as a **third axis** (`effectVerified`), never folded into `outcome`. | 2026-09-14 | **Narrows D7, does not reverse it.** Forced by evidence on the very first probe: the agent reported `OKAY`, the transcript agreed, and the write had silently not landed — neither source of truth in §6.1 can see an effect that the server accepted and discarded. Still no assertion of tools used or path taken, so D7's cheap-authoring argument survives. **Known false-negative:** the check looks in one field, so an agent that puts the marker somewhere else reasonable is marked absent while innocent. Accepted — the error is conservative (it fails loudly rather than passing silently), which is the right direction for a verification mechanism. |
| D35 | **Product defects found by a run are recorded in `mcp-tests/findings/`, not in the IMP registry.** One dated file per finding, carrying the run id, verbatim evidence, an explicit answer to the D22 UI test, and what was *not* verified. A human promotes a finding to an IMP. | 2026-09-14 | Keeps the registry's rule intact — status lives only there — while giving a run's evidence a home the moment it is fresh. No numbering, so it can never be confused with IMP-*. |
| D36 | **Dropped telemetry rows are counted and warned about** (`AtomicLong` + throttled WARN carrying the running total), on both the bounded-queue drop and the shutdown loss. | 2026-09-14 | The drops were logged at DEBUG, i.e. invisible in production. That makes a gap indistinguishable from *"nobody used the MCP that hour"* — a wrong conclusion someone would eventually draw. The sentinel-row option (queryable gaps) was considered and rejected as too expensive for a gap that only needs to be visible. |
| D23 | **Track B (production telemetry) is a separate deliverable in `com.etendoerp.go`**, not part of the harness. | 2026-09-14 | The harness measures synthetic traffic we author; telemetry measures real traffic we do not. The harness only finds defects somebody wrote a probe for; telemetry finds the flows nobody thought of. |
| D24 | **`ETGO_MCP_USAGE` is the source of truth; Mixpanel is a projection.** Everything the product decides must be answerable from the table alone. | 2026-09-14 | Mixpanel can drop, cap, sample or be down, and is a third party. Also: per-instance opt-out is mandatory, so nothing may depend on the exporter being on. |
| D25 | **Telemetry records shape, never content**, and is written **out of the business transaction**, fire-and-forget. | 2026-09-14 | Content adds risk and no diagnostic signal. An in-transaction write means a telemetry failure rolls back the user's order — the same hazard as a synchronous computed column. |
| D26 | ~~Build a Mixpanel exporter~~ → **REVISED 2026-09-14: integrate with the module's existing `NeoTelemetrySink` pipeline instead.** The `/import` migration, `$insert_id`, batching and backoff become improvements to that shared sink. | 2026-09-14 | The original decision was made without checking what the module already had — a July 2026 telemetry pipeline with a working Mixpanel sink, in use by three callers, with tests. EU residency, which the original treated as the headline risk, was already the default (`api-eu.mixpanel.com`). Recorded rather than quietly replaced, because the mistake was procedural (skipped orientation) and worth remembering. |
| D27 | **`neo_feedback` reuses the harness verdict schema (§6.3) verbatim.** | 2026-09-14 | So lab feedback and production feedback aggregate into one corpus and the same friction is the same row. Feedback text is stored as data, never instructions, and rate-limited per session. |
| D28 | **Telemetry is ON by default, with per-instance opt-out.** | 2026-09-14 | Off-by-default means nobody turns it on and the track produces nothing. Defensible because B1 stores shape, not content (D25); the opt-out matters mainly for the Mixpanel export, which leaves our control. |
| D29 | **Table name: `ETGO_MCP_USAGE`.** | 2026-09-14 | Holds both tool calls and feedback — both are MCP usage. |
| D30 | **Harness traffic is NOT distinguished from production traffic** — no `source` column. | 2026-09-14 | Accepted consequence: harness runs are mixed into production statistics. Mitigated at zero cost by `client_name` from the `initialize` handshake, which already identifies the harness if separation is ever wanted. |
| D31 | **`neo_feedback` is stored in `ETGO_MCP_USAGE`**, discriminated by `row_type`, report in a `payload` CLOB. | 2026-09-14 | One table, and the feedback sits in the same session sequence as the calls that provoked it. Cost: `payload` is null on virtually every row. |
| D32 | **Mixpanel export runs on an in-process async thread**, in-memory buffer, batched flush. | 2026-09-14 | Accepted consequence: a restart loses what is buffered — tolerable *because* of D24 (the committed row is the record; Mixpanel is the projection). Upgrade path is a queue column on the same table. |
| D33 | **No retention policy in v1** — no purge, no aggregation. | 2026-09-14 | The growth rate is a guess until there is real traffic. Stated consequence: we will learn the table is too big from a customer rather than from a plan. Revisit after a month of real use. |
| D22 | **The arbiter for both probe validity and defect status is the UI: if a task can be done in the Etendo GO UI, it must be possible through the MCP.** A task nobody could do in the UI is a broken probe, not a finding. | 2026-09-11 | §4b. Replaces the vaguer *"resolvable in the tenant"*. Gives an objective, checkable reference point on both sides: it keeps unattributable probes out of the suite, and it turns a real failure into a defect claim that names the window and field a person would have used. |
| D21 | **Probes are phrased as a non-technical user with little system knowledge would phrase them**, colloquially and vaguely. The only constraint is that the task be *resolvable* in the target tenant. | 2026-09-11 | §4b. **Supersedes** an earlier note in this draft arguing for narrow, artificially-worded probes on diagnosability grounds — that argument was wrong: attribution comes from the transcript and `frictions[].phase`, not from keeping the task small. Vague wording is itself part of what is measured; a server that only answers its own exact vocabulary is a finding. |
| D5 | **Suite files are YAML.** | 2026-09-11 | Prompts are multi-line prose. |
| D6 | **Runs are written to a timestamped directory and are NOT committed.** | 2026-09-11 | If a run matters, its summary is pasted into a `docs/mcp-evaluation/` report by hand, as today. |
| D7 | **No `expect` block in v1.** A probe is a prompt; verdict + transcript are the whole signal. | 2026-09-11 | Keeps authoring cheap. Accepted blind spot: a probe reaching the right result *by the wrong path* reports `OKAY`, and only a human reading the transcript notices. |
| D8 | **Provider-neutral stack; default provider is NOT Anthropic.** | 2026-09-11 | Revised from v0.1 (was LangChain.js). Now **LangChain Python**, default OpenAI/Gemini. §5. **Thinner as built than as designed** (§5): one client (`ChatOpenAI`) pointed at an OpenAI-compatible gateway, so a non-Anthropic model is a config line but a non-compatible vendor would need code — and every result recorded so far still comes from a single vendor. |
| D9 | **Harness lives at `mcp-tests/` in the repo root**, sibling to `e2e/`, `cli/`, `tools/`. | 2026-09-11 | Follows the existing top-level test-suite convention. |
| D10 | **Cost capped per probe (`MAX_STEPS`, default 25), never globally.** | 2026-09-11 | A run always completes, so runs stay comparable. |
| D11 | **Runner AND UI are both Python; they couple through the filesystem, not a protocol.** Streamlit shells out to the CLI and tails `events.ndjson`. | 2026-09-11 | One toolchain for `mcp-tests/`, and the UI stays optional — the CLI is fully usable without it. Breaks with the repo being Node, accepted because `mcp-tests/` shares no code with `cli/`. |
| D12 | **`harnessError` is a separate axis from `outcome`.** A probe with a harness error has no verdict and is excluded from metrics. | 2026-09-11 | §6.4. Prevents filing an IMP against the product for our own broken config. |
| D13 | **Probe ids are permanent** — never renamed, never recycled. | 2026-09-11 | Same rule as IMP numbers; the only thing that makes "it passed last week" a sentence with meaning. |
| D14 | **`schemaVersion` on the run header and on every verdict.** | 2026-09-11 | The schema will change; old runs must stay readable without migration. |
| D15 | **Credentials redacted at write time; business data kept in full.** | 2026-09-11 | §6.7. The leak path is copy-paste, not git. **Not implemented** — and the gap widened on 2026-09-14, because tool results and tracebacks are now stored verbatim. Treat `runs/` as unredacted. |
| D16 | **Run comparison is not in v1, but the format must permit it.** | 2026-09-11 | Stable ids (D13), run metadata (§6.2) and `schemaVersion` (D14) exist precisely so the comparator can be written later against old data. |
| D17 | **The probe system prompt is versioned and recorded per run.** | 2026-09-11 | §5. It determines results as much as the model does; a silent edit would invalidate comparability invisibly. Implemented, and already load-bearing: `promptVersion` went 1 → 4 in three days. Extended in practice to the verdict field descriptions (§6.3), which the model reads for the same reason and which are versioned with it. |
| D18 | **Auth is a per-target property with three modes — `bearer`, `oauth` (auth code + PKCE), `oauth_client_credentials` — contained in `mcp_client.py`.** | 2026-09-11 | §5. An endpoint reachable only by a pasted token would exclude the deployments most worth measuring. |
| D20 | **The probe agent is naive by default:** the system prompt carries zero Etendo domain knowledge, zero tool names, zero data-model hints. Only instrument calibration (role, honesty, reporting contract) is allowed. | 2026-09-11 | §5. Most of the IMP-* backlog is discoverability; a helpful prompt would hide exactly those defects and make the suite flatter the product. Knowledge levels (`naive`/`oriented`/`expert`) deferred to v2. |
| D19 | **OAuth is interactive by default and resolved at preflight**, before the first probe: the run opens the browser, waits, and continues. `--no-interactive` (auto-detected when headless) turns that into `harnessError: auth` instead. Tokens cached per target in gitignored `mcp-tests/.auth/`, refreshed silently mid-run. | 2026-09-11 | **Revised** — an earlier draft made headless the default and required `make mcp-login` first, which optimised for the unattended case that is not today's. Preflight (rather than lazy) auth is the part that matters: it means no human is needed once probe 1 has started, and bad credentials surface in second 2 rather than minute 12. `MCP_TEST_AUTH_WAIT` bounds the wait so a run can never hang on a human who left. |

## 11. Open questions

The design's open questions are all decided (D38 closes the last one, on how feedback is
classified). What the first three days of real runs opened instead:

1. **Is an untested harness trustworthy enough to base an IMP on?** Nothing in `mcp-tests/` has a
   test. The output has already produced eight findings, so it is clearly useful — but a silent
   recording bug would be indistinguishable from a product defect, which is the one failure mode a
   measurement instrument may not have.
2. **`expect` (D7) partially reversed itself within a week.** D34 added a post-condition because
   both sources of truth agreed on a write that never happened. The open question is whether the
   *rest* of D7 survives, or whether the next surprise forces assertions on the path too.
3. **D8 is satisfied on paper and not in fact.** Every result so far comes from one vendor
   (§5). Until a Gemini run completes end to end, the bias D8 exists to avoid is still present in
   every number the harness has produced.
4. **Without `REPEAT` (§7), the natural variance is unknown**, so "this probe regressed" is not yet
   a statement anyone can make with confidence.
5. Unchanged from the design: whether a tenant with months of harness records still yields
   comparable results (D3).

## 12. v1 scope — status as of 2026-09-14

| # | Scope item | Status |
|---|---|---|
| 1 | `mcp-tests/` at the repo root, Python, self-contained `pyproject.toml` | ✅ |
| 2 | One suite with the seed probe plus 2–4 more | ✅ **exceeded** — three suites (`sales-order`, `discoverability`, `full-flows`) |
| 3 | Runner on LangChain Python, provider from config, agent library confined to `runner/agent.py` | ✅ containment holds; ⚠️ one client wired, see §5 |
| 4 | `{{runId}}` / `{{probeId}}` / `{{timestamp}}` interpolation | ✅ plus `{{marker}}` (§8) |
| 5 | `run.json`, live `events.ndjson`, per-probe verdict + transcript | ✅ — and transcripts now carry results (§6.1) |
| 5b | `summary.md` | ✅ for comparisons — `summary.json` + `summary.md`, `make mcp-report` / `mcp-stability` (§6.6, D47, D48); a single-target run is not summarised |
| 6 | `harnessError` separation | ✅ axis; ⚠️ only three kinds classified (§6.4) |
| 6b | Credential redaction | ❌ **not built** (§6.7) |
| 6c | Naive versioned system prompt (D20) | ✅ at promptVersion 4 |
| 7 | `bearer` + `oauth` (auth code + PKCE), token cache, silent refresh | ✅ · `oauth_client_credentials` ❌ by choice |
| 8 | `make mcp-test` / `mcp-login` / `mcp-ui` | ✅ · `REPEAT=` (`--repeat`, D43) · `MODE` ❌ (§5, §7) |
| — | The Streamlit UI (§9) | ✅ all four v1 views |
| — | `expectEffect` post-condition (D34) | ✅ — added after the design, not in the original scope |
| — | `findings/` (D35) | ✅ eight findings written |
| — | **Tests** | ⚠️ `unittest` under `mcp-tests/tests/` since 2026-10-01 (setup/teardown, empty completions); run schema v4 added agent-record, run-header, `mcp_client` and `ui/runs.py` cases. Run with `.venv/bin/python -m unittest discover -s tests -t .` from `mcp-tests/`. |

Still deferred as designed: chained scenarios (though `full-flows.yaml` is one long chained write
task inside a single probe, which is not the same thing), `expect` assertions beyond D34, run
comparison, CI gating, Holded comparison, auto-updating the IMP-* registry, global cost budget.

**The honest one-line summary:** the measuring half is built and has already produced findings; the
*reporting* half (`report.py`, metrics, redaction, repeat) is not, and neither is any test.
*(2026-10-14: `report.py`, the decision rule and REPEAT now exist for comparisons — §6.6, D43,
D47, D48; redaction still does not.)*

---

# Track B — Production telemetry and in-band feedback

**Different repo, different deliverable.** Everything above runs in `mcp-tests/` and measures the MCP
in a lab with synthetic traffic we author. This track lives in **`com.etendoerp.go`** (the MCP server
itself) and measures **real traffic we do not control**. They are complementary and must not be
merged: the harness answers *"does it work when we ask properly?"*, telemetry answers *"what do
people actually do, and where do they actually get stuck?"*.

The harness can only find defects in flows somebody thought to write a probe for. Telemetry finds the
flows nobody thought of — which, historically, is where the IMP backlog came from.

## B1. Usage table (source of truth)

Every MCP tool call writes one row. Working name **`ETGO_MCP_USAGE`** (final name TBD).

Standard Etendo AD columns (`ad_client_id`, `ad_org_id`, `isactive`, `created`, `createdby`,
`updated`, `updatedby`) plus:

| Column | Meaning |
|---|---|
| `session_id` | MCP session, so a sequence of calls can be reconstructed as one task |
| `tool_name` | `neo_create`, `neo_list`, … |
| `verb` | the CRUD/action verb the call resolved to |
| `entity` | spec / entity touched (`sales-order`, `business-partner`) |
| `fields_touched` | field **names** only, never values |
| `outcome` | ok / error |
| `error_code` | the canonical error code, when it failed |
| `duration_ms`, `req_bytes`, `resp_bytes` | cost and payload size — feeds M3 / ACE |
| `client_name`, `client_version` | from the MCP `initialize` handshake — which agent is calling |
| `row_type` | `tool_call` or `feedback` — the table holds both (D31) |
| `payload` | CLOB, only populated for `row_type = 'feedback'`: the verdict-shaped report (§6.3) |

**Harness traffic is not separated** (D30): a harness run writes rows like any other client. It stays
separable for free anyway, because `client_name` from the `initialize` handshake identifies the
harness — no extra column, no extra code, and the option is there if it is ever wanted.

### Two rules that are not negotiable

**1. Telemetry must never break or slow a tool call.** Writing the row inside the same OBDal
transaction as the business operation means a telemetry failure **rolls back the user's order**
(same hazard as a synchronous computed column — see the Computed Column Policy in `CLAUDE.md`). So
the write is out-of-transaction: its own transaction, fire-and-forget, every exception swallowed and
logged.

**2. Shape, not content.** The table records *that* `neo_create` was called on `sales-order` touching
`businessPartner` and `orderDate`. It does **not** record the partner, the amount, or anything the
user typed. Diagnosis needs the shape; the content adds risk and no signal.

### Retention: none for now (D33)

No purge and no aggregation process in v1. The growth rate is a guess until there is real traffic,
and a retention policy designed on a guess is a retention policy designed wrong. The row is narrow
(no payload except on feedback rows), so the near-term risk is low.

**What this defers, stated plainly:** we will find out the table is too big from a customer, not from
a plan. Accepted deliberately — revisit once a real instance has run for a month and the number is
measurable instead of imagined.

## B2. Mixpanel — INTEGRATE with the existing sink, do not build one (revised 2026-09-14)

**This section was originally written wrong.** It specified a Mixpanel exporter to be built from
scratch, researched from Mixpanel's documentation. The module has had a working telemetry pipeline
since July 2026 and nobody checked:

```
src/com/etendoerp/go/schemaforge/telemetry/
  NeoTelemetrySink.java            interface — emit(NeoTelemetryEvent)
  MixpanelNeoTelemetrySink.java    Mixpanel over HTTP
  MixpanelNeoTelemetryConfig.java  token, apiHost, distinctId, timeout
  CompositeNeoTelemetrySink.java   fan-out
  LogNeoTelemetrySink.java         log-only sink
  NeoTelemetryService.java         entry point, non-throwing
  NeoTelemetryEvents.java          ~20 catalogued event names
```

In use by `NeoCrudHandler`, `NeoWriteRefusalLog` and `ReconciliationKpiTelemetry`, with tests.
The failure was skipping `CLAUDE.md`'s orientation rule — *"read relevant existing files before
creating anything"* — and designing from research instead.

**Revised design: `McpUsageLogger` emits through `NeoTelemetryService`**, adding an MCP tool-call
event to `NeoTelemetryEvents`. No second Mixpanel client, no second config, no second sink. MCP
telemetry then travels the same road as the rest of the product instead of being a private channel.

### What the existing sink already gets right

| Concern | Status |
|---|---|
| **EU data residency** | **Already correct.** `DEFAULT_API_HOST = "https://api-eu.mixpanel.com"`. The GDPR worry in the original B2 was already handled. |
| Non-throwing | `NeoTelemetryService.emit()` catches `Exception`; a sink failure cannot reach the caller |
| Swappable sinks, config by property/env, tests | All present |

### What is genuinely missing — and now improves EVERYTHING, not just us

These four survive the rewrite, but as **improvements to the shared sink**, which is a better
outcome than building them privately: every existing caller gains them too.

1. **`/track` instead of `/import`.** `/track` is the untrusted-client endpoint, authenticated with
   the project token and limited to events from the last 5 days. `/import` is the server-side path
   (service-account auth, historical data) — which matters the moment an event is queued or retried.
2. **No `$insert_id`.** Mixpanel dedups on `(event, time, distinct_id, $insert_id)`; without it a
   retry after a timeout double-counts. Ours would come from the `ETGO_MCP_USAGE` row id.
3. **No batching, no backoff.** One HTTP POST per event, no 429 handling. Mixpanel accepts 2 000
   events per request and asks for exponential backoff (2s → 60s, jitter).
4. **The POST is synchronous on the calling thread**, with a 5 s timeout. No executor anywhere in the
   service. **This is a pre-existing latency risk in code we did not write** — a slow Mixpanel adds
   up to 5 s to a business request that merely emitted an event. Worth raising on its own merits,
   independently of this work.

**D32 (in-process async thread) is therefore already satisfied on our side and not on theirs:**
`McpUsageLogger` has its own queue and writer thread, so *our* emission is off the request thread
regardless. Point 4 is about the other callers.

### What does NOT change

D24 stands unchanged: `ETGO_MCP_USAGE` is the source of truth and Mixpanel is a projection. Nothing
above makes the sink authoritative — it makes it shared.

## B3. `neo_feedback` — the agent reports for itself

A tool the calling agent invokes to report, in its own words, what was confusing, what it could not
find, what it had to guess, and what failed. In-band, unprompted, from real usage.

### Why this is the highest-value item in Track B

B1 sees *that* an agent called `neo_schema` five times before giving up. It cannot see **what the
agent was trying to do** or what it expected. That intent is precisely what turns a metric into an
actionable defect, and the agent is the only party that has it.

### Reuse the harness verdict schema

`neo_feedback`'s payload should be **the same schema as the harness verdict** (§6.3) — `outcome`,
`frictions[]` with their `phase`, `failures[]` with tool + payload + error + whether it self-
recovered, `suggestions[]`.

That is not tidiness, it is the point: lab feedback and production feedback then aggregate into one
corpus, and a friction reported by a probe and the same friction reported by a real client's agent
are the same row. One schema, `schemaVersion` shared (D14).

**Implemented, and D27 was put to the test immediately.** `McpFeedbackVerdict.SCHEMA_VERSION = 3`
tracks `verdict.py`'s `VERDICT_SCHEMA_VERSION = 3` in lockstep, and `ToolRegistry#buildFeedbackTool`
advertises the same fields with the same descriptions — including `wastedCalls[]` and the classified
`suggestions[]`. The verdict schema changed twice within three days of `neo_feedback` being written,
and the shared schema survived both, which is the strongest evidence D27 was right that a design
document can offer. The Streamlit UI renders a `neo_feedback` call's arguments with the *probe
verdict* renderer for exactly this reason (§9).

`suggestions` going from `list[str]` to a list of objects is the first change that altered the
**type** of an existing field, so backward compatibility stopped being free. The Java side upgrades
a legacy string entry rather than rejecting it — one storage shape is the whole point of D27, and it
cannot hold if half the corpus is strings — and records its `kind` as **null**, per D39: a legacy
client had no field to classify with, and crediting it with a deliberate `other` would be a claim
about the agent's intent that nobody made.

### Getting agents to actually call it

An agent will not volunteer feedback it was never invited to give. Two mechanisms, both cheap:

- The tool **description** states plainly that reporting friction is wanted and costs nothing.
- **Error responses carry a pointer to it** — the existing `seeAlso` convention (IMP-5) already
  carries a next-step hint; the moment an agent is stuck is exactly the moment feedback is worth
  most.

**Storage: in `ETGO_MCP_USAGE`** (D31), discriminated by `row_type = 'feedback'`, with the report in
the `payload` CLOB. A `neo_feedback` call *is* a tool call, so it carries the same session, tenant,
timestamp and client columns for free, and the feedback sits in the same sequence as the calls that
provoked it — which is what makes it readable as a story rather than an isolated complaint. Cost
accepted: `payload` is empty on virtually every row.

Guard against the obvious failure: feedback is unvalidated text from an outside agent. It is stored
and reported as **data, never instructions**, and rate-limited per session so a looping agent cannot
flood the table.

## B3b. What the first implementation changed (2026-09-14)

Recorded because the design asserted things the code found to be false.

| Design said | Reality |
|---|---|
| Column `entity` | **Impossible.** Generates `getEntity()`, colliding with `BaseOBObject`. Nor `Entity_Name` — that collides with `getEntityName()` and broke the build. Needs a name checked against `BaseOBObject`'s full accessor list, not merely a plausible one. |
| Column `session_id` | **Misleading in Etendo:** an `*_ID` suffix means foreign key and the model validator treats it as one. Renamed `Session_Key`. |
| "the MCP session" | **Did not exist.** `McpServlet` was stateless and nobody minted an identifier; `Mcp-Session-Id` appeared only in the CORS list. It had to be minted at `initialize` and returned in that header. |
| **D30**: harness traffic is separable "for free" via `client_name` | **Weaker than claimed.** `initialize` and `tools/call` are separate HTTP requests, so a client that does not echo `Mcp-Session-Id` yields rows with neither `session_key` nor `client_name`. The free separation holds only for clients that respect the header. |
| B1 is the complete record (implicit in **D24**) | **Lossy under two conditions:** a full bounded queue drops rows, and a shutdown loses what is queued. D24's ranking still holds — the table loses only under saturation or crash, Mixpanel loses routinely — but "source of truth" is not "complete", and D36 exists so the loss is at least visible. |

## B4. The `$ref` interoperability defect (2026-09-14)

**The single highest-impact thing either track has produced so far, and the harness found it.**

`$ref` is a reserved key inside Google Gemini's `function_response.response`, where it means *"a
pointer to an attached part, resolvable by `display_name`"*. Openbravo's
`DataToJsonConverter#toJsonObject` puts one on **every** serialised record, so every row of every
`neo_list` and `neo_get` carried one. Gemini tried to resolve the pointer, found no such part, and
rejected the **whole** request with HTTP 400. The failure is on the tool *result*, so no prompt
change and no retry can route around it: **the Etendo GO MCP was unusable with every Gemini model
as soon as the agent read a single record.**

The full evidence — the verbatim 400, the five-variant experiment that isolated the trigger to the
literal key name (and cleared the `xxx$_identifier` columns, which merely *contain* a `$` and pass
fine), and what was and was not verified — is in
**`mcp-tests/findings/2026-09-14-ref-key-breaks-every-gemini-model.md`** (D35). It is not
reproduced here; that file is the record.

### The fix, and the four properties that constrain it

`McpResponseSanitizer` strips the key, plus `McpConstants.RECORD_REF_NOTE` declaring the
construction rule once. Four things about it are design, not implementation detail:

1. **MCP surface only.** The stripping happens in the MCP content wrappers, *not* in the shared
   serialiser. The NEO REST API has other consumers — the React SPA among them — and its response
   contract is unchanged. A "fix" in `DataToJsonConverter` would have been a breaking change to a
   product surface in order to work around a third party's reserved word.
2. **Removing the value must not remove the knowledge.** `encodeReference` builds the value as
   `entityName + "/" + id`, and both halves are already on the same row as `_entityName` and `id`.
   So `RECORD_REF_NOTE` states the construction rule **once**, in the two places an agent learns
   shapes — `neo_schema`'s hint and the `docs` preamble — instead of paying for it on every row of
   every response. That makes this an Agent Context Economy win as well as a fix.
3. **It operates on the `JSONObject`, never on rendered text.** Re-parsing a rendered body to strip
   a key would silently rewrite the numbers in it: jettison parses JSON numbers into
   `Integer`/`Long`/`Double`, so a decimal wider than a `double` comes back degraded after one round
   trip. Stripping in place, before rendering, leaves every `BigDecimal` exactly as the producer put
   it.
4. **Only the key spelled exactly `$ref` is removed**, recursively through nested objects and
   arrays. A *value* of the form `"$ref:<opId>"` — the `neo_batch` placeholder — is untouched,
   because this code only ever looks at key names.

### Why this belongs in a document about a test harness

This defect was invisible to every existing test, to the manual `/mcp-comparison` benchmark, and to
the entire IMP backlog, for one reason: **everything that had ever driven this MCP was a Claude or
OpenAI model.** It took a harness whose founding requirement is provider neutrality (D8) to point a
different vendor's model at the server, and it surfaced on essentially the first attempt. §5's
methodological argument — *"an Etendo GO MCP measured only with Claude is measured with the same
bias it was designed under"* — stopped being an argument and became a finding.

It also produced §6.1's result recording: the evidence was in a tool *result*, which no run file
held, so the defect had to be reproduced by hand against a live server to be diagnosed at all.

**Not verified:** no test covers the sanitizer, and no end-to-end Gemini run has completed against
the fixed server. What is established is the mechanism and the strip; what is not established is
that a Gemini probe now finishes.

## B5. Open questions for this track

None outstanding — B-O1…B-O6 are all decided (D28–D33). The ones deliberately deferred rather than
answered, so they are not forgotten: retention (D33, revisit after a month of real traffic) and the
queue-backed exporter (D32, only if in-memory loss stops being acceptable).

Added 2026-09-14, and not deferred by any decision: **none of this track's new code is tested.**
`McpResponseSanitizer`, `McpFeedbackVerdict`, `McpFeedbackTool`, `McpUsageLogger` and `McpUsageRow`
ship without a test of their own. The sanitizer in particular has a recursion, a key-name equality
rule with two documented near-misses (`xxx$_identifier`, `"$ref:<opId>"`) and a number-fidelity
argument for operating on the object graph — every one of which is a behaviour a regression could
quietly reverse, and every one of which is cheap to pin. That is the first thing to write on this
branch.
