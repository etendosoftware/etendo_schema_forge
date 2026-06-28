import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  generateFrontendContract,
  generateBackendContract,
  generateTestManifest,
  generateContract,
  generateApiPrediction,
  splitWindowContractArtifacts,
} from '../src/generate-contract.js';

const minimalSchema = {
  version: '0.1.0',
  window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
  entities: [{
    name: 'order',
    table: 'C_Order',
    level: 'header',
    fields: [
      { name: 'documentNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly',
        required: true, searchable: true, grid: true, form: true },
      { name: 'dateOrdered', column: 'DateOrdered', type: 'date', visibility: 'editable',
        required: true, searchable: true, grid: true, form: true },
      { name: 'grandTotal', column: 'GrandTotal', type: 'amount', visibility: 'readOnly',
        required: false, searchable: false, grid: true, form: true },
      { name: 'adClientId', column: 'AD_Client_ID', type: 'id', visibility: 'system',
        systemCategory: 'internal', derivation: { type: 'fromConfig', source: 'context.client' },
        required: true, searchable: false, grid: false, form: false },
    ]
  }]
};

const sampleRules = [
  { name: 'calcTotal', type: 'callout', tier: 'auto', autoDecision: 'keep',
    effects: [{ field: 'grandTotal', action: 'setValue' }] },
  { name: 'validateDate', type: 'validation', tier: 'auto', autoDecision: 'keep' }
];

const sampleProcesses = [
  {
    name: 'completeOrder',
    entity: 'order',
    preconditions: [{ field: 'docStatus', operator: 'equals', value: 'DR' }],
    steps: [
      { order: 1, operation: 'validate', target: 'header.docStatus', rule: 'must be Draft' },
      { order: 2, operation: 'mutation', target: 'header.docStatus', value: 'CO' }
    ],
    edgeCases: [
      { name: 'alreadyCompleted', trigger: 'docStatus=CO', expected: 'error' },
      { name: 'emptyLines', trigger: 'no lines', expected: 'error' },
      { name: 'zeroAmount', trigger: 'grandTotal=0', expected: 'warning' }
    ]
  }
];

describe('generateFrontendContract', () => {
  it('excludes system fields', () => {
    const fc = generateFrontendContract(minimalSchema);
    const orderFields = fc.entities.order.fields;
    assert.ok(orderFields.find(f => f.name === 'documentNo'));
    assert.ok(orderFields.find(f => f.name === 'dateOrdered'));
    assert.ok(orderFields.find(f => f.name === 'grandTotal'));
    assert.ok(!orderFields.find(f => f.name === 'adClientId'));
  });

  it('includes searchable fields list', () => {
    const fc = generateFrontendContract(minimalSchema);
    assert.ok(fc.entities.order.searchableFields.includes('documentNo'));
    assert.ok(fc.entities.order.searchableFields.includes('dateOrdered'));
    assert.ok(!fc.entities.order.searchableFields.includes('grandTotal'));
  });

  it('maps types to TypeScript types', () => {
    const fc = generateFrontendContract(minimalSchema);
    const docNo = fc.entities.order.fields.find(f => f.name === 'documentNo');
    assert.equal(docNo.tsType, 'string');
    const date = fc.entities.order.fields.find(f => f.name === 'dateOrdered');
    assert.equal(date.tsType, 'string'); // dates as ISO strings
    const total = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(total.tsType, 'number');
  });
});

const behavioralSchema = {
  version: '0.1.0',
  window: { id: '500', name: 'Behavioral', primaryEntity: 'order', category: 'test' },
  entities: [{
    name: 'order',
    table: 'C_Order',
    level: 'header',
    fields: [
      { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable',
        required: true, searchable: true, grid: true, form: true,
        callout: 'org.example.BPCallout' },
      { name: 'warehouse', column: 'M_Warehouse_ID', type: 'foreignKey', visibility: 'editable',
        required: true, searchable: false, grid: false, form: true,
        displayLogic: '@DocStatus@=DR' },
      { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey', visibility: 'editable',
        required: true, searchable: false, grid: false, form: true,
        readOnlyLogic: '@Processed@=Y' },
      { name: 'plainField', column: 'PlainCol', type: 'string', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true },
    ]
  }]
};

const behavioralRules = [
  { name: 'org.example.BPCallout', type: 'callout', className: 'org.example.BPCallout',
    effects: [{ field: 'partnerAddress', action: 'setValue' }, { field: 'priceList', action: 'setValue' }],
    complexity: 'medium' },
  { name: '@DocStatus@=DR', type: 'displayLogic', className: '@DocStatus@=DR',
    translated: 'record.docStatus === "DR"' },
  { name: '@Processed@=Y', type: 'readOnlyLogic', className: '@Processed@=Y',
    translated: 'record.processed === true' },
];

describe('generateFrontendContract — behavioral metadata', () => {
  it('field with callout gets callout.className in frontendContract', () => {
    const fc = generateFrontendContract(behavioralSchema);
    const bp = fc.entities.order.fields.find(f => f.name === 'businessPartner');
    assert.ok(bp.callout, 'callout metadata should be present');
    assert.equal(bp.callout.className, 'org.example.BPCallout');
  });

  it('field with displayLogic gets displayLogic.raw in frontendContract', () => {
    const fc = generateFrontendContract(behavioralSchema);
    const wh = fc.entities.order.fields.find(f => f.name === 'warehouse');
    assert.ok(wh.displayLogic, 'displayLogic metadata should be present');
    assert.equal(wh.displayLogic.raw, '@DocStatus@=DR');
  });

  it('field with readOnlyLogic gets readOnlyLogic.raw in frontendContract', () => {
    const fc = generateFrontendContract(behavioralSchema);
    const pl = fc.entities.order.fields.find(f => f.name === 'priceList');
    assert.ok(pl.readOnlyLogic, 'readOnlyLogic metadata should be present');
    assert.equal(pl.readOnlyLogic.raw, '@Processed@=Y');
  });

  it('field without behavioral metadata does NOT have callout/displayLogic/readOnlyLogic keys', () => {
    const fc = generateFrontendContract(behavioralSchema);
    const plain = fc.entities.order.fields.find(f => f.name === 'plainField');
    assert.equal(plain.callout, undefined, 'plain field should not have callout');
    assert.equal(plain.displayLogic, undefined, 'plain field should not have displayLogic');
    assert.equal(plain.readOnlyLogic, undefined, 'plain field should not have readOnlyLogic');
  });

  it('callout effects are populated from rules when available', () => {
    const fc = generateFrontendContract(behavioralSchema, behavioralRules);
    const bp = fc.entities.order.fields.find(f => f.name === 'businessPartner');
    assert.ok(bp.callout.effects, 'callout effects should be present when rules match');
    assert.deepStrictEqual(bp.callout.effects, ['partnerAddress', 'priceList']);
    assert.equal(bp.callout.complexity, 'medium');
  });

  it('displayLogic.js is populated from rules translation when available', () => {
    const fc = generateFrontendContract(behavioralSchema, behavioralRules);
    const wh = fc.entities.order.fields.find(f => f.name === 'warehouse');
    assert.equal(wh.displayLogic.js, 'record.docStatus === "DR"');
  });

  it('readOnlyLogic.js is populated from rules translation when available', () => {
    const fc = generateFrontendContract(behavioralSchema, behavioralRules);
    const pl = fc.entities.order.fields.find(f => f.name === 'priceList');
    assert.equal(pl.readOnlyLogic.js, 'record.processed === true');
  });

  it('non-evaluable readOnlyLogic is flagged with reason and null js', () => {
    // @#User_Level@ matches the @#\w+@ session-preference pattern in
    // classifyEvaluability, so the expression cannot be evaluated client-side.
    const nonEvaluableSchema = {
      version: '0.1.0',
      window: { id: '510', name: 'Non Evaluable', primaryEntity: 'order', category: 'test' },
      entities: [{
        name: 'order',
        table: 'C_Order',
        level: 'header',
        fields: [
          { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey', visibility: 'editable',
            required: true, searchable: false, grid: false, form: true,
            readOnlyLogic: "@#User_Level@='S'" },
        ],
      }],
    };
    const fc = generateFrontendContract(nonEvaluableSchema);
    const pl = fc.entities.order.fields.find(f => f.name === 'priceList');
    assert.ok(pl.readOnlyLogic, 'readOnlyLogic metadata should be present');
    assert.equal(pl.readOnlyLogic.evaluable, false, 'should be flagged non-evaluable');
    assert.equal(pl.readOnlyLogic.reason, 'session-preference', 'reason should be set');
    assert.equal(pl.readOnlyLogic.js, null, 'js should be nulled for non-evaluable logic');
  });

  it('readOnlyLogic.js uses matching rule.translated when the expression is evaluable', () => {
    // The expression is evaluable (a plain field reference), so applyReadOnlyLogic
    // keeps the matchingRule.translated value instead of recomputing the JS.
    const translatedSchema = {
      version: '0.1.0',
      window: { id: '520', name: 'Translated RO', primaryEntity: 'order', category: 'test' },
      entities: [{
        name: 'order',
        table: 'C_Order',
        level: 'header',
        fields: [
          { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey', visibility: 'editable',
            required: true, searchable: false, grid: false, form: true,
            readOnlyLogic: '@Processed@=Y' },
        ],
      }],
    };
    const translatedRules = [
      { name: '@Processed@=Y', type: 'readOnlyLogic', className: '@Processed@=Y',
        translated: 'record.customProcessedFlag === true' },
    ];
    const fc = generateFrontendContract(translatedSchema, translatedRules);
    const pl = fc.entities.order.fields.find(f => f.name === 'priceList');
    assert.equal(pl.readOnlyLogic.evaluable, true, 'expression should be evaluable');
    assert.equal(pl.readOnlyLogic.js, 'record.customProcessedFlag === true',
      'js should come from the matching rule translated value');
  });

  it('callout without matching rule has only className, no effects', () => {
    const fc = generateFrontendContract(behavioralSchema, []);
    const bp = fc.entities.order.fields.find(f => f.name === 'businessPartner');
    assert.equal(bp.callout.className, 'org.example.BPCallout');
    assert.equal(bp.callout.effects, undefined, 'no effects without matching rule');
    assert.equal(bp.callout.complexity, undefined, 'no complexity without matching rule');
  });

  it('displayLogic without matching rule has only raw, no js translation', () => {
    const fc = generateFrontendContract(behavioralSchema, []);
    const wh = fc.entities.order.fields.find(f => f.name === 'warehouse');
    assert.equal(wh.displayLogic.raw, '@DocStatus@=DR');
    assert.equal(wh.displayLogic.js, undefined, 'no js without matching rule');
  });
});

