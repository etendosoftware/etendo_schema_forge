# IMP-15 — Unify the FK contract across the write verbs

| | |
|---|---|
| **Registry row** | [`mcp-improvements-registry.md`](../mcp-improvements-registry.md) §3 — **P1**, cohort C2, 0 / 5, ⚙️ signature change |
| **Specification** | registry **Appendix A** (A.6 fixes, A.7 done-when) |
| **Evidence** | W3, W8, B11, B15 (2026-08-05 / 2026-08-06) |
| **Repo** | `com.etendoerp.go` |
| **Implemented** | 2026-08-07, commits `12dd847f` + `2df04cd1` + `b64af873` + `845e9363` on `feature/ETP-4793` |
| **Live probe** | 2026-08-07 on `etendo-go-local`, four rounds — §9. **All four clauses pass** as of the `845e9363` deploy; the `uOM` secondary failed rounds 1–3 and was root-caused from the container log (§9.5), then verified green on both `neo_create` and `neo_batch` (§9.6). |

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

**This clause shipped broken in `12dd847f` and was mis-diagnosed three times — in `2df04cd1`, in
`b64af873`, and in the sentinel theory `b64af873` was built on — before `845e9363` addressed the
actual cause.** Take the diagnosis history seriously: it cost three probe rounds, and every one of
those rounds was spent theorising because nobody had looked at the failing SQL.

**The real cause (`845e9363`).** The body reaching the DAL carried a `uOM` that was real, valid and
wrong. From the failing INSERT itself:

```
insert into C_OrderLine (…, M_Product_ID, …, C_UOM_ID, …)
values (…, ('D627916D3A9141438A7B383364452E12'), …, ('ADF850C3E6E9413B9F9EEA5C87456073'), …)
ERROR: @20111@   Where: PL/pgSQL function c_orderline_trg() line 168 at RAISE
```

`ADF850C3E6E9413B9F9EEA5C87456073` is **Centimeter**. The product's UOM is `100`, **Unit**.

`C_UOM_ID` is mandatory on `C_OrderLine`, so `NeoDefaultsService#tryInjectFirstFromLookup`
preselects the first combo option for it — alphabetically *Centimeter* — and does so **before** the
product callout runs. The callout then answers correctly (the log shows
`"uOM":{"value":"100","_identifier":"Unit"}`), but on the REST path that mandatory, already-populated
field is in `protectedCalloutFields`, which is precisely what stops the correct answer from
overwriting the guess. The injection was then a no-op because its guard asked the wrong question:

```java
String existingUom = body.optString("uOM", "");
if (!existingUom.isEmpty() && !"0".equals(existingUom) && !"null".equals(existingUom)) {
  return;   // ← "Centimeter" is none of those, so it returns
}
```

The fix inverts the question. "Is the body's `uOM` non-empty?" is not a usable proxy for "did the
caller choose a `uOM`?" — the defaults pass guarantees it is always non-empty. So the policy now
takes an explicit `userProvidedUom` flag, supplied from the pre-defaults snapshot each call site
already keeps (`userProvided` in `handleCreate`, `userSubmittedFields` in `executePostCreate`, and
the raw op body in the batch pre-pass). **The product is the authority: anything the defaults pass
guessed loses to it; only a value the caller actually sent wins.**

**Why the first three attempts all failed the same way.** Each one refined the guard's notion of
"absent" — `""`, then `"0"`, then `"null"` — while the value sitting in the body was a legitimate
UOM id that no widening of "absent" would ever match. The sentinel theory in particular was
plausible and wrong: `SL_Order_Product` really does read the UOM from `inpmProductId_UOM`
(`SL_Order_Product.java:53,99`), a parameter the UI's product combo supplies and a NEO create never
does — but that path was never the one populating `uOM` here.

**The two things `2df04cd1` changed were still not the cause**, though both are worth keeping:

1. **The raw-JDBC read**, rewritten to `Product#getUOM` with the swallow raised from `debug` to
   `warn`. It was never firing at all, so the JDBC was not what failed — but the `debug` is
   genuinely part of why this stayed hidden.
2. **The batch pre-pass.** `12dd847f` wired only `handleCreate`, and the assumption was that
   `neo_batch` therefore never ran the injection. **That assumption was wrong**:
   `BatchService#createRecord` dispatches through `NeoCrudHandler#handleDefault`, which reaches
   `executePostCreate` (`NeoCrudHandler.java:385`) and runs the injection natively. The pre-pass
   earns its keep for a different reason than the one it was written for: it puts `uOM` in the body
   *before* the defaults pass, so the product's value is the one that ends up protected.

