# IMP-15 — Unify the FK contract across the write verbs

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C2, 0 / 5, ⚙️ signature change |
| **Specification** | registry **Appendix A** (A.6 fixes, A.7 done-when) |
| **Evidence** | W3, W8, B11, B15 (2026-08-05 / 2026-08-06) |
| **Repo** | `com.etendoerp.go` |
| **Implemented** | 2026-08-07, commits `12dd847f` + `2df04cd1` on `feature/ETP-4793` |
| **Live probe** | 2026-08-07 on `etendo-go-local` — §10. Three of four clauses pass; the `uOM` secondary failed and was re-fixed in `2df04cd1` (uncompiled). |

This file records **what shipped**. It changes no status mark and no MARI figure — those move only
through a `/mcp-comparison` run. `2df04cd1` has **not been compiled or deployed**; the credit for
this item therefore depends on a run against an `etendo-go-local` rebuilt past that commit.

## 1. The defect, restated in one line each

| Verb | `currency: "102"` (the id `neo_defaults` returns) | `currency: "EUR"` (a display name) |
|---|---|---|
| `neo_create` | **422** `not_found`, detail: *"pass the exact record id instead"* | ✅ resolved (IMP-4) |
| `neo_batch` | ✅ accepted | **raw DAL** `status: -4`, *"New object Currency(null) (key: EUR_Currency) refered to but not present in the import set"* |

The contract contradicted itself in **opposite directions per verb**, and the `neo_create` failure
advised exactly what the caller had already done.

## 2. Fix 1 — `McpFkResolver` is id-first

`McpFkResolver.resolveOneField` short-circuited on `looksLikeId(search)`, which matches only
`[0-9A-Fa-f]{32}`. But **every Etendo `_ID` column is a `VARCHAR`**, and legacy master data
(currency, UOM, document type, tax rate) still carries short numeric ids. `"102"` failed the shape
test, went down the name path, matched no currency literally *named* `"102"`, and returned a 422.

Shape alone cannot decide "already a valid id", so the resolver now **probes** it:

```java
if (search.isEmpty() || skipValue.test(search) || looksLikeId(search)
    || existsAsRecordId(prop, search, log)) {
  return null;
}
```

Ordering is deliberate: the two cheap shape checks run first, so a UUID still costs **zero DB hits**
and behaves bit-identically to pre-IMP-15.

`existsAsRecordId` uses `OBDal#get(String, Object)` rather than `exists`, so the tenant's
**read-access rules still gate the probe** — an id in a table this role cannot read reports `false`
and falls through to the name path. Every exception is swallowed to the same effect: the worst case
of the new method is the old behaviour, never a new failure mode.

Residual ambiguity — a display name that happens to equal some record's id — resolves to that
record, which is what the caller meant.

> **File:** `src/com/etendoerp/go/mcp/McpFkResolver.java` (class javadoc, `resolveOneField`,
> `existsAsRecordId`).

## 3. Fix 1b — the misleading `not_found` detail

The old text advised *"pass the exact record id instead"* — emitted precisely to agents that had.
Now:

> `No match for 'currency'='Ünknown': it is neither the id of an existing record nor a value any
> selector matched. Use neo_selectors to find a valid one.`

## 4. Fix 2 — `neo_batch` routes through the same resolver

`McpToolRouter.handleBatch` runs a new pre-pass, `resolveBatchFkNames(operations)`, **before**
`BatchService.executeBatch` — i.e. before the transaction opens, so a resolution failure never
leaves a partially-open batch. Two batch-specific rules:

* **`$ref:` values are skipped.** `BatchService.REF_PREFIX` placeholders are substituted only once
  the referenced op has run; sending them to the selector would produce a spurious `not_found` for a
  value that is about to become a valid id. This is why `REF_PREFIX` was widened to `public`.
* **An op whose spec/entity cannot be resolved is skipped, not errored**, so malformed input keeps
  `BatchService`'s existing `{committed:false, failedAt:…}` shape rather than gaining a second one.

