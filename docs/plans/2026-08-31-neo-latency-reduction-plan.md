# NEO Headless Latency Reduction Plan

**Date:** 2026-08-31
**Author:** performance analysis pass (read-only investigation, no code changed)
**Scope:** local Etendo GO instance (DB `etendo31ago`, Postgres 16 on port 5416, Tomcat in
`etendo-tomcat-1`), measured against the `purchase-order` window flow.
**Status:** proposal — nothing in this document has been implemented.

---

## Summary

The latency is **not** in Postgres. A 200-statement round trip from the host to
`etendo-db-1` completes in 98 ms (~0.5 ms/query) and the buffer hit ratio is 99.75 %. The time
is burned in the JVM, and it comes from three compounding causes:

1. **The container is capped at 1.0 CPU with an empty `CATALINA_OPTS`.** The JVM therefore
   sizes itself as a single-core client machine: max heap **768 MB** (25 % of the 3 GiB limit)
   and **SerialGC** — a single-threaded stop-the-world collector — for the entire ERP. Every
   request also runs under a live JDWP agent.
2. **Etendo Go is flagged as a module in development, which disables Etendo's entire
   Application Dictionary cache** (`ADCS initialized, use cache: false`, confirmed in the
   Tomcat log). Every display-logic expression, every selector descriptor and every callout
   re-reads and re-hydrates AD metadata from the DAL instead of hitting an in-memory map.
3. **The two hot endpoints do O(fields) work with no memoization, and the client calls them
   O(field-changes) times.** `evaluate-display` re-parses 54 (header) / 55 (lines) AD
   expressions per request through `DynamicExpressionParser` + Rhino, with no compiled-script
   or parsed-expression cache. `POST header` and `GET defaults` both run a *server-side*
   callout cascade over every payload field, up to 5 iterations deep — measured at
   **2.6–10.4 s** in this instance's own `[NEO-PERF]` log lines.

The single highest-leverage change is environment configuration (items P1.1/P1.2 below): it is
a `gradle.properties` edit plus a container recreate, touches no code, and addresses the
multiplier that turns every other inefficiency into seconds.

---

## Findings

### F1 — Tomcat runs on 1 CPU with a 768 MB heap and SerialGC (VERIFIED, confidence: high)

Evidence, read live from the running container:

```
$ docker exec etendo-tomcat-1 cat /sys/fs/cgroup/cpu.max
100000 100000                       # = 1.0 CPU
$ docker exec etendo-tomcat-1 cat /sys/fs/cgroup/memory.max
3221225472                          # = 3 GiB
$ docker exec etendo-tomcat-1 java -XX:+PrintFlagsFinal -version | egrep 'MaxHeapSize|UseSerialGC|MaxRAMPercentage'
   size_t MaxHeapSize    = 805306368   {product} {ergonomic}   # 768 MB
     bool UseSerialGC    = true        {product} {ergonomic}
   double MaxRAMPercentage = 25.0      {product} {default}
```

`docker inspect etendo-tomcat-1` shows `"CATALINA_OPTS="` — empty. The compose template that
produces this is `build/compose/com.etendoerp.tomcat.yml`:

- `com.etendoerp.tomcat.yml:23` — `cpus: "${TOMCAT_CPU_LIMIT:-${BASE_TOMCAT_CPU_LIMIT:-1}}"`
- `com.etendoerp.tomcat.yml:24` — `memory: "${TOMCAT_MEMORY_LIMIT:-${BASE_TOMCAT_MEMORY_LIMIT:-1024M}}"`
- `com.etendoerp.tomcat.yml:18` — `CATALINA_OPTS: ${TOMCAT_CATALINA_OPTS}`

`gradle.properties:71` sets `TOMCAT_MEMORY_LIMIT=3G`, but **`TOMCAT_CPU_LIMIT` and
`TOMCAT_CATALINA_OPTS` are never set anywhere** (verified: absent from both
`gradle.properties` and `build/compose/.env`), so both fall through to their defaults.

Consequences, in order of severity:

- **1 CPU.** One "create PO with a line" flow issues ~204 requests to `/sws/`. Tomcat's
  thread pool has 200 threads but one core; every concurrent request is time-sliced against
  every other one. This is why the client-observed `POST header` median (16.7 s) is roughly
  **2.4×** the server-side median the servlet measures for itself (~7 s, see F4) — the
  difference is queueing, not work.
- **SerialGC on a 768 MB heap.** Etendo's DAL hydrates large AD object graphs per request
  (worse with the cache off, F2). A single-threaded full GC on this heap is a multi-hundred-ms
  to multi-second stop-the-world pause. This is the most plausible explanation for the extreme
  variance in the instance's own timings: the *same* operation logged
  `injectDefaults=121ms` and `injectDefaults=11781ms` within three minutes of each other
  (F4). Work that varies 100× for identical input is a stall, not computation.
- **JDWP agent always on.** `com.etendoerp.tomcat.yml:19–20` hardcodes
  `JPDA_OPTS: -agentlib:jdwp=...` and `command: ["catalina.sh", "jpda", "run"]`, confirmed in
  the live process cmdline. With no debugger attached the cost is modest, but it is not zero
  and it suppresses some JIT behavior. (Note: the `hs_err_pid71071.log` in the Etendo root is
  from Feb 2025 and unrelated — already correctly dismissed.)

**Estimated impact:** the largest single item. Removing the queueing multiplier and the GC
stalls should cut wall-clock latency on the heavy endpoints by roughly **50–70 %** on its own
(e.g. `POST header` 16.7 s → ~5–7 s), without changing a line of code. The lower bound is set
by the real server-side work, which F2–F5 address.

