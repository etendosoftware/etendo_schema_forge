/**
 * Tests for incremental populateSpec in neo-writer.js.
 *
 * Uses a mock pg client to simulate DB interactions without a real database.
 * Verifies that populateSpec correctly creates, updates, and deletes
 * entities and fields based on AD metadata changes.
 */
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { populateSpec } from '../src/neo-writer.js';

// ---------------------------------------------------------------------------
// Mock pg client
// ---------------------------------------------------------------------------

/**
 * Build a mock pg client that answers queries from an in-memory data store.
 * Tables: etgo_sf_spec, etgo_sf_entity, etgo_sf_field, ad_tab, ad_column,
 *         ad_process, ad_process_para.
 */
function createMockClient(data) {
  const store = {
    specs: new Map(data.specs || []),           // specId -> { spec_type, ad_window_id, ad_process_id }
    entities: new Map(data.entities || []),      // entityId -> { etgo_sf_spec_id, ad_tab_id, name, ... }
    fields: new Map(data.fields || []),          // fieldId -> { etgo_sf_entity_id, ad_column_id, java_qualifier, ... }
    tabs: data.tabs || [],                       // [{ ad_tab_id, name, ad_table_id, seqno, ad_window_id }]
    columns: data.columns || [],                 // [{ ad_column_id, columnname, position, ad_table_id }]
    processes: data.processes || [],              // [{ ad_process_id, name }]
    processParas: data.processParas || [],        // [{ ad_process_para_id, name, defaultvalue, seqno, ad_process_id }]
  };

  // Track all queries for assertion
  const queryLog = [];

  function query(sql, params) {
    queryLog.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const s = sql.replace(/\s+/g, ' ').trim();

    // SELECT spec
    if (s.includes('FROM etgo_sf_spec WHERE etgo_sf_spec_id')) {
      const spec = store.specs.get(params[0]);
      return { rows: spec ? [spec] : [] };
    }

    // SELECT existing entities for spec (may include name column)
    if (s.includes('etgo_sf_entity_id, ad_tab_id') && s.includes('FROM etgo_sf_entity WHERE etgo_sf_spec_id')) {
      const rows = [];
      for (const [id, ent] of store.entities) {
        if (ent.etgo_sf_spec_id === params[0]) {
          rows.push({ etgo_sf_entity_id: id, ad_tab_id: ent.ad_tab_id, name: ent.name });
        }
      }
      return { rows };
    }

    // SELECT existing entities (id only) for process spec
    if (s.includes('SELECT etgo_sf_entity_id FROM etgo_sf_entity WHERE etgo_sf_spec_id')) {
      const rows = [];
      for (const [id, ent] of store.entities) {
        if (ent.etgo_sf_spec_id === params[0]) {
          rows.push({ etgo_sf_entity_id: id });
        }
      }
      return { rows };
    }

    // SELECT existing fields by entity (with ad_column_id)
    if (s.includes('SELECT etgo_sf_field_id, ad_column_id FROM etgo_sf_field WHERE etgo_sf_entity_id')) {
      const rows = [];
      for (const [id, f] of store.fields) {
        if (f.etgo_sf_entity_id === params[0]) {
          rows.push({ etgo_sf_field_id: id, ad_column_id: f.ad_column_id });
        }
      }
      return { rows };
    }

    // SELECT existing fields by entity (with java_qualifier)
    if (s.includes('SELECT etgo_sf_field_id, java_qualifier FROM etgo_sf_field WHERE etgo_sf_entity_id')) {
      const rows = [];
      for (const [id, f] of store.fields) {
        if (f.etgo_sf_entity_id === params[0]) {
          rows.push({ etgo_sf_field_id: id, java_qualifier: f.java_qualifier });
        }
      }
      return { rows };
    }

    // COUNT stale fields
    if (s.includes('SELECT COUNT(*)') && s.includes('etgo_sf_field') && s.includes('etgo_sf_entity_id')) {
      let cnt = 0;
      for (const [, f] of store.fields) {
        if (f.etgo_sf_entity_id === params[0]) cnt++;
      }
      return { rows: [{ cnt: String(cnt) }] };
    }

    // SELECT tabs
    if (s.includes('FROM ad_tab WHERE ad_window_id')) {
      const rows = store.tabs
        .filter(t => t.ad_window_id === params[0])
        .sort((a, b) => a.seqno - b.seqno);
      return { rows };
    }

    // SELECT tab name (for upsertEntity fallback)
    if (s.includes('SELECT name FROM ad_tab WHERE ad_tab_id')) {
      const tab = store.tabs.find(t => t.ad_tab_id === params[0]);
      return { rows: tab ? [{ name: tab.name }] : [] };
    }

    // SELECT columns
    if (s.includes('FROM ad_column WHERE ad_table_id')) {
      const rows = store.columns
        .filter(c => c.ad_table_id === params[0])
        .sort((a, b) => a.position - b.position);
      return { rows };
    }

    // SELECT process name
    if (s.includes('FROM ad_process WHERE ad_process_id')) {
      const proc = store.processes.find(p => p.ad_process_id === params[0]);
      return { rows: proc ? [{ name: proc.name }] : [] };
    }

    // SELECT process params
    if (s.includes('FROM ad_process_para WHERE ad_process_id')) {
      const rows = store.processParas
        .filter(p => p.ad_process_id === params[0])
        .sort((a, b) => a.seqno - b.seqno);
      return { rows };
    }

    // Check spec name duplicate
    if (s.includes('FROM etgo_sf_spec WHERE name')) {
      return { rows: [] };
    }

    // INSERT entity
    if (s.includes('INSERT INTO etgo_sf_entity')) {
      const entityId = params[0];
      store.entities.set(entityId, {
        etgo_sf_spec_id: params[1],
        ad_tab_id: params[2],
        name: params[4],
      });
      return { rows: [] };
    }

    // UPDATE entity
    if (s.includes('UPDATE etgo_sf_entity')) {
      const entityId = params[15]; // last param is WHERE id
      const existing = store.entities.get(entityId);
      if (existing) {
        existing.name = params[3];
        existing.ad_tab_id = params[1];
      }
      return { rows: [] };
    }

    // INSERT field
    if (s.includes('INSERT INTO etgo_sf_field')) {
      const fieldId = params[0];
      store.fields.set(fieldId, {
        etgo_sf_entity_id: params[1],
        ad_column_id: params[2],
        java_qualifier: params[7],
      });
      return { rows: [] };
    }

    // UPDATE field
    if (s.includes('UPDATE etgo_sf_field')) {
      const fieldId = params[10]; // last param is WHERE id
      const existing = store.fields.get(fieldId);
      if (existing) {
        existing.ad_column_id = params[1];
        existing.java_qualifier = params[6];
      }
      return { rows: [] };
    }

    // DELETE field by id
    if (s.includes('DELETE FROM etgo_sf_field WHERE etgo_sf_field_id')) {
      store.fields.delete(params[0]);
      return { rows: [] };
    }

    // DELETE fields by entity
    if (s.includes('DELETE FROM etgo_sf_field WHERE etgo_sf_entity_id')) {
      for (const [id, f] of store.fields) {
        if (f.etgo_sf_entity_id === params[0]) store.fields.delete(id);
      }
      return { rows: [] };
    }

    // DELETE entity by id
    if (s.includes('DELETE FROM etgo_sf_entity WHERE etgo_sf_entity_id')) {
      store.entities.delete(params[0]);
      return { rows: [] };
    }

    return { rows: [] };
  }

  return {
    query: async (sql, params) => query(sql, params),
    store,
    queryLog,
  };
}

