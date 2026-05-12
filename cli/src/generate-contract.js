import { createHash } from 'node:crypto';
import { toSpecName } from './push-to-neo.js';
import { autoSimplifyEntityName, reorderKeys, WINDOW_KEY_ORDER } from './resolve-curated.js';

// Slug helper for deterministic test IDs: collapse non-alphanumerics to hyphens, trim.
const slug = (s) => String(s ?? '')
  .replace(/[^A-Za-z0-9]+/g, '-')
  .replace(/(?:^-)|(?:-$)/g, '');

// Factory for monotonically-disambiguating ID maker. Each call returns a fresh closure
// so different generators don't share state.
function createIdMaker() {
  const seenIds = new Set();
  return (...parts) => {
    const base = `t-${parts.map(slug).filter(Boolean).join('-')}`;
    if (!seenIds.has(base)) { seenIds.add(base); return base; }
    let n = 2;
    while (seenIds.has(`${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    seenIds.add(id);
    return id;
  };
}

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
 * Convert an Etendo readOnly/displayLogic expression into a JS expression string.
 * Uses a column→propertyName map built from the schema to resolve @Column@ references.
 * Falls back to camelCase of the column name when not found in the map.
 */
function convertLogicToJs(rawExpr, columnMap, booleanFields) {
  const boolSet = new Set(booleanFields || []);
  // Helper: for Y/N comparisons on boolean fields, use true/false instead of string
  function eqExpr(col, val) {
    const prop = columnMap[col] ?? (col.charAt(0).toLowerCase() + col.slice(1));
    if ((val === 'Y' || val === 'N') && boolSet.has(prop)) {
      return val === 'Y' ? `record['${prop}'] === true` : `record['${prop}'] !== true`;
    }
    return `record['${prop}'] === '${val}'`;
  }
  function neqExpr(col, val) {
    const prop = columnMap[col] ?? (col.charAt(0).toLowerCase() + col.slice(1));
    if ((val === 'Y' || val === 'N') && boolSet.has(prop)) {
      return val === 'Y' ? `record['${prop}'] !== true` : `record['${prop}'] === true`;
    }
    return `record['${prop}'] !== '${val}'`;
  }
  return rawExpr
    .replace(/@(\w+)@='([^']+)'/g, (_, col, val) => eqExpr(col, val))
    .replace(/@(\w+)@!='([^']+)'/g, (_, col, val) => neqExpr(col, val))
    .replace(/@(\w+)@!'([^']+)'/g, (_, col, val) => neqExpr(col, val))
    .replace(/\s*\|\s*/g, ' || ')
    .replace(/\s*&\s*/g, ' && ');
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
    // SQL-computed auxiliary fields (HAS_* are server-only boolean checks)
    'HAS_C_INVOICELINES', 'HAS_M_INOUTLINES', 'HAS_C_ORDERLINES',
    // Payment module session variables
    'IsMultiCurrencyEnabled', 'NotAllowChangeExchange', 'isReceipt',
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

  // Build a column→propertyName map from all entities for readOnly/display logic JS conversion
  // Curated fields use field.column (the DB column name) and field.name (the JS property name)
  const columnMap = {};
  const booleanFields = [];
  for (const entity of schema.entities) {
    for (const field of entity.fields ?? []) {
      const col = field.column || field.columnName;
      if (col && field.name) columnMap[col] = field.name;
      if (field.type === 'boolean') booleanFields.push(field.name);
    }
  }

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
      if (f.sourceRequired === true) mapped.sourceRequired = true;
      if (f.derivation) mapped.derivation = f.derivation;
      if (f.columnType) mapped.columnType = f.columnType;
      if (f.reference) mapped.reference = f.reference;
      if (f.enumValues) mapped.enumValues = f.enumValues;
      if (f.inputMode) mapped.inputMode = f.inputMode;
      if (f.dependsOn) mapped.dependsOn = f.dependsOn;
      if (f.lookup) mapped.lookup = true;
      if (f.popup) mapped.popup = true;
      if (Array.isArray(f.forceCalloutFields) && f.forceCalloutFields.length > 0) mapped.forceCalloutFields = f.forceCalloutFields;

      // UI hints
      if (f.defaultValue !== undefined) mapped.defaultValue = f.defaultValue;
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
      if (f.badgeLabels) mapped.badgeLabels = f.badgeLabels;
      if (f.badgeColors) mapped.badgeColors = f.badgeColors;
      if (f.badgeVariants) mapped.badgeVariants = f.badgeVariants;
      if (f.enumVariants) mapped.enumVariants = f.enumVariants;
      if (f.labels) mapped.labels = f.labels;
      if (f.summable) mapped.summable = true;
      if (f.display) mapped.display = f.display;
      if (f.cellType) mapped.cellType = f.cellType;
      if (f.gridOrder != null) mapped.gridOrder = f.gridOrder;

      // Behavioral metadata: validationRule (e.g. M_PriceList.issopricelist = @isSOTrx@)
      if (f.validationRule) mapped.validationRule = f.validationRule;

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
        // but only when evaluable — if not evaluable, js must remain null
        if (f.displayLogicJs != null && mapped.displayLogic.evaluable !== false) {
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
        } else if (!mapped.readOnlyLogic.js) {
          mapped.readOnlyLogic.js = convertLogicToJs(f.readOnlyLogic, columnMap, booleanFields);
        }
      }
      // Prefer explicit readOnlyLogicJs from decisions over AD-expression translation
      if (f.readOnlyLogicJs != null) {
        if (!mapped.readOnlyLogic) mapped.readOnlyLogic = {};
        mapped.readOnlyLogic.js = f.readOnlyLogicJs;
        mapped.readOnlyLogic.evaluable = true;
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
    if (entity.formCols != null) feEntity.formCols = entity.formCols;
    entities[entity.name] = feEntity;
  }

  // Include layoutType from curated schema; default to "default" when absent
  const win = { ...schema.window };
  win.layoutType = schema.window.layoutType ?? 'default';

  // Include templateConfig only for layout types that use it
  if (win.layoutType === 'kanban' || win.layoutType === 'calendar') {
    win.templateConfig = schema.window.templateConfig ?? null;
  }

  // Lines tab layout. "classic" preserves the side-panel edit flow; "inlineEditable"
  // uses InlineLinesPanel for in-place row editing. Defaults to "classic" so windows
  // that don't opt in are unaffected.
  win.linesLayout = schema.window.linesLayout ?? 'classic';

  return { window: reorderKeys(win, WINDOW_KEY_ORDER), entities };
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

  return { window: reorderKeys(schema.window, WINDOW_KEY_ORDER), entities, endpoints, processEndpoints };
}

/**
 * Generate test manifest from contracts, rules, and processes.
 */
export function generateTestManifest(frontendContract, backendContract, rules = [], processes = []) {
  const tests = [];
  const makeId = createIdMaker();

  // Derive system fields from backend minus frontend
  for (const [entityName, entityData] of Object.entries(frontendContract.entities)) {
    const visibleFields = entityData.fields;

    // field-presence: one per visible field
    for (const field of visibleFields) {
      tests.push({
        id: makeId('field-presence', entityName, field.name),
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
        id: makeId('field-type', entityName, field.name),
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
        id: makeId('searchable-filters', entityName, fieldName),
        category: 'searchable-filters',
        entity: entityName,
        field: fieldName,
        runner: 'node',
        description: `Field '${fieldName}' should be a supported filter for ${entityName}`,
      });
    }

    // visibility: one per entity
    tests.push({
      id: makeId('visibility', entityName),
      category: 'visibility',
      entity: entityName,
      runner: 'node',
      description: `Entity '${entityName}' should only expose visible fields in frontend`,
    });

    // displayLogic validity: one per field with displayLogic
    for (const field of visibleFields) {
      if (field.displayLogic) {
        tests.push({
          id: makeId('displaylogic-valid', entityName, field.name),
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
          id: makeId('readonlylogic-valid', entityName, field.name),
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
          id: makeId('displaylogic-evaluable', entityName, field.name),
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
          id: makeId('readonlylogic-evaluable', entityName, field.name),
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
          id: makeId('default-value-type', entityName, field.name),
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
          id: makeId('system-field', entityName, field.name),
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
      id: makeId('rule-declared', rule.name),
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
      id: makeId('process-happy', proc.name),
      category: 'process-happy',
      process: proc.name,
      entity: proc.entity,
      runner: 'junit',
      description: `Process '${proc.name}' should complete successfully with valid preconditions`,
    });

    // process-failure
    tests.push({
      id: makeId('process-failure', proc.name),
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
          id: makeId('process-edge', proc.name, edge.name),
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
        id: makeId('process-rollback', proc.name),
        category: 'process-rollback',
        process: proc.name,
        entity: proc.entity,
        runner: 'junit',
        description: `Process '${proc.name}' should rollback on failure`,
      });
    }
  }

  // Sort by id for deterministic ordering across regens
  tests.sort((a, b) => a.id.localeCompare(b.id));

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
    _makeId: makeId,
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

  const result = {
    specName,
    baseUrl,
    crud,
    selectors: dedupedSelectors,
    actions: dedupedActions,
    queryParams: {
      pagination: { startRow: '_startRow', endRow: '_endRow', default: '0-100' },
      sorting: { param: '_sortBy', example: '_sortBy=creationDate desc' },
      filtering: 'Use field name as query param: ?fieldName=value',
      parentFilter: 'parentId={id} for child entities',
    },
  };

  // Forward window.category so components can derive isSOTrx for selector filtering
  if (schema.window.category) {
    result.window = { category: schema.window.category };
  }

  // Forward labelOverrides from the window config so generated components can apply per-window label overrides
  if (schema.window.labelOverrides) {
    result.labelOverrides = schema.window.labelOverrides;
  }

  return result;
}

/**
 * Lock field order per entity to the previous contract so UI generation stays stable
 * across re-extractions. Uses the previous backend contract as canonical order (superset
 * including system/discarded fields). New fields land at the end (alpha-sorted); removed
 * fields drop out naturally. Duplicate field names are matched sequentially.
 */
function lockFieldOrderToPreviousContract(schema, previousContract) {
  const prevBE = previousContract?.backendContract?.entities;
  if (!prevBE) return;
  for (const entity of schema.entities ?? []) {
    const prevFields = prevBE[entity.name]?.fields;
    if (!Array.isArray(entity.fields) || !Array.isArray(prevFields) || prevFields.length === 0) continue;
    entity.fields = reorderFieldsByPrev(entity.fields, prevFields);
  }
}

function reorderFieldsByPrev(currentFields, prevFields) {
  const positionsByName = new Map();
  prevFields.forEach((f, i) => {
    if (!positionsByName.has(f.name)) positionsByName.set(f.name, []);
    positionsByName.get(f.name).push(i);
  });
  const consumed = new Map();
  const rank = new WeakMap();
  for (const f of currentFields) {
    const positions = positionsByName.get(f.name);
    const used = consumed.get(f.name) ?? 0;
    if (positions && used < positions.length) {
      rank.set(f, positions[used]);
      consumed.set(f.name, used + 1);
    } else {
      rank.set(f, Infinity);
    }
  }
  return currentFields.slice().sort((a, b) => {
    const ia = rank.get(a);
    const ib = rank.get(b);
    if (ia !== ib) return ia - ib;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * Main orchestrator: generates the full contract object.
 */
export function generateContract(schema, rules = [], processes = [], previousVersion = null, previousContract = null) {
  lockFieldOrderToPreviousContract(schema, previousContract);

  const frontendContract = generateFrontendContract(schema, rules);
  const backendContract = generateBackendContract(schema, rules, processes);
  const testManifest = generateTestManifest(frontendContract, backendContract, rules, processes);
  const apiPrediction = generateApiPrediction(schema, frontendContract, backendContract);

  // Append apiPrediction-based tests to testManifest using stable IDs
  const makeId = testManifest._makeId;
  for (const [entityName, crud] of Object.entries(apiPrediction.crud)) {
    testManifest.tests.push({
      id: makeId('crud-flags', entityName),
      category: 'crud-flags',
      entity: entityName,
      runner: 'node',
      description: `CRUD flags for '${entityName}' should all be booleans`,
    });
  }

  for (const sel of apiPrediction.selectors) {
    testManifest.tests.push({
      id: makeId('selector-endpoint', sel.entity, sel.field),
      category: 'selector-endpoint',
      entity: sel.entity,
      field: sel.field,
      runner: 'node',
      description: `Selector endpoint for '${sel.field}' in ${sel.entity} should exist`,
    });
  }

  for (const action of apiPrediction.actions) {
    testManifest.tests.push({
      id: makeId('action-endpoint', action.entity, action.field),
      category: 'action-endpoint',
      entity: action.entity,
      field: action.field,
      runner: 'node',
      description: `Action endpoint for '${action.field}' in ${action.entity} should exist`,
    });
  }
  delete testManifest._makeId;

  // Re-sort after appending apiPrediction tests
  testManifest.tests.sort((a, b) => a.id.localeCompare(b.id));

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

  const now = new Date().toISOString();
  const generatedAt = previousContract?.generatedAt ?? now;
  const checksumChanged = previousContract && previousContract.checksum !== checksum;
  const result = {
    version: previousVersion ?? schema.version ?? '0.1.0',
    generatedAt,
  };
  if (checksumChanged) {
    result.updatedAt = now;
  } else if (previousContract?.updatedAt) {
    result.updatedAt = previousContract.updatedAt;
  }
  result.checksum = checksum;
  Object.assign(result, contractData);
  return result;
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
export function generateProcessContract(processRaw, previousContract = null) {
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

  // Build test manifest with deterministic IDs
  const tests = [];
  const makeId = createIdMaker();

  for (const param of parameters) {
    tests.push({
      id: makeId('param-presence', param.name),
      category: 'param-presence',
      param: param.name,
      runner: 'node',
      description: `Parameter '${param.name}' should be present`,
    });
  }

  for (const param of parameters) {
    tests.push({
      id: makeId('param-type', param.name),
      category: 'param-type',
      param: param.name,
      expectedType: param.tsType,
      runner: 'node',
      description: `Parameter '${param.name}' should have type '${param.tsType}'`,
    });
  }

  tests.push({
    id: makeId('execution-happy'),
    category: 'execution-happy',
    runner: 'junit',
    description: `Process '${proc.name}' should execute successfully with valid parameters`,
  });

  tests.push({
    id: makeId('execution-failure'),
    category: 'execution-failure',
    runner: 'junit',
    description: `Process '${proc.name}' should fail with invalid parameters`,
  });

  tests.sort((a, b) => a.id.localeCompare(b.id));

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

  const now = new Date().toISOString();
  const generatedAt = previousContract?.generatedAt ?? now;
  const checksumChanged = previousContract && previousContract.checksum !== checksum;
  const result = {
    version: '0.1.0',
    generatedAt,
  };
  if (checksumChanged) {
    result.updatedAt = now;
  } else if (previousContract?.updatedAt) {
    result.updatedAt = previousContract.updatedAt;
  }
  result.checksum = checksum;
  Object.assign(result, contractData);
  return result;
}
