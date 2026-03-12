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
 * @param {string} [params.specType='W'] - 'W' (window), 'P' (process), or 'R' (report)
 * @param {string} [params.description]
 * @param {string} [params.specId] - If provided, UPDATE instead of INSERT
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ specId: string, created: boolean }}
 */
export async function upsertSpec(client, params) {
  const {
    name,
    moduleId,
    windowId = null,
    processId = null,
    specType = 'W',
    description = null,
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
           ad_module_id = $5, description = $6, updated = $7, updatedby = $8
       WHERE etgo_sf_spec_id = $9`,
      [name, specType, windowId, processId, moduleId, description,
       auditVals.updated, auditVals.updatedby, existingId],
    );
    return { specId: existingId, created: false };
  }

  // INSERT
  const specId = generateId();
  await client.query(
    `INSERT INTO etgo_sf_spec
     (etgo_sf_spec_id, name, spec_type, ad_window_id, ad_process_id, ad_module_id,
      description, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [specId, name, specType, windowId, processId, moduleId, description,
     auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
     auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby],
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
    moduleId,
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
 * @param {string} [params.javaQualifier]
 * @param {number} [params.seqNo]
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ fieldId: string, created: boolean }}
 */
export async function upsertField(client, params) {
  const {
    entityId,
    columnId = null,
    moduleId,
    fieldId: existingId = null,
    isIncluded = 'Y',
    isReadOnly = 'N',
    defaultValue = null,
    javaQualifier = null,
    seqNo = null,
    audit = {},
  } = params;

  const auditVals = auditDefaults(audit);

  if (existingId) {
    await client.query(
      `UPDATE etgo_sf_field
       SET etgo_sf_entity_id = $1, ad_column_id = $2, ad_module_id = $3,
           isincluded = $4, isreadonly = $5, defaultvalue = $6,
           java_qualifier = $7, seqno = $8, updated = $9, updatedby = $10
       WHERE etgo_sf_field_id = $11`,
      [entityId, columnId, moduleId,
       isIncluded, isReadOnly, defaultValue,
       javaQualifier, seqNo, auditVals.updated, auditVals.updatedby, existingId],
    );
    return { fieldId: existingId, created: false };
  }

  const fieldId = generateId();
  await client.query(
    `INSERT INTO etgo_sf_field
     (etgo_sf_field_id, etgo_sf_entity_id, ad_column_id, ad_module_id,
      isincluded, isreadonly, defaultvalue, java_qualifier, seqno,
      ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [fieldId, entityId, columnId, moduleId,
     isIncluded, isReadOnly, defaultValue, javaQualifier, seqNo,
     auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
     auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby],
  );
  return { fieldId, created: true };
}

// ---------------------------------------------------------------------------
// populateSpec
// ---------------------------------------------------------------------------

/**
 * Populate a spec by reading AD metadata and creating entities + fields.
 * Deletes existing entities/fields first, then recreates from AD.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 * @param {string} params.specId - The spec to populate
 * @param {string} params.moduleId - AD_Module_ID for new rows
 * @param {boolean} [params.excludeSystemColumns=true]
 * @param {boolean} [params.includeAllMethods=false]
 * @param {object} [params.audit] - Override audit defaults
 * @returns {{ entityCount: number, fieldCount: number, entities: Array }}
 */
export async function populateSpec(client, params) {
  const {
    specId,
    moduleId,
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

  // Delete existing fields for this spec's entities, then delete entities
  await client.query(
    `DELETE FROM etgo_sf_field
     WHERE etgo_sf_entity_id IN (
       SELECT etgo_sf_entity_id FROM etgo_sf_entity WHERE etgo_sf_spec_id = $1
     )`,
    [specId],
  );
  await client.query(
    'DELETE FROM etgo_sf_entity WHERE etgo_sf_spec_id = $1',
    [specId],
  );

  if (spec.spec_type === 'W') {
    return populateWindowSpec(client, { specId, windowId: spec.ad_window_id, moduleId, excludeSystemColumns, includeAllMethods, audit });
  } else if (spec.spec_type === 'P' || spec.spec_type === 'R') {
    // Reports use the same AD_Process_Para structure as processes
    return populateProcessSpec(client, { specId, processId: spec.ad_process_id, moduleId, audit });
  }

  throw new Error(`Unknown spec type: ${spec.spec_type}`);
}

/**
 * Populate entities + fields for a Window-type spec from AD_Tab/AD_Column.
 */
async function populateWindowSpec(client, { specId, windowId, moduleId, excludeSystemColumns, includeAllMethods, audit }) {
  // Get active tabs ordered by seqno
  const tabsResult = await client.query(
    `SELECT ad_tab_id, name, ad_table_id, seqno
     FROM ad_tab
     WHERE ad_window_id = $1 AND isactive = 'Y'
     ORDER BY seqno`,
    [windowId],
  );

  const methodFlags = includeAllMethods
    ? { isGet: 'Y', isGetbyid: 'Y', isPost: 'Y', isPut: 'Y', isPatch: 'Y', isDelete: 'Y' }
    : {};

  let entityCount = 0;
  let fieldCount = 0;
  const entities = [];

  for (const tab of tabsResult.rows) {
    const entitySeqNo = (entityCount + 1) * 10;
    const { entityId } = await upsertEntity(client, {
      specId,
      tabId: tab.ad_tab_id,
      moduleId,
      name: tab.name,
      seqNo: entitySeqNo,
      ...methodFlags,
      audit,
    });
    entityCount++;

    // Get active columns for this tab's table
    const colsResult = await client.query(
      `SELECT ad_column_id, columnname, position
       FROM ad_column
       WHERE ad_table_id = $1 AND isactive = 'Y'
       ORDER BY position`,
      [tab.ad_table_id],
    );

    let fieldSeqCounter = 0;
    for (const col of colsResult.rows) {
      // Skip system columns if flag is set
      if (excludeSystemColumns && SYSTEM_COLUMNS.includes(col.columnname.toLowerCase())) {
        continue;
      }

      fieldSeqCounter++;
      await upsertField(client, {
        entityId,
        columnId: col.ad_column_id,
        moduleId,
        seqNo: fieldSeqCounter * 10,
        audit,
      });
      fieldCount++;
    }

    entities.push({ entityId, name: tab.name, tabId: tab.ad_tab_id });
  }

  return { entityCount, fieldCount, entities };
}

/**
 * Populate entity + fields for a Process-type spec from AD_Process_Para.
 */
async function populateProcessSpec(client, { specId, processId, moduleId, audit }) {
  // Get process name
  const procResult = await client.query(
    'SELECT name FROM ad_process WHERE ad_process_id = $1',
    [processId],
  );
  const processName = procResult.rows[0]?.name || 'unnamed-process';

  // Create single POST-only entity
  const { entityId } = await upsertEntity(client, {
    specId,
    tabId: null, // Process specs have no tab — ad_tab_id must be NULL
    moduleId,
    name: processName,
    isPost: 'Y',
    seqNo: 10,
    audit,
  });

  // Get active process parameters
  const parasResult = await client.query(
    `SELECT ad_process_para_id, name, defaultvalue, seqno
     FROM ad_process_para
     WHERE ad_process_id = $1 AND isactive = 'Y'
     ORDER BY seqno`,
    [processId],
  );

  let fieldCount = 0;
  for (const para of parasResult.rows) {
    fieldCount++;
    await upsertField(client, {
      entityId,
      columnId: null, // Process params have no AD_Column
      moduleId,
      javaQualifier: para.name,
      defaultValue: para.defaultvalue || null,
      seqNo: fieldCount * 10,
      audit,
    });
  }

  return {
    entityCount: 1,
    fieldCount,
    entities: [{ entityId, name: processName, tabId: null }],
  };
}
