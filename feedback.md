# Feedback Log

Append-only log of errors, bugs, and improvement opportunities discovered during development.
Each entry should include: date, context, what happened, and suggested fix or status.

---

## 2026-03-13 — push-to-neo entity matching fails for curated names

**Context:** Pushing Sales Order to NEO Headless via `push-to-neo.js`.
**Problem:** Step 3 (field visibility update) failed for all 63 fields with "no entity" error. The contract uses curated entity names (`order`, `orderLine`) but `PopulateSpec` creates entities with AD tab names (`Header`, `Lines`). The matching logic only tried `tabId` (null in contract) and `entityName` (no match).
**Fix:** Added tableName-based fallback in `push-to-neo.js`. Three-level matching: tabId -> name -> tableName. Commit `1343db6`.
**Status:** Fixed.

## [2026-03-18] NEO Headless: List reference columns return raw code without $identifier

**Issue:** Columns with AD_Reference type "List" (e.g., DeliveryViaRule, DeliveryRule, PriorityRule, DocStatus) are returned by the NEO API as raw list codes (e.g., `"P"`, `"A"`, `"5"`, `"CO"`) without a corresponding `$_identifier` field. FK columns (TableDir/Table/Search) correctly return `fieldName$_identifier`.

**Impact:** In the UI, these fields display the internal code instead of the user-facing label ("P" instead of "Pickup Delivery", "CO" instead of "Complete", etc.).

**Expected:** NEO Headless should look up `AD_Ref_List.Name` for List-type columns and include it as `fieldName$_identifier` in the API response, consistent with FK field behavior.

**Workaround:** Mark `documentStatus` as `form: false` so it doesn't appear in the form (the status badge uses it from API data directly). Other list fields (deliveryMethod, deliveryTerms, priority) remain visible but show raw codes pending backend fix.

## 2026-05-12 — ETP-3955: Contextual FK Selectors — Implementation

**Context:** JuanCarlos agentic validation reports identified that required FK selectors return empty results without context (businessPartner, isSOTrx, date). This blocks agents from creating transactional documents.

**Changes implemented in schema_forge:**

1. **Selector inventory script** (`scripts/selector-inventory.js`): Automated scan of all affected specs reporting selector inputMode, dependsOn, validationRule cascade params, and decision coverage. Output: CSV to stdout.

2. **Normalized decisions.json** for `return-to-vendor` and `return-to-vendor-shipment`:
   - Added `partnerAddress` with `dependsOn: { field: "businessPartner", filterKey: "C_BPartner_ID" }` and `inputMode: "dependent"`.
   - Added `businessPartner` field decisions with `selectorFilter: "isVendor=Y"`.
   - Changed `return-to-vendor.lines.tax` from `inputMode: search` to `inputMode: selector`.

3. **Extended `generate-contract.js`** with `buildSelectorContext()` function:
   - Generates `context.required` and `context.optional` arrays for each selector in `apiPrediction`.
   - Sources context from: `dependsOn` declarations, `validationRule.cascadeParams`, and window category.
   - Handles: `C_BPartner_ID` from dependsOn, `IsSOTrx` from window category, `DateInvoiced` from parent field with `DD-MM-YYYY` format, `priceList` and `partnerAddress` as optional parent fields.

4. **Created `selectorContext.js`** shared helper (`tools/app-shell/src/lib/selectorContext.js`):
   - Centralizes selector context derivation previously scattered in `DetailView.jsx`.
   - Exports: `buildSelectorContext()`, `buildHeaderSelectorContext()`, `buildLineSelectorContext()`, `formatIsoToClassicDate()`, `deriveIsSOTrx()`, `deriveRoleFlags()`, `resolveDateFromRecord()`.
   - 34 unit tests covering sales/purchase categories, date formatting, dependsOn mapping, context metadata processing, and fallback behavior.

5. **Added contract-generation tests** (`cli/test/generate-contract.test.js`):
   - 5 new tests verifying selector context metadata in `generateApiPrediction` output.
   - Covers: partnerAddress dependsOn, priceList isSOTrx, tax IsSOTrx+DateInvoiced, purchase mode, and simple FK without context.

**Test results:** `npm test` passes with 12,554 passing tests and 9 skipped tests. `npm --workspace @schema-forge/app-shell run test:vitest -- src/lib/__tests__/selectorContext.vitest.js` passes with 35/35 selector-context tests.

**Remaining work (com.etendoerp.go repo):**
- Extend MCP `neo_selectors` to accept `recordContext` and map to selector params.
- Add missing-context diagnostics to selector responses.
- Verify `neo_defaults` returns `transactionDocument` and default `priceList`.
- Add per-entity `NeoHandler` fallbacks where generic behavior is insufficient.
- Java/runtime tests for selector/default behavior.

## 2026-05-29 — ETP-4083: Tailwind purged core-package classes (transparent calendar background)

