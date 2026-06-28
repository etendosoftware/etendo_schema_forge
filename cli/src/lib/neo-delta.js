/**
 * neo-delta.js — Pure computation of what push-to-neo WOULD write.
 *
 * Mirrors the real-push logic in `cli/src/push-to-neo.js` +
 * `cli/src/neo-writer.js → populateWindowSpec()` without performing any
 * INSERT/UPDATE/DELETE. Inputs are 100% data; outputs are 100% data.
 *
 * Why duplicate logic? Because the real path is intentionally
 * connection-and-transaction heavy (BEGIN/COMMIT around every step). Wrapping
 * it with a "buffer mode" would intertwine the dump with live-write code paths
 * and risk regressions. Instead, both paths consume the SAME inputs (AD tabs,
 * AD columns, contract, decisions, prev-XML snapshot) and produce equivalent
 * row state — verified by tests, not by shared code.
 *
 * If you change the real-push semantics in neo-writer.populateWindowSpec(),
 * mirror the change here.
 *
 * Public API:
 *   computeWindowDelta({
 *     specName, windowId, moduleId,
 *     contract, decisions,
 *     adTabs, adColumns,
 *     prevSnapshot,
 *     excludeSystemColumns = true,
 *   }) → {
 *     spec: <kebab-case>,
 *     tables: {
 *       ETGO_SF_SPEC:   { upserts: [...], deletes: [...] },
 *       ETGO_SF_ENTITY: { upserts: [...], deletes: [...] },
 *       ETGO_SF_FIELD:  { upserts: [...], deletes: [...] },
 *     },
 *   }
 *
 * Every upsert row carries a `_naturalKey` field for Slice 3 cross-walk.
 * Audit columns (created/updated/createdby/updatedby) are intentionally
 * omitted because Etendo's export.database does not include them in
 * sourcedata XML.
 */

import { newEtendoId } from './etendo-uuid.js';
import { indexByNaturalKey } from './etgo-xml-parser.js';

/**
 * Local copy of mapVisibility() from push-to-neo.js. Inlined to keep this
 * module free of circular imports (push-to-neo imports computeWindowDelta).
 * If you change one, mirror the change in the other — both are intentionally
 * tiny so divergence is easy to spot.
 */
function mapVisibility(visibility) {
  switch (visibility) {
    case 'editable':  return { isIncluded: 'Y', isReadOnly: 'N' };
    case 'readOnly':  return { isIncluded: 'Y', isReadOnly: 'Y' };
    case 'system':    return { isIncluded: 'Y', isReadOnly: 'Y' };
    case 'discarded': return { isIncluded: 'N', isReadOnly: 'N' };
    default:          return { isIncluded: 'N', isReadOnly: 'N' };
  }
}