---

### F2 — The AD cache is globally disabled because Etendo Go is "in development" (VERIFIED, confidence: high)

Runtime proof from the Tomcat log:

```
2026-08-31 15:56:14,526 [main] INFO  org.openbravo.client.application.window.ApplicationDictionaryCachedStructures
    - ADCS initialized, use cache: false
```

Cause, in core:
`modules_core/org.openbravo.client.application/src/org/openbravo/client/application/window/ApplicationDictionaryCachedStructures.java:108`

```java
// The cache will only be active when there are no modules in development in the system
useCache = inDevelopmentModules.isEmpty();
```

And the DB agrees — exactly one offender:

```sql
select ad_module_id, name, isindevelopment from ad_module where isindevelopment='Y';
 94E1B433CF55451EABB764750AC5902A | Etendo Go | Y
```

With `useCache == false`, every guarded branch in that class degrades to a live DAL read plus
full graph initialization. The paths that matter here:

- `ApplicationDictionaryCachedStructures.java:275` — `getFieldsOfTab(tabId)` skips the map and
  falls through to `getFieldsOfTab(tab)`.
- `ApplicationDictionaryCachedStructures.java:284–302` — that method iterates **every** field
  of the tab and calls `initializeColumn` on each.
- `ApplicationDictionaryCachedStructures.java:326–350` — `initializeColumn` force-initializes
  the column plus its validation, its validation code, its callout and the callout's model
  implementations, its reference **and** its search-key reference; and
  `initializeReference` (`:367–400`) then walks referenced tables, OBUISEL selectors,
  referenced trees and every `AD_Ref_List` row.
- `ApplicationDictionaryCachedStructures.java:407` / `:319` / `:261` — auxiliary inputs,
  table columns and tables are all uncached too.

For the purchase-order header tab (75 active fields, 104 table columns) this is on the order
of several hundred lazy-collection loads *per call site*, and the call sites are per-field
(see F3). The `pg_stat_user_tables` counters corroborate the pattern rather than a slow query:

| table | seq_scan | seq_tup_read |
|---|---|---|
| `ad_role_orgaccess` | 252 019 | 25 407 359 |
| `ad_column` | 3 135 | 24 314 928 |
| `ad_language` | 90 138 | 8 877 491 |
| `ad_tab` | 6 957 | 6 852 769 |
| `ad_ref_table` | 19 646 | 2 379 801 |

Hundreds of thousands of tiny metadata scans — individually sub-millisecond, collectively the
reason a single request can issue thousands of statements.

**Estimated impact:** high, and it compounds with F1 (each hydrated graph is heap pressure for
a 768 MB SerialGC heap). Turning the cache on should remove a large fraction of the
`injectDefaults` and `evaluate-display` cost. I could not isolate a number for this without
flipping the flag, so treat "large" as directional, not measured.

**Caveat (important):** the flag is `Y` for a reason — with the cache on, AD changes require a
Tomcat restart to be seen. This is a *local-environment* recommendation for perf testing, not
a repo-wide policy change.

---

### F3 — `evaluate-display` re-parses and re-compiles every expression on every request (VERIFIED, confidence: high)

The live endpoint is `NeoDisplayLogicHelper`, not `NeoDisplayLogicHandler` — the latter is
documented dead code (`NeoServlet.java:63–68`).

Per request, `NeoDisplayLogicHelper.handleEvaluateDisplay`
(`util/NeoDisplayLogicHelper.java:84–132`) loops over **all** active fields of the tab and, for
each one that declares `displayLogic` or whose column declares `readOnlyLogic`, calls
`evaluateExpression`. Measured expression counts for this window:

| entity | active fields | displayLogic | readOnlyLogic | expressions/request |
|---|---|---|---|---|
| `header` | 75 | 21 | 33 | **54** |
| `lines` | 56 | 28 | 27 | **55** |

`evaluateExpression` (`util/NeoDisplayLogicHelper.java:147–188`) then, **for each of those 54/55
expressions**:

- `util/NeoDisplayLogicHelper.java:150` — constructs `new DynamicExpressionParser(expression, tab, field)`.
  That constructor calls `parse()` eagerly. Inside, for every `@token@` in the expression,
  `DynamicExpressionParser.getDisplayLogicTextTranslate`
  (`modules_core/.../DynamicExpressionParser.java:396–405`) does
  `WeldUtils.getInstanceFromStaticBeanManager(ApplicationDictionaryCachedStructures.class)`
  followed by `cachedStructures.getFieldsOfTab(tab.getId())` **and**
  `getAuxiliarInputList(tab.getId())` — both of which are the uncached, fully-hydrating paths
  described in F2. Note the constructor used here does **not** pass a `cachedStructures`
  instance (`DynamicExpressionParser.java:156–161`), so the lookup happens per token.
- `util/NeoDisplayLogicHelper.java:176–180` — serializes the whole eval context into a JS
  preamble, producing a **unique script string per request**.
- `util/NeoDisplayLogicHelper.java:181` — `OBScriptEngine.getInstance().eval(fullScript, ctx)`.
  `src/org/openbravo/base/expression/OBScriptEngine.java:55–66` has **no compiled-script
  cache**: it creates fresh bindings and calls `engine.eval(String, …)`, so Rhino parses and
  compiles the script from source every time. Because the preamble inlines the current field
  values, adding a naive cache keyed on the script string would never hit anyway.

The parsed JS for a given `(expression, tabId, fieldId)` is a **pure function of AD metadata**
— it cannot change between requests without an AD change. Recomputing it 54 times per request,
tens of times per document, is pure waste.

