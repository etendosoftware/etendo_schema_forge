import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeWindowDelta, serializeDelta, specNaturalKey, entityNaturalKey, fieldNaturalKey } from '../src/lib/neo-delta.js';

const ETENDO_ID_REGEX = /^[0-9A-F]{32}$/;

/**
 * Slice 2 belated tests: lock down the pure delta computation that
 * push-to-neo --dump-delta wraps. These tests target the SAME function
 * the CLI invokes, so they cover the value-producing path end-to-end
 * (everything except disk I/O and DB connect — both pure-data).
 */

function baseContract() {
  return {
    backendContract: {
      specType: 'W',
      window: { id: '143' },
      entities: {
        Order: {
          tabId: '187',
          tabName: 'Header',
          tableName: 'C_Order',
          fields: [
            { name: 'documentNo', column: 'DocumentNo', visibility: 'readOnly' },
            { name: 'partner',    column: 'C_BPartner_ID', visibility: 'editable' },
          ],
        },
      },
    },
  };
}

function baseAdTabs() {
  return [{ ad_tab_id: '187', name: 'Header', ad_table_id: '259', seqno: 10 }];
}
function baseAdColumns() {
  return [
    { ad_table_id: '259', ad_column_id: '2070', columnname: 'DocumentNo', position: 1 },
    { ad_table_id: '259', ad_column_id: '2071', columnname: 'C_BPartner_ID', position: 2 },
  ];
}
function emptyPrev() {
  return { spec: [], entity: [], field: [] };
}

test('spec upsert only — empty prev produces one SPEC upsert with an Etendo-format UUID', () => {
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: emptyPrev(),
  });
  assert.equal(delta.spec, 'sales-order');
  assert.equal(delta.tables.ETGO_SF_SPEC.upserts.length, 1);
  const specRow = delta.tables.ETGO_SF_SPEC.upserts[0];
  assert.equal(specRow._naturalKey, 'sales-order');
  assert.equal(specRow.NAME, 'sales-order');
  assert.equal(specRow.SPEC_TYPE, 'W');
  assert.equal(specRow.AD_WINDOW_ID, '143');
  assert.match(specRow.ETGO_SF_SPEC_ID, ETENDO_ID_REGEX);
  // No deletes from an empty prev.
  assert.equal(delta.tables.ETGO_SF_SPEC.deletes.length, 0);
  assert.equal(delta.tables.ETGO_SF_ENTITY.deletes.length, 0);
  assert.equal(delta.tables.ETGO_SF_FIELD.deletes.length, 0);
});

test('entity rename — contract renames tab to a different entity name, UUID preserved if prev exists', () => {
  // Prev has the spec + entity with old name. Contract renames it.
  const prev = {
    spec: [{ ETGO_SF_SPEC_ID: 'PREV-SPEC', NAME: 'sales-order' }],
    entity: [{ ETGO_SF_ENTITY_ID: 'PREV-ENT', ETGO_SF_SPEC_ID: 'PREV-SPEC', AD_TAB_ID: '187', NAME: 'OldName' }],
    field: [],
  };
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(), // entity is named "Order"
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: prev,
  });
  const entityRow = delta.tables.ETGO_SF_ENTITY.upserts.find(r => r.AD_TAB_ID === '187');
  assert.ok(entityRow, 'entity upsert present');
  assert.equal(entityRow.ETGO_SF_ENTITY_ID, 'PREV-ENT', 'prev entity UUID preserved');
  assert.equal(entityRow.NAME, 'Order', 'name comes from contract');
  // Spec UUID also preserved.
  assert.equal(delta.tables.ETGO_SF_SPEC.upserts[0].ETGO_SF_SPEC_ID, 'PREV-SPEC');
});

test('field visibility flip — readOnly maps to ISINCLUDED=Y, ISREADONLY=Y', () => {
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: emptyPrev(),
  });
  const docNoField = delta.tables.ETGO_SF_FIELD.upserts.find(r => r.AD_COLUMN_ID === '2070');
  assert.ok(docNoField);
  assert.equal(docNoField.ISINCLUDED, 'Y');
  assert.equal(docNoField.ISREADONLY, 'Y', 'readOnly visibility → ISREADONLY=Y');
  const partnerField = delta.tables.ETGO_SF_FIELD.upserts.find(r => r.AD_COLUMN_ID === '2071');
  assert.equal(partnerField.ISREADONLY, 'N', 'editable visibility → ISREADONLY=N');
});

