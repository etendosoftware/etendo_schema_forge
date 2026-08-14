# ETP-4285 — Expose Document Workflow Actions Semantically via MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document workflow actions (`documentAction` = CO/CL/VO/RE…) discoverable, semantically described, and behaviourally correct when fired by an AI agent through MCP, so an agent can complete a draft sales order (DR → CO) exactly as the UI does.

**Architecture:** Three layers, in dependency order. (1) **Correctness** — `neo_action` gains `NeoHandler` pre/post hook parity with the REST action path, so a document completion fired over MCP runs the same handler logic as the UI. (2) **Discoverability, generic** — `neo_schema`'s button fields gain `actionValues` (read from the button's AD list reference) plus `actionParameter` (the key the chosen value travels under), and `neo_action`'s tool description states the calling contract. This is derived from AD, so every window gets it with zero per-window code. (3) **Semantics, per window** — the *judgement* (which value to use when, preconditions, what the action does to the document) lives in `decisions.json` as `fields.documentAction.agentPrompt`, which the existing pipeline already carries to `ETGO_SF_FIELD.AGENT_PROMPT` and `neo_schema` already returns.

**Tech Stack:** Java 11 / CDI / Openbravo DAL (`com.etendoerp.go`), JUnit 4 + JUnit 5 + Mockito (`src-test/`), Node.js pipeline (`schema_forge_core` CLI, consumed as published package by `etendo_schema_forge`), `decisions.json` config.

## Decisions taken before planning (2026-07-31, with the user)

| Question | Decision |
|---|---|
| Does the hook-bypass fix belong in this ticket? | **Yes** — in scope, Task 1. Without it the AC evidence would be a false green. |
| Where does per-action semantics live? | **Generic from AD + `agentPrompt`.** No `describeForAgent()` in this ticket, no DB schema change. |
| How many windows get populated prompts? | **Four**: `sales-order`, `purchase-order`, `sales-invoice`, `purchase-invoice`. |

## Progress (2026-07-31)

- **Reproduction VERIFIED red → green (2026-07-31).** Full evidence, `./gradlew test --tests "com.etendoerp.go.mcp.McpToolRouterRouteTest*"` from `etendo_core/`:
  - fix applied → `BUILD SUCCESSFUL`, 63 tests;
  - `git -C modules/com.etendoerp.go stash push src/com/etendoerp/go/mcp/McpToolRouter.java` (fix removed, `buildActionHookContext` left in place so the suite still compiles) → **4 failed / 63**, and precisely the four new ones: `actionRunsEntityHandlerHooks` and `actionBuildsActionHookContextWithActionName` with `WantedButNotInvoked` (the hooks were never called), `actionPreHookShortCircuitsWithoutFiringTheProcess` and `actionPostHookReplacesResult` with `AssertionFailedError` (the process fired anyway / the result was not replaced). The other 59 tests stayed green, so the fix is scoped;
  - `git stash pop` → `BUILD SUCCESSFUL` again.
  - The tests are therefore non-vacuous: each one fails without the fix and passes with it.
- **Full MCP package GREEN and each new test confirmed executed (2026-07-31).** `./gradlew test --tests "com.etendoerp.go.mcp.*"` → `BUILD SUCCESSFUL`; the XML in `build/test-results/test/` reports **579 tests, 0 failures, 0 errors, 3 skipped**. Per-suite counts confirm the new tests ran rather than being silently filtered out: `route — neo_action` 9 (was 5, +4), `McpHookExecutorTest` 18 (was 17, +1, and `testBuildActionHookContextSetsActionEndpointTypeAndFieldName` is present), `addButtonInfo` 7 (was 4, +3, all three `…ActionValues…` names present in `McpSchemaFieldBuilderTest$AddButtonInfo.xml`).
- **Caveat for Task 5:** the 3 skipped tests are all in `NeoWidgetMcpIntegrationTest` — skipped, not failed. That is the only MCP-level *integration* harness in the repo and it does not execute in this environment, which is a direct warning for Task 5 Step 5: the planned `NeoActionMcpIntegrationTest` will likely skip here too. If it does, say so explicitly and treat the unit coverage plus the manual MCP transcript as the evidence — never report a skipped integration test as passing.
- **Gradle filter gotcha that cost one false "red" here:** `--tests "McpToolRouterRouteTest.someMethod"` does **not** match a method inside a JUnit 5 `@Nested` class — Gradle matched nothing, failed `:test` with `No tests found for given includes`, and that empty failure was briefly mistaken for the bug reproducing. Detection tell: `build/test-results/test/` stays empty. Always use the wildcard form `--tests "<Class>*"` (or `<Class>$<Nested>`) for this suite.
- **Task 1 — DONE** (code + 4 tests; test runs pending, human-side): `McpHookExecutor.buildActionHookContext` (ACTION endpoint type + `fieldName=actionName`, the two values handlers branch on) and `handleAction` wrapped with `resolveEntityHandler` / `runPreHook` / `runPostHook`. The `parameters` object is shared with `executeButtonActionCore` so a handler that normalizes the action value is honoured by the process call — same contract the REST path gives handlers. Post-hook runs only on the success path, mirroring `handleCreate`/`handleUpdate`. Tests: hook wiring, ACTION-context shape (`McpHookExecutorTest`, JUnit 4, with a statically mocked `OBContext`), pre-hook short-circuit (asserts the process is NOT fired), post-hook replacement.
- **Task 4 — DONE**: gap analysis (G6 row + a dated §3.2 update recording that `describeForAgent()` was evaluated and not needed), `mcp-ticket-knowledge.md`, `mcp-field-flags-pipeline.md` (new derived-field row), and an "MCP document actions" section in each of the four window guides — each written from that window's real config, so `purchase-order`'s says `RE` is not offered and both invoices' say posting is a separate action, never `PO`.
- **Task 2 — DONE** (code + 3 unit tests written; test runs pending, human-side): `McpConstants` (3 constants), `McpSchemaFieldBuilder.addActionValues`, `ToolRegistry.buildActionTool` description. `ToolRegistryGenerateToolsTest` asserts only tool names and required fields, never the description string, so it needed no change.
- **Task 3 — DONE**: `agentPrompt` added to `documentAction` in all four windows, each written against that window's *actual* config (`menuActions` / `draftMode`), not assumptions — `purchase-order` offers no Reactivate, and both invoices post through a separate `post` action with `preUnpost` on reactivate. `make regen` passed 4/4 and **the diff is decisions-only**: field-level `agentPrompt` does not flow into `contract.json` (only the spec-level one does, via `agentProfile`), and `generated/` is untouched — so the plan's original expectation of a regenerated `contract.json` was wrong, and Step 7's contract-integrity check is moot here (the file is byte-identical to the epic version). `sf-validate-pipeline --scope=<each>` → 0 violations. Pending: Step 10 (`PUSH_TO_NEO=1` + `./gradlew export.database`), human-side.
- **Note surfaced by regen, pre-existing and NOT touched:** `make regen` warns the AD cache snapshot is stale (5 queries differ, incl. `AD_Ref_List`). That makes the offline `FROM_CACHE=1` regen check unreliable. Refreshing it (`make regen CACHE_DB=1`) rewrites a shared snapshot, so it is left to the human as a separate decision.
- **Task 5 (end-to-end evidence) — pending, needs a deploy.** Everything else is code-complete and uncommitted.

## Global Constraints

