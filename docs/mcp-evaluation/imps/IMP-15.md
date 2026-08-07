# IMP-15 — Unify the FK contract across the write verbs

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C2, 0 / 5, ⚙️ signature change |
| **Specification** | registry **Appendix A** (A.6 fixes, A.7 done-when) |
| **Evidence** | W3, W8, B11, B15 (2026-08-05 / 2026-08-06) |
| **Repo** | `com.etendoerp.go` |
| **Implemented** | 2026-08-07, commit `12dd847f` on `feature/ETP-4793` |

This file records **what shipped**. It changes no status mark and no MARI figure — those move only
through a `/mcp-comparison` run. The Java in `12dd847f` has **not been compiled or deployed**; the
credit for this item therefore depends on a run against a rebuilt `etendo-go-local`.

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
| identical `fields` body succeeds on both verbs | both verbs share `McpFkResolver`; `neo_batch` now calls it (`resolveBatchFkNames`) — **live parity still unverified** |
| regression test: legacy numeric id | `McpFkResolverTest.legacyNumericIdResolves` |
| regression test: UUID | `McpFkResolverTest.uuidShortCircuits` (asserts *no* DAL and *no* selector interaction) |
| regression test: display name | `McpFkResolverTest.displayNameResolvesViaSelector` |
| …on each verb | the resolver is the single shared code path both verbs take; `skippedValueIsUntouched` covers the batch-only `$ref:` rule |
| no raw `status: -4` on any batch error path | `McpToolRouterSupportTest.rewritesTheFailure` (asserts the serialized error contains no `-4`), `mapsStatusesToCodes`, `extractsDalMessages`, `passesThroughNonFailures` |
| `uOM` never 500s on `sales-order/lines` | injection added; **needs a live write probe** |

## 9. What is still owed

1. **Compile + unit-test run** — the user owns build/deploy; nothing here is compile-verified.
2. **A deploy to `etendo-go-local`**, then a `/mcp-comparison` run to credit the item. Without a
   rebuild the probes would measure stale behaviour.
3. **Two live probes** the unit tests cannot stand in for: the identical body on both verbs (W3/W8
   re-run), and a `sales-order/lines` create with no `uOM`.
