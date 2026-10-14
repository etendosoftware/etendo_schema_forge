# ETP-5676 — Generic import throughput (FK reuse + multi-row batches)

Status: **DRAFT v1** — iterating. Related: ETP-5677 (`etendo_batch` commits but the response is
lost on long batches). Owner: Platform (generic import engine, not window-specific).

## 1. Problem, as measured

| Source | Fact |
|---|---|
| Code | Preview resolves FKs once per distinct value; send re-resolves them **per row** (UoM, country) via `simSearchEveryLanguage` (2–3 GETs/row). `fkResolutions` never reaches `operationsConfig` (`ImportDialog.jsx:233-240`, `:590-591`). |
| Code | One `POST /sws/neo/batch` **per row**, concurrency 4 (`importEngine.js:289`, `:311-319`). |
| Datadog (RUM, 2026-10-07) | 370-row and 185-row product imports: p50 ≈ 2.1 s, p95 ≈ 2.7 s per batch POST, ≈ 2 rows/s → 1,000 rows ≈ 9 min. TTFB ≈ duration: time is server-side. |
| Datadog (`[NEO-PERF] executePostCreate entity=Product`) | Per row: `injectDefaults` 0.5–0.6 s idle, **up to 3–4.5 s under load**; `jsonService.add` only 0.1–0.27 s. |
| Datadog | Per-row simsearch only when the file has a UoM column (one run: 2.1 calls/row, p50 1.6 s client-side, ~134 ms server-side → queueing). The user's workaround was to drop the UoM column. |
| ETP-5677 | ~1.8 s/row server-side; a 50-row (100 ops) `etendo_batch` takes ~90 s, the connection is cut while idle, client sees a timeout although the server committed. |

**Conclusion:** the dominant cost is per-op server work (`injectDefaults`), not HTTP round-trips.
Batching rows alone cuts requests but not time, and long batches hit the ETP-5677 idle cut.

## 2. Row independence — products vs contacts

| Aspect | Product | Contacts |
|---|---|---|
| Ops per row | `product` + `salesPrice`/`purchasePrice`/`cost` (`parentRef:'product'`) | `bp` + `location` + `contact` (`parentRef:'bp'`) |
| Key | `searchKey` from the file (required) | `searchKey` = name-derived placeholder; final `Value` from the **transactional sequence** `EM_Etgo_Identifier`, rewritten in `afterHandle` |
| Sequence lock | none | `SELECT … FOR UPDATE` on one `AD_Sequence` row per org, held **until commit** |
| In-file dedupe | `dedupeRows` on `searchKey` | `dedupeRows` on `taxID` (same name + different taxID passes) |
| Out-of-batch side effects | category find-or-create POST | category find-or-create POST |
| Goes through `injectDefaults` | yes | `bp` and `contact` yes; `location` no (handler short-circuits) |

