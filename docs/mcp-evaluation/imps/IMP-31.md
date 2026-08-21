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

## 6.1 §4.1's proposed signal column is already occupied — the plan does not work as written

**Added 2026-08-14. This refutes §4.1 above; the superseded proposal is deliberately left in place
per this directory's no-rewriting rule.**

§4.1 nominates `ETGO_SF_FIELD.java_qualifier` as the per-field signal, on the grounds that "the column
is present — verified in `information_schema.columns`". That verified the column **exists**. It did not
verify the column is **free**, and it is not:

```sql
SELECT count(*) AS total_fields,
       count(java_qualifier) AS with_qual,
       count(*) FILTER (WHERE java_qualifier ILIKE '%handler%') AS naming_a_handler
  FROM etgo_sf_field;

 total_fields | with_qual | naming_a_handler
 6468         | 5203      | 0
```

The column carries the **DAL property name**, not a handler name — `invoiceAddress`, `documentStatus`,
`bookQuantity`, `quantityOrderBook`. **Zero of 6,468 rows name a handler.**

So the rule as specified ("a field whose own qualifier names the handler is handler-supplied and must
stay exempt") discriminates nothing: no field would ever match, and clause 2 would re-arm everywhere —
precisely the unsafe outcome §3 says must be avoided.

The likelier failure is worse, because it looks like success. Anyone simplifying the predicate to
"qualifier is non-blank ⇒ exempt" exempts 5,203 of 6,468 fields, **including the three this item was
opened on** (`invoiceAddress`, `documentStatus`, `grandTotalAmount` all carry a populated qualifier).
The rejection would then reject nothing while the diff looks complete — the same failure mode as
[IMP-30](IMP-30.md) §4, where a green unit test covered a method the router never calls.

**Consequence for the fix:** step 1 of §4 needs a genuinely new per-field column (with its own AD
records and `make uuid` ids), or a different signal entirely. It cannot reuse `java_qualifier`.

Related correction to §4.3's backfill list: it names `bookQuantity` and the invoice handlers' injected
fields, but **omits `sales-order/header.invoiceAddress`**, which is `isincluded=Y, isreadonly=Y,
visibility=system, defaultvalue=NULL` and AD-mandatory, and which `SalesOrderHeaderHandler` does *not*
write (§2). Re-arming clause 2 without backfilling it makes `sales-order` creation unsatisfiable:
the field cannot be omitted (AD-mandatory, no default) and cannot be sent (rejected), and the callout
that fills it in the UI does not run on the MCP path.

By contrast `product/price.product` — read-only and system-curated, so a natural second candidate for
this list — **does not need backfilling**: `ProductPriceHandler` genuinely injects it along with
`priceLimit` and `priceListVersion` ([IMP-28](IMP-28.md) §7.5a), so it is handler-supplied in fact and
not only by entity association. It is recorded here because it looks like a victim and is not; the
distinction between those two cases is exactly what the per-field signal has to encode.

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

## 6.2 The blanket is currently load-bearing — do not close this before IMP-37

**Added 2026-08-20. This does not revise §3; it quantifies it.**

§3 argues the `!entityHasHandler` blanket cannot simply be deleted because some handlers rely on it
to inject read-only fields. [IMP-37](IMP-37.md) shows the dependency is far broader than those three
handlers, and structural rather than incidental.

Clause 2 also captures **link-to-parent FKs**, which are curated read-only on 128 of 150 occurrences
(85%) — correctly, since the user does not choose a record's parent. On 58 entities that rejection is
live and child-row creation is impossible. On **54 more it is suppressed only by this blanket**: the
entity happens to carry a `Java_Qualifier`, so nothing on it is ever rejected, parent FK included.

So the blanket is not merely masking IMP-30 (§6). It is the only thing keeping child creation working
on those 54 entities. **Re-arming clause 2 per-field, as §4 step 2 proposes, without first landing
IMP-37's reconciliation would take child creation from broken-on-58 to broken-on-112.**

Ordering: IMP-37 first (it is one line and independent), then IMP-30, then this item. IMP-37's
`rejectableOnCreate.removeAll(writable)` also removes the parent-FK class from the §4.3 backfill
problem entirely — those fields never need a per-field exemption signal, because
`addParentColumnMappings` already grants them explicitly.