describe('generateFrontendContract — forceCalloutFields', () => {
  const schemaWithForceCallout = {
    version: '0.1.0',
    window: { id: '168', name: 'Physical Inventory', primaryEntity: 'inventory', category: 'inventory' },
    entities: [
      {
        name: 'inventory',
        table: 'M_Inventory',
        level: 'header',
        fields: [
          { name: 'warehouse', column: 'M_Warehouse_ID', type: 'foreignKey',
            reference: 'Warehouse', inputMode: 'search',
            visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        ]
      },
      {
        name: 'inventoryLine',
        table: 'M_InventoryLine',
        level: 'line',
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey',
            reference: 'Product', inputMode: 'search',
            visibility: 'editable', required: true, grid: true, form: true,
            lookup: true, forceCalloutFields: ['quantityCount', 'bookQuantity'] },
          { name: 'quantityCount', column: 'QtyCount', type: 'number',
            visibility: 'editable', required: true, grid: true, form: true },
          { name: 'bookQuantity', column: 'QtyBook', type: 'number',
            visibility: 'readOnly', required: false, grid: true, form: true },
        ]
      }
    ]
  };

  it('preserves forceCalloutFields from curated field into frontendContract', () => {
    const fc = generateFrontendContract(schemaWithForceCallout);
    const product = fc.entities.inventoryLine.fields.find(f => f.name === 'product');
    assert.deepStrictEqual(product.forceCalloutFields, ['quantityCount', 'bookQuantity']);
  });

  it('does not add forceCalloutFields when not declared on field', () => {
    const fc = generateFrontendContract(schemaWithForceCallout);
    const qty = fc.entities.inventoryLine.fields.find(f => f.name === 'quantityCount');
    assert.equal(qty.forceCalloutFields, undefined);
  });

  it('does not add forceCalloutFields to a field that has an empty array', () => {
    const schema = {
      ...schemaWithForceCallout,
      entities: schemaWithForceCallout.entities.map(e =>
        e.name === 'inventoryLine'
          ? { ...e, fields: e.fields.map(f =>
              f.name === 'product' ? { ...f, forceCalloutFields: [] } : f
            )}
          : e
      ),
    };
    const fc = generateFrontendContract(schema);
    const product = fc.entities.inventoryLine.fields.find(f => f.name === 'product');
    assert.equal(product.forceCalloutFields, undefined);
  });

  it('preserves forceCalloutFields on a non-FK (number) field', () => {
    const schema = {
      ...schemaWithForceCallout,
      entities: schemaWithForceCallout.entities.map(e =>
        e.name === 'inventoryLine'
          ? { ...e, fields: e.fields.map(f =>
              f.name === 'quantityCount'
                ? { ...f, forceCalloutFields: ['bookQuantity'] }
                : f
            )}
          : e
      ),
    };
    const fc = generateFrontendContract(schema);
    const qty = fc.entities.inventoryLine.fields.find(f => f.name === 'quantityCount');
    assert.deepStrictEqual(qty.forceCalloutFields, ['bookQuantity']);
  });
});

describe('generateBackendContract', () => {
  it('includes all fields including system', () => {
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const orderFields = bc.entities.order.fields;
    assert.ok(orderFields.find(f => f.name === 'adClientId'));
    assert.ok(orderFields.find(f => f.name === 'documentNo'));
  });

  it('generates REST endpoints', () => {
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    assert.ok(bc.endpoints.length > 0);
    const getEndpoint = bc.endpoints.find(e => e.method === 'GET' && e.entity === 'order');
    assert.ok(getEndpoint);
    assert.ok(getEndpoint.supportedFilters.includes('documentNo'));
  });

  it('generates process endpoints', () => {
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const processEndpoint = bc.processEndpoints.find(p => p.name === 'completeOrder');
    assert.ok(processEndpoint);
    assert.equal(processEndpoint.method, 'POST');
  });
});

describe('generateTestManifest', () => {
  it('generates field-presence tests for visible fields', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const presenceTests = manifest.tests.filter(t => t.category === 'field-presence');
    assert.equal(presenceTests.length, 3); // documentNo, dateOrdered, grandTotal (not system)
  });

  it('generates field-type tests', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const typeTests = manifest.tests.filter(t => t.category === 'field-type');
    assert.equal(typeTests.length, 3);
  });

  it('generates searchable-filter tests', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const filterTests = manifest.tests.filter(t => t.category === 'searchable-filters');
    assert.ok(filterTests.length >= 2); // documentNo + dateOrdered
  });

  it('generates process tests (happy, failure, edge)', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const processHappy = manifest.tests.filter(t => t.category === 'process-happy');
    const processEdge = manifest.tests.filter(t => t.category === 'process-edge');
    assert.ok(processHappy.length >= 1);
    assert.ok(processEdge.length >= 3); // 3 edge cases
  });

  it('generates system-field tests', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const systemTests = manifest.tests.filter(t => t.category === 'system-field');
    assert.ok(systemTests.length >= 1); // adClientId
  });

  it('generates rule tests', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const ruleTests = manifest.tests.filter(t => t.category === 'rule-declared');
    assert.equal(ruleTests.length, 2); // calcTotal + validateDate
  });

  it('includes test count summary', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    assert.equal(manifest.summary.total, manifest.tests.length);
    assert.ok(manifest.summary.byCategory);
    assert.ok(manifest.summary.byRunner); // node vs junit counts
  });
});

// ─── Edge Case Tests ───────────────────────────────────────────────────────────

const emptySchema = {
  version: '0.1.0',
  window: { id: '999', name: 'Empty Window', primaryEntity: 'nothing', category: 'test' },
  entities: []
};

const allSystemFieldsSchema = {
  version: '0.1.0',
  window: { id: '200', name: 'System Only', primaryEntity: 'sysEntity', category: 'test' },
  entities: [{
    name: 'sysEntity',
    table: 'AD_System',
    level: 'header',
    fields: [
      { name: 'adClientId', column: 'AD_Client_ID', type: 'id', visibility: 'system',
        systemCategory: 'internal', derivation: { type: 'fromConfig', source: 'context.client' },
        required: true, searchable: false, grid: false, form: false },
      { name: 'adOrgId', column: 'AD_Org_ID', type: 'id', visibility: 'system',
        systemCategory: 'internal', derivation: { type: 'fromConfig', source: 'context.org' },
        required: true, searchable: false, grid: false, form: false },
      { name: 'created', column: 'Created', type: 'datetime', visibility: 'system',
        systemCategory: 'audit', derivation: { type: 'computed', source: 'now()' },
        required: true, searchable: false, grid: false, form: false },
      { name: 'createdBy', column: 'CreatedBy', type: 'id', visibility: 'system',
        systemCategory: 'audit', derivation: { type: 'fromConfig', source: 'context.user' },
        required: true, searchable: false, grid: false, form: false },
    ]
  }]
};

const discardedFieldsSchema = {
  version: '0.1.0',
  window: { id: '300', name: 'With Discarded', primaryEntity: 'item', category: 'test' },
  entities: [{
    name: 'item',
    table: 'M_Item',
    level: 'header',
    fields: [
      { name: 'name', column: 'Name', type: 'string', visibility: 'editable',
        required: true, searchable: true, grid: true, form: true },
      { name: 'obsoleteFlag', column: 'ObsoleteFlag', type: 'boolean', visibility: 'discarded',
        required: false, searchable: false, grid: false, form: false },
      { name: 'legacyCode', column: 'LegacyCode', type: 'string', visibility: 'discarded',
        required: false, searchable: false, grid: false, form: false },
      { name: 'internalId', column: 'InternalID', type: 'id', visibility: 'system',
        derivation: { type: 'sequence', source: 'auto' },
        required: true, searchable: false, grid: false, form: false },
    ]
  }]
};

const multiEntitySchema = {
  version: '0.2.0',
  window: { id: '400', name: 'Multi Entity', primaryEntity: 'header', category: 'test' },
  entities: [
    {
      name: 'header',
      table: 'C_Header',
      level: 'header',
      fields: [
        { name: 'docNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly',
          required: true, searchable: true, grid: true, form: true },
        { name: 'clientId', column: 'AD_Client_ID', type: 'id', visibility: 'system',
          derivation: { type: 'fromConfig', source: 'context.client' },
          required: true, searchable: false, grid: false, form: false },
      ]
    },
    {
      name: 'line',
      table: 'C_Line',
      level: 'line',
      fields: [
        { name: 'lineNo', column: 'Line', type: 'integer', visibility: 'editable',
          required: true, searchable: false, grid: true, form: true },
        { name: 'qty', column: 'QtyOrdered', type: 'number', visibility: 'editable',
          required: true, searchable: false, grid: true, form: true },
        { name: 'clientId', column: 'AD_Client_ID', type: 'id', visibility: 'system',
          derivation: { type: 'fromConfig', source: 'context.client' },
          required: true, searchable: false, grid: false, form: false },
      ]
    }
  ]
};

describe('generateFrontendContract — edge cases', () => {
  it('schema with zero entities produces empty contract', () => {
    const fc = generateFrontendContract(emptySchema);
    assert.deepStrictEqual(fc.entities, {});
    assert.equal(fc.window.name, 'Empty Window');
  });

  it('entity with ALL system fields produces empty fields array', () => {
    const fc = generateFrontendContract(allSystemFieldsSchema);
    assert.equal(fc.entities.sysEntity.fields.length, 0);
    assert.equal(fc.entities.sysEntity.searchableFields.length, 0);
    assert.equal(fc.entities.sysEntity.computedFields.length, 0);
  });

  it('discarded fields are excluded from frontend contract', () => {
    const fc = generateFrontendContract(discardedFieldsSchema);
    const fieldNames = fc.entities.item.fields.map(f => f.name);
    assert.ok(fieldNames.includes('name'));
    assert.ok(!fieldNames.includes('obsoleteFlag'), 'discarded field obsoleteFlag should be excluded');
    assert.ok(!fieldNames.includes('legacyCode'), 'discarded field legacyCode should be excluded');
    assert.ok(!fieldNames.includes('internalId'), 'system field internalId should be excluded');
    assert.equal(fc.entities.item.fields.length, 1);
  });

  it('schema with multiple entities includes all entities', () => {
    const fc = generateFrontendContract(multiEntitySchema);
    assert.ok(fc.entities.header, 'header entity should be present');
    assert.ok(fc.entities.line, 'line entity should be present');
    assert.equal(fc.entities.header.fields.length, 1); // docNo only
    assert.equal(fc.entities.line.fields.length, 2); // lineNo, qty
  });

  it('computed fields list only includes fields with derivation', () => {
    const fc = generateFrontendContract(minimalSchema);
    // Only visible fields with derivation should appear; adClientId is system so excluded
    assert.equal(fc.entities.order.computedFields.length, 0);
  });

  it('maps unknown type to string fallback', () => {
    const schemaWithUnknownType = {
      ...minimalSchema,
      entities: [{
        ...minimalSchema.entities[0],
        fields: [
          { name: 'weirdField', column: 'WeirdCol', type: 'unknownType', visibility: 'editable',
            required: false, searchable: false, grid: true, form: true },
        ]
      }]
    };
    const fc = generateFrontendContract(schemaWithUnknownType);
    const field = fc.entities.order.fields.find(f => f.name === 'weirdField');
    assert.equal(field.tsType, 'string', 'unknown types should fallback to string');
  });
});

describe('generateBackendContract — edge cases', () => {
  it('schema with zero entities produces empty endpoints', () => {
    const bc = generateBackendContract(emptySchema);
    assert.deepStrictEqual(bc.entities, {});
    assert.equal(bc.endpoints.length, 0);
    assert.equal(bc.processEndpoints.length, 0);
  });

  it('generates exactly 5 REST endpoints per entity', () => {
    const bc = generateBackendContract(multiEntitySchema);
    const headerEndpoints = bc.endpoints.filter(e => e.entity === 'header');
    const lineEndpoints = bc.endpoints.filter(e => e.entity === 'line');
    assert.equal(headerEndpoints.length, 5, 'header should have 5 REST methods');
    assert.equal(lineEndpoints.length, 5, 'line should have 5 REST methods');

    // Verify all 5 methods present
    const methods = headerEndpoints.map(e => e.method).sort();
    assert.deepStrictEqual(methods, ['DELETE', 'GET', 'GET', 'POST', 'PUT']);
  });

  it('includes discarded fields in backend contract (all fields included)', () => {
    const bc = generateBackendContract(discardedFieldsSchema);
    const fieldNames = bc.entities.item.fields.map(f => f.name);
    assert.ok(fieldNames.includes('obsoleteFlag'), 'backend should include discarded fields');
    assert.ok(fieldNames.includes('legacyCode'), 'backend should include discarded fields');
    assert.ok(fieldNames.includes('internalId'), 'backend should include system fields');
    assert.equal(bc.entities.item.fields.length, 4);
  });

  it('defaults to empty rules and processes when not provided', () => {
    const bc = generateBackendContract(minimalSchema);
    assert.equal(bc.processEndpoints.length, 0);
    assert.ok(bc.endpoints.length > 0);
  });

  it('multiple entities produce endpoints for all entities', () => {
    const bc = generateBackendContract(multiEntitySchema);
    assert.equal(bc.endpoints.length, 10); // 5 per entity * 2 entities
  });

  it('process endpoint includes step count and preconditions', () => {
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const proc = bc.processEndpoints.find(p => p.name === 'completeOrder');
    assert.equal(proc.steps, 2);
    assert.equal(proc.preconditions.length, 1);
    assert.equal(proc.path, '/process/completeOrder');
  });
});