**Is the sequence correct? Yes.** The identifier is taken and incremented *inside* the insert
(`TransactionalSequenceUtils.getNextValueFromSequence` → `lockSequence` = `refresh(seq, UPGRADE)`,
i.e. `SELECT … FOR UPDATE` + rehydrate, then `nextAssignedNumber += incrementBy`). Concurrent
transactions wait on the lock and read the fresh value; a rollback also rolls back the increment
(no gaps). Within one batch, ops run in order and each op flushes before the next, so N rows in one
batch also get distinct numbers. **Correctness is not the issue; throughput is:**
- The lock is held **until commit**. Per-row transactions today already queue on it (the row's
  `location` + `contact` ops and `contact`'s `injectDefaults` run while holding it).
- With N rows per chunk the lock is held for the whole chunk → parallel contact chunks run one
  after another.
- Guardrail: never let several BP inserts share one flush (same number to every partner —
  `OnboardingSampleDataService.java:126-135`). Any batching change must keep per-op flush.
- Side issue: a duplicate identifier silently keeps the placeholder `Value` (the name) → a later
  same-name row may collide → classified `DUPLICATE` and silently skipped.

## 3. Plan

### Phase A — Stop redundant FK work (frontend, low risk) — ✅ agreed, ships first, own PR
1. Carry `fkResolutions` (incl. popover picks with their `resolvedId`) into `operationsConfig`;
   resolvers use the resolved id and only hit the network for values missing from the map.
2. Generic per-run memo in `fkResolvers.js` / `registerFkResolver`: `Map<key, Promise>`, pending
   promise shared by concurrent workers, rejected promises evicted. Key:
   `entity | normalizeText(value) | languages | qtyResults | minSimPercent | client/org`.
3. Category cache: normalize the cache key (`normalizeText`) and reset all per-run caches
   (`resolutionCaches`, `productCategoriesCache`, `businessPartnerCategoriesCache`,
   `productDefaultsCache`, `salesPlvCache`) when a new file is loaded.
4. Fix the stale comment in `productImportDescriptor.js:109-113` (batch ops DO go through the
   product handler since ETP-5415).

Acceptance: 500 product rows sharing one UoM → 0 simsearch calls at send; same for contacts/country;
tests assert call counts.

**Phase A — implementation outline (two repos)**

| # | Repo | File | Change |
|---|---|---|---|
| A1 | core | `components/import/ImportDialog.jsx` (`:233-240`, `:460-486`, `:590-591`) | Add `fkResolutions` to `operationsConfig`; popover picks (`handleApplyFkValue`) store `{status:'auto-resolved', id, name}` so the pick survives to send. |
| A2 | core | `lib/import/fkResolvers.js` | `registerFkResolver` wraps each resolver: (1) look up `fkResolutions[target][rawValue]` → return its id without network; (2) otherwise per-run memo `Map<key, Promise>` (pending promise shared, rejected evicted). Export `resetFkResolverMemo()`. |
| A3 | core | `lib/import/resolveDependentEntity.js` (`:90`) | Cache key via `normalizeText(code)` / `normalizeText(name)`. |
| A4 | core | `ImportDialog.jsx` (file select `:420`) | On new file: `resetFkResolverMemo()` + `clearResolutionCache()`; expose a generic "run reset" hook descriptors can register their caches with (no window names in core). |
| A5 | functional | `windows/custom/product/productImportDescriptor.js` | `resolveUom` / category / defaults / PLV caches register with the run-reset hook; fix stale comment `:109-113`. |
| A6 | functional | `windows/custom/contacts/contactsImportDescriptor.js` | `resolveLocation` (country) and BP-category cache: same as A5. |
| A7 | both | tests (reuse-first, `make find-tests`) | Call-count tests: N rows sharing one value → 0 simsearch at send when previewed, ≤ 1 per distinct value when not; popover pick sent by id; "Bebidas"/"BEBIDAS" concurrent → 1 category create; new file → caches reset. |

Delivery: core change → publish `app-shell-core` + bump in functional (`docs/repo-topology.md`).
Tests by `tester-functional` (core + functional); repro test by the developer.

### Phase B — Cut per-op server cost (`injectDefaults`) (backend, highest gain)

**Analysis (code reading, 2026-10-08 — not yet measured):** the time is not in defaults that apply,
but in two metadata lookups run for **every column missing from the body**, whose result never
changes between rows (`NeoDefaultsService.resolveFieldDefault`, `:736-798`):
- `isSequenceField` → `SequenceUtils.isSequence` → `OBCriteria<SequenceConfig>.uniqueResult()`
  per column (`NeoDefaultsService.java:759`, `:1155-1165`) — ~105 queries per Product op.
- Columns with no default and not `_ID` → `NeoDefaultsSqlHelper.resolveDbColumnDefault`
  (`:291-323`): `SELECT column_default FROM information_schema.columns WHERE LOWER(..)=LOWER(?)`
  — no index, privilege-checked catalog scan, ~60–70 per Product op.
- Plus: the batch path clears the Hibernate session after every op
  (`NeoBatchJsonDataService.java:293`) → AD graph reloaded per op; `SFField` query run twice per op
  (`buildSfFieldDefaultsMap` + `NeoFieldFilter.forEntity`); selector query per missing mandatory
  combo; `tryInjectIdentifier` `OBDal.get`s whose `$_identifier` is dropped on create anyway.
- Degrades under load from DB CPU + round trips (~200 small/catalog queries per op), not locks.
- Callout cascade: real but minor; outputs discarded when the body is complete.

| Table | candidate cols | → `information_schema` | mandatory combos |
|---|---|---|---|
| M_Product | 121 | 74 | 6 |
| C_BPartner | 107 | 56 | 4 |
| AD_User | 41 | 20 | 2 |
| M_Costing | 20 | 9 | 4 |
| M_ProductPrice | 10 | 4 | 4 |

**Why classic does not pay this (code reading, 2026-10-08):**
- Classic computes defaults **once per form open** (`FormInitializationComponent` NEW mode), only for
  the **tab's fields**, from detached metadata cached in `ApplicationDictionaryCachedStructures`.
- Classic **save** (`JsonToDataConverter` → `DefaultJsonDataService.add`) computes no defaults: it
  only sets keys present in the JSON; sequences are filled at insert from `Property.isSequence()` /
  `isUsedSequence()`, precomputed at model load (`DefaultTransactionalSequence`,
  `DocumentNoHandlerLegacy` regenerate null or `"<…>"` values).
- Classic **never reads `information_schema`**; Hibernate writes explicit NULLs (no dynamic-insert),
  so DB defaults never apply on DAL inserts.
- NEO re-runs the FIC's work **per row, for every table column**, with session-bound AD objects that
  `session.clear()` (kept: ETP-4793, same as classic `add`) forces to reload.

**Revised Phase B — avoid first, cache only what remains (supersedes items 1–2 below):**

| # | Change | Risk | Guards |
|---|---|---|---|
| B1 | `isSequenceField`: use `Property.isSequence()`/`isUsedSequence()` + DocumentNo/Value name test instead of `SequenceUtils.isSequence` (removes ~105 queries/op) | very low | ETP-4083 |
| B2 | DB-default lookup: restrict to mandatory, non-boolean, non-numeric columns, or remove (added by ETP-3660 for mandatory booleans, now covered by `injectSafeTypeDefault` ETP-3591). Also fixes a divergence: `IsProspect` DB default `Y` vs classic `N` | low–medium | ETP-3660 |
| B3 | Skip non-mandatory columns with no default expression and no `ETGO_SF_FIELD` override before `resolveFieldDefault` | low | ETP-4274 |
| B4 | Skip the sequence preview on create (save handlers fill null/`"<…>"`); keep callout protection for sequence fields (`seqFields`, `NeoCrudHandler.java:942`); verify Value + `IsUsedSequence` on one M_Product create | medium | ETP-4083, DocumentNo overwritten by callouts |
| B5 | Skip `tryInjectIdentifier` on create (`$_identifier` ignored by `JsonToDataConverter`) | low, small gain | — |
| B6 | Cache: tab/columns via `ApplicationDictionaryCachedStructures` / ModelProvider (session-free) so `session.clear()` stops forcing reloads; `sfFieldDefaults` per entity | low | — |

Then re-measure (`[NEO-PERF]` sub-timers) before items 3–4 below.

**Original proposals (kept for reference; 1–2 superseded by B1–B2):**
1. Process-wide cache of DB column defaults per table (one query per table, `pg_attrdef`),
   cleared with `NeoCalloutService.clearMetadataCache` — `NeoDefaultsSqlHelper.java:291`. XS/very low risk.
2. Process-wide cache of `isSequence` per column id — `NeoDefaultsService.java:1155`. XS/low risk.
3. Per-tab immutable "default plan" (column descriptors) so the per-row loop does not touch
   Hibernate AD objects — `NeoMandatoryDefaultsService.java:231-315`. S–M.
4. `BatchScope` `ThreadLocal` next to `CALLER_OWNS_TRANSACTION` (`BatchService.java:129/344/372`):
   memoize spec/entity ids, `SFField` list, `vars`, first-combo results, identifiers,
   context-only and `@SQL=` defaults keyed by bound params. M.
5. Skip `tryInjectIdentifier` on the create path (check `propagateIdentifier` first). S.
6. (Contacts) move the synchronous VIES call (`ContactsLocationAddressHandler.java:840`, up to
   5+5 s) out of the sequence-locked span — handler change. S.
7. (Contacts) deferred identifier: insert BP with a non-`<` placeholder (generator returns early,
   no lock — `DefaultTransactionalSequence.java:40`), allocate the number in a generic
   before-commit hook registered by `BusinessPartnerHandler`. M/medium risk (response patched
   after commit).
8. Callout skip when all outputs are protected (learned per batch); `[NEO-CALLOUT]` info → debug.

Order: confirm with prod `pg_stat_statements` / `EXPLAIN ANALYZE` that the `information_schema` and
`SequenceConfig` queries rank top → 1+2 → 3+4 → 6 → 7.

**Local measurement (2026-10-08, local-env ETP-5670 DB, single user, no load):**

| Query | One call | ×N per Product op |
|---|---|---|
| `information_schema.columns` + `LOWER()` (current) | plan 4.8 ms + exec 1.15 ms | ×70: **~105 ms** re-planned, ~40 ms with cached plan |
| `pg_attribute`/`pg_attrdef` by `to_regclass` (rewrite) | plan 0.66 ms + exec 0.27 ms | ×70: **~9 ms** re-planned, ~1 ms cached |
| Whole-table defaults (`pg_catalog`, for a per-table cache) | 8.7 ms once | once per table per JVM |
| `ad_sequence_config WHERE ad_reference_id=?` (DB side) | 0.006 ms | ×105: 0.2 ms DB; the cost is the 105 Hibernate round trips |

M_Product: 125 active non-key columns, 78 without AD default and not `_ID`, only **32 distinct
references** (so `isSequence` has ≤ 32 distinct answers per table).

Conclusions:
- **No index can help**: `information_schema.columns` is a view; the fix is the query (catalog
  + `to_regclass`, no `LOWER`) and/or a per-table cache. Do both: cache per table, loaded with the
  catalog query (~10× faster even uncached).
- **`SequenceConfig` is not slow in the DB**; it is round-trip count. Cache per `reference_id`
  (process-wide, cleared with the AD metadata caches). No index needed.
- These two explain **~0.1–0.2 s of the ~0.5 s idle** per Product op, not all of it. Before
  committing to items 3–4, measure the rest in Java: add sub-timers to `[NEO-PERF]` (per
  resolver: sequence check, db default, combo/selector, identifier, parent loader, SFField) or
  profile one 50-row batch in a local-env Tomcat.

Earlier notes:
- Per-op rebuilds that are identical across rows: `VariablesSecureApp`, `DalConnectionProvider`,
  window id, `buildSfFieldDefaultsMap` (OBCriteria over `ETGO_SF_FIELD`), `findSpec`/`findEntity`.
- Loop over **every** active `AD_Column` of the table, resolving defaults (`Utility.getDefault`,
  `@SQL=`, preferences, combo first option) for each column missing from the body.
- Option: a per-batch defaults context in `BatchService` (computed once per spec/entity, reused by
  every op of the same entity), keeping body-dependent work per op.
- Measure with the existing `[NEO-PERF]` log before/after; target ≤ 200 ms/op.
- **Contacts sequence lock (to analyze):** shorten the time the `AD_Sequence` lock is held.
  Options, cheapest first:
  1. Make the work done *after* the BP insert cheaper (contact `injectDefaults`, location handler),
     since the lock covers it until commit.
  2. Keep contact concurrency at 1–2 (more workers only queue on the lock).
  3. Reserve the identifier as late as possible in the transaction (only if the generator allows it).
  4. Reserve a block of numbers in a short separate transaction — changes semantics (gaps on
     rollback); last resort, needs product sign-off.

### Phase C — Multi-row chunks (frontend + engine) — ⏸ to analyze after A/B are measured
Why it may matter less than expected: if B brings a row to ~0.2–0.3 s, the HTTP overhead per row
becomes the relevant part and chunking pays off; if B does not, chunking only trades 1,000 short
requests for fewer long ones (same total time, bigger blast radius on failure, closer to the
ETP-5677 cut). Decide with numbers after B.
- Per-row op ids (`r12_product`, `r12_salesPrice`) and rewritten `parentRef`.
- Chunk size bounded by **estimated time**, not just rows, so a chunk stays well under the idle
  cut from ETP-5677 (e.g. target ≤ 20–30 s per request). Configurable in
  `decisions.json → window.import` with a sane default.
- Per-row result mapping from the batch response (`failedAt` index/id, per-op results) instead of
  `operations[0]` / first failing message.
- Failure handling: on chunk failure, bisect (or fall back to per-row) to isolate failing rows and
  still commit the good ones. Alternatively a backend non-atomic / savepoint-per-row mode.
- Contacts: chunks serialize on the sequence lock → expect gains from fewer round-trips only;
  keep concurrency low for contacts.

### Phase D — Shared with ETP-5677 (backend/infra) — diagnosis being refined
Constraint: **keep the current synchronous contract**; the async job pattern (`jobId` + polling)
is deferred to a later improvement.
**Diagnosis (Datadog, 2026-10-07):** the cut is **CloudFront** (origin response timeout ≈ 60 s
with no bytes from the origin), not the ALB.
- Batch 1: server `Slow Etendo GO request: POST /etendo/sws/mcp took 91132 ms` (start ≈ 22:24:52);
  ALB logs `POST sws/mcp 460` at 22:25:51.959 → 59.8 s after start. 460 = the ALB's client
  (CloudFront) closed first; an ALB idle timeout would log 504 (none in 14 days).
- Batch 2: `took 91571 ms`, no ALB line at all (unexplained: dropped/sampled log line?).
- 25-product batches took 24–45 s and answered; only the two ~91 s calls failed.
- Retry evidence: 22:26:46 a new batch failed on `m_product_value` (op `p0002`) — the agent
  retried batch 1; safe only because of that unique key.
- Root cause in code: `McpServlet` is stateless request/response, writes the response once at the
  end (`McpServlet.java:173`, `:222`); `BatchService.executeBatch` commits before any byte is
  written (`BatchService.java:329-375`); no progress/keep-alive, no `maxItems`, no time budget,
  no idempotency key.
- **Same ceiling applies to the SPA's `/sws/neo/batch`** if it goes through the same CloudFront
  distribution → Phase C chunks must stay well under 60 s.

**Fixes that keep the synchronous contract (ranked):**
1. **SSE response for `tools/call` with heartbeats from the per-op loop** (M, low–medium risk).
   When `Accept` includes `text/event-stream`, answer as SSE; from the existing
   `BatchService.OperationPreprocessor` hook, every ~15–20 s write+flush a
   `notifications/progress` (if `_meta.progressToken`) or a `: keep-alive` comment; final
   JSON-RPC response as the last event. Plain JSON for clients that don't accept SSE. Stays on
   the request thread (no async/DAL issues). Check no gzip buffering on `text/event-stream`.
2. **Raise CloudFront origin response timeout on `/mcp`** (XS infra; > 60 s needs a quota
   increase, max 180 s). Stopgap only.
3. **Server-side cap**: `maxItems` on `operations` (`ToolRegistry.java:1012-1042`) + refusal in
   `handleBatch` with the pre-flight envelope and a "split the batch" hint (S, low risk).
4. **Idempotency key** (`batchId`) replaying the stored outcome (M, medium risk). Cheaper partial:
   the duplicate-key hint tells the agent to verify with `etendo_list` before retrying.
5. Faster ops (Phase B) widens the margin under any timeout.

**Next step for ETP-5677 (after the fixes above): server-side job with progress check.**
Added *next to* `etendo_batch`, not replacing it:
1. Client submits the rows/ops → server answers immediately with a `jobId` (no request ever
   approaches the 60 s cut).
2. A background worker processes in chunks (commit per chunk/row) and stores progress
   (processed / ok / failed) and per-row results.
3. Client polls: MCP tool (e.g. `etendo_job_status`), SPA progress bar.
4. A dropped connection loses nothing — the client re-checks the job; no duplicate retries.
Open design points: job table + worker with its own `OBContext` (the filter chain has no async),
retention, cancellation, orphaned jobs on Tomcat restart, access (only the creator reads it),
reuse of existing background infra (vector outbox ETP-5664, onboarding import, bank-statement
importer — not yet checked). Does not reduce per-row cost: Phase B still applies.
If built, it can later host the SPA import too and make Phase C unnecessary.

## 4. Open questions
1. ~~Should Phase A ship alone first?~~ Yes (2026-10-08).
2. Phase C: go / no-go after measuring B. If go, failure policy: client-side bisection vs.
   backend non-atomic mode?
3. ETP-5677 stays its own ticket; Phase C depends on its fix if chunks can exceed the idle cut.
4. Contacts sequence lock: which option in Phase B?
5. Observability: enable `dd-java-agent` (APM) on Tomcat to measure Phase B per op and per SQL?

## 5. Out of scope (separate tickets)
- Bulk `DELETE /sws/neo/product/product/{id}` at 11–29 s each (Datadog, 2026-10-07 16:48–16:54).
- `VectorSearchService` embedding without cache.

## Appendix — Contacts identifier sequence: correctness validation (2026-10-08)

**Verdict:** correct on the import path. 4 concurrent per-row transactions serialize on
`SELECT … FOR UPDATE` + refresh (`TransactionalSequenceUtils.lockSequence:94-100`), no gaps on
rollback; several BPs in one `/batch` get distinct numbers because each op flushes
(`NeoBatchJsonDataService.persistWithoutCommitting:279-293`). Prod (Datadog, since ~2026-09-29):
0 duplicate-key errors on `c_bpartner`, 0 sequence/mask errors, no deadlocks on `ad_sequence`.

Facts: `EM_ETGO_IDENTIFIER` has no unique constraint/index; `C_BPARTNER_VALUE` is unique on
(VALUE, AD_ORG_ID, AD_CLIENT_ID). Sequence chosen by client + org (walks up the org tree to `*`);
onboarding creates one per org starting at 1000000.

Edge cases found — **out of scope for ETP-5676, ignored for now (decision 2026-10-08)**:
- **E1** several BPs saved then flushed once → same number (does not affect `/batch`).
- **E2** overlapping sequences in one client (org + `*`, sibling orgs all from 1000000) →
  duplicate identifiers across orgs, uncaught; within an org → silent placeholder.
  Prod: 1 `searchKey race … duplicate identifier 1000000` on 2026-10-01 (bp `AD880236…`).
- **E3** org with no reachable sequence → contacts create fails HTTP 500 "No Sequence found".
  Prod: 10 hits, 2 tenants (`8C52BD97…` 2026-10-07 ×9, `4F998C7B…` 2026-10-02 ×1).
- **E4** legacy numeric `value` equal to a future number → silent placeholder.
- **E5** `deriveSearchKey` intends idempotent re-imports, but `value` is always overwritten by the
  identifier → re-import dedupe relies on `taxID` only.
- Test gaps: multi-BP single flush, several BP ops in one real `/batch`, parallel `/batch` e2e,
  overlapping sequences, missing-sequence path through NEO.

SQL checks (`:c` = ad_client_id, `:t0` = import start):

```sql
-- 1. Duplicate identifiers per client
SELECT em_etgo_identifier, count(*), string_agg(ad_org_id||':'||c_bpartner_id||':'||value, ', ')
FROM c_bpartner WHERE ad_client_id=:c AND em_etgo_identifier IS NOT NULL
GROUP BY em_etgo_identifier HAVING count(*)>1;

-- 2. Placeholder kept / value not synced
SELECT c_bpartner_id, ad_org_id, name, value, em_etgo_identifier, created
FROM c_bpartner WHERE ad_client_id=:c AND created>=:t0
  AND value IS DISTINCT FROM em_etgo_identifier ORDER BY created;

-- 3. Sequence health: currentnext vs used numbers, gaps
SELECT s.ad_sequence_id, s.ad_org_id, s.currentnext, s.incrementno,
       x.cnt, x.distinct_n, x.min_n, x.max_n,
       (x.max_n - x.min_n)/NULLIF(s.incrementno,0) + 1 - x.distinct_n AS gaps,
       s.currentnext - (x.max_n + s.incrementno) AS next_minus_expected   -- expect 0
FROM ad_sequence s
LEFT JOIN LATERAL (
  SELECT count(*) cnt, count(DISTINCT n) distinct_n, min(n) min_n, max(n) max_n
  FROM (SELECT CAST(substring(b.em_etgo_identifier FROM '([0-9]+)') AS bigint) n
        FROM c_bpartner b WHERE b.ad_client_id=s.ad_client_id AND b.ad_org_id=s.ad_org_id
          AND b.em_etgo_identifier ~ '[0-9]') q) x ON true
WHERE s.ad_client_id=:c AND s.ad_column_id='294937FFC81749289BD9BB28E400D4B2';

-- 4. Reachable identifier sequences per org (0 = E3, >1 = E2 risk)
SELECT o.ad_org_id, o.name,
  (SELECT count(*) FROM ad_sequence s WHERE s.ad_client_id=o.ad_client_id AND s.isactive='Y'
     AND s.ad_column_id='294937FFC81749289BD9BB28E400D4B2'
     AND ad_isorgincluded(o.ad_org_id, s.ad_org_id, o.ad_client_id) <> -1) AS reachable_seqs
FROM ad_org o WHERE o.ad_client_id IN (:c,'0') ORDER BY reachable_seqs;
```

## Phase B — Decision and manual test checklist (2026-10-08)

**Decision (user):** keep the new behaviour **aligned in both places** — the create path
(import / batch / MCP / REST) **and** the `/defaults` endpoint that pre-fills the SPA "New" form.
Defaults follow `AD_Column` / `ETGO_SF_FIELD` like classic; the DB DEFAULT is no longer used to
pre-fill, except for mandatory non-boolean, non-numeric columns. Where this diverges from today,
people test it manually.

**Where today's behaviour changes (from QA):**

| Window (spec) | Field | Today | After |
|---|---|---|---|
| Price list (`price-list`) | Sales price list (`IsSOPriceList`) | checked | **unchecked** |
| GL configuration (`general-ledger-configuration`) | `UseCurrencyBalancing`, `UseSuspenseBalancing`, `UseSuspenseError` | checked | unchecked |
| Assets (`assets`) | `IsOwned`, `IsInPosession` | Y | N (`IsDepreciated` stays Y: SF default) |
| Contacts (`contacts`) | Prospect (`IsProspect`) | Y | N |
| Invoices / orders | `IsDiscountPrinted` (mostly hidden) | Y | N |
| Sales invoice | `EM_Etvfac_Invoice_Status` (`PE`), `ChargeAmt` (0) | pre-filled | empty in form; DB default at save |
| Purchase invoice line (Intrastat) | `Conversion`, `Netmass_Kg` (1) | pre-filled | empty in form; DB default at save |
| Product | `Weight` (0) | pre-filled | empty in form; DB default at save |

**Manual checks (need a running environment):**
1. Contacts: create a contact from the SPA and via import → `C_BPartner.IsProspect='N'`;
   `EM_Etgo_Identifier` still generated and `Value` = identifier.
2. Product: create from the SPA and via import/MCP without `Weight` → stored `0`; search key /
   value sequence preview still works.
3. Sales invoice from the SPA without touching fields → stored `EM_Etvfac_Invoice_Status='PE'`
   and `ChargeAmt=0` (not `''` / NULL). **Key risk:** if the SPA posts `""` for an untouched empty
   field, the DB default does not apply.
4. Purchase invoice line with Intrastat → `Conversion=1`, `Netmass_Kg=1` stored.
5. Price list → New: "Sales price list" unchecked; a sales price list must be ticked explicitly
   to appear in `PriceListPicker` on sales documents. Confirm with the product owner.
6. GL configuration → New: the three balancing flags start unchecked. Confirm with accounting.
7. Asset → New: `IsOwned` / `IsInPosession` N, `IsDepreciated` Y. Confirm the asset flow.
8. Sales order line → `PriceActual` / `PriceList` still resolve (unchanged DB-default path).
9. Performance: `[NEO-PERF] injectDefaults` before/after on a product import and a contact
   import; with `pg_stat_statements` / `log_min_duration_statement=0`, ~105 fewer
   `SequenceConfig` queries and no `information_schema` queries per created product.

If a business default is wanted for any of these (e.g. price list = sales), add it as an
`ETGO_SF_FIELD` default in that window's `decisions.json` (as `assets` already does), never in
shared code.

## Local measurements and multi-row batch analysis (2026-10-08)

Source: local Tomcat `openbravo.log` of env ETP-5676 (`[BATCH] received/committed`, `[NEO-PERF]`),
after Phase A + Phase B (B1–B2). All `received == committed` (no failed batches).

| Run (local env, tiny seed DB) | Requests | Span | rows/s | Request mean (p50/p95) | Avg concurrency |
|---|---|---|---|---|---|
| Products, 1 op | 100 | 2.5 s | 40 | 81 ms (73/106) | 3.3 |
| Products, product + salesPrice | 1,000 | 25.8 s | 38.7 | 85 ms (81/103) | 3.3 |
| Contacts, bp + location + contact | 2,000 | 225.7 s | 8.9 | 431 ms (328/816) | 3.8 |

Per op (mean): Product total 39 ms (injectDefaults 6, calloutCascade 16, add 15); **BusinessPartner
326 ms (p95 692, max 1,505)**; ADUser 26 ms. ≈ 40 ms fixed overhead per request outside the op timers.

**Caveats:** (1) the user's "4.5 min" run is the 2,000 CONTACTS run (server span 225.7 s + browser
≈ 270 s); the "15 min" reference is a 2,000 PRODUCTS run on a loaded production server (prod
baseline ≈ 1.8 s per product+price) — not like-for-like, so no "3.5×" can be claimed; local
products already run at ~26 ms/row server-side. (2) Real production gain needs a prod-like env.

