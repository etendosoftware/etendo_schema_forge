# IMP-37 — Clause 2 rejects the link-to-parent FK, making child creation impossible

| | |
|---|---|
| **Priority** | P0 |
| **Class** | ♻️ Same call (behaviour change on an existing verb) |
| **Repo** | `com.etendoerp.go` |
| **Registered** | 2026-08-20, found by the ETP-4918 Playwright integration suite |
| **Found by** | `contacts-integration.spec.js` — a 422 in the failing run's trace, not by inspection |
| **Relates to** | [IMP-28](IMP-28.md) clause 2 (the mechanism), [IMP-31](IMP-31.md) (whose per-entity blanket is what accidentally shields the other half of the affected entities), [IMP-34](IMP-34.md) (`view:"create"` omitting the parent FK — the same field, one layer up) |

## 1. The defect

`NeoFieldFilter.forEntity` grants write permission to three things **after**
`processFieldMappings` has already classified every field, and never revisits the clause-2
rejection set it just built:

```java
processFieldMappings(allFields, dalEntity, included, writable, rejectableOnCreate, ...);

included.add("id");      writable.add("id");                      // grant 1
included.add("active");  writable.add("active");                  // grant 2
addParentColumnMappings(sfEntity, dalEntity, included, writable); // grant 3

return new NeoFieldFilter(included, writable, rejectableOnCreate, ...);
```

A link-to-parent FK curated read-only therefore ends up in **both** `writable` and
`rejectableOnCreate`. The rejection wins, because `filterCreateRequest` runs
`rejectDisallowedReadOnlyFields` *before* `filterBody`, and that method consults only
`rejectableOnCreateFields` — never `writableFields`.

`addParentColumnMappings`'s own javadoc states the guarantee that is being broken:
*"These are always allowed — they're needed for child record creation."* It was true when
written and stopped being true when clause 2 landed.

## 2. Symptom

`POST /sws/neo/contacts/bankAccount` with the parent link:

```json
{"businessPartner": "<contact id>", "iban": "...", "bankName": "E2E Bank 1787234266262"}
```

```json
{"status":422,"error":"read_only_field",
 "detail":"Field 'businessPartner' is read-only and cannot be set by the caller; its value was
           rejected, not silently dropped, so the write does not answer 200 with the field left unset.",
 "field":"businessPartner"}
```

The row is **uncreatable by any client**: a child row cannot omit its parent link, and cannot
send it either. This is not a hint problem (IMP-34) — it is a hard rejection.

## 3. Blast radius, measured

Queried against the configuration actually pushed to NEO (2026-08-20):

| | Rows | Entities |
|---|---:|---:|
| Link-to-parent FK in the rejection set | 74 | **58** |
| PK (`id`) in the rejection set | 81 | 81 |
| `IsActive` in the rejection set | 0 | 0 |

Among the 58: `warehouse/storageBin`, `simple-g-l-journal/gLJournalLine`,
`financial-account/bankStatementLines`, `price-list/productPrice`, `product/costing`,
`product/productCharacteristic`, `product/billOfMaterials`, `amortization/lines`, and eight
`contacts/*` entities.

`warehouse/storageBin` is worth naming twice: creating a storage bin was the step that blocked
the stock task in the 2026-08-19 benchmark run, and was attributed at the time to a missing
`parentId` on `neo_defaults`. That attribution may have been incomplete.

## 4. Why this is a convention collision, not a curation mistake

Of every link-to-parent column curated `isincluded=Y`:

| `isreadonly` | visibility | Rows | Entities |
|---|---|---:|---:|
| Y | system | 101 | 78 |
| Y | readOnly | 19 | 18 |
| Y | (null) | 8 | 7 |
| N | editable | 18 | 18 |
| N | (null) | 4 | 4 |

**128 of 150 (85%) are read-only.** That is the pipeline's convention and it is correct — the
user does not choose the parent, the navigation context does. So clause 2 is not catching a
handful of mis-curated windows; it is colliding with how the repo curates parents everywhere.

The gap between the 128 curated read-only and the 74 actually rejected is the accidental
shield: the other 54 escape only because their entity happens to carry a `Java_Qualifier`
(IMP-31's per-entity blanket) or their column happens to have an AD default. Today, whether a
child row can be created depends on whether someone incidentally wrote a handler for that
entity.

## 5. The fix

One line in `forEntity`, after the last grant and before the constructor:

```java
rejectableOnCreate.removeAll(writable);
```

**Why subtraction is precise and not a blanket disarm:** inside `processFieldMappings` the two
sets are disjoint by construction — it is an `if/else` on `isReadOnly`:

```java
if (!isReadOnly)                            writable.add(propName);
else if (!entityHasHandler && !hasDefault)  rejectableOnCreate.add(propName);
```

No property can enter both by that path. The subtraction can therefore only remove what the
three grants added: `id`, `active`, and the link-to-parent columns. Nothing clause 2 was
designed to catch is affected.

**Ordering matters.** The line must sit below every `writable.add`. A grant added beneath it
would silently not be honoured — the same shape of bug as the one being fixed.

### Rejected alternative

Making `processFieldMappings` parent-aware (passing it the tab's columns) looks more principled
and is worse: it would still miss `id` and `active`, and at that point in the method the set of
explicit grants is not yet known. The end of `forEntity` is the only place with complete
information.

## 6. What a fix must NOT touch

- Clause 2 itself. The rejection is the right behaviour and must keep firing.
- `filterWriteRequest` (PUT/PATCH) — different semantics, not implicated.
- The curation. Marking a parent FK `system` is correct. The bug is the code confusing
  "the user does not choose this" with "the client may not send it".

## 7. Regression tests

Both go through `forEntity`, **not** the private constructor the other 41 tests in
`NeoFieldFilterTest` use. That is the point: the defect is in how `forEntity` composes its three
sets, so a test handed a ready-made `rejectableOnCreate` cannot observe it — the blind spot
[IMP-30](IMP-30.md) §4 describes.

- `ParentColumnExemption.parentFkSurvivesClause2` — a read-only link-to-parent FK is accepted.
- `ParentColumnExemption.nonParentReadOnlyStillRejected` — a read-only non-parent field on the
  *same* entity is still rejected, so the fix cannot regress into a blanket disable.

Verified by mutation: with the fix line disabled, the first test fails with the exact production
error (`READ_ONLY_FIELD_REJECTED: businessPartner`) and the second still passes.

## 8. Done when

- [x] A POST to a child entity carrying its read-only parent FK is accepted.
- [x] A read-only non-parent field on the same entity is still rejected.
- [x] Both javadocs (`rejectableOnCreateFields`, `addParentColumnMappings`) describe the
      reconciliation.
- [ ] `contacts-integration.spec.js` passes against a rebuilt deploy.
- [ ] The 81 `id` rows re-checked: no client is known to send `id` on create, so no symptom was
      observed, but the same defect covered them.
- [ ] Re-measured in a job A run; status moved in the registry only then.
