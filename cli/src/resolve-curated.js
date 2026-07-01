/**
 * resolve-curated.js
 *
 * Core algorithm: raw schema + raw rules + decisions -> curated schema + curated rules in memory.
 * No DB access. Zero external dependencies beyond Node.js built-ins and project imports.
 *
 * Exports:
 *   resolveCurated(schemaRaw, rulesRaw, decisions) -> { schema, rules }
 *   autoSimplifyEntityName(rawName) -> string
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyRule } from './pre-classify.js';
import { toCamelCase } from './utils.js';
import { migrateDecisions, needsMigration, getVersion } from './migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Entity name helpers
// ---------------------------------------------------------------------------

/**
 * Strip common lowercase prefixes (c, m, ad) if followed by an uppercase letter.
 * cOrder -> order, cOrderLine -> orderLine, mProduct -> product, adUser -> user
 */
export function autoSimplifyEntityName(rawName) {
  if (!rawName) return rawName;
  // Replace slashes with camelCase join: "vendor/creditor" → "vendorCreditor"
  let name = rawName.includes('/')
    ? rawName.split('/').map((seg, i) => i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)).join('')
    : rawName;
  const match = name.match(/^(c|m|ad)([A-Z].*)$/);
  if (match) {
    const rest = match[2];
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Catalog name helpers
// ---------------------------------------------------------------------------

const TABLE_PREFIXES = ['APRM_', 'OBUISEL_', 'FIN_', 'EM_', 'AD_', 'C_', 'M_', 'A_'];

/**
 * Derive a catalog name from a targetTable string by stripping known prefixes.
 * C_BPartner -> BPartner, AD_Org -> Org, M_PriceList -> PriceList
 */
function autoDeriveCatalogName(targetTable) {
  if (!targetTable) return null;
  let name = targetTable;
  for (const prefix of TABLE_PREFIXES) {
    if (name.toUpperCase().startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  return name || null;
}

// ---------------------------------------------------------------------------
// Input mode helpers
// ---------------------------------------------------------------------------

/**
 * Determine default inputMode for a FK field when not overridden by decisions.
 * dependsOn in decision -> dependent (handled before this function is called)
 */
function defaultInputMode(field) {
  const refType = field.reference?.type;
  if (!refType) return 'selector';
  switch (refType) {
    case 'TableDir': return 'selector';
    case 'Table': return 'search';
    case 'Search': return 'search';
    case 'Selector': return 'selector';
    default: return 'selector';
  }
}

// ---------------------------------------------------------------------------
// discardPatterns helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if columnName matches a glob pattern.
 * Supported: trailing * (prefix match) and leading * (suffix match).
 * Exact match for patterns without *.
 */
function matchesGlob(columnName, pattern) {
  const col = columnName.toLowerCase();
  const pat = pattern.toLowerCase();
  if (pat.endsWith('*')) {
    return col.startsWith(pat.slice(0, -1));
  }
  if (pat.startsWith('*')) {
    return col.endsWith(pat.slice(1));
  }
  return col === pat;
}

function isDiscardedByPattern(columnName, discardPatterns) {
  if (!discardPatterns || discardPatterns.length === 0) return false;
  for (const pattern of discardPatterns) {
    if (matchesGlob(columnName, pattern)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Field defaults
// ---------------------------------------------------------------------------

/**
 * Defaults for grid/form/searchable based on visibility class.
 */
function visibilityDefaults(visibility) {
  switch (visibility) {
    case 'editable':
      return { grid: false, form: true, searchable: false };
    case 'readOnly':
      return { grid: false, form: true, searchable: false };
    case 'system':
    case 'discarded':
    default:
      return { grid: false, form: false, searchable: false };
  }
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

function inferCategory(windowName = '') {
  const name = windowName || '';
  if (/Sales/i.test(name)) return 'sales';
  if (/Purchase/i.test(name)) return 'purchases';
  if (/Invoice/i.test(name)) return 'finance';
  if (/Inventory|Stock|Warehouse/i.test(name)) return 'inventory';
  if (/Account|Journal|Ledger/i.test(name)) return 'accounting';
  if (/Product|Price|BOM/i.test(name)) return 'master';
  if (/Project/i.test(name)) return 'project';
  return 'general';
}

// ---------------------------------------------------------------------------
// Field builder
// ---------------------------------------------------------------------------

const FIELD_DECISION_COPY_PROPS = [
  'badgeLabels',
  'badgeColors',
  'badgeVariants',
  'enumVariants',
  'enumValues',
  'filterOnly',
  'filterable',
  'labels',
  'clearsField',
  // HandleDefaults opt-out: the add-row never applies a backend-resolved default
  // value to this field (it keeps its literal seed / stays empty).
  'skipDefault',
  'columnType',
  'display',
  'cellType',
  // Field-level helper text shown below the input (i18n key or literal). Honored
  // by EntityForm (FieldHelp) and the list-modal footer toggle helper.
  'help',
  // Input placeholder (i18n key or literal) rendered by EntityForm on empty
  // text inputs / textareas — e.g. "Ej. Comisiones bancarias".
  'placeholderKey',
  // Label (i18n key) for the empty/null choice of an optional FK selector —
  // e.g. "All accounts" for a nullable financial-account field.
  'emptyOptionLabelKey',
  // list-modal cell-renderer extras (see listModalCells.jsx / generate-frontend.js):
  'subField',
  'subPrefix',
  // i18n key shown in a nameWithSubline cell when subField resolves to empty
  // (e.g. an unset financial-account scope → "Todas las cuentas").
  'subEmptyKey',
  'kindField',
  'patternField',
  'kindLabels',
  'tones',
  'gridLabelKey',
  'grow',
  'columnWidth',
  'gridReadOnly',
  'inlineToggle',
  'inlineEdit',
  'noTrailing',
  'inline',
  'addLineFromSibling',
  // Selector exclusion: filter out the option whose id equals the current value of
  // another field on the same row (e.g. newStorageBin excludeValueOf storageBin —
  // can't move stock to the same bin it came from).
  'excludeValueOf',
  'agentPrompt',
  // Opt-in: render an FK `inputMode: "selector"` field as the searchable combobox
  // (CreatableSearchSelect) instead of the plain pick-only dropdown (SelectorInput).
  // Default false — absent/false keeps the existing dropdown rendering unchanged.
  'searchSelect',
  // Opt-in: when true on a searchSelect field, the combobox shows the inline
  // "+ create" action. Requires createSpec/createEntity to know where to POST.
  'allowCreate',
  // Custom React component to use as the field renderer inside EntityForm.
  // Value is the component name (string); the generator emits an import + the
  // reference in the fields array. EntityForm renders <ComponentName value={...}
  // onChange={...} record={data} readOnly={isReadOnly} /> instead of the default input.
  'customRenderer',
  // i18n key for the inline "+ create" action label (e.g. "+ New transaction type").
  'createLabelKey',
  // i18n keys for the inline-create modal: dialog title + name-input placeholder.
  'createTitleKey',
  'createNamePlaceholderKey',
  // NEO spec + entity that back the inline create POST. The new record is created
  // via POST /sws/neo/<createSpec>/<createEntity> with { name }, then auto-selected.
  'createSpec',
  'createEntity',
];

const FIELD_RAW_COPY_PROPS = [
  'derivation',
  'enumValues',
  'processId',
  'processType',
];

function resolveFieldVisibility(rawField, fieldDecision, discardPatterns) {
  const columnName = rawField.columnName || rawField.column || '';
  const discardedByPattern = isDiscardedByPattern(columnName, discardPatterns);
  return fieldDecision.visibility || (discardedByPattern ? 'discarded' : rawField.visibility);
}

function decisionOrDefault(fieldDecision, key, defaults) {
  return fieldDecision[key] === undefined ? defaults[key] : fieldDecision[key];
}

function buildBaseField(rawField, fieldDecision, visibility) {
  const defaults = visibilityDefaults(visibility);
  const field = {
    name: fieldDecision.name || rawField.name,
    column: rawField.columnName,
    label: fieldDecision.label || rawField.label,
    type: fieldDecision.type || (rawField.type === 'id' ? 'id' : rawField.type),
    visibility,
    required: fieldDecision.required === undefined ? (rawField.mandatory || false) : fieldDecision.required,
    grid: decisionOrDefault(fieldDecision, 'grid', defaults),
    form: decisionOrDefault(fieldDecision, 'form', defaults),
    searchable: decisionOrDefault(fieldDecision, 'searchable', defaults),
  };
  if (rawField.mandatory === true) field.sourceRequired = true;
  if (fieldDecision.type) field.explicitType = true;
  return field;
}

function copyTruthyDecisionProps(field, fieldDecision, props) {
  for (const prop of props) {
    if (fieldDecision[prop]) field[prop] = fieldDecision[prop];
  }
}

function copyRawProps(field, rawField, props) {
  for (const prop of props) {
    if (rawField[prop]) field[prop] = rawField[prop];
  }
}

function applyFieldDecisionProps(field, fieldDecision) {
  if (fieldDecision.section) field.section = fieldDecision.section;
  if (fieldDecision.seq != null) field.seq = fieldDecision.seq;
  if (fieldDecision.span != null && fieldDecision.span >= 2 && fieldDecision.span <= 4) field.span = fieldDecision.span;
  if (fieldDecision.rows != null && fieldDecision.rows > 0) field.rows = fieldDecision.rows;
  if (fieldDecision.filterable === false) field.filterable = false;
  if (fieldDecision.dot === false) field.dot = false;
  if (fieldDecision.badge) field.badge = true;
  if (fieldDecision.summable) field.summable = true;
  if (fieldDecision.businessCritical) field.businessCritical = true;
  if (fieldDecision.gridOrder != null) field.gridOrder = fieldDecision.gridOrder;
  if (fieldDecision.min !== undefined) field.min = fieldDecision.min;
  if (fieldDecision.max !== undefined) field.max = fieldDecision.max;
  copyTruthyDecisionProps(field, fieldDecision, FIELD_DECISION_COPY_PROPS);
}

function applyForeignKeyLookupProps(field, fieldDecision) {
  if (fieldDecision.lookup) field.lookup = true;
  if (fieldDecision.popup) field.popup = true;
  if (fieldDecision.lookupDrawer) field.lookupDrawer = fieldDecision.lookupDrawer;
  if (fieldDecision.lookupTitle) field.lookupTitle = fieldDecision.lookupTitle;
  const hasMappings = Array.isArray(fieldDecision.onSelectMappings) && fieldDecision.onSelectMappings.length > 0;
  if (hasMappings) field.onSelectMappings = fieldDecision.onSelectMappings;
  if (fieldDecision.displayFromCatalog) field.displayFromCatalog = fieldDecision.displayFromCatalog;
}

function applyForeignKeyProps(field, rawField, fieldDecision) {
  if (rawField.type !== 'foreignKey') return;

  if (fieldDecision.reference !== null) {
    const catalogName = fieldDecision.reference
      || autoDeriveCatalogName(rawField.reference?.targetTable)
      || null;
    if (catalogName) field.reference = catalogName;
  }

  if (fieldDecision.inputMode !== null) {
    const dependsOn = fieldDecision.dependsOn || null;
    field.inputMode = dependsOn ? 'dependent' : fieldDecision.inputMode || defaultInputMode(rawField);
  }
  if (fieldDecision.clearable === false) field.clearable = false;

  const dependsOn = fieldDecision.dependsOn || null;
  if (dependsOn) field.dependsOn = dependsOn;

  applyForeignKeyLookupProps(field, fieldDecision);
}

function applyVisibleFieldProps(field, rawField, fieldDecision) {
  const readOnlyLogic = fieldDecision.readOnlyLogic === undefined
    ? (rawField.readOnlyLogic || null)
    : (fieldDecision.readOnlyLogic || rawField.readOnlyLogic || null);
  if (readOnlyLogic) field.readOnlyLogic = readOnlyLogic;

  if (fieldDecision.displayLogic !== null) {
    const displayLogic = fieldDecision.displayLogic || rawField.displayLogic || null;
    if (displayLogic) field.displayLogic = displayLogic;
  }

  if (fieldDecision.displayLogicJs != null) {
    field.displayLogicJs = fieldDecision.displayLogicJs;
  }
  if (fieldDecision.readOnlyLogicJs != null) {
    field.readOnlyLogicJs = fieldDecision.readOnlyLogicJs;
  }
  if (rawField.callout) field.callout = rawField.callout;
  if (rawField.validationRule) field.validationRule = rawField.validationRule;
}

function isVisibleField(visibility) {
  return visibility !== 'system' && visibility !== 'discarded';
}

/**
 * Build a curated field object from a raw field + merged decisions.
 * Prunes all null/undefined properties before returning.
 */
function buildCuratedField(rawField, fieldDecision, discardPatterns) {
  const visibility = resolveFieldVisibility(rawField, fieldDecision, discardPatterns);
  const field = buildBaseField(rawField, fieldDecision, visibility);
  const isVisible = isVisibleField(visibility);

  applyFieldDecisionProps(field, fieldDecision);
  if (isVisible) applyForeignKeyProps(field, rawField, fieldDecision);

  // forceCalloutFields is not FK-specific — any visible field that triggers a callout
  // may declare which fields the callout result should always override.
  if (isVisible && Array.isArray(fieldDecision.forceCalloutFields) && fieldDecision.forceCalloutFields.length > 0)
    field.forceCalloutFields = fieldDecision.forceCalloutFields;

  if (rawField.defaultValue !== undefined) {
    field.defaultValue = rawField.defaultValue;
  }

  if (isVisible) applyVisibleFieldProps(field, rawField, fieldDecision);
  copyRawProps(field, rawField, FIELD_RAW_COPY_PROPS);

  // Allow decisions to explicitly suppress a raw derivation by setting derivation: null.
  // This is needed when a field transitions from system/readOnly (auto-derived) to editable
  // (user-provided), so NEO does not override the user's value on save.
  if (Object.prototype.hasOwnProperty.call(fieldDecision, 'derivation') && fieldDecision.derivation === null) {
    delete field.derivation;
  }

  // Decisions can override raw-copied process routing (e.g. swap obuiapp JS handler
  // for a classic stored-procedure process that NEO can actually execute).
  if (fieldDecision.processId) field.processId = fieldDecision.processId;
  if (fieldDecision.processType) field.processType = fieldDecision.processType;

  return field;
}

// ---------------------------------------------------------------------------
// Rules resolver
// ---------------------------------------------------------------------------

/**
 * Resolve rules for the curated output.
 *
 * Strategy:
 * - If decisions.rules is non-empty: use it as the complete rules list.
 *   Rules in decisions are keyed by the canonical name used in the curated schema
 *   (which may include the trigger-column suffix, e.g. "SL_Order_Amt_QtyOrdered").
 *   Each entry is emitted as a rule object with the name injected.
 * - If decisions.rules is empty: auto-classify raw rules via pre-classify.js,
 *   deduplicating by (name + triggerColumn) into a unique extended name.
 */
function resolveRules(rulesRaw, decisions) {
  const ruleDecisions = decisions.rules || {};

  // When decisions has explicit rules, use them as the complete curated list.
  // This preserves human-crafted naming conventions (e.g. extended names that include
  // the trigger column) and avoids re-deriving from raw rules which may have different
  // naming schemes.
  if (Object.keys(ruleDecisions).length > 0) {
    return Object.entries(ruleDecisions).map(([ruleName, dec]) => {
      const rule = { name: ruleName };
      if (dec.type) rule.type = dec.type;
      if (dec.entity) rule.entity = dec.entity;
      if (dec.decision) rule.decision = dec.decision;
      if (dec.description) rule.description = dec.description;
      if (dec.impactIfOmitted) rule.impactIfOmitted = dec.impactIfOmitted;
      if (dec.translated) rule.translated = dec.translated;
      return rule;
    });
  }

  // No decisions yet — auto-classify raw rules (first-time window, no /classify run yet).
  // Produce one entry per unique (name + triggerColumn) pair.
  const rawRulesList = rulesRaw?.rules || [];
  const result = [];
  const seen = new Set();

  for (const rawRule of rawRulesList) {
    const extName = rawRule.triggerColumn
      ? `${rawRule.name}_${rawRule.triggerColumn}`
      : rawRule.name;
    if (seen.has(extName)) continue;
    seen.add(extName);

    const classified = classifyRule(rawRule);
    const decision = classified.tier === 'auto'
      ? determineAutoDecision(classified)
      : 'pending';

    result.push({
      name: extName,
      type: rawRule.type,
      decision,
    });
  }

  return result;
}

function determineAutoDecision(classified) {
  return classified.autoDecision === 'keep' ? 'Keep' : 'Omit';
}

// ---------------------------------------------------------------------------
// Entity decision matching (backward compatible with tableName-based keys)
// ---------------------------------------------------------------------------

/**
 * Find the decisions entry for a raw entity, trying multiple matching strategies.
 * This ensures backward compatibility when old decisions use tableName-based keys
 * (e.g., "cOrder") but the raw schema now uses tabName-based keys (e.g., "header").
 *
 * @param {Object} rawEntity - Raw entity with name, tableName properties
 * @param {Object} entitiesDecisions - The decisions.entities map
 * @returns {Object} The matching decision object, or {} if none found
 */
function findEntityDecision(rawEntity, entitiesDecisions) {
  // 1. Exact match by current name (tabName-based)
  if (entitiesDecisions[rawEntity.name]) return entitiesDecisions[rawEntity.name];

  // 2. Match by auto-simplified name (handles slash-named entities like "location/address" → "locationAddress")
  const autoSimplified = autoSimplifyEntityName(rawEntity.name);
  if (autoSimplified !== rawEntity.name && entitiesDecisions[autoSimplified]) {
    return entitiesDecisions[autoSimplified];
  }

  // 3. Fallback: match by tableName derivation (handles unmigrated decisions)
  if (rawEntity.tableName) {
    const tableBasedKey = toCamelCase(rawEntity.tableName);
    if (entitiesDecisions[tableBasedKey]) return entitiesDecisions[tableBasedKey];

    // Also try the auto-simplified version (strips c/m/ad prefix)
    const simplified = autoSimplifyEntityName(tableBasedKey);
    if (simplified !== tableBasedKey && entitiesDecisions[simplified]) {
      return entitiesDecisions[simplified];
    }
  }

  // 4. Match by name override in decision value
  for (const [, decVal] of Object.entries(entitiesDecisions)) {
    if (decVal.name === rawEntity.name) return decVal;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Entity resolver helpers
// ---------------------------------------------------------------------------

function findFieldDecision(rawField, fieldsDecisions) {
  const fieldDecision = fieldsDecisions[rawField.name];
  if (fieldDecision || !rawField.columnName) return fieldDecision || {};

  for (const [, decVal] of Object.entries(fieldsDecisions)) {
    if (decVal.name === rawField.name) return decVal;
  }

  return {};
}

function buildCuratedFields(rawEntity, fieldsDecisions, discardPatterns) {
  return (rawEntity.fields || []).map(rawField => {
    const fieldDecision = findFieldDecision(rawField, fieldsDecisions);
    return buildCuratedField(rawField, fieldDecision, discardPatterns);
  });
}

function orderCuratedFields(curatedFields, fieldsDecisions) {
  const hasOrderOverrides = Object.values(fieldsDecisions).some(decision => decision.order != null);
  if (!hasOrderOverrides) return curatedFields;

  return curatedFields.slice().sort((a, b) => {
    const oa = fieldsDecisions[a.name]?.order ?? Infinity;
    const ob = fieldsDecisions[b.name]?.order ?? Infinity;
    return oa - ob;
  });
}

function buildDraftMode(draftModeDecision, enabled) {
  const draftMode = {
    enabled,
    processField: draftModeDecision.processField || 'documentAction',
    processValue: draftModeDecision.processValue || 'CO',
    label: draftModeDecision.label || 'Process',
  };
  if (Array.isArray(draftModeDecision.completedStatuses)) {
    draftMode.completedStatuses = draftModeDecision.completedStatuses;
  }
  if (draftModeDecision.confirmModal) {
    draftMode.confirmModal = draftModeDecision.confirmModal;
  }
  if (draftModeDecision.disableWhenEmpty) {
    draftMode.disableWhenEmpty = true;
  }
  if (draftModeDecision.extraParams && typeof draftModeDecision.extraParams === 'object') {
    draftMode.extraParams = draftModeDecision.extraParams;
  }
  return draftMode;
}

function applyEntityDecisions(entity, entityDecision) {
  if (entityDecision.javaQualifier) {
    entity.javaQualifier = entityDecision.javaQualifier;
  }
  if (entityDecision.draftMode) {
    entity.draftMode = buildDraftMode(
      entityDecision.draftMode,
      entityDecision.draftMode.enabled === true,
    );
  }
  if (entityDecision.formCols != null) {
    entity.formCols = entityDecision.formCols;
  }
  // HandleDefaults opt-out: carry an explicit false so the contract/frontend can
  // skip fetching line /defaults for this entity. Default (absent) stays on.
  if (entityDecision.handlesDefaults === false) {
    entity.handlesDefaults = false;
  }
}

/**
 * Append virtual fields declared in decisions.json to a curated field list.
 *
 * Virtual fields are fields that do NOT exist as columns in the AD schema (e.g. M_InOut)
 * but are injected at runtime by a NeoHandler's afterHandle hook. They are the equivalent
 * of Etendo computed columns when the AD version does not support iscomputed, or when the
 * derivation logic lives in Java rather than SQL.
 *
 * Declaration in decisions.json (entities.header or entities.lines):
 *   "virtualFields": [
 *     {
 *       "name": "sourceShipmentDocNo",   // field key used in API response + frontend
 *       "column": "sourceShipmentDocNo", // must match what afterHandle puts in the JSON
 *       "label": "Source Shipment",      // raw label; translated via labelOverrides
 *       "type": "string",                // contract type: string | number | date | boolean
 *       "visibility": "readOnly",        // always readOnly — handler fills the value
 *       "form": true,                    // show in the detail form?
 *       "grid": true,                    // show in the list grid?
 *       "gridOrder": 6,                  // insertion position in the grid (1-based)
 *       "section": "principal"           // form section: principal | other | collapsed
 *     }
 *   ]
 *
 * Rules:
 * - Virtual fields are appended AFTER schema-derived fields; orderCuratedFields then
 *   applies gridOrder sorting the same way as for regular fields.
 * - The NeoHandler MUST inject the value in afterHandle. NEO will NOT derive it from
 *   the DB automatically (no AD column → no OBDal property → no automatic value).
 * - Keep "visibility": "readOnly" — there is no DB column to write to.
 * - "column" value must exactly match the key the handler puts in the JSON object.
 */
function appendVirtualFields(curatedFields, entityDecision) {
  for (const vf of (entityDecision.virtualFields || [])) {
    curatedFields.push({
      name: vf.name,
      column: vf.column ?? vf.name,
      label: vf.label ?? vf.name,
      type: vf.type ?? 'string',
      visibility: vf.visibility ?? 'readOnly',
      required: vf.required ?? false,
      form: vf.form !== false,
      grid: vf.grid !== false,
      gridOrder: vf.gridOrder,
      section: vf.section ?? 'other',
      virtual: true,
    });
  }
}

function buildCuratedEntity(rawEntity, entityDecision, discardPatterns) {
  const fieldsDecisions = entityDecision.fields || {};
  const curatedFields = buildCuratedFields(rawEntity, fieldsDecisions, discardPatterns);
  appendVirtualFields(curatedFields, entityDecision);
  const entity = {
    name: entityDecision.name || autoSimplifyEntityName(rawEntity.name),
    tableName: rawEntity.tableName,
    tabId: rawEntity.tabId,
    tabName: rawEntity.tabName,
    fields: orderCuratedFields(curatedFields, fieldsDecisions),
  };

  applyEntityDecisions(entity, entityDecision);
  return entity;
}

function buildCuratedEntities(schemaRaw, entitiesDecisions, discardPatterns) {
  const curatedEntities = [];

  for (const rawEntity of (schemaRaw.entities || [])) {
    const entityDecision = findEntityDecision(rawEntity, entitiesDecisions);
    if (entityDecision.exclude === true) continue;

    curatedEntities.push(buildCuratedEntity(rawEntity, entityDecision, discardPatterns));
  }

  return curatedEntities;
}

// ---------------------------------------------------------------------------
// Window resolver helpers
// ---------------------------------------------------------------------------

const WINDOW_TRUTHY_PROPS = [
  'layoutType',
  'sidebarLayout',
  'templateConfig',
  'documentPreview',
  'notesField',
  'relatedDocuments',
  'customComponents',
  'menuActions',
  'processOverrides',
  'entityLabel',
  'detailLabel',
  'secondaryTabs',
  'statusBar',
  'statusPills',
  'statusField',
  'detailSortBy',
  'listSortBy',
  'listKpiCards',
  'headerExtra',
  'labelOverrides',
  'primaryTabs',
  'othersLabel',
  'titleField',
  'listViewOptions',
  'listBaseFilter',
  'quickFilters',
  'subsetFilters',
  'dateFilterKey',
  'statusEnumLabels',
  'statusFieldLabel',
  'lockedAlert',
  'lineEntityConfig',
  'actions',
  'rowQuickActions',
  'sendDocument',
  'linesLayout',
  'balanceFooter',
  'extraTabs',
  'customPanelTabs',
  'selectorPriceCurrency',
];

const WINDOW_BOOLEAN_TRUE_PROPS = [
  'hideDeleteWhenComplete',
  'customTabsAfterBottom',
  'hideCreate',
  'hidePrint',
  'hideMoreMenu',
  'hideMoreDetails',
  'hideListFilters',
  'hideStatusFilter',
  'hideLink',
  'hideEyeCount',
  'customListIcons',
  'disableProcessedLock',
  'noHeaderBorder',
  'toolbarBorderBottom',
  'compactSidebarPadding',
  'whiteFormBackground',
  'hideFormCard',
  'sidebarAboveTabsOnly',
  'tabsSeparator',
  'autoSaveOnBlur',
  'hideDetailForm',
  'hideDelete',
];

// `attachments` is defined-only (not truthy) so an explicit `false` from
// decisions.json reaches the contract and disables the AttachmentsTab in the
// generator. Accepted shapes: boolean | { enabled?: boolean, ...options }.
const WINDOW_DEFINED_PROPS = ['contentBg', 'breadcrumb', 'attachments', 'sidebarClassName', 'tabsBarPaddingX', 'primaryTabsVariant', 'toolbarPaddingX', 'toolbarButtonSize', 'listbarPaddingX', 'tablePaddingX', 'customLinesComponent', 'customLinesLabel', 'formCardPadding', 'formScrollPaddingX', 'maxDetailLines', 'agentPrompt'];
const WINDOW_NOT_NULL_PROPS = ['detailTabIndex', 'salesTheme'];

// Canonical key order for the contract window object. Stabilizes contract.json
// output so internal refactors of the resolver/generator don't produce cosmetic
// drift. Keys not listed here land alphabetically at the end of the object.
export const WINDOW_KEY_ORDER = [
  'id', 'name', 'primaryEntity', 'category', 'agentPrompt',
  'sidebarLayout', 'templateConfig',
  'documentPreview', 'notesField', 'relatedDocuments',
  'hideDeleteWhenComplete', 'customTabsAfterBottom', 'hidePrint', 'hideCreate', 'hideSaveStatuses',
  'hideMoreMenu', 'hideMoreDetails', 'hideDetailForm', 'hideDelete', 'contentBg',
  'hideListFilters', 'hideStatusFilter', 'hideLink', 'hideEyeCount', 'customListIcons', 'breadcrumb',
  'customComponents', 'menuActions', 'processOverrides',
  'entityLabel', 'detailLabel', 'detailTabIndex', 'secondaryTabs',
  'detailEntity', 'statusBar', 'statusField', 'summaryFields',
  'detailSortBy', 'listSortBy', 'salesTheme', 'listKpiCards', 'headerExtra',
  'labelOverrides', 'primaryTabs', 'othersLabel',
  'disableProcessedLock', 'titleField',
  'listViewOptions', 'listBaseFilter', 'quickFilters', 'subsetFilters',
  'dateFilterKey', 'statusEnumLabels', 'statusFieldLabel', 'lockedAlert', 'noHeaderBorder', 'toolbarBorderBottom', 'compactSidebarPadding', 'whiteFormBackground', 'hideFormCard', 'sidebarAboveTabsOnly', 'tabsSeparator', 'sidebarClassName', 'formCardPadding', 'formScrollPaddingX', 'tabsBarPaddingX', 'primaryTabsVariant', 'toolbarPaddingX', 'toolbarButtonSize', 'listbarPaddingX', 'tablePaddingX', 'lineEntityConfig',
  'extraTabs', 'attachments', 'customPanelTabs', 'rowQuickActions',
  'sendDocument',
  'layoutType', 'linesLayout', 'balanceFooter', 'selectorPriceCurrency',
];

// Generic helper: returns a new object with keys in `canonicalOrder` first
// (only those present in `obj`), then any leftover keys sorted alphabetically.
export function reorderKeys(obj, canonicalOrder) {
  const result = {};
  const seen = new Set();
  for (const key of canonicalOrder) {
    if (Object.hasOwn(obj, key)) {
      result[key] = obj[key];
      seen.add(key);
    }
  }
  const leftover = Object.keys(obj)
    .filter(k => !seen.has(k))
    .sort((a, b) => a.localeCompare(b));
  for (const key of leftover) result[key] = obj[key];
  return result;
}

function copyTruthyProps(target, source, props) {
  for (const prop of props) {
    if (source[prop]) target[prop] = source[prop];
  }
}

function copyBooleanTrueProps(target, source, props) {
  for (const prop of props) {
    if (source[prop]) target[prop] = true;
  }
}

function copyDefinedProps(target, source, props) {
  for (const prop of props) {
    if (source[prop] !== undefined) target[prop] = source[prop];
  }
}

function copyNotNullProps(target, source, props) {
  for (const prop of props) {
    if (source[prop] != null) target[prop] = source[prop];
  }
}

function applyWindowDecisions(window, windowDecisions) {
  copyTruthyProps(window, windowDecisions, WINDOW_TRUTHY_PROPS);
  copyBooleanTrueProps(window, windowDecisions, WINDOW_BOOLEAN_TRUE_PROPS);
  copyDefinedProps(window, windowDecisions, WINDOW_DEFINED_PROPS);
  copyNotNullProps(window, windowDecisions, WINDOW_NOT_NULL_PROPS);

  if (windowDecisions.hideSaveStatuses?.length) {
    window.hideSaveStatuses = windowDecisions.hideSaveStatuses;
  }
  if (Array.isArray(windowDecisions.summaryFields)) {
    window.summaryFields = windowDecisions.summaryFields;
  }
  if ('detailEntity' in windowDecisions) {
    window.detailEntity = windowDecisions.detailEntity;
  }

  // ETP-3914 — Row Quick Actions: the user declaration (if any) is copied verbatim via
  // WINDOW_TRUTHY_PROPS. Windows that don't declare `rowQuickActions` get the feature
  // enabled with canonical defaults at runtime — no contract block needed. The block
  // is only emitted when the user wants to override defaults (hide an action, disable
  // the feature, add `visibleWhen`, promote a process to a fixed slot, etc.).
}

function applyWindowDraftModeToPrimaryEntity(curatedEntities, windowDecisions) {
  if (!windowDecisions.draftMode?.enabled) return;

  const primaryEntity = curatedEntities[0];
  if (primaryEntity && !primaryEntity.draftMode) {
    primaryEntity.draftMode = buildDraftMode(windowDecisions.draftMode, true);
  }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve raw schema + raw rules + decisions into curated schema + curated rules.
 *
 * @param {Object} schemaRaw  - Parsed schema-raw.json
 * @param {Object} rulesRaw   - Parsed rules-raw.json
 * @param {Object} decisions  - Parsed decisions.json (may be empty {})
 * @returns {Promise<{ schema: Object, rules: Array }>}
 */
export async function resolveCurated(schemaRaw, rulesRaw, decisions) {
  // Migrate decisions to current version if needed (in-memory only, no file write)
  if (needsMigration(decisions)) {
    const fromV = getVersion(decisions);
    const result = migrateDecisions(decisions, { schemaRaw });
    decisions = result.decisions;
    console.log(`  decisions migrated in-memory: v${fromV} → v${result.toVersion}`);
  }

  const discardPatterns = decisions.discardPatterns || [];
  const entitiesDecisions = decisions.entities || {};
  const curatedEntities = buildCuratedEntities(schemaRaw, entitiesDecisions, discardPatterns);

  const windowDecisions = decisions.window || {};
  const rawWindow = schemaRaw.window || {};

  const schema = {
    version: '0.1.0',
    window: {
      id: rawWindow.id,
      name: windowDecisions.name || rawWindow.name,
      primaryEntity: curatedEntities[0]?.name || null,
      category: windowDecisions.category || inferCategory(rawWindow.name),
    },
    entities: curatedEntities,
  };

  applyWindowDecisions(schema.window, windowDecisions);
  schema.window = reorderKeys(schema.window, WINDOW_KEY_ORDER);
  applyWindowDraftModeToPrimaryEntity(curatedEntities, windowDecisions);

  const rules = resolveRules(rulesRaw, decisions);

  return { schema, rules };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function runCli() {
  const args = process.argv.slice(2);
  const windowIdx = args.indexOf('--window');
  const dump = args.includes('--dump');
  // --write: regenerate contract.json from decisions without DB (safe for frontend-only changes)
  const write = args.includes('--write');

  if (windowIdx === -1 || !args[windowIdx + 1]) {
    console.error('Usage: node cli/src/resolve-curated.js --window <window-name> [--dump] [--write]');
    console.error('  --write  Regenerate contract.json + frontend from decisions.json (no DB needed)');
    process.exit(1);
  }

  const windowName = args[windowIdx + 1];
  const artifactsDir = join(ROOT, 'artifacts', windowName);

  const [schemaRaw, rulesRaw] = await Promise.all([
    readFile(join(artifactsDir, 'schema-raw.json'), 'utf-8').then(JSON.parse),
    readFile(join(artifactsDir, 'rules-raw.json'), 'utf-8').then(JSON.parse),
  ]);

  let decisions = {};
  const decisionsPath = join(artifactsDir, 'decisions.json');
  try {
    decisions = await readFile(decisionsPath, 'utf-8').then(JSON.parse);

    // Auto-migrate and persist if needed
    if (needsMigration(decisions)) {
      const result = migrateDecisions(decisions, { schemaRaw });
      decisions = result.decisions;
      await writeFile(decisionsPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
      console.log(`decisions.json auto-migrated: v${result.fromVersion} → v${result.toVersion}`);
    }
  } catch {
    console.warn('No decisions.json found — using empty decisions (all defaults).');
  }

  const { schema, rules } = await resolveCurated(schemaRaw, rulesRaw, decisions);

  if (write) {
    // Regenerate contract.json from decisions (no DB needed) then regenerate frontend.
    // This is the correct workflow whenever decisions.json changes without a full pipeline run.
    const { generateContract } = await import('./generate-contract.js');

    let processes = { processes: [] };
    try {
      processes = JSON.parse(await readFile(join(artifactsDir, 'processes.json'), 'utf-8'));
    } catch { /* no processes.json */ }

    let prevVersion = null;
    let prevContract = null;
    try {
      const existing = JSON.parse(await readFile(join(artifactsDir, 'contract.json'), 'utf-8'));
      let v = existing.version ?? null;
      while (v !== null && typeof v === 'object') v = v.version ?? null;
      prevVersion = v;
      prevContract = existing;
    } catch { /* no existing contract */ }

    const contract = generateContract(
      schema,
      Array.isArray(rules) ? rules : rules.rules || [],
      processes.processes || [],
      prevVersion,
      prevContract,
    );

    const contractPath = join(artifactsDir, 'contract.json');
    await writeFile(contractPath, JSON.stringify(contract, null, 2) + '\n');
    console.log(`✓ contract.json written for ${windowName}`);

    // Regenerate frontend
    const { generateAll } = await import('./generate-frontend.js');
    const files = generateAll(contract);
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const outDir = resolve(artifactsDir, 'generated', 'web', windowName);
    mkdirSync(outDir, { recursive: true });
    for (const [filename, code] of Object.entries(files)) {
      writeFileSync(resolve(outDir, filename), code, 'utf-8');
    }
    console.log(`✓ Frontend regenerated (${Object.keys(files).length} files) for ${windowName}`);
    return;
  }

  printSchemaAndRules(dump, schema, rules);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

function printSchemaAndRules(dump, schema, rules) {
  if (dump) {
    console.log('--- schema ---');
    console.log(JSON.stringify(schema, null, 2));
    console.log('--- rules ---');
    console.log(JSON.stringify(rules, null, 2));
  } else {
    console.log(`Resolved ${schema.entities.length} entities:`);
    for (const e of schema.entities) {
      const visible = e.fields.filter(f => f.visibility !== 'system' && f.visibility !== 'discarded').length;
      console.log(`  ${e.name}: ${e.fields.length} fields (${visible} visible)`);
    }
    console.log(`Rules: ${rules.length}`);
  }
}
