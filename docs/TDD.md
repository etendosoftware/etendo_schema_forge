# Schema Forge — Technical Design Document

| Property | Value |
|----------|-------|
| Version | 2.1 |
| Date | March 2026 |
| Status | Final |
| Companion | Schema Forge PRD v2.1 |

---

## 1. System Overview

Schema Forge is the design and tooling layer for building a simplified Etendo interface. It analyzes Etendo AD metadata, helps humans make design decisions, and configures the NEO Headless runtime via direct DB writes — no backend code generation needed. The runtime module (`com.etendoerp.go`) serves APIs dynamically from configuration stored in 3 database tables.

### 1.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| CLI tools | Node.js | Zero-dependency, CI-friendly |
| Decision tools | React web apps | Same ecosystem as generated frontend |
| IA integration | Anthropic Claude API (Sonnet) | Schema as system prompt, conversational generation |
| Runtime API | Java (NEO Headless — NeoServlet) | Metadata-driven REST API, no code generation |
| Generated frontend | React SPA | Output of generate-frontend.js, served as static |
| Contract tests | Node.js | JSON assertions, no backend needed, instant |
| Integration tests | JUnit (extends OBBaseTest) | Standard Etendo test infrastructure |

### 1.2 Repository Structure

```
schema-forge/
├── cli/                                  # Node.js CLI tools
│   └── src/
│       ├── extract-from-db.js            # Extract fields + rules from Etendo DB
│       ├── extract-from-process.js       # Extract process/report metadata + parameters
│       ├── extract-fields.js             # Field extraction with FK resolution
│       ├── extract-rules.js              # Rule + callout extraction
│       ├── pre-classify.js               # Auto-classify rules (deterministic + AI)
│       ├── validate-schema.js            # 4-level validation
│       ├── generate-contract.js          # Frontend/backend contracts (windows, processes, reports)
│       ├── push-to-neo.js                # Direct DB writes → NEO Headless config (specType W/P/R)
│       ├── neo-writer.js                 # Low-level DB writer for ETGO_SF_* tables
│       ├── custom-section-markers.js     # Delimiter constants for generated code boundaries
│       ├── generate-frontend.js          # React SPA generation (windows, processes, reports)
│       ├── generate-mock-data.js         # Mock catalogs for UI preview
│       ├── run-contract-tests.js         # Contract test runner
│       ├── resolve-menu.js               # AD_Menu resolver (auto-detect type from menu ID or name)
│       └── pipeline.js                   # Full pipeline orchestrator (window/process/report/menu modes)
│
├── tools/                                # React decision UIs
│   ├── app-shell/                        # Main UI shell (Vite + React + Tailwind, port 5173)
│   ├── decision-panel/                   # Field visibility + rule curation (port 5174)
│   └── ui-preview/                       # Live preview with mock data (port 5175)
│
├── templates/etendo-module/              # Legacy templates (replaced by NEO Headless runtime config)
│
├── artifacts/{window-or-process-name}/   # Per-window/process: schemas, rules, decisions, generated code
│   ├── schema-raw.json                   # Raw extraction from DB
│   ├── schema-curated.json               # After human visibility decisions
│   ├── rules-raw.json                    # Extracted business rules
│   ├── rules-curated.json                # After human rule decisions
│   ├── contract.json                     # Frontend + backend contract
│   └── generated/
│       └── web/{name}/                   # React SPA components
│
├── core-maps/                            # Shared metadata
│   ├── system-columns.json               # System field categories
│   ├── impact-messages.json              # Human-friendly impact messages
│   └── ad-reference-map.json             # AD Reference type mappings
│
├── scripts/                              # Helper scripts
│   ├── neo-token-sysadmin.sh             # JWT token for System Administrator
│   └── neo-token-groupadmin.sh           # JWT token for Group Admin role
│
└── docs/                                 # All documentation
    ├── architecture-overview.md           # System architecture
    ├── PRD.md / TDD.md                    # Product + technical design
    └── plans/                             # Feature plans and evaluations
```

### 1.3 Two-Loop Architecture

The system operates in two independent loops:

**Fast loop (UI design):** Human ↔ IA generating React. Preview in sandboxed iframe with Babel standalone + mock data. No compilation, no backend, no database. Seconds per turn.

**Validation loop (backend verification):** Configure via push-to-neo → contract tests (Node.js, instant) → verify endpoints live. No compilation needed — NEO Headless serves APIs dynamically from configuration.

The loops are independent. The UI Decisor can run 20+ turns in the fast loop without ever touching the validation loop. The validation loop runs once at the end.

---

## 2. Data Models

### 2.1 Schema (Fields)

```
{
  version: semver,
  generatedAt: ISO datetime,
  sourceChecksum: hex,

  window: {
    id: AD_Window_ID,
    name: string,
    description: string,
    primaryEntity: references entities[].name,
    category: sales|purchase|finance|warehouse|master|config
  },

  entities: [{
    name: camelCase,
    table: DB table name,
    description: string,
    level: header|line|subline,
    parentEntity: references entities[].name | null,
    parentField: FK column | null,

    fields: [{
      name: camelCase,
      column: DB column,
      label: string (optional for system),
      type: string|text|integer|decimal|boolean|date|datetime|
            enum|foreignKey|id|amount|quantity|price|image|binary,
      required: boolean,

      visibility: editable|readOnly|system|discarded,
      systemCategory: accounting|inventory|costing|audit|tax|
                      integration|internal (system only),

      derivation: {
        type: fromConfig|fromParent|fromField|lookup|computed|sequence,
        source: string,
        fallback: any
      },

      reference: {
        entity: referenced entity,
        displayField: field for dropdowns,
        filterExpression: string | null,
        cascadeFrom: field in same entity | null
      },

      validation: { min, max, minLength, maxLength, pattern, custom },
      displayLogic: boolean expression | null,
      readOnlyLogic: boolean expression | null,

      sequence: integer (UI order, not for system),
      grid: boolean,
      form: boolean,
      searchable: boolean,
      computed: expression | null
    }],

    defaultSort: { field, direction },
    uniqueConstraints: [[field, field]]
  }],

  businessRules: [{
    name: string,
    sourceRuleId: references rules-curated | null,
    trigger: { type, entity, field },
    action: { type, target, expression, message }
  }],

  generationHints: {
    simplifiedFields: [field names],
    uiPattern: masterDetail|simpleForm|wizard|dashboard|treeGrid,
    apiStyle: rest,
    exportFormats: [csv|pdf|xlsx]
  }
}
```