Also verified: `buildEvalContext` (`:265–294`) does per-request DAL work — an
`OBDal.get(Client.class, …)`, `DimensionDisplayUtility.getAccountingDimensionConfiguration`
or a live `AcctSchemaElement` criteria query (`:360–370`), and possibly a `DocumentType`
lookup (`:335–348`). All of it is per-client/per-org config, i.e. cacheable.

**Estimated impact:** on the measured numbers, `evaluate-display` medians are 10.3 s (header)
and 8.5 s (lines). A parsed-expression cache plus a compiled-script cache should be the
difference between "re-derive 54 JS programs" and "evaluate 54 pre-compiled programs".
Directionally I expect **an order of magnitude** on the CPU portion, but I have **no
instrumentation on this endpoint** to prove it (see P0.1 — adding that instrumentation is the
first task, precisely so this claim can be checked instead of believed).

---

### F4 — `POST header` and `GET defaults` run a full server-side callout cascade (VERIFIED with measured numbers, confidence: high)

`NeoCrudHandler.executePostCreate` already instruments itself. Real lines from
`docker logs etendo-tomcat-1`, all for `entity=Order`:

```
injectDefaults=910ms   calloutCascade=3295ms  jsonService.add=2300ms  total=6511ms
injectDefaults=11003ms calloutCascade=259ms   jsonService.add=87ms    total=11351ms
injectDefaults=11781ms calloutCascade=244ms   jsonService.add=1044ms  total=13077ms
injectDefaults=1005ms  calloutCascade=10413ms jsonService.add=379ms   total=11803ms
injectDefaults=813ms   calloutCascade=5508ms  jsonService.add=796ms   total=7119ms
injectDefaults=121ms   calloutCascade=302ms   jsonService.add=1108ms  total=1532ms
```

Across the 141 `executePostCreate` lines retained in the log, server-side totals for `Order`
run **1.5 s – 13.1 s**, median ≈ 7 s. Two structural facts:

1. **The cascade re-runs work the browser already did.** `executePostCalloutCascade`
   (`NeoCrudHandler.java:861–902`) → `NeoDefaultsCascadeHelper.executeCalloutCascade`
   (`NeoDefaultsCascadeHelper.java:143–182`) collects *every* payload field that has a callout
   and fires it, looping up to `MAX_CALLOUT_CHAIN_DEPTH = 5`
   (`NeoDefaultsCascadeHelper.java:35`, loop at `:159`). The instance logs exactly which:

   ```
   [NEO-DEFAULTS] Callout cascade: 7 fields have callouts:
     [organization, transactionDocument, orderDate, businessPartner, partnerAddress,
      scheduledDeliveryDate, priceList]
   [NEO-DEFAULTS] Callout cascade: 8 fields have callouts:
     [operativeUOM, orderedQuantity, unitPrice, grossUnitPrice, lineNetAmount, listPrice,
      discount, cancelPriceAdjustment]
   ```

   Meanwhile the trace shows the client already issued **7 interactive
   `POST …/header/callout`** calls (~1–3 s each) *before* submitting. The server then re-fires
   the same 7. The `protectedCalloutFields` set (`NeoCrudHandler.java:803–812`) prevents the
   re-run from *overwriting* user values, but it does not prevent the re-run from *happening*
   — the callouts still execute, they just discard their output for protected keys.
2. **`GET defaults` pays the same bill.** `NeoDefaultsService.java:602` calls
   `NeoDefaultsCascadeHelper.executeCalloutCascade` on the defaults payload. That is why
   `GET header/defaults` measured 10.2 s and `GET header/new` up to 10.0 s.

The comment at `NeoDefaultsCascadeHelper.java:73–86` and `NeoCrudHandler.java:866–874` is
explicit that the cascade exists for **non-UI callers** (`/batch`, MCP, OCR, external agents)
that have no client-side callout dispatch. For a React form that has already run them, it is
duplicated work.

**Estimated impact:** the cascade is 2.6–10.4 s of the create. Making it skippable for callers
that already ran their callouts is worth **~3–6 s median** on `POST header`, and a similar
amount on `GET defaults`.

---

### F5 — Selector descriptor resolution has no memoization, and logs a WARN per miss (VERIFIED, confidence: high)

Top log lines in the last 3 hours, by frequency:

```
1117  WARN SelectorDescriptorResolver - Column Description has no AD_Reference_Value
 709  WARN SelectorDescriptorResolver - Column DateOrdered has no AD_Reference_Value
 658  WARN SelectorDescriptorResolver - No AD_Ref_Table found for reference: 800062
 603  WARN SelectorDescriptorResolver - Column FreightAmt has no AD_Reference_Value
 ... (20+ more lines, each 400–600 occurrences)
 844  WARN GlItemProvisioningSupport - GlItemProvisioningSupport skipped GL Item provisioning …
1426  at org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:93)
```

`SelectorDescriptorResolver.resolveTarget` (`selector/meta/SelectorDescriptorResolver.java:69`)
has **no static cache** — verified by grep: the class contains no `Map`, `ConcurrentHashMap` or
`computeIfAbsent`. `resolveRefTable` (`:398–436`) issues a fresh `OBCriteria<ReferencedTable>`
query on each call and logs a WARN when it finds nothing (`:401`, `:414`). It is called from
`NeoSelectorService.resolveSelectorAuxForId` (`NeoSelectorService.java:623`), which the callout
cascade invokes per field per iteration — hence hundreds of identical WARNs for the same
column.

