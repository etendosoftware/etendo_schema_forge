# The `*` wildcard returns fewer results than no filter at all

**Found:** 2026-09-14 · **Runs:** `20260914T1536-local-c4ae` (OKAY), `20260914T1552` (ERROR)
**Target:** `etendo-go-local` · **Probe:** `create-empty-default-customer`
**Severity (proposed, not authoritative):** high — actively misleading, causes task abandonment

## What happened

| Call | Result |
|---|---|
| `neo_selectors(businessPartner, query: "*")` | `{items: [], totalCount: 0, hasMore: false}` — **empty** |
| `neo_selectors(businessPartner, query: "")` | real partners (`Alimentos y Supermercados, S.A`, …) |
| `neo_selectors(businessPartner)` — no query | real partners |

`*` is Etendo's own search convention and the UI selectors accept it. Here it does not expand — it
returns **strictly less** than the empty string.

## Why this is worse than an unsupported feature

An empty result is a meaningful answer: it says *"there is nothing"*. So an agent that reasons
*"let me list everything with the wildcard"* concludes the tenant has no customers and abandons the
task. That is what happened: **the probe failed in 2 of 3 runs** for this reason alone, while the
data was there the whole time.

An unsupported wildcard that errored would cost one retry. One that answers `[]` costs the task.

## Explicitly NOT part of this finding

`query: "default"` also returns empty — and that is **correct**, because no partner is named
"default". An earlier reading of this run treated it as part of the defect; it is not.

## The UI test (D22)

**Yes, a person can do this in the UI.** The data exists and is visible to the same role and client —
proved by the unfiltered call returning it, and by the OKAY run successfully creating an order with
one of those partners. A person opens the Business Partner selector on the Sales Order window, sees
the list, picks one; typing `*` does not empty their dropdown.

Window, field and data all exist → the gap is MCP-vs-UI, not a tenant limitation.

## Not verified

- **The UI behaviour was not observed directly.** The claim rests on the data being reachable with
  the same credentials and role. One minute of manual checking would harden it.
- Whether other selectors (`product`, `warehouse`, …) share the behaviour, or whether it is specific
  to `businessPartner`.
