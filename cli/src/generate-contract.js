import { createHash } from 'node:crypto';
import { toSpecName } from './push-to-neo.js';
import { autoSimplifyEntityName } from './resolve-curated.js';

const TS_TYPE_MAP = {
  string: 'string',
  integer: 'number',
  amount: 'number',
  number: 'number',
  quantity: 'number',
  price: 'number',
  decimal: 'number',
  boolean: 'boolean',
  date: 'string',
  datetime: 'string',
  id: 'string',
  foreignKey: 'string',
};

function mapTsType(fieldType) {
  return TS_TYPE_MAP[fieldType] ?? 'string';
}

function isVisible(field) {
  return field.visibility !== 'system' && field.visibility !== 'discarded';
}

function isSystem(field) {
  return field.visibility === 'system';
}

/**
 * Find a matching rule for a given identifier and type (callout, displayLogic, readOnlyLogic).
 */
function findMatchingRule(rules, identifier, type) {
  if (!rules || !rules.length || !identifier) return null;
  return rules.find(r => {
    if (r.type !== type) return false;
    return r.className === identifier || r.name === identifier;
  }) ?? null;
}

/**
 * Classify whether a raw display/readOnly logic expression can be evaluated client-side.
 * Returns { evaluable: true } or { evaluable: false, reason: string }.
 */
function classifyEvaluability(rawExpr) {
  if (!rawExpr) return { evaluable: true };

  // Server-expanded macro
  if (rawExpr.includes('@ACCT_DIMENSION_DISPLAY@')) {
    return { evaluable: false, reason: 'server-macro' };
  }
  // System preferences (@#VAR@)
  if (/@#\w+@/.test(rawExpr)) {
    return { evaluable: false, reason: 'session-preference' };
  }
  // Accounting dimensions (@$VAR@)
  if (/@\$\w+@/.test(rawExpr)) {
    return { evaluable: false, reason: 'accounting-dimension' };
  }
  // Known session context variables (module flags, not field values)
  const sessionVarPatterns = [
    'FinancialManagement', 'StockReservations', 'IsSOTrx', 'ShowAcct', 'ShowTrl',
    'ACCS_Account_Ope', 'APRM_', 'showAddPayment', 'IsStocked',
  ];
  for (const pattern of sessionVarPatterns) {
    if (rawExpr.includes(`@${pattern}`)) {
      return { evaluable: false, reason: 'session-variable' };
    }
  }
  // Auxiliary inputs (SQL-computed values — lowercase start or known patterns)
  if (/@SQL@/i.test(rawExpr)) {
    return { evaluable: false, reason: 'auxiliary-input' };
  }
  // If @ symbols remain after the known patterns, might be untranslatable
  // But simple @FieldName@ patterns are fine — those are field references
  return { evaluable: true };
}

/**
 * Generate frontend contract: visible fields, searchable fields, computed fields.
 * Includes behavioral metadata (callout, displayLogic, readOnlyLogic) when present.
 */