// ---------------------------------------------------------------------------
// Window spec tests
// ---------------------------------------------------------------------------

describe('populateSpec (window, incremental)', () => {
  const SPEC_ID = 'SPEC001';
  const MODULE_ID = 'MOD001';
  const WINDOW_ID = 'WIN001';
  const TAB1_ID = 'TAB001';
  const TAB2_ID = 'TAB002';
  const TABLE1_ID = 'TBL001';
  const TABLE2_ID = 'TBL002';

  it('creates entities and fields from scratch on empty DB', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
        { ad_column_id: 'COL002', columnname: 'C_BPartner_ID', position: 20, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 1);
    assert.equal(result.fieldCount, 2);
    assert.equal(result.changes.entities.created, 1);
    assert.equal(result.changes.entities.updated, 0);
    assert.equal(result.changes.entities.deleted, 0);
    assert.equal(result.changes.fields.created, 2);
    assert.equal(result.changes.fields.updated, 0);
    assert.equal(result.changes.fields.deleted, 0);
  });

  it('reuses existing entity IDs when re-running with same tabs', async () => {
    const EXISTING_ENTITY_ID = 'ENT_EXISTING_001';
    const EXISTING_FIELD_ID_1 = 'FLD_EXISTING_001';
    const EXISTING_FIELD_ID_2 = 'FLD_EXISTING_002';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      entities: [
        [EXISTING_ENTITY_ID, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB1_ID, name: 'Header' }],
      ],
      fields: [
        [EXISTING_FIELD_ID_1, { etgo_sf_entity_id: EXISTING_ENTITY_ID, ad_column_id: 'COL001' }],
        [EXISTING_FIELD_ID_2, { etgo_sf_entity_id: EXISTING_ENTITY_ID, ad_column_id: 'COL002' }],
      ],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
        { ad_column_id: 'COL002', columnname: 'C_BPartner_ID', position: 20, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 1);
    assert.equal(result.entities[0].entityId, EXISTING_ENTITY_ID);
    assert.equal(result.changes.entities.created, 0);
    assert.equal(result.changes.entities.updated, 1);
    assert.equal(result.changes.fields.created, 0);
    assert.equal(result.changes.fields.updated, 2);
    assert.equal(result.changes.fields.deleted, 0);
  });

  it('is idempotent: second run with same metadata produces zero creates/deletes', async () => {
    const EXISTING_ENTITY_ID = 'ENT_IDEM_001';
    const EXISTING_FIELD_ID = 'FLD_IDEM_001';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      entities: [
        [EXISTING_ENTITY_ID, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB1_ID, name: 'Header' }],
      ],
      fields: [
        [EXISTING_FIELD_ID, { etgo_sf_entity_id: EXISTING_ENTITY_ID, ad_column_id: 'COL001' }],
      ],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.changes.entities.created, 0);
    assert.equal(result.changes.entities.deleted, 0);
    assert.equal(result.changes.fields.created, 0);
    assert.equal(result.changes.fields.deleted, 0);
    // Only updates (touch audit columns)
    assert.equal(result.changes.entities.updated, 1);
    assert.equal(result.changes.fields.updated, 1);
  });

  it('deletes stale entities when a tab is removed from AD', async () => {
    const ENT_KEEP = 'ENT_KEEP';
    const ENT_STALE = 'ENT_STALE';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      entities: [
        [ENT_KEEP, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB1_ID, name: 'Header' }],
        [ENT_STALE, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB2_ID, name: 'Lines' }],
      ],
      fields: [
        ['FLD_STALE_1', { etgo_sf_entity_id: ENT_STALE, ad_column_id: 'COL_S1' }],
      ],
      tabs: [
        // Only TAB1 remains — TAB2 was removed from AD
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 1);
    assert.equal(result.changes.entities.deleted, 1);
    assert.equal(result.changes.fields.deleted, 1); // stale entity's field
    // The stale entity should be removed from the store
    assert.equal(client.store.entities.has(ENT_STALE), false);
    assert.equal(client.store.fields.has('FLD_STALE_1'), false);
  });

  it('deletes stale fields when a column is removed from AD', async () => {
    const ENT_ID = 'ENT_001';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      entities: [
        [ENT_ID, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB1_ID, name: 'Header' }],
      ],
      fields: [
        ['FLD_KEEP', { etgo_sf_entity_id: ENT_ID, ad_column_id: 'COL001' }],
        ['FLD_STALE', { etgo_sf_entity_id: ENT_ID, ad_column_id: 'COL_REMOVED' }],
      ],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        // Only COL001 remains — COL_REMOVED no longer exists
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.fieldCount, 1);
    assert.equal(result.changes.fields.updated, 1);
    assert.equal(result.changes.fields.deleted, 1);
    assert.equal(client.store.fields.has('FLD_STALE'), false);
    assert.equal(client.store.fields.has('FLD_KEEP'), true);
  });

  it('creates new entities for new tabs while keeping existing ones', async () => {
    const ENT_EXISTING = 'ENT_EXISTING';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      entities: [
        [ENT_EXISTING, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: TAB1_ID, name: 'Header' }],
      ],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
        { ad_tab_id: TAB2_ID, name: 'Lines', ad_table_id: TABLE2_ID, seqno: 20, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
        { ad_column_id: 'COL003', columnname: 'Product', position: 10, ad_table_id: TABLE2_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 2);
    assert.equal(result.changes.entities.created, 1); // new Lines entity
    assert.equal(result.changes.entities.updated, 1); // existing Header entity
    assert.equal(result.entities[0].entityId, ENT_EXISTING); // reused ID
    assert.notEqual(result.entities[1].entityId, ENT_EXISTING); // new ID for Lines
  });

  it('excludes system columns by default', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'W', ad_window_id: WINDOW_ID, ad_process_id: null }]],
      tabs: [
        { ad_tab_id: TAB1_ID, name: 'Header', ad_table_id: TABLE1_ID, seqno: 10, ad_window_id: WINDOW_ID },
      ],
      columns: [
        { ad_column_id: 'COL001', columnname: 'DocumentNo', position: 10, ad_table_id: TABLE1_ID },
        { ad_column_id: 'COL_SYS', columnname: 'AD_Client_ID', position: 20, ad_table_id: TABLE1_ID },
        { ad_column_id: 'COL_SYS2', columnname: 'Updated', position: 30, ad_table_id: TABLE1_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.fieldCount, 1); // only DocumentNo
  });

  it('throws on unknown spec', async () => {
    const client = createMockClient({ specs: [] });

    await assert.rejects(
      () => populateSpec(client, { specId: 'NONEXISTENT', moduleId: MODULE_ID }),
      /Spec not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// Process spec tests
// ---------------------------------------------------------------------------

describe('populateSpec (process, incremental)', () => {
  const SPEC_ID = 'SPEC_PROC';
  const MODULE_ID = 'MOD001';
  const PROCESS_ID = 'PROC001';

  it('creates entity and fields from scratch', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
        { ad_process_para_id: 'PP2', name: 'DateTo', defaultvalue: null, seqno: 20, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 1);
    assert.equal(result.fieldCount, 2);
    assert.equal(result.changes.entities.created, 1);
    assert.equal(result.changes.fields.created, 2);
    assert.equal(result.changes.fields.deleted, 0);
  });

  it('reuses existing entity and field IDs on re-run', async () => {
    const EXISTING_ENT = 'ENT_PROC_EXIST';
    const EXISTING_FLD1 = 'FLD_PROC_1';
    const EXISTING_FLD2 = 'FLD_PROC_2';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      entities: [
        [EXISTING_ENT, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices' }],
      ],
      fields: [
        [EXISTING_FLD1, { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'DateFrom' }],
        [EXISTING_FLD2, { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'DateTo' }],
      ],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
        { ad_process_para_id: 'PP2', name: 'DateTo', defaultvalue: null, seqno: 20, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entities[0].entityId, EXISTING_ENT);
    assert.equal(result.changes.entities.created, 0);
    assert.equal(result.changes.entities.updated, 1);
    assert.equal(result.changes.fields.created, 0);
    assert.equal(result.changes.fields.updated, 2);
    assert.equal(result.changes.fields.deleted, 0);
  });

  it('deletes stale fields when a process param is removed', async () => {
    const EXISTING_ENT = 'ENT_PROC_EXIST';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      entities: [
        [EXISTING_ENT, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices' }],
      ],
      fields: [
        ['FLD_KEEP', { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'DateFrom' }],
        ['FLD_STALE', { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'OldParam' }],
      ],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        // Only DateFrom remains — OldParam removed
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.fieldCount, 1);
    assert.equal(result.changes.fields.updated, 1);
    assert.equal(result.changes.fields.deleted, 1);
    assert.equal(client.store.fields.has('FLD_STALE'), false);
    assert.equal(client.store.fields.has('FLD_KEEP'), true);
  });

  it('creates new fields for new process params', async () => {
    const EXISTING_ENT = 'ENT_PROC_EXIST';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      entities: [
        [EXISTING_ENT, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices' }],
      ],
      fields: [
        ['FLD_EXISTING', { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'DateFrom' }],
      ],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
        { ad_process_para_id: 'PP2', name: 'NewParam', defaultvalue: 'default', seqno: 20, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.fieldCount, 2);
    assert.equal(result.changes.fields.updated, 1); // DateFrom
    assert.equal(result.changes.fields.created, 1); // NewParam
  });

  it('deletes duplicate entities, keeping the first one', async () => {
    // A process spec must have exactly one entity. Seed two pointing at the
    // same spec to exercise the deleteDuplicateEntities cleanup path.
    const ENT_KEEP = 'ENT_PROC_KEEP';
    const ENT_DUP = 'ENT_PROC_DUP';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      entities: [
        [ENT_KEEP, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices' }],
        [ENT_DUP, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices (dup)' }],
      ],
      fields: [
        ['FLD_DUP', { etgo_sf_entity_id: ENT_DUP, ad_column_id: null, java_qualifier: 'Stale' }],
      ],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    // First entity reused, the duplicate removed along with its fields.
    assert.equal(result.entities[0].entityId, ENT_KEEP);
    assert.equal(result.changes.entities.deleted, 1);
    assert.equal(client.store.entities.has(ENT_DUP), false);
    assert.equal(client.store.entities.has(ENT_KEEP), true);
    assert.equal(client.store.fields.has('FLD_DUP'), false);
  });

  it('is idempotent for process specs', async () => {
    const EXISTING_ENT = 'ENT_PROC_IDEM';
    const EXISTING_FLD = 'FLD_PROC_IDEM';

    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'P', ad_window_id: null, ad_process_id: PROCESS_ID }]],
      entities: [
        [EXISTING_ENT, { etgo_sf_spec_id: SPEC_ID, ad_tab_id: null, name: 'Generate Invoices' }],
      ],
      fields: [
        [EXISTING_FLD, { etgo_sf_entity_id: EXISTING_ENT, ad_column_id: null, java_qualifier: 'DateFrom' }],
      ],
      processes: [{ ad_process_id: PROCESS_ID, name: 'Generate Invoices' }],
      processParas: [
        { ad_process_para_id: 'PP1', name: 'DateFrom', defaultvalue: null, seqno: 10, ad_process_id: PROCESS_ID },
      ],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.changes.entities.created, 0);
    assert.equal(result.changes.entities.deleted, 0);
    assert.equal(result.changes.fields.created, 0);
    assert.equal(result.changes.fields.deleted, 0);
    assert.equal(result.entities[0].entityId, EXISTING_ENT);
  });
});

// ---------------------------------------------------------------------------
// Result shape tests
// ---------------------------------------------------------------------------

describe('populateSpec result shape', () => {
  it('window spec returns entityCount, fieldCount, entities, and changes', async () => {
    const client = createMockClient({
      specs: [['S1', { spec_type: 'W', ad_window_id: 'W1', ad_process_id: null }]],
      tabs: [{ ad_tab_id: 'T1', name: 'Tab1', ad_table_id: 'TBL1', seqno: 10, ad_window_id: 'W1' }],
      columns: [{ ad_column_id: 'C1', columnname: 'Name', position: 10, ad_table_id: 'TBL1' }],
    });

    const result = await populateSpec(client, { specId: 'S1', moduleId: 'M1' });

    assert.equal(typeof result.entityCount, 'number');
    assert.equal(typeof result.fieldCount, 'number');
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.changes);
    assert.ok(result.changes.entities);
    assert.ok(result.changes.fields);
    assert.equal(typeof result.changes.entities.created, 'number');
    assert.equal(typeof result.changes.entities.updated, 'number');
    assert.equal(typeof result.changes.entities.deleted, 'number');
    assert.equal(typeof result.changes.fields.created, 'number');
    assert.equal(typeof result.changes.fields.updated, 'number');
    assert.equal(typeof result.changes.fields.deleted, 'number');
  });

  it('process spec returns same shape with changes', async () => {
    const client = createMockClient({
      specs: [['S1', { spec_type: 'P', ad_window_id: null, ad_process_id: 'P1' }]],
      processes: [{ ad_process_id: 'P1', name: 'MyProc' }],
      processParas: [],
    });

    const result = await populateSpec(client, { specId: 'S1', moduleId: 'M1' });

    assert.equal(typeof result.entityCount, 'number');
    assert.equal(typeof result.fieldCount, 'number');
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.changes);
    assert.ok(result.changes.entities);
    assert.ok(result.changes.fields);
  });

  it('report spec returns same shape with changes', async () => {
    const client = createMockClient({
      specs: [['S1', { spec_type: 'R', ad_window_id: null, ad_process_id: null }]],
    });

    const result = await populateSpec(client, { specId: 'S1', moduleId: 'M1' });

    assert.equal(typeof result.entityCount, 'number');
    assert.equal(typeof result.fieldCount, 'number');
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.changes);
    assert.ok(result.changes.entities);
    assert.ok(result.changes.fields);
    assert.equal(typeof result.changes.entities.created, 'number');
    assert.equal(typeof result.changes.entities.updated, 'number');
    assert.equal(typeof result.changes.entities.deleted, 'number');
    assert.equal(typeof result.changes.fields.created, 'number');
    assert.equal(typeof result.changes.fields.updated, 'number');
    assert.equal(typeof result.changes.fields.deleted, 'number');
  });
});