test('agentPrompt decisions are emitted for spec and matching fields', () => {
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {
      window: { agentPrompt: '  Confirm before completing.  ' },
      entities: {
        Order: {
          fields: {
            partner: { agentPrompt: '  Pick the correct customer.  ' },
          },
        },
      },
    },
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: emptyPrev(),
  });

  const specRow = delta.tables.ETGO_SF_SPEC.upserts[0];
  const partnerField = delta.tables.ETGO_SF_FIELD.upserts.find(r => r.AD_COLUMN_ID === '2071');
  assert.equal(specRow.AGENT_PROMPT, 'Confirm before completing.');
  assert.equal(partnerField.AGENT_PROMPT, 'Pick the correct customer.');
});

test('missing field agentPrompt emits null when previous XML had one', () => {
  const prev = {
    spec: [{ ETGO_SF_SPEC_ID: 'PREV-SPEC', NAME: 'sales-order' }],
    entity: [{ ETGO_SF_ENTITY_ID: 'PREV-ENT', ETGO_SF_SPEC_ID: 'PREV-SPEC', AD_TAB_ID: '187' }],
    field: [
      {
        ETGO_SF_FIELD_ID: 'PREV-FIELD',
        ETGO_SF_ENTITY_ID: 'PREV-ENT',
        AD_COLUMN_ID: '2071',
        AGENT_PROMPT: 'Old prompt',
      },
    ],
  };

  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: prev,
  });

  const partnerField = delta.tables.ETGO_SF_FIELD.upserts.find(r => r.AD_COLUMN_ID === '2071');
  assert.equal(partnerField.AGENT_PROMPT, null);
});

test('missing agentPrompt emits null when previous XML column exists with empty value', () => {
  const prev = {
    spec: [{ ETGO_SF_SPEC_ID: 'PREV-SPEC', NAME: 'sales-order', AGENT_PROMPT: '' }],
    entity: [{ ETGO_SF_ENTITY_ID: 'PREV-ENT', ETGO_SF_SPEC_ID: 'PREV-SPEC', AD_TAB_ID: '187' }],
    field: [
      {
        ETGO_SF_FIELD_ID: 'PREV-FIELD',
        ETGO_SF_ENTITY_ID: 'PREV-ENT',
        AD_COLUMN_ID: '2071',
        AGENT_PROMPT: '',
      },
    ],
  };

  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: prev,
  });

  const specRow = delta.tables.ETGO_SF_SPEC.upserts[0];
  const partnerField = delta.tables.ETGO_SF_FIELD.upserts.find(r => r.AD_COLUMN_ID === '2071');
  assert.equal(specRow.AGENT_PROMPT, null);
  assert.equal(partnerField.AGENT_PROMPT, null);
});

test('field deleted — prev has a field whose column is no longer in contract emits a delete', () => {
  const prev = {
    spec: [{ ETGO_SF_SPEC_ID: 'PREV-SPEC', NAME: 'sales-order' }],
    entity: [{ ETGO_SF_ENTITY_ID: 'PREV-ENT', ETGO_SF_SPEC_ID: 'PREV-SPEC', AD_TAB_ID: '187' }],
    field: [
      // Vanished column — not in adColumns + not in contract.
      { ETGO_SF_FIELD_ID: 'STALE', ETGO_SF_ENTITY_ID: 'PREV-ENT', AD_COLUMN_ID: '9999' },
    ],
  };
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: prev,
  });
  const deletes = delta.tables.ETGO_SF_FIELD.deletes;
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].ETGO_SF_FIELD_ID, 'STALE');
  assert.equal(deletes[0]._naturalKey, 'sales-order/187/9999');
});

test('serializeDelta produces stable, deterministically ordered output', () => {
  const delta = computeWindowDelta({
    specName: 'sales-order',
    windowId: '143',
    moduleId: 'M1',
    contract: baseContract(),
    decisions: {},
    adTabs: baseAdTabs(),
    adColumns: baseAdColumns(),
    prevSnapshot: emptyPrev(),
  });
  const a = JSON.stringify(serializeDelta(delta));
  const b = JSON.stringify(serializeDelta(delta));
  assert.equal(a, b, 'idempotent serialization');
  // First key in each upsert row is _naturalKey for human review.
  const firstKey = Object.keys(serializeDelta(delta).tables.ETGO_SF_SPEC.upserts[0])[0];
  assert.equal(firstKey, '_naturalKey');
});

test('natural-key helpers match contract identity rules', () => {
  assert.equal(specNaturalKey('sales-order'), 'sales-order');
  assert.equal(entityNaturalKey('sales-order', '187'), 'sales-order/187');
  assert.equal(fieldNaturalKey('sales-order', '187', '2070'), 'sales-order/187/2070');
});