- **All versioned content in English** — code, comments, commit messages, docs, and the `agentPrompt` strings themselves (they are versioned config read by agents).
- **The human runs all builds and all commits.** Agents never run `./gradlew`, never run `git commit`, never push, never touch Jira. Deliver the working tree modified and report what is ready to commit. Commit-message text is provided in each task for the human to use.
- **Branches already exist, local only, created from `epic/ETP-3504`** (all three repos were in sync with origin at creation): `feature/ETP-4285` in `etendo_core/modules/com.etendoerp.go`, `etendo_core/schema_forge`, `etendo_core/schema_forge_core`.
- Commit format: `Feature ETP-4285: <description>`, first line ≤ 80 chars, **no `Co-Authored-By`** (Git Police rejects it).
- **`decisions.json` is the only source of truth** for window config. Never edit `contract.json` or anything under `artifacts/*/generated/`.
- **Never add window-specific logic to generic Java services.** Task 2 is generic-from-AD by construction; if a window needs bespoke behaviour it belongs in its `NeoHandler`, not in `McpSchemaFieldBuilder`.
- Test writing is delegated to the **Tester** agent (`.claude/agents/test-generator.md`) per `CLAUDE.md`; the test code in this plan is the specification Tester implements against.
- Expected repo split: Tasks 1–2 touch `com.etendoerp.go` only. Task 3 touches `etendo_schema_forge` (`artifacts/`) only. Task 4 touches `etendo_schema_forge` (`docs/`) only. `schema_forge_core` needs **no change** — field-level `agentPrompt` is already fully plumbed (`push-to-neo.js:417` → `neo-writer.js:275` → `ETGO_SF_FIELD.AGENT_PROMPT`). Its branch exists only to keep the three repos on matching branches per `docs/branch-workflow.md`.

---

## Verified starting state (do not re-derive)

These were confirmed against the code and the live DB on 2026-07-31. They are the premises of the tasks below.

| Fact | Evidence |
|---|---|
| Document actions **are already invocable** over MCP | `McpToolRouter.handleAction:840` → `NeoButtonActionHelper.executeButtonActionCore:144`; the action value travels as `parameters.docAction` and `NeoProcessService.setDocAction:821` writes it onto the record before calling the process |
| `neo_action` **skips** the entity's `NeoHandler` hooks | `handleAction` calls the core helper directly; `handleCreate:457`, `handleUpdate:510`, `handleDelete:560` all wrap with `McpHookExecutor`. The REST path *does* hook: `NeoSubEndpointDispatcher.java:99-101` wraps `handleButtonAction` in `handleHookedSubEndpoint(... NeoEndpointType.ACTION ...)` |
| Handlers branch on exactly two context values | `AbstractOrderHeaderHandler.isActionDocumentActionComplete:169` requires `context.getEndpointType() == ACTION` and `context.getFieldName() == "documentAction"`, then accepts the value from `fieldValues.documentAction`, root `docAction`, **or** root `documentAction` |
| The four target windows all have a header handler | `decisions.json` `entities.header.javaQualifier` = `salesOrderHeaderHandler` / `purchaseOrderHeaderHandler` / `salesInvoiceHeaderHandler` / `purchaseInvoiceHeaderHandler` |
| `documentAction` reaches `ETGO_SF_FIELD` today | sourcedata shows `sales-order.header` `java_qualifier=documentAction`, `isincluded=Y`, `isreadonly=Y`, `AGENT_PROMPT` **empty**. `visibility:"system"` maps to `isIncluded:'Y'` (`push-to-neo.js:60`), which is why `findButtonColumn` resolves it |
| `agentPrompt` is populated in **zero** artifacts | `grep -rl agentPrompt artifacts/*/decisions.json` → no matches |
| `C_Order.DocAction` has a list reference; `Processing`/`CopyFrom`/etc. do **not** | DB: `ad_column.ad_reference_value_id = 'FF80818130217A35013021A672400035'` ("Order_Document Action"); most other ref-28 columns on `C_Order` have a NULL reference value → the new code must null-guard |
| Active values of that reference | `--`(None), `AP` Approve, `CL` Close, `CO` Book, `PO` Post, `PR` Process, `RA` Reverse-Accrual, `RC` Void, `RE` Reactivate, `RJ` Reject, `VO` Void, `XL` Unlock (`TR` Transfer is inactive). `C_Invoice.DocAction` uses a *different* reference (`135`, "All_Document Action") |
| A reusable, active-filtered label lookup already exists | `NeoSelectorService.getListLabels(referenceId)` → `Map<searchKey, name>`, filters `isActive = true` (`ListReferenceSelectorExecutor`). Returns a `HashMap`, so **order is not stable — sort before emitting** |

**Consequence for Task 3:** the AD list is deliberately broader than what is legal for a given document in a given state. The generic layer emits the whole active list (factual); the `agentPrompt` is what tells the agent that a draft sales order takes `CO` and `VO` and nothing else.

---

## File Structure

**`etendo_core/modules/com.etendoerp.go`** (branch `feature/ETP-4285`)

| File | Responsibility | Change |
|---|---|---|
| `src/com/etendoerp/go/mcp/McpHookExecutor.java` | Builds hook contexts, runs pre/post hooks | Add `buildActionHookContext(...)` (Task 1) |
| `src/com/etendoerp/go/mcp/McpToolRouter.java` | MCP tool dispatch | Wire pre/post hooks into `handleAction` (Task 1) |
| `src/com/etendoerp/go/mcp/McpSchemaFieldBuilder.java` | Builds `neo_schema` field objects | Add `addActionValues(...)`, call it from `addButtonInfo` (Task 2) |
| `src/com/etendoerp/go/mcp/McpConstants.java` | Shared MCP string constants | Add `PARAM_DOC_ACTION`, `KEY_ACTION_VALUES`, `KEY_ACTION_PARAMETER` (Task 2) |
| `src/com/etendoerp/go/mcp/ToolRegistry.java` | Tool definitions / descriptions | Rewrite `buildActionTool` description + `parameters` prop text (Task 2) |
| `src-test/src/com/etendoerp/go/mcp/McpHookExecutorTest.java` | JUnit **4** unit tests | Add ACTION-context tests (Task 1) |
| `src-test/src/com/etendoerp/go/mcp/McpToolRouterRouteTest.java` | JUnit **5** router tests, `ActionTests` nested class | Add hook-wiring tests (Task 1) |
| `src-test/src/com/etendoerp/go/mcp/McpSchemaFieldBuilderTest.java` | JUnit **5**, `AddButtonInfo` nested class | Add `actionValues` tests (Task 2) |
| `src-test/src/com/etendoerp/go/mcp/ToolRegistryTest.java` | Tool-definition assertions | Extend if it asserts the `neo_action` description (Task 2, check first) |

**`etendo_core/schema_forge`** (branch `feature/ETP-4285`)

| File | Responsibility | Change |
|---|---|---|
| `artifacts/{sales-order,purchase-order,sales-invoice,purchase-invoice}/decisions.json` | Window config, source of truth | Add `entities.header.fields.documentAction.agentPrompt` (Task 3) |
| `artifacts/*/contract.json`, `artifacts/*/generated/**` | Generated output | Regenerated by `make regen`, never hand-edited (Task 3) |
| `docs/generated-custom-windows/{sales-order,purchase-order,sales-invoice,purchase-invoice}.md` | Per-window functional guides | Add an "MCP document actions" note (Task 4) |
| `docs/plans/etendo-go-mcp-gap-analysis.md` | Gap analysis, G6/G9 | Mark what this ticket closed (Task 4) |
| `docs/agentic-validation/mcp-ticket-knowledge.md` | Ticket knowledge base for the validation bot | Record the ETP-4285 outcome (Task 4) |
| `docs/agentic-validation/etp-4285-document-action-evidence.md` | **New** — the AC's captured evidence | Create (Task 5) |

