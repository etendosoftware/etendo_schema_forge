# Configurable Agent Prompt for `neo_discover` / `neo_schema` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable `agentPrompt` text at spec and field level that flows from `decisions.json` → DB → MCP responses (`neo_discover` for specs, `neo_schema` for fields).

**Architecture:** Two new nullable DB columns (`ETGO_SF_SPEC.AGENT_PROMPT` CLOB, `ETGO_SF_FIELD.AGENT_PROMPT` VARCHAR 2000). The Java MCP layer reads them via the generated DAL getters and adds an `agentPrompt` key to its JSON when non-empty. The Schema Forge CLI writes them via the existing direct-SQL path (`neo-writer.js`), sourcing values from `decisions.json` exactly like the existing `defaultExpr` flow. Webhooks (`SFUpsertSpec`/`SFUpsertField`) gain a matching optional param for runtime parity.

**Tech Stack:** Java (Etendo DAL, Weld CDI, JUnit 5), Etendo AD model XML + sourcedata, Node.js 22 ESM (`node:test`), PostgreSQL.

**Repos (both on branch `feature/ETP-4252`, branched from `epic/ETP-3504`):**
- `com.etendoerp.go` at `etendo_core/modules/com.etendoerp.go/` — DB, DAL, Java MCP, webhooks.
- `schema-forge` (repo root) — CLI, contract, docs.

**Jira:** ETP-4252 (under epic ETP-3504). Commit prefix: `Feature ETP-4252: ...` (first line ≤ 80 chars, no `Co-Authored-By`).

**Naming (locked):** JSON key `agentPrompt` · DB column `AGENT_PROMPT` · webhook param `AgentPrompt`.

---

## File Structure

**`com.etendoerp.go`**
- Modify: `src-db/database/model/tables/ETGO_SF_SPEC.xml` — add `AGENT_PROMPT` column.
- Modify: `src-db/database/model/tables/ETGO_SF_FIELD.xml` — add `AGENT_PROMPT` column.
- Modify: `src-db/database/sourcedata/AD_COLUMN.xml` (module sourcedata) — add two `AD_Column` records.
- Generated (after `generate.entities`): `SFSpec.getAgentPrompt()`, `SFField.getAgentPrompt()` + `PROPERTY_AGENTPROMPT`.
- Modify: `src/com/etendoerp/go/mcp/McpToolRouterSupport.java` — `buildDiscoverSpec`, field summary, prompt-by-column map.
- Modify: `src/com/etendoerp/go/schemaforge/webhooks/SFUpsertSpec.java` — accept `AgentPrompt`.
- Modify: `src/com/etendoerp/go/schemaforge/webhooks/SFUpsertField.java` — accept `AgentPrompt`.
- Tests: `src-test/src/com/etendoerp/go/mcp/McpToolRouterSupportTest.java`, `.../webhooks/SFUpsertEntityTest.java` (spec/field webhook tests live alongside).

**`schema-forge`**
- Modify: `cli/src/neo-writer.js` — `upsertSpec` + `upsertField` persist `agentPrompt`.
- Modify: `cli/src/push-to-neo.js` — thread spec `agentPrompt` + build per-field prompt map from decisions.
- Modify: `cli/src/generate-contract.js` — surface `agentPrompt` in `agentProfile` (contract.mcp.json).
- Tests: `cli/test/neo-writer.test.js`, `cli/test/push-to-neo.test.js`, `cli/test/generate-contract.test.js`.
- Docs: `docs/neo-headless.md` (and module `docs/neo-headless.md`), `docs/decisions-reference.md`, `docs/ui-customization.md`.

---

## PHASE A — Database & DAL (`com.etendoerp.go`)

> AD column additions are metadata, not TDD-able. Each task ends with a verification step instead of a unit test. **Never hand-type UUIDs — use `make uuid`.**

### Task A1: Add `AGENT_PROMPT` column to `ETGO_SF_SPEC`

**Files:**
- Modify: `etendo_core/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_SF_SPEC.xml`

- [ ] **Step 1: Add the column to the table model**

Insert directly after the existing `DESCRIPTION` column block (which reads
`type="CLOB" size="4000"`):

```xml
      <column name="AGENT_PROMPT" primaryKey="false" required="false" type="CLOB" size="4000" autoIncrement="false">
        <default/>
        <onCreateDefault/>
      </column>
```

- [ ] **Step 2: Verify the XML is well-formed**