Both MCP call sites share `McpToolRouter#injectLineUomIfApplicable`, guarded on the entity actually
declaring `uOM` and skipping `$ref:` placeholders so a batch sentinel is never mistaken for a
product id.

**Method note — the one that actually mattered.** Rounds two and three were spent verifying deployed
bytecode (`javap -c -p` on
`volumes/tomcat/webapps/etendo/WEB-INF/classes/…/NeoCommercialLinePolicy.class` proved `b64af873`
was live and the guard byte-for-byte correct) and still produced no answer, because bytecode
verification only rules out a stale deploy — it cannot tell you what data flowed through. The
question was settled in one command:

```bash
docker logs --since 3m etendo-tomcat-1 2>&1 | grep -iE 'NEO-LINE-POLICY|uom|20111'
```

Earlier sessions recorded that "log-based debugging is unavailable" because `$CATALINA_HOME/logs`
and `volumes/tomcat/logs` are both empty. **That conclusion was wrong**: Tomcat runs in the
`etendo-tomcat-1` container and logs to stdout, so `docker logs` has the full log — including the
verbatim failing INSERT with its bound parameters, which is the single artifact that would have
ended this on day one. *Check `docker logs` before theorising about a runtime failure.*

Incidental: the class mtimes differ from local time by exactly 3 h with identical seconds — a
timezone artifact of the container copy, not evidence of a stale file.

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
| `uOM` never 500s on `sales-order/lines` | ✅ **verified live in round four** (§9.6) — after failing three times (`12dd847f`, `2df04cd1`, `b64af873`). Fixed in `845e9363`; the line now creates on the first call with `uOM: "100"` derived from the product, on `neo_create` and `neo_batch` alike |

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
| Secondary — `uOM` | ✅ *(round four)* | Message 20111 on both verbs in rounds 1–3; `2df04cd1` and `b64af873` **fixed neither**. Root-caused in round three from the container log and fixed in `845e9363`; verified green on `neo_create` and `neo_batch` in §9.6. |

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

### 9.4 Second probe round — 2026-08-07, after the `2df04cd1` deploy

Re-probe of the `uOM` clause only. **It failed again**, and that failure is what produced the actual
diagnosis in §6.

| Step | Result |
|---|---|
| `neo_create` `sales-order/header` (`1000021`, id `931FB816…`) | ✅ created; `currency: "102"` resolved again |
| `neo_create` `sales-order/lines`, no `uOM` | ❌ first attempt returned a **clean IMP-5 envelope** — `{status:422, error:"validation_error", missingFields:[{name:"orderDate", column:"DateOrdered"}], hint:…, seeAlso:…}`. Worth noting on its own: the line's `orderDate` is required but is not surfaced by `neo_schema view:"create"` either, the same defect class as §9.2.2. |
| …retried with `orderDate` | ❌ `Unit of Measure mismatch (product/transaction)`, raw and envelope-less — §9.2.3 again |
| Deployed bytecode check | `2df04cd1` **was** live (`grep -a` found `injectLineUomIfApplicable` in the deployed `McpToolRouter.class`), which is what ruled out a stale deploy |
| Product `D627916D…` ("Fernet") | `c_uom_id = 100` — so injecting it would have satisfied the trigger, proving the injection never ran |

Fixed — as it turned out, *not* — in `b64af873`. Data disposition: header
`931FB816B09347CEA4E447498C5A1AB1` deleted (`neo_delete` → `deleted: true`); no line was ever
created, so nothing else to clean.

### 9.5 Third probe round — 2026-08-07, after the `b64af873` deploy

Re-probe of the `uOM` clause only. **It failed a third time** — and this round finally produced the
real diagnosis, because it stopped theorising and read the container log.

| Step | Result |
|---|---|
| `neo_create` `sales-order/header` (`1000022`, id `488023AD…`) | ✅ created; `currency: "102"` resolved again |
| `neo_create` `sales-order/lines`, no `uOM` | ❌ `Unit of Measure mismatch (product/transaction)`, raw and envelope-less |
| Control probe: same body with `uOM: "0"` | ❌ but *differently* — a clean `422 not_found` on `uOM` from `McpFkResolver`, which proves FK resolution runs on `uOM` before the injection and that the sentinel path was never the live one |
| Deployed bytecode check (`javap -c -p`) | `b64af873` **was** live: the disassembly shows the `""` / `"0"` / `"null"` guard byte-for-byte. Bytecode verification ruled out a stale deploy for the second round running — and still explained nothing |
| **`docker logs etendo-tomcat-1`** | **decisive.** The callout answered `"uOM":{"value":"100","_identifier":"Unit"}`, yet the failing INSERT bound `C_UOM_ID = 'ADF850C3E6E9413B9F9EEA5C87456073'` = **Centimeter**. The body's `uOM` was real, valid and wrong — see §6 |