### 2.2 Rule Catalog

```
{
  version: string,
  window: string,
  summary: { total, autoClassified, humanReview, byDecision },

  rules: [{
    id: unique identifier,
    type: callout|eventHandler|displayLogic|readOnlyLogic|
          validation|documentProcess|constraint,
    source: java|javascript|sql|database,

    tier: auto|human,
    autoDecision: keep | null,
    autoRationale: string | null,
    decision: keep|replace|simplify|omit|pending,
    decisionJustification: string (required for omit),

    class: Java FQCN | null,
    expression: JS/SQL expression | null,
    translatedExpression: schema expression | null,

    trigger: { entity, field, event },
    effects: [{
      field: target,
      action: setValue|compute|filter|validate|recompute,
      description: string,
      confidence: high|medium|low,
      conditionalOn: branch condition | null
    }],

    complexity: low|medium|high,
    linesOfCode: integer | null,
    branches: integer | null,
    hasDmlOperations: boolean,
    dmlWarning: string | null,

    description: business language,
    iaRecommendation: string | null,
    impactIfOmitted: [{ field, severity, message }],

    behavioralSpec: { given, when, then, edgeCases },
    simplificationSpec: { keepEffects, dropEffects, newBehavior },
    replacementSpec: { desiredBehavior, generatedCode }
  }]
}
```

### 2.3 Process Definitions

```
{
  version: string,

  processes: [{
    name: camelCase,
    displayName: string,
    entity: primary entity,
    trigger: { type: action, endpoint: REST path, method: POST },

    preconditions: [{
      id: string,
      assertion: boolean expression,
      errorMessage: string,
      errorCode: machine-readable code
    }],

    steps: [{
      order: integer,
      name: camelCase,
      description: string,
      type: validate|mutation|forEach|compute|process,
      target: entity or field,
      operation: step-specific definition,

      ruleDecision: keep|replace,
      existingClass: FQCN | null (if keep),

      behavioral: {
        postcondition: string,
        sideEffects: [{ entity, field, change }]
      }
    }],

    edgeCases: [{
      id: string,
      description: string,
      setup: initial state,
      expectedBehavior: string,
      expectedStatus: HTTP status | null,
      assertions: [{ entity, field, expected }]
    }],

    transactional: true (always — OBDal, single transaction)
  }],

  behavioralContracts: {
    tests: [{
      id: string,
      process: references processes[].name,
      category: inventory|accounting|tax|precondition|transactional|parity,
      setup: { entities, initialState, failAt },
      action: HTTP endpoint,
      expectedStatus: integer | null,
      assertions: [{ entity, where, field, aggregate, expected, note }]
    }]
  }
}
```

### 2.4 Contract

```
{
  version: semver,
  schemaChecksum, rulesChecksum, processesChecksum: hex,

  frontendContract: {
    version: string,
    entities: {
      [name]: {
        fields: [{ name, type (TS), required, editable, label }],
        displayFields, editableFields, readOnlyFields,
        searchableFields, computedFields
      }
    },
    actions: [{ name, endpoint, method, availableWhen }],
    availableFilters: {
      [entityName]: [{ field, type, joinPath }]
    }
  },

  backendContract: {
    version: string,
    supportedVersions: [string],
    entities: {
      [name]: {
        table, fields: [{ name, column, type, required, visibility,
                          systemCategory, hasDerivation }],
        systemFields, keptRules
      }
    },
    endpoints: [{ method, path, entity, supportedFilters, requestSchema, responseSchema }],
    processEndpoints: [{ method, path, process, preconditions }],
    errorSchema: { code, message, field, severity, process, preconditionId }
  },

  testManifest: { unit, integration, contract, behavioral, access }
}
```

### 2.5 Decision Log

```
{
  decisions: [{
    id: uuid,
    timestamp: ISO datetime,
    actor: human|ia,
    tool: decision-editor|rule-catalog|process-designer|...,
    action: string,
    target: string,
    previousValue, newValue: any,
    justification: string | null,
    iaConfidence: 0-1 | null,
    overriddenBy: decision id | null
  }]
}
```

---

## 3. Component Specifications

### 3.1 Field Extractor

**Core SQL:**

```sql
SELECT
  w.AD_Window_ID, w.Name AS window_name,
  t.AD_Tab_ID, t.Name AS tab_name, t.TabLevel, t.SeqNo AS tab_seq,
  t.WhereClause, t.OrderByClause, t.FilterClause,
  t.HQLWhereClause, t.HQLOrderByClause, t.HQLFilterClause,
  tbl.TableName,
  f.AD_Field_ID, f.Name AS field_name,
  f.IsDisplayed, f.IsReadOnly, f.DisplayLogic,
  f.SeqNo AS field_seq,
  c.ColumnName, c.AD_Reference_ID, c.IsMandatory, c.IsUpdateable,
  c.DefaultValue, c.FieldLength, c.ValueMin, c.ValueMax,
  c.AD_Val_Rule_ID, c.ReadOnlyLogic,
  r.Name AS reference_name,
  mo.Classname AS callout_class
FROM AD_Field f
JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
JOIN AD_Window w ON t.AD_Window_ID = w.AD_Window_ID
JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
JOIN AD_Table tbl ON c.AD_Table_ID = tbl.AD_Table_ID
JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = c.AD_Callout_ID
WHERE w.AD_Window_ID = ?
  AND f.IsActive = 'Y' AND t.IsActive = 'Y'
ORDER BY t.SeqNo, f.SeqNo
```