Run: `xmllint --noout etendo_core/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_SF_SPEC.xml`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
cd etendo_core/modules/com.etendoerp.go
git add src-db/database/model/tables/ETGO_SF_SPEC.xml
git commit -m "Feature ETP-4252: Add AGENT_PROMPT column to ETGO_SF_SPEC"
```

### Task A2: Add `AGENT_PROMPT` column to `ETGO_SF_FIELD`

**Files:**
- Modify: `etendo_core/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_SF_FIELD.xml`

- [ ] **Step 1: Add the column** after the existing `DEFAULTVALUE` column block
(which reads `type="VARCHAR" size="2000"`):

```xml
      <column name="AGENT_PROMPT" primaryKey="false" required="false" type="VARCHAR" size="2000" autoIncrement="false">
        <default/>
        <onCreateDefault/>
      </column>
```

- [ ] **Step 2: Verify**

Run: `xmllint --noout etendo_core/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_SF_FIELD.xml`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd etendo_core/modules/com.etendoerp.go
git add src-db/database/model/tables/ETGO_SF_FIELD.xml
git commit -m "Feature ETP-4252: Add AGENT_PROMPT column to ETGO_SF_FIELD"
```

### Task A3: Register AD_Column metadata so DAL generates the property

**Files:**
- Modify: module `src-db/database/sourcedata/AD_COLUMN.xml` (the file containing existing `ETGO_SF_SPEC` / `ETGO_SF_FIELD` column records — confirm path with `grep -rl "ETGO_SF_SPEC" etendo_core/modules/com.etendoerp.go/src-db/database/sourcedata/`).

- [ ] **Step 1: Generate two fresh UUIDs**

Run (from schema-forge root, once per column):
```bash
make uuid    # → AD_Column_ID for ETGO_SF_SPEC.AGENT_PROMPT
make uuid    # → AD_Column_ID for ETGO_SF_FIELD.AGENT_PROMPT
```
Record both values; they are the only accepted source of new IDs.

- [ ] **Step 2: Add an `AD_COLUMN` record for each new column**

Copy the existing `DESCRIPTION` (for SPEC, reference id `14`/text or `19` per existing rows) and `DEFAULTVALUE` (for FIELD) records in `AD_COLUMN.xml`, then change: `AD_COLUMN_ID` (the generated UUIDs), `COLUMNNAME` = `Agent_Prompt`, `NAME` = `Agent Prompt`, `AD_TABLE_ID` (same as the sibling row), `AD_REFERENCE_ID` (match the sibling — CLOB→`14`/text for SPEC, String→`10` for FIELD), `FIELDLENGTH` (4000 / 2000), `ISMANDATORY` = `N`. Keep `AD_MODULE_ID` identical to the sibling rows.

- [ ] **Step 3: Regenerate DAL entities**

Run from Etendo root: `./gradlew generate.entities`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Verify the generated getters exist**

Run:
```bash
grep -rn "getAgentPrompt\|PROPERTY_AGENTPROMPT" $(find . -path '*schemaforge/data/SFSpec.java' -o -path '*schemaforge/data/SFField.java')
```
Expected: `getAgentPrompt()` and `PROPERTY_AGENTPROMPT` present in both `SFSpec` and `SFField`.

- [ ] **Step 5: Commit**

```bash
cd etendo_core/modules/com.etendoerp.go
git add src-db/database/sourcedata/AD_COLUMN.xml
git commit -m "Feature ETP-4252: Register AGENT_PROMPT AD_Column metadata"
```

---

## PHASE B — Java MCP layer (`com.etendoerp.go`)

> Standard TDD. Test runner: `./gradlew test --tests <ClassName>` from Etendo root, or the module's configured JUnit task. The DAL getters from Phase A must exist first.

### Task B1: `buildDiscoverSpec` returns `agentPrompt` when present

**Files:**
- Modify: `src/com/etendoerp/go/mcp/McpToolRouterSupport.java:185-200` (`buildDiscoverSpec`)
- Test: `src-test/src/com/etendoerp/go/mcp/McpToolRouterSupportTest.java` (class `BuildDiscoverSpec`, ~line 315)

- [ ] **Step 1: Write the failing test** in `BuildDiscoverSpec`:

```java
@Test
@DisplayName("includes agentPrompt when spec has one")
void includesAgentPrompt() throws Exception {
  SFSpec spec = mock(SFSpec.class);
  when(spec.getName()).thenReturn("purchase-order");
  when(spec.getDescription()).thenReturn(null);
  when(spec.getAgentPrompt()).thenReturn("Always confirm before completing the order.");
  JSONObject result = McpToolRouterSupport.buildDiscoverSpec(spec, "W", null);
  assertEquals("Always confirm before completing the order.", result.getString("agentPrompt"));
}

@Test
@DisplayName("omits agentPrompt when null or blank")
void omitsAgentPromptWhenBlank() throws Exception {
  SFSpec spec = mock(SFSpec.class);
  when(spec.getName()).thenReturn("purchase-order");
  when(spec.getDescription()).thenReturn(null);
  when(spec.getAgentPrompt()).thenReturn("   ");
  JSONObject result = McpToolRouterSupport.buildDiscoverSpec(spec, "W", null);
  assertFalse(result.has("agentPrompt"));
}
```

- [ ] **Step 2: Run, verify it fails** (compile error: `getAgentPrompt` used / assertion fails)

Run: `./gradlew test --tests '*McpToolRouterSupportTest*'`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `buildDiscoverSpec`, after the `description` block (line ~192) add:

```java
    String agentPrompt = spec.getAgentPrompt();
    if (agentPrompt != null && !agentPrompt.trim().isEmpty()) {
      specObj.put("agentPrompt", agentPrompt);
    }
```

- [ ] **Step 4: Run, verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd etendo_core/modules/com.etendoerp.go
git add src/com/etendoerp/go/mcp/McpToolRouterSupport.java src-test/src/com/etendoerp/go/mcp/McpToolRouterSupportTest.java
git commit -m "Feature ETP-4252: Return agentPrompt in neo_discover spec object"
```

### Task B2: Field summary returns per-field `agentPrompt`

**Files:**
- Modify: `src/com/etendoerp/go/mcp/McpToolRouterSupport.java` — `buildFieldObj` (line ~260) and add a `loadPromptByColumnId(SFEntity)` helper mirroring `loadVisibilityByColumnId` (line ~224); thread the prompt map through the field-array builder (`buildSchemaFieldsArray`, line ~239) the same way `visibilityByColumnId` is threaded.
- Test: `McpToolRouterSupportTest.java`

- [ ] **Step 1: Write the failing test** — assert that a field whose `SFField.getAgentPrompt()` returns a value produces `fieldObj.getString("agentPrompt")` equal to it, and that a blank/null prompt produces no `agentPrompt` key. Mirror the structure of the existing `addVisibility` tests (search `addVisibility` in the test file for the established mocking pattern of `Column`/`SFField`).

- [ ] **Step 2: Run, verify it fails.** Run: `./gradlew test --tests '*McpToolRouterSupportTest*'` → FAIL.

- [ ] **Step 3: Implement.**

(a) Add helper after `loadVisibilityByColumnId` (line ~237):

```java
  static Map<String, String> loadPromptByColumnId(SFEntity sfEntity) {
    Map<String, String> promptByColumnId = new HashMap<>();
    OBCriteria<SFField> fieldCrit = OBDal.getInstance().createCriteria(SFField.class);
    fieldCrit.add(Restrictions.eq(SFField.PROPERTY_ETGOSFENTITY + ".id", sfEntity.getId()));
    fieldCrit.add(Restrictions.eq(SFField.PROPERTY_ISACTIVE, true));
    for (SFField sfField : fieldCrit.list()) {
      Column adCol = sfField.getADColumn();
      String prompt = sfField.getAgentPrompt();
      if (adCol != null && prompt != null && !prompt.trim().isEmpty()) {
        promptByColumnId.put((String) adCol.getId(), prompt.trim());
      }
    }
    return promptByColumnId;
  }
```

(b) In the field-array builder, build the prompt map once per entity and pass `promptByColumnId.get((String) col.getId())` into `buildFieldObj` (add a `String agentPrompt` parameter to `buildFieldObj` alongside the existing `visibility` argument).

(c) In `buildFieldObj`, after `addVisibility(...)` (line ~268) add:

```java
    if (agentPrompt != null && !agentPrompt.trim().isEmpty()) {
      fieldObj.put("agentPrompt", agentPrompt);
    }