On failure the pre-pass returns the resolver's own error object with a `failedAt: {index, id}` added,
so a batch FK failure reports the same coordinates a batch execution failure does.

> **File:** `src/com/etendoerp/go/mcp/McpToolRouter.java` (`handleBatch`, `resolveBatchFkNames`);
> `src/com/etendoerp/go/schemaforge/BatchService.java` (`REF_PREFIX`).

## 5. Fix 3 — batch failures get the IMP-5 envelope

`BatchService.failureBody` forwards the offending sub-response **verbatim** under `error.detail`.
Useful for a REST caller; for an agent it was a raw DAL payload with no code to branch on:

```json
{"error":{"status":400,"message":"Operation 'h1' rejected by server",
  "detail":{"response":{"status":-4,"errors":{"id":"New object Currency(null) …"}}}}}
```

**The translation lives in the MCP layer, not in `BatchService`** — that class serves both the REST
`/batch` endpoint and `neo_batch`, and the REST contract (plus any non-MCP caller reading `detail`)
must stay untouched. `McpToolRouterSupport.toMcpBatchFailure(result)` rewrites the failure **in
place**:

```json
{"committed":false,"failedAt":{"index":0,"id":"h1"},
 "error":{"status":400,"error":"validation_error",
   "detail":"Operation 'h1' rejected by server: id: New object Currency(null) …",
   "seeAlso":"docs(topic:\"creating records\")"}}
```

`error` is `not_found` (404), `method_not_allowed` (405), `validation_error` (any other 4xx) or
`server_error` (5xx, plus the batch-wide failure reported at index `-1`). Only the first three are
worth retrying with a corrected request — `server_error` exists specifically so an agent does **not**
enter a retry-with-corrections loop on something it cannot fix. The DAL's own prose is preserved
inside `detail`; the numeric `status: -4` is dropped, since it names nothing actionable.

Two new codes in `McpConstants`: `ERROR_SERVER`, `ERROR_METHOD_NOT_ALLOWED`.

> **Mutate-in-place matters.** `McpToolRouterRouteTest` holds a class-level
> `MockedStatic<McpToolRouterSupport>`, under which a static-mocked `toMcpBatchFailure(result)`
> returns `null`. Consuming its return value would NPE `batchAllowedForFullAccessRole`; the method
> therefore mutates and is called only when `!result.optBoolean("committed", false)`.

> **File:** `src/com/etendoerp/go/mcp/McpToolRouterSupport.java` (`toMcpBatchFailure`,
> `batchErrorCode`, `extractDalMessage`); `src/com/etendoerp/go/mcp/McpConstants.java`.

## 6. Secondary (A.6) — the `uOM` 500 on `sales-order/lines`

`NeoCrudHandler.executePostCreate` calls `NeoCommercialLinePolicy.injectProductDerivedUomIfMissing`,
which reads `C_UOM_ID` from the line's product. MCP's `handleCreate` runs its **own** pipeline and
never called it, so a line body that `neo_schema` reported as complete died inside the DAL with a
bare `500 "Unit of Measure mismatch (product/transaction)"` — and the value was only recoverable
from an undocumented key in the product selector's response. `handleCreate` now runs the same
injection (the method was widened from package-private to `public static`).

**This clause shipped broken in `12dd847f` and was re-fixed in `2df04cd1`.** The live probe (§10)
still hit message 20111 on *both* verbs against a deploy that demonstrably contained IMP-15. Two
independent holes, neither visible to a unit test:

1. **The injection silently did nothing.** It read `C_UOM_ID` with raw JDBC over
   `OBDal.getInstance().getConnection(false)` and swallowed every exception at `log.debug`. Ruled
   out first: a stale `uOM` from defaults (neither the AD column nor the `ETGO_SF_FIELD` row has a
   `defaultvalue`, and `neo_defaults` returns no `uOM` at all) and body rejection (sending
   `uOM: "100"` explicitly created the line fine, proving the property is accepted and persisted).
   It now reads through the DAL (`Product#getUOM`) and logs `warn` — the old `debug` is exactly what
   hid the cause behind a trigger error raised much later.