export function generateFrontendContract(schema, rules = []) {
  const entities = {};

  for (const entity of schema.entities) {
    const visibleFields = entity.fields.filter(isVisible);

    const fields = visibleFields.map(f => {
      const mapped = {
        name: f.name,
        apiKey: f.apiKey || f.name,
        column: f.column,
        label: f.label,
        type: f.type,
        tsType: mapTsType(f.type),
        visibility: f.visibility,
        required: f.required,
        grid: f.grid,
        form: f.form,
      };
      if (f.columnType) mapped.columnType = f.columnType;
      if (f.reference) mapped.reference = f.reference;
      if (f.enumValues) mapped.enumValues = f.enumValues;
      if (f.inputMode) mapped.inputMode = f.inputMode;
      if (f.dependsOn) mapped.dependsOn = f.dependsOn;

      // UI hints
      if (f.defaultValue) mapped.defaultValue = f.defaultValue;
      if (f.isIdentifier) mapped.isIdentifier = true;
      if (f.help) mapped.help = f.help;
      if (f.fieldGroup) mapped.fieldGroup = f.fieldGroup;
      if (f.isSelectionColumn) mapped.isSelectionColumn = true;
      if (f.isFilterable) mapped.isFilterable = true;
      if (f.precision) mapped.precision = f.precision;
      if (f.isTranslated) mapped.isTranslated = true;
      if (f.section) mapped.section = f.section;
      if (f.seq != null) mapped.seq = f.seq;
      if (f.statusBar) mapped.statusBar = true;
      if (f.badge) mapped.badge = true;
      if (f.summable) mapped.summable = true;

      // Behavioral metadata: callout
      if (f.callout) {
        mapped.callout = { className: f.callout };
        const matchingRule = findMatchingRule(rules, f.callout, 'callout');
        if (matchingRule) {
          if (matchingRule.effects && matchingRule.effects.length) {
            mapped.callout.effects = matchingRule.effects.map(e => e.field ?? e);
          }
          if (matchingRule.complexity) {
            mapped.callout.complexity = matchingRule.complexity;
          }
        }
      }

      // Behavioral metadata: onChangeFunction
      if (f.onChangeFunction) {
        mapped.onChangeFunction = { name: f.onChangeFunction };
      }

      // Behavioral metadata: displayLogic
      if (f.displayLogic) {
        mapped.displayLogic = { raw: f.displayLogic };
        const matchingRule = findMatchingRule(rules, f.displayLogic, 'displayLogic');
        if (matchingRule && matchingRule.translated) {
          mapped.displayLogic.js = matchingRule.translated;
        }
        const evalInfo = classifyEvaluability(f.displayLogic);
        mapped.displayLogic.evaluable = evalInfo.evaluable;
        if (!evalInfo.evaluable) {
          mapped.displayLogic.reason = evalInfo.reason;
          mapped.displayLogic.js = null;
        } else if (!mapped.displayLogic.js && !f.displayLogic.includes('@')) {
          // Raw expression has no Etendo @Variable@ markers — treat as direct JS
          mapped.displayLogic.js = f.displayLogic;
        }
        // Prefer explicit displayLogicJs from decisions over rule-based lookup
        if (f.displayLogicJs != null) {
          mapped.displayLogic.js = f.displayLogicJs;
        }
      }

      // Behavioral metadata: readOnlyLogic
      if (f.readOnlyLogic) {
        mapped.readOnlyLogic = { raw: f.readOnlyLogic };
        const matchingRule = findMatchingRule(rules, f.readOnlyLogic, 'readOnlyLogic');
        if (matchingRule && matchingRule.translated) {
          mapped.readOnlyLogic.js = matchingRule.translated;
        }
        const evalInfo = classifyEvaluability(f.readOnlyLogic);
        mapped.readOnlyLogic.evaluable = evalInfo.evaluable;
        if (!evalInfo.evaluable) {
          mapped.readOnlyLogic.reason = evalInfo.reason;
          mapped.readOnlyLogic.js = null;
        } else if (!mapped.readOnlyLogic.js && !f.readOnlyLogic.includes('@')) {
          // Raw expression has no Etendo @Variable@ markers — treat as direct JS
          mapped.readOnlyLogic.js = f.readOnlyLogic;
        }
      }

      return mapped;
    });

    const searchableFields = visibleFields
      .filter(f => f.searchable)
      .map(f => f.apiKey || f.name);

    const computedFields = visibleFields
      .filter(f => f.derivation)
      .map(f => ({ name: f.apiKey || f.name, derivation: f.derivation }));

    const feEntity = { tableName: entity.tableName, tabId: entity.tabId, tabName: entity.tabName, uiPattern: entity.uiPattern ?? 'STD', fields, searchableFields, computedFields };
    if (entity.javaQualifier) feEntity.javaQualifier = entity.javaQualifier;
    if (entity.draftMode?.enabled) feEntity.draftMode = entity.draftMode;
    entities[entity.name] = feEntity;
  }

  // Include layoutType from curated schema; default to "default" when absent
  const win = { ...schema.window };
  win.layoutType = schema.window.layoutType ?? 'default';

  // Include templateConfig only for layout types that use it
  if (win.layoutType === 'kanban' || win.layoutType === 'calendar') {
    win.templateConfig = schema.window.templateConfig ?? null;
  }

  return { window: win, entities };
}

/**
 * Generate backend contract: all fields, REST endpoints, process endpoints.
 */