```

- [ ] **Step 4: Run, verify it passes.** Expected: PASS. Also re-run the full MCP suite: `./gradlew test --tests '*mcp*'`.

- [ ] **Step 5: Commit**

```bash
git add src/com/etendoerp/go/mcp/McpToolRouterSupport.java src-test/src/com/etendoerp/go/mcp/McpToolRouterSupportTest.java
git commit -m "Feature ETP-4252: Return per-field agentPrompt in neo_schema"
```

### Task B3: `SFUpsertSpec` accepts optional `AgentPrompt`

**Files:**
- Modify: `src/com/etendoerp/go/schemaforge/webhooks/SFUpsertSpec.java` (param read ~line 75; setter ~line 124)
- Test: spec webhook test (create/extend `SFUpsertSpecTest` alongside `SFUpsertEntityTest`)

- [ ] **Step 1: Write the failing test** — call the webhook `get(params, vars)` with `params` containing `Name`, `ModuleID`, `WindowID`, and `AgentPrompt="do X"`; assert the persisted `SFSpec.getAgentPrompt()` equals `"do X"`. Follow the existing webhook test harness in `SFUpsertEntityTest`.

- [ ] **Step 2: Run, verify it fails.** → FAIL.

- [ ] **Step 3: Implement.** Read the param near the `Description` read (line ~75):

```java
      String agentPrompt = parameter.get("AgentPrompt");
```

and after the description set block (line ~124-126):

```java
      if (agentPrompt != null) {
        spec.setAgentPrompt(agentPrompt.isEmpty() ? null : agentPrompt);
      }
```

- [ ] **Step 4: Run, verify it passes.** Update the Javadoc "Optional params" list (line ~46) to include `AgentPrompt`.

- [ ] **Step 5: Commit**

```bash
git add src/com/etendoerp/go/schemaforge/webhooks/SFUpsertSpec.java src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUpsertSpecTest.java
git commit -m "Feature ETP-4252: SFUpsertSpec accepts AgentPrompt param"
```

### Task B4: `SFUpsertField` accepts optional `AgentPrompt`

**Files:**
- Modify: `src/com/etendoerp/go/schemaforge/webhooks/SFUpsertField.java` (param block ~line 101-114)
- Test: `SFUpsertFieldTest` (alongside existing webhook tests)

- [ ] **Step 1: Write the failing test** — call `get` with `EntityID`, `ColumnID`, `ModuleID`, `AgentPrompt="hint"`; assert `SFField.getAgentPrompt()` equals `"hint"`.

- [ ] **Step 2: Run, verify it fails.** → FAIL.

- [ ] **Step 3: Implement** — mirror the existing `DefaultValue` handling (line ~107):

```java
      if (parameter.containsKey("AgentPrompt")) {
        String p = parameter.get("AgentPrompt");
        field.setAgentPrompt(p == null || p.isEmpty() ? null : p);
      }
```

Update the "Optional params" Javadoc (line ~40) to include `AgentPrompt`.

- [ ] **Step 4: Run, verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add src/com/etendoerp/go/schemaforge/webhooks/SFUpsertField.java src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUpsertFieldTest.java
git commit -m "Feature ETP-4252: SFUpsertField accepts AgentPrompt param"
```

---

## PHASE C — Schema Forge CLI (`schema-forge`)

> Test runner: `node --test cli/test/<file>.test.js`. The CLI writes via direct SQL (`neo-writer.js`), so tests use the existing in-memory/mock `client` pattern already present in `cli/test/neo-writer.test.js`.

### Task C1: `neo-writer.upsertSpec` persists `agentPrompt`

**Files:**
- Modify: `cli/src/neo-writer.js:70-121` (`upsertSpec`)
- Test: `cli/test/neo-writer.test.js`

- [ ] **Step 1: Write the failing test** — using the file's existing fake `client` that records `query(sql, values)` calls, call `upsertSpec(client, { name, moduleId, windowId, agentPrompt: 'PROMPT' })` and assert the INSERT `values` array contains `'PROMPT'` and the SQL column list contains `agent_prompt`. Add a parallel assertion for the UPDATE branch (`specId` provided).

- [ ] **Step 2: Run, verify it fails.** Run: `node --test cli/test/neo-writer.test.js` → FAIL.

- [ ] **Step 3: Implement.** Add `agentPrompt = null` to the destructured params (line ~79). In the UPDATE query (line ~98) add `agent_prompt = $N` to the SET list and `agentPrompt` to the values (renumber the trailing `updated`/`updatedby`/`WHERE` placeholders). In the INSERT (line ~111) add `agent_prompt` to the column list and `agentPrompt` to the `VALUES`/params array (placed consistently with `description`).