function normalizeAgentPrompt(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function hasColumn(row, columnName) {
  return row != null && Object.hasOwn(row, columnName);
}

function applyAgentPromptColumn(row, normalizedPrompt, previousRow) {
  if (normalizedPrompt !== null) {
    row.AGENT_PROMPT = String(normalizedPrompt);
  } else if (hasColumn(previousRow, 'AGENT_PROMPT')) {
    row.AGENT_PROMPT = null;
  }
}

/**
 * Local copy of extractFieldsFromContract() from push-to-neo.js. Same
 * rationale as mapVisibility — avoid circular import.
 */
function extractFieldsFromContract(backendContract) {
  const fields = [];
  for (const [entityName, entityData] of Object.entries(backendContract.entities)) {
    for (const field of entityData.fields) {
      fields.push({
        entityName,
        tabId: entityData.tabId || null,
        tableName: entityData.tableName || null,
        fieldName: field.name,
        column: field.column,
        visibility: field.visibility,
      });
    }
  }
  return fields;
}

// Mirrors SYSTEM_COLUMNS in cli/src/neo-writer.js — keep them in sync.
const SYSTEM_COLUMNS = new Set([
  'ad_client_id',
  'ad_org_id',
  'isactive',
  'created',
  'createdby',
  'updated',
  'updatedby',
]);

// Stable defaults that always appear with the same value in committed XML.
const SPEC_DEFAULTS = {
  AD_CLIENT_ID: '0',
  AD_ORG_ID: '0',
  ISACTIVE: 'Y',
  POPULATE: 'N',
};
const ENTITY_DEFAULTS = {
  AD_CLIENT_ID: '0',
  AD_ORG_ID: '0',
  ISACTIVE: 'Y',
};
const FIELD_DEFAULTS = {
  AD_CLIENT_ID: '0',
  AD_ORG_ID: '0',
  ISACTIVE: 'Y',
};

/**
 * Natural-key functions. These define the identity of a row independent of
 * its UUID. Slice 3's apply-delta walker will use the same keys to align
 * XML rows ↔ delta rows.
 *
 *   SPEC   : <spec-name>           (already unique system-wide)
 *   ENTITY : <spec-name>/<ad_tab_id>
 *   FIELD  : <spec-name>/<ad_tab_id>/<ad_column_id>
 */
export function specNaturalKey(specName) {
  return specName;
}
export function entityNaturalKey(specName, adTabId) {
  return `${specName}/${adTabId}`;
}
export function fieldNaturalKey(specName, adTabId, adColumnId) {
  return `${specName}/${adTabId}/${adColumnId}`;
}

/**
 * Compute the delta for a window-type spec.
 *
 * @param {object} args
 * @param {string} args.specName       e.g. "sales-order"
 * @param {string} args.windowId       AD_Window_ID
 * @param {string} args.moduleId       AD_Module_ID (defaults to com.etendoerp.go)
 * @param {object} args.contract       Parsed contract.json
 * @param {object} args.decisions      Parsed decisions.json (may be {})
 * @param {Array}  args.adTabs         Rows from QUERIES['ad-tabs-for-window']
 * @param {Array}  args.adColumns      Rows from QUERIES['ad-columns-for-window']
 * @param {object} args.prevSnapshot   { spec, entity, field } from loadEtgoXmlSnapshot
 * @param {object} [args.schemaRawData] Parsed schema-raw.json. Required to mirror
 *                                      push-to-neo's renameEntitiesToContractNames,
 *                                      which pulls camelCase entity names from
 *                                      schema-raw for tabs not declared in the contract.
 * @param {boolean} [args.excludeSystemColumns=true]
 * @returns {object} delta
 */
export function computeWindowDelta(args) {
  const {
    specName,
    windowId,
    moduleId,
    contract,
    decisions = {},
    adTabs,
    adColumns,
    prevSnapshot,
    schemaRawData = null,
    excludeSystemColumns = true,
  } = args;

  const desiredEntityByTabName = buildDesiredEntityNameMap(schemaRawData, contract);

  // ---- Index prev-XML ----------------------------------------------------

  const { prevSpecByName, prevEntityByNatural, prevFieldByNatural } =
    indexPrevSnapshot(prevSnapshot);

  // ---- Group AD columns by table ----------------------------------------

  const colsByTable = groupColumnsByTable(adColumns);

  // ---- Build SPEC upsert ------------------------------------------------

  const specNK = specNaturalKey(specName);
  const prevSpecRow = prevSpecByName.get(specNK);
  const specId = prevSpecRow
    ? prevSpecRow.ETGO_SF_SPEC_ID
    : newEtendoId();

  const specUpsert = {
    _naturalKey: specNK,
    ETGO_SF_SPEC_ID: specId,
    NAME: specName,
    SPEC_TYPE: 'W',
    AD_WINDOW_ID: String(windowId),
    AD_MODULE_ID: moduleId,
    ...SPEC_DEFAULTS,
  };
  const specAgentPrompt = normalizeAgentPrompt(decisions.window?.agentPrompt);
  applyAgentPromptColumn(specUpsert, specAgentPrompt, prevSpecRow);

  // ---- Walk tabs → entities --------------------------------------------

  const entityUpserts = [];
  const fieldUpserts = [];
  // Map from naturalKey → spec/entity/field UUID (for deterministic FKs).
  const entityIdByNK = new Map();

  let entitySeq = 0;
  for (const tab of adTabs) {
    entitySeq++;
    const tabId = tab.ad_tab_id;
    const entityNK = entityNaturalKey(specName, tabId);
    const prevEntityRow = prevEntityByNatural.get(entityNK);
    const entityId = prevEntityRow
      ? prevEntityRow.ETGO_SF_ENTITY_ID
      : newEtendoId();
    entityIdByNK.set(entityNK, entityId);

    // Resolve display name + java_qualifier from contract overrides if any.
    // If the tab has no contract entry, fall back to schema-raw's curated name
    // (camelCase). Only if BOTH are absent do we fall back to the raw AD name.
    // This mirrors push-to-neo: populateSpec writes tab.name, then
    // renameEntitiesToContractNames overwrites it with the curated name.
    const { contractName, javaQualifier } = resolveEntityOverrides(
      tab,
      contract,
    );
    const entityName = contractName
      || desiredEntityByTabName.get(tab.name)
      || tab.name;

    const entityRow = {
      _naturalKey: entityNK,
      ETGO_SF_ENTITY_ID: entityId,
      ETGO_SF_SPEC_ID: specId,
      AD_TAB_ID: String(tabId),
      AD_MODULE_ID: moduleId,
      NAME: entityName,
      SEQNO: String(entitySeq * 10),
      ISINCLUDED: 'Y',
      // populateWindowSpec is called with includeAllMethods=true in
      // push-to-neo.js → stepPopulateSpec, so all CRUD flags are 'Y'.
      ISGET: 'Y',
      ISGETBYID: 'Y',
      ISPOST: 'Y',
      ISPUT: 'Y',
      ISPATCH: 'Y',
      ISDELETE: 'Y',
      ...ENTITY_DEFAULTS,
    };
    if (javaQualifier != null) entityRow.JAVA_QUALIFIER = javaQualifier;
    entityUpserts.push(entityRow);

    // Fields for this tab's table -----------------------------------------
    const cols = colsByTable.get(tab.ad_table_id) || [];
    let fieldSeq = 0;
    for (const col of cols) {
      if (
        excludeSystemColumns
        && SYSTEM_COLUMNS.has(String(col.columnname).toLowerCase())
      ) {
        continue;
      }
      fieldSeq++;
      const fieldNK = fieldNaturalKey(specName, tabId, col.ad_column_id);
      const prevFieldRow = prevFieldByNatural.get(fieldNK);
      const fieldId = prevFieldRow
        ? prevFieldRow.ETGO_SF_FIELD_ID
        : newEtendoId();

      fieldUpserts.push({
        _naturalKey: fieldNK,
        ETGO_SF_FIELD_ID: fieldId,
        ETGO_SF_ENTITY_ID: entityId,
        AD_COLUMN_ID: String(col.ad_column_id),
        AD_MODULE_ID: moduleId,
        SEQNO: String(fieldSeq * 10),
        // populateSpec writes nothing in isincluded/isreadonly initially;
        // those are set in stepUpdateFieldVisibility from the contract.
        // For the delta we emit the FINAL state (post step-3 + step-4).
        ISINCLUDED: 'Y', // placeholder; overwritten below
        ISREADONLY: 'N',
        ...FIELD_DEFAULTS,
      });
    }
  }

  // ---- Apply visibility from contract (mirrors stepUpdateFieldVisibility) ----

  applyContractVisibilityToFields({
    specName,
    contract,
    decisions,
    adTabs,
    adColumns,
    entityIdByNK,
    prevFieldByNatural,
    fieldUpserts,
  });

  // ---- Mirror live-push behaviour: never create NEW records with ISINCLUDED=N
  // stepExcludeNonContractFields only updates EXISTING rows; it never inserts
  // a fresh ETGO_SF_FIELD record for a field that was never in the DB.
  const prunedFieldUpserts = fieldUpserts.filter(
    f => prevFieldByNatural.has(f._naturalKey) || f.ISINCLUDED === 'Y',
  );

  // ---- Compute deletes from prev-XML -----------------------------------

  const { entityDeletes, fieldDeletes } = computeDeletesForSpec({
    specName,
    prevEntityByNatural,
    prevFieldByNatural,
    entityUpserts,
    fieldUpserts: prunedFieldUpserts,
  });

  // Spec is never auto-deleted by push-to-neo (the operator removes a spec
  // by deleting the artifact dir). We still expose an empty array for
  // shape symmetry.
  return {
    spec: specName,
    tables: {
      ETGO_SF_SPEC:   { upserts: [specUpsert],  deletes: [] },
      ETGO_SF_ENTITY: { upserts: entityUpserts, deletes: entityDeletes },
      ETGO_SF_FIELD:  { upserts: prunedFieldUpserts, deletes: fieldDeletes },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mirrors `buildDesiredEntitiesMap` in push-to-neo.js, but returns only the
 * tabName → desiredName mapping (no JAVA_QUALIFIER — that's handled by
 * resolveEntityOverrides for contract-declared entities).
 *
 * The real renameEntitiesToContractNames also reads schema-raw entities,
 * which carry the curated camelCase names for ALL tabs (including ones the
 * contract doesn't declare). Without this, the delta keeps the raw AD tab
 * name and reports false drift.
 */
function buildDesiredEntityNameMap(schemaRawData, contract) {
  const map = new Map();
  const schemaEntities = (schemaRawData?.entities || []);
  for (const ent of schemaEntities) {
    if (ent.tabName && ent.name) {
      map.set(ent.tabName, ent.name);
    }
  }
  // Contract overrides win.
  const contractEntities = contract?.backendContract?.entities;
  if (contractEntities) {
    for (const [name, data] of Object.entries(contractEntities)) {
      const tabName = data.tabName
        || schemaEntities.find((e) => e.name === name)?.tabName;
      if (tabName) map.set(tabName, name);
    }
  }
  return map;
}

function resolveEntityOverrides(tab, contract) {
  // Mirrors buildDesiredEntitiesMap + renameEntitiesToContractNames in
  // push-to-neo.js. Returns { contractName, javaQualifier }.
  const entities = contract?.backendContract?.entities;
  if (!entities) return { contractName: null, javaQualifier: undefined };
  for (const [name, data] of Object.entries(entities)) {
    if (data.tabName === tab.name || data.tabId === tab.ad_tab_id) {
      return {
        contractName: name,
        javaQualifier: data.javaQualifier ?? undefined,
      };
    }
  }
  // Fall back: if no entity matches by tabName/tabId, use AD tab name.
  return { contractName: null, javaQualifier: undefined };
}

function indexPrevSnapshot(prevSnapshot) {
  const prevSpecByName = indexByNaturalKey(prevSnapshot.spec, (r) => r.NAME);
  // Entities & fields in prev-XML use NEO UUIDs for parent FKs, but we want
  // to align by AD natural keys. So we re-index using a lookup from
  // prev spec-id → spec name.
  const prevSpecIdToName = new Map();
  for (const row of prevSnapshot.spec) {
    if (row.ETGO_SF_SPEC_ID && row.NAME) {
      prevSpecIdToName.set(row.ETGO_SF_SPEC_ID, row.NAME);
    }
  }
  const prevEntityIdToNatural = new Map(); // ETGO_SF_ENTITY_ID → naturalKey
  const prevEntityByNatural = indexByNaturalKey(
    prevSnapshot.entity,
    (r) => {
      const sName = prevSpecIdToName.get(r.ETGO_SF_SPEC_ID);
      if (!sName || !r.AD_TAB_ID) return null;
      const nk = entityNaturalKey(sName, r.AD_TAB_ID);
      prevEntityIdToNatural.set(r.ETGO_SF_ENTITY_ID, nk);
      return nk;
    },
  );
  const prevFieldByNatural = indexByNaturalKey(
    prevSnapshot.field,
    (r) => {
      const parentNK = prevEntityIdToNatural.get(r.ETGO_SF_ENTITY_ID);
      if (!parentNK || !r.AD_COLUMN_ID) return null;
      // parentNK = "<spec>/<tabId>". Append columnId.
      return `${parentNK}/${r.AD_COLUMN_ID}`;
    },
  );
  return { prevSpecByName, prevEntityByNatural, prevFieldByNatural };
}

function groupColumnsByTable(adColumns) {
  const colsByTable = new Map();
  for (const col of adColumns) {
    const tid = col.ad_table_id;
    if (!colsByTable.has(tid)) colsByTable.set(tid, []);
    colsByTable.get(tid).push(col);
  }
  return colsByTable;
}

function buildContractVisibilityIndex({
  specName,
  contractFields,
  fieldDefaultExprs,
  fieldAgentPrompts,
  adTabs,
  adColumns,
  entityIdByNK,
}) {
  // push-to-neo's stepUpdateFieldVisibility resolves visibility PER-ENTITY:
  // upsertSingleField runs WHERE sf.etgo_sf_entity_id = $1 AND c.columnname = $2.
  // The same ad_column_id (e.g. IsCustomer on C_BPartner) can belong to
  // several entities (businessPartner / customer / vendorCreditor) with
  // DIFFERENT contract visibilities, so we MUST index by (entityId, ad_column_id)
  // instead of by ad_column_id alone.
  const tabIdToTableId = new Map();
  for (const tab of adTabs) {
    tabIdToTableId.set(String(tab.ad_tab_id), String(tab.ad_table_id));
  }
  const colIdByTableAndName = new Map();
  for (const c of adColumns) {
    const key = `${String(c.ad_table_id)}/${String(c.columnname).toLowerCase()}`;
    colIdByTableAndName.set(key, c.ad_column_id);
  }
  const result = new Map();
  for (const f of contractFields) {
    if (!f.tabId) continue;
    const tableId = tabIdToTableId.get(String(f.tabId));
    if (!tableId) continue;
    const adColumnId = colIdByTableAndName.get(
      `${tableId}/${String(f.column).toLowerCase()}`,
    );
    if (!adColumnId) continue;
    const entityId = entityIdByNK.get(entityNaturalKey(specName, f.tabId));
    if (!entityId) continue;
    const vis = mapVisibility(f.visibility);
    const fieldKey = `${f.entityName}.${f.fieldName}`;
    result.set(`${entityId}/${String(adColumnId)}`, {
      isIncluded: vis.isIncluded,
      isReadOnly: vis.isReadOnly,
      defaultValue: fieldKey in fieldDefaultExprs
        ? fieldDefaultExprs[fieldKey]
        : undefined,
      agentPrompt: fieldKey in fieldAgentPrompts
        ? fieldAgentPrompts[fieldKey]
        : null,
    });
  }
  return result;
}

function applyContractVisibilityToFields({
  specName,
  contract,
  decisions,
  adTabs,
  adColumns,
  entityIdByNK,
  prevFieldByNatural,
  fieldUpserts,
}) {
  const contractFields = extractFieldsFromContract(contract.backendContract);
  const fieldDefaultExprs = buildFieldDefaultExprMap(decisions);
  const fieldAgentPrompts = buildFieldAgentPromptMap(decisions);

  // Build the GLOBAL contract columnname set (case-SENSITIVE). Mirrors
  // stepExcludeNonContractFields, which builds
  //   new Set(allFields.map(f => f.column))
  // and checks with .has(row.columnname) — both case-sensitive. A field is
  // excluded if its AD columnname is not present verbatim in any contract
  // entity. Case mismatches (`C_Orderline_ID` AD vs `C_OrderLine_ID`
  // contract) therefore intentionally fall through to "exclude". We mirror
  // that bug-for-bug so the offline delta matches what push-to-neo writes.
  const contractColumnSet = new Set(contractFields.map((f) => String(f.column)));

  const contractFieldByEntityAndColumn = buildContractVisibilityIndex({
    specName,
    contractFields,
    fieldDefaultExprs,
    fieldAgentPrompts,
    adTabs,
    adColumns,
    entityIdByNK,
  });

  // Index columns by ad_column_id for the exclude step.
  const colMetaById = new Map();
  for (const c of adColumns) {
    colMetaById.set(String(c.ad_column_id), c);
  }

  for (const row of fieldUpserts) {
    const colHit = contractFieldByEntityAndColumn.get(
      `${row.ETGO_SF_ENTITY_ID}/${String(row.AD_COLUMN_ID)}`,
    );
    if (colHit) {
      row.ISINCLUDED = colHit.isIncluded;
      row.ISREADONLY = colHit.isReadOnly;
      if (colHit.defaultValue !== undefined && colHit.defaultValue !== null) {
        row.DEFAULTVALUE = String(colHit.defaultValue);
      }
      applyAgentPromptColumn(
        row,
        colHit.agentPrompt,
        prevFieldByNatural.get(row._naturalKey),
      );
    } else {
      // stepExcludeNonContractFields: a field is excluded only when its
      // columnname does NOT appear in ANY contract entity. ISREADONLY is not
      // touched here — it stays at the populateSpec default 'N'.
      const colMeta = colMetaById.get(String(row.AD_COLUMN_ID));
      if (colMeta && !contractColumnSet.has(String(colMeta.columnname))) {
        row.ISINCLUDED = 'N';
      }
    }
  }
}

function computeDeletesForSpec({ specName, prevEntityByNatural, prevFieldByNatural, entityUpserts, fieldUpserts }) {
  // Live natural keys for THIS spec only — we never touch other specs.
  const liveEntityKeys = new Set(entityUpserts.map((e) => e._naturalKey));
  const liveFieldKeys  = new Set(fieldUpserts.map((f)  => f._naturalKey));
  const prefix = specName + '/';
  const entityDeletes = [];
  for (const [nk, row] of prevEntityByNatural) {
    if (nk.startsWith(prefix) && !liveEntityKeys.has(nk)) {
      entityDeletes.push({ _naturalKey: nk, ETGO_SF_ENTITY_ID: row.ETGO_SF_ENTITY_ID });
    }
  }
  const fieldDeletes = [];
  for (const [nk, row] of prevFieldByNatural) {
    if (nk.startsWith(prefix) && !liveFieldKeys.has(nk)) {
      fieldDeletes.push({ _naturalKey: nk, ETGO_SF_FIELD_ID: row.ETGO_SF_FIELD_ID });
    }
  }
  return { entityDeletes, fieldDeletes };
}

function buildFieldDefaultExprMap(decisions) {
  const map = {};
  for (const [entityKey, entityConf] of Object.entries(decisions.entities || {})) {
    const entityName = entityConf.name || entityKey;
    for (const [fieldName, fieldConf] of Object.entries(entityConf.fields || {})) {
      if (fieldConf.defaultExpr != null) {
        map[`${entityName}.${fieldName}`] = fieldConf.defaultExpr;
      }
    }
  }
  return map;
}

function buildFieldAgentPromptMap(decisions) {
  const map = {};
  for (const [entityKey, entityConf] of Object.entries(decisions.entities || {})) {
    const entityName = entityConf.name || entityKey;
    for (const [fieldName, fieldConf] of Object.entries(entityConf.fields || {})) {
      if (Object.hasOwn(fieldConf, 'agentPrompt')) {
        map[`${entityName}.${fieldName}`] = normalizeAgentPrompt(fieldConf.agentPrompt);
      }
    }
  }
  return map;
}

/**
 * Serialize a delta with deterministic key ordering inside each row and
 * stable array order. Public so the CLI and tests share one format.
 */
export function serializeDelta(delta) {
  const sortRow = (row) => {
    const out = {};
    // Put _naturalKey first for human review, then the rest alphabetically.
    if ('_naturalKey' in row) out._naturalKey = row._naturalKey;
    for (const k of Object.keys(row).sort((a, b) => a.localeCompare(b))) {
      if (k === '_naturalKey') continue;
      out[k] = row[k];
    }
    return out;
  };
  const sortRows = (rows) => rows.map(sortRow);
  const byNaturalKey = (a, b) => a._naturalKey.localeCompare(b._naturalKey);
  const tables = {};
  // Fixed table order matches dependency order: spec → entity → field.
  for (const tag of ['ETGO_SF_SPEC', 'ETGO_SF_ENTITY', 'ETGO_SF_FIELD']) {
    const t = delta.tables[tag];
    tables[tag] = {
      upserts: sortRows([...t.upserts].sort(byNaturalKey)),
      deletes: sortRows([...t.deletes].sort(byNaturalKey)),
    };
  }
  return { spec: delta.spec, tables };
}