describe('generateTestManifest — edge cases', () => {
  it('empty schema produces minimal manifest with zero tests', () => {
    const fc = generateFrontendContract(emptySchema);
    const bc = generateBackendContract(emptySchema);
    const manifest = generateTestManifest(fc, bc);
    assert.equal(manifest.tests.length, 0);
    assert.equal(manifest.summary.total, 0);
    assert.equal(manifest.summary.byRunner.node, 0);
    assert.equal(manifest.summary.byRunner.junit, 0);
  });

  it('process without edge cases generates no process-edge tests', () => {
    const processNoEdge = [{
      name: 'simpleProcess',
      entity: 'order',
      preconditions: [{ field: 'status', operator: 'equals', value: 'DR' }],
      steps: [{ order: 1, operation: 'validate', target: 'header.status' }],
      transactional: true
      // edgeCases intentionally omitted
    }];
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema);
    const manifest = generateTestManifest(fc, bc, [], processNoEdge);
    const edgeTests = manifest.tests.filter(t => t.category === 'process-edge');
    assert.equal(edgeTests.length, 0, 'no edge case tests when edgeCases is absent');
    // Should still have happy, failure, rollback
    const happyTests = manifest.tests.filter(t => t.category === 'process-happy');
    const failureTests = manifest.tests.filter(t => t.category === 'process-failure');
    const rollbackTests = manifest.tests.filter(t => t.category === 'process-rollback');
    assert.equal(happyTests.length, 1);
    assert.equal(failureTests.length, 1);
    assert.equal(rollbackTests.length, 1);
  });

  it('non-transactional process omits rollback test', () => {
    const nonTxProcess = [{
      name: 'reportProcess',
      entity: 'order',
      preconditions: [],
      steps: [{ order: 1, operation: 'validate', target: 'header.status' }],
      transactional: false,
      edgeCases: [
        { name: 'e1', trigger: 't1', expected: 'ok' },
        { name: 'e2', trigger: 't2', expected: 'ok' },
        { name: 'e3', trigger: 't3', expected: 'ok' },
      ]
    }];
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema);
    const manifest = generateTestManifest(fc, bc, [], nonTxProcess);
    const rollbackTests = manifest.tests.filter(t => t.category === 'process-rollback');
    assert.equal(rollbackTests.length, 0, 'non-transactional process should not have rollback test');
  });

  it('rules with tier=human and decision=omit still appear in rule-declared tests (no filtering)', () => {
    const rulesWithOmit = [
      { name: 'keptRule', type: 'callout', tier: 'auto', autoDecision: 'keep' },
      { name: 'omittedRule', type: 'validation', tier: 'human', humanDecision: 'omit' },
    ];
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema);
    const manifest = generateTestManifest(fc, bc, rulesWithOmit, []);
    const ruleTests = manifest.tests.filter(t => t.category === 'rule-declared');
    // Current implementation does NOT filter omitted rules
    assert.equal(ruleTests.length, 2, 'all rules passed in generate rule-declared tests, including omitted');
    const omittedTest = ruleTests.find(t => t.rule === 'omittedRule');
    assert.ok(omittedTest, 'omitted rule is included in test manifest (potential bug: no filtering)');
  });

  it('summary.byRunner counts match actual tests by runner', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const actualNodeCount = manifest.tests.filter(t => t.runner === 'node').length;
    const actualJunitCount = manifest.tests.filter(t => t.runner === 'junit').length;
    assert.equal(manifest.summary.byRunner.node, actualNodeCount,
      'byRunner.node should match actual node test count');
    assert.equal(manifest.summary.byRunner.junit, actualJunitCount,
      'byRunner.junit should match actual junit test count');
    assert.equal(actualNodeCount + actualJunitCount, manifest.summary.total,
      'node + junit counts should equal total');
  });

  it('summary.byCategory counts match actual tests by category', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    for (const [category, count] of Object.entries(manifest.summary.byCategory)) {
      const actual = manifest.tests.filter(t => t.category === category).length;
      assert.equal(count, actual, `byCategory.${category} should match actual count`);
    }
  });

  it('all test IDs are unique', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema, sampleRules, sampleProcesses);
    const manifest = generateTestManifest(fc, bc, sampleRules, sampleProcesses);
    const ids = manifest.tests.map(t => t.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'all test IDs should be unique');
  });

  it('all-system-fields entity produces only system-field tests and a visibility test', () => {
    const fc = generateFrontendContract(allSystemFieldsSchema);
    const bc = generateBackendContract(allSystemFieldsSchema);
    const manifest = generateTestManifest(fc, bc);
    // No visible fields means 0 field-presence, 0 field-type, 0 searchable tests
    assert.equal(manifest.tests.filter(t => t.category === 'field-presence').length, 0);
    assert.equal(manifest.tests.filter(t => t.category === 'field-type').length, 0);
    assert.equal(manifest.tests.filter(t => t.category === 'searchable-filters').length, 0);
    // All 4 fields should be system-field tests
    assert.equal(manifest.tests.filter(t => t.category === 'system-field').length, 4);
    // One visibility test per entity
    assert.equal(manifest.tests.filter(t => t.category === 'visibility').length, 1);
  });
});

describe('generateContract — agentProfile.agentPrompt (ETP-4252)', () => {
  it('surfaces window.agentPrompt in agentProfile', () => {
    const schema = {
      ...minimalSchema,
      window: { ...minimalSchema.window, agentPrompt: 'Confirm before completing.' },
    };
    const contract = generateContract(schema);
    assert.equal(contract.agentProfile.agentPrompt, 'Confirm before completing.');
  });

  it('omits agentProfile.agentPrompt when the window declares none', () => {
    const contract = generateContract(minimalSchema);
    assert.equal(contract.agentProfile.agentPrompt, undefined);
  });

  it('omits agentProfile.agentPrompt when the value is whitespace-only', () => {
    const schema = {
      ...minimalSchema,
      window: { ...minimalSchema.window, agentPrompt: '   ' },
    };
    const contract = generateContract(schema);
    assert.equal(contract.agentProfile.agentPrompt, undefined);
  });

  it('trims surrounding whitespace from agentProfile.agentPrompt', () => {
    const schema = {
      ...minimalSchema,
      window: { ...minimalSchema.window, agentPrompt: '  Confirm first.  ' },
    };
    const contract = generateContract(schema);
    assert.equal(contract.agentProfile.agentPrompt, 'Confirm first.');
  });
});

describe('generateContract — orchestrator', () => {
  it('returns version from schema', () => {
    const contract = generateContract(minimalSchema, sampleRules, sampleProcesses);
    assert.equal(contract.version, '0.1.0');
  });

  it('defaults version to 0.1.0 when schema has no version', () => {
    const noVersionSchema = { ...minimalSchema, version: undefined };
    const contract = generateContract(noVersionSchema);
    assert.equal(contract.version, '0.1.0');
  });

  it('includes generatedAt as ISO timestamp', () => {
    const contract = generateContract(minimalSchema);
    assert.ok(contract.generatedAt, 'generatedAt should be present');
    // Verify it parses as a valid date
    const parsed = new Date(contract.generatedAt);
    assert.ok(!isNaN(parsed.getTime()), 'generatedAt should be a valid ISO date');
  });

  it('includes checksum as 16-char hex string', () => {
    const contract = generateContract(minimalSchema);
    assert.ok(contract.checksum, 'checksum should be present');
    assert.equal(contract.checksum.length, 16, 'checksum should be 16 chars');
    assert.ok(/^[0-9a-f]{16}$/.test(contract.checksum), 'checksum should be hex');
  });

  it('checksum changes when schema content changes', () => {
    const contract1 = generateContract(minimalSchema);
    const contract2 = generateContract(multiEntitySchema);
    assert.notEqual(contract1.checksum, contract2.checksum,
      'different schemas should produce different checksums');
  });

  it('includes frontendContract, backendContract, and testManifest', () => {
    const contract = generateContract(minimalSchema, sampleRules, sampleProcesses);
    assert.ok(contract.frontendContract, 'should include frontendContract');
    assert.ok(contract.backendContract, 'should include backendContract');
    assert.ok(contract.testManifest, 'should include testManifest');
    assert.ok(contract.testManifest.tests.length > 0, 'testManifest should have tests');
    assert.ok(contract.testManifest.summary, 'testManifest should have summary');
  });

  it('empty schema produces valid contract structure', () => {
    const contract = generateContract(emptySchema);
    assert.equal(contract.version, '0.1.0');
    assert.ok(contract.generatedAt);
    assert.ok(contract.checksum);
    assert.deepStrictEqual(contract.frontendContract.entities, {});
    assert.deepStrictEqual(contract.backendContract.entities, {});
    assert.equal(contract.testManifest.tests.length, 0);
  });

  it('includes apiPrediction in output', () => {
    const contract = generateContract(minimalSchema, sampleRules, sampleProcesses);
    assert.ok(contract.apiPrediction, 'should include apiPrediction');
    assert.ok(contract.apiPrediction.specName);
    assert.ok(contract.apiPrediction.baseUrl);
    assert.ok(contract.apiPrediction.crud);
    assert.ok(contract.apiPrediction.queryParams);
  });

  it('splits MCP metadata out of the compact contract artifact', () => {
    const contract = generateContract(buttonSchema);
    const { contract: compactContract, mcpContract } = splitWindowContractArtifacts(contract);

    assert.ok(compactContract.apiPrediction, 'compact contract keeps frontend API metadata');
    assert.equal(compactContract.formState, undefined);
    assert.equal(compactContract.agentProfile, undefined);
    assert.ok(mcpContract.apiPrediction, 'MCP contract keeps full API metadata');
    assert.ok(mcpContract.formState, 'MCP contract keeps form state');
    assert.ok(mcpContract.agentProfile, 'MCP contract keeps agent profile');
    assert.equal(mcpContract.contractChecksum, compactContract.checksum);

    const compactAction = compactContract.apiPrediction.actions[0];
    const mcpAction = mcpContract.apiPrediction.actions[0];
    assert.equal(compactAction.name, undefined);
    assert.equal(compactAction.field, mcpAction.name);
    assert.equal(compactAction.requiresRecord, undefined);
    assert.equal(compactAction.method, undefined);
    assert.equal(mcpAction.requiresRecord, true);
    assert.equal(mcpAction.method, 'POST');
    assert.equal(compactAction.edgeCases, undefined);
    assert.ok(Array.isArray(mcpAction.edgeCases));
    assert.equal(compactAction.actionType, undefined);
    assert.ok(mcpAction.actionType);
  });

  it('preserves split artifact timestamps when checksums are unchanged', () => {
    const contract = generateContract(buttonSchema);
    const firstSplit = splitWindowContractArtifacts(contract);
    const regenerated = {
      ...contract,
      updatedAt: '2099-01-01T00:00:00.000Z',
    };
    const secondSplit = splitWindowContractArtifacts(
      regenerated,
      firstSplit.contract,
      firstSplit.mcpContract,
    );

    assert.equal(secondSplit.contract.updatedAt, firstSplit.contract.updatedAt);
    assert.equal(secondSplit.mcpContract.updatedAt, firstSplit.mcpContract.updatedAt);
  });
});