- [ ] **Step 4: Run, verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/neo-writer.js cli/test/neo-writer.test.js
git commit -m "Feature ETP-4252: neo-writer upsertSpec persists agentPrompt"
```

### Task C2: `neo-writer.upsertField` persists `agentPrompt`

**Files:**
- Modify: `cli/src/neo-writer.js:234-293` (`upsertField`)
- Test: `cli/test/neo-writer.test.js`

- [ ] **Step 1: Write the failing test** — call `upsertField(client, { entityId, moduleId, fieldId: 'F1', agentPrompt: 'HINT' })` and assert the UPDATE SET contains `agent_prompt` and values contain `'HINT'`. Add a test that omitting `agentPrompt` leaves `agent_prompt` out of the SET clause (partial-update contract).

- [ ] **Step 2: Run, verify it fails.** → FAIL.

- [ ] **Step 3: Implement.** In the UPDATE branch, after the `defaultValue` block (line ~263-266) add:

```javascript
    if ('agentPrompt' in params) {
      setClauses.push(`agent_prompt = $${paramIndex++}`);
      values.push(params.agentPrompt ?? null);
    }
```

In the INSERT branch, add `const agentPrompt = params.agentPrompt ?? null;` (near line ~290) and include `agent_prompt` in the INSERT column list + `agentPrompt` in the params array.

- [ ] **Step 4: Run, verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add cli/src/neo-writer.js cli/test/neo-writer.test.js
git commit -m "Feature ETP-4252: neo-writer upsertField persists agentPrompt"
```

### Task C3: `push-to-neo` threads spec + per-field `agentPrompt` from decisions

**Files:**
- Modify: `cli/src/push-to-neo.js` — `buildContext` (~line 258), `stepUpsertSpec` (~line 413), `upsertSingleField` (~line 551), and add `buildFieldAgentPromptMap(decisionsData)` next to `buildFieldDefaultExprMap` (~line 310).
- Test: `cli/test/push-to-neo.test.js`

- [ ] **Step 1: Write the failing test** — feed a fake `decisionsData` with `window.agentPrompt = 'SPEC PROMPT'` and `entities.<E>.fields.<F>.agentPrompt = 'FIELD PROMPT'`; assert `buildFieldAgentPromptMap` returns `{ 'E.F': 'FIELD PROMPT' }`, and (via the dry-run plan or a mocked writer) that the spec upsert receives `agentPrompt: 'SPEC PROMPT'` and the matching field upsert receives `agentPrompt: 'FIELD PROMPT'`.

- [ ] **Step 2: Run, verify it fails.** Run: `node --test cli/test/push-to-neo.test.js` → FAIL.

- [ ] **Step 3: Implement.**

(a) Add the map builder mirroring `buildFieldDefaultExprMap` (line ~310-322):

```javascript
function buildFieldAgentPromptMap(decisionsData) {
  const map = {};
  for (const [entityName, entityConf] of Object.entries(decisionsData?.entities || {})) {
    for (const [fieldName, fieldConf] of Object.entries(entityConf.fields || {})) {
      if (fieldConf.agentPrompt) {
        map[`${entityName}.${fieldName}`] = fieldConf.agentPrompt;
      }
    }
  }
  return map;
}
```

(b) In `buildContext` add to the returned ctx (line ~268): `fieldAgentPrompts: buildFieldAgentPromptMap(decisionsData)` and `specAgentPrompt: decisionsData?.window?.agentPrompt ?? null`.

(c) In `stepUpsertSpec` (line ~420) pass `agentPrompt: ctx.specAgentPrompt` to `writerUpsertSpec`.

(d) In `upsertSingleField` (after the defaultExpr block, line ~577-580) add:

```javascript
  const promptKey = `${f.entityName}.${f.fieldName}`;
  if (promptKey in ctx.fieldAgentPrompts) {
    fieldParams.agentPrompt = ctx.fieldAgentPrompts[promptKey] || null;
  }
```

- [ ] **Step 4: Run, verify it passes.** Also run the process/report push paths' tests if present (`grep -n "specType" cli/test/push-to-neo.test.js`).

- [ ] **Step 5: Commit**

```bash
git add cli/src/push-to-neo.js cli/test/push-to-neo.test.js
git commit -m "Feature ETP-4252: push-to-neo sends agentPrompt for spec and fields"
```

### Task C4: Surface `agentPrompt` in the MCP contract (`agentProfile`)

**Files:**
- Modify: `cli/src/generate-contract.js` — `generateAgentProfile` (~line 1323) and per-field contract object (~line 273 / 436).
- Test: `cli/test/generate-contract.test.js`

