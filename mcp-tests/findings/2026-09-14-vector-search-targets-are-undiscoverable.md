# `neo_vector_search` target keys are undiscoverable, and a wrong key reports 403 "Access denied"

**Date:** 2026-09-14
**Run:** `20260914T1723-local-49fa`, probes `create-for-named-customer` and `find-own-order`
**Target:** local — `http://localhost:8080/etendo/sws/mcp`

## What happened

Two probes tried `neo_vector_search` while hunting for a customer and both got:

```
{"error":{"message":"Access denied to vector target","status":403}}
```

Both reported it as a failure in their verdict. Manual follow-up, verbatim:

```
neo_vector_search {query:"test", targets:["business-partner"]} -> 403 Access denied to vector target
neo_vector_search {query:"test", targets:["product"]}          -> 403 Access denied to vector target
neo_vector_search {query:"test", targets:["sales-order"]}      -> 403 Access denied to vector target
```

The tool's own description says:

> Search indexed business records by semantic similarity using DB Extended. **Targets are DB
> Extended search-target keys** ... authorized against their physical source entity for the current
> role.

and its input schema documents `targets` only as *"DB Extended search-target keys to query"*.

## The finding

A **DB Extended search-target key is not a spec name**, and nothing in the MCP surface tells an
agent what the valid keys are: there is no list tool, the schema gives no enum, and `neo_discover`
does not enumerate them. So the only available strategy is to guess — which is what both probes did,
using the spec names they already knew.

The guess then fails as **403 "Access denied to vector target"**, which is indistinguishable from a
genuine permission problem. An agent cannot tell "this key does not exist" from "this key exists and
your role cannot use it", and the message offers no next step. Every other NEO error seen in this
run does better: `unknown_filter_field` returns the `available` list plus a `hint`, and
`validation_error` returns `missingFields` with labels and selector availability.

## The UI test (D22)

**Inconclusive, and deliberately not claimed either way.** Semantic search is not a window a person
opens, so the "could a person do this in the UI?" test does not map cleanly onto it. The defect
claimed here is the **error contract** (undiscoverable keys, and a 403 that conflates absent with
forbidden), not the denial itself.

## Not verified

- **Whether DB Extended is installed or has any search target configured in this tenant.** Not
  checked; it may be entirely legitimate that no target exists here, in which case the denial is
  correct and only the *message* and the *undiscoverability* are the defect.
- Whether a correctly-named key succeeds for this role. No valid key was ever found, precisely
  because there is no way to find one.
- Whether the 403 is emitted by the MCP layer or propagated from DB Extended.

Both possibilities lead to the same recommendation, which is why the finding stands without
resolving them: an unknown target should not be reported as a permission denial, and the valid keys
should be discoverable through the MCP.