Two costs stack here: the un-memoized resolution itself, and the logging. The Console appender
is synchronous, and its output goes through Docker's json-file driver inside the Docker Desktop
VM on macOS. Tens of thousands of WARN lines per test run is measurable I/O on the request
thread. The 1 426 `ErrorReportValve` stack frames say the same thing from the error side.

**Estimated impact:** medium. Individually small, but it is on the hot path of every callout
cascade iteration, so it multiplies by the same factor as F4. I have not isolated it.

---

### F6 — The client fires `evaluate-display` twice per field mutation, with no dedup or abort (VERIFIED, confidence: high)

`DetailView.jsx` mounts the hook twice against the same state object:

- `components/contract-ui/DetailView.jsx:1386` —
  `useDisplayLogic(entity, hook.editing, { … })` (header)
- `components/contract-ui/DetailView.jsx:1394` —
  `useDisplayLogic(detailEntity, hook.editing, { … })` (lines)

`hooks/useDisplayLogic.js:121–129` re-runs on every change of the `fieldValues` **object
identity**, with a 300 ms debounce. `hook.editing` is `useState` state
(`hooks/useEntity.js:871`), so its identity changes on every field mutation — including the
mutations a **callout response merges back in**. So each of the 7 interactive callouts produces
a new `editing`, which fires **2 more** `evaluate-display` calls. 7 callouts → ~14
`evaluate-display` requests, which is exactly the measured 10 + 10.

The hook also has no in-flight abort (`hooks/useDisplayLogic.js:102`) and no response cache
beyond the first-paint anti-flicker seed (`:12–45`, deliberately narrow and correct for what it
is). So a burst of edits sends N sequential full-tab evaluations, all but the last of which are
discarded — and on 1 CPU (F1) they queue behind each other.

Worse, the consumer side needs almost none of it: `lineDisplayLogic` is used **only** through
`lineHiddenColumns` (`DetailView.jsx:1433–1438`), which filters the visibility map down to
`trustedDimensionKeys` — a handful of accounting-dimension keys. The server computes 55
expressions so the client can read ~4. The long comment at `DetailView.jsx:1400–1428` documents
that every other key in that response is *known-untrustworthy noise* for this call.

**Estimated impact:** high on total flow time, and it is the cheapest structural fix in this
document. Requesting only the fields the caller consumes turns the lines-entity call from 55
expressions into ~4.

---

### F7 — `purchase-order/paymentPlan` 404s repeatedly (VERIFIED, confidence: high)

The entity exists but is excluded from this spec:

```sql
select s.name, e.name, e.isincluded from etgo_sf_spec s
  join etgo_sf_entity e on e.etgo_sf_spec_id = s.etgo_sf_spec_id
 where e.name = 'paymentPlan';

 purchase-invoice | paymentPlan | Y
 purchase-order   | paymentPlan | N     <-- 404 source
 sales-invoice    | paymentPlan | Y
 sales-order      | paymentPlan | N     <-- same
```

The caller is a shared preview component used by orders as well as invoices:
`windows/custom/shared/useInvoicePreview.js:96` — `apiFetch('/paymentPlan?parentId=…')`. It
runs unconditionally, so on the two order specs it always 404s. Each 404 still costs auth +
`findSpec` + `findEntity` + an `ErrorReportValve` stack trace.

**Estimated impact:** low (tens to low hundreds of ms per flow). Listed because it is trivially
fixable and it pollutes the logs used for diagnosis.

---

### F8 — Postgres is healthy; jsreport's "unhealthy" is a bad healthcheck (VERIFIED, confidence: high)

Both of these were plausible suspects and both are ruled out:

- **Postgres.** 200 sequential `select 1;` statements: **98 ms total** (~0.5 ms round trip).
  `pg_stat_database` for `etendo31ago`: `blks_hit = 65 361 006`, `blks_read = 166 986` →
  **99.75 %** buffer hit ratio. Settings are stock (`shared_buffers` 128 MB, `work_mem` 4 MB,
  `effective_cache_size` 4 GB, `jit on`, `synchronous_commit on`) and none of them are
  implicated by a workload of hundreds of thousands of ~100-row metadata scans. Container is
  using 434 MiB of its 2 GiB.
- **jsreport.** The container reports `unhealthy`, but its own log shows it working normally:
  `Rendering request 871 finished in 1288 ms`, `request 872 finished in 759 ms`. The
  healthcheck is wrong; nothing in the purchase-order flow is blocked on it.

One genuine misconfiguration worth noting even though it is not a latency cause:
`config/Openbravo.properties:103` sets `db.pool.maxActive=10000` while Postgres
`max_connections = 100`. Under real concurrency this fails as connection errors, not slowness.
Currently 30 backends are open.

---

## Plan, by phases

Ordered by impact ÷ risk. **Phase 0 exists because Phase 1 cannot be evaluated without it.**

### Phase 0 — Make the thing measurable (do this first)

#### P0.1 — Instrument `evaluate-display`, `defaults`, `selectors` and `callout` the way `executePostCreate` is already instrumented

- **What:** add `[NEO-PERF]` log lines mirroring `NeoCrudHandler.java:851–858`.
  Minimum: in `NeoDisplayLogicHelper.handleEvaluateDisplay`, log entity, number of expressions
  evaluated, total ms and ms spent in `DynamicExpressionParser` vs in `OBScriptEngine.eval`
  (two accumulators around `util/NeoDisplayLogicHelper.java:150` and `:181`). Same shape for
  `NeoCalloutEndpoint.handleCallout` and `NeoDefaultsEndpoint.handleDefaults`.
- **Where:** `com.etendoerp.go` — `src/com/etendoerp/go/schemaforge/util/NeoDisplayLogicHelper.java`,
  `NeoCalloutEndpoint.java`, `NeoDefaultsEndpoint.java`.
