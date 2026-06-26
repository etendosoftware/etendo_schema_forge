/**
 * neo-writer.js — Direct PostgreSQL writer for NEO Headless configuration tables.
 *
 * Replaces the HTTP webhook approach with direct DB inserts/updates to:
 *   - etgo_sf_spec
 *   - etgo_sf_entity
 *   - etgo_sf_field
 *
 * All functions receive a `pg` client for transaction control.
 */

import { randomUUID } from 'node:crypto';
import { GO_MODULE_ID } from './lib/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_COLUMNS = [
  'ad_client_id',
  'ad_org_id',
  'isactive',
  'created',
  'createdby',
  'updated',
  'updatedby',
];

/**
 * Generate an Etendo-compatible UUID (32-char uppercase hex, no dashes).
 */
export function generateId() {
  return randomUUID().replace(/-/g, '').toUpperCase();
}

/**
 * Return default audit column values for INSERT statements.
 */
export function auditDefaults(opts = {}) {
  const now = new Date();
  return {
    ad_client_id: opts.clientId || '0',
    ad_org_id: opts.orgId || '0',
    isactive: 'Y',
    created: now,
    updated: now,
    createdby: opts.userId || '0',
    updatedby: opts.userId || '0',
  };
}

// ---------------------------------------------------------------------------
// upsertSpec
// ---------------------------------------------------------------------------

/**
 * Insert or update a spec row in etgo_sf_spec.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.name - Spec name (kebab-case)
 * @param {string} params.moduleId - AD_Module_ID
 * @param {string} [params.windowId] - AD_Window_ID (required for type W)
 * @param {string} [params.processId] - AD_Process_ID (required for type P)
 * @param {string} [params.specType='W'] - 'W' (window) or 'P' (process)
 * @param {string} [params.description]
 * @param {string} [params.agentPrompt] - Agent guidance returned by neo_discover
 * @param {string} [params.specId] - If provided, UPDATE instead of INSERT
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ specId: string, created: boolean }}
 */