// ─── Schema with FK fields for apiPrediction tests ────────────────────────────

const fkSchema = {
  version: '0.1.0',
  window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
  entities: [
    {
      name: 'order',
      table: 'C_Order',
      level: 'header',
      fields: [
        { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey',
          reference: 'BusinessPartner', inputMode: 'search',
          visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'warehouse', column: 'M_Warehouse_ID', type: 'foreignKey',
          reference: 'Warehouse', inputMode: 'selector',
          visibility: 'editable', required: true, searchable: false, grid: false, form: true },
        { name: 'currency', column: 'C_Currency_ID', type: 'foreignKey',
          reference: 'Currency',
          visibility: 'readOnly', required: true, searchable: false, grid: true, form: true },
        { name: 'documentNo', column: 'DocumentNo', type: 'string',
          visibility: 'readOnly', required: true, searchable: true, grid: true, form: true },
        { name: 'orderDate', column: 'DateOrdered', type: 'date',
          visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'transactionDoc', column: 'C_DocTypeTarget_ID', type: 'foreignKey',
          visibility: 'system', required: true, searchable: false, grid: false, form: false,
          derivation: { type: 'fromConfig', source: 'doctype.salesOrder' } },
      ]
    },
    {
      name: 'orderLine',
      table: 'C_OrderLine',
      level: 'line',
      fields: [
        { name: 'product', column: 'M_Product_ID', type: 'foreignKey',
          reference: 'Product', inputMode: 'search',
          visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'qty', column: 'QtyOrdered', type: 'number',
          visibility: 'editable', required: true, searchable: false, grid: true, form: true },
        { name: 'salesOrder', column: 'C_Order_ID', type: 'foreignKey',
          visibility: 'system', required: true, searchable: false, grid: false, form: false,
          derivation: { type: 'fromParent', source: 'order.id' } },
      ]
    }
  ]
};

const buttonSchema = {
  version: '0.1.0',
  window: { id: '500', name: 'Purchase Invoice', primaryEntity: 'invoice', category: 'purchasing' },
  entities: [{
    name: 'invoice',
    table: 'C_Invoice',
    level: 'header',
    fields: [
      { name: 'documentNo', column: 'DocumentNo', type: 'string',
        visibility: 'readOnly', required: true, searchable: true, grid: true, form: true },
      { name: 'docAction', column: 'DocAction', type: 'button',
        visibility: 'editable', required: false, searchable: false, grid: false, form: true },
    ]
  }]
};

describe('generateApiPrediction', () => {
  it('specName is correct kebab-case from window name', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.equal(prediction.specName, 'sales-order');
  });

  it('baseUrl follows NEO Headless pattern', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.equal(prediction.baseUrl, '/sws/neo/sales-order');
  });

  it('CRUD entries exist for each entity', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.ok(prediction.crud.order, 'order entity should have CRUD');
    assert.ok(prediction.crud.orderLine, 'orderLine entity should have CRUD');
    assert.equal(prediction.crud.order.get, true);
    assert.equal(prediction.crud.order.getById, true);
    assert.equal(prediction.crud.order.post, true);
    assert.equal(prediction.crud.order.put, true);
    assert.equal(prediction.crud.order.patch, true);
    assert.equal(prediction.crud.order.delete, true);
  });

  it('surfaces handlesDefaults:false on crud when an entity opts out', () => {
    const optOutSchema = {
      version: '0.1.0',
      window: { id: '900', name: 'GL Journal', primaryEntity: 'journal', category: 'finance' },
      entities: [
        { name: 'journal', table: 'GL_Journal', level: 'header', fields: [
          { name: 'description', column: 'Description', type: 'string', visibility: 'editable', required: false, grid: false, form: true },
        ] },
        { name: 'journalLine', table: 'GL_JournalLine', level: 'line', handlesDefaults: false, fields: [
          { name: 'account', column: 'Account_ID', type: 'foreignKey', reference: 'Account', inputMode: 'selector', visibility: 'editable', required: true, grid: true, form: true },
        ] },
      ],
    };
    const fc = generateFrontendContract(optOutSchema);
    const bc = generateBackendContract(optOutSchema);
    const prediction = generateApiPrediction(optOutSchema, fc, bc);
    assert.equal(prediction.crud.journalLine.handlesDefaults, false);
    // The opted-in entity does not carry the flag.
    assert.equal(prediction.crud.journal.handlesDefaults, undefined);
  });

  it('CRUD URLs follow correct pattern', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.equal(prediction.crud.order.listUrl, '/sws/neo/sales-order/order');
    assert.equal(prediction.crud.order.detailUrl, '/sws/neo/sales-order/order/{id}');
    assert.equal(prediction.crud.orderLine.listUrl, '/sws/neo/sales-order/orderLine');
    assert.equal(prediction.crud.orderLine.detailUrl, '/sws/neo/sales-order/orderLine/{id}');
  });

  it('supportedFilters match searchableFields from frontendContract', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.deepStrictEqual(prediction.crud.order.supportedFilters,
      fc.entities.order.searchableFields);
    assert.deepStrictEqual(prediction.crud.orderLine.supportedFilters,
      fc.entities.orderLine.searchableFields);
  });

  it('selector entries match visible FK fields from frontendContract', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);

    // order has 3 visible FK fields: businessPartner, warehouse, currency
    // transactionDoc is system so excluded
    const orderSelectors = prediction.selectors.filter(s => s.entity === 'order');
    assert.equal(orderSelectors.length, 3);

    const bpSelector = orderSelectors.find(s => s.field === 'businessPartner');
    assert.ok(bpSelector);
    assert.equal(bpSelector.column, 'C_BPartner_ID');
    assert.equal(bpSelector.reference, 'BusinessPartner');
    assert.equal(bpSelector.url, '/sws/neo/sales-order/order/selectors/businessPartner');

    // orderLine has 1 visible FK: product (salesOrder is system)
    const lineSelectors = prediction.selectors.filter(s => s.entity === 'orderLine');
    assert.equal(lineSelectors.length, 1);
    assert.equal(lineSelectors[0].field, 'product');
  });

  it('selector URLs follow correct pattern', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    for (const sel of prediction.selectors) {
      const expected = `/sws/neo/sales-order/${sel.entity}/selectors/${sel.field}`;
      assert.equal(sel.url, expected,
        `selector URL for ${sel.entity}.${sel.field} should match pattern`);
    }
  });

  it('actions include button-type fields', () => {
    const fc = generateFrontendContract(buttonSchema);
    const bc = generateBackendContract(buttonSchema);
    const prediction = generateApiPrediction(buttonSchema, fc, bc);
    assert.equal(prediction.actions.length, 1);
    const action = prediction.actions[0];
    assert.equal(action.name, 'docAction');
    assert.equal(action.column, 'DocAction');
    assert.equal(action.url,
      '/sws/neo/purchase-invoice/invoice/{id}/action/docAction');
    assert.equal(action.actionType, 'documentAction');
    assert.equal(action.entity, 'invoice');
    assert.ok(action.requiresRecord);
    assert.ok(Array.isArray(action.parameters));
    assert.ok(Array.isArray(action.preconditions));
    assert.ok(Array.isArray(action.effects));
    assert.ok(Array.isArray(action.edgeCases));
    assert.equal(action.edgeCases.length >= 3, true);
    assert.equal(action.dryRunSupported, true);
    assert.equal(action.label, undefined);
    assert.equal(action.endpoint, undefined);
  });

  it('actions is empty array when no button fields exist', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.equal(prediction.actions.length, 0);
  });

  it('queryParams structure exists with required keys', () => {
    const fc = generateFrontendContract(fkSchema);
    const bc = generateBackendContract(fkSchema);
    const prediction = generateApiPrediction(fkSchema, fc, bc);
    assert.ok(prediction.queryParams.pagination);
    assert.equal(prediction.queryParams.pagination.startRow, '_startRow');
    assert.equal(prediction.queryParams.pagination.endRow, '_endRow');
    assert.ok(prediction.queryParams.sorting);
    assert.equal(prediction.queryParams.sorting.param, '_sortBy');
    assert.ok(prediction.queryParams.filtering);
    assert.ok(prediction.queryParams.parentFilter);
  });

  it('empty schema produces empty CRUD, selectors, and actions', () => {
    const fc = generateFrontendContract(emptySchema);
    const bc = generateBackendContract(emptySchema);
    const prediction = generateApiPrediction(emptySchema, fc, bc);
    assert.equal(prediction.specName, 'empty-window');
    assert.deepStrictEqual(prediction.crud, {});
    assert.deepStrictEqual(prediction.selectors, []);
    assert.deepStrictEqual(prediction.actions, []);
  });

  it('specName handles multi-word names correctly', () => {
    const schema = {
      ...fkSchema,
      window: { ...fkSchema.window, name: 'Business Partner Category' }
    };
    const fc = generateFrontendContract(schema);
    const bc = generateBackendContract(schema);
    const prediction = generateApiPrediction(schema, fc, bc);
    assert.equal(prediction.specName, 'business-partner-category');
  });
});

// ─── v2 Test Manifest Entries ─────────────────────────────────────────────────

describe('generateTestManifest — v2 entries (displayLogic, readOnlyLogic, defaultValue)', () => {
  it('emits displaylogic-valid tests for fields with displayLogic', () => {
    const fc = generateFrontendContract(behavioralSchema, behavioralRules);
    const bc = generateBackendContract(behavioralSchema);
    const manifest = generateTestManifest(fc, bc);
    const dlTests = manifest.tests.filter(t => t.category === 'displaylogic-valid');
    assert.equal(dlTests.length, 1);
    assert.equal(dlTests[0].field, 'warehouse');
    assert.equal(dlTests[0].runner, 'node');
  });

  it('emits readonlylogic-valid tests for fields with readOnlyLogic', () => {
    const fc = generateFrontendContract(behavioralSchema, behavioralRules);
    const bc = generateBackendContract(behavioralSchema);
    const manifest = generateTestManifest(fc, bc);
    const roTests = manifest.tests.filter(t => t.category === 'readonlylogic-valid');
    assert.equal(roTests.length, 1);
    assert.equal(roTests[0].field, 'priceList');
    assert.equal(roTests[0].runner, 'node');
  });

  it('emits default-value-type tests for fields with defaultValue', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const bc = generateBackendContract(uiHintsSchema);
    const manifest = generateTestManifest(fc, bc);
    const dvTests = manifest.tests.filter(t => t.category === 'default-value-type');
    assert.equal(dvTests.length, 1);
    assert.equal(dvTests[0].field, 'grandTotal');
    assert.equal(dvTests[0].runner, 'node');
  });

  it('does not emit displaylogic-valid tests when no fields have displayLogic', () => {
    const fc = generateFrontendContract(minimalSchema);
    const bc = generateBackendContract(minimalSchema);
    const manifest = generateTestManifest(fc, bc);
    const dlTests = manifest.tests.filter(t => t.category === 'displaylogic-valid');
    assert.equal(dlTests.length, 0);
  });
});