- **How measured:** `docker logs etendo-tomcat-1 | grep NEO-PERF` — see "How to measure" below.
- **Risk:** near zero. One INFO line per request; keep it at INFO to match the existing
  convention, and keep the payload small.

#### P0.2 — Turn on Postgres slow-statement logging for the duration of the exercise

- **What:** `ALTER SYSTEM SET log_min_duration_statement = 200;` + `SELECT pg_reload_conf();`
  (currently `-1`). Optionally enable the `pg_stat_statements` extension, which is **not**
  installed today (verified: `relation "pg_stat_statements" does not exist`) — it is the right
  tool to prove or disprove "a query is slow" in one step.
- **Where:** `etendo-db-1`, runtime only. Revert when done.
- **Risk:** low. It writes to the DB container's log. Given F8, I expect this to come back
  empty — which is itself the useful answer, and worth 2 minutes to establish.

---

### Phase 1 — Environment quick wins (no code, largest single effect)

#### P1.1 — Give Tomcat more than one core, and a real heap

- **What:** in `/Users/futit/Workspace/etendo_develop/gradle.properties`, next to the existing
  `TOMCAT_MEMORY_LIMIT=3G` (line 71), add:

  ```properties
  TOMCAT_CPU_LIMIT=4
  TOMCAT_MEMORY_LIMIT=6G
  TOMCAT_CATALINA_OPTS=-Xms2g -Xmx3g -XX:+UseG1GC -XX:MaxMetaspaceSize=512m -XX:MaxGCPauseMillis=200
  ```

  Then regenerate the compose env and recreate the container. **Do not skip the memory bump:**
  the container currently sits at 1.414 GiB RSS with a 768 MB heap cap, so non-heap (metaspace,
  code cache, Rhino-generated classes, direct buffers) is already ~600 MB. `-Xmx3g` inside a
  3 GiB limit would get the JVM OOM-killed. Pick `TOMCAT_MEMORY_LIMIT` ≥ `Xmx` + 1.5 GiB.
- **Where:** `gradle.properties` (Etendo root). The template that consumes it is
  `build/compose/com.etendoerp.tomcat.yml:18,23,24` — generated, do not edit by hand.
- **How measured:** re-run the flow; compare `[NEO-PERF] executePostCreate … total=` medians
  before/after, and confirm the JVM picked up the settings:
  `docker exec etendo-tomcat-1 java -XX:+PrintFlagsFinal -version | egrep 'MaxHeapSize|UseG1GC'`.
- **What can break:** if the Mac's Docker Desktop VM has fewer than ~6 GiB or 4 vCPUs
  allocated, raising the limits either has no effect (CPU) or makes Docker refuse to start the
  container (memory). Check Docker Desktop's resource allocation first. `TOMCAT_CPU_LIMIT=4`
  will also change JVM ergonomics beyond GC (more compiler threads, larger default thread
  pools) — that is the point, but it means "after" numbers are not comparable to "before" for
  anything but wall clock.
- **Confidence in the gain:** high that it is large; the exact number is unknown until P0.1
  lands.

#### P1.2 — Clear the `isindevelopment` flag on Etendo Go for perf runs

- **What:** `update ad_module set isindevelopment = 'N' where ad_module_id = '94E1B433CF55451EABB764750AC5902A';`
  then **restart Tomcat** (the flag is read once, at ADCS construction —
  `ApplicationDictionaryCachedStructures.java:108`). Verify with
  `docker logs etendo-tomcat-1 | grep 'ADCS initialized'` → must now say `use cache: true`.
- **Where:** DB `etendo31ago`, runtime only.
- **How measured:** same as P1.1. This one should show up specifically in `injectDefaults` and
  in the `evaluate-display` timings from P0.1.
- **What can break:** **this is the risky quick win.** With the cache on, any AD change (new
  field, changed reference, changed display logic) is invisible until Tomcat restarts, and
  `update.database` / `export.database` workflows for a module flagged not-in-development
  behave differently. Treat it as a **temporary, revertible local toggle for benchmarking**,
  not a committed change — and flip it back before doing AD work. Do not do this on a shared
  environment without telling whoever else uses it.
- **Note for the real fix:** if the measurement confirms this is a major contributor, the
  durable answer is *not* "ship with the flag off"; it is P2.1/P2.2 below, which make the hot
  paths cheap regardless of whether ADCS is caching.

#### P1.3 — Drop the two log-spam sources from the hot path

- **What:** demote `SelectorDescriptorResolver`'s per-column misses from `WARN` to `DEBUG`
  (`selector/meta/SelectorDescriptorResolver.java:401`, `:414`, `:423`) — a column with no
  `AD_Reference_Value` is a normal, expected shape, not a warning; and the same for
  `GlItemProvisioningSupport`'s "skipped" message. Alternatively, add a `<Logger>` entry in
  `config/log4j2.xml` for a local-only workaround.
- **Where:** `com.etendoerp.go` (proper fix) or `config/log4j2.xml` (local-only).
- **How measured:** `docker logs etendo-tomcat-1 --since 10m | wc -l` before/after the same flow.
- **What can break:** almost nothing — but check nothing greps these strings (no test does, as
  far as I looked; confirm before merging).
- **Honesty note:** this is bounded. It removes I/O, not the redundant resolution behind it —
  that is P2.3.

#### P1.4 — Stop the `paymentPlan` 404s

