import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  specNaturalKey,
  entityNaturalKey,
  fieldNaturalKey,
  computeWindowDelta,
  serializeDelta,
} from '../src/lib/neo-delta.js';

// ---------------------------------------------------------------------------
// Natural key helpers
// ---------------------------------------------------------------------------

describe('neo-delta natural keys', () => {
  it('specNaturalKey returns spec name as-is', () => {
    assert.equal(specNaturalKey('sales-order'), 'sales-order');
  });

  it('entityNaturalKey joins spec/tabId', () => {
    assert.equal(entityNaturalKey('sales-order', '100'), 'sales-order/100');
  });

  it('fieldNaturalKey joins spec/tabId/colId', () => {
    assert.equal(fieldNaturalKey('sales-order', '100', '200'), 'sales-order/100/200');
  });
});

// ---------------------------------------------------------------------------
// serializeDelta
// ---------------------------------------------------------------------------

describe('serializeDelta', () => {
  it('sorts row keys alphabetically with _naturalKey first', () => {
    const delta = {
      spec: 'test',
      tables: {
        ETGO_SF_SPEC: {
          upserts: [{ _naturalKey: 'test', Z_COL: 'z', A_COL: 'a', ETGO_SF_SPEC_ID: '1' }],
          deletes: [],
        },
        ETGO_SF_ENTITY: { upserts: [], deletes: [] },
        ETGO_SF_FIELD: { upserts: [], deletes: [] },
      },
    };
    const result = serializeDelta(delta);
    const keys = Object.keys(result.tables.ETGO_SF_SPEC.upserts[0]);
    assert.equal(keys[0], '_naturalKey');
    assert.equal(keys[1], 'A_COL');
    assert.equal(keys[2], 'ETGO_SF_SPEC_ID');
    assert.equal(keys[3], 'Z_COL');
  });

  it('sorts rows by _naturalKey', () => {
    const delta = {
      spec: 'test',
      tables: {
        ETGO_SF_SPEC: { upserts: [], deletes: [] },
        ETGO_SF_ENTITY: {
          upserts: [
            { _naturalKey: 'test/B', NAME: 'second' },
            { _naturalKey: 'test/A', NAME: 'first' },
          ],
          deletes: [],
        },
        ETGO_SF_FIELD: { upserts: [], deletes: [] },
      },
    };
    const result = serializeDelta(delta);
    assert.equal(result.tables.ETGO_SF_ENTITY.upserts[0]._naturalKey, 'test/A');
    assert.equal(result.tables.ETGO_SF_ENTITY.upserts[1]._naturalKey, 'test/B');
  });

  it('preserves table order: SPEC → ENTITY → FIELD', () => {
    const delta = {
      spec: 'test',
      tables: {
        ETGO_SF_FIELD: { upserts: [], deletes: [] },
        ETGO_SF_SPEC: { upserts: [], deletes: [] },
        ETGO_SF_ENTITY: { upserts: [], deletes: [] },
      },
    };
    const result = serializeDelta(delta);
    const tableKeys = Object.keys(result.tables);
    assert.deepEqual(tableKeys, ['ETGO_SF_SPEC', 'ETGO_SF_ENTITY', 'ETGO_SF_FIELD']);
  });
});

// ---------------------------------------------------------------------------
// computeWindowDelta
// ---------------------------------------------------------------------------