**Pre-classification:**

```javascript
function classifyField(field) {
  if (field.columnName === field.tableName + '_ID')
    return { visibility: 'system', systemCategory: 'internal',
             derivation: { type: 'sequence' } };

  if (SYSTEM_COLUMNS[field.columnName])
    return { visibility: 'system', ...SYSTEM_COLUMNS[field.columnName] };

  if (['Created','CreatedBy','Updated','UpdatedBy'].includes(field.columnName))
    return { visibility: 'system', systemCategory: 'audit',
             derivation: inferAuditDerivation(field) };

  if (field.isDisplayed === 'N')
    return { visibility: 'system', systemCategory: inferCategory(field),
             derivation: inferDerivation(field) };

  if (field.isReadOnly === 'Y' || field.isUpdateable === 'N')
    return { visibility: 'readOnly' };

  return { visibility: 'editable' };
}

function inferDerivation(field) {
  const dv = field.defaultValue;
  if (!dv) return null;
  if (/^@\w+@$/.test(dv))
    return { type: 'fromConfig',
             source: `context.${dv.replace(/@/g, '').toLowerCase()}` };
  if (dv.startsWith('@SQL='))
    return { type: 'lookup', source: dv.substring(5) };
  return { type: 'computed', source: dv };
}
```

**AD_Reference_ID mapping:**

| AD_Ref | Schema Type |
|--------|-------------|
| 10 | string |
| 11 | integer |
| 12 | amount |
| 13 | id |
| 14 | text |
| 15 | date |
| 16 | datetime |
| 17 | enum |
| 18/19 | foreignKey |
| 20 | boolean |
| 22 | decimal |
| 29 | quantity |
| 35 | price |

### 3.2 Rule Extractor

**Metadata queries:**

```sql
-- Callouts
-- Note: AD_Column_Callout does not exist in Etendo 25/26.
-- Callouts link via AD_Column.AD_Callout_ID.
-- The Java classname lives in AD_Model_Object (tab "Callout Class" in AD).
SELECT co.AD_Callout_ID, co.Name AS callout_name,
       mo.Classname AS callout_class,
       col.ColumnName, col.AD_Table_ID
FROM AD_Callout co
JOIN AD_Column col ON col.AD_Callout_ID = co.AD_Callout_ID
JOIN AD_Tab t ON col.AD_Table_ID = t.AD_Table_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = co.AD_Callout_ID
WHERE t.AD_Window_ID = ?;

-- Validation Rules
SELECT vr.AD_Val_Rule_ID, vr.Name, vr.Code, c.ColumnName
FROM AD_Val_Rule vr
JOIN AD_Column c ON c.AD_Val_Rule_ID = vr.AD_Val_Rule_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = ?;

-- Display / ReadOnly Logic
-- Note: DisplayLogic is on AD_Field, ReadOnlyLogic is on AD_Column.
SELECT f.Name, f.DisplayLogic, c.ReadOnlyLogic, c.ColumnName
FROM AD_Field f
JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
WHERE t.AD_Window_ID = ?
  AND (f.DisplayLogic IS NOT NULL OR c.ReadOnlyLogic IS NOT NULL);

-- Auxiliary Inputs (computed variables used in DisplayLogic)
-- These are per-tab SQL-computed values referenced as @NAME@ in expressions.
-- See docs/etendo-ad/display-logic-variables.md for the full variable type taxonomy.
SELECT ai.Name, ai.Code AS validation_code, t.Name AS tab_name, t.AD_Tab_ID
FROM AD_AuxiliarInput ai
JOIN AD_Tab t ON ai.AD_Tab_ID = t.AD_Tab_ID
WHERE t.AD_Window_ID = ?
ORDER BY t.SeqNo, ai.Name;

-- Document Processes
-- Note: AD_Table_Process does not exist in Etendo 25/26.
-- Processes link via THREE mechanisms (+ rare hardcoded buttons):
--
--   1. tab_process:     AD_Tab.AD_Process_ID (tab-level, typically print/report)
--   2. classic_process: AD_Column.AD_Process_ID (button → AD_Process, e.g. DocAction)
--   3. obuiapp_process: AD_Column.EM_OBUIAPP_Process_ID → OBUIAPP_Process
--                       (new process definition with ActionHandler class)
--   4. hardcoded:       Button columns with no process linked at all
--                       (resolved by framework convention, very rare)

-- 1. Tab-level process
SELECT 'tab_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, NULL AS column_name
FROM AD_Process p
JOIN AD_Tab t ON t.AD_Process_ID = p.AD_Process_ID
WHERE t.AD_Window_ID = ?

UNION ALL

-- 2. Classic process (button column → AD_Process)
SELECT 'classic_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, c.ColumnName
FROM AD_Process p
JOIN AD_Column c ON c.AD_Process_ID = p.AD_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = ?

UNION ALL

-- 3. OBUIAPP Process (button column → OBUIAPP_Process definition)
SELECT 'obuiapp_process' AS mechanism,
       NULL AS process_id, op.OBUIAPP_Process_ID AS obuiapp_process_id,
       op.Name, op.Classname, c.ColumnName
FROM OBUIAPP_Process op
JOIN AD_Column c ON c.EM_OBUIAPP_Process_ID = op.OBUIAPP_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = ?

UNION ALL

-- 4. Hardcoded buttons (no process linked)
SELECT 'hardcoded' AS mechanism,
       NULL AS process_id, NULL AS obuiapp_process_id,
       c.ColumnName AS name, NULL AS classname, c.ColumnName
FROM AD_Column c
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
WHERE t.AD_Window_ID = ?
  AND r.Name = 'Button'
  AND c.AD_Process_ID IS NULL
  AND c.EM_OBUIAPP_Process_ID IS NULL

ORDER BY mechanism, name;
```

**Java source analysis:**