Fixed in `845e9363`. Data disposition: header `488023AD74834049BA81635364CAEDAC` deleted
(`neo_delete` → `deleted: true`); no line was created. One leftover remains repo-wide — order
`1000017` (`1FE5335E766C49E5903991036B8B9DC1`, `MCP-BENCHMARK 2026-08-05 batch`), the orphan header
from the non-atomic batch in §9.2.1; it is kept deliberately as evidence for that defect.

### 9.6 Fourth probe round — 2026-08-07, after the `845e9363` deploy

**The `uOM` clause passes.** All four A.6 clauses are now credited live on `etendo-go-local`.

| Step | Result |
|---|---|
| Deployed signature check | `javap -p` shows `injectProductDerivedUomIfMissing(JSONObject, boolean)` — the two-argument form, so `845e9363` is live |
| `neo_create` `sales-order/header` (`1000023`, id `096ECE05…`) | ✅ created; `currency: "102"` resolved |
| `neo_create` `sales-order/lines`, **no `uOM` sent** | ✅ **first call, no corrections** — response carries `"uOM": "100"`, `"uOM$_identifier": "Unit"`. Message 20111 is gone |
| `neo_batch` header + line with `$ref:h1`, no `uOM` | ✅ `{"committed":true,"operations":[{"id":"h1","ok":true,…},{"id":"l1","ok":true,…}]}` — the display name `currency:"EUR"` resolved on the header op and the line got the right UOM. **First end-to-end green batch of the whole exercise** |

Two incidental observations from the same round, both worth carrying forward:

* **`neo_schema view:"create"` under-reports again**, third occurrence. The header create failed its
  first attempt on `invoiceAddress` *and* `partnerAddress`, neither surfaced by the create view —
  same defect class as §9.2.2, now observed on `sales-order/header` (×2 fields), `sales-order/lines`
  (`orderDate`) and here. The failure itself was a clean IMP-5 envelope naming both fields, so the
  *recovery* path is good; the *first-call* path is what costs M2.
* **A third independent reproduction of the non-atomicity defect (§9.2.1)**, and the most realistic
  one yet: a caller-side typo in the `$ref` syntax (`$ref:h1.id` instead of `$ref:h1`) failed the
  batch at index 1 and still left orphan header `1000024` with zero lines under `committed:false`.
  Note also that an unresolvable `$ref` is not caught by the pre-pass — it leaks through as a raw
  DAL message (*"New object Order(null) (key: $ref:h1.id_Order) refered to but not present in the
  import set"*) rather than a validation error naming the unknown op id.

Data disposition: `1000023` + its line, and the batch's `1000024` and the successful batch pair, all
deleted via `neo_delete` (`deleted: true` on each). One leftover remains repo-wide — order `1000017`
(`1FE5335E766C49E5903991036B8B9DC1`, `MCP-BENCHMARK 2026-08-05 batch`), kept deliberately as standing
evidence for §9.2.1.

## 10. What is still owed

1. **Unit-test run of `b64af873` and `845e9363`** — compiled and deployed by the user, and probed
   green in §9.6, but the module's test suite has not been run against them.
2. **A `/mcp-comparison` run** to move the status mark and MARI. The code side of IMP-15 is done:
   all four clauses are credited live (§9.1 + §9.6).
3. **A regression test for the injection.** Three probe rounds died on the same predicate. The test
   must assert the case that actually broke: the injection **overrides** a `uOM` the defaults pass
   put in the body (a real id for the wrong UOM) and **preserves** one the caller supplied — not
   merely that it fires on `""` / `"0"` / `JSONObject.NULL`, which is what the last two fixes
   over-fitted to. Delegate to Tester per the repo's testing rule.
4. **Register the §9.2 defects** in the registry as new items, plus the line-level `orderDate`
   omission found in §9.4 (same class as §9.2.2 — `neo_schema view:"create"` under-reporting
   required fields, now observed on both `header` and `lines`).
5. **Consider a defect for `tryInjectFirstFromLookup` itself.** Preselecting the alphabetically
   first combo option for a mandatory FK is FIC parity by design, but for `C_UOM_ID` on a
   product-bearing line it produces a value that is guaranteed wrong whenever the product's UOM is
   not alphabetically first. `845e9363` fixes the symptom for `uOM`; the general question — which
   mandatory FKs are genuinely user-choices versus derivable — is open and worth its own item.