---

## Task 1: Hook parity for `neo_action`

**Goal of this task:** a button action fired through MCP runs the entity's `NeoHandler` pre- and post-hooks, so `documentAction=CO` over MCP triggers the same handler logic (total-discount line, `ProcessInvoiceHook` routing, GL-journal DocAction mapping) as the UI.

**Files:**
- Modify: `src/com/etendoerp/go/mcp/McpHookExecutor.java` (add a method after `buildDefaultsHookContext`, ~line 113)
- Modify: `src/com/etendoerp/go/mcp/McpToolRouter.java:840-868` (`handleAction`)
- Test: `src-test/src/com/etendoerp/go/mcp/McpHookExecutorTest.java` (JUnit 4)
- Test: `src-test/src/com/etendoerp/go/mcp/McpToolRouterRouteTest.java` (JUnit 5, `ActionTests`)

**Interfaces:**
- Consumes: `NeoContext.Builder` (`.endpointType(NeoEndpointType)`, `.fieldName(String)`), `McpHookExecutor.resolveEntityHandler/runPreHook/runPostHook`, `SFEntity.getADTab()`
- Produces: `static NeoContext McpHookExecutor.buildActionHookContext(String specName, String entityName, String recordId, String actionName, JSONObject params, Tab adTab, SFEntity sfEntity)` — package-private, used only by `McpToolRouter.handleAction`

- [ ] **Step 1: Write the failing context-shape test** (JUnit 4 file — match its existing style: `org.junit.Test`, `org.junit.Assert`)

Add to `McpHookExecutorTest.java`. Note the class javadoc currently says `buildHookContext` is not unit-tested because it calls `OBContext.getOBContext()`; we mock that statically, so also update that javadoc sentence to mention the ACTION overload is covered here.

```java
  // ── buildActionHookContext ────────────────────────────────────────────

  @Test
  public void testBuildActionHookContextSetsActionEndpointTypeAndFieldName() throws Exception {
    SFEntity sfEntity = mock(SFEntity.class);
    Tab adTab = mock(Tab.class);
    JSONObject params = new JSONObject();
    params.put("docAction", "CO");

    try (MockedStatic<OBContext> obContextMock = mockStatic(OBContext.class)) {
      obContextMock.when(OBContext::getOBContext).thenReturn(null);

      NeoContext ctx = McpHookExecutor.buildActionHookContext("sales-order", "header",
          "REC-1", "documentAction", params, adTab, sfEntity);

      assertEquals(NeoEndpointType.ACTION, ctx.getEndpointType());
      assertEquals("documentAction", ctx.getFieldName());
      assertEquals("POST", ctx.getHttpMethod());
      assertEquals("REC-1", ctx.getRecordId());
      assertEquals("sales-order", ctx.getSpecName());
      assertEquals("header", ctx.getEntityName());
      assertEquals("CO", ctx.getRequestBody().getString("docAction"));
      assertEquals(adTab, ctx.getAdTab());
      assertEquals(sfEntity, ctx.getSfEntity());
    }
  }
```

Required new imports in that file: `static org.mockito.Mockito.mockStatic`, `org.mockito.MockedStatic`, `org.openbravo.dal.core.OBContext`, `org.openbravo.model.ad.ui.Tab`, `com.etendoerp.go.schemaforge.NeoEndpointType`.

- [ ] **Step 2: Run it and confirm it fails**

Ask the human to run:
`./gradlew test --tests "com.etendoerp.go.mcp.McpHookExecutorTest"` from `etendo_core/`
Expected: compilation error — `cannot find symbol: method buildActionHookContext`.

- [ ] **Step 3: Implement `buildActionHookContext`**

Insert into `McpHookExecutor.java` immediately after `buildDefaultsHookContext` (ends ~line 113):

```java
  /**
   * Build the {@link NeoContext} for the ACTION endpoint hook (ETP-4285).
   *
   * <p>Mirrors what the REST path passes on
   * {@code POST /sws/neo/{spec}/{entity}/{id}/action/{name}}
   * ({@code NeoSubEndpointDispatcher.handleHookedSubEndpoint}), so a button action fired
   * through MCP reaches the entity's handler with the same shape the UI produces.
   * {@code endpointType=ACTION} plus {@code fieldName=actionName} are the two values
   * handlers branch on — see
   * {@code AbstractOrderHeaderHandler.isActionDocumentActionComplete}, which then reads the
   * action value from the request body ({@code fieldValues.documentAction}, root
   * {@code docAction}, or root {@code documentAction}).</p>
   *
   * @param specName   the spec that owns the entity
   * @param entityName the entity that owns the button field
   * @param recordId   the record the action targets
   * @param actionName the button field name as passed to {@code neo_action} (e.g.
   *                   {@code documentAction})
   * @param params     the MCP {@code parameters} object, used as the request body; must not
   *                   be {@code null} so a handler can read and mutate it
   * @param adTab      the entity's AD tab, may be {@code null} for tab-less entities
   * @param sfEntity   the entity configuration
   * @return a NeoContext with {@code endpointType=ACTION} and {@code httpMethod=POST}
   */
  static NeoContext buildActionHookContext(String specName, String entityName, String recordId,
      String actionName, JSONObject params, Tab adTab, SFEntity sfEntity) {
    return NeoContext.builder()
        .specName(specName)
        .entityName(entityName)
        .httpMethod("POST")
        .recordId(recordId)
        .requestBody(params)
        .adTab(adTab)
        .sfEntity(sfEntity)
        .obContext(OBContext.getOBContext())
        .endpointType(NeoEndpointType.ACTION)
        .fieldName(actionName)
        .build();
  }
```

- [ ] **Step 4: Run the test again and confirm it passes**

`./gradlew test --tests "com.etendoerp.go.mcp.McpHookExecutorTest"` → PASS.

- [ ] **Step 5: Write the failing router-wiring tests**

Add to the `ActionTests` nested class in `McpToolRouterRouteTest.java`. The class already has `supportMock` and `buttonActionMock` static mocks and the helpers `mockSpec()`, `mockEntity()`, `mockTab()`, `setupSpecLookup(...)`, `setupEntityLookup(...)`, `buildActionArgs()` — reuse them; do not re-declare them.