export async function upsertSpec(client, params) {
  const {
    name,
    moduleId = process.env.SF_MODULE_ID || GO_MODULE_ID,
    windowId = null,
    processId = null,
    specType = 'W',
    description = null,
    agentPrompt = null,
    specId: existingId = null,
    audit = {},
  } = params;

  // Check for duplicate name
  const dupCheck = await client.query(
    'SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name = $1',
    [name],
  );
  if (dupCheck.rows.length > 0) {
    const foundId = dupCheck.rows[0].etgo_sf_spec_id;
    if (!existingId || foundId !== existingId) {
      throw new Error(`Spec with name '${name}' already exists (id: ${foundId})`);
    }
  }

  const auditVals = auditDefaults(audit);

  if (existingId) {
    // UPDATE
    await client.query(
      `UPDATE etgo_sf_spec
       SET name = $1, spec_type = $2, ad_window_id = $3, ad_process_id = $4,
           ad_module_id = $5, description = $6, agent_prompt = $7,
           updated = $8, updatedby = $9
       WHERE etgo_sf_spec_id = $10`,
      [name, specType, windowId, processId, moduleId, description, agentPrompt,
       auditVals.updated, auditVals.updatedby, existingId],
    );
    return { specId: existingId, created: false };
  }

  // INSERT
  const specId = generateId();
  await client.query(
    `INSERT INTO etgo_sf_spec
     (etgo_sf_spec_id, name, spec_type, ad_window_id, ad_process_id, ad_module_id,
      description, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
      agent_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [specId, name, specType, windowId, processId, moduleId, description,
     auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
     auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby,
     agentPrompt],
  );
  return { specId, created: true };
}

// ---------------------------------------------------------------------------
// upsertEntity
// ---------------------------------------------------------------------------

/**
 * Insert or update an entity row in etgo_sf_entity.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.specId - Parent etgo_sf_spec_id
 * @param {string} params.tabId - AD_Tab_ID
 * @param {string} params.moduleId - AD_Module_ID
 * @param {string} [params.name] - Entity name (falls back to AD_Tab.name)
 * @param {string} [params.entityId] - If provided, UPDATE instead of INSERT
 * @param {string} [params.isIncluded='Y']
 * @param {string} [params.isGet='N']
 * @param {string} [params.isGetbyid='N']
 * @param {string} [params.isPost='N']
 * @param {string} [params.isPut='N']
 * @param {string} [params.isPatch='N']
 * @param {string} [params.isDelete='N']
 * @param {string} [params.javaQualifier]
 * @param {number} [params.seqNo]
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ entityId: string, created: boolean }}
 */
export async function upsertEntity(client, params) {
  const {
    specId,
    tabId,
    moduleId = process.env.SF_MODULE_ID || GO_MODULE_ID,
    entityId: existingId = null,
    isIncluded = 'Y',
    isGet = 'N',
    isGetbyid = 'N',
    isPost = 'N',
    isPut = 'N',
    isPatch = 'N',
    isDelete = 'N',
    javaQualifier = null,
    seqNo = null,
    audit = {},
  } = params;

  // Resolve name: use provided or fall back to AD_Tab.name
  let { name } = params;
  if (!name) {
    const tabResult = await client.query(
      'SELECT name FROM ad_tab WHERE ad_tab_id = $1',
      [tabId],
    );
    name = tabResult.rows[0]?.name || 'unnamed';
  }

  const auditVals = auditDefaults(audit);

  if (existingId) {
    await client.query(
      `UPDATE etgo_sf_entity
       SET etgo_sf_spec_id = $1, ad_tab_id = $2, ad_module_id = $3, name = $4,
           isincluded = $5, isget = $6, isgetbyid = $7, ispost = $8,
           isput = $9, ispatch = $10, isdelete = $11, java_qualifier = $12,
           seqno = $13, updated = $14, updatedby = $15
       WHERE etgo_sf_entity_id = $16`,
      [specId, tabId, moduleId, name,
       isIncluded, isGet, isGetbyid, isPost,
       isPut, isPatch, isDelete, javaQualifier,
       seqNo, auditVals.updated, auditVals.updatedby, existingId],
    );
    return { entityId: existingId, created: false };
  }

  const entityId = generateId();
  await client.query(
    `INSERT INTO etgo_sf_entity
     (etgo_sf_entity_id, etgo_sf_spec_id, ad_tab_id, ad_module_id, name,
      isincluded, isget, isgetbyid, ispost, isput, ispatch, isdelete,
      java_qualifier, seqno,
      ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21)`,
    [entityId, specId, tabId, moduleId, name,
     isIncluded, isGet, isGetbyid, isPost, isPut, isPatch, isDelete,
     javaQualifier, seqNo,
     auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
     auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby],
  );
  return { entityId, created: true };
}

// ---------------------------------------------------------------------------
// upsertField
// ---------------------------------------------------------------------------

/**
 * Insert or update a field row in etgo_sf_field.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.entityId - Parent etgo_sf_entity_id
 * @param {string} [params.columnId] - AD_Column_ID (null for process params)
 * @param {string} params.moduleId - AD_Module_ID
 * @param {string} [params.fieldId] - If provided, UPDATE instead of INSERT
 * @param {string} [params.isIncluded='Y']
 * @param {string} [params.isReadOnly='N']
 * @param {string} [params.defaultValue]
 * @param {string} [params.agentPrompt] - Per-field agent guidance for neo_schema
 * @param {string} [params.javaQualifier]
 * @param {number} [params.seqNo]
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ fieldId: string, created: boolean }}
 */
export async function upsertField(client, params) {
  const {
    entityId,
    moduleId = process.env.SF_MODULE_ID || GO_MODULE_ID,
    fieldId: existingId = null,
    isIncluded = 'Y',
    isReadOnly = 'N',
    isBusinessCritical = 'N',
    audit = {},
  } = params;

  const auditVals = auditDefaults(audit);

  if (existingId) {
    // Build a partial UPDATE: only set columns that were explicitly provided.
    // This prevents overwriting ad_column_id, seqno, etc. with null when the
    // caller only wants to change isIncluded/isReadOnly.
    const setClauses = [
      'etgo_sf_entity_id = $1',
      'ad_module_id = $2',
      'isincluded = $3',
      'isreadonly = $4',
    ];
    const values = [entityId, moduleId, isIncluded, isReadOnly];
    let paramIndex = 5;

    if ('columnId' in params) {
      setClauses.push(`ad_column_id = $${paramIndex++}`);
      values.push(params.columnId ?? null);
    }
    if ('defaultValue' in params) {
      setClauses.push(`defaultvalue = $${paramIndex++}`);
      values.push(params.defaultValue ?? null);
    }
    if ('agentPrompt' in params) {
      setClauses.push(`agent_prompt = $${paramIndex++}`);
      values.push(params.agentPrompt ?? null);
    }
    if ('javaQualifier' in params) {
      setClauses.push(`java_qualifier = $${paramIndex++}`);
      values.push(params.javaQualifier ?? null);
    }
    if ('seqNo' in params) {
      setClauses.push(`seqno = $${paramIndex++}`);
      values.push(params.seqNo ?? null);
    }
    if ('isBusinessCritical' in params) {
      setClauses.push(`isbusinesscritical = $${paramIndex++}`);
      values.push(params.isBusinessCritical ?? 'N');
    }

    setClauses.push(`updated = $${paramIndex++}`);
    values.push(auditVals.updated);
    setClauses.push(`updatedby = $${paramIndex++}`);
    values.push(auditVals.updatedby);
    values.push(existingId);

    await client.query(
      `UPDATE etgo_sf_field SET ${setClauses.join(', ')} WHERE etgo_sf_field_id = $${paramIndex}`,
      values,
    );
    return { fieldId: existingId, created: false };
  }

  const columnId = params.columnId ?? null;
  const defaultValue = params.defaultValue ?? null;
  const javaQualifier = params.javaQualifier ?? null;
  const seqNo = params.seqNo ?? null;
  const agentPrompt = params.agentPrompt ?? null;

  const fieldId = generateId();
  await client.query(
    `INSERT INTO etgo_sf_field
     (etgo_sf_field_id, etgo_sf_entity_id, ad_column_id, ad_module_id,
      isincluded, isreadonly, isbusinesscritical, defaultvalue, java_qualifier, seqno,
      ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
      agent_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [fieldId, entityId, columnId, moduleId,
     isIncluded, isReadOnly, isBusinessCritical, defaultValue, javaQualifier, seqNo,
     auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
     auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby,
     agentPrompt],
  );
  return { fieldId, created: true };
}

// ---------------------------------------------------------------------------
// populateSpec
// ---------------------------------------------------------------------------

/**
 * Populate a spec by reading AD metadata and creating/updating entities + fields.
 * Incremental: matches existing records by AD key (tab/column/qualifier) and
 * reuses their IDs. Only genuinely new records get new UUIDs. Stale records
 * (present in DB but absent from AD) are deleted.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.specId - The spec to populate
 * @param {string} params.moduleId - AD_Module_ID for new rows
 * @param {boolean} [params.excludeSystemColumns=true]
 * @param {boolean} [params.includeAllMethods=false]
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ entityCount: number, fieldCount: number, entities: Array, changes: object }}
 */
export async function populateSpec(client, params) {
  const {
    specId,
    moduleId = process.env.SF_MODULE_ID || GO_MODULE_ID,
    excludeSystemColumns = true,
    includeAllMethods = false,
    audit = {},
  } = params;

  // Fetch spec to determine type
  const specResult = await client.query(
    'SELECT spec_type, ad_window_id, ad_process_id FROM etgo_sf_spec WHERE etgo_sf_spec_id = $1',
    [specId],
  );
  if (specResult.rows.length === 0) {
    throw new Error(`Spec not found: ${specId}`);
  }
  const spec = specResult.rows[0];

  if (spec.spec_type === 'W') {
    return populateWindowSpec(client, { specId, windowId: spec.ad_window_id, moduleId, excludeSystemColumns, includeAllMethods, audit });
  } else if (spec.spec_type === 'P') {
    return populateProcessSpec(client, { specId, processId: spec.ad_process_id, moduleId, audit });
  } else if (spec.spec_type === 'R') {
    // Report specs (ETP-4255) are NEO-native callable metadata only; they are NOT backed
    // by AD_Process/Jasper. Report callability comes from a NEO report handler
    // (ETGO_SF_ENTITY.Java_Qualifier), not from AD_Process_Para. Do not derive
    // process-style entities/fields here. Jasper/JRXML is offline migration provenance only.
    return {
      entityCount: 0,
      fieldCount: 0,
      entities: [],
      changes: {
        entities: { created: 0, updated: 0, deleted: 0 },
        fields: { created: 0, updated: 0, deleted: 0 },
      },
    };
  }

  throw new Error(`Unknown spec type: ${spec.spec_type}`);
}

async function deleteStaleFields(existingFieldByColumn, visitedFieldIds, client, changes) {
  // Delete stale fields (exist in DB but column no longer in AD)
  for (const [, existingFieldId] of existingFieldByColumn) {
    if (!visitedFieldIds.has(existingFieldId)) {
      await client.query(
          'DELETE FROM etgo_sf_field WHERE etgo_sf_field_id = $1',
          [existingFieldId],
      );
      changes.fields.deleted++;
    }
  }
}

function indexFieldsByColumn(existingFieldsResult) {
  const existingFieldByColumn = new Map();
  for (const row of existingFieldsResult.rows) {
    if (row.ad_column_id) {
      existingFieldByColumn.set(row.ad_column_id, row.etgo_sf_field_id);
    }
  }
  return existingFieldByColumn;
}

function tallyFieldChange(fieldCreated, changes) {
  if (fieldCreated) changes.fields.created++;
  else changes.fields.updated++;
}

async function deleteStaleEntities(existingEntityByTab, visitedEntityIds, client, changes) {
  for (const [, existingEntityId] of existingEntityByTab) {
    if (!visitedEntityIds.has(existingEntityId)) {
      // Delete fields for stale entity first
      const staleFieldsResult = await client.query(
          'SELECT COUNT(*) as cnt FROM etgo_sf_field WHERE etgo_sf_entity_id = $1',
          [existingEntityId],
      );
      const staleFieldCount = parseInt(staleFieldsResult.rows[0].cnt, 10);
      await client.query(
          'DELETE FROM etgo_sf_field WHERE etgo_sf_entity_id = $1',
          [existingEntityId],
      );
      changes.fields.deleted += staleFieldCount;

      await client.query(
          'DELETE FROM etgo_sf_entity WHERE etgo_sf_entity_id = $1',
          [existingEntityId],
      );
      changes.entities.deleted++;
    }
  }
}

function indexEntitiesByTabAndName(existingEntitiesResult, existingEntityByTab, existingEntityByName) {
  for (const row of existingEntitiesResult.rows) {
    if (row.ad_tab_id) {
      existingEntityByTab.set(row.ad_tab_id, row.etgo_sf_entity_id);
    }
    if (row.name) {
      existingEntityByName.set(row.name, row.etgo_sf_entity_id);
    }
  }
}

/**
 * Populate entities + fields for a Window-type spec from AD_Tab/AD_Column.
 * Incremental: matches entities by ad_tab_id, fields by ad_column_id.
 */
async function populateWindowSpec(client, { specId, windowId, moduleId, excludeSystemColumns, includeAllMethods, audit }) {
  // Get active tabs ordered by seqno. name + ad_tab_id are tiebreakers:
  // when two modules attach tabs to the same window with the same SeqNo the
  // primary sort is ambiguous, and the entity SEQNO assigned below is derived
  // from iteration order — so without a stable tiebreaker the output flips
  // across runs and pollutes ETGO_SF_ENTITY.xml.
  const tabsResult = await client.query(
    `SELECT ad_tab_id, name, ad_table_id, seqno
     FROM ad_tab
     WHERE ad_window_id = $1 AND isactive = 'Y'
     ORDER BY seqno, name, ad_tab_id`,
    [windowId],
  );

  // Load existing entities for this spec, indexed by ad_tab_id and name (fallback)
  const existingEntitiesResult = await client.query(
    `SELECT etgo_sf_entity_id, ad_tab_id, name FROM etgo_sf_entity WHERE etgo_sf_spec_id = $1`,
    [specId],
  );
  const existingEntityByTab = new Map();
  const existingEntityByName = new Map();
  indexEntitiesByTabAndName(existingEntitiesResult, existingEntityByTab, existingEntityByName);

  const methodFlags = includeAllMethods
    ? { isGet: 'Y', isGetbyid: 'Y', isPost: 'Y', isPut: 'Y', isPatch: 'Y', isDelete: 'Y' }
    : {};

  let entityCount = 0;
  let fieldCount = 0;
  const entities = [];
  const changes = {
    entities: { created: 0, updated: 0, deleted: 0 },
    fields: { created: 0, updated: 0, deleted: 0 },
  };

  // Track which existing entity IDs we visit (to detect stale ones)
  const visitedEntityIds = new Set();

  for (const tab of tabsResult.rows) {
    const entitySeqNo = (entityCount + 1) * 10;
    const existingEntityId = existingEntityByTab.get(tab.ad_tab_id)
      || existingEntityByName.get(tab.name)
      || null;

    const { entityId, created: entityCreated } = await upsertEntity(client, {
      specId,
      tabId: tab.ad_tab_id,
      moduleId,
      name: tab.name,
      seqNo: entitySeqNo,
      entityId: existingEntityId,
      ...methodFlags,
      audit,
    });
    entityCount++;
    visitedEntityIds.add(entityId);
    if (entityCreated) changes.entities.created++;
    else changes.entities.updated++;

    // Load existing fields for this entity, indexed by ad_column_id.
    // ORDER BY is required: without it Postgres can return duplicate
    // (entity_id, ad_column_id) rows in any order, and Map.set() keeps the
    // last one — producing a non-deterministic flip across runs.
    const existingFieldsResult = await client.query(
      `SELECT etgo_sf_field_id, ad_column_id FROM etgo_sf_field
       WHERE etgo_sf_entity_id = $1
       ORDER BY created, etgo_sf_field_id`,
      [entityId],
    );
    const existingFieldByColumn = indexFieldsByColumn(existingFieldsResult);

    // Get active columns for this tab's table
    // ORDER BY needs a tiebreaker: AD_Column.position is not unique within a
    // table. When two columns share the same position, the row order is
    // undefined — and since fieldSeqCounter assigns SEQNO = counter * 10, any
    // flip across runs produces SEQNO churn in ETGO_SF_FIELD.xml. columnname
    // + ad_column_id pin the order deterministically.
    const colsResult = await client.query(
      `SELECT ad_column_id, columnname, position
       FROM ad_column
       WHERE ad_table_id = $1 AND isactive = 'Y'
       ORDER BY position, columnname, ad_column_id`,
      [tab.ad_table_id],
    );

    const visitedFieldIds = new Set();
    let fieldSeqCounter = 0;
    for (const col of colsResult.rows) {
      if (excludeSystemColumns && SYSTEM_COLUMNS.includes(col.columnname.toLowerCase())) {
        continue;
      }

      fieldSeqCounter++;
      const existingFieldId = existingFieldByColumn.get(col.ad_column_id) || null;

      const { fieldId, created: fieldCreated } = await upsertField(client, {
        entityId,
        columnId: col.ad_column_id,
        moduleId,
        fieldId: existingFieldId,
        seqNo: fieldSeqCounter * 10,
        audit,
      });
      fieldCount++;
      visitedFieldIds.add(fieldId);
      tallyFieldChange(fieldCreated, changes);
    }

    await deleteStaleFields(existingFieldByColumn, visitedFieldIds, client, changes);

    entities.push({ entityId, name: tab.name, tabId: tab.ad_tab_id });
  }

  // Delete stale entities (exist in DB but tab no longer in AD)
  await deleteStaleEntities(existingEntityByTab, visitedEntityIds, client, changes);

  return { entityCount, fieldCount, entities, changes };
}

async function deleteDuplicateEntities(existingEntityResult, entityId, client, changes) {
  for (const row of existingEntityResult.rows) {
    if (row.etgo_sf_entity_id !== entityId) {
      await client.query(
          'DELETE FROM etgo_sf_field WHERE etgo_sf_entity_id = $1',
          [row.etgo_sf_entity_id],
      );
      await client.query(
          'DELETE FROM etgo_sf_entity WHERE etgo_sf_entity_id = $1',
          [row.etgo_sf_entity_id],
      );
      changes.entities.deleted++;
    }
  }
}

/**
 * Populate entity + fields for a Process-type spec from AD_Process_Para.
 * Incremental: matches the single entity by spec, fields by java_qualifier.
 */
async function populateProcessSpec(client, { specId, processId, moduleId, audit }) {
  // Get process name
  const procResult = await client.query(
    'SELECT name FROM ad_process WHERE ad_process_id = $1',
    [processId],
  );
  const processName = procResult.rows[0]?.name || 'unnamed-process';

  const changes = {
    entities: { created: 0, updated: 0, deleted: 0 },
    fields: { created: 0, updated: 0, deleted: 0 },
  };

  // Check for existing entity (process specs have exactly 1)
  const existingEntityResult = await client.query(
    `SELECT etgo_sf_entity_id FROM etgo_sf_entity WHERE etgo_sf_spec_id = $1`,
    [specId],
  );
  const existingEntityId = existingEntityResult.rows[0]?.etgo_sf_entity_id || null;

  const { entityId, created: entityCreated } = await upsertEntity(client, {
    specId,
    tabId: null,
    moduleId,
    name: processName,
    entityId: existingEntityId,
    isPost: 'Y',
    seqNo: 10,
    audit,
  });
  if (entityCreated) changes.entities.created++;
  else changes.entities.updated++;

  // Delete any extra entities beyond the one we just upserted (shouldn't happen, but be safe)
  if (existingEntityResult.rows.length > 1) {
    await deleteDuplicateEntities(existingEntityResult, entityId, client, changes);
  }

  // Load existing fields indexed by java_qualifier
  const existingFieldsResult = await client.query(
    `SELECT etgo_sf_field_id, java_qualifier FROM etgo_sf_field WHERE etgo_sf_entity_id = $1`,
    [entityId],
  );
  const existingFieldByQualifier = new Map();
  for (const row of existingFieldsResult.rows) {
    if (row.java_qualifier) {
      existingFieldByQualifier.set(row.java_qualifier, row.etgo_sf_field_id);
    }
  }

  // Get active process parameters. AD_Process_Para.SeqNo is not unique per
  // process — name + ad_process_para_id pin the order so SEQNO assigned via
  // fieldCount doesn't flip across runs.
  const parasResult = await client.query(
    `SELECT ad_process_para_id, name, defaultvalue, seqno
     FROM ad_process_para
     WHERE ad_process_id = $1 AND isactive = 'Y'
     ORDER BY seqno, name, ad_process_para_id`,
    [processId],
  );

  const visitedFieldIds = new Set();
  let fieldCount = 0;
  for (const para of parasResult.rows) {
    fieldCount++;
    const existingFieldId = existingFieldByQualifier.get(para.name) || null;

    const { fieldId, created: fieldCreated } = await upsertField(client, {
      entityId,
      columnId: null,
      moduleId,
      fieldId: existingFieldId,
      javaQualifier: para.name,
      defaultValue: para.defaultvalue || null,
      seqNo: fieldCount * 10,
      audit,
    });
    visitedFieldIds.add(fieldId);
    if (fieldCreated) changes.fields.created++;
    else changes.fields.updated++;
  }

  // Delete stale fields (exist in DB but param removed from AD)
  for (const [, existingFieldId] of existingFieldByQualifier) {
    if (!visitedFieldIds.has(existingFieldId)) {
      await client.query(
        'DELETE FROM etgo_sf_field WHERE etgo_sf_field_id = $1',
        [existingFieldId],
      );
      changes.fields.deleted++;
    }
  }

  return {
    entityCount: 1,
    fieldCount,
    entities: [{ entityId, name: processName, tabId: null }],
    changes,
  };
}