export function generateBackendContract(schema, rules = [], processes = []) {
  const entities = {};
  const endpoints = [];

  for (const entity of schema.entities) {
    const fields = entity.fields.map(f => ({
      name: f.name,
      apiKey: f.apiKey || f.name,
      column: f.column,
      type: f.type,
      visibility: f.visibility,
      required: f.required,
    }));

    const beEntity = { tableName: entity.tableName, tabId: entity.tabId, tabName: entity.tabName, fields };
    if (entity.javaQualifier) beEntity.javaQualifier = entity.javaQualifier;
    entities[entity.name] = beEntity;

    const searchableFields = entity.fields
      .filter(f => f.searchable)
      .map(f => f.apiKey || f.name);

    const basePath = `/${entity.name}`;

    endpoints.push(
      { method: 'GET', path: basePath, entity: entity.name, supportedFilters: searchableFields },
      { method: 'GET', path: `${basePath}/:id`, entity: entity.name, supportedFilters: [] },
      { method: 'POST', path: basePath, entity: entity.name, supportedFilters: [] },
      { method: 'PUT', path: `${basePath}/:id`, entity: entity.name, supportedFilters: [] },
      { method: 'DELETE', path: `${basePath}/:id`, entity: entity.name, supportedFilters: [] },
    );
  }

  // Build lookup structures for matching process entities to curated entity names.
  // Processes reference entities by raw OBDal tableName-based names (e.g., "cOrder"),
  // but curated entities may use tabName-based names (e.g., "header").
  const curatedEntityNames = new Set(schema.entities.map(e => e.name));
  const tableNameToEntityName = new Map();
  for (const e of schema.entities) {
    if (e.tableName) tableNameToEntityName.set(e.tableName.toLowerCase(), e.name);
  }

  const processEndpoints = processes.map(p => {
    const columnName = p.trigger?.column ?? p.trigger?.field ?? null;
    const params = p.params ?? (p.trigger
      ? [{ key: columnName, value: p.trigger.value, hidden: true }]
      : []);
    // Map process entity name to the curated entity name.
    // Try: 1) direct match, 2) tableName lookup, 3) autoSimplify, 4) primary entity fallback for button triggers
    let curatedEntity = p.entity;
    if (!curatedEntityNames.has(curatedEntity)) {
      // Process entity might be a tableName-based key — look up by tableName
      // Strip known OBDal prefixes (c, m, ad) only when followed by uppercase
      const stripped = (p.entity || '').replace(/^(c|m|ad)(?=[A-Z])/, '');
      const fromTable = tableNameToEntityName.get(stripped.toLowerCase())
        || tableNameToEntityName.get((p.entity || '').toLowerCase());
      curatedEntity = fromTable || autoSimplifyEntityName(p.entity);
    }
    // If still unresolved and it's a button trigger, fall back to primary entity (header)
    if (!curatedEntityNames.has(curatedEntity) && p.trigger?.type === 'button') {
      curatedEntity = schema.entities[0]?.name || curatedEntity;
    }
    return {
      name: p.name,
      method: 'POST',
      path: columnName ? `/${curatedEntity}/:id/action/${columnName}` : `/process/${p.name}`,
      entity: curatedEntity,
      columnName,
      params,
      preconditions: p.preconditions ?? [],
      steps: p.steps?.length ?? 0,
    };
  });

  return { window: schema.window, entities, endpoints, processEndpoints };
}

/**
 * Generate test manifest from contracts, rules, and processes.
 */
