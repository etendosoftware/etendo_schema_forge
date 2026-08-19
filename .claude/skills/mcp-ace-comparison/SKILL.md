---
name: mcp-ace-comparison
description: >
  Measure and report Agent Context Economy (ACE) for the Etendo GO MCP against a reference MCP
  (default Holded) — how much of an agent's context each server consumes, split into priming
  (ACE-p, paid once per session) and variable (ACE-v, paid per task), plus the break-even task
  count that says which model is cheaper for a given session length. Use when asked to measure
  ACE, compare context cost / payload size / token cost between MCPs, answer "which MCP is
  cheaper to use", justify response-slimming work (field projection, leaner write responses,
  shorter hints), or refresh the ACE figures in the improvements registry (§2.6). Deliberately
  SEPARATE from /mcp-comparison: that one measures whether the agent SUCCEEDS (MARI); this one
  measures what success COSTS. Neither substitutes for the other and their numbers are never
  summed or averaged.
---

# /mcp-ace-comparison — Agent Context Economy, measured

MARI answers *"did the agent get the job done?"*. It is blind to what the job cost: two servers
can tie at M1 = 1.0× while one returns 400 bytes and the other 62 KB. **ACE is that second
question**, and it exists because context is the agent's scarcest resource — a response that does
not fit is a failed call regardless of its status code.

Canonical definition and history live in the registry:
[`mcp-improvements-registry.md`](../../../docs/mcp-evaluation/mcp-improvements-registry.md) §2.6.
This skill is how the numbers get produced. **It never writes a MARI component and never touches an
IMP status** — those belong to `/mcp-comparison`.

## The two components, and why they are never summed

| Component | What it measures | Unit | Paid |
|---|---|---|---|
| **ACE-p** — priming | Bytes of the tool catalogue (names + descriptions + input schemas) that enter the agent's context **before it does anything** | bytes, absolute per server + ratio | once per session, unavoidable |
| **ACE-v** — variable | Bytes exchanged (request + response, summed) to complete **one task**, from a cold start | bytes per task + median ratio | per task |

Summing them would erase the finding. The two servers pay in **opposite directions**: a
many-explicit-tools server front-loads a large fixed cost then runs cheap; a few-generic-verbs
server starts nearly free and pays introspection at runtime, per call. The whole point is that
asymmetry.

## The one output that matters: break-even

```
break-even_tasks = (ACE-p_reference − ACE-p_etendo) / (ACE-v_etendo − ACE-v_reference)
```

How many tasks a session must run before the generic-verb model becomes the cheaper one. Report it
with the session profiles it implies — a conversational assistant doing 5–20 operations sits on a
different side of the line than an overnight batch job.

**Read the direction before quoting a move.** The denominator is *Etendo's per-task penalty*. If
Etendo's responses get fatter, the denominator grows and break-even **falls** — the number improves
because the product got worse. Never report a falling break-even as progress without stating which
term moved. A break-even that fell because ACE-v regressed is bad news wearing a good number.
(This is the same defect that retired MARI's scope-closed ceiling: a metric needing the identical
caveat on every move.)

## Step 0 — Non-negotiable rules

1. **Bytes are the unit. Tokens are never reported as measured.** Count bytes with `wc -c` on the
   payload **saved verbatim to a file**. This harness does not expose per-call token usage. If you
   quote tokens, label them estimates and state the divisor.
2. **Never eyeball a byte count.** Reading a payload in context and writing "~3,900 B" is an
   estimate wearing a measurement's clothes — it happened on 2026-08-19 and weakened that whole
   report. If it was not through `wc -c`, it is an estimate and the report must say so **in the same
   sentence as the number**.
3. **Estimates are allowed; unlabelled estimates are not.** When the exact route is blocked (see
   §ACE-p below), a sampled estimate is a legitimate result — but it carries: the sample size and
   how items were chosen, every assumption, and a **sensitivity range** showing how the conclusion
   moves across plausible assumption values. A point estimate with no range is not reportable.
4. **Both sides or neither, per task.** An ACE comparison of one server against the other's
   documentation is worthless. If the reference server cannot run a task, that task is dropped from
   the median — say so, never substitute quoted docs.
5. **Cold start, every time.** ACE-v is measured from zero knowledge: no ids, names or field lists
   carried in from a previous task or a previous run. Re-priming matters — a task that looks cheap
   because the agent already knew the warehouse id is not measured, it is remembered.
6. **The database is not part of the agent's world.** Same rule as `/mcp-comparison` Step 0: a
   `SELECT` may explain a result, never produce one. A task completed with DB help is not a measured
   task, and its bytes do not go in the median.