```javascript
function analyzeJavaSource(className, sourceDir) {
  const source = findSource(sourceDir, className);
  if (!source) return { effects: [], confidence: 'low',
                        warning: 'Source not found' };

  const setValuePattern = /(?:addResult|setFieldValue)\s*\(\s*"(\w+)"/g;
  const effects = [];
  let match;
  while ((match = setValuePattern.exec(source)) !== null)
    effects.push({ field: match[1], action: 'setValue', confidence: 'high' });

  // CRITICAL: detect direct DB operations
  const hasDml = /OBDal|PreparedStatement|createCriteria|ConnectionProvider|
                  executeUpdate|createQuery|getConnection/i.test(source);

  const branches = (source.match(/\bif\b|\bswitch\b|\?\s/g) || []).length;
  const loc = source.split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('//')).length;

  return {
    effects, branches, linesOfCode: loc,
    hasDmlOperations: hasDml,
    dmlWarning: hasDml
      ? 'Performs direct DB operations — escalated to Tier 2'
      : null
  };
}
```

**IA pre-classification:**

```javascript
async function preClassifyRules(rules) {
  for (const rule of rules) {

    // JS rules: auto-keep + translate (fail-safe)
    if (rule.type === 'displayLogic' || rule.type === 'readOnlyLogic') {
      const translated = translateExpression(rule.expression);
      if (translated.success) {
        rule.tier = 'auto';
        rule.autoDecision = 'keep';
        rule.translatedExpression = translated.result;
      } else {
        // Failed translation → human review, never partial injection
        rule.tier = 'human';
        rule.decision = 'pending';
        rule.warnings = [translated.error];
      }
      continue;
    }

    // Simple validations
    if (rule.type === 'validation' && isSimpleValidation(rule.sql)) {
      rule.tier = 'auto';
      rule.autoDecision = 'keep';
      continue;
    }

    // Simple callouts without DML
    if (rule.type === 'callout' && rule.complexity === 'low'
        && !rule.hasDmlOperations && rule.effects.length <= 2) {
      rule.tier = 'auto';
      rule.autoDecision = 'keep';
      continue;
    }

    // DML detected: always human + critical warning
    if (rule.hasDmlOperations) {
      rule.tier = 'human';
      rule.decision = 'pending';
      rule.warnings = [rule.dmlWarning];
    } else {
      rule.tier = 'human';
      rule.decision = 'pending';
      rule.iaRecommendation = await generateRecommendation(rule);
    }
  }
}
```

**Expression translator (fail-safe):**

```javascript
function translateExpression(expr) {
  // Abort on framework function calls
  if (/OB\.|Utilities\.|checkRule|function\s*\(/i.test(expr))
    return { success: false,
             error: 'Contains framework calls — cannot translate' };

  let result = expr
    .replace(/@(\w+)@/g, (_, n) => n.charAt(0).toLowerCase() + n.slice(1))
    .replace(/\|/g, ' || ')
    .replace(/&/g, ' && ')
    .replace(/'Y'/g, 'true')
    .replace(/'N'/g, 'false')
    .replace(/([^!<>])=/g, '$1 == ');

  return { success: true, result: result.trim() };
}
```

### 3.3 Schema Validator

Four levels:

**Level 1 — Structural:** Required fields, valid enums, no duplicates, header entity exists, FK fields have reference.

**Level 2 — Semantic:** Window.primaryEntity exists, parent references valid, cascadeFrom valid, business rule targets exist, generationHints valid.

**Level 3 — Visibility:** System fields have derivation or default, valid systemCategory, no UI properties on system fields, fromParent not on header entities.

**Level 4 — Cross-reference:** Every system field has derivation OR default OR active kept rule. Every readOnly computed field has a computing rule. No orphaned fields. Every searchable field has a type compatible with text search or exact match.

### 3.4 Contract Generator

**Test generation:**

| Category | From | One Per | Runtime |
|----------|------|---------|---------|
| field-presence | frontendContract | visible field | Node.js |
| field-type | both contracts | visible field | Node.js |
| system-field | backendContract | system field | Node.js |
| visibility | both contracts | system field | Node.js |
| form-completeness | frontendContract | required+editable | Node.js |
| rule-declared | rules-curated + schema | kept rule | Node.js |
| searchable-filters | backendContract.endpoints | searchable field | Node.js |
| required-validation | backendContract | required field | JUnit |
| system-derivation | backendContract | system field | JUnit |
| business-rule | schema.businessRules | rule | JUnit |
| rule-behavior | rules-curated | kept/replaced rule | JUnit |
| interface-match | both contracts | entity | Node.js |
| type-compatibility | both contracts | entity | Node.js |
| process-happy | behavioralContracts | happy test | JUnit |
| process-failure | behavioralContracts | failure test | JUnit |
| process-rollback | behavioralContracts | rollback test | JUnit |
| process-edge | processes[].edgeCases | edge case | JUnit |
| rule-parity | rules-curated (Replace) | replaced rule | JUnit |
| window-permission | permissions × windows | role × window | JUnit |
| process-permission | permissions × processes | role × process | JUnit |

**Searchable filter test generation:**

```javascript
function generateSearchableTests(contract) {
  const tests = [];

  for (const [entity, def] of Object.entries(
      contract.frontendContract.entities)) {
    const endpoint = contract.backendContract.endpoints
      .find(e => e.entity === entity && e.method === 'GET');
    if (!endpoint) continue;

    // Every searchable field must have a corresponding filter
    for (const field of def.searchableFields) {
      tests.push({
        id: `unit.${entity}.${field}.searchable-filter`,
        type: 'unit',
        category: 'searchable-filters',
        description: `Endpoint for ${entity} supports filter by "${field}"`,
        assertion: {
          type: 'filterExists',
          endpoint: endpoint.path,
          field
        }
      });
    }

    // No non-searchable fields should be filterable
    const nonSearchable = def.fields
      .filter(f => !def.searchableFields.includes(f.name))
      .map(f => f.name);
    tests.push({
      id: `unit.${entity}.no-arbitrary-filters`,
      type: 'unit',
      category: 'searchable-filters',
      description: `Endpoint for ${entity} does NOT support arbitrary filters`,
      assertion: {
        type: 'onlyDeclaredFilters',
        endpoint: endpoint.path,
        allowedFilters: def.searchableFields,
        disallowedSample: nonSearchable.slice(0, 3)
      }
    });
  }
  return tests;
}
```

