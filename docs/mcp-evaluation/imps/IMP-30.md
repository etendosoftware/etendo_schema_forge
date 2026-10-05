# IMP-30 — `neo_create` bypasses the read-only rejection path entirely

| | |
|---|---|
| **Priority** | P1 |
| **Class** | ♻️ Same call (behaviour change on an existing verb) |
| **Repo** | `com.etendoerp.go` |
| **Registered** | 2026-08-13, job A run |
| **Found by** | Write probe on `etendo-go-local`, build `0cb67084` (deploy freshness verified with `javap` on the deployed WAR) |
| **Relates to** | [IMP-28](IMP-28.md) clause 2 — this is the reason that clause never fires through MCP. Distinct from [IMP-31](IMP-31.md), which is the second, independent cause. |

## 1. Symptom — the probe that found it

`neo_create` on `sales-order/header` **accepted and persisted** two curated read-only fields on a
brand-new, zero-line order. IMP-28 clause 2 was supposed to reject exactly this.

Request (`etendo-go-local`, 2026-08-13):

```json
{
  "businessPartner": "203884E383AB4B5AAF3FA05EF8E9BE46",
  "warehouse": "1FF18B068AA94146A2A49C51E13C739C",
  "invoiceAddress": "7C6F01662067414EAEFD134D90A393F1",
  "partnerAddress": "7C6F01662067414EAEFD134D90A393F1",
  "grandTotalAmount": 9999,
  "documentStatus": "CO",
  "description": "MCP-BENCHMARK 2026-08-13 — job A IMP-28 readOnly write probe"
}
```

Response: **200**, record `713FFA549C9845CAA2CCC85BE24CAB32` (documentNo `1000035`) created with
`grandTotalAmount: 9999` and `documentStatus: "CO"` stored verbatim — on a document whose
`summedLineAmount` is `0` and whose `processed` is `false`. A completed order worth 9999 with no
lines and no processing is not a state Etendo can otherwise reach.

The record was deleted in the same run (`{"deleted": true}`). Nothing was left behind.

## 2. Why this matters more than the field values

The values themselves are recoverable — the record was a draft and was deleted. What is not
recoverable is the **guarantee**: an agent writing through MCP can put a document into a status the
business logic never approved, and the totals an accountant reads can be dictated by the caller
rather than derived from the lines. Every downstream consumer of `documentStatus` (reporting,
posting eligibility, the `not-posted-documents` spec) trusts a value the caller supplied.

## 3. Hypotheses and verdicts

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | Config gap — the fields are not curated as read-only | **REFUTED** | `SELECT c.name, f.isincluded, f.isreadonly, f.visibility, f.defaultvalue FROM etgo_sf_field f JOIN ad_column c … WHERE s.name='sales-order' AND e.name='header'` returns `Document Status` → `isincluded=Y, isreadonly=Y, visibility=readOnly` and `Grand Total Amount` → `isincluded=Y, isreadonly=Y, visibility=readOnly`. Both `defaultvalue` are NULL in `ETGO_SF_FIELD`. The curation is correct. |
| 2 | The MCP create path never calls the rejection | **CONFIRMED — this item** | See §4. |
| 3 | Per-entity handler exemption swallows the fields | **CONFIRMED, but a separate cause** | Registered separately as [IMP-31](IMP-31.md). It would fire even if this item were fixed. |

Hypothesis 1 is recorded because it is the intuitive first guess and it is **wrong** — the next
reader should not re-derive it. The curation was never the problem.

## 4. Root cause, with the code

`McpToolRouter.handleCreate` builds a `NeoFieldFilter` but uses it only on the **response**:

```java
// McpToolRouter.java:488
NeoFieldFilter fieldFilter = NeoFieldFilter.forEntity(sfEntity, dalEntityName);
…
// McpToolRouter.java:492-495
// MCP: accept all valid table columns from AI agents, not just SF-configured ones.
// filterWriteRequest strips fields not in ETGO_SF_FIELD writableFields, which is
// too restrictive for MCP where AI agents need to set any valid column.
JSONObject filteredBody = mapFieldsToDalProperties(fields, adTab);
…
// McpToolRouter.java:601 — the filter's only use on this path
```

`mapFieldsToDalProperties` (`McpToolRouter.java:1558-1586`) does pure name resolution — DAL property
name and DB column name lookup — and carries **no** writable / read-only / rejection logic.

An exhaustive search for the rejection's call sites confirms the MCP package never reaches it:

```
src/com/etendoerp/go/schemaforge/util/NeoCrudHelper.java:201:  fieldFilter.filterCreateRequest(requestBody)
src/com/etendoerp/go/schemaforge/NeoCrudHandler.java:626:      fieldFilter.filterCreateRequest(requestBody)
```

Those are the **only two production call sites**, and both are on the REST/schemaforge path. There
are zero in `src/com/etendoerp/go/mcp/`.

**So IMP-28 clause 2 is implemented, unit-tested, and unreachable from the verb it was written
for.** `NeoFieldFilterTest` (lines 405-524) exercises `filterCreateRequest` directly and passes;
those tests are green and always would have been, because they call the method the MCP router does
not. This is the failure mode the skill warns about in as many words: *a parameter no caller sends
leaves behaviour unchanged while looking done in the diff.*

### The superseded claim, kept visible

The 2026-08-13 pre-probe assessment recorded IMP-28 as shipped on the strength of the discover half
verifying live (all read-only entities correctly return `methods:["GET"], readOnly:true`) plus the
green unit suite. That inference was **wrong for clause 2**, and the reason is instructive: the two
halves of IMP-28 travel different code paths, and verifying the cheap one told us nothing about the
other. A green unit test on a method with no caller is not evidence of delivery.

## 5. What a fix must touch

1. **`McpToolRouter.handleCreate`** (`mcp/McpToolRouter.java:472-612`) — must run the rejection
   semantics before persisting. The likely shape: keep `mapFieldsToDalProperties` for name
   resolution (the "MCP accepts any valid column" intent at lines 492-494 is about *unconfigured*
   columns and is worth preserving), then still apply `rejectDisallowedReadOnlyFields` to what
   remains. The two intents are compatible: accepting a column the spec does not curate is not the
   same as accepting a column the spec curates as read-only.
2. A **contract/behavioural test that goes through the router**, not through `NeoFieldFilter`
   directly. The existing unit tests cannot catch this class of bug by construction.

## 6. What a fix must NOT touch

- `filterGetResponse` / `renameToApiKeys` — the GET path is not implicated.
- `filterWriteRequest` (PUT/PATCH) — different method, different semantics (strict writable-only).
- `NeoCrudHandler.executePostCreate` — already calls `filterCreateRequest` correctly.
- **The tempting cheap fix to avoid:** making `neo_schema view:"create"` merely *omit* these fields
  so a well-behaved agent stops sending them. That improves the hint and changes nothing about what
  the server accepts. The defect is that the write is accepted, not that it was suggested.

## 7. Done when

- [ ] `neo_create` on `sales-order/header` with `documentStatus` or `grandTotalAmount` in the body
      returns a 422 naming the rejected field, and creates no record.
- [ ] The same body through the REST create path behaves identically.
- [ ] A router-level test covers it (not only a `NeoFieldFilter` unit test).
- [ ] An entity **with** a `Java_Qualifier` is covered — otherwise [IMP-31](IMP-31.md) silently
      keeps the hole open for exactly the entity this was found on.
- [ ] Re-measured in a job A run against a deploy verified fresh, and the status moved in the
      registry only then.