- **What:** guard the call at `tools/app-shell/src/windows/custom/shared/useInvoicePreview.js:96`
  so it only fires for specs whose `paymentPlan` entity is included, or tolerate the 404 without
  requesting it. **Decide which:** if orders genuinely should expose a payment plan, the fix is
  in `decisions.json` (`isincluded`) plus a pipeline re-run, not in the component. I did not
  determine which of the two is intended — that is a product question for the window owner.
- **Where:** `schema_forge/tools/app-shell/src/windows/custom/shared/useInvoicePreview.js`, or
  `artifacts/purchase-order/decisions.json` + `artifacts/sales-order/decisions.json`.
- **How measured:** the flow's `/sws/` request count drops by ~3;
  `docker logs … | grep 'Entity not found in spec: paymentPlan'` goes to zero.
- **What can break:** if a window currently *relies* on the 404 as an "orders have no payment
  plan" signal, a guard changes nothing functionally; enabling the entity instead would change
  the UI. Confirm intent first.

---

### Phase 2 — Code changes (durable, survive a `isindevelopment='Y'` local env)

#### P2.1 — Cache the parsed JS per `(expression, tabId, fieldId)` in `evaluate-display`

- **What:** memoize `DynamicExpressionParser`'s output. The parsed JS and the
  `getSessionAttributes()` list are a pure function of AD metadata, so cache
  `(expression, tab.getId(), field == null ? "" : field.getId())` →
  `{ jsExpr, sessionAttrs }` in a `ConcurrentHashMap` and reuse it. Wrap the construction at
  `util/NeoDisplayLogicHelper.java:150–155`.
- **Where:** `com.etendoerp.go` — `src/com/etendoerp/go/schemaforge/util/NeoDisplayLogicHelper.java`.
- **How measured:** the `parserMs` accumulator added in P0.1 should collapse to ~0 after the
  first request per tab.
- **What can break:** **invalidation.** An AD change (edited `displayLogic`, edited
  `readOnlyLogic`) would be served stale until the cache is cleared. Mitigate by keying the
  cache on the AD record's `updated` timestamp, or by mirroring core's own policy
  (`ApplicationDictionaryCachedStructures.java:513–544`: don't cache when modules are in
  development, and expose a `flush`). Mirroring core's policy is the safer choice — it makes
  the behavior predictable for anyone who already understands ADCS. Also bound the map size;
  keys are per-field, so it is O(fields in all specs) ≈ low thousands, which is fine, but an
  unbounded map keyed partly on a free-text expression deserves a cap.

#### P2.2 — Let the caller narrow `evaluate-display` to the fields it actually consumes

- **What:** accept an optional `fields: [...]` array in the request body alongside
  `fieldValues`, and evaluate only those. Then have `DetailView.jsx:1394` (the lines call) pass
  `trustedDimensionKeys` — the only keys it reads (`DetailView.jsx:1433–1438`). 55 expressions
  → ~4.
- **Where:** `com.etendoerp.go` — `util/NeoDisplayLogicHelper.java:98–121` (parse the new key,
  filter the loop); `schema_forge` — `tools/app-shell/src/hooks/useDisplayLogic.js` (accept and
  forward the option), `tools/app-shell/src/components/contract-ui/DetailView.jsx` (pass it for
  the lines call only).
- **How measured:** expression count in the P0.1 log line; end-to-end
  `lines/evaluate-display` duration.
- **What can break:** the header call must **not** be narrowed — `EntityForm` consumes the full
  `readOnly` map (`components/contract-ui/EntityForm.jsx:1331`) and the visibility map
  (`:653–660`). Narrowing that one would silently unlock fields. Keep the parameter optional
  and absent-means-all, so existing callers (and MCP/batch) are unaffected. Regression tests
  exist for both sides — `hooks/__tests__/useDisplayLogic.vitest.jsx`,
  `components/contract-ui/__tests__/DetailView.lineHiddenColumns.vitest.jsx`,
  `DetailView.principalDisplayLogic.vitest.jsx` — extend, don't replace them.

#### P2.3 — Memoize `SelectorDescriptorResolver.resolveTarget`

- **What:** cache `(columnId, baseRefId)` → `SelectorMeta` (including the negative result) in a
  `ConcurrentHashMap`. This is metadata-derived and immutable at runtime; it removes both the
  repeated `OBCriteria<ReferencedTable>` query (`:405–412`) and the WARN storm at its source,
  making P1.3 cosmetic rather than load-bearing.
- **Where:** `com.etendoerp.go` — `src/com/etendoerp/go/schemaforge/selector/meta/SelectorDescriptorResolver.java`.
- **How measured:** WARN count per flow; `ad_ref_table.seq_scan` delta across a flow
  (`pg_stat_user_tables`); callout-endpoint duration from P0.1.
- **What can break:** same invalidation concern as P2.1, same mitigation. `SelectorMeta` must be
  immutable/thread-safe to be shared — verify before caching it (it looks like a value object,
  but I did not read it end to end).

#### P2.4 — Let the UI opt out of the server-side callout cascade it already ran

- **What:** add an explicit, opt-in request flag (e.g. `"calloutsAlreadyApplied": true`, or a
  header) that makes `executePostCreate` skip `executePostCalloutCascade`
  (`NeoCrudHandler.java:814`). The React form sets it after its interactive callouts have run;
  `/batch`, MCP, OCR and every other non-UI caller do not, and keep today's behavior verbatim.
- **Where:** `com.etendoerp.go` — `NeoCrudHandler.java:779–860`; `schema_forge` —
  `tools/app-shell/src/hooks/useEntity.js` (create payload builder, around
  `buildCreatePayload`, `hooks/useEntity.js:749`).