```java
    @Test
    @DisplayName("neo_action runs the entity pre-hook and short-circuits when it returns a result")
    void actionPreHookShortCircuitsWithoutFiringTheProcess() throws Exception {
      SFSpec spec = mockSpec();
      SFEntity entity = mockEntity();
      Tab tab = mockTab();
      setupSpecLookup(spec);
      setupEntityLookup(entity, tab);

      JSONObject hookResult = McpToolRouter.wrapAsErrorContent("Order has no lines");

      try (MockedStatic<McpHookExecutor> hookMock = mockStatic(McpHookExecutor.class)) {
        hookMock.when(() -> McpHookExecutor.runPreHook(any(), any())).thenReturn(hookResult);

        JSONObject result = router.route("neo_action", buildActionArgs(), ACTION_SCOPES);

        assertTrue(result.getBoolean("isError"));
        assertTrue(result.getJSONArray("content").getJSONObject(0)
            .getString("text").contains("Order has no lines"));
        buttonActionMock.verify(() -> NeoButtonActionHelper.executeButtonActionCore(
            any(), any(), any(), any()), never());
      }
    }

    @Test
    @DisplayName("neo_action builds an ACTION hook context carrying the action name")
    void actionBuildsActionHookContextWithActionName() throws Exception {
      SFSpec spec = mockSpec();
      SFEntity entity = mockEntity();
      Tab tab = mockTab();
      setupSpecLookup(spec);
      setupEntityLookup(entity, tab);

      JSONObject responseBody = new JSONObject();
      responseBody.put("status", "success");
      buttonActionMock.when(() -> NeoButtonActionHelper.executeButtonActionCore(
          eq(entity), eq(RECORD_ID), eq(ACTION_NAME), any()))
          .thenReturn(NeoResponse.ok(responseBody));

      try (MockedStatic<McpHookExecutor> hookMock = mockStatic(McpHookExecutor.class)) {
        router.route("neo_action", buildActionArgs(), ACTION_SCOPES);

        hookMock.verify(() -> McpHookExecutor.buildActionHookContext(
            eq(SPEC_NAME), eq(ENTITY_NAME), eq(RECORD_ID), eq(ACTION_NAME),
            any(), any(), eq(entity)));
      }
    }

    @Test
    @DisplayName("neo_action lets the post-hook replace the default result")
    void actionPostHookReplacesResult() throws Exception {
      SFSpec spec = mockSpec();
      SFEntity entity = mockEntity();
      Tab tab = mockTab();
      setupSpecLookup(spec);
      setupEntityLookup(entity, tab);

      JSONObject responseBody = new JSONObject();
      responseBody.put("status", "success");
      buttonActionMock.when(() -> NeoButtonActionHelper.executeButtonActionCore(
          eq(entity), eq(RECORD_ID), eq(ACTION_NAME), any()))
          .thenReturn(NeoResponse.ok(responseBody));

      JSONObject replaced = McpToolRouter.wrapAsTextContent("{\"processResult\":\"warning\"}");

      try (MockedStatic<McpHookExecutor> hookMock = mockStatic(McpHookExecutor.class)) {
        hookMock.when(() -> McpHookExecutor.runPreHook(any(), any())).thenReturn(null);
        hookMock.when(() -> McpHookExecutor.runPostHook(any(), any(), any()))
            .thenReturn(replaced);

        JSONObject result = router.route("neo_action", buildActionArgs(), ACTION_SCOPES);

        assertTrue(result.getJSONArray("content").getJSONObject(0)
            .getString("text").contains("warning"));
      }
    }
```

Add whatever of `MockedStatic`, `mockStatic`, `never`, `eq` is not already imported in that file.

- [ ] **Step 6: Run them and confirm they fail**

`./gradlew test --tests "com.etendoerp.go.mcp.McpToolRouterRouteTest"`
Expected: `actionPreHookShortCircuitsWithoutFiringTheProcess` fails because `executeButtonActionCore` **is** called; `actionBuildsActionHookContextWithActionName` fails to compile (no such method) until Task 1 Step 3 is in place, and fails the `verify` until Step 7.

- [ ] **Step 7: Wire the hooks into `handleAction`**

Replace the body of `McpToolRouter.handleAction` (currently lines 840-868) with:

```java
  JSONObject handleAction(String specName, JSONObject args) throws Exception {
    McpToolRouterSupport.validateArgs(args, McpConstants.PARAM_ENTITY, "id", "action");

    String entityName = args.getString(McpConstants.PARAM_ENTITY);
    String recordId = args.getString("id");
    String actionName = args.getString("action");
    JSONObject parameters = args.optJSONObject(McpConstants.PARAM_PARAMETERS);

    SFSpec spec = McpToolRouterSupport.findActiveSpecByName(specName);
    SFEntity sfEntity = McpToolRouterSupport.findIncludedEntity(spec.getId(), entityName);

    // Hook parity with the REST action path (NeoSubEndpointDispatcher.handleHookedSubEndpoint,
    // NeoEndpointType.ACTION): without this, completing a document over MCP skips the
    // handler logic the UI runs — e.g. AbstractOrderHeaderHandler's pre-CO total-discount
    // line or AbstractInvoiceHeaderHandler's ProcessInvoiceHook routing (ETP-4285).
    // The body object is shared with executeButtonActionCore on purpose, so a handler that
    // normalizes the action value is honoured by the process call that follows.
    JSONObject actionParams = parameters != null ? parameters : new JSONObject();
    NeoHandler handler = McpHookExecutor.resolveEntityHandler(sfEntity);
    NeoContext hookCtx = McpHookExecutor.buildActionHookContext(specName, entityName, recordId,
        actionName, actionParams, sfEntity.getADTab(), sfEntity);
    JSONObject preHookResult = McpHookExecutor.runPreHook(handler, hookCtx);
    if (preHookResult != null) {
      return preHookResult;
    }

    NeoResponse neoResponse = NeoButtonActionHelper.executeButtonActionCore(
        sfEntity, recordId, actionName, actionParams);

    JSONObject actionResult = McpToolRouterSupport.mapNeoResponseToActionResult(neoResponse);

    if (neoResponse.getHttpStatus() >= 400) {
      if (!actionResult.has(McpConstants.KEY_PROCESS_RESULT)) {
        actionResult.put(McpConstants.KEY_PROCESS_RESULT, McpConstants.KEY_ERROR);
      }
      if (!actionResult.has(McpConstants.KEY_PROCESS_MESSAGE)) {
        actionResult.put(McpConstants.KEY_PROCESS_MESSAGE,
            "Request failed with HTTP status " + neoResponse.getHttpStatus());
      }
      return wrapAsErrorContent(actionResult.toString(2));
    }

    JSONObject postHookResult = McpHookExecutor.runPostHook(handler, hookCtx, actionResult);
    if (postHookResult != null) {
      return postHookResult;
    }

    return wrapAsTextContent(actionResult.toString(2));
  }
```

Also update the method javadoc (lines 827-839) — add a sentence: *"Runs the entity's `NeoHandler` pre/post hooks around the action, matching the REST action path; a pre-hook `NeoResponse` short-circuits before the process is fired."*

Note: the post-hook deliberately runs **only** on the success path, mirroring `handleCreate`/`handleUpdate`, which return early on error before `runPostHook`.

- [ ] **Step 8: Run the full MCP test package and confirm green**

`./gradlew test --tests "com.etendoerp.go.mcp.*"`
Expected: all pass. Watch specifically for pre-existing `NeoWidgetMcpIntegrationTest` env flakiness — if it fails, confirm against `etendo_core/build/test-results/test/` that the failure predates this change and say so explicitly rather than claiming a clean run.

- [ ] **Step 9: Hand off for commit (human)**

Files ready: `McpHookExecutor.java`, `McpToolRouter.java`, `McpHookExecutorTest.java`, `McpToolRouterRouteTest.java`.
Suggested message: `Feature ETP-4285: Run NeoHandler hooks on the MCP neo_action path`

---

## Task 2: Expose allowed action values and the calling contract

**Goal of this task:** an agent reading `neo_schema` learns, for every list-backed button, which discrete values it accepts and under which key to send the chosen one — without any per-window code.