**Multi-row batches (Phase C) — verdict: not as a blanket change now.**
- Possible today: no max-ops cap in `BatchService`; client already uses `timeout: 0`; needs per-row
  op-id/`parentRef` prefixing (generic wrapper in `buildOperations.js`) and per-row result mapping
  in `importEngine.sendRow` (reads `operations[0].recordId`).
- All-or-nothing: MVP = client bisection + pre-validation; backend per-op SAVEPOINT is M–L (risks:
  `ContactsLocationAddressHandler` calls `SessionHandler.rollback()`, deferred constraints,
  TransactionTracker heuristic). Move to savepoints if duplicate/failure rate > ~1 per 50 rows.
- Keep per-op flush + `session.clear()` (onboarding same-number identifier bug).
- Estimated server-side gain: products ≈ 1.85× at K=25 (ceiling 1.9×: 85 → ~46 ms/row);
  contacts ≈ 1.1× (BP add dominates). 60 s CloudFront limit only binds above ~130 contacts or
  ~1,000 products per chunk, so ETP-5677 is not a prerequisite for K ≤ 25.
- Progress stays per row; cancel granularity becomes the chunk; UNKNOWN blast radius grows (no
  idempotency key).

Next (measure before building): confirm which run was timed; browser timeline (HAR) of the
client-side share; profile BusinessPartner add (326 ms: triggers, flush, refreshBobsFromDb,
sequence); try contacts concurrency 4 → 8 locally (server avg concurrency is only 3.8).