describe('generateContract — v2 apiPrediction tests in testManifest', () => {
  it('emits crud-flags tests for each entity', () => {
    const contract = generateContract(fkSchema);
    const crudTests = contract.testManifest.tests.filter(t => t.category === 'crud-flags');
    assert.equal(crudTests.length, 2); // order + orderLine
    const entities = crudTests.map(t => t.entity);
    assert.ok(entities.includes('order'));
    assert.ok(entities.includes('orderLine'));
  });

  it('emits selector-endpoint tests for FK fields', () => {
    const contract = generateContract(fkSchema);
    const selTests = contract.testManifest.tests.filter(t => t.category === 'selector-endpoint');
    // order has 3 visible FK fields, orderLine has 1 visible FK field
    assert.equal(selTests.length, 4);
    const bpTest = selTests.find(t => t.field === 'businessPartner');
    assert.ok(bpTest);
    assert.equal(bpTest.entity, 'order');
  });

  it('emits action-endpoint tests for button fields', () => {
    const contract = generateContract(buttonSchema);
    const actionTests = contract.testManifest.tests.filter(t => t.category === 'action-endpoint');
    assert.equal(actionTests.length, 1);
    assert.equal(actionTests[0].field, 'docAction');
    assert.equal(actionTests[0].entity, 'invoice');
  });

  it('summary counts include v2 test categories', () => {
    const contract = generateContract(fkSchema);
    assert.ok(contract.testManifest.summary.byCategory['crud-flags'] >= 1);
    assert.ok(contract.testManifest.summary.byCategory['selector-endpoint'] >= 1);
    assert.equal(contract.testManifest.summary.total, contract.testManifest.tests.length);
  });

  it('all test IDs remain unique after v2 additions', () => {
    const contract = generateContract(fkSchema);
    const ids = contract.testManifest.tests.map(t => t.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'all test IDs should be unique');
  });
});

// ─── UI Hints in Frontend Contract ────────────────────────────────────────────

const uiHintsSchema = {
  version: '0.1.0',
  window: { id: '600', name: 'UI Hints Test', primaryEntity: 'order', category: 'test' },
  entities: [{
    name: 'order',
    table: 'C_Order',
    level: 'header',
    fields: [
      { name: 'grandTotal', column: 'GrandTotal', type: 'amount', visibility: 'editable',
        required: true, searchable: false, grid: true, form: true,
        defaultValue: '0', isIdentifier: true, help: 'Total amount including tax',
        fieldGroup: 'Amounts', isSelectionColumn: true, isFilterable: true,
        precision: 2, isTranslated: true },
      { name: 'plainField', column: 'PlainCol', type: 'string', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true },
      { name: 'configuredWarehouse', column: 'M_Warehouse_ID', type: 'foreignKey', visibility: 'editable',
        required: false, searchable: false, grid: false, form: true, sourceRequired: true,
        derivation: { type: 'fromConfig', source: 'context.defaultWarehouse' } },
    ]
  }]
};

describe('generateFrontendContract — UI hints', () => {
  it('field with defaultValue appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const gt = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(gt.defaultValue, '0');
  });

  it('field with help text appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const gt = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(gt.help, 'Total amount including tax');
  });

  it('field with fieldGroup appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const gt = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(gt.fieldGroup, 'Amounts');
  });

  it('field with precision appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const gt = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(gt.precision, 2);
  });

  it('field with isIdentifier appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const gt = fc.entities.order.fields.find(f => f.name === 'grandTotal');
    assert.equal(gt.isIdentifier, true);
  });

  it('field with sourceRequired appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const configured = fc.entities.order.fields.find(f => f.name === 'configuredWarehouse');
    assert.equal(configured.sourceRequired, true);
  });

  it('field with derivation appears in contract', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const configured = fc.entities.order.fields.find(f => f.name === 'configuredWarehouse');
    assert.deepEqual(configured.derivation, { type: 'fromConfig', source: 'context.defaultWarehouse' });
  });

  it('field without hints has no hint keys present', () => {
    const fc = generateFrontendContract(uiHintsSchema);
    const plain = fc.entities.order.fields.find(f => f.name === 'plainField');
    assert.equal(plain.defaultValue, undefined);
    assert.equal(plain.isIdentifier, undefined);
    assert.equal(plain.help, undefined);
    assert.equal(plain.fieldGroup, undefined);
    assert.equal(plain.isSelectionColumn, undefined);
    assert.equal(plain.isFilterable, undefined);
    assert.equal(plain.precision, undefined);
    assert.equal(plain.isTranslated, undefined);
  });

  it('maps the full set of grid/display UI hints onto the contract field', () => {
    // Covers applyFieldUIHints + applyBasicFieldUIHints branches that the other
    // tests do not assert (gridOrder, cellType, summable, seq, statusBar, badge,
    // badge*, enumVariants, labels, display, grow, noTrailing, filterOnly,
    // filterable:false, dot:false, min). Note the exact mapping rules:
    //   summable/grow/statusBar/badge/noTrailing/filterOnly -> boolean true
    //   filterable === false -> filterable: false ; dot === false -> dot: false
    //   gridOrder/seq use != null ; min uses !== undefined
    const richHintsSchema = {
      version: '0.1.0',
      window: { id: '610', name: 'Rich Hints', primaryEntity: 'order', category: 'test' },
      entities: [{
        name: 'order',
        table: 'C_Order',
        level: 'header',
        fields: [
          { name: 'amount', column: 'Amount', type: 'amount', visibility: 'editable',
            required: false, searchable: false, grid: true, form: true,
            gridOrder: 0, seq: 0, min: 0,
            cellType: 'currency', summable: true, precision: 4,
            statusBar: true, badge: true,
            badgeLabels: { CO: 'Completed' }, badgeColors: { CO: 'green' },
            badgeVariants: { CO: 'solid' }, enumVariants: { A: 'primary' },
            labels: { en: 'Amount' }, display: 'inline', grow: true,
            noTrailing: true, filterOnly: true, filterable: false, dot: false },
        ],
      }],
    };
    const fc = generateFrontendContract(richHintsSchema);
    const amount = fc.entities.order.fields.find(f => f.name === 'amount');
    // != null / !== undefined branches with falsy-but-present values
    assert.equal(amount.gridOrder, 0);
    assert.equal(amount.seq, 0);
    assert.equal(amount.min, 0);
    // straight passthroughs
    assert.equal(amount.cellType, 'currency');
    assert.equal(amount.precision, 4);
    assert.equal(amount.display, 'inline');
    assert.deepStrictEqual(amount.badgeLabels, { CO: 'Completed' });
    assert.deepStrictEqual(amount.badgeColors, { CO: 'green' });
    assert.deepStrictEqual(amount.badgeVariants, { CO: 'solid' });
    assert.deepStrictEqual(amount.enumVariants, { A: 'primary' });
    assert.deepStrictEqual(amount.labels, { en: 'Amount' });
    // truthy hints normalized to boolean true
    assert.equal(amount.summable, true);
    assert.equal(amount.statusBar, true);
    assert.equal(amount.badge, true);
    assert.equal(amount.grow, true);
    assert.equal(amount.noTrailing, true);
    assert.equal(amount.filterOnly, true);
    // explicit-false branches
    assert.equal(amount.filterable, false);
    assert.equal(amount.dot, false);
  });
});

// ─── F3 refactor — drawer + display passthroughs ─────────────────────────────
const drawerSchema = {
  version: '0.1.0',
  window: { id: '700', name: 'Internal Consumption', primaryEntity: 'internalConsumption', category: 'inventory' },
  entities: [{
    name: 'internalConsumptionLine',
    table: 'M_InternalConsumptionLine',
    level: 'line',
    fields: [
      { name: 'product', column: 'M_Product_ID', type: 'foreignKey', visibility: 'editable',
        required: true, searchable: true, grid: true, form: true,
        reference: 'Product', inputMode: 'search',
        lookupDrawer: 'internal-consumption-product',
        lookupTitle: 'Product + Warehouse',
        onSelectMappings: [
          { from: 'M_Locator_ID', to: 'storageBin' },
          { from: 'M_Product_ID', to: 'product' },
        ] },
      { name: 'displayedProduct', column: 'EM_DisplayedProduct', type: 'string', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true,
        displayFromCatalog: true },
      { name: 'plain', column: 'PlainCol', type: 'string', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true },
    ],
  }],
};

describe('generateFrontendContract — F3 drawer + display passthroughs', () => {
  it('preserves lookupDrawer on contract field', () => {
    const fc = generateFrontendContract(drawerSchema);
    const product = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'product');
    assert.equal(product.lookupDrawer, 'internal-consumption-product');
  });

  it('preserves lookupTitle on contract field', () => {
    const fc = generateFrontendContract(drawerSchema);
    const product = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'product');
    assert.equal(product.lookupTitle, 'Product + Warehouse');
  });

  it('preserves onSelectMappings array on contract field', () => {
    const fc = generateFrontendContract(drawerSchema);
    const product = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'product');
    assert.deepStrictEqual(product.onSelectMappings, [
      { from: 'M_Locator_ID', to: 'storageBin' },
      { from: 'M_Product_ID', to: 'product' },
    ]);
  });

  it('preserves displayFromCatalog on contract field', () => {
    const fc = generateFrontendContract(drawerSchema);
    const dp = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'displayedProduct');
    assert.equal(dp.displayFromCatalog, true);
  });

  it('omits all four properties when not declared on field', () => {
    const fc = generateFrontendContract(drawerSchema);
    const plain = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'plain');
    assert.equal(plain.lookupDrawer, undefined);
    assert.equal(plain.lookupTitle, undefined);
    assert.equal(plain.onSelectMappings, undefined);
    assert.equal(plain.displayFromCatalog, undefined);
  });

  it('omits onSelectMappings when array is empty', () => {
    const emptySchema = {
      ...drawerSchema,
      entities: drawerSchema.entities.map(e => ({
        ...e,
        fields: e.fields.map(f => f.name === 'product' ? { ...f, onSelectMappings: [] } : f),
      })),
    };
    const fc = generateFrontendContract(emptySchema);
    const product = fc.entities.internalConsumptionLine.fields.find(f => f.name === 'product');
    assert.equal(product.onSelectMappings, undefined);
  });
});

// ─── Selector Context Metadata (ETP-3955) ─────────────────────────────────────

const contextualFkSchema = {
  version: '0.1.0',
  window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
  entities: [
    {
      name: 'order',
      table: 'C_Order',
      level: 'header',
      fields: [
        { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey',
          reference: 'BusinessPartner', inputMode: 'search',
          visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'orderDate', column: 'DateOrdered', type: 'date',
          visibility: 'editable', required: true, searchable: false, grid: true, form: true },
        { name: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'foreignKey',
          reference: 'BusinessPartnerLocation', inputMode: 'dependent',
          dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' },
          validationRule: { cascadeParams: ['C_BPartner_ID'] },
          visibility: 'editable', required: true, searchable: false, grid: false, form: true },
        { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey',
          reference: 'PriceList', inputMode: 'selector',
          validationRule: { cascadeParams: ['isSOTrx'] },
          visibility: 'editable', required: true, searchable: false, grid: false, form: true },
      ]
    },
    {
      name: 'orderLine',
      table: 'C_OrderLine',
      level: 'line',
      fields: [
        { name: 'product', column: 'M_Product_ID', type: 'foreignKey',
          reference: 'Product', inputMode: 'search',
          visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'tax', column: 'C_Tax_ID', type: 'foreignKey',
          reference: 'Tax', inputMode: 'selector',
          validationRule: { cascadeParams: ['DateInvoiced', 'DateOrdered', 'IsSOTrx', 'AD_CLIENT_ID', 'AD_ORG_ID'] },
          visibility: 'editable', required: true, searchable: false, grid: true, form: true },
      ]
    }
  ]
};

