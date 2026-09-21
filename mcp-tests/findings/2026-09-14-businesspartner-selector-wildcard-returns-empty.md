# The `*` wildcard returns fewer results than no filter at all

> ## RETRACTED — 2026-09-15: this is a broken probe, not a defect
>
> **The UI test below FAILS.** The check this file itself asked for ("one minute of manual checking
> would harden it") was run the next day by the user, directly in the Etendo GO UI: **typing `*` into
> the Business Partner selector returns nothing there either.** The MCP behaves exactly like the UI,
> so the MCP-vs-UI gap this finding claimed **does not exist**.
>
> Per [`README.md`](README.md), *"a finding that fails the UI test is a broken probe, not a defect —
> say so and keep the file as a record of the false alarm."* That is what this file now is. The text
> below is left legible as what was believed on 2026-09-14; the refuted sentences are struck in place
> rather than deleted. See **[Correction — 2026-09-15](#correction--2026-09-15)** at the end for the
> full reasoning and for what survives.
>
> **Registry consequence:** `IMP-38` is **🗄️ withdrawn**. The one real gap that survives — that the
> `query` parameter never says what it matches — is registered separately as **IMP-43**.

**Found:** 2026-09-14 · **Runs:** `20260914T1536-local-c4ae` (OKAY), `20260914T1552` (ERROR)
**Target:** `etendo-go-local` · **Probe:** `create-empty-default-customer`
**Severity (proposed, not authoritative):** ~~high — actively misleading, causes task abandonment~~ **→ none: retracted 2026-09-15, not a defect**

## What happened

| Call | Result |
|---|---|
| `neo_selectors(businessPartner, query: "*")` | `{items: [], totalCount: 0, hasMore: false}` — **empty** |
| `neo_selectors(businessPartner, query: "")` | real partners (`Alimentos y Supermercados, S.A`, …) |
| `neo_selectors(businessPartner)` — no query | real partners |

~~`*` is Etendo's own search convention and the UI selectors accept it.~~ **REFUTED 2026-09-15 —
the UI selectors do NOT accept it: `*` returns nothing in the Etendo GO UI either, and nothing in
the MCP's tool descriptions, input schemas or docs ever advertised a wildcard. The convention was
brought by the agent from general ERP knowledge, not offered by the server.** What remains true and
unchanged is the measurement: `*` does not expand, and it returns **strictly less** than the empty
string — which is now understood as the correct behaviour of a filter, not as a defect.

## ~~Why this is worse than an unsupported feature~~ (the argument that was made — void, see the retraction)

An empty result is a meaningful answer: it says *"there is nothing"*. So an agent that reasons
*"let me list everything with the wildcard"* concludes the tenant has no customers and abandons the
task. That is what happened: **the probe failed in 2 of 3 runs** for this reason alone, while the
data was there the whole time.

An unsupported wildcard that errored would cost one retry. One that answers `[]` costs the task.

## Explicitly NOT part of this finding

`query: "default"` also returns empty — and that is **correct**, because no partner is named
"default". An earlier reading of this run treated it as part of the defect; it is not.

## The UI test (D22) — **FAILS** (verdict corrected 2026-09-15)

**Observed 2026-09-15, in the Etendo GO UI, by the user:** typing `*` into the Business Partner
selector returns **no results**. The MCP and the UI agree. There is no MCP-vs-UI gap, and therefore
no defect to claim under D22.

*Original verdict, written 2026-09-14 and wrong — kept legible, not deleted:*

> ~~**Yes, a person can do this in the UI.** The data exists and is visible to the same role and client —
> proved by the unfiltered call returning it, and by the OKAY run successfully creating an order with
> one of those partners. A person opens the Business Partner selector on the Sales Order window, sees
> the list, picks one; typing `*` does not empty their dropdown.~~
>
> ~~Window, field and data all exist → the gap is MCP-vs-UI, not a tenant limitation.~~

**How it went wrong, stated plainly because it is the reusable part:** the last sentence of that
paragraph — *"typing `*` does not empty their dropdown"* — is the only sentence in it that is about
the UI, and it was **asserted, not observed**. Everything before it proves the *data* is reachable,
which is a different claim and was never in doubt. The section read as verified because the
verified half and the unverified half were written in one breath.

## Not verified

- ~~**The UI behaviour was not observed directly.** The claim rests on the data being reachable with
  the same credentials and role. One minute of manual checking would harden it.~~ **Done 2026-09-15 —
  and it refuted the finding.** See the correction below.
- Whether other selectors (`product`, `warehouse`, …) share the behaviour, or whether it is specific
  to `businessPartner`. **Now moot as a defect question:** if `*` is simply not a wildcard anywhere,
  every selector is expected to answer the same way.

## Correction — 2026-09-15

Three facts, in the order they settle the question.

**1. The UI check was run, and the UI does the same thing.** Typing `*` in the Business Partner
selector in the Etendo GO UI returns nothing. The finding's entire defect claim rested on the
opposite being true. It is not.

**2. A selector narrows a list; listing everything is what the entity's own list verb is for.**
This argument is independent of the measurement and is the more durable half of the correction. Even
if `*` *did* expand, asking a selector to return the unfiltered universe asks it to do a job that is
not its own — `neo_list` on the entity is that job, and an omitted `query` (which already returns
real partners, per the table above) is the selector's own way of saying "no narrowing yet". So the
behaviour under discussion was never a missing capability; it was a capability requested from the
wrong verb.

**3. The server never advertised a wildcard.** A grep of `com.etendoerp.go` finds no wildcard
convention in any MCP tool description, input schema or doc. The only description the parameter has
is:

```java
// src/com/etendoerp/go/mcp/ToolRegistry.java:716
props.put(McpConstants.PARAM_QUERY, stringProp("Search query to filter selector values"));
```

*"Filter"* is the correct word for what it does. The agent supplied the `*` convention from general
ERP knowledge; nothing on the MCP surface invited it.

**What this file is now.** A record of a false alarm, kept deliberately. Nothing in the product is
broken, nothing is owed, and no fix is pending. `IMP-38` is **🗄️ withdrawn** in the registry
(`docs/mcp-evaluation/mcp-improvements-registry.md` §4, 2026-09-15).

**What survives, and it is real but small.** The parameter's description says that it filters and
nothing more — not what it matches against, nor how (substring, prefix, exact, token), nor what
omitting it does. An agent has no way to choose a query string from the contract, so it guesses, and
a guess is what produced this false alarm. That gap is registered as **IMP-43**, at a far lower
priority: nothing is broken and no task is blocked by it. The matching rules themselves are
deliberately not written here or in the registry — they are being established against the code, and
writing a guessed answer would repeat the exact error this correction exists to undo.

**The process worked.** This file carried its own "not verified" section naming the one check that
would harden the claim, at a stated cost of one minute. The check was run and it refuted the claim.
The convention that saved it is the one in [`README.md`](README.md): *record what was not verified.*