### 3.5 Version Checker

**Breaking changes detected:**

- Field removed from frontend contract
- Field type changed
- Optional → required
- Editable → readOnly
- Process endpoint removed
- Searchable field removed (frontend filter breaks)

**Deploy plan:** Rolling for non-breaking, blue-green for breaking.

---

## 4. Backend Code Generation

### 4.1 Generated Module Structure

```
com.etendo.schemaforge.salesorder/
├── build.gradle
├── src/main/java/com/etendo/schemaforge/salesorder/
│   ├── event/
│   │   ├── OrderDerivationHandler.java
│   │   ├── OrderLineDerivationHandler.java
│   │   └── OrderLineTotalHandler.java       # Only if Replace
│   ├── process/
│   │   ├── CompleteOrderProcess.java        # Only if Replace
│   │   └── VoidOrderProcess.java            # Only if Replace
│   ├── callout/
│   │   └── SimplifiedBPCallout.java         # Only if Simplify
│   ├── api/
│   │   ├── OrderRxEndpoint.java
│   │   ├── OrderLineRxEndpoint.java
│   │   └── ErrorSerializer.java
│   └── validation/
│       └── OrderPreconditionValidator.java
├── referencedata/standard/
│   ├── Schemaforge_Salesorder.xml
│   ├── AD_Column_Callout.xml                # If replaced
│   ├── AD_Process.xml
│   ├── AD_Window_Access.xml
│   └── AD_Process_Access.xml
├── web/salesorder/
│   ├── index.html
│   └── assets/
└── src-test/
    ├── OrderDerivationTest.java
    ├── CompleteOrderBehavioralTest.java
    ├── VoidOrderBehavioralTest.java
    └── OrderEndpointContractTest.java
```

### 4.2 System Field Derivation (Event Handler)

```java
/**
 * GENERATED BY SCHEMA FORGE — DO NOT EDIT
 * Schema: sales-order@v3 (a4b8c2d1)
 */
public class OrderDerivationHandler
    extends EntityPersistenceEventObserver {

  private static final Entity[] ENTITIES = {
    ModelProvider.getInstance().getEntity(Order.ENTITY_NAME)
  };

  @Override protected Entity[] getObservedEntities() { return ENTITIES; }

  @Override public void onSave(@Observes EntityNewEvent event) {
    derive(event);
  }

  @Override public void onUpdate(@Observes EntityUpdateEvent event) {
    derive(event);
  }

  private void derive(EntityPersistenceEvent event) {
    final Order order = (Order) event.getTargetInstance();

    // fromConfig: context.organization
    if (order.getOrganization() == null)
      order.setOrganization(OBContext.getOBContext().getCurrentOrganization());

    // fromConfig: context.client
    if (order.getClient() == null)
      order.setClient(OBContext.getOBContext().getCurrentClient());

    // fromConfig: doctype.salesOrder
    if (order.getTransactionDocument() == null)
      order.setTransactionDocument(
        getDefaultDocType(order.getOrganization(), "SOO"));

    // defaults
    if (order.getPosted() == null) order.setPosted("N");
    if (order.getDocumentAction() == null) order.setDocumentAction("CO");
    if (order.isActive() == null) order.setActive(true);
    if (order.isSalesTransaction() == null) order.setSalesTransaction(true);
    if (order.isProcessed() == null) order.setProcessed(false);

    // audit (fromConfig)
    if (order.getCreatedBy() == null)
      order.setCreatedBy(OBContext.getOBContext().getUser());
    order.setUpdatedBy(OBContext.getOBContext().getUser());
    if (order.getCreationDate() == null) order.setCreationDate(new Date());
    order.setUpdated(new Date());
  }

  private DocumentType getDefaultDocType(Organization org, String docBase) {
    OBCriteria<DocumentType> crit = OBDal.getInstance()
      .createCriteria(DocumentType.class);
    crit.add(Restrictions.eq(DocumentType.PROPERTY_ORGANIZATION, org));
    crit.add(Restrictions.eq(DocumentType.PROPERTY_DOCUMENTCATEGORY, docBase));
    crit.addOrderBy(DocumentType.PROPERTY_DEFAULT, false);
    crit.setMaxResults(1);
    return (DocumentType) crit.uniqueResult();
  }
}
```

### 4.3 Line Derivation (fromParent)

```java
/**
 * GENERATED — OrderLine system fields from parent Order
 */
public class OrderLineDerivationHandler
    extends EntityPersistenceEventObserver {

  // ... observer boilerplate ...

  private void derive(EntityPersistenceEvent event) {
    final OrderLine line = (OrderLine) event.getTargetInstance();
    final Order parent = line.getSalesOrder();

    if (line.getOrganization() == null)
      line.setOrganization(parent.getOrganization());
    if (line.getClient() == null)
      line.setClient(parent.getClient());
    if (line.getWarehouse() == null)
      line.setWarehouse(parent.getWarehouse());
    if (line.getCurrency() == null)
      line.setCurrency(parent.getCurrency());
    if (line.getStorageBin() == null && line.getWarehouse() != null)
      line.setStorageBin(getDefaultLocator(line.getWarehouse()));
    if (line.getReservedQuantity() == null)
      line.setReservedQuantity(BigDecimal.ZERO);
  }
}
```

### 4.4 Process (DalBaseProcess)

