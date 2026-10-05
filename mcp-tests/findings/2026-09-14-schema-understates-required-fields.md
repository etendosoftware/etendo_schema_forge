# `neo_schema` and `neo_defaults` understate what a write actually requires

**Found:** 2026-09-14 · **Source:** agent-authored `neo_feedback` reports, sessions
`1901b25c-418a-41cc-b420-984d211162af` (17:44:11) and `fbabec53-c466-4273-81b7-c8a5b7c4c317` (17:45:09),
stored in `ETGO_MCP_USAGE` · **Target:** `etendo-go-local`
**Severity (proposed, not authoritative):** high — costs every write agent a guaranteed failed call

## What the agents reported, verbatim

Two independent sessions, two different entities, the same defect:

> *"`neo_schema(view:create)` did not list `invoiceAddress` as required, but `neo_create` rejected the
> request without it."* — cost: 1 failed create call

> *"sales-order line creation required `orderDate` even though `parentId` was provided;
> `neo_defaults` for lines did not surface it as unresolved/required."* — cost: 1 failed create call

Both were reported by the agent **unprompted**, through `neo_feedback`, while it was doing something
else entirely.

## Why it is worse than one missing flag

The read side of the contract is the *only* thing an agent can plan from. When `neo_schema` says a
field is optional and `neo_create` refuses without it, the agent cannot discover the truth except by
failing — so **every agent that creates one of these documents burns a failed write to learn what the
schema should have told it**. It is not bad luck on one call; it is a tax on the whole write path,
and it is invisible in any metric that only counts eventual success.

Note that the first agent still reported `OKAY`. It recovered. The defect is visible only because
the honesty clause forces recovered failures to be reported, and because `neo_feedback` gave it
somewhere to say so.

## The pattern this belongs to

Third occurrence today of the same shape — **the write side and the read side disagree, and the read
side is the one that is wrong**:

| Finding | Shape |
|---|---|
| [`neo_create` accepts unknown fields silently](2026-09-14-neo-create-accepts-unknown-field-silently.md) | write says stored, read has nothing |
| [`orderReference` writable and filterable, never readable](2026-09-14-orderreference-writable-filterable-never-readable.md) | write says stored, read denies it exists |
| **This one** | read says optional, write refuses |

Worth investigating whether these share a root cause before fixing them one at a time.

## The UI test (D22)

**Yes, a person can do this in the UI.** The form shows the fields it will demand, and a required
field is marked before the user presses save — that is the entire function of a form. The MCP's
equivalent of that form is `neo_schema(view:create)` / `neo_defaults`, and it is not telling the
truth. Window, field and enforcement all exist; the gap is MCP-vs-UI.

## Not verified

- **Where the requirement actually comes from.** The agent guessed "callouts/validation"; nobody
  confirmed it. If these fields are enforced by a callout rather than by `AD_COLUMN.IsMandatory`,
  that is likely the root cause and changes the fix entirely.
- Whether other entities are affected, or only `sales-order/header` and `sales-order/lines`.
- Whether `view:create` differs from the default schema view in what it omits.