- **How measured:** `[NEO-PERF] executePostCreate … calloutCascade=` should go to ~0 for UI
  creates and stay unchanged for `/batch`.
- **What can break:** **this is the highest-risk item in the plan and should go last.** The
  cascade is currently the safety net that guarantees derived fields are correct no matter which
  client wrote the record; the comments at `NeoDefaultsCascadeHelper.java:73–86` and
  `NeoCrudHandler.java:866–874` document real bugs it fixed (ETP-4784, ETP-4855). If the UI's
  client-side dispatch misses even one callout the server would no longer cover for it, and the
  failure is silent and data-corrupting, not a visible error. Prerequisites before shipping:
  (a) a test that asserts the UI's interactive callout set equals the server's
  `collectFieldsWithCallouts` set for the windows in scope, and (b) default-off, enabled
  per-window. If that equivalence cannot be established, **prefer the weaker version below.**
- **Weaker, safer variant (recommended first):** keep the cascade but make it idempotent-cheap
  — skip firing a field's callout when the field is in `protectedCalloutFields` **and** its
  value is unchanged from the submitted body, since the result is discarded anyway. Same file,
  a filter inside `collectFieldsWithCallouts` (`NeoDefaultsCascadeHelper.java:308–322`). This
  keeps the net in place for non-UI callers while removing most of the duplicated work for UI
  creates. **I have not verified that every protected field's callout output is fully
  discarded** — some callouts may have side effects beyond the returned columns. Confirm before
  implementing.

#### P2.5 — Cache the per-request eval context in `evaluate-display`

- **What:** `buildEvalContext` (`util/NeoDisplayLogicHelper.java:265–294`) resolves
  client/org-scoped accounting-dimension flags per request, including a live
  `AcctSchemaElement` criteria query (`:360–370`). Cache the
  `resolveAccountingDimensionFlags(client, obCtx)` result per `(clientId, orgId)`.
- **Where:** `com.etendoerp.go` — `util/NeoDisplayLogicHelper.java`.
- **How measured:** P0.1 timings; `c_acctschema_element` scan counts.
- **What can break:** a GL-configuration change would need a restart or a flush. Bound the
  cache with a short TTL rather than making it permanent — configuration changes here are rare
  but not never, and a 60-second TTL removes the per-request cost while keeping the blast
  radius to one minute.

#### P2.6 — Abort in-flight `evaluate-display` requests on the client

- **What:** add an `AbortController` to `hooks/useDisplayLogic.js` so a new evaluation cancels
  the previous one instead of letting a burst of N requests all complete. Note `apiFetch`
  accepts `fetch` options, so a `signal` passes through.
- **Where:** `schema_forge` — `tools/app-shell/src/hooks/useDisplayLogic.js:90–129`.
- **How measured:** `/sws/` request count for the flow.
- **What can break:** an aborted fetch rejects; the existing `catch {}` at `:115–117` already
  swallows it, but confirm the abort does not clear `displayState` and reintroduce the flicker
  that the `lastKnownCache` seed (`:12–45`) exists to prevent.

#### P2.7 — Reconcile `db.pool.maxActive` with `max_connections`

- **What:** `config/Openbravo.properties:103` has `db.pool.maxActive=10000`;
  Postgres `max_connections = 100`. Set the pool to something under the server limit (e.g. 50).
- **Where:** `config/Openbravo.properties` (Etendo root).
- **How measured:** not a latency metric — this is a correctness/robustness fix. Watch
  `select numbackends from pg_stat_database` under load.
- **What can break:** a pool that is too small queues requests instead of erroring. 50 is ample
  for a local instance with 4 CPUs.

---

## How to measure (reproducible, no Playwright)

The goal is a repeatable A/B for one flow. Two layers.

### Layer 1 — the server's own timings (primary signal)

The instance already logs what matters, and P0.1 extends it. After any change:

```bash
# 1. Mark a clean baseline window.
date -u +%FT%TZ                      # note the timestamp

# 2. Run the flow (UI, curl script, or MCP — see Layer 2).

# 3. Pull the server-side numbers for that window only.
docker logs etendo-tomcat-1 --since 10m 2>&1 \
  | grep '\[NEO-PERF\]' \
  | tee /tmp/neo-perf-after.txt

# 4. Reduce to medians per phase (works on the executePostCreate lines as-is).
grep executePostCreate /tmp/neo-perf-after.txt \
  | grep 'entity=Order' \
  | sed -E 's/.*injectDefaults=([0-9]+)ms calloutCascade=([0-9]+)ms.*jsonService.add=([0-9]+)ms total=([0-9]+)ms/\1 \2 \3 \4/' \
  | awk '{d[NR]=$1; c[NR]=$2; j[NR]=$3; t[NR]=$4}
         END {n=NR; if(!n){print "no samples"; exit}
              asort(d); asort(c); asort(j); asort(t);
              m=int((n+1)/2);
              printf "n=%d  median: injectDefaults=%d calloutCascade=%d add=%d total=%d\n",
                     n, d[m], c[m], j[m], t[m]}'
```

Report **median and max over n ≥ 5 runs**, never a single sample — F4 shows the same operation
spanning 1.5 s to 13.1 s, so one number is meaningless. Keep the before/after files.

### Layer 2 — end-to-end latency without a browser

Get a NEO bearer token once, then curl the endpoints directly. This isolates server time from
React render time and from Vite's dev proxy:

```bash
# Token (SecureWebServices login; same auth NEO uses).
TOKEN=$(curl -s -X POST http://localhost:8080/etendo/sws/login \
          -H 'Content-Type: application/json' \
          -d '{"username":"<user>","password":"<pass>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

BASE=http://localhost:8080/etendo/sws/neo/purchase-order

# Time one endpoint, 10 samples, report each.
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{time_total}\n' \
    -X POST "$BASE/header/evaluate-display" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -H 'Accept-Language: es_ES' \
    -d '{"fieldValues":{"id":"<an existing order id>"}}'
done | sort -n | awk '{a[NR]=$1} END {print "min",a[1],"median",a[int((NR+1)/2)],"max",a[NR]}'
```

Do the same for `GET $BASE/header/defaults` and `GET $BASE/header/new`. Hit **Tomcat on :8080
directly**, not `localhost:3100` — the Vite dev proxy adds its own latency and obscures what
changed. Discard the first sample of each batch (JIT warm-up).

For the *flow* rather than a single endpoint, count requests and total time from the browser's
own Network panel export, or keep a small curl script that replays the create sequence. Either
way, the metric to report is: **requests to `/sws/` per flow**, and **median/max per endpoint**.

### Layer 3 — corroborating counters

Snapshot before and after a flow to attribute work to the metadata N+1:

```sql
-- reset, run the flow, then read
select pg_stat_reset();
select relname, seq_scan, seq_tup_read, idx_scan
  from pg_stat_user_tables
 where relname in ('ad_column','ad_field','ad_tab','ad_ref_table','ad_role_orgaccess','ad_language')
 order by seq_tup_read desc;
```

And the log volume, which is a decent proxy for the WARN storm:
`docker logs etendo-tomcat-1 --since 5m | wc -l`.

---

## What NOT to do

- **Do not tune Postgres.** Measured: 0.5 ms/query round trip, 99.75 % buffer hit ratio, DB
  container at 434 MiB of 2 GiB. Raising `shared_buffers` or `work_mem` addresses nothing here.
  The workload is hundreds of thousands of tiny, index-or-100-row-seq-scan metadata reads; the
  fix is to stop issuing them (P2.1–P2.3), not to make each one faster. Postgres statistics
  were already ruled out (745/751 tables analyzed).
- **Do not chase the jsreport `unhealthy` status as a latency cause.** Its own log shows
  renders completing in 759–1288 ms. The healthcheck is wrong. Worth fixing for hygiene; not
  part of this plan.
- **Do not chase `hs_err_pid71071.log`.** Feb 2025, from a Gradle test run with a debugger.
  Already correctly dismissed.
- **Do not add missing DB indexes for the AD tables in F2.** They are 100–15 000 rows;
  a seq scan of `ad_role_orgaccess` (103 rows) is not the problem — being called 252 019 times
  is. An index would hide the symptom and make the N+1 harder to spot later.
- **Do not "optimize" `NeoDisplayLogicHandler.java`.** It is dead code; `NeoServlet.java:63–68`
  documents that `evaluate-display` routes through `NeoDisplayLogicHelper` instead, and that
  `NeoDisplayLogicHandler` is retained pending a cleanup decision. Any change there has zero
  runtime effect. (Its existence is itself a small trap: it is the file grep finds first.)
- **Do not remove the server-side callout cascade outright.** It is the correctness net for
  `/batch`, MCP, OCR and any external agent that has no client-side callout dispatch, and it
  exists because of specific past bugs (ETP-4784, ETP-4855). Make it *skippable by callers who
  provably don't need it* (P2.4), default-on, and prefer the weaker idempotence variant until
  the client/server callout-set equivalence is actually tested.
- **Do not ship `isindevelopment='N'`.** P1.2 is a temporary local toggle for benchmarking. The
  durable fix is to make the hot paths cheap enough that ADCS caching is an optimization, not a
  requirement — otherwise every developer with a module in development gets a 10-second form.
- **Do not add a naive script cache keyed on the full script string in `OBScriptEngine`.** The
  preamble inlines the current field values (`util/NeoDisplayLogicHelper.java:176–180`), so
  every request produces a unique key: 0 % hit rate and an unbounded memory leak. Cache the
  *parsed expression* (P2.1), and if the compiled script is also worth caching, first change
  the script so the values arrive through bindings rather than being inlined.

---

## Explicitly unverified

Stated plainly so nobody treats these as measured:

- **No per-endpoint server timing exists for `evaluate-display`, `defaults`, `selectors` or
  `callout`.** Every number quoted for those endpoints is the **client-observed** duration from
  the Playwright trace, which on a 1-CPU container includes an unknown amount of queueing. The
  split between real work and queueing is unknown until P0.1 lands. This is why P0 is Phase 0.
- **The size of the F2 (AD cache) contribution is not measured.** The mechanism is verified in
  code and the flag state is verified in the DB and at runtime; the seconds attributable to it
  are not.
- **GC pauses are inferred, not observed.** The 100× variance on identical operations
  (`injectDefaults` 121 ms vs 11 781 ms) plus SerialGC on a 768 MB heap is a strong signature,
  but I did not enable GC logging. Adding `-Xlog:gc*:file=...` alongside P1.1 would settle it
  in one run, and is worth doing while the JVM flags are being changed anyway.
- **Whether protected fields' callout output is fully discarded** (the premise of the safer
  P2.4 variant) was not traced through `mergeCalloutUpdates` /
  `mergeCalloutCombos`. Confirm before implementing.
- **Whether the near-simultaneous duplicate `Order` creates in the log** (e.g. 17:29:57.886 and
  17:29:58.158; three within 6 s at 17:41:41–17:41:47) are repeated test runs or a genuine
  double-submit. If it is a double-submit, that is a separate and possibly larger bug than
  anything in this plan. Worth 10 minutes with a single deliberate create and a clean log.