## Per-row server cuts after QA (2026-10-14)

QA's production `[NEO-PERF]` logs (1000 products, 10-row chunks): ~800 ms of server time per row —
product create 515 ms (pre-hook 84, callout cascade 130 of which `SL_TaxCategory_Org` ~90, add 90,
post-hook + response ~193), both prices 73 ms (each one updating the row the seed had just inserted),
cost 205 ms. Four user-approved cuts, documented in `com.etendoerp.go` `docs/neo-headless.md` §4.3.6:

1. `_skipPricesSeed` — product create directive, read and stripped by `ProductDefaultsHandler`;
   declared via `NeoHandler#createDirectives()` so MCP accepts and publishes it. The import sends
   the list of versions the row prices; the server skips a direction only when its own default
   version is listed (review W2: every GO price list has one version, so client and server can
   only pick different tariffs when no list is flagged default, or when the selector leaves the
   sales flag null and the client takes an unflagged list for sales).
2. Per-batch callout skip — `NeoCalloutDiscardMemory` in `NeoBatchScope`: a create-cascade callout
   whose every output was discarded (caller-sent or suppressed fields), with no message, is not re-run
   for the same (tab, trigger, trigger value, kept-field set) within the batch. **Opt-in** since the
   user's safety review: only a request sent with `_skipRedundantCallouts: true` (REST body, MCP
   `etendo_batch`) gets it — the import sends it for products and contacts, OCR does not — and the
   backend kill switch `batch-callout-skip-disabled` (registered in `flags-registry.json` as
   `batch-redundant-callout-skip`, default off = skip allowed) turns it off for every batch.
   **Not created in ConfigCat yet** (402: the `etendo-go` config is at the plan's 10-flag limit;
   ETP-5751 migrates to Datadog Feature Flags). The local property / env var only works where no
   ConfigCat SDK key is set, so production has no rollback for the skip until the flag exists.