**Files:**
- Modify: `src/com/etendoerp/go/mcp/McpConstants.java`
- Modify: `src/com/etendoerp/go/mcp/McpSchemaFieldBuilder.java:333-355` (`addButtonInfo`)
- Modify: `src/com/etendoerp/go/mcp/ToolRegistry.java:582-599` (`buildActionTool`)
- Test: `src-test/src/com/etendoerp/go/mcp/McpSchemaFieldBuilderTest.java` (`AddButtonInfo` nested class)
- Check: `src-test/src/com/etendoerp/go/mcp/ToolRegistryTest.java` — grep it for `neo_action` before editing; if it asserts the old description string, update that assertion in the same task.

**Interfaces:**
- Consumes: `NeoSelectorService.getListLabels(String referenceId)` → `Map<String,String>` (active-only, unordered), `Column.getReferenceSearchKey()`
- Produces: two new keys on every list-backed button field object in `neo_schema`: `actionValues` (`JSONArray` of `{value,label}`, sorted by `value`) and `actionParameter` (`String`, always `"docAction"`)

- [ ] **Step 1: Write the failing tests**

Add to the `AddButtonInfo` nested class in `McpSchemaFieldBuilderTest.java`. It already has the `accessHelperMock` `@BeforeEach`/`@AfterEach` and the `invokeStatic(...)` reflection helper — reuse them.

```java
    @Test
    @DisplayName("listBackedButtonEmitsSortedActionValuesAndParameter")
    void listBackedButtonEmitsSortedActionValuesAndParameter() throws Exception {
      org.openbravo.model.ad.datamodel.Column col = mock(
          org.openbravo.model.ad.datamodel.Column.class);
      org.openbravo.model.ad.domain.Reference listRef = mock(
          org.openbravo.model.ad.domain.Reference.class);
      Process classicProcess = mock(Process.class);

      when(col.getDBColumnName()).thenReturn("DocAction");
      when(col.getProcess()).thenReturn(classicProcess);
      when(col.getOBUIAPPProcess()).thenReturn(null);
      when(classicProcess.getName()).thenReturn("Process Order");
      when(classicProcess.getId()).thenReturn("CLASSIC-PROC-001");
      when(col.getReferenceSearchKey()).thenReturn(listRef);
      when(listRef.getId()).thenReturn("ORDER-DOCACTION-REF");

      // Unordered on purpose: getListLabels returns a HashMap.
      java.util.Map<String, String> labels = new java.util.HashMap<>();
      labels.put("VO", "Void");
      labels.put("CO", "Book");
      labels.put("CL", "Close");

      try (MockedStatic<NeoSelectorService> selectorMock = mockStatic(NeoSelectorService.class)) {
        selectorMock.when(() -> NeoSelectorService.getListLabels("ORDER-DOCACTION-REF"))
            .thenReturn(labels);

        JSONObject fieldObj = new JSONObject();
        invokeStatic("addButtonInfo",
            new Class<?>[]{ JSONObject.class, org.openbravo.model.ad.datamodel.Column.class },
            fieldObj, col);

        assertEquals("docAction", fieldObj.getString("actionParameter"));
        JSONArray values = fieldObj.getJSONArray("actionValues");
        assertEquals(3, values.length());
        assertEquals("CL", values.getJSONObject(0).getString("value"));
        assertEquals("Close", values.getJSONObject(0).getString("label"));
        assertEquals("CO", values.getJSONObject(1).getString("value"));
        assertEquals("VO", values.getJSONObject(2).getString("value"));
      }
    }

    @Test
    @DisplayName("buttonWithoutListReferenceOmitsActionValues")
    void buttonWithoutListReferenceOmitsActionValues() throws Exception {
      org.openbravo.model.ad.datamodel.Column col = mock(
          org.openbravo.model.ad.datamodel.Column.class);

      when(col.getDBColumnName()).thenReturn("Processing");
      when(col.getProcess()).thenReturn(null);
      when(col.getOBUIAPPProcess()).thenReturn(null);
      when(col.getReferenceSearchKey()).thenReturn(null);
      accessHelperMock.when(
          () -> NeoAccessHelper.resolveFallbackObuiappProcess(col)).thenReturn(null);

      JSONObject fieldObj = new JSONObject();
      invokeStatic("addButtonInfo",
          new Class<?>[]{ JSONObject.class, org.openbravo.model.ad.datamodel.Column.class },
          fieldObj, col);

      assertFalse(fieldObj.has("actionValues"));
      assertFalse(fieldObj.has("actionParameter"));
    }

    @Test
    @DisplayName("buttonWithEmptyListOmitsActionValues")
    void buttonWithEmptyListOmitsActionValues() throws Exception {
      org.openbravo.model.ad.datamodel.Column col = mock(
          org.openbravo.model.ad.datamodel.Column.class);
      org.openbravo.model.ad.domain.Reference listRef = mock(
          org.openbravo.model.ad.domain.Reference.class);

      when(col.getDBColumnName()).thenReturn("DocAction");
      when(col.getProcess()).thenReturn(null);
      when(col.getOBUIAPPProcess()).thenReturn(null);
      when(col.getReferenceSearchKey()).thenReturn(listRef);
      when(listRef.getId()).thenReturn("EMPTY-REF");
      accessHelperMock.when(
          () -> NeoAccessHelper.resolveFallbackObuiappProcess(col)).thenReturn(null);

      try (MockedStatic<NeoSelectorService> selectorMock = mockStatic(NeoSelectorService.class)) {
        selectorMock.when(() -> NeoSelectorService.getListLabels("EMPTY-REF"))
            .thenReturn(new java.util.HashMap<>());

        JSONObject fieldObj = new JSONObject();
        invokeStatic("addButtonInfo",
            new Class<?>[]{ JSONObject.class, org.openbravo.model.ad.datamodel.Column.class },
            fieldObj, col);

        assertFalse(fieldObj.has("actionValues"));
      }
    }
```

- [ ] **Step 2: Run them and confirm they fail**

`./gradlew test --tests "com.etendoerp.go.mcp.McpSchemaFieldBuilderTest"`
Expected: `listBackedButtonEmitsSortedActionValuesAndParameter` fails with `JSONException: JSONObject["actionParameter"] not found`.

- [ ] **Step 3: Add the constants**

In `McpConstants.java`, next to the existing MCP key constants:

```java
  /** Key under which a list-backed button's chosen value travels in {@code neo_action}'s
   *  {@code parameters}. Consumed by {@code NeoProcessService.setDocAction}. */
  static final String PARAM_DOC_ACTION = "docAction";
  /** {@code neo_schema} key listing the discrete values a button accepts. */
  static final String KEY_ACTION_VALUES = "actionValues";
  /** {@code neo_schema} key naming the parameter the chosen value goes under. */
  static final String KEY_ACTION_PARAMETER = "actionParameter";
```

- [ ] **Step 4: Implement `addActionValues`**

In `McpSchemaFieldBuilder.java`, call it from `addButtonInfo` right after the `invokeVia` line:

```java
  private static void addButtonInfo(JSONObject fieldObj, Column col) throws JSONException {
    fieldObj.put("triggerValue", "Y");
    fieldObj.put("action", col.getDBColumnName());
    fieldObj.put("invokeVia", "neo_action");
    addActionValues(fieldObj, col);
```

and add the new method below `addButtonInfo`:

```java
  /**
   * Emit the discrete values a list-backed button accepts, plus the parameter name they
   * travel under (ETP-4285).
   *
   * <p>A button column whose {@code AD_Reference_Value_ID} points at a list reference (e.g.
   * {@code C_Order.DocAction} → "Order_Document Action") has a closed value set; without it
   * an agent can see the button but not know that {@code CO} books the document. Buttons with
   * no reference value (most process buttons — {@code Processing}, {@code CopyFrom}, …) are
   * left untouched.</p>
   *
   * <p>The emitted list is the full <em>active</em> AD list, which is intentionally broader
   * than what is legal for a given document in a given state: AD does not model the
   * state machine. Which value applies when is per-window judgement and is carried by the
   * field's {@code agentPrompt} (see {@code docs/decisions-reference.md}), not by this
   * generic layer.</p>
   *
   * <p>Sorted by value because {@link NeoSelectorService#getListLabels} returns an unordered
   * map — a stable schema is easier to diff, cache and assert on.</p>
   */
  private static void addActionValues(JSONObject fieldObj, Column col) throws JSONException {
    org.openbravo.model.ad.domain.Reference listRef = col.getReferenceSearchKey();
    if (listRef == null) {
      return;
    }
    Map<String, String> labels = NeoSelectorService.getListLabels((String) listRef.getId());
    if (labels == null || labels.isEmpty()) {
      return;
    }
    JSONArray values = new JSONArray();
    for (String value : new java.util.TreeSet<>(labels.keySet())) {
      JSONObject entry = new JSONObject();
      entry.put("value", value);
      entry.put("label", labels.get(value));
      values.put(entry);
    }
    fieldObj.put(McpConstants.KEY_ACTION_VALUES, values);
    fieldObj.put(McpConstants.KEY_ACTION_PARAMETER, McpConstants.PARAM_DOC_ACTION);
  }
```

Check the file's existing imports for `JSONArray`, `Map` and `NeoSelectorService` — `NeoSelectorService` is already referenced by `mapColumnType` (`NeoSelectorService.REF_OBUISEL`), so only `JSONArray`/`Map` may need adding.

- [ ] **Step 5: Run the tests and confirm they pass**

`./gradlew test --tests "com.etendoerp.go.mcp.McpSchemaFieldBuilderTest"` → PASS.

- [ ] **Step 6: Update the `neo_action` tool description**

In `ToolRegistry.buildActionTool` (line 582), replace the `parameters` prop and the description:

```java
    props.put(McpConstants.PARAM_PARAMETERS, objectProp(
        "Process parameters. For a list-backed button, put the chosen value under the key "
            + "named by the field's 'actionParameter' — e.g. {\"docAction\": \"CO\"}"));

    return new McpToolDefinition(
        "neo_action",
        "Fire a type:button action on a record and return the process result. "
            + "Call neo_schema first: each button field carries 'action' (the name to pass "
            + "here), and list-backed buttons also carry 'actionValues' (the values it "
            + "accepts, e.g. CO=Book / VO=Void / RE=Reactivate for documentAction) and "
            + "'actionParameter' (the key to put the chosen value under in 'parameters'). "
            + "Example — complete a draft sales order: {spec:'sales-order', entity:'header', "
            + "id:'<orderId>', action:'documentAction', parameters:{docAction:'CO'}}. "
            + "Which values are legal depends on the record's current state (e.g. "
            + "documentStatus): read the field's 'agentPrompt' for the document's workflow "
            + "rules, and neo_get the record first if unsure. "
            + "Returns {processResult: success|error|warning, processMessage: ...}.",
        buildObjectSchema(props,
            List.of("spec", McpConstants.PARAM_ENTITY, "id", "action")));
```

- [ ] **Step 7: Run the registry tests**

`./gradlew test --tests "com.etendoerp.go.mcp.ToolRegistryTest" --tests "com.etendoerp.go.mcp.ToolRegistryGenerateToolsTest"`
Expected: PASS. If a test asserts the literal old description, update the assertion to the new text — do not weaken it to a `contains("Fire a")`.

- [ ] **Step 8: Hand off for commit (human)**

Suggested message: `Feature ETP-4285: Expose button action values and contract in neo_schema`

---

## Task 3: Semantic prompts for the four document windows

**Goal of this task:** for `sales-order`, `purchase-order`, `sales-invoice` and `purchase-invoice`, the `documentAction` field returned by `neo_schema` carries a prompt that states what each value does, in which state it is legal, and what the preconditions are.

**Files:**
- Modify: `artifacts/sales-order/decisions.json`, `artifacts/purchase-order/decisions.json`, `artifacts/sales-invoice/decisions.json`, `artifacts/purchase-invoice/decisions.json` — key `entities.header.fields.documentAction.agentPrompt`
- Regenerated (never hand-edited): each window's `contract.json` and `generated/`

**Interfaces:**
- Consumes: the field-level `agentPrompt` pipeline — `resolve-curated.js` (field prop allow-list) → `push-to-neo.js:417` → `neo-writer.js:275` → `ETGO_SF_FIELD.AGENT_PROMPT` → `McpSchemaFieldBuilder.addAgentPrompt:327` → `neo_schema` field object
- Produces: no new interface. Pure config.

- [ ] **Step 1: Verify the real action values per window before writing any prose**

The prompts below assert specific values. Confirm them first — `C_Order` and `C_Invoice` use **different** references:

```bash
cd /Users/franciscoroig/Desktop/Workspaces/etendogo/etendo_core
PGPASSWORD=$(grep '^bbdd.password=' gradle.properties | cut -d= -f2) \
psql -h localhost -p $(grep '^bbdd.port=' gradle.properties | cut -d= -f2) \
     -U $(grep '^bbdd.user=' gradle.properties | cut -d= -f2) \
     -d $(grep '^bbdd.sid=' gradle.properties | cut -d= -f2) -Atc \
"SELECT t.tablename, l.value, l.name FROM ad_column c
   JOIN ad_table t ON t.ad_table_id = c.ad_table_id
   JOIN ad_ref_list l ON l.ad_reference_id = c.ad_reference_value_id
 WHERE c.columnname = 'DocAction' AND l.isactive = 'Y'
   AND t.tablename IN ('C_Order','C_Invoice')
 ORDER BY t.tablename, l.value;"
```

Known result for `C_Order` (2026-07-31): `--`, `AP`, `CL`, `CO`, `PO`, `PR`, `RA`, `RC`, `RE`, `RJ`, `VO`, `XL`. If a value named in a prompt below is missing from the output, drop it from the prompt rather than describing an action the instance does not have.

- [ ] **Step 2: Add the prompt to `sales-order`**

In `artifacts/sales-order/decisions.json`, replace the `documentAction` field entry:

```json
        "documentAction": {
          "visibility": "system",
          "displayLogic": null,
          "agentPrompt": "Document workflow action for this sales order. Fire it with neo_action, sending the chosen value as parameters.docAction (e.g. {\"docAction\":\"CO\"}). Legal transitions: from documentStatus=DR (Draft) use CO to book the order — this validates the lines, reserves stock and makes the order invoiceable and shippable; from DR use VO to void it. From documentStatus=CO (Booked) use RE to reactivate back to DR, or CL to close the remaining quantities. Preconditions for CO: the order must have at least one line, a business partner with a valid payment terms and price list, and an open period for the accounting date. Never send CO on an order that is already CO — read documentStatus with neo_get first. Booking recalculates the total-discount line automatically; do not create it by hand. The other values in actionValues (AP, PO, PR, RA, RC, RJ, XL) are inherited from the shared AD list and are not part of the sales-order flow."
        }
```