describe('generateApiPrediction — selector context metadata (ETP-3955)', () => {
  it('partnerAddress selector includes context with required C_BPartner_ID from dependsOn', () => {
    const fc = generateFrontendContract(contextualFkSchema);
    const bc = generateBackendContract(contextualFkSchema);
    const prediction = generateApiPrediction(contextualFkSchema, fc, bc);
    const addrSelector = prediction.selectors.find(s => s.field === 'partnerAddress');
    assert.ok(addrSelector, 'partnerAddress selector should exist');
    assert.ok(addrSelector.context, 'partnerAddress should have context metadata');
    assert.ok(addrSelector.context.required, 'context should have required entries');
    const bpReq = addrSelector.context.required.find(r => r.param === 'C_BPartner_ID');
    assert.ok(bpReq, 'should require C_BPartner_ID');
    assert.equal(bpReq.source, 'field');
    assert.equal(bpReq.field, 'businessPartner');
  });

  it('priceList selector includes context with required isSOTrx from window category', () => {
    const fc = generateFrontendContract(contextualFkSchema);
    const bc = generateBackendContract(contextualFkSchema);
    const prediction = generateApiPrediction(contextualFkSchema, fc, bc);
    const plSelector = prediction.selectors.find(s => s.field === 'priceList');
    assert.ok(plSelector, 'priceList selector should exist');
    assert.ok(plSelector.context, 'priceList should have context metadata');
    const isSOTrxReq = plSelector.context.required.find(r => r.param === 'isSOTrx');
    assert.ok(isSOTrxReq, 'should require isSOTrx context');
    assert.equal(isSOTrxReq.source, 'windowCategory');
  });

  it('tax selector includes context derived from cascade params and contract fields', () => {
    const fc = generateFrontendContract(contextualFkSchema);
    const bc = generateBackendContract(contextualFkSchema);
    const prediction = generateApiPrediction(contextualFkSchema, fc, bc);
    const taxSelector = prediction.selectors.find(s => s.field === 'tax' && s.entity === 'orderLine');
    assert.ok(taxSelector, 'tax selector should exist');
    assert.ok(taxSelector.context, 'tax should have context metadata');
    const isSOTrxReq = taxSelector.context.required.find(r => r.param === 'IsSOTrx');
    assert.ok(isSOTrxReq, 'should require IsSOTrx');
    assert.equal(isSOTrxReq.source, 'windowCategory');
    const dateReq = taxSelector.context.required.find(r => r.param === 'DateInvoiced');
    assert.ok(dateReq, 'should require the validation rule canonical date param');
    assert.equal(dateReq.source, 'parentField');
    assert.equal(dateReq.field, 'orderDate');
    assert.equal(dateReq.format, 'DD-MM-YYYY');
  });

  it('purchase-order priceList selector has isSOTrx=N context', () => {
    const purchaseSchema = {
      ...contextualFkSchema,
      window: { ...contextualFkSchema.window, category: 'purchases' },
    };
    const fc = generateFrontendContract(purchaseSchema);
    const bc = generateBackendContract(purchaseSchema);
    const prediction = generateApiPrediction(purchaseSchema, fc, bc);
    const plSelector = prediction.selectors.find(s => s.field === 'priceList');
    assert.ok(plSelector.context, 'priceList should have context');
    const isSOTrxReq = plSelector.context.required.find(r => r.param === 'isSOTrx');
    assert.ok(isSOTrxReq);
  });

  it('selector without validationRule context params has no context metadata', () => {
    const simpleFkSchema = {
      version: '0.1.0',
      window: { id: '700', name: 'Simple FK', primaryEntity: 'item', category: 'test' },
      entities: [{
        name: 'item',
        table: 'M_Item',
        level: 'header',
        fields: [
          { name: 'category', column: 'M_Category_ID', type: 'foreignKey',
            reference: 'Category', inputMode: 'selector',
            visibility: 'editable', required: false, searchable: false, grid: false, form: true },
        ]
      }]
    };
    const fc = generateFrontendContract(simpleFkSchema);
    const bc = generateBackendContract(simpleFkSchema);
    const prediction = generateApiPrediction(simpleFkSchema, fc, bc);
    const catSelector = prediction.selectors.find(s => s.field === 'category');
    // No dependsOn, no validationRule cascade params, not a priceList -> no context
    assert.equal(catSelector.context, undefined, 'simple FK without context should have no context metadata');
  });

  it('non-sales/purchases category puts the isSOTrx trx param into optional, not required', () => {
    // assignTrxParamByCategory else branch: when windowCategory is neither
    // 'sales' nor 'purchases', the isSOTrx param must land in context.optional.
    const neutralSchema = {
      version: '0.1.0',
      window: { id: '910', name: 'Neutral Category', primaryEntity: 'doc', category: 'inventory' },
      entities: [{
        name: 'doc',
        table: 'C_Doc',
        level: 'header',
        fields: [
          { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey',
            reference: 'PriceList', inputMode: 'selector',
            validationRule: { cascadeParams: ['isSOTrx'] },
            visibility: 'editable', required: true, searchable: false, grid: false, form: true },
        ],
      }],
    };
    const fc = generateFrontendContract(neutralSchema);
    const bc = generateBackendContract(neutralSchema);
    const prediction = generateApiPrediction(neutralSchema, fc, bc);
    const plSelector = prediction.selectors.find(s => s.field === 'priceList');
    assert.ok(plSelector.context, 'priceList should have context metadata');
    assert.ok(plSelector.context.optional, 'context should expose optional entries');
    const optTrx = plSelector.context.optional.find(r => r.param === 'isSOTrx');
    assert.ok(optTrx, 'isSOTrx should be in optional for a neutral category');
    assert.equal(optTrx.source, 'windowCategory');
    // and it must NOT be required for a neutral category
    const reqTrx = (plSelector.context.required ?? []).find(r => r.param === 'isSOTrx');
    assert.equal(reqTrx, undefined, 'isSOTrx must not be required for a neutral category');
  });

  it('canonical date param (dateParams[0]) is added to required exactly once', () => {
    // addCanonicalDateParam: with cascadeParams containing several date params,
    // only the first one (DateInvoiced) becomes the canonical required entry.
    const dateCascadeSchema = {
      version: '0.1.0',
      window: { id: '920', name: 'Date Cascade', primaryEntity: 'header', category: 'test' },
      entities: [
        {
          name: 'header',
          table: 'C_Header',
          level: 'header',
          fields: [
            { name: 'invoiceDate', column: 'DateInvoiced', type: 'date',
              visibility: 'editable', required: true, searchable: false, grid: true, form: true },
            { name: 'orderDate', column: 'DateOrdered', type: 'date',
              visibility: 'editable', required: true, searchable: false, grid: true, form: true },
          ],
        },
        {
          name: 'line',
          table: 'C_Line',
          level: 'line',
          fields: [
            { name: 'tax', column: 'C_Tax_ID', type: 'foreignKey',
              reference: 'Tax', inputMode: 'selector',
              validationRule: { cascadeParams: ['DateInvoiced', 'DateOrdered'] },
              visibility: 'editable', required: true, searchable: false, grid: true, form: true },
          ],
        },
      ],
    };
    const fc = generateFrontendContract(dateCascadeSchema);
    const bc = generateBackendContract(dateCascadeSchema);
    const prediction = generateApiPrediction(dateCascadeSchema, fc, bc);
    const taxSelector = prediction.selectors.find(s => s.field === 'tax' && s.entity === 'line');
    assert.ok(taxSelector.context, 'tax should have context metadata');
    const canonical = taxSelector.context.required.filter(r => r.param === 'DateInvoiced');
    assert.equal(canonical.length, 1, 'canonical date param must appear exactly once');
    assert.equal(canonical[0].format, 'DD-MM-YYYY', 'canonical date entry should carry date format');
    // the non-canonical date param must not be added as its own required entry
    const nonCanonical = taxSelector.context.required.filter(r => r.param === 'DateOrdered');
    assert.equal(nonCanonical.length, 0, 'only the first date param is canonical');
  });
});

// ─── Action Classification Metadata (ETP-3956) ────────────────────────────────

describe('generateApiPrediction — action classification (ETP-3956)', () => {
  const actionSchema = {
    version: '0.1.0',
    window: { id: '800', name: 'Action Test', primaryEntity: 'header', category: 'sales' },
    entities: [{
      name: 'header',
      table: 'C_Test',
      level: 'header',
      fields: [
        { name: 'documentAction', column: 'DocAction', type: 'button',
          processId: '104', processType: 'classic', label: 'Document Action' },
        { name: 'completeDocument', column: 'Complete', type: 'button',
          processId: 'ABC123', processType: 'obuiapp' },
        { name: 'aPRMAddPayment', column: 'EM_APRM_Add', type: 'button',
          processId: 'PAY001', processType: 'obuiapp' },
        { name: 'createLinesFrom', column: 'CreateLines', type: 'button',
          processId: 'CL001', processType: 'classic' },
        { name: 'recalculate', column: 'Recalculate', type: 'button' },
      ],
    }],
  };

  it('documentAction is classified as documentAction type', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const docAction = prediction.actions.find(a => a.name === 'documentAction');
    assert.ok(docAction);
    assert.equal(docAction.actionType, 'documentAction');
    assert.equal(docAction.dryRunSupported, true);
  });

  it('complete pattern is classified as documentAction', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const complete = prediction.actions.find(a => a.name === 'completeDocument');
    assert.ok(complete);
    assert.equal(complete.actionType, 'documentAction');
  });

  it('APRM pattern is classified as paymentAction', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const payment = prediction.actions.find(a => a.name === 'aPRMAddPayment');
    assert.ok(payment);
    assert.equal(payment.actionType, 'paymentAction');
  });

  it('create pattern is classified as createFrom', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const create = prediction.actions.find(a => a.name === 'createLinesFrom');
    assert.ok(create);
    assert.equal(create.actionType, 'createFrom');
    assert.equal(create.requiresRecord, true);
  });

  it('unknown button is classified as utilityAction', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const util = prediction.actions.find(a => a.name === 'recalculate');
    assert.ok(util);
    assert.equal(util.actionType, 'utilityAction');
  });

  it('every action has at least 3 edge cases', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    for (const action of prediction.actions) {
      assert.ok(Array.isArray(action.edgeCases), `${action.name} should have edgeCases array`);
      assert.ok(action.edgeCases.length >= 3, `${action.name} should have >= 3 edge cases, got ${action.edgeCases.length}`);
    }
  });

  it('documentAction has docAction parameter', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const docAction = prediction.actions.find(a => a.name === 'documentAction');
    assert.ok(docAction.parameters.length > 0);
    assert.equal(docAction.parameters[0].name, 'docAction');
    assert.equal(docAction.parameters[0].required, true);
  });

  it('actions expose explicit POST endpoint metadata', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const docAction = prediction.actions.find(a => a.name === 'documentAction');
    assert.equal(docAction.method, 'POST');
    assert.equal(docAction.url, '/sws/neo/action-test/header/{id}/action/documentAction');
    assert.equal(docAction.endpoint, undefined);
  });

  it('documentAction has preconditions on documentStatus', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const prediction = generateApiPrediction(actionSchema, fc, bc);
    const docAction = prediction.actions.find(a => a.name === 'documentAction');
    assert.ok(docAction.preconditions.length > 0);
    const statusPre = docAction.preconditions.find(p => p.field === 'documentStatus');
    assert.ok(statusPre);
    assert.deepEqual(statusPre.values, ['DR', 'IP']);
  });

  it('curated action overrides are applied from window.actions', () => {
    const curatedSchema = {
      ...actionSchema,
      window: {
        ...actionSchema.window,
        actions: {
          documentAction: {
            label: 'Complete Document',
            description: 'Complete the sales order',
            dryRunSupported: false,
            effects: ['Locks the document', 'Creates accounting entries'],
            edgeCases: ['Custom edge 1', 'Custom edge 2', 'Custom edge 3'],
            allowedValues: ['CO', 'PR'],
            paramName: 'docAction',
          },
        },
      },
    };
    const fc = generateFrontendContract(curatedSchema);
    const bc = generateBackendContract(curatedSchema);
    const prediction = generateApiPrediction(curatedSchema, fc, bc);
    const docAction = prediction.actions.find(a => a.name === 'documentAction');
    assert.ok(docAction);
    assert.equal(docAction.label, undefined);
    assert.equal(docAction.description, 'Complete the sales order');
    assert.equal(docAction.dryRunSupported, false);
    assert.deepEqual(docAction.effects, ['Locks the document', 'Creates accounting entries']);
    assert.deepEqual(docAction.edgeCases, ['Custom edge 1', 'Custom edge 2', 'Custom edge 3']);
    const param = docAction.parameters.find(p => p.name === 'docAction');
    assert.ok(param);
    assert.deepEqual(param.allowedValues, ['CO', 'PR']);
  });

  it('action testManifest entries use action.name', () => {
    const fc = generateFrontendContract(actionSchema);
    const bc = generateBackendContract(actionSchema);
    const contract = generateContract(actionSchema);
    const actionTests = contract.testManifest.tests.filter(t => t.category === 'action-endpoint');
    assert.ok(actionTests.length > 0);
    for (const t of actionTests) {
      assert.ok(t.field, 'test should have field property');
      assert.ok(t.entity, 'test should have entity property');
    }
  });
});

