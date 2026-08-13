# IMP-31 — The `Java_Qualifier` read-only exemption is all-or-nothing per entity

| | |
|---|---|
| **Priority** | P1 |
| **Class** | ⚙️ Signature change (a body that is accepted today starts being rejected) |
| **Repo** | `com.etendoerp.go` |
| **Registered** | 2026-08-13, job A run |
| **Found by** | Root-cause investigation of the [IMP-30](IMP-30.md) probe |
| **Relates to** | [IMP-28](IMP-28.md) clause 2 (the mechanism this weakens) and [IMP-30](IMP-30.md) (the other, independent cause of the same symptom) |

## 1. The defect

`NeoFieldFilter` exempts an **entire entity** from IMP-28 clause 2 as soon as that entity carries a
non-blank `Java_Qualifier`, without checking whether the handler actually supplies the specific
field being written.

```java
// NeoFieldFilter.java:214-228
if (Boolean.TRUE.equals(sfField.isIncluded())) {
  included.add(propName);
  includeFkIdentifierVariant(included, apiKeyMap, propToApiMap, prop, propName, qualifier);

  if (!Boolean.TRUE.equals(sfField.isReadOnly())) {
    writable.add(propName);
  } else if (!entityHasHandler && !hasConfiguredDefault(sfField.getADColumn())) {
    // IMP-28 clause 2: included + read-only + no AD default + no handler that could be
    // supplying it -> a client-sent value here can only be a mistake …
    rejectableOnCreate.add(propName);
  }
}
```

`entityHasHandler` is set from the entity's qualifier at `NeoFieldFilter.java:156-157`. When it is
true, the `else if` short-circuits and **no field on that entity is ever added to
`rejectableOnCreateFields`** — the whole clause-2 mechanism switches off for the entity.

The class javadoc (`NeoFieldFilter.java:76-78`) already flags this coarseness as a known limitation.
This item is the case where the limitation stops being theoretical.

## 2. Why the exemption is unjustified on the entity it was found on

`sales-order/header` carries a handler:

```
SELECT e.name, e.java_qualifier FROM etgo_sf_entity e
  JOIN etgo_sf_spec s ON s.etgo_sf_spec_id = e.etgo_sf_spec_id
 WHERE s.name = 'sales-order';

 header → salesOrderHeaderHandler
 lines  → orderLineHandler
 (the other 10 entities → NULL)
```

So `entityHasHandler = true`, and both `documentStatus` and `grandTotalAmount` escape rejection.
But `SalesOrderHeaderHandler` **never writes either field** — it dispatches the
`cloneRecord` / `createShipment` / `createDraftInvoice` actions and runs pre-Complete discount-line
logic. The exemption is granted on the basis of a handler existing, not on the basis of that handler
having anything to do with the fields it exempts.

Note this cause is currently **masked** on the MCP path: [IMP-30](IMP-30.md) means the rejection
never runs there at all, so fixing IMP-30 alone would leave this entity still unprotected. On the
REST path, where `filterCreateRequest` *is* called, this is already the live behaviour.

## 3. Why the obvious fix is not safe

Deleting `!entityHasHandler` would re-arm clause 2 everywhere — and some handlers **legitimately**
depend on the current coarse exemption to inject read-only fields:

- `InventoryLineHandler` injects `bookQuantity`; its comment at line 176 states outright that
  *"filterCreateRequest passes readOnly fields through, so injecting bookQuantity here persists."*
- `AbstractInvoiceHeaderHandler` (line 243) and `InvoiceLineHandler` (line 89) carry equivalent
  notes.

Re-arming the clause without a per-field signal would start rejecting bodies those handlers rely on.
That is why this item is classed ⚙️ rather than ♻️: it changes what the server accepts for every
entity with a qualifier.

## 4. What a fix must touch

1. **A per-field signal replacing the per-entity blanket.** The cleanest candidate already exists in
   the schema: `ETGO_SF_FIELD.java_qualifier` (the column is present — verified in
   `information_schema.columns`). A field whose own qualifier names the handler is handler-supplied
   and must stay exempt; a field with no qualifier on an entity that has one is **not** exempt.
   That turns "this entity has a handler" into "this field is supplied by a handler", which is the
   question the code actually needs answered.
2. **`NeoFieldFilter.processFieldMappings`** (`NeoFieldFilter.java:191-231`) — consume that signal at
   line 222 in place of `!entityHasHandler`.
3. **Backfill the exempt fields** that today rely on the blanket: at minimum `bookQuantity` on the
   inventory-line entity, plus whatever `AbstractInvoiceHeaderHandler` and `InvoiceLineHandler`
   inject. Until they are backfilled, step 2 breaks them — the ordering matters.
4. Update the class javadoc at `NeoFieldFilter.java:76-78`, which documents the limitation being
   removed.

## 5. What a fix must NOT touch

- `hasConfiguredDefault` — correct as-is, and not part of either cause.
- `filterWriteRequest` (PUT/PATCH) and `filterGetResponse` — not implicated.
- The handlers' injection behaviour itself. They should keep injecting; the point is to keep
  exempting *them* while stopping exempting everything else on their entity.

## 6. Blocker / sequencing note

This item is only observable end-to-end **after** [IMP-30](IMP-30.md) is fixed, because on the MCP
path the rejection is not reached at all. It is observable on the REST path today. Shipping IMP-30
alone would produce a fix that looks complete and still lets the original probe through on
`sales-order/header` — the two must land together, or IMP-30's test must explicitly cover an entity
with a qualifier.

## 7. Done when

- [ ] Clause 2 rejects a read-only field on an entity that **has** a `Java_Qualifier`, when the
      field is not itself handler-supplied.
- [ ] `bookQuantity` injection on the inventory-line entity still works (regression test).
- [ ] The invoice handlers' injected fields still persist (regression test).
- [ ] The per-field exemption source is documented in `docs/neo-headless-extensibility.md` — a new
      handler author must be able to learn that injecting a read-only field now requires declaring it.
- [ ] The javadoc at `NeoFieldFilter.java:76-78` no longer describes the removed limitation.
- [ ] Re-measured in a job A run, together with [IMP-30](IMP-30.md); status moved in the registry
      only then.