2. **The batch path never ran it at all.** `neo_batch` enters the CRUD pipeline through
   `BatchService#createRecord`, not `NeoCrudHandler#executePostCreate`; `12dd847f` only wired
   `handleCreate`.

Both MCP call sites now share `McpToolRouter#injectLineUomIfApplicable`, guarded on the entity
actually declaring `uOM` and skipping `$ref:` placeholders so a batch sentinel is never mistaken for
a product id.

**Root cause of the trigger error, for the record.** AD message `20111` is raised by the DB trigger
`c_orderline_trg`: it reads `M_PRODUCT.C_UOM_ID` for the line's product and raises unless it equals
the row's `C_UOM_ID`. In `ETGO_SF_FIELD` for `sales-order/lines`, `UOM` and `Order UOM` are
`isincluded=Y visibility=system` and `Operative UOM` is discarded — so **no agent-visible contract
ever mentions the field the trigger insists on**. That is why the injection is load-bearing rather
than a convenience.

## 7. Contract documentation

* `ToolRegistry` — `neo_batch`'s `body` description now states the format parity outright ("in the
  same format `neo_create` accepts: a record id (32-char hex **or a legacy numeric one such as
  '102'**) or a display name"), and the return-shape sentence documents the new envelope and its
  four codes.
* `com.etendoerp.go/docs/neo-headless.md` §4.12.3 retitled *"FK resolution on the write verbs
  (IMP-4, extended to every verb by IMP-15)"*, with the id-first rationale and the `$ref:` rule; new
  §4.12.4 documents the `neo_batch` failure envelope.

## 8. Test coverage against A.7's "done when"

| A.7 clause | Covered by |
|---|---|
| identical `fields` body succeeds on both verbs | both verbs share `McpFkResolver`; `neo_batch` now calls it (`resolveBatchFkNames`) — **verified live**, §10 |
| regression test: legacy numeric id | `McpFkResolverTest.legacyNumericIdResolves` |
| regression test: UUID | `McpFkResolverTest.uuidShortCircuits` (asserts *no* DAL and *no* selector interaction) |
| regression test: display name | `McpFkResolverTest.displayNameResolvesViaSelector` |
| …on each verb | the resolver is the single shared code path both verbs take; `skippedValueIsUntouched` covers the batch-only `$ref:` rule |
| no raw `status: -4` on any batch error path | `McpToolRouterSupportTest.rewritesTheFailure` (asserts the serialized error contains no `-4`), `mapsStatusesToCodes`, `extractsDalMessages`, `passesThroughNonFailures` |
| `uOM` never 500s on `sales-order/lines` | ❌ **failed live** in `12dd847f`; re-fixed in `2df04cd1`, **not re-verified** (needs a rebuild) |

## 9. Live write probe — 2026-08-07, `etendo-go-local`

Human-authorized single-run write probe on the disposable local environment. Records created were
tagged `MCP-BENCHMARK 2026-08-07` in `description` and deleted afterwards; disposition in §9.3.

### 9.1 Results per clause