**Context:** In Sales Order, opening the calendar of the "Order Date" field showed the popover with a **transparent background** (the form fields behind it bled through). Reported visually on the `DateField`.

**Problem:** `DateField` and `PopoverContent` live in `packages/app-shell-core/src` and paint the background with the semantic class `bg-popover` (→ `hsl(var(--popover))`). The Tailwind `content` globs in `tools/app-shell/tailwind.config.js` only scanned `./src` and `artifacts/**/generated`, **not** the core package source. Since `bg-popover` appeared in no scanned file, Tailwind **purged** it from the final CSS → the popover ended up with no `background-color`. Verified: the built CSS (`dist/assets/*.css`) had **0** `.bg-popover` rules.

**Root cause:** UI components were moved to `packages/app-shell-core/src` (a previous task) without updating the Tailwind `content` globs to include that new path. It affected ALL classes used only in the core, not just `bg-popover` (also `dropdown-menu`, `command`, `select`, etc. with semantic tokens like `text-popover-foreground`).

**Fix:** Add a generic glob for the workspace package sources to the Tailwind `content` (not a single package, so any future package under `packages/` is covered automatically):
```js
content: [
  './index.html',
  './src/**/*.{js,jsx}',
  '../../artifacts/**/generated/**/*.{js,jsx}',
  '../../packages/*/src/**/*.{js,jsx}', // ← recovers classes from any workspace package
],
```

**Scope verified:** Of the 6 packages in `packages/`, only `app-shell-core` renders Tailwind UI (39 files with `className`, all under `src/`) and is imported by the app (46 files). The other 5 (`apps-sdk`, `apps-sdk-bff`, `schema-forge-core`, `schema-forge-stack`, `schema-forge-agent-context`) have no `className` and are not imported by the app. `app-shell-core` does not import UI from other packages, so there is no pending cascade scan. A single glob covers the whole problem.

**Prevention:** Any future move of components with Tailwind classes to a new package under `packages/` is already covered by the generic glob `../../packages/*/src/**`. A regression guard test was also added (`tools/app-shell/src/__tests__/tailwind-purge-guard.vitest.js`) that builds the real CSS and fails in CI if the semantic classes that exist only in the core (`bg-popover`, `text-popover-foreground`) get purged again — previously the build did not fail and the style silently disappeared. Verified: removing the glob makes the test fail 3/4; restoring it passes 4/4.

**Status:** Fixed.

## 2026-07-08 — Concurrent Contacts import: businessPartner searchKey race poisons the /batch transaction

**Context:** Sending a real Contacts CSV import (`ImportDialog` → `/sws/neo/batch`, multiple rows POSTed concurrently per `config.concurrency`). Reproduced with `contacts-sample-import-100.csv`, clicking "Import 63".

**Problem:** Random rows fail with a generic, unrelated-looking backend error:
```
{ "committed": false, "failedAt": { "index": -1 }, "error": { "status": 500, "message": "Batch failed: could not extract ResultSet" } }
```
No per-row detail reaches the frontend — the message gives no hint of the real cause.

**Root cause (confirmed via `docker logs etendo_sf2-tomcat-1`):**
1. `BusinessPartnerHandler.handle()` sets a temporary `searchKey = name` placeholder on POST.
2. `BusinessPartnerHandler.afterHandle()` then reads `EM_Etgo_Identifier` — a column backed by a **transactional sequence** (`com.etendoerp.sequences` module, `SequenceUtils.isSequence()`) — and overwrites `searchKey`/`value` with it via a raw JDBC `UPDATE c_bpartner SET value = ? ...` (`updateSearchKey()`, line ~174).
3. Under the import's concurrent /batch requests, two *unrelated* rows ("Perez S.A." and "Ortiz Group") independently read the **same** "next" sequence value ("1000013") before either committed, so the second `UPDATE` hits `duplicate key value violates unique constraint "c_bpartner_value"`.
4. `afterHandle()`'s own try/catch swallows that exception (logs a warning, returns `null`) — but in Postgres, once a statement fails the **whole transaction is aborted** regardless of the Java-level catch. The next operation in the same batch (`location`'s call to `NeoServletSupport.findSpec()`) then fails on the poisoned connection with the unrelated, confusing "could not extract ResultSet" — which is what actually reaches the response.

**Corroborating evidence:** `com.etendoerp.go`'s own `src-test/.../BusinessPartnerTransactionalSequenceIntegrationTest.java` is already `@Ignore("Temporarily disabled — flaky in CI due to sequence state dependency")` — this exact class of race was previously observed and silenced rather than fixed. Blame: commit `feeaf539c` ("Feature ETP-4356: Ignore BusinessPartnerTransactionalSequenceIntegrationTest"), Santiago Gremiger, 2026-06-29 — added only the `@Ignore` annotation, no attempt to fix the underlying race.

**Files involved:** `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/BusinessPartnerHandler.java` (`afterHandle`, `queryIdentifier`, `updateSearchKey`), third-party `com.etendoerp.sequences` module (actual sequence fetch/increment — source not vendored locally).