// ─── Form-State Metadata (ETP-3957) ──────────────────────────────────────────

describe('generateContract — formState (ETP-3957)', () => {
  const formStateSchema = {
    version: '0.1.0',
    window: { id: '900', name: 'Form State Test', primaryEntity: 'header', category: 'sales' },
    entities: [{
      name: 'header',
      table: 'C_FormTest',
      level: 'header',
      fields: [
        { name: 'documentNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly', required: false, searchable: true, grid: true, form: true },
        { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable', required: true, searchable: true, grid: true, form: true },
        { name: 'orderDate', column: 'DateOrdered', type: 'date', visibility: 'editable', required: false, searchable: false, grid: true, form: true, defaultValue: 'today' },
        { name: 'internalNote', column: 'Description', type: 'string', visibility: 'editable', required: false, searchable: false, grid: false, form: true },
        { name: 'processed', column: 'Processed', type: 'boolean', visibility: 'system', required: false, searchable: false, grid: false, form: false },
        { name: 'documentAction', column: 'DocAction', type: 'button', visibility: 'system', required: false, searchable: false, grid: false, form: false },
      ],
    }],
  };

  const formStateRules = [
    { entity: 'header', fieldName: 'businessPartner', type: 'callout', className: 'BPartnerCallout', name: 'bpartnerCallout' },
    { entity: 'header', fieldName: 'businessPartner', type: 'callout', className: 'PriceListCallout' },
    { entity: 'header', fieldName: 'documentNo', type: 'readOnlyLogic', expression: "@Processed@='Y'" },
    { entity: 'header', fieldName: 'internalNote', type: 'displayLogic', expression: "@DocumentStatus@='DR'" },
  ];

  it('contract includes formState section', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    assert.ok(contract.formState, 'contract should have formState');
    assert.ok(contract.formState.entities, 'formState should have entities');
  });

  it('formState fields include visibility, readOnly, required', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const bp = contract.formState.entities.header.fields.businessPartner;
    assert.equal(bp.required, true);
    assert.equal(bp.visible, undefined);
    assert.equal(bp.readOnly, undefined);
  });

  it('readOnly fields are marked correctly', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const docNo = contract.formState.entities.header.fields.documentNo;
    assert.equal(docNo.readOnly, true);
    assert.equal(docNo.visible, undefined);
    assert.equal(docNo.required, undefined);
  });

  it('system and discarded fields are excluded from formState', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    assert.ok(!contract.formState.entities.header.fields.processed, 'system field should be excluded');
    assert.ok(!contract.formState.entities.header.fields.documentAction, 'system button should be excluded');
  });

  it('callout triggers are collected from rules', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const bp = contract.formState.entities.header.fields.businessPartner;
    assert.ok(Array.isArray(bp.calloutTriggers));
    assert.equal(bp.calloutTriggers.length, 2);
    assert.ok(bp.calloutTriggers.includes('BPartnerCallout'));
    assert.ok(bp.calloutTriggers.includes('PriceListCallout'));
  });

  it('displayLogic is extracted from rules', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const note = contract.formState.entities.header.fields.internalNote;
    assert.equal(note.displayLogic, "@DocumentStatus@='DR'");
  });

  it('readOnlyLogic is extracted from rules', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const docNo = contract.formState.entities.header.fields.documentNo;
    assert.equal(docNo.readOnlyLogic, "@Processed@='Y'");
  });

  it('defaultValue is included when present', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    const date = contract.formState.entities.header.fields.orderDate;
    assert.equal(date.defaultValue, 'today');
  });

  it('requiredSessionVariables extracts @#VAR@ patterns', () => {
    const sessionSchema = {
      ...formStateSchema,
      entities: [{
        ...formStateSchema.entities[0],
        fields: [
          ...formStateSchema.entities[0].fields,
          { name: 'orgField', column: 'AD_Org_ID', type: 'foreignKey', visibility: 'editable', required: false, searchable: false, grid: false, form: true,
            validationRule: { rawExpression: "@#AD_Org_ID@ IS NOT NULL" } },
        ],
      }],
    };
    const contract = generateContract(sessionSchema, []);
    assert.ok(contract.formState.requiredSessionVariables.includes('#AD_Org_ID'));
  });

  it('requiredSessionVariables extracts session variables from rule expressions', () => {
    const contract = generateContract(formStateSchema, [
      { entity: 'header', fieldName: 'internalNote', type: 'displayLogic', expression: "@#AD_Client_ID@ IS NOT NULL" },
      { entity: 'header', fieldName: 'businessPartner', type: 'readOnlyLogic', rawExpression: "@#AD_Role_ID@ IS NOT NULL" },
    ]);

    assert.deepStrictEqual(contract.formState.requiredSessionVariables, [
      '#AD_Client_ID',
      '#AD_Role_ID',
    ]);
  });

  it('evaluationMode is runtime', () => {
    const contract = generateContract(formStateSchema, formStateRules);
    assert.equal(contract.formState.evaluationMode, 'runtime');
  });

  it('empty schema produces empty formState entities', () => {
    const emptySchema = {
      version: '0.1.0',
      window: { id: '999', name: 'Empty', primaryEntity: 'main', category: 'test' },
      entities: [],
    };
    const contract = generateContract(emptySchema, []);
    assert.ok(contract.formState);
    assert.deepStrictEqual(contract.formState.entities, {});
    assert.deepStrictEqual(contract.formState.requiredSessionVariables, []);
  });
});

// ─── Agent Profile Metadata (ETP-3958) ───────────────────────────────────────

describe('generateContract — agentProfile (ETP-3958)', () => {
  const profileSchema = {
    version: '0.1.0',
    window: { id: '1000', name: 'Purchase Order', primaryEntity: 'header', category: 'purchases' },
    entities: [{
      name: 'header',
      table: 'C_Order',
      level: 'header',
      fields: [
        { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable', required: true, searchable: true, grid: true, form: true, reference: 'BusinessPartner', dependsOn: { field: 'organization', filterKey: 'AD_Org_ID' } },
        { name: 'orderDate', column: 'DateOrdered', type: 'date', visibility: 'editable', required: false, searchable: true, grid: true, form: true },
        { name: 'documentAction', column: 'DocAction', type: 'button', visibility: 'system', required: false, searchable: false, grid: false, form: false, processId: '104', processType: 'classic' },
      ],
    }, {
      name: 'lines',
      table: 'C_OrderLine',
      level: 'line',
      fields: [
        { name: 'product', column: 'M_Product_ID', type: 'foreignKey', visibility: 'editable', required: true, searchable: true, grid: true, form: true, reference: 'Product', validationRule: { cascadeParams: ['C_BPartner_ID'] } },
        { name: 'quantity', column: 'QtyOrdered', type: 'number', visibility: 'editable', required: true, searchable: false, grid: true, form: true },
      ],
    }],
  };

  it('contract includes agentProfile section', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(contract.agentProfile, 'contract should have agentProfile');
  });

  it('agentProfile has purpose field', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(typeof contract.agentProfile.purpose === 'string');
    assert.ok(contract.agentProfile.purpose.length > 0);
  });

  it('agentProfile has whenToUse array', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.whenToUse));
    assert.ok(contract.agentProfile.whenToUse.length > 0);
  });

  it('agentProfile minimumCreate identifies required header fields', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(contract.agentProfile.minimumCreate);
    assert.ok(contract.agentProfile.minimumCreate.headerFields.includes('businessPartner'));
  });

  it('agentProfile minimumCreate identifies required line fields', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(contract.agentProfile.minimumCreate.lineFields.includes('product'));
    assert.ok(contract.agentProfile.minimumCreate.lineFields.includes('quantity'));
  });

  it('agentProfile includes selectorContexts', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.selectorContexts));
    assert.deepStrictEqual(contract.agentProfile.selectorContexts.map(s => s.field), [
      'businessPartner',
      'product',
    ]);
    assert.equal(contract.agentProfile.selectorContexts[0].context.required[0].param, 'AD_Org_ID');
    assert.equal(contract.agentProfile.selectorContexts[1].context.required[0].param, 'C_BPartner_ID');
  });

  it('agentProfile includes document actions', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.actions));
    assert.ok(contract.agentProfile.actions.includes('documentAction'));
  });

  it('agentProfile includes workflow for transactional specs', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.workflow));
    assert.ok(contract.agentProfile.workflow.length > 0);
  });

  it('agentProfile workflow detects lifecycle actions by action type', () => {
    const schema = {
      ...profileSchema,
      entities: [{
        ...profileSchema.entities[0],
        fields: profileSchema.entities[0].fields.map(field => (
          field.name === 'documentAction'
            ? { ...field, name: 'posted', column: 'Posted' }
            : field
        )),
      }, profileSchema.entities[1]],
    };

    const contract = generateContract(schema, []);

    assert.ok(contract.apiPrediction.actions.some(action =>
      action.name === 'posted' && action.actionType === 'documentAction'
    ));
    assert.ok(contract.agentProfile.workflow.includes('Validate form state'));
    assert.ok(contract.agentProfile.workflow.includes('Complete the document'));
  });

  it('agentProfile includes edgeCases', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.edgeCases));
    assert.ok(contract.agentProfile.edgeCases.length >= 3);
  });

  it('agentProfile includes examples for transactional specs', () => {
    const contract = generateContract(profileSchema, []);
    assert.ok(Array.isArray(contract.agentProfile.examples));
    assert.deepStrictEqual(contract.agentProfile.examples.map(e => e.operation), [
      'createHeader',
      'createLine',
      'completeDocument',
    ]);
  });

  it('agentProfile exposes warnings for read-only specs without boilerplate workflow', () => {
    const readOnlySchema = {
      version: '0.1.0',
      window: { id: '1001', name: 'Audit Setup', primaryEntity: 'header', category: 'configuration' },
      entities: [{
        name: 'header',
        table: 'AD_Audit_Setup',
        level: 'header',
        fields: [
          { name: 'name', column: 'Name', type: 'string', visibility: 'readOnly', required: false, searchable: true, grid: true, form: true },
        ],
      }],
    };
    const contract = generateContract(readOnlySchema, []);
    assert.deepStrictEqual(contract.agentProfile.workflow, []);
    assert.deepStrictEqual(contract.agentProfile.edgeCases, []);
    assert.ok(contract.agentProfile.warnings.includes('This spec appears read-only from generated form metadata'));
  });

  it('agentProfile includes dangerousOperations for void/reactive actions', () => {
    const schemaWithDanger = {
      ...profileSchema,
      entities: [{
        ...profileSchema.entities[0],
        fields: [
          ...profileSchema.entities[0].fields,
          { name: 'voidDocument', column: 'Void', type: 'button', visibility: 'editable', required: false, searchable: false, grid: false, form: true },
          { name: 'reactivateDocument', column: 'Reactivate', type: 'button', visibility: 'editable', required: false, searchable: false, grid: false, form: true },
        ],
      }],
    };
    const contract = generateContract(schemaWithDanger, []);
    assert.ok(Array.isArray(contract.agentProfile.dangerousOperations));
    assert.ok(contract.agentProfile.dangerousOperations.includes('voidDocument'));
    assert.ok(contract.agentProfile.dangerousOperations.includes('reactivateDocument'));
  });

  it('agentProfile references only existing fields/selectors/actions', () => {
    const contract = generateContract(profileSchema, []);
    const profile = contract.agentProfile;

    // Verify minimumCreate fields exist in formState
    for (const field of profile.minimumCreate.headerFields ?? []) {
      assert.ok(contract.formState.entities.header.fields[field], `minimumCreate header field ${field} should exist in formState`);
    }
    for (const field of profile.minimumCreate.lineFields ?? []) {
      assert.ok(contract.formState.entities.lines.fields[field], `minimumCreate line field ${field} should exist in formState`);
    }

    // Verify selectorContexts exist in apiPrediction
    const selectorNames = new Set(contract.apiPrediction.selectors.filter(s => s.context).map(s => s.field));
    for (const sel of profile.selectorContexts) {
      assert.ok(selectorNames.has(sel.field), `selectorContext ${sel.field} should exist in apiPrediction`);
    }

    // Verify actions exist in apiPrediction
    const actionNames = new Set(contract.apiPrediction.actions.map(a => a.name));
    for (const action of profile.actions) {
      assert.ok(actionNames.has(action), `action ${action} should exist in apiPrediction`);
    }
  });
});