```java
/**
 * GENERATED — Complete Sales Order
 * Process: completeOrder@v1 (m3n4o5p6)
 *
 * Single OBDal transaction. If any step throws, DB rolls back everything.
 * No saga, no compensation.
 */
public class CompleteOrderProcess extends DalBaseProcess {

  @Override
  protected void doExecute(ProcessBundle bundle) throws Exception {
    String orderId = (String) bundle.getParams().get("recordId");
    Order order = OBDal.getInstance().get(Order.class, orderId);

    // ── PRECONDITIONS ──
    if (order.getOrderLineList().isEmpty())
      throw new OBException("@CannotCompleteWithoutLines@");
    if (!"DR".equals(order.getDocumentStatus())
        && !"IP".equals(order.getDocumentStatus()))
      throw new OBException("@OnlyDraftCanBeCompleted@");
    for (OrderLine line : order.getOrderLineList()) {
      if (line.getProduct() == null)
        throw new OBException("@AllLinesMustHaveProduct@");
      if (line.getOrderedQuantity().compareTo(BigDecimal.ZERO) <= 0)
        throw new OBException("@AllLinesMustHavePositiveQty@");
    }

    // ── STEP 2: Assign document number ──
    order.setDocumentNo(FIN_Utility.getDocumentNo(
      order.getTransactionDocument(), "C_Order"));

    // ── STEP 3: Reserve inventory ──
    for (OrderLine line : order.getOrderLineList())
      reserveStock(line);

    // ── STEP 4: Calculate tax ──
    calculateOrderTax(order);

    // ── STEP 5: Post accounting ──
    postDocument(order);

    // ── STEP 6: Update status ──
    order.setDocumentStatus("CO");
    order.setProcessed(true);
    order.setDocumentAction("--");

    OBDal.getInstance().save(order);
    // OBDal commits at end of request — all or nothing
  }

  private void reserveStock(OrderLine line) {
    StorageDetail sd = getOrCreateStorageDetail(
      line.getProduct(), line.getWarehouse(), line.getStorageBin());
    sd.setQuantityReserved(
      sd.getQuantityReserved().add(line.getOrderedQuantity()));
    OBDal.getInstance().save(sd);
    line.setReservedQuantity(line.getOrderedQuantity());
    OBDal.getInstance().save(line);
  }

  private void calculateOrderTax(Order order) { /* ... */ }
  private void postDocument(Order order) { /* ... */ }
}
```

### 4.5 Etendo RX Endpoints (Searchable Fields Only)

The endpoint supports filtering **only by fields marked `searchable`** in the schema. No arbitrary queries. Joins are pre-computed from schema references at generation time.

```java
/**
 * GENERATED — Sales Order REST endpoint
 *
 * Supported filters (from schema.searchable):
 *   - documentNo (string, direct)
 *   - businessPartner (foreignKey, join on name)
 *   - documentStatus (enum, direct)
 *   - dateOrdered (date, direct)
 *
 * No other fields are filterable.
 */
@Path("/schemaforge/v1/orders")
public class OrderRxEndpoint {

  // Searchable fields from schema — generated as constants
  private static final Set<String> ALLOWED_FILTERS = Set.of(
    "documentNo", "businessPartner", "documentStatus", "dateOrdered"
  );

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  public Response list(
      @QueryParam("page") @DefaultValue("1") int page,
      @QueryParam("size") @DefaultValue("20") int size,
      @QueryParam("documentNo") String filterDocNo,
      @QueryParam("businessPartner") String filterBP,
      @QueryParam("documentStatus") String filterStatus,
      @QueryParam("dateFrom") String filterDateFrom,
      @QueryParam("dateTo") String filterDateTo) {

    OBCriteria<Order> crit = OBDal.getInstance()
      .createCriteria(Order.class);

    // Only declared filters — no arbitrary field access
    if (filterDocNo != null)
      crit.add(Restrictions.ilike(
        Order.PROPERTY_DOCUMENTNO, filterDocNo, MatchMode.ANYWHERE));

    if (filterBP != null)
      // Join path known from schema reference definition
      crit.createAlias(Order.PROPERTY_BUSINESSPARTNER, "bp")
          .add(Restrictions.ilike("bp.name", filterBP, MatchMode.ANYWHERE));

    if (filterStatus != null)
      crit.add(Restrictions.eq(Order.PROPERTY_DOCUMENTSTATUS, filterStatus));

    if (filterDateFrom != null)
      crit.add(Restrictions.ge(Order.PROPERTY_ORDERDATE,
        parseDate(filterDateFrom)));
    if (filterDateTo != null)
      crit.add(Restrictions.le(Order.PROPERTY_ORDERDATE,
        parseDate(filterDateTo)));

    // Sort from schema defaultSort
    crit.addOrderBy(Order.PROPERTY_ORDERDATE, false);

    crit.setFirstResult((page - 1) * size);
    crit.setMaxResults(size);

    List<OrderDTO> dtos = crit.list().stream()
      .map(this::toDTO).collect(Collectors.toList());

    return Response.ok(dtos).build();
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(OrderCreateDTO dto) {
    try {
      Order order = new Order();
      // Map editable fields only
      order.setOrderDate(dto.getDateOrdered());
      order.setBusinessPartner(
        OBDal.getInstance().get(BusinessPartner.class,
                                dto.getBusinessPartnerId()));
      // ... editable fields ...
      // System fields derived by OrderDerivationHandler (beforeSave)
      OBDal.getInstance().save(order);
      OBDal.getInstance().flush();
      return Response.status(201).entity(toDTO(order)).build();
    } catch (OBException e) {
      return Response.status(400).entity(ErrorSerializer.serialize(e)).build();
    }
  }

  @POST @Path("/{id}/complete")
  public Response complete(@PathParam("id") String id) {
    try {
      ProcessBundle bundle = new ProcessBundle(
        getProcessId("completeOrder"), null);
      bundle.getParams().put("recordId", id);
      new CompleteOrderProcess().execute(bundle);
      return Response.ok(
        toDTO(OBDal.getInstance().get(Order.class, id))).build();
    } catch (OBException e) {
      return Response.status(400).entity(ErrorSerializer.serialize(e)).build();
    }
  }

  private OrderDTO toDTO(Order order) {
    // Only frontendContract fields — system excluded
    OrderDTO dto = new OrderDTO();
    dto.setId(order.getId());
    dto.setDocumentNo(order.getDocumentNo());
    dto.setDateOrdered(order.getOrderDate());
    dto.setBusinessPartner(order.getBusinessPartner().getName());
    dto.setGrandTotal(order.getGrandTotalAmount());
    dto.setDocumentStatus(order.getDocumentStatus());
    // ... visible fields only ...
    return dto;
  }
}
```