3. `_onlyReturnIds` — batch request option (REST body, MCP `etendo_batch`); skips locator
   enrichment and the product's `etgoHasCost`. The batch response was already ids-only. Sent by the
   import (`useWindowImportDialog`), not by OCR.
4. Per-batch lookup memo — `findSpec`, `findEntity`, product default uOM/taxCategory and default
   tariff version, keyed by everything they read; dropped when the DAL session changes.

### Local measurement (2026-10-14, main checkout, local hardware)

Run `MV8954W9`: 2 × 50 PERF5676 products through `POST /sws/neo/batch` from the logged-in SPA, the
import's exact op shape (product + salesPrice + purchasePrice + cost), 10-row chunks, sequential.
Server time per chunk = `[BATCH] received` → `committed` in `openbravo.log`.

| Run | Flags | Server ms/row (chunks 2–5, warm) | Client ms/row (all chunks) |
|---|---|---|---|
| A | off | 104 (996–1084 ms per chunk; first chunk 2161 = warm-up) | 130 |
| B | `_skipPricesSeed` + `_onlyReturnIds` | 71 (612–802 ms per chunk) | 72 |

**Fixes 1 + 3 (A → B): −32 % server time per row.** In A the two price ops never reach
`executePostCreate` — `ProductPriceHandler` finds the seeded zero row and updates it — while in B
they are plain creates (6.7 ms each); product create 30.0 → 23.4 ms, costing create 19.0 → 9.5 ms
(avg `executePostCreate` total).