// ---------------------------------------------------------------------------
// generateFrontendContract — gridReadOnly passthrough
// ---------------------------------------------------------------------------

describe('generateFrontendContract — gridReadOnly', () => {
  const schemaWithGridReadOnly = {
    version: '0.1.0',
    window: { id: '901', name: 'Return To Vendor', primaryEntity: 'shipment', category: 'purchasing' },
    entities: [{
      name: 'shipment',
      table: 'M_InOut',
      level: 'header',
      fields: [
        { name: 'quantity', column: 'Qty', type: 'number', visibility: 'editable',
          required: true, searchable: false, grid: true, form: true,
          gridReadOnly: true },
        { name: 'product', column: 'M_Product_ID', type: 'foreignKey', visibility: 'editable',
          required: true, searchable: false, grid: true, form: true },
        { name: 'adClientId', column: 'AD_Client_ID', type: 'id', visibility: 'system',
          required: true, searchable: false, grid: false, form: false },
      ],
    }],
  };

  it('includes gridReadOnly: true on the field when set in schema', () => {
    const fc = generateFrontendContract(schemaWithGridReadOnly);
    const qty = fc.entities.shipment.fields.find(f => f.name === 'quantity');
    assert.equal(qty.gridReadOnly, true);
  });

  it('does NOT add gridReadOnly to a field that lacks it', () => {
    const fc = generateFrontendContract(schemaWithGridReadOnly);
    const product = fc.entities.shipment.fields.find(f => f.name === 'product');
    assert.equal(product.gridReadOnly, undefined);
  });
});

// ─── businessCritical per-field flag (ETP-4233) ──────────────────────────────

const schemaWithBusinessCritical = {
  version: '0.1.0',
  window: { id: '900', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
  entities: [{
    name: 'order',
    table: 'C_Order',
    level: 'header',
    fields: [
      { name: 'documentNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly',
        required: true, searchable: true, grid: true, form: true, businessCritical: true },
      { name: 'description', column: 'Description', type: 'string', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true },
    ],
  }],
};

describe('generateFrontendContract — businessCritical (ETP-4233)', () => {
  it('field with businessCritical:true includes businessCritical in frontendContract', () => {
    const fc = generateFrontendContract(schemaWithBusinessCritical);
    const docNo = fc.entities.order.fields.find(f => f.name === 'documentNo');
    assert.equal(docNo.businessCritical, true);
  });

  it('field without businessCritical does NOT have the key in frontendContract', () => {
    const fc = generateFrontendContract(schemaWithBusinessCritical);
    const desc = fc.entities.order.fields.find(f => f.name === 'description');
    assert.equal(desc.businessCritical, undefined,
      'businessCritical must be absent when not set — truthy-only contract');
  });
});

describe('generateBackendContract — businessCritical (ETP-4233)', () => {
  it('field with businessCritical:true includes businessCritical in backendContract', () => {
    const bc = generateBackendContract(schemaWithBusinessCritical);
    const docNo = bc.entities.order.fields.find(f => f.name === 'documentNo');
    assert.equal(docNo.businessCritical, true);
  });

  it('field without businessCritical does NOT have the key in backendContract', () => {
    const bc = generateBackendContract(schemaWithBusinessCritical);
    const desc = bc.entities.order.fields.find(f => f.name === 'description');
    assert.equal(desc.businessCritical, undefined,
      'absent businessCritical must not appear in backendContract');
  });
});

// ---------------------------------------------------------------------------
// generateFrontendContract — balanceFooter passthrough
// ---------------------------------------------------------------------------

describe('generateFrontendContract — balanceFooter', () => {
  const schemaBase = {
    version: '0.1.0',
    window: { id: '820', name: 'G/L Journal', primaryEntity: 'journal', category: 'accounting' },
    entities: [{
      name: 'journal',
      table: 'GL_Journal',
      level: 'header',
      fields: [
        { name: 'documentNo', column: 'DocumentNo', type: 'string', visibility: 'editable',
          required: true, searchable: false, grid: true, form: true },
      ],
    }],
  };

  it('copies balanceFooter to frontendContract.window when declared', () => {
    const schema = {
      ...schemaBase,
      window: { ...schemaBase.window, balanceFooter: { debitField: 'amtSourceDr', creditField: 'amtSourceCr' } },
    };
    const fc = generateFrontendContract(schema);
    assert.deepEqual(fc.window.balanceFooter, { debitField: 'amtSourceDr', creditField: 'amtSourceCr' });
  });

  it('does NOT add balanceFooter to frontendContract.window when absent', () => {
    const fc = generateFrontendContract(schemaBase);
    assert.equal(fc.window.balanceFooter, undefined);
  });
});

describe('generateFrontendContract — skipDefault', () => {
  const schema = {
    version: '0.1.0',
    window: { id: '900', name: 'GL Journal', primaryEntity: 'journal', category: 'finance' },
    entities: [
      { name: 'journal', table: 'GL_Journal', level: 'header', fields: [
        { name: 'description', column: 'Description', type: 'string', visibility: 'editable', required: false, grid: false, form: true },
      ] },
      { name: 'journalLine', table: 'GL_JournalLine', level: 'line', fields: [
        { name: 'account', column: 'Account_ID', type: 'foreignKey', reference: 'Account', inputMode: 'selector', visibility: 'editable', required: true, grid: true, form: true },
        { name: 'note', column: 'Note', type: 'string', visibility: 'editable', required: false, grid: true, form: true, skipDefault: true },
      ] },
    ],
  };

  it('emits skipDefault on a field that declares it', () => {
    const fc = generateFrontendContract(schema);
    const note = fc.entities.journalLine.fields.find(f => f.name === 'note');
    assert.equal(note.skipDefault, true);
  });

  it('omits skipDefault when the field does not declare it', () => {
    const fc = generateFrontendContract(schema);
    const account = fc.entities.journalLine.fields.find(f => f.name === 'account');
    assert.equal(account.skipDefault, undefined);
  });
});

describe('generateFrontendContract — handlesDefaults', () => {
  const make = (handlesDefaults) => ({
    version: '0.1.0',
    window: { id: '900', name: 'GL Journal', primaryEntity: 'journal', category: 'finance' },
    entities: [
      { name: 'journal', table: 'GL_Journal', level: 'header', fields: [
        { name: 'description', column: 'Description', type: 'string', visibility: 'editable', required: false, grid: false, form: true },
      ] },
      { name: 'journalLine', table: 'GL_JournalLine', level: 'line',
        ...(handlesDefaults === undefined ? {} : { handlesDefaults }),
        fields: [
          { name: 'account', column: 'Account_ID', type: 'foreignKey', reference: 'Account', inputMode: 'selector', visibility: 'editable', required: true, grid: true, form: true },
        ] },
    ],
  });

  it('emits handlesDefaults:false when the entity opts out', () => {
    const fc = generateFrontendContract(make(false));
    assert.equal(fc.entities.journalLine.handlesDefaults, false);
  });

  it('omits handlesDefaults when the entity does not set it (default on)', () => {
    const fc = generateFrontendContract(make(undefined));
    assert.equal(fc.entities.journalLine.handlesDefaults, undefined);
  });

  it('omits handlesDefaults when explicitly true', () => {
    const fc = generateFrontendContract(make(true));
    assert.equal(fc.entities.journalLine.handlesDefaults, undefined);
  });
});

// ─── ETP-4277 — max constraint in contract fields ─────────────────────────────
describe('generateFrontendContract — max field constraint (ETP-4277)', () => {
  function makeSchemaWithDiscount(discountExtra = {}) {
    return {
      version: '0.1.0',
      window: { id: '999', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
      entities: [{
        name: 'order',
        table: 'C_Order',
        level: 'header',
        fields: [
          { name: 'discount', column: 'Discount', type: 'number', visibility: 'editable',
            required: false, searchable: false, grid: true, form: true, ...discountExtra },
          { name: 'quantity', column: 'QtyOrdered', type: 'number', visibility: 'editable',
            required: false, searchable: false, grid: true, form: true },
        ],
      }],
    };
  }

  it('copies max from curated field to contract field output', () => {
    const fc = generateFrontendContract(makeSchemaWithDiscount({ max: 100 }));
    const discount = fc.entities.order.fields.find(f => f.name === 'discount');
    assert.equal(discount.max, 100);
  });

  it('does not set max on contract field when curated field has no max', () => {
    const fc = generateFrontendContract(makeSchemaWithDiscount());
    const discount = fc.entities.order.fields.find(f => f.name === 'discount');
    assert.equal(discount.max, undefined);
  });

  it('does not set max on a sibling field that has no max declared', () => {
    const fc = generateFrontendContract(makeSchemaWithDiscount({ max: 100 }));
    const quantity = fc.entities.order.fields.find(f => f.name === 'quantity');
    assert.equal(quantity.max, undefined);
  });

  it('copies both min and max when both are present on the curated field', () => {
    const fc = generateFrontendContract(makeSchemaWithDiscount({ min: 0, max: 100 }));
    const discount = fc.entities.order.fields.find(f => f.name === 'discount');
    assert.equal(discount.min, 0);
    assert.equal(discount.max, 100);
  });
});