export function generateTestManifest(frontendContract, backendContract, rules = [], processes = []) {
  const tests = [];
  let idCounter = 0;
  const nextId = () => `t-${++idCounter}`;

  // Derive system fields from backend minus frontend
  for (const [entityName, entityData] of Object.entries(frontendContract.entities)) {
    const visibleFields = entityData.fields;

    // field-presence: one per visible field
    for (const field of visibleFields) {
      tests.push({
        id: nextId(),
        category: 'field-presence',
        entity: entityName,
        field: field.name,
        runner: 'node',
        description: `Field '${field.name}' should be present in ${entityName}`,
      });
    }

    // field-type: one per visible field
    for (const field of visibleFields) {
      tests.push({
        id: nextId(),
        category: 'field-type',
        entity: entityName,
        field: field.name,
        runner: 'node',
        description: `Field '${field.name}' should have type '${field.tsType}' in ${entityName}`,
      });
    }

    // searchable-filters: one per searchable field
    for (const fieldName of entityData.searchableFields) {
      tests.push({
        id: nextId(),
        category: 'searchable-filters',
        entity: entityName,
        field: fieldName,
        runner: 'node',
        description: `Field '${fieldName}' should be a supported filter for ${entityName}`,
      });
    }

    // visibility: one per entity
    tests.push({
      id: nextId(),
      category: 'visibility',
      entity: entityName,
      runner: 'node',
      description: `Entity '${entityName}' should only expose visible fields in frontend`,
    });

    // displayLogic validity: one per field with displayLogic
    for (const field of visibleFields) {
      if (field.displayLogic) {
        tests.push({
          id: nextId(),
          category: 'displaylogic-valid',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `Display logic for '${field.name}' in ${entityName} should be valid JS`,
        });
      }
    }

    // readOnlyLogic validity: one per field with readOnlyLogic
    for (const field of visibleFields) {
      if (field.readOnlyLogic) {
        tests.push({
          id: nextId(),
          category: 'readonlylogic-valid',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `Read-only logic for '${field.name}' in ${entityName} should be valid JS`,
        });
      }
    }

    // displayLogic evaluable: one per field with displayLogic
    for (const field of visibleFields) {
      if (field.displayLogic) {
        tests.push({
          id: nextId(),
          category: 'displaylogic-evaluable',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `Display logic for '${field.name}' in ${entityName} should have evaluable flag`,
        });
      }
    }

    // readOnlyLogic evaluable: one per field with readOnlyLogic
    for (const field of visibleFields) {
      if (field.readOnlyLogic) {
        tests.push({
          id: nextId(),
          category: 'readonlylogic-evaluable',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `Read-only logic for '${field.name}' in ${entityName} should have evaluable flag`,
        });
      }
    }

    // defaultValue type: one per field with defaultValue
    for (const field of visibleFields) {
      if (field.defaultValue !== undefined) {
        tests.push({
          id: nextId(),
          category: 'default-value-type',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `Default value for '${field.name}' in ${entityName} should be a string`,
        });
      }
    }
  }

  // system-field tests from backend fields not in frontend
  for (const [entityName, beEntity] of Object.entries(backendContract.entities)) {
    const feEntity = frontendContract.entities[entityName];
    const feFieldNames = new Set(feEntity ? feEntity.fields.map(f => f.name) : []);

    for (const field of beEntity.fields) {
      if (!feFieldNames.has(field.name)) {
        tests.push({
          id: nextId(),
          category: 'system-field',
          entity: entityName,
          field: field.name,
          runner: 'node',
          description: `System field '${field.name}' should exist in backend but not frontend for ${entityName}`,
        });
      }
    }
  }

  // rule-declared: one per kept rule
  for (const rule of rules) {
    tests.push({
      id: nextId(),
      category: 'rule-declared',
      rule: rule.name,
      runner: 'node',
      description: `Rule '${rule.name}' (${rule.type}) should be declared`,
    });
  }

  // process tests
  for (const proc of processes) {
    // process-happy
    tests.push({
      id: nextId(),
      category: 'process-happy',
      process: proc.name,
      entity: proc.entity,
      runner: 'junit',
      description: `Process '${proc.name}' should complete successfully with valid preconditions`,
    });

    // process-failure
    tests.push({
      id: nextId(),
      category: 'process-failure',
      process: proc.name,
      entity: proc.entity,
      runner: 'junit',
      description: `Process '${proc.name}' should fail when preconditions are not met`,
    });

    // process-edge: one per edge case
    if (proc.edgeCases) {
      for (const edge of proc.edgeCases) {
        tests.push({
          id: nextId(),
          category: 'process-edge',
          process: proc.name,
          entity: proc.entity,
          edgeCase: edge.name,
          runner: 'junit',
          description: `Process '${proc.name}' edge case '${edge.name}': ${edge.trigger} -> ${edge.expected}`,
        });
      }
    }

    // process-rollback: only if transactional
    if (proc.transactional) {
      tests.push({
        id: nextId(),
        category: 'process-rollback',
        process: proc.name,
        entity: proc.entity,
        runner: 'junit',
        description: `Process '${proc.name}' should rollback on failure`,
      });
    }
  }

  // Build summary
  const byCategory = {};
  const byRunner = { node: 0, junit: 0 };
  for (const t of tests) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    byRunner[t.runner] = (byRunner[t.runner] ?? 0) + 1;
  }

  return {
    tests,
    summary: {
      total: tests.length,
      byCategory,
      byRunner,
    },
  };
}


/**
 * Generate API prediction: predicts NEO Headless URLs, selectors, actions, and query params.
 */