### 4.6 Error Serialization

```java
/**
 * GENERATED — Standard error format for all endpoints
 */
public class ErrorSerializer {

  public static ErrorResponse serialize(OBException e) {
    String translated = OBMessageUtils.translateError(
      e.getMessage()).getMessage();
    return new ErrorResponse(
      classifyErrorCode(e),
      translated,
      extractFieldIfAny(e),
      "error",
      extractProcessIfAny(e),
      extractPreconditionIfAny(e)
    );
  }

  // Maps OBException types to machine-readable codes
  private static String classifyErrorCode(OBException e) {
    if (e.getMessage().startsWith("@"))
      return "PROCESS_PRECONDITION_FAILED";
    if (e instanceof ConstraintViolationException)
      return "VALIDATION_ERROR";
    return "INTERNAL_ERROR";
  }
}
```

### 4.7 Permissions (Reference Data Only)

No Java generated. The Permission Matrix writes XML:

```xml
<AD_Window_Access>
  <AD_Window_Access_ID>GENERATED_UUID</AD_Window_Access_ID>
  <AD_Role_ID>SALES_REP_ROLE_ID</AD_Role_ID>
  <AD_Window_ID>143</AD_Window_ID>
  <IsActive>Y</IsActive>
  <IsReadWrite>Y</IsReadWrite>
</AD_Window_Access>
```

---

## 5. Frontend Code Generation

### 5.1 UI Generator (Fast Loop)

The UI Generator runs entirely in the browser. No compilation, no backend.

**System prompt:**

```
SCHEMA CONSTRAINTS (INVIOLABLE):
{entities with visible fields only}

AVAILABLE FILTERS:
{searchableFields per entity — only these can be used as search/filter}

BUSINESS RULES:
{rules as natural language}

AVAILABLE ACTIONS:
{process endpoints with conditions}

MOCK DATA:
{realistic sample data}

RULES:
1. System fields never appear
2. ReadOnly fields render as non-editable
3. Computed fields never editable
4. Only searchable fields can be used as filters
5. CascadeFrom relationships respected
6. Never invent fields not in schema
7. Inline styles + base React
8. Self-contained default export
```

**Preview:** Sandboxed iframe with React 18 + Babel standalone. Mock data from schema. No network calls.

**Token budget:** ~5,500 per turn. ~10 turns per session = ~55K tokens per window.

### 5.2 Day-2 UI Updates

Previous code loaded as baseline. Schema diff shown. Human describes changes. IA generates updated component. Contract tests verify no removed/missing fields. Diff visible for review.

---

## 6. Testing Architecture

### 6.1 Two Runtimes

**Node.js (contract tests, ~145 tests):** Run against JSON. No backend. Instant. Cover: field presence, types, visibility, form completeness, rule declarations, searchable filters, interface match, type compatibility.

**JUnit (integration + behavioral, ~100 tests):** Run on Etendo (OBBaseTest). Require compilation. Cover: required validation, system derivation, business rules, rule behavior, processes, rollback, edge cases, parity, permissions.

### 6.2 Generated JUnit Example

```java
/**
 * GENERATED — beh.complete.inventory
 */
public class CompleteOrderInventoryTest extends OBBaseTest {

  @Test
  public void afterCompleting_reservedQtyReflectsOrderLines() {
    Order order = createTestOrder("DR");
    OrderLine line = addTestLine(order, getProduct("P1"), qty(10));
    StorageDetail sd = getStorageDetail("P1", "W1");
    assertEquals(BigDecimal.ZERO, sd.getQuantityReserved());

    completeOrder(order.getId());

    OBDal.getInstance().refresh(sd);
    OBDal.getInstance().refresh(order);
    assertEquals(new BigDecimal(10), sd.getQuantityReserved());
    assertEquals("CO", order.getDocumentStatus());
  }
}

/**
 * GENERATED — rollback test
 */
public class CompleteOrderRollbackTest extends OBBaseTest {

  @Test
  public void ifAccountingFails_transactionRollsBack() {
    Order order = createTestOrder("DR");
    addTestLine(order, getProduct("P1"), qty(5));
    removeAccountingConfig(order.getOrganization());

    StorageDetail sd = getStorageDetail("P1", "W1");
    BigDecimal initialReserved = sd.getQuantityReserved();

    try {
      completeOrder(order.getId());
      fail("Should have thrown");
    } catch (OBException expected) {}

    OBDal.getInstance().getSession().clear();
    sd = getStorageDetail("P1", "W1");
    order = OBDal.getInstance().get(Order.class, order.getId());

    assertEquals(initialReserved, sd.getQuantityReserved(),
      "Rolled back");
    assertEquals("DR", order.getDocumentStatus(), "Unchanged");
  }
}
```

### 6.3 Generated Node.js Contract Test

```javascript
describe('Searchable filters: order', () => {
  const endpoint = contract.backendContract.endpoints
    .find(e => e.entity === 'order' && e.method === 'GET');
  const allowed = contract.frontendContract.entities.order.searchableFields;

  it('endpoint supports all searchable fields', () => {
    for (const field of allowed)
      expect(endpoint.supportedFilters).toContain(field);
  });

  it('endpoint does not support non-searchable fields', () => {
    const nonSearchable = contract.frontendContract.entities.order.fields
      .map(f => f.name)
      .filter(f => !allowed.includes(f));
    for (const field of nonSearchable)
      expect(endpoint.supportedFilters).not.toContain(field);
  });
});
```

---

## 7. Code Provenance

### 7.1 File Headers

