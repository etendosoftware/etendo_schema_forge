# Products cannot be looked up by partial name

**Found:** 2026-09-14 · **Source:** `neo_feedback` session `fbabec53-c466-4273-81b7-c8a5b7c4c317`
(17:45:09) · **Target:** `etendo-go-local` · **Probe:** `create-for-named-customer`
**Severity (proposed, not authoritative):** medium

## What happened

The task — *"tres cervezas de las ALE"* — could not be resolved to a product:

> *"Product catalog did not contain any product named/searchKey 'ALE'; only a generic 'Cerveza'
> product existed, making the requested item ambiguous."* — cost: 3 extra list calls

> *"Make product lookup support contains/ilike filters or provide a selector endpoint for product by
> name."*

The agent proceeded with the generic product, producing a `MIXED` outcome with a **verified effect** —
an order was created, just not the one that was asked for.

## The part that is genuinely a defect, and the part that is not

**Not a defect:** that no product is named "ALE" in this tenant. That is data.

**The defect:** there is no way to *find out* by partial match. A person typing "cerv" into the
product selector gets a filtered list; the agent has `neo_list` with exact-ish filters and three
wasted calls. This is the same shape as the
[`*` wildcard finding](2026-09-14-businesspartner-selector-wildcard-returns-empty.md) — partial and
fuzzy lookup is how humans search, and the MCP's search surface does not support it.

Note this interacts badly with
[`neo_vector_search` being unusable](2026-09-14-vector-search-targets-are-undiscoverable.md): the tool
that exists precisely for fuzzy lookup answers 403, so the fallback is exact matching or nothing.

## The UI test (D22)

**Yes.** A person opens the product selector on the order line and types part of the name. That the
result is ambiguous is fine and a person resolves it by looking; that the agent cannot even perform
the partial search is the gap.

## Not verified

- Whether `neo_selectors` supports a contains/ilike mode for `product` that the agent did not find —
  in which case this is a **discoverability** defect rather than a missing capability, which is a
  different fix.
- Whether the same limitation applies to other selectors or only to product.