- [ ] **Step 3: Add the prompt to `purchase-order`**

Same key in `artifacts/purchase-order/decisions.json`:

```json
        "documentAction": {
          "visibility": "system",
          "displayLogic": null,
          "agentPrompt": "Document workflow action for this purchase order. Fire it with neo_action, sending the chosen value as parameters.docAction (e.g. {\"docAction\":\"CO\"}). Legal transitions: from documentStatus=DR (Draft) use CO to book the order — this makes it receivable and invoiceable; from DR use VO to void it. From documentStatus=CO (Booked) use RE to reactivate back to DR, or CL to close the pending quantities. Preconditions for CO: at least one line, a vendor with valid payment terms and a purchase price list, and an open period for the accounting date. Check documentStatus with neo_get before acting — CO on an already-booked order is an error. Booking recalculates the total-discount line automatically. The remaining values in actionValues (AP, PO, PR, RA, RC, RJ, XL) come from the shared AD list and are not part of the purchase-order flow."
        }
```

- [ ] **Step 4: Add the prompt to `sales-invoice`**

Same key in `artifacts/sales-invoice/decisions.json` (note this entry currently has only `visibility`):

```json
        "documentAction": {
          "visibility": "system",
          "agentPrompt": "Document workflow action for this sales invoice. Fire it with neo_action, sending the chosen value as parameters.docAction (e.g. {\"docAction\":\"CO\"}). Legal transitions: from documentStatus=DR (Draft) use CO to complete the invoice — this assigns the final document number, computes taxes and totals, and creates the payment plan; from DR use VO to void it. From documentStatus=CO (Completed) use RE to reactivate back to DR only while the invoice has no payments and is not posted. Preconditions for CO: at least one line, a customer with valid payment terms, and an open period for the accounting date. Completing does not post to the ledger — 'posted' is a separate accounting step. Read documentStatus and posted with neo_get before acting."
        }
```

- [ ] **Step 5: Add the prompt to `purchase-invoice`**

Same key in `artifacts/purchase-invoice/decisions.json` (keep its existing `form` and `displayLogic` keys):

```json
        "documentAction": {
          "visibility": "system",
          "form": false,
          "displayLogic": null,
          "agentPrompt": "Document workflow action for this purchase invoice. Fire it with neo_action, sending the chosen value as parameters.docAction (e.g. {\"docAction\":\"CO\"}). Legal transitions: from documentStatus=DR (Draft) use CO to complete the invoice — this computes taxes and totals and creates the payment plan; from DR use VO to void it. From documentStatus=CO (Completed) use RE to reactivate back to DR only while the invoice has no payments and is not posted. Preconditions for CO: at least one line, a vendor with valid payment terms, and an open period for the accounting date. Completing does not post to the ledger — 'posted' is a separate accounting step. Read documentStatus and posted with neo_get before acting."
        }
```

- [ ] **Step 6: Regenerate the four windows**

```bash
cd /Users/franciscoroig/Desktop/Workspaces/etendogo/etendo_core/schema_forge
make regen ONLY=sales-order,purchase-order,sales-invoice,purchase-invoice SKIP_EXTRACT=1
```

`SKIP_EXTRACT=1` reuses the existing `schema-raw.json` — this change touches no AD metadata, so there is nothing new to extract.

- [ ] **Step 7: Verify contract integrity for all four**

Run the Window Change Integrity Protocol check from `CLAUDE.md` Step 3 for each window and confirm **no editable header field flipped to `readOnly: False`**:

```bash
for w in sales-order purchase-order sales-invoice purchase-invoice; do
  echo "=== $w ==="
  python3 -c "
import json
with open('artifacts/$w/contract.json') as f: d = json.load(f)
h = d['frontendContract']['entities']['header']
print('draftMode:', bool(h.get('draftMode',{}).get('enabled')))
for fld in h['fields']:
    if fld.get('form',True) and fld.get('visibility') not in ('discarded','system','readOnly'):
        print(' ', fld['name'], '— readOnly:', bool(fld.get('readOnlyLogic')))
"
done
```

- [ ] **Step 8: Confirm the diff is prompt-only**

`git -C /Users/franciscoroig/Desktop/Workspaces/etendogo/etendo_core/schema_forge diff --stat`
Expected: the four `decisions.json` files plus their regenerated `contract.json`. **If any file under `generated/` changed, stop and investigate** — an `agentPrompt` is MCP-only metadata and must not alter the emitted React code.

- [ ] **Step 9: Run the pipeline validator**

```bash
npx sf-validate-pipeline --scope=sales-order
npx sf-validate-pipeline --scope=purchase-order
npx sf-validate-pipeline --scope=sales-invoice
npx sf-validate-pipeline --scope=purchase-invoice
```

Expected: 0 violations each.

- [ ] **Step 10: Push the config to NEO and export (human)**

```bash
make regen ONLY=sales-order,purchase-order,sales-invoice,purchase-invoice SKIP_EXTRACT=1 PUSH_TO_NEO=1
# then, in Etendo root:
./gradlew export.database
```

Without `export.database` the prompts live only in the local DB and are lost on the next rebuild. Expect `sourcedata/ETGO_SF_FIELD.xml` to gain `AGENT_PROMPT` values for the four `DocAction` rows — that XML delta is part of the deliverable.

- [ ] **Step 11: Hand off for commit (human)**

Two repos, two commits:
- `etendo_schema_forge`: `Feature ETP-4285: Add document action prompts to the 4 document windows`
- `com.etendoerp.go` (the `export.database` output): `Feature ETP-4285: Export document action agent prompts`

---

## Task 4: Documentation

**Goal of this task:** the new contract is documented where the next person (and the validation bot) will look, and the gap analysis reflects what actually closed.

**Files:**
- Modify: `docs/plans/etendo-go-mcp-gap-analysis.md` (G6/G9 rows and §3.2 detail)
- Modify: `docs/agentic-validation/mcp-ticket-knowledge.md`
- Modify: `docs/agentic-validation/mcp-field-flags-pipeline.md`
- Modify: `docs/generated-custom-windows/{sales-order,purchase-order,sales-invoice,purchase-invoice}.md`

- [ ] **Step 1: Update the gap analysis**

In the §3.1 table, change the G6 row's **Estado MCP** cell from `⚠️ funcional sin descripción semántica` to:

```
⚠️ parcial — ETP-4285 cerró las acciones de documento (actionValues + agentPrompt + hooks); los procesos standalone (CreateDraftInvoice, CreateShipment, RegisterPayment) siguen sin descripción semántica
```

In §3.2, append to the **G6** paragraph:

```
*Update 2026-07-31 (ETP-4285): las acciones de documento quedaron cubiertas sin necesidad de `describeForAgent()`. `neo_schema` emite ahora `actionValues` (lista AD activa del botón) y `actionParameter` (`docAction`), y la semántica por ventana vive en `decisions.json → entities.header.fields.documentAction.agentPrompt`, que ya viajaba a `ETGO_SF_FIELD.AGENT_PROMPT`. Además se corrigió que `neo_action` no ejecutaba los hooks `NeoHandler` (sí lo hace el path REST), con lo cual completar un documento por MCP divergía del comportamiento de la UI. `describeForAgent()` sigue siendo la vía si en el futuro hace falta calcular precondiciones con el estado del registro.*
```

- [ ] **Step 2: Update the ticket knowledge base**

In `docs/agentic-validation/mcp-ticket-knowledge.md`, in the **code-bug (MCP/NEO Java)** list, replace the `ETP-4285 (document actions not semantically exposed)` entry with:

```
ETP-4285 (document actions: were invocable via `neo_action` + `parameters.docAction` but undiscoverable — `neo_schema` now emits `actionValues`/`actionParameter`, per-window semantics live in `decisions.json` `fields.documentAction.agentPrompt`; ALSO fixed a real defect found while scoping: `neo_action` was calling `executeButtonActionCore` without the `NeoHandler` pre/post hooks the REST path runs, so MCP completions skipped handler logic such as the pre-CO total-discount line)
```

- [ ] **Step 3: Document the new field keys in the flags pipeline doc**

In `docs/agentic-validation/mcp-field-flags-pipeline.md`, add to the field-level table:

```
| **`actionValues`** / **`actionParameter`** (buttons only, derived — not config) | **table** | none — read live from `AD_Reference_Value` via `NeoSelectorService.getListLabels` | Not settable in `decisions.json`; emitted by `McpSchemaFieldBuilder.addActionValues` for any button whose AD column has a list reference value (ETP-4285) |
```

- [ ] **Step 4: Add an MCP note to each of the four window guides**

Append this section to `docs/generated-custom-windows/sales-order.md` (and the equivalent, with the window's own values, to the other three):

```markdown
## MCP document actions (agents)

The header's `documentAction` button is what an AI agent uses to move the document through
its workflow over MCP. `neo_schema` returns it with `invokeVia: "neo_action"`,
`actionValues` (the active AD list for the column) and `actionParameter: "docAction"`;
its `agentPrompt` — defined in `decisions.json` → `entities.header.fields.documentAction.agentPrompt`
— states which transitions are legal and their preconditions.

Booking a draft order over MCP:

    neo_action { spec: "sales-order", entity: "header", id: "<orderId>",
                 action: "documentAction", parameters: { docAction: "CO" } }

This runs `SalesOrderHeaderHandler` exactly as the UI does (including the pre-CO
total-discount line), because `neo_action` executes the entity's `NeoHandler` hooks
(ETP-4285). If you change the workflow rules of this window, update the `agentPrompt`
in the same change — it is the only thing telling the agent what is legal.
```

- [ ] **Step 5: Hand off for commit (human)**

Suggested message: `Feature ETP-4285: Document MCP document-action contract and prompts`

---

## Task 5: End-to-end evidence and integration test (the acceptance criteria)

**Goal of this task:** produce the evidence the ticket demands — an agent discovers the action, knows its preconditions, and completes a draft sales order DR → CO over MCP — plus an automated test of that path.

**Files:**
- Create: `docs/agentic-validation/etp-4285-document-action-evidence.md`
- Create or extend: `src-test/src/com/etendoerp/go/mcp/NeoActionMcpIntegrationTest.java` (mirror the existing `NeoWidgetMcpIntegrationTest.java` — it is the in-repo precedent for an MCP-level integration test)

**Prerequisite:** Tasks 1–3 deployed to the local instance. The human compiles and deploys (`smartbuild` / `update.database` as their environment requires) — agents do not.

- [ ] **Step 1: Capture the discovery half**

Following `docs/agentic-validation/mcp-client-setup.md`, call:

```
neo_schema { spec: "sales-order", entity: "header" }
```

Save the raw `documentAction` field object. It must contain `invokeVia`, `action`, `actionValues` (with `CO`/`Book`), `actionParameter: "docAction"`, and the `agentPrompt` from Task 3. If `agentPrompt` is absent, `export.database` or the push did not land — go back to Task 3 Step 10.

- [ ] **Step 2: Capture the execution half**

Create a draft sales order (`neo_create` on `sales-order.header` + one `lines` row, or reuse an existing DR order found via `neo_list`), then:

```
neo_get    { spec: "sales-order", entity: "header", id: "<orderId>" }   → documentStatus must be "DR"
neo_action { spec: "sales-order", entity: "header", id: "<orderId>",
             action: "documentAction", parameters: { docAction: "CO" } }
neo_get    { spec: "sales-order", entity: "header", id: "<orderId>" }   → documentStatus must be "CO"
```

- [ ] **Step 3: Prove the hook actually ran**

This is the part that distinguishes a real pass from the false green. On an order whose business partner has a total-discount percentage configured, after the `CO` above:

```
neo_list { spec: "sales-order", entity: "lines", filters: { salesOrder: "<orderId>" } }
```

The total-discount line must be present. Compare against the same flow completed from the UI on a second order — the line sets must match. Record both.

- [ ] **Step 4: Write the evidence document**

Create `docs/agentic-validation/etp-4285-document-action-evidence.md` with: date, instance/branch, the `neo_schema` `documentAction` object verbatim, the three-call DR→CO transcript with real IDs, the line comparison from Step 3, and an explicit statement of anything that could not be verified. Follow the tone of the existing files in that directory — factual, raw tool output, no summarizing away failures.

- [ ] **Step 5: Specify the automated test (delegate to Tester)**

Dispatch the `test-generator` agent (Tester) with this specification, having it read `NeoWidgetMcpIntegrationTest.java` first for the harness pattern:

- `neo_action` on a header entity whose `Java_Qualifier` resolves to a handler → assert the handler's `handle` ran before `executeButtonActionCore` (spy/order verification) and its `afterHandle` ran after.
- `neo_action` with `parameters:{docAction:"CO"}` on a DR order → asserts `documentStatus` is `CO` afterwards and the response carries `processResult:"success"`.
- Pre-hook returning a `NeoResponse` error → asserts the process is not fired and `documentStatus` stays `DR`.

If the OBBaseTest-style integration harness cannot load the Hibernate model in this environment (a known local issue recorded in `docs/plans/2026-07-23-plataforma-backlog-sweep.md`), say so explicitly in the delivery and keep the unit-level coverage from Tasks 1–2 as the automated evidence — do not report an integration test as passing if it never ran.

- [ ] **Step 6: Hand off for commit (human)**

Suggested message: `Feature ETP-4285: Add MCP document action evidence and integration test`

---

## Self-review against the ticket

| Ticket requirement | Where it is covered |
|---|---|
| DEV spike: are document actions already invocable via existing process tools? | Answered in **Verified starting state** — yes, via `neo_action` + `parameters.docAction`; a dedicated per-record path is *not* needed, but the existing one was missing hook parity (Task 1) |
| Actions discoverable with semantic descriptions (`whenToUse`, `preconditions`) | Task 2 (generic `actionValues`/`actionParameter` + tool description) and Task 3 (`agentPrompt` carrying when-to-use and preconditions) |
| Leverage `describeForAgent()` "if applicable" | Explicitly evaluated and **not** used — rationale recorded in Task 4 Step 1. The generic+config route covers document actions with no new extension point |
| Agent completes a draft sales order DR → CO, evidence captured | Task 5 Steps 1–4 |
| Automated test of the end-to-end path (delegate to Tester) | Task 5 Step 5, plus unit coverage in Tasks 1–2 |
| Repo: `com.etendoerp.go` | Tasks 1–2 there; Tasks 3–5 additionally touch `etendo_schema_forge` because that is where window config and docs live |

**Known scope boundary:** G6's *standalone* process handlers (`CreateDraftInvoiceHandler`, `CreateShipmentHandler`, `RegisterPaymentHandler`) still have no semantic layer — they are process specs, not button actions, and are out of scope here. Task 4 Step 1 records that so the gap analysis does not read as fully closed.