**Proposed fixes (not yet applied — pending decision):**
1. Lower `config.concurrency` for the Contacts import to avoid the race window entirely (slower imports).
2. Contain the blast radius: wrap `updateSearchKey()` in a savepoint so a duplicate-key hit rolls back only that statement instead of poisoning the whole batch transaction — the affected row keeps its placeholder searchKey but `location`/`contact` still succeed.
3. Fix the transactional-sequence fetch itself to lock properly under concurrency — blocked on `com.etendoerp.sequences` being a third-party module without local source.

**Status:** Diagnosed, not fixed. Reported to Sebastian 2026-07-08; decision pending on which of the above to implement.

**Partial mitigation (2026-07-13):** The underlying race is still unfixed (none of the three options above have been applied) — a colliding row still aborts. What changed is the *symptom*: `NeoErrorSanitizer.sanitize()` previously collapsed every DB/JDBC/Hibernate exception, including Postgres unique-violations (SQLState `23505`), into the same opaque `"Service temporarily unavailable"` — which is what produced the confusing "could not extract ResultSet" experience described above. It now special-cases SQLState `23505` (checked before the generic DB-exception fallback, walking the same cause chain) and returns `"A record with this value already exists"` instead. This makes *any* duplicate-key hit during import — this race, or a plain re-import of an already-existing row — surface a clear, actionable message instead of a misleading generic one. Reproduced independently while testing a real Contacts CSV import (`artifacts/contacts/sample-import.csv`, re-imported a second time): `Value = 'Rangel Galindo Villarreal Torres S.A.'` collided with an existing row and previously would have shown the generic message; now shows the duplicate-key one. File: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/util/NeoErrorSanitizer.java`.

**Follow-up (2026-07-13, same day):** Two more gaps found while testing the mitigation above against the real import UI:
1. The message `NeoErrorSanitizer.DUPLICATE_KEY_ERROR` originally used ("A record with this value already exists") did not satisfy schema_forge_core's own `isDuplicateKeyError()` (`packages/app-shell-core/src/lib/import/importEngine.js`), which classifies a row as a graceful "already exists" skip (not a hard failure) purely by matching `/must be unique/i` against the message — a heuristic built to mirror Etendo's own native uniqueness message ("... (Client, Organization, Search Key) must be unique."). Reworded to `"A record with this value already exists. This value must be unique."` so this fallback path (raw-JDBC exceptions that bypass Etendo's own translation, e.g. this exact `updateSearchKey()` race) gets classified the same way the native path already is, instead of showing up in the review queue as a genuine failure.
2. `NeoCrudHandler.handleDefault()`'s catch-all always returned HTTP 500 for any exception — including this one, which is a data conflict, not a server error. Added `NeoErrorSanitizer.isDuplicateKeyViolation(Throwable)` (public, reusing the same cause-chain walk) and now return 409 (Conflict) instead of 500 specifically for this case. Verified the frontend's `runBatch` (`useBatch.js`) only branches on `res.ok`/JSON-parseability, never a specific status code, so this is safe — no frontend change needed for the status-code switch itself.

**Follow-up #2 (2026-07-13, same day):** Retested against a live `/sws/neo/batch` duplicate-key request and the fixes above had *no effect* — turned out neither one's code path was actually being hit for this scenario:
- Etendo's `DefaultJsonDataService` doesn't throw a Java exception for this violation at all — it catches it internally and returns a normal JSON RPC response (`{"response":{"status":-1,"error":{...}}}`). That response is read by a *different* method, `NeoCrudHandler.checkJsonServiceResponse()`, which had its **own independent hardcoded 500** — completely bypassing both `handleDefault()`'s catch block and `NeoErrorSanitizer`. Fixed the same way: added `NeoErrorSanitizer.isDuplicateKeyMessage(String)` (checks the already-translated message text for "must be unique", since there's no exception to inspect here) and `checkJsonServiceResponse()` now also returns 409 instead of 500 when it matches.
- Separately, `importEngine.js`'s `isDuplicateKeyError()` check was reading the wrong field for any `/batch`-routed operation: `BatchService.processOperation()` always wraps a rejected op as `error.message = "Operation 'x' rejected by server"` (a constant, generic wrapper) with the real diagnostic text nested one level deeper at `error.detail.error.message`. So the "must be unique" regex could never match for a real batch failure, regardless of any backend fix — every duplicate-key conflict from the Contacts import was structurally guaranteed to misclassify as a hard failure. Fixed `sendRow()` to extract `error.detail?.error?.message` first, falling back to the wrapper only when absent, and to surface that same message to the review queue (not just for classification) — so the user now sees the real Etendo message ("There is already a Business Partner...") instead of the generic wrapper text either way.

Files: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/{util/NeoErrorSanitizer.java,NeoCrudHandler.java}`, `schema_forge_core`'s `packages/app-shell-core/src/lib/import/importEngine.js`.