**Fix 2 (automatic, both runs):** every chunk of both runs logged `skip learned` for three callouts
and then `skipped 9 time(s)` for each — 90 skips per callout over the 100 rows:

| Tab | Trigger | Outputs (all kept) | Callout |
|---|---|---|---|
| Product (180) | `organization` | `taxCategory` | `SL_TaxCategory_Org` |
| Product (180) | `productType` = I | `stocked` | `SL_Product_Type` |
| Costing (800057) | `organization` | `currency` | `SL_Costing_Currency` |

`SL_TaxCategory_Org` returned no `productCategory` (this org has no default category), so its only
output was the `taxCategory` the product pre-hook injects. Callout cascade on the learning row vs the
skipped rows: product 20.5 → 1.2 ms, costing 5.8 → 0 ms — about 25 ms per row locally, i.e. a row
without the skip would be ≈ 127 ms in A. In production the same cascade measured 130 ms on the
product alone (`SL_TaxCategory_Org` ~90, `SL_Product_Type` ~13), all of it on callouts this skips.

**Fix 4:** the memo has no hit counter (not instrumented); its effect is inside the per-op numbers
above and not separable without a code change.

**Relative effect, all four fixes:** ≈ 127 → 71 ms/row locally (−44 %). Local hardware is ~6–8×
faster than production (≈ 800 ms/row), so absolute savings do not transfer; the proportions are the
estimate to check against the next production `[NEO-PERF]` capture.

**Correctness (DB):** every product of both runs has exactly one sales and one purchase
`M_ProductPrice` (no leftover zero row), one `M_Costing` at 5 EUR, a tax category and
`IsStocked = Y` — the skipped callouts' outputs were indeed redundant.