describe('computeWindowDelta', () => {
  const MODULE_ID = 'AABBCCDD11223344';

  function minimalDelta(overrides = {}) {
    return computeWindowDelta({
      specName: 'test-window',
      windowId: 'W001',
      moduleId: MODULE_ID,
      contract: {
        backendContract: {
          entities: {
            header: {
              tabId: 'T1',
              tabName: 'Header',
              tableName: 'C_Order',
              fields: [
                { name: 'documentNo', column: 'DocumentNo', visibility: 'readOnly' },
                { name: 'dateOrdered', column: 'DateOrdered', visibility: 'editable' },
              ],
            },
          },
        },
      },
      decisions: {},
      adTabs: [
        { ad_tab_id: 'T1', ad_table_id: 'TBL1', name: 'Header' },
      ],
      adColumns: [
        { ad_column_id: 'C1', ad_table_id: 'TBL1', columnname: 'DocumentNo' },
        { ad_column_id: 'C2', ad_table_id: 'TBL1', columnname: 'DateOrdered' },
        { ad_column_id: 'C3', ad_table_id: 'TBL1', columnname: 'AD_Client_ID' },
      ],
      prevSnapshot: { spec: [], entity: [], field: [] },
      ...overrides,
    });
  }

  it('produces spec upsert with correct shape', () => {
    const delta = minimalDelta();
    const specUpserts = delta.tables.ETGO_SF_SPEC.upserts;
    assert.equal(specUpserts.length, 1);
    assert.equal(specUpserts[0].NAME, 'test-window');
    assert.equal(specUpserts[0].SPEC_TYPE, 'W');
    assert.equal(specUpserts[0].AD_WINDOW_ID, 'W001');
    assert.equal(specUpserts[0].AD_MODULE_ID, MODULE_ID);
    assert.equal(specUpserts[0].ISACTIVE, 'Y');
  });

  it('creates entity upsert for each tab', () => {
    const delta = minimalDelta();
    const entities = delta.tables.ETGO_SF_ENTITY.upserts;
    assert.equal(entities.length, 1);
    assert.equal(entities[0].AD_TAB_ID, 'T1');
    assert.equal(entities[0].ISGET, 'Y');
    assert.equal(entities[0].ISPOST, 'Y');
  });

  it('excludes system columns by default', () => {
    const delta = minimalDelta();
    const fields = delta.tables.ETGO_SF_FIELD.upserts;
    const colIds = fields.map(f => f.AD_COLUMN_ID);
    assert.ok(!colIds.includes('C3'), 'AD_Client_ID (system column) should be excluded');
    assert.equal(fields.length, 2);
  });

  it('includes system columns when excludeSystemColumns=false', () => {
    // C3 must be an existing row (in prevSnapshot) so the live-push parity
    // filter does not prune it. New ISINCLUDED=N records are never created.
    const prevSnapshot = {
      spec:   [{ ETGO_SF_SPEC_ID: 'S1', NAME: 'test-window', ISACTIVE: 'Y' }],
      entity: [{ ETGO_SF_ENTITY_ID: 'E1', ETGO_SF_SPEC_ID: 'S1', AD_TAB_ID: 'T1', NAME: 'header' }],
      field:  [{ ETGO_SF_FIELD_ID: 'F3', ETGO_SF_ENTITY_ID: 'E1', AD_COLUMN_ID: 'C3' }],
    };
    const delta = minimalDelta({ excludeSystemColumns: false, prevSnapshot });
    const fields = delta.tables.ETGO_SF_FIELD.upserts;
    assert.equal(fields.length, 3);
    const c3 = fields.find(f => f.AD_COLUMN_ID === 'C3');
    assert.equal(c3.ISINCLUDED, 'N', 'system column not in contract → excluded');
  });

  it('does not create new ETGO_SF_FIELD records for non-contract fields', () => {
    // New field with ISINCLUDED=N must be pruned (live push never inserts these).
    const delta = minimalDelta({ excludeSystemColumns: false });
    const fields = delta.tables.ETGO_SF_FIELD.upserts;
    const colIds = fields.map(f => f.AD_COLUMN_ID);
    assert.ok(!colIds.includes('C3'), 'new non-contract column must not appear in upserts');
    assert.equal(fields.length, 2);
  });

  it('maps visibility correctly for contract fields', () => {
    const delta = minimalDelta();
    const fields = delta.tables.ETGO_SF_FIELD.upserts;
    const docNo = fields.find(f => f.AD_COLUMN_ID === 'C1');
    const dateOrdered = fields.find(f => f.AD_COLUMN_ID === 'C2');
    assert.equal(docNo.ISINCLUDED, 'Y');
    assert.equal(docNo.ISREADONLY, 'Y', 'readOnly field');
    assert.equal(dateOrdered.ISINCLUDED, 'Y');
    assert.equal(dateOrdered.ISREADONLY, 'N', 'editable field');
  });

  it('reuses prev-snapshot IDs for existing rows', () => {
    const delta = minimalDelta({
      prevSnapshot: {
        spec: [
          { ETGO_SF_SPEC_ID: 'EXISTING_SPEC_ID', NAME: 'test-window', ISACTIVE: 'Y' },
        ],
        entity: [
          {
            ETGO_SF_ENTITY_ID: 'EXISTING_ENTITY_ID',
            ETGO_SF_SPEC_ID: 'EXISTING_SPEC_ID',
            AD_TAB_ID: 'T1',
            NAME: 'header',
          },
        ],
        field: [
          {
            ETGO_SF_FIELD_ID: 'EXISTING_FIELD_ID',
            ETGO_SF_ENTITY_ID: 'EXISTING_ENTITY_ID',
            AD_COLUMN_ID: 'C1',
          },
        ],
      },
    });
    assert.equal(delta.tables.ETGO_SF_SPEC.upserts[0].ETGO_SF_SPEC_ID, 'EXISTING_SPEC_ID');
    assert.equal(delta.tables.ETGO_SF_ENTITY.upserts[0].ETGO_SF_ENTITY_ID, 'EXISTING_ENTITY_ID');
    const fieldC1 = delta.tables.ETGO_SF_FIELD.upserts.find(f => f.AD_COLUMN_ID === 'C1');
    assert.equal(fieldC1.ETGO_SF_FIELD_ID, 'EXISTING_FIELD_ID');
  });

  it('computes deletes for entities/fields removed from prev-snapshot', () => {
    const delta = minimalDelta({
      prevSnapshot: {
        spec: [
          { ETGO_SF_SPEC_ID: 'S1', NAME: 'test-window' },
        ],
        entity: [
          { ETGO_SF_ENTITY_ID: 'E1', ETGO_SF_SPEC_ID: 'S1', AD_TAB_ID: 'T1', NAME: 'header' },
          { ETGO_SF_ENTITY_ID: 'E_OLD', ETGO_SF_SPEC_ID: 'S1', AD_TAB_ID: 'T_REMOVED', NAME: 'old-tab' },
        ],
        field: [
          { ETGO_SF_FIELD_ID: 'F1', ETGO_SF_ENTITY_ID: 'E1', AD_COLUMN_ID: 'C1' },
          { ETGO_SF_FIELD_ID: 'F_OLD', ETGO_SF_ENTITY_ID: 'E_OLD', AD_COLUMN_ID: 'C_GONE' },
        ],
      },
    });
    assert.equal(delta.tables.ETGO_SF_ENTITY.deletes.length, 1);
    assert.equal(delta.tables.ETGO_SF_ENTITY.deletes[0].ETGO_SF_ENTITY_ID, 'E_OLD');
    assert.equal(delta.tables.ETGO_SF_FIELD.deletes.length, 1);
    assert.equal(delta.tables.ETGO_SF_FIELD.deletes[0].ETGO_SF_FIELD_ID, 'F_OLD');
  });

  it('spec deletes is always empty', () => {
    const delta = minimalDelta();
    assert.deepEqual(delta.tables.ETGO_SF_SPEC.deletes, []);
  });

  it('applies defaultExpr from decisions', () => {
    const delta = minimalDelta({
      decisions: {
        entities: {
          header: {
            name: 'header',
            fields: {
              dateOrdered: { defaultExpr: 'now()' },
            },
          },
        },
      },
    });
    const dateField = delta.tables.ETGO_SF_FIELD.upserts.find(f => f.AD_COLUMN_ID === 'C2');
    assert.equal(dateField.DEFAULTVALUE, 'now()');
  });

  it('resolves entity name from contract', () => {
    const delta = minimalDelta();
    const entity = delta.tables.ETGO_SF_ENTITY.upserts[0];
    assert.equal(entity.NAME, 'header');
  });

  it('uses javaQualifier from contract when present', () => {
    const delta = minimalDelta({
      contract: {
        backendContract: {
          entities: {
            header: {
              tabId: 'T1',
              tabName: 'Header',
              tableName: 'C_Order',
              javaQualifier: 'sales-order-header',
              fields: [
                { name: 'documentNo', column: 'DocumentNo', visibility: 'readOnly' },
              ],
            },
          },
        },
      },
    });
    const entity = delta.tables.ETGO_SF_ENTITY.upserts[0];
    assert.equal(entity.JAVA_QUALIFIER, 'sales-order-header');
  });

  it('handles discarded visibility', () => {
    // Field must be in prevSnapshot so it is treated as existing — the filter
    // only prunes NEW records that would be ISINCLUDED=N.
    const delta = computeWindowDelta({
      specName: 'test',
      windowId: 'W1',
      moduleId: MODULE_ID,
      contract: {
        backendContract: {
          entities: {
            header: {
              tabId: 'T1',
              tabName: 'Header',
              tableName: 'TBL1',
              fields: [
                { name: 'hidden', column: 'HiddenCol', visibility: 'discarded' },
              ],
            },
          },
        },
      },
      decisions: {},
      adTabs: [{ ad_tab_id: 'T1', ad_table_id: 'TBL1', name: 'Header' }],
      adColumns: [{ ad_column_id: 'C1', ad_table_id: 'TBL1', columnname: 'HiddenCol' }],
      prevSnapshot: {
        spec:   [{ ETGO_SF_SPEC_ID: 'S1', NAME: 'test', ISACTIVE: 'Y' }],
        entity: [{ ETGO_SF_ENTITY_ID: 'E1', ETGO_SF_SPEC_ID: 'S1', AD_TAB_ID: 'T1', NAME: 'header' }],
        field:  [{ ETGO_SF_FIELD_ID: 'F1', ETGO_SF_ENTITY_ID: 'E1', AD_COLUMN_ID: 'C1' }],
      },
    });
    const field = delta.tables.ETGO_SF_FIELD.upserts[0];
    assert.equal(field.ISINCLUDED, 'N', 'discarded → ISINCLUDED=N');
  });

  it('multi-tab produces multiple entities with correct sequence', () => {
    const delta = computeWindowDelta({
      specName: 'multi',
      windowId: 'W1',
      moduleId: MODULE_ID,
      contract: {
        backendContract: {
          entities: {
            header: { tabId: 'T1', tabName: 'Header', fields: [] },
            lines: { tabId: 'T2', tabName: 'Lines', fields: [] },
          },
        },
      },
      decisions: {},
      adTabs: [
        { ad_tab_id: 'T1', ad_table_id: 'TBL1', name: 'Header' },
        { ad_tab_id: 'T2', ad_table_id: 'TBL2', name: 'Lines' },
      ],
      adColumns: [],
      prevSnapshot: { spec: [], entity: [], field: [] },
    });
    const entities = delta.tables.ETGO_SF_ENTITY.upserts;
    assert.equal(entities.length, 2);
    assert.equal(entities[0].SEQNO, '10');
    assert.equal(entities[1].SEQNO, '20');
  });
});
