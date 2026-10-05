# The parent link is silently dropped on `neo_create` and never enforced on `neo_list`

**Date:** 2026-09-15
**Run:** none — found while verifying the premise of
[`2026-09-14-schema-understates-required-fields.md`](2026-09-14-schema-understates-required-fields.md)
(IMP-40) by hand against **local**, then reproduced independently by a blind agent (below).
**Target:** local — `http://localhost:3100/mcp`

> **Read this before IMP-40.** This finding does not support that one: it **replaces** its
> `orderDate` half. The schema was never understating a requirement. The parent link the agent sent
> was being thrown away, so the server could not derive the values it derives from the parent — and
> the write then refused for a field the agent had no reason to send.

## Three defects, one cause

The MCP publishes a parent/child model, advertises where the parent key is required, and then
enforces it in exactly one place while silently discarding it in another.

### 1. `neo_create` did not declare `parentId`, and ignored it when sent as an argument

The published schema carried only `spec`, `entity`, `fields`. The router read the parent key **out
of `fields`**, which nothing documented. `neo_defaults` — the tool `neo_create`'s own description
tells you to call first — declares `parentId` as a top-level argument and argues at length for
passing it. An agent that follows that shape has its parent link dropped without a word.

Verbatim, against local:

```
neo_create(spec:"sales-order", entity:"lines", parentId:"<order id>",
           fields:{product:"<id>", orderedQuantity:3})
-> 422 validation_error
   missingFields: [salesOrder (C_Order_ID), orderDate (DateOrdered), tax (C_Tax_ID)]
```

```
neo_create(spec:"sales-order", entity:"lines",
           fields:{parentId:"<order id>", product:"<id>", orderedQuantity:3})
-> 201, line created, orderDate resolved by the server as 2026-09-15
```

Same intent, same values. The only difference is where `parentId` sat.

### 2. `neo_list` had no `parentId` at all, and returned a global list instead

`neo_discover` advertises `"parentRequiredFor":["list","get","create","update","delete"]` on **89
child entities**. `McpParentScope` has carried `VERB_LIST` since it was written. Nothing enforced
it for `list` or `get`, and `neo_list` had no argument that could have satisfied it.

```
neo_list(spec:"sales-order", entity:"lines", parentId:"<order id>")   -> 22 rows
neo_list(spec:"sales-order", entity:"lines", totallyMadeUp:"xxx")     -> 22 rows
```

An unrecognised argument was discarded in silence, so both calls returned **every line in the
tenant**. A caller asking for one order's lines got a confident answer that looks exactly like the
right one. This is worse than a refusal: the caller then acts on rows belonging to records it never
asked about — which is precisely what happened while cleaning up this investigation, and cost two
order lines that belonged to other documents.

Meanwhile `neo_defaults` refuses the same shape outright:

> `422 parent_required` — *"'lines' is a child entity of 'sales-order'. In Etendo you browse its
> records inside one parent record — there is no global list."*

One tool states that the global list does not exist. The other returns it.

### 3. The unscoped list mixed sales and purchase lines

`C_OrderLine` holds both. Without the parent, nothing separated them — not the spec, not the
document type. Confirmed against the database for this tenant:

| | lines |
|---|---|
| Standard Order (sales) | 12 |
| Purchase Order | 10 |
| **`neo_list(spec:"sales-order", entity:"lines")` returned** | **22** |

A request scoped to *sales* orders answered with purchase-order lines mixed in, unmarked.

## The UI test (D22)

**Passes, emphatically, for all three.** In the Etendo GO UI a line is only ever reached inside its
order — the parent is the window context, not a parameter that can go missing — and a sales-order
window never shows purchase-order lines. Every one of these is something a person cannot do wrong
in the UI and could not detect through the MCP.

## Independent reproduction by a blind agent

Two agents were given the published tool schemas and three tasks phrased as a person would
("Enséñame las líneas del pedido de venta 1000010", "Añade 3 unidades del producto Cerveza a ese
mismo pedido"). Neither was told what was being tested. One got the schemas **before** the fix, one
**after**.

The before-agent produced, unprompted, exactly the failing sequence:

```json
{"tool":"neo_defaults","arguments":{"spec":"sales-order","entity":"lines","parentId":"<ID>"}}
{"tool":"neo_create", "arguments":{"spec":"sales-order","entity":"lines","fields":{"product":"...","quantity":3}}}
```

`parentId` on the tool that declares it; absent from the tool that does not. It also guessed the FK
field name for the list (`salesOrder`) and said so: *"podría ser `header`, `salesOrderId`,
`orderId`"*. It guessed right. A wrong guess would have returned the unscoped global list rather
than an error.

The after-agent passed `parentId` to both tools and cited the description as its reason.

## Not verified

- **Whether `neo_get`, `neo_update` and `neo_delete` share the gap.** They are advertised in the
  same `parentRequiredFor` list and were **not** probed. Only `list` and `create` were measured.
- **Whether other specs mix document types the way `C_OrderLine` does.** One table was checked.
  Any entity whose AD table serves more than one document type is a candidate.
- **Whether `neo_batch` accepts the parent link consistently.** Not looked at.
- **How many of the 89 advertised child entities are actually reachable unscoped.** The count comes
  from `neo_discover`'s own output, not from probing each one.
- The blind-agent experiment gave the agents **4 of the 18 tools**. Their complaints about missing
  discovery tools, missing `neo_update` and missing name-based lookup are artefacts of that
  truncation and are **not** defects. What survives it: `spec` carries an `enum` and `entity` does
  not, in the same call; and `neo_defaults`'s wording about which resolved values must be re-sent
  in `fields` left both agents genuinely unsure.

## Relationship to the existing registry

- **IMP-40** — its `orderDate` instance is explained by defect 1 above and should be rewritten, not
  fixed as stated. Its `invoiceAddress` instance is **separate and still open**: `BillTo_ID` on
  `sales-order/header` is mandatory, has no default, is marked `visibility:"system"` and
  `readOnly`, has no callout of its own, and the `SE_Order_BPartner` cascade that fills it in the
  UI does not land it here — so the field is unreachable through the documented contract.
- **IMP-18** (unknown field accepted silently on write) — defect 2 is the same failure on the
  **read** side, and shows it is not confined to writes.