export function generateApiPrediction(schema, frontendContract, backendContract) {
  const specName = toSpecName(schema.window.name);
  const baseUrl = `/sws/neo/${specName}`;

  const crud = {};
  const selectors = [];
  const actions = [];

  for (const entity of schema.entities) {
    const entityName = entity.name;
    const feEntity = frontendContract.entities[entityName];

    // CRUD — NEO Headless enables all methods by default via PopulateSpec
    crud[entityName] = {
      get: true,
      getById: true,
      post: true,
      put: true,
      patch: true,
      delete: true,
      listUrl: `${baseUrl}/${entityName}`,
      detailUrl: `${baseUrl}/${entityName}/{id}`,
      supportedFilters: feEntity ? feEntity.searchableFields : [],
    };

    // Selectors — FK fields that are visible (editable or readOnly)
    if (feEntity) {
      for (const field of feEntity.fields) {
        if (field.type === 'foreignKey') {
          selectors.push({
            entity: entityName,
            field: field.name,
            column: field.column,
            reference: field.reference,
            inputMode: field.inputMode,
            url: `${baseUrl}/${entityName}/selectors/${field.name}`,
          });
        }
      }
    }

    // Actions — fields with type "button" (AD_Reference_ID = 28)
    for (const field of entity.fields) {
      if (field.type === 'button') {
        const action = {
          entity: entityName,
          field: field.name,
          column: field.column,
          url: `${baseUrl}/${entityName}/{id}/action/${field.name}`,
        };
        if (field.processId) action.processId = field.processId;
        if (field.processType) action.processType = field.processType;
        actions.push(action);
      }
    }
  }

  // Deduplicate selectors and actions by entity+field (contract generator may iterate
  // the same entity multiple times if schema.entities contains duplicate entries)
  const seenSelectors = new Set();
  const dedupedSelectors = selectors.filter(s => {
    const key = `${s.entity}:${s.field}`;
    if (seenSelectors.has(key)) return false;
    seenSelectors.add(key);
    return true;
  });

  const seenActions = new Set();
  const dedupedActions = actions.filter(a => {
    const key = `${a.entity}:${a.field}`;
    if (seenActions.has(key)) return false;
    seenActions.add(key);
    return true;
  });

  return {
    specName,
    baseUrl,
    crud,
    selectors: dedupedSelectors,
    actions: dedupedActions,
    queryParams: {
      pagination: { startRow: '_startRow', endRow: '_endRow', default: '0-100' },
      sorting: { param: '_sortBy', example: `_sortBy=${specName}Date` },
      filtering: 'Use field name as query param: ?fieldName=value',
      parentFilter: 'parentId={id} for child entities',
    },
  };
}

/**
 * Main orchestrator: generates the full contract object.
 */
export function generateContract(schema, rules = [], processes = []) {
  const frontendContract = generateFrontendContract(schema, rules);
  const backendContract = generateBackendContract(schema, rules, processes);
  const testManifest = generateTestManifest(frontendContract, backendContract, rules, processes);
  const apiPrediction = generateApiPrediction(schema, frontendContract, backendContract);

  // Append apiPrediction-based tests to testManifest
  for (const [entityName, crud] of Object.entries(apiPrediction.crud)) {
    testManifest.tests.push({
      id: `t-${testManifest.tests.length + 1}`,
      category: 'crud-flags',
      entity: entityName,
      runner: 'node',
      description: `CRUD flags for '${entityName}' should all be booleans`,
    });
  }

  for (const sel of apiPrediction.selectors) {
    testManifest.tests.push({
      id: `t-${testManifest.tests.length + 1}`,
      category: 'selector-endpoint',
      entity: sel.entity,
      field: sel.field,
      runner: 'node',
      description: `Selector endpoint for '${sel.field}' in ${sel.entity} should exist`,
    });
  }

  for (const action of apiPrediction.actions) {
    testManifest.tests.push({
      id: `t-${testManifest.tests.length + 1}`,
      category: 'action-endpoint',
      entity: action.entity,
      field: action.field,
      runner: 'node',
      description: `Action endpoint for '${action.field}' in ${action.entity} should exist`,
    });
  }

  // Update summary counts after adding apiPrediction tests
  const updatedByCategory = {};
  const updatedByRunner = { node: 0, junit: 0 };
  for (const t of testManifest.tests) {
    updatedByCategory[t.category] = (updatedByCategory[t.category] ?? 0) + 1;
    updatedByRunner[t.runner] = (updatedByRunner[t.runner] ?? 0) + 1;
  }
  testManifest.summary = {
    total: testManifest.tests.length,
    byCategory: updatedByCategory,
    byRunner: updatedByRunner,
  };

  const contractData = { frontendContract, backendContract, apiPrediction, testManifest };
  const checksum = createHash('sha256')
    .update(JSON.stringify(contractData))
    .digest('hex')
    .slice(0, 16);

  return {
    version: schema.version ?? '0.1.0',
    generatedAt: new Date().toISOString(),
    checksum,
    ...contractData,
  };
}