7. **A failed task is a first-class datum, and it is the expensive one.** Record its bytes and mark
   it failed. A server that spends 8 KB and fails cost *more* than one that spent 200 B and
   succeeded — never drop failures to make a median look better.
8. **Write probes follow `/mcp-comparison` Step 0.1 verbatim.** Explicit per-run human
   authorization, disposable environments only, tag the data, clean up, report what could not be
   deleted.
9. **English only** — the report is versioned content.

## Measuring ACE-p

The exact route is `tools/list` per server, saved and `wc -c`'d. **Expect it to be blocked**: both
servers have answered **401** to plain `curl` across several attempts, because they authenticate by
OAuth and the token lives in the OS keychain. **Do not go after that token** — extracting stored
credentials is out of scope for this skill, permanently, and previous runs recorded it as a blocker
rather than working around it. Ask the human whether they can produce a catalogue dump; that is the
clean unblock.

Order of preference:

1. **`tools/list` dump** — exact. Save per server, `wc -c`, done.
2. **Human-supplied catalogue export.**
3. **Sampled estimate** — the documented fallback. Rules, all of them:
   - Pull each sampled tool's definition through `ToolSearch`, write it to a file as **minified
     JSON** (that is the wire shape), and `wc -c` it. Never eyeball.
   - Sample **at least 10 tools per server, or 25 %, whichever is larger**, and state how they were
     chosen. A hand-picked range-spanning sample is acceptable and must be labelled as such — it is
     not random.
   - **Get the tool count exactly.** Count catalogue entries and say how. An approximate denominator
     multiplies straight into the headline, and on 2026-08-19 the least-founded input (Holded's
     ≈180) was the one the conclusion rested on.
   - Catalogues are usually **bimodal** — single-argument verbs (`get_*`/`delete_*`/`approve_*`)
     against filter- or body-heavy ones (`list_*`/`create_*`/`update_*`). Estimate the mix, and
     report break-even across the plausible range, not at your favourite point.

**Report per-tool mean alongside the total, always.** The 08-19 estimate found Etendo's advantage
was **entirely tool count** (17 vs ~180) at nearly identical per-tool size (2,281 B vs ~2,100 B) —
which means the advantage erodes as verbs are added, and the total alone hides that completely.

## Measuring ACE-v

Per task, per server, from cold:

1. Run the task through MCP tools only. Save **every** request and response verbatim to its own
   file — request bytes count too; a 4 KB request is 4 KB of context.
2. `wc -c` the lot; sum per task per server.
3. Record calls alongside bytes. Calls are M1's business, but a bytes-per-call figure is what tells
   verbosity apart from chattiness — and they are different defects with different fixes.
4. Report per task **and** as a median ratio. Never a mean: one 43× outlier drags it.

Use `/mcp-comparison`'s frozen task suite so ACE and MARI describe the same work. When the suite is
amended, ACE's series breaks too — say so rather than splicing.

## Report format

Its own file: `docs/mcp-evaluation/mcp-ace-<date>.md`. Never fold into a MARI run report; a reader
must be able to see cost without reading about success.

Required sections:

1. **Header** — date, both targets **named by environment**, build/commit per side, and the mode
   (exact / sampled). If sampled, that word belongs in the header.
2. **ACE-p** — per server: tool count and how counted, per-tool mean, total, and the delta. Method
   and every assumption.
3. **ACE-v** — per task, per server: bytes, calls, bytes/call, and outcome (**including failures**).
   Median ratio.
4. **Break-even** — the arithmetic shown, the sensitivity range, and which session profiles fall on
   each side. Plus the direction reading: which term moved since last time and why.
5. **What this says about slimming work** — name the concrete open items whose fix would move
   ACE-v, with the bytes each would save. This is the section that makes the report actionable
   instead of decorative; it is what turned "responses are verbose" into the observation that
   *write verbs returning the whole record* is worth more than its P2 priority suggests.
6. **Limitations** — every estimate, every unverified count, every dropped task. Write it as the
   next reader's checklist, not as an apology.

Then update registry §2.6 with the new figures and the date. **§2.6 only** — no MARI component, no
IMP status. If the run finds a genuinely new defect, hand it to `/mcp-comparison` for numbering
rather than registering it here.

## Anti-patterns

- **Averaging ACE-p and ACE-v into one "context score".** Destroys the asymmetry that is the finding.
- **Quoting break-even without its range** when ACE-p was sampled.
- **Reporting a falling break-even as an improvement** without saying which term moved.
- **Dropping failed tasks** from the median.
- **Measuring warm.** The second run of a task is always cheaper and means nothing.
- **Comparing across amended task suites** as if it were one series.
- **Concluding "Etendo is fine, it has fewer tools"** from the total alone — check the per-tool mean.