| Clause | Verdict | Evidence |
|---|---|---|
| Fix 1 — id-first resolver | ✅ | `currency: "102"` passed on `neo_create`; the record persisted with `currency: "102"`. Pre-IMP-15 this was a 422. |
| Fix 1b — `not_found` wording | ✅ | The new text ("neither the id of an existing record nor a value any selector matched … Use `neo_selectors`") came back live — which also **proves the deploy contained IMP-15**, making every other verdict here attributable. |
| Fix 2 — batch routes through the resolver | ✅ | `currency: "EUR"` (a display name) passed on the batch **header** op; the batch's failure was at index 1, the line. Pre-IMP-15 the header op died with a raw DAL `status: -4`. |
| Fix 3 — batch failures get the IMP-5 envelope | ✅ | `{"committed":false,"failedAt":{"index":1,"id":"l1"},"error":{"status":500,"error":"server_error","detail":"Operation 'l1' rejected by server: Unit of Measure mismatch (product/transaction)","seeAlso":"docs(topic:\"creating records\")"}}` — no `status: -4` anywhere. |
| Secondary — `uOM` | ❌ | Message 20111 on both verbs. Root-caused and re-fixed in `2df04cd1`; see §6. |

Side confirmations from the same calls, worth carrying into the next run report: **IMP-16** looks
healthy (`orderDate` and `accountingDate` both came back ISO `2026-08-07`, no year-12 corruption) and
**IMP-12** works (`neo_schema view:"create"` returned 3 required / 8 optional with the full hint).

### 9.2 Three defects the probe surfaced — candidate IMPs, no status touched

1. **`neo_batch` is not atomic, despite documenting that it is.** `BatchService`'s own javadoc says
   it "commits everything or rolls back everything", and §8 of the base report lists transactional
   integrity as an Etendo GO *strength* over Holded. It does not hold. Each op reaches
   `DefaultJsonDataService.add`, which ends in `OBDal.getInstance().commitAndClose()`
   (`modules_core/org.openbravo.service.json/…/DefaultJsonDataService.java:1152`), so **every
   operation commits itself**; the `rollbackQuietly()` that `executeBatch` runs on failure then acts
   on an already-closed, already-empty session. Empirical proof, from two independent runs whose
   batch failed at index 1: order `1000017` (`MCP-BENCHMARK 2026-08-05 batch`) and order `1000020`
   (`MCP-BENCHMARK 2026-08-07 IMP-15 batch`) both survived as orphan headers with **zero lines**,
   both `committed:false`. This is the most serious finding of the probe: an agent told
   `committed:false` will retry, and each retry leaves another orphan draft document.
2. **`neo_schema view:"create"` omits a genuinely required field.** For `sales-order/header` it
   listed `businessPartner`, `warehouse` and `partnerAddress`, and `neo_create` then rejected the
   body demanding **`invoiceAddress`** (`BillTo_ID`). A required-field list that is not sufficient
   defeats the whole point of IMP-12 — M2 cannot reach 100 % while it is wrong.
3. **A raw, envelope-less error survives on `neo_create`.** The line create returned bare
   `Unit of Measure mismatch (product/transaction)` with no `status`, no `error` code and no
   `seeAlso` — the batch path now wraps its failures (Fix 3) but the direct create path does not.
   IMP-17 territory.

### 9.3 Data disposition

| Record | Disposition |
|---|---|
| `sales-order/lines` `2CB30C1339ED46F6AA854FFDDBA7EE36` | deleted (`neo_delete` → `deleted: true`) |
| `sales-order/header` `E37B444431A340048EA009A1DB50EB50` | deleted (`neo_delete` → `deleted: true`) |
| `sales-order/header` `C507C03963B64955B5AB33FB02E7C006` (`1000020`) | orphan left by the non-atomic batch — deleted afterwards, and *that it existed at all* is finding §9.2.1 |
| `sales-order/header` `1FE5335E766C49E5903991036B8B9DC1` (`1000017`) | **not deleted** — predates this run (2026-08-05); same orphan pattern, left in place as standing evidence for §9.2.1 |

## 10. What is still owed

1. **Compile + unit-test run of `2df04cd1`** — the user owns build/deploy; that commit is not
   compile-verified.
2. **A deploy to `etendo-go-local`**, then a re-probe of the `uOM` clause only (the other three are
   already credited by §9.1), and a `/mcp-comparison` run to move the status mark and MARI.
3. **Register the three §9.2 defects** in the registry as new items.