// ---------------------------------------------------------------------------
// Process contract generation
// ---------------------------------------------------------------------------

const PROCESS_REFERENCE_MAP = {
  '15': { type: 'date', tsType: 'string', inputMode: 'date-picker' },
  '16': { type: 'datetime', tsType: 'string', inputMode: 'datetime-picker' },
  '10': { type: 'string', tsType: 'string', inputMode: 'text' },
  '14': { type: 'string', tsType: 'string', inputMode: 'text' },
  '11': { type: 'integer', tsType: 'number', inputMode: 'number' },
  '22': { type: 'number', tsType: 'number', inputMode: 'number' },
  '12': { type: 'amount', tsType: 'number', inputMode: 'number' },
  '800019': { type: 'number', tsType: 'number', inputMode: 'number' },
  '20': { type: 'boolean', tsType: 'boolean', inputMode: 'checkbox' },
  '17': { type: 'list', tsType: 'string', inputMode: 'select' },
  '19': { type: 'foreignKey', tsType: 'string', inputMode: 'search' },
  '18': { type: 'foreignKey', tsType: 'string', inputMode: 'search' },
  '30': { type: 'foreignKey', tsType: 'string', inputMode: 'search' },
  '800011': { type: 'foreignKey', tsType: 'string', inputMode: 'search' },
};

const DEFAULT_REFERENCE = { type: 'string', tsType: 'string', inputMode: 'text' };

/**
 * Map an AD_Reference_ID to type info for process parameters.
 */
export function mapProcessReference(referenceId) {
  return PROCESS_REFERENCE_MAP[String(referenceId)] ?? DEFAULT_REFERENCE;
}

/**
 * Generate a contract for a standalone process (not window-attached).
 *
 * @param {object} processRaw - The process-raw.json structure
 * @returns {object} Process contract
 */
export function generateProcessContract(processRaw) {
  const { process: proc, parameters: rawParams } = processRaw;
  const specName = toSpecName(proc.name);

  const parameters = rawParams.map(p => {
    const ref = mapProcessReference(p.referenceId);
    const param = {
      name: p.name,
      column: p.column,
      type: ref.type,
      tsType: ref.tsType,
      inputMode: ref.inputMode,
      required: p.mandatory === true,
      isRange: p.isRange === true,
    };
    if (p.defaultValue) param.defaultValue = p.defaultValue;
    if (p.referenceValueId) param.referenceValueId = p.referenceValueId;
    return param;
  });

  const apiPrediction = {
    specName,
    baseUrl: `/sws/neo/${specName}`,
    describe: `GET /sws/neo/${specName}`,
    execute: `POST /sws/neo/${specName}`,
  };

  // Build test manifest
  const tests = [];
  let idCounter = 0;
  const nextId = () => `t-${++idCounter}`;

  for (const param of parameters) {
    tests.push({
      id: nextId(),
      category: 'param-presence',
      param: param.name,
      runner: 'node',
      description: `Parameter '${param.name}' should be present`,
    });
  }

  for (const param of parameters) {
    tests.push({
      id: nextId(),
      category: 'param-type',
      param: param.name,
      expectedType: param.tsType,
      runner: 'node',
      description: `Parameter '${param.name}' should have type '${param.tsType}'`,
    });
  }

  tests.push({
    id: nextId(),
    category: 'execution-happy',
    runner: 'junit',
    description: `Process '${proc.name}' should execute successfully with valid parameters`,
  });

  tests.push({
    id: nextId(),
    category: 'execution-failure',
    runner: 'junit',
    description: `Process '${proc.name}' should fail with invalid parameters`,
  });

  const byCategory = {};
  const byRunner = { node: 0, junit: 0 };
  for (const t of tests) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    byRunner[t.runner] = (byRunner[t.runner] ?? 0) + 1;
  }

  const testManifest = {
    tests,
    summary: { total: tests.length, byCategory, byRunner },
  };

  const contractData = {
    type: 'process',
    process: {
      id: proc.id,
      name: proc.name,
      specName,
      uiPattern: proc.uiPattern,
      javaClassName: proc.javaClassName || null,
      isReport: proc.isReport === true,
    },
    parameters,
    apiPrediction,
    testManifest,
  };

  const checksum = createHash('sha256')
    .update(JSON.stringify(contractData))
    .digest('hex')
    .slice(0, 16);

  return {
    version: '0.1.0',
    generatedAt: new Date().toISOString(),
    checksum,
    ...contractData,
  };
}