- [ ] **Step 1: Write the failing test** — build a contract from a schema whose `window.agentPrompt` and a field's `agentPrompt` are set; assert `contract.agentProfile.agentPrompt === 'SPEC PROMPT'` and the field entry under `agentProfile` (or the field contract object) carries `agentPrompt`.

- [ ] **Step 2: Run, verify it fails.** Run: `node --test cli/test/generate-contract.test.js` → FAIL.

- [ ] **Step 3: Implement** — in `generateAgentProfile`, copy `schema.window?.agentPrompt` to `profile.agentPrompt` when set; when emitting per-field agent metadata, copy the field's `agentPrompt`. This is for human/agent inspection of `contract.mcp.json`; it does not replace the decisions-sourced push path from Task C3.

- [ ] **Step 4: Run, verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add cli/src/generate-contract.js cli/test/generate-contract.test.js
git commit -m "Feature ETP-4252: Surface agentPrompt in agentProfile/contract.mcp.json"
```

### Task C5: Regenerate a sample window and verify end-to-end contract

**Files:** none modified — verification only, using an existing worked window (pick one from `artifacts/` that has `decisions.json`).

- [ ] **Step 1:** Add `"agentPrompt": "TEST SPEC PROMPT"` under `window` in the chosen `artifacts/<name>/decisions.json`, and `"agentPrompt": "TEST FIELD"` to one field's decision object.
- [ ] **Step 2:** Run `make regen ONLY=<name> SKIP_EXTRACT=1`. Expected: success, no validator errors.
- [ ] **Step 3:** Verify `artifacts/<name>/contract.mcp.json` contains both prompts (`grep -c agentPrompt artifacts/<name>/contract.mcp.json` ≥ 2).
- [ ] **Step 4:** Revert the test edits to `decisions.json` (`git checkout artifacts/<name>/decisions.json`). Do not commit the sample edits.

---

## PHASE D — Documentation

### Task D1: Document the feature

**Files:**
- Modify: `etendo_core/modules/com.etendoerp.go/docs/neo-headless.md` — document `agentPrompt` in the `neo_discover` and `neo_schema` response shapes.
- Modify: `docs/decisions-reference.md` — document `window.agentPrompt` and per-field `agentPrompt`.
- Modify: `docs/ui-customization.md` — add `agentPrompt` to the `decisions.json → window.*` extension-point list.

- [ ] **Step 1:** Add a subsection "Agent prompt (`agentPrompt`)" to `neo-headless.md` showing a sample `neo_discover` spec object and `neo_schema` field object with the key, and noting it is omitted when empty.
- [ ] **Step 2:** In `decisions-reference.md`, document the key at both levels with a short example and that it flows to `ETGO_SF_SPEC.AGENT_PROMPT` / `ETGO_SF_FIELD.AGENT_PROMPT`.
- [ ] **Step 3:** Add a one-line entry to the `ui-customization.md` extension-point list.
- [ ] **Step 4: Commit** (each repo separately for its own docs)

```bash
# schema-forge
git add docs/decisions-reference.md docs/ui-customization.md
git commit -m "Feature ETP-4252: Document agentPrompt decisions config"
# com.etendoerp.go
cd etendo_core/modules/com.etendoerp.go
git add docs/neo-headless.md
git commit -m "Feature ETP-4252: Document agentPrompt in MCP responses"
```

---

## Verification & Integration

- [ ] Java: `./gradlew test --tests '*mcp*' --tests '*SFUpsert*'` → all PASS.
- [ ] CLI: `node --test cli/test/neo-writer.test.js cli/test/push-to-neo.test.js cli/test/generate-contract.test.js` → all PASS.
- [ ] `make validate-pipeline` (or `--scope=<sample-window>`) → 0 violations.
- [ ] After a real `push-to-neo` against a DB: remind to run `./gradlew export.database` in Etendo root (NEO config only lives in DB otherwise).
- [ ] PRs (one per repo) target `epic/ETP-3504`, regular merge (no squash), assigned to current user, referencing ETP-4252.

## Notes / decisions baked in
- Field column is `VARCHAR(2000)`; if long per-field prompts are needed later, migrate to `CLOB`.
- MCP responses omit `agentPrompt` entirely when null/blank — no schema break for existing clients.
- The push path sources values from `decisions.json` (like `defaultExpr`); `contract.mcp.json` carries them only for inspection.