```java
/**
 * GENERATED BY SCHEMA FORGE — DO NOT EDIT
 *
 * Schema:    sales-order@v3     (a4b8c2d1)
 * Rules:     sales-order@v2     (e5f6g7h8)
 * Decisions: 2026-03-15@v4      (i9j0k1l2)
 * Processes: sales-order@v1     (m3n4o5p6)
 * Contract:  v3.1               (q7r8s9t0)
 *
 * Generated: 2026-03-15T14:30:00Z
 * Generator: schema-forge@2.1.0
 *
 * Regenerate: schema-forge generate --from decisions@v4
 */
```

### 7.2 Provenance Manifest

Links every generated file to its source artifacts with checksums. Tracks kept, replaced, and omitted rules. Records Etendo version for compatibility.

---

## 8. Day-2 Lifecycle

### 8.1 Delta Detection

Re-run extractors. Diff raw artifacts against previous versions.

### 8.2 Decision Preservation

Previous decisions are the baseline. Only deltas surface to the human. IA pre-processes new items.

### 8.3 Compilation Gate

**After regenerating the module with merged decisions, compile before presenting results.** If Etendo changed a method signature that the generated code calls, the compilation fails and the delta report says: "Etendo changed API X used by process Y — requires review." The human never sees a green result that won't compile.

```
Re-run extractors
     ↓
Compute delta
     ↓
IA pre-process deltas
     ↓
Merge previous decisions + new items
     ↓
Regenerate module
     ↓
┌─────────────────────────────────┐
│  COMPILATION GATE               │
│  gradlew compile                │
│  If fails → report which APIs  │
│  changed → human reviews        │
│  If passes → continue           │
└─────────────────────────────────┘
     ↓
Contract tests (instant)
     ↓
Present delta to human (only new/changed items)
     ↓
Human re-decides new items
     ↓
Regenerate + recompile
     ↓
Integration tests
     ↓
Version checker → deploy plan
```

### 8.4 Conflict Resolution

| Scenario | Response |
|----------|----------|
| New field | IA pre-classifies, human confirms |
| Removed field | Warning, decision marked removed |
| Changed type | Warning, human re-decides |
| Modified callout (Keep) | Behavioral test may fail, human re-validates |
| New callout | IA pre-classifies, human decides |
| Changed Java API signature | **Compilation gate catches, reports incompatibility** |

---

## 9. IA Integration

### 9.1 Three Touchpoints

| Touchpoint | Purpose | Tokens/call |
|-----------|---------|-------------|
| Rule pre-classification | Classify + recommend in business language | ~1,500/rule |
| UI generation | Generate React from schema | ~5,500/turn |
| Day-2 delta analysis | Pre-process changes, preserve decisions | ~3,000/delta |

### 9.2 Rule Classification Prompt

```
Classify this business rule in plain language.
Describe what it does for the user, not the system.

RULE: {rule JSON}
SCHEMA CONTEXT: {affected fields}

JSON response:
{
  "recommendation": "keep|replace|simplify|omit",
  "confidence": 0-1,
  "businessDescription": "plain language",
  "impactIfOmitted": "what changes for the user",
  "simplificationSuggestion": "what to keep if simplify"
}
```

---

## 10. CI/CD

```yaml
stages:
  - validate
  - generate
  - compile
  - test-contract
  - test-integration
  - compatibility
  - deploy

validate:
  script:
    - schema-forge validate-schema artifacts/$W/schema-curated.json
    - schema-forge validate-processes artifacts/$W/processes.json

generate:
  script:
    - schema-forge generate-contract --all-artifacts
    - schema-forge generate-backend --contract contract.json

compile:
  script:
    - cd generated-module && ./gradlew compile
  allow_failure: false  # Compilation gate

test-contract:
  script:
    - node cli/run-contract-tests.js  # instant, no backend

test-integration:
  script:
    - cd generated-module && ./gradlew test  # JUnit on Etendo

compatibility:
  script:
    - schema-forge check-version --old prev.json --new contract.json

deploy:
  when: manual
```

**Quality gates:**

| Gate | Blocks |
|------|--------|
| Schema valid (0 errors) | Generate |
| Processes valid (0 errors, ≥ 3 edge cases) | Generate |
| Compilation succeeds | All tests |
| Contract tests pass (~145) | Deploy |
| Integration tests pass (~100) | Deploy |
| No unresolved breaking changes | Deploy |
| Every Keep rule has behavioral test | Deploy |

---

## 11. Performance Targets

| Operation | Target |
|-----------|--------|
| Field extraction | < 5 sec |
| Rule extraction (with Java analysis) | < 30 sec |
| Schema validation | < 1 sec |
| Contract generation | < 2 sec |
| Contract tests (Node.js) | < 5 sec |
| IA rule classification | < 10 sec/rule |
| IA UI generation turn | < 15 sec |
| Backend code generation | < 10 sec |
| Module compilation (gradlew) | < 5 min |
| JUnit integration tests | < 60 sec |
| Full pipeline (human included) | < 3 hours |

---

## 12. Security

| Concern | Mitigation |
|---------|------------|
| DB credentials | Environment variables |
| Code injection | Validator rejects suspicious expressions |
| IA prompt injection | Schema is system prompt, not user-controllable |
| Permission bypass | AD_Window_Access enforced by Etendo |
| Artifact tampering | Checksums in provenance manifest |
| Arbitrary queries | Only searchable fields filterable |

---

## 13. Known Constraints

| Constraint | Impact | Workaround |
|-----------|--------|------------|
| Java analysis is shallow | May miss branches | Confidence scores + DML detection + human review |
| Etendo expression undocumented patterns | ~5% fail | Fail-safe → Tier 2 |
| Callouts with HttpServletRequest | Can't run outside web | Detected, marked Replace |
| OBDal session required | Tests need Etendo context | OBBaseTest |
| Context window limit | Complex windows may need splitting | Sub-components |
| Module tied to Etendo version | Provenance tracks version | Compilation gate catches incompatibility |
| Searchable fields only | No arbitrary queries | By design — prevents N+1, human decides what's searchable |

---

*End of document*