// ---------------------------------------------------------------------------
// Report spec tests (ETP-4255)
//
// Report specs (spec_type === 'R') are NEO-native callable metadata only. They
// are NOT backed by AD_Process/Jasper, so populateSpec must NOT derive any
// process-style entities/fields and must NOT write anything to the DB. It
// simply returns a fully-zeroed result.
// ---------------------------------------------------------------------------

describe('populateSpec (report)', () => {
  const SPEC_ID = 'SPEC_REPORT';
  const MODULE_ID = 'MOD001';

  it('returns a fully zeroed result with no AD derivation', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'R', ad_window_id: null, ad_process_id: null }]],
    });

    const result = await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    assert.equal(result.entityCount, 0);
    assert.equal(result.fieldCount, 0);
    assert.deepEqual(result.entities, []);
    assert.equal(result.changes.entities.created, 0);
    assert.equal(result.changes.entities.updated, 0);
    assert.equal(result.changes.entities.deleted, 0);
    assert.equal(result.changes.fields.created, 0);
    assert.equal(result.changes.fields.updated, 0);
    assert.equal(result.changes.fields.deleted, 0);
  });

  it('does not derive AD metadata or write to the DB', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'R', ad_window_id: null, ad_process_id: null }]],
    });

    await populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID });

    const queries = client.queryLog.map(q => q.sql);

    // The ONLY query allowed is the spec-type lookup.
    assert.equal(queries.length, 1, `expected a single query, got: ${JSON.stringify(queries)}`);
    assert.match(queries[0], /FROM etgo_sf_spec WHERE etgo_sf_spec_id/);

    // No AD metadata-derivation reads. The spec-type lookup itself selects the
    // ad_window_id / ad_process_id columns, so it is excluded from these checks.
    const derivationQueries = queries.filter(
      sql => !/FROM etgo_sf_spec WHERE etgo_sf_spec_id/.test(sql),
    );
    for (const sql of derivationQueries) {
      assert.doesNotMatch(sql, /FROM ad_tab/i);
      assert.doesNotMatch(sql, /FROM ad_column/i);
      assert.doesNotMatch(sql, /FROM ad_process/i);
      assert.doesNotMatch(sql, /FROM ad_process_para/i);
    }

    // No entity/field writes of any kind.
    for (const sql of queries) {
      assert.doesNotMatch(sql, /INSERT INTO etgo_sf_entity/i);
      assert.doesNotMatch(sql, /UPDATE etgo_sf_entity/i);
      assert.doesNotMatch(sql, /DELETE FROM etgo_sf_entity/i);
      assert.doesNotMatch(sql, /INSERT INTO etgo_sf_field/i);
      assert.doesNotMatch(sql, /UPDATE etgo_sf_field/i);
      assert.doesNotMatch(sql, /DELETE FROM etgo_sf_field/i);
    }

    // The in-memory store stayed empty.
    assert.equal(client.store.entities.size, 0);
    assert.equal(client.store.fields.size, 0);
  });

  it('throws on an unrecognized spec type', async () => {
    const client = createMockClient({
      specs: [[SPEC_ID, { spec_type: 'X', ad_window_id: null, ad_process_id: null }]],
    });

    await assert.rejects(
      () => populateSpec(client, { specId: SPEC_ID, moduleId: MODULE_ID }),
      /Unknown spec type: X/,
    );
  });
});
