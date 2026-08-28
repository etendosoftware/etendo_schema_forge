# Etendo GO MCP — where it wins, and why that matters to an agent

**Audience:** technical evaluators, solution architects, and anyone deciding which ERP an AI agent
should drive. **Reference point:** the Holded MCP, measured side by side on the same task suite.

> Every figure below states where it came from. Measured means a live call was recorded; *estimated*
> means sampled with the method stated in §5. Nothing here is projected from a datasheet.

---

## 1. The claim

**Etendo GO exposes an ERP an agent can actually operate — not a catalogue of endpoints it has to
memorise.** Fourteen generic verbs reach 56 specs. Adding a window adds zero tools.

The difference shows up in three places an evaluator can check in an afternoon: what the agent pays
before it starts, whether it can recover when it gets something wrong, and whether the server stops
it from doing damage.

---

## 2. What the agent pays before it does anything

An MCP server's tool catalogue loads into the agent's context *before it reads the first user
message*. This is the industry's best-documented MCP problem: GitHub's official server is commonly
cited at 42k–55k tokens of definitions, and a typical five-server setup at 30k–60k.

| | Tools | Priming |
|---|---:|---:|
| **Etendo GO** | **17** (exact) | **≈ 10.3k tokens** (estimated) |
| Holded | ≈ 180 (estimated) | ≈ 100k tokens (estimated) |

Two consequences, and the second is the one that surprises people:

- **Etendo GO sits below the client's deferral threshold.** Since early 2026, MCP clients stop
  preloading a catalogue once it passes ~10 % of the context window (~20k tokens at 200k). Etendo GO
  is under it; its verbs are simply *there*, callable immediately.
- **A large catalogue does not stay free.** Past that threshold the client defers it, and the agent
  must search for a tool's schema before it can call it — round trips, on every unfamiliar tool.
  **Observed live:** in the session that produced these figures, the reference server's tools arrived
  deferred and needed three discovery round trips before a single business call could be made.

So the small-catalogue advantage is not really about bytes. It is that **an agent driving Etendo GO
never has to go looking for its own tools.**

---

## 3. Errors an agent can act on

Most integration failures are not crashes — they are a call the agent could have fixed if the server
had said what was wrong. Etendo GO answers with a structured envelope, not prose:

```json
{ "status": 422, "error": "validation_error",
  "detail": "Missing required fields that could not be auto-resolved",
  "missingFields": [{ "name": "product", "type": "foreignKey", "hasSelector": true }],
  "hint": "Provide these fields, or use neo_selectors to find valid values",
  "seeAlso": "docs(topic:\"creating records\")" }
```

*(measured — verbatim from a live `neo_create`)*

Everything the agent needs to retry is machine-readable: which field, what kind, which tool resolves
it, where the documentation lives. A wrong entity name comes back with the list of valid ones. **The
practical effect: the agent corrects itself instead of asking a human.**

The same design goes further than error text. When a value is genuinely not writable where the agent
looked, the field descriptor names where it *is* writable:

```json
{ "name": "eTGOSalePrice", "readOnly": true, "visibility": "readOnly",
  "writableVia": { "spec": "product", "entity": "price",
                   "note": "Set on the sale price list (M_ProductPrice where issopricelist='Y')." } }
```

*(measured)* — an agent that hits a derived field gets a forwarding address instead of a dead end.

---

## 4. Guardrails, because an agent will eventually be wrong

An ERP is not a CRM: a bad write lands in the ledger. Etendo GO ships three protections we have not
found an equivalent for on the reference server:

- **Genuinely atomic batches.** A multi-document batch either commits whole or leaves nothing behind,
  and the response states which it was — `committed`, `atomic`, `persisted`. No half-posted invoice.
- **`businessCritical` field marking.** Amounts, categories and key dates are flagged in the schema
  as values the agent must confirm with a human before writing.
- **Read-only fields are refused, not silently dropped.** A write to a server-maintained field comes
  back as a 422 naming the field, instead of a 200 that quietly discards it.

That last one matters more than it sounds: **a success response that did nothing is worse than a
rejection**, because there is no signal to recover from.

---

## 5. Side by side

| Dimension | Etendo GO | Holded | Basis |
|---|---|---|---|
| Tools to reach the whole surface | 17 verbs → 56 specs | ~180 explicit tools | measured / estimated |
| Priming cost | ≈ 10.3k tokens | ≈ 100k tokens | estimated (§6) |
| Preloaded, or searched on demand? | preloaded | deferred | observed live |
| Calls per outcome vs reference | **1.0× — parity** | 1.0× | measured |
| Structured, self-correcting errors | yes — field + hint + tool + docs | not equivalent | measured / observed |
| Forwarding address on non-writable fields | yes (`writableVia`) | n/a | measured |
| Atomic multi-document writes | yes, with an explicit outcome contract | not equivalent | measured |
| Human-confirmation flagging | yes (`businessCritical`) | not equivalent | measured |
| Cost of exposing a new window | zero new tools | new endpoint + new tool | architectural |
| Deep ERP surface (accounting, tax, inventory, multi-org) | yes | not exposed | catalogue review |

**Calls per outcome is parity, and that is the point of this row.** A generic-verb server is often
assumed to need more steps. It does not: the same task takes the same number of calls on both.

---

## 6. Where we are still working

Publishing this without the other half would be marketing, not evaluation.

- **Our responses are heavier per call.** Measured at roughly 14× the reference server's bytes for
  the same task (median of two tasks). Etendo GO pays introspection at runtime where an
  explicit-tool server pre-paid it. Concrete case: a create returns the full record — send 3 fields,
  get ~50 back. That is open, tracked, and the single biggest thing we are cutting next.
- **Domains we do not expose yet.** CRM, projects, HR and recurring documents are on the roadmap, not
  in the API. Where the reference server covers those, it covers them and we do not.
- **A first task is cheaper there.** If the whole job is one invoice, an explicit tool built for that
  invoice will beat a generic verb. Our design pays off across a working session, not a single call.

We publish this list because the numbers above are checkable, and an evaluator who finds the gaps
themselves stops trusting the rest.

---

## 7. How these figures were produced

- **Environment:** a local Etendo GO build and the Holded demo tenant, probed in the same session.
- **Measured** = a live call was made and its response recorded verbatim. Task-level results come
  from a frozen task suite run cold, using MCP tools only — no database access, because an agent in
  production has none.
- **Estimated** = sampled, not exhaustive. Tool counts: Etendo GO's 17 is exact; Holded's ~180 is
  read off its catalogue listing. Priming totals extrapolate from a hand-picked sample spanning the
  size range (8 of 17 and 6 of ~180), so treat them as order-of-magnitude, not precision.
- **Deliberately not claimed:** a break-even task count. It was computed and withdrawn — the formula
  assumes both catalogues are preloaded, and the reference catalogue was deferred in the very session
  that measured it. Publishing a number that describes a session which does not occur would be worse
  than publishing none.
- Industry reference points for priming cost are from public 2026 write-ups on MCP context
  consumption, not from our own measurements.

Method and raw evidence: `docs/mcp-evaluation/`. The scoring methodology is `/mcp-comparison`
(does the agent succeed) and `/mcp-ace-comparison` (what success costs).
