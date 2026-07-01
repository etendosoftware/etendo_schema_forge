import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  capitalize,
  toLabel,
  getProcessesForEntity,
  getReadOnlyFields,
  generateTableComponent,
  generateFormComponent,
  generatePageComponent,
  generateIndexComponent,
  generateMockCatalogs,
  generateAll,
  projectApiPredictionForFrontend,
  fragmentIf,
  wrapIf,
  jsonWrapIf,
  pick,
  buildHeaderLogicMaps,
} from '../src/generate-frontend.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const masterDetailContract = {
  frontendContract: {
    window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
    entities: {
      order: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'BusinessPartner', inputMode: 'search' },
          { name: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: false, form: true, reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' } },
          { name: 'warehouse', column: 'M_Warehouse_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: false, form: true, reference: 'Warehouse', inputMode: 'selector' },
          { name: 'priceList', column: 'M_PriceList_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: false, form: true, reference: 'PriceList', inputMode: 'selector' },
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'readOnly', required: false, grid: true, form: true },
          { name: 'docStatus', column: 'DocStatus', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'adClientId', column: 'AD_Client_ID', type: 'id', tsType: 'string', visibility: 'system', required: true, grid: false, form: false },
        ],
        searchableFields: ['documentNo', 'businessPartner', 'docStatus'],
        computedFields: [],
      },
      orderLine: {
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'Product', inputMode: 'search' },
          { name: 'quantity', column: 'QtyOrdered', type: 'number', tsType: 'number', visibility: 'editable', required: true, grid: true, form: true },
          { name: 'tax', column: 'C_Tax_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'Tax', inputMode: 'selector' },
          { name: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', tsType: 'number', visibility: 'readOnly', required: false, grid: true, form: true },
        ],
        searchableFields: ['product'],
        computedFields: [],
      },
    },
  },
  backendContract: {
    processEndpoints: [
      { name: 'completeOrder', method: 'POST', path: '/process/completeOrder', entity: 'order', preconditions: [], steps: 6 },
      { name: 'voidOrder', method: 'POST', path: '/process/voidOrder', entity: 'order', preconditions: [], steps: 4 },
    ],
  },
};

const singleEntityContract = {
  frontendContract: {
    window: { id: '1', name: 'Simple Item', primaryEntity: 'item', category: 'reference' },
    entities: {
      item: {
        fields: [
          { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
          { name: 'description', column: 'Description', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true },
          { name: 'amount', column: 'Amount', type: 'amount', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true },
          { name: 'isActive', column: 'IsActive', type: 'boolean', tsType: 'boolean', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'adClientId', column: 'AD_Client_ID', type: 'id', tsType: 'string', visibility: 'system', required: true, grid: false, form: false },
        ],
        searchableFields: ['name'],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

const booleanContract = {
  frontendContract: {
    window: { id: '203', name: 'Price List', primaryEntity: 'priceList', category: 'reference' },
    entities: {
      priceList: {
        fields: [
          { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
          { name: 'isDefault', column: 'IsDefault', type: 'boolean', tsType: 'boolean', visibility: 'editable', required: false, grid: false, form: true },
          { name: 'isActive', column: 'IsActive', type: 'boolean', tsType: 'boolean', visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: ['name'],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe('capitalize', () => {
  it('capitalizes the first letter of a string', () => {
    assert.equal(capitalize('order'), 'Order');
  });

  it('returns empty string for empty input', () => {
    assert.equal(capitalize(''), '');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(capitalize(null), '');
    assert.equal(capitalize(undefined), '');
  });

  it('preserves the rest of the string as-is', () => {
    assert.equal(capitalize('orderLine'), 'OrderLine');
  });

  it('handles single character strings', () => {
    assert.equal(capitalize('a'), 'A');
  });
});

describe('toLabel', () => {
  it('converts camelCase to Title Case with spaces', () => {
    assert.equal(toLabel('orderLine'), 'Order Line');
  });

  it('capitalizes first letter of simple names', () => {
    assert.equal(toLabel('name'), 'Name');
  });

  it('returns empty string for empty/null input', () => {
    assert.equal(toLabel(''), '');
    assert.equal(toLabel(null), '');
    assert.equal(toLabel(undefined), '');
  });

  it('handles multi-word camelCase', () => {
    assert.equal(toLabel('lineNetAmount'), 'Line Net Amount');
  });

  it('handles already capitalized input', () => {
    assert.equal(toLabel('Order'), 'Order');
  });
});

// ---------------------------------------------------------------------------
// getProcessesForEntity
// ---------------------------------------------------------------------------

describe('getProcessesForEntity', () => {
  it('returns processes matching the entity', () => {
    const procs = getProcessesForEntity(masterDetailContract, 'order');
    assert.equal(procs.length, 2);
    assert.equal(procs[0].name, 'completeOrder');
    assert.equal(procs[1].name, 'voidOrder');
  });

  it('returns empty array when entity has no processes', () => {
    const procs = getProcessesForEntity(masterDetailContract, 'orderLine');
    assert.equal(procs.length, 0);
  });

  it('returns empty array when processEndpoints is missing', () => {
    const contract = { backendContract: {} };
    const procs = getProcessesForEntity(contract, 'order');
    assert.equal(procs.length, 0);
  });

  it('returns empty array when backendContract is missing', () => {
    const contract = {};
    const procs = getProcessesForEntity(contract, 'order');
    assert.equal(procs.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getReadOnlyFields
// ---------------------------------------------------------------------------

describe('getReadOnlyFields', () => {
  it('returns only form fields with readOnly visibility', () => {
    const fields = getReadOnlyFields(masterDetailContract, 'order');
    assert.ok(fields.length > 0, 'should find readOnly fields');
    assert.ok(fields.every(f => f.visibility === 'readOnly'), 'all should be readOnly');
    assert.ok(fields.every(f => f.form === true), 'all should be form fields');
  });

  it('includes documentNo, grandTotal, docStatus for order', () => {
    const fields = getReadOnlyFields(masterDetailContract, 'order');
    const names = fields.map(f => f.name);
    assert.ok(names.includes('documentNo'));
    assert.ok(names.includes('grandTotal'));
    assert.ok(names.includes('docStatus'));
  });

  it('does not include editable or system fields', () => {
    const fields = getReadOnlyFields(masterDetailContract, 'order');
    const names = fields.map(f => f.name);
    assert.ok(!names.includes('businessPartner'), 'editable field should not be included');
    assert.ok(!names.includes('adClientId'), 'system field should not be included');
  });
});

// ---------------------------------------------------------------------------
// generateTableComponent
// ---------------------------------------------------------------------------

describe('generateTableComponent', () => {
  it('imports DataTable from contract-ui', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes("import { DataTable, InlineLinesPanel } from '@/components/contract-ui'"));
  });

  it('exports a named component with PascalCase entity name + Table', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes('export default OrderTable'));
  });

  it('renders DataTable with columns, filters, and spread props', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes('<DataTable'));
    assert.ok(code.includes('columns={columns}'));
    assert.ok(code.includes('filters={filters}'));
    assert.ok(code.includes('{...props}'));
  });

  it('includes only grid:true fields as columns', () => {
    const code = generateTableComponent('order', masterDetailContract);
    // grid:true fields
    assert.ok(code.includes("key: 'documentNo'"));
    assert.ok(code.includes("key: 'businessPartner'"));
    assert.ok(code.includes("key: 'grandTotal'"));
    assert.ok(code.includes("key: 'docStatus'"));
    // grid:false fields
    assert.ok(!code.includes("key: 'partnerAddress'"));
    assert.ok(!code.includes("key: 'warehouse'"));
    assert.ok(!code.includes("key: 'priceList'"));
    // system fields (grid:false)
    assert.ok(!code.includes("key: 'adClientId'"));
  });

  it('maps column types correctly', () => {
    const code = generateTableComponent('order', masterDetailContract);
    // grandTotal is amount
    assert.ok(code.includes("key: 'grandTotal', column: 'GrandTotal', type: 'amount'"));
    // docStatus name includes "status" -> status type
    assert.ok(code.includes("type: 'status'"));
  });

  it('emits column keys instead of labels for i18n resolution', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes("column: 'DocumentNo'"));
    assert.ok(code.includes("column: 'C_BPartner_ID'"));
    assert.ok(code.includes("column: 'GrandTotal'"));
    // Should NOT contain hardcoded label
    assert.ok(!code.includes("label: 'Document No'"));
  });

  it('declares filters array from searchableFields', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes("'documentNo'"));
    assert.ok(code.includes("'businessPartner'"));
    assert.ok(code.includes("'docStatus'"));
  });

  it('handles entity with no searchable fields', () => {
    const contract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [{ name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true }],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generateTableComponent('test', contract);
    assert.ok(code.includes('const filters = []'));
  });

  it('maps boolean fields to boolean type in columns', () => {
    const code = generateTableComponent('priceList', booleanContract);
    assert.ok(code.includes("type: 'boolean'"));
    assert.ok(code.includes("key: 'isActive'"));
  });

  it('maps number/integer fields to number type', () => {
    const code = generateTableComponent('orderLine', masterDetailContract);
    assert.ok(code.includes("key: 'quantity', column: 'QtyOrdered', type: 'number'"));
  });

  it('does NOT contain inline CSS classes', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(!code.includes('hover:bg-primary'));
    assert.ok(!code.includes('bg-muted'));
    assert.ok(!code.includes('rounded-lg'));
    assert.ok(!code.includes('lucide-react'));
  });

  it('does NOT contain state management hooks', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(!code.includes('useState'));
    assert.ok(!code.includes('filteredData'));
  });

  it('emits excludeValueOf on the grid column when declared on a selector field', () => {
    const contract = {
      ...masterDetailContract,
      frontendContract: {
        ...masterDetailContract.frontendContract,
        entities: {
          ...masterDetailContract.frontendContract.entities,
          orderLine: {
            ...masterDetailContract.frontendContract.entities.orderLine,
            fields: [
              ...masterDetailContract.frontendContract.entities.orderLine.fields,
              { name: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'foreignKey', tsType: 'string',
                visibility: 'editable', required: true, grid: true, form: true, reference: 'Locator',
                inputMode: 'selector', excludeValueOf: 'storageBin' },
            ],
          },
        },
      },
    };
    const code = generateTableComponent('orderLine', contract);
    assert.ok(
      /key: 'newStorageBin'[^}]*excludeValueOf: 'storageBin'/.test(code),
      `expected excludeValueOf on newStorageBin grid column, got:\n${code}`,
    );
  });

  it('omits excludeValueOf on grid columns when not declared', () => {
    const code = generateTableComponent('orderLine', masterDetailContract);
    assert.ok(!code.includes('excludeValueOf'));
  });
});

// ---------------------------------------------------------------------------
// generateFormComponent
// ---------------------------------------------------------------------------

describe('generateFormComponent', () => {
  it('imports EntityForm from contract-ui', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes("import { EntityForm } from '@/components/contract-ui'"));
  });

  it('exports a named component with PascalCase entity name + Form', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes('export default function OrderForm'));
  });

  it('renders EntityForm with fields and spread props', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes('<EntityForm'));
    assert.ok(code.includes('fields={fields}'));
    assert.ok(code.includes('{...props}'));
  });

  it('includes all form:true fields (both editable and readOnly)', () => {
    const code = generateFormComponent('order', masterDetailContract);
    // editable fields
    assert.ok(code.includes("key: 'businessPartner'"));
    assert.ok(code.includes("key: 'partnerAddress'"));
    assert.ok(code.includes("key: 'warehouse'"));
    assert.ok(code.includes("key: 'priceList'"));
    // readOnly fields with form:true
    assert.ok(code.includes("key: 'documentNo'"));
    assert.ok(code.includes("key: 'grandTotal'"));
    assert.ok(code.includes("key: 'docStatus'"));
  });

  it('excludes system fields (form:false)', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(!code.includes("key: 'adClientId'"));
  });

  it('marks readOnly fields with readOnly: true', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes('readOnly: true'), 'readOnly fields should get readOnly flag');
  });

  it('marks required fields with required: true', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes('required: true'));
  });

  it('emits column keys instead of labels for i18n resolution', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes("column: 'C_BPartner_ID'"));
    assert.ok(code.includes("column: 'C_BPartner_Location_ID'"));
    assert.ok(code.includes("column: 'GrandTotal'"));
    // Should NOT contain hardcoded label
    assert.ok(!code.includes("label: 'Business Partner'"));
  });

  it('maps foreignKey with search inputMode to search type', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes("type: 'search'"));
    assert.ok(code.includes("reference: 'BusinessPartner'"));
    assert.ok(code.includes("inputMode: 'search'"));
  });

  it('maps foreignKey with selector inputMode to selector type', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes("type: 'selector'"));
    assert.ok(code.includes("reference: 'Warehouse'"));
    assert.ok(code.includes("inputMode: 'selector'"));
  });

  it('maps foreignKey with dependent inputMode to dependent type', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(code.includes("type: 'dependent'"));
    assert.ok(code.includes("reference: 'BusinessPartnerLocation'"));
    assert.ok(code.includes("inputMode: 'dependent'"));
    assert.ok(code.includes("dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' }"));
  });

  it('maps boolean fields to checkbox type', () => {
    const code = generateFormComponent('priceList', booleanContract);
    assert.ok(code.includes("type: 'checkbox'"));
    assert.ok(code.includes("key: 'isDefault'"));
  });

  it('includes readOnly boolean fields when they have form:true', () => {
    const code = generateFormComponent('priceList', booleanContract);
    // isActive is readOnly but form:true, so it should be included with readOnly flag
    assert.ok(code.includes("key: 'isActive'"));
    assert.ok(code.includes("readOnly: true"));
  });

  it('maps number tsType to number form type', () => {
    const code = generateFormComponent('orderLine', masterDetailContract);
    assert.ok(code.includes("key: 'quantity'"));
    assert.ok(code.includes("type: 'number'"));
  });

  it('maps date type fields to date form type', () => {
    const dateContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [
              { name: 'dateOrdered', column: 'DateOrdered', type: 'date', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generateFormComponent('test', dateContract);
    assert.ok(code.includes("type: 'date'"));
  });

  it('maps description/notes field names to textarea type', () => {
    const code = generateFormComponent('item', singleEntityContract);
    assert.ok(code.includes("key: 'description'"));
    assert.ok(code.includes("type: 'textarea'"));
  });

  it('respects explicit sections without consuming the automatic principal limit', () => {
    const sectionContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [
              { name: 'first', column: 'First', type: 'string', tsType: 'string', visibility: 'editable', form: true },
              { name: 'second', column: 'Second', type: 'string', tsType: 'string', visibility: 'editable', form: true, section: 'principal' },
              { name: 'third', column: 'Third', type: 'string', tsType: 'string', visibility: 'editable', form: true, section: 'principal' },
              { name: 'fourth', column: 'Fourth', type: 'string', tsType: 'string', visibility: 'editable', form: true },
              { name: 'fifth', column: 'Fifth', type: 'string', tsType: 'string', visibility: 'editable', form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };

    const code = generateFormComponent('test', sectionContract);
    assert.ok(code.includes("key: 'fourth', column: 'Fourth', type: 'text', section: 'principal'"));
    assert.ok(code.includes("key: 'fifth', column: 'Fifth', type: 'text', section: 'principal'"));
  });

  it('does NOT contain inline CSS or save/delete buttons', () => {
    const code = generateFormComponent('order', masterDetailContract);
    assert.ok(!code.includes('grid-cols'));
    assert.ok(!code.includes('focus:ring'));
    assert.ok(!code.includes('Save'));
    assert.ok(!code.includes('completeOrder'));
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent (master-detail)
// ---------------------------------------------------------------------------

describe('generatePageComponent', () => {
  it('imports ListView and DetailView from contract-ui', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("import { ListView, DetailView } from '@/components/contract-ui'"));
  });

  it('exports a named component with PascalCase header entity name + Page', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('export default function OrderPage'));
  });

  it('imports header Table, Form, detail Table, detail Form, and mockCatalogs', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("import OrderTable from './OrderTable'"));
    assert.ok(code.includes("import OrderForm from './OrderForm'"));
    assert.ok(code.includes("import OrderLineTable from './OrderLineTable'"));
    assert.ok(code.includes("import OrderLineForm from './OrderLineForm'"));
    assert.ok(code.includes("import catalogs from './mockCatalogs'"));
  });

  it('imports both DetailTable and DetailForm for inline line editing', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("import OrderLineTable from './OrderLineTable'"));
    assert.ok(code.includes("import OrderLineForm from './OrderLineForm'"));
  });

  it('declares summary from readOnly header fields excluding status', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // documentNo and grandTotal are readOnly, non-status
    assert.ok(code.includes("key: 'documentNo'"));
    assert.ok(code.includes("key: 'grandTotal'"));
    // docStatus is the status field, should NOT be in summary
    const summaryMatch = code.match(/const summary = \[([\s\S]*?)\];/);
    assert.ok(summaryMatch, 'should have summary array');
    assert.ok(!summaryMatch[1].includes("key: 'docStatus'"), 'status field should not be in summary');
  });

  it('declares statusField from field name containing "status"', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("const statusField = 'docStatus'"));
  });

  it('sets statusField to null when no status field exists', () => {
    const noStatusContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'header', category: 'test' },
        entities: {
          header: {
            fields: [
              { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
          detail: {
            fields: [
              { name: 'item', column: 'Item', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generatePageComponent('header', 'detail', noStatusContract);
    assert.ok(code.includes('const statusField = null'));
  });

  it('declares processes array with positive/destructive styles', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("name: 'completeOrder'"));
    assert.ok(code.includes("label: 'Complete Order'"));
    assert.ok(code.includes("style: 'positive'"));
    assert.ok(code.includes("name: 'voidOrder'"));
    assert.ok(code.includes("label: 'Void Order'"));
    assert.ok(code.includes("style: 'destructive'"));
  });

  it('generates empty processes array when no processes exist', () => {
    const noProcsContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'header', category: 'test' },
        entities: {
          header: {
            fields: [{ name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true }],
            searchableFields: [],
            computedFields: [],
          },
          detail: {
            fields: [{ name: 'item', column: 'Item', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true }],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generatePageComponent('header', 'detail', noProcsContract);
    assert.ok(code.includes('const processes = [\n\n]'));
  });

  it('declares addLineFields with entry and derived arrays', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('addLineFields'));
    assert.ok(code.includes('entry:'));
    assert.ok(code.includes('derived:'));
  });

  it('puts non-auto fields in entry and auto-pattern fields in derived', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // product and quantity are entry; tax has reference so stays in entry
    // lineNetAmount is readOnly so excluded from addLineFields entirely
    const entryMatch = code.match(/entry: \[([\s\S]*?)\]/);
    assert.ok(entryMatch);
    assert.ok(entryMatch[1].includes("key: 'product'"));
    assert.ok(entryMatch[1].includes("key: 'quantity'"));
    // tax has reference ('Tax') so the auto-pattern is skipped — it stays in entry
    assert.ok(entryMatch[1].includes("key: 'tax'"), 'tax with reference should be in entry');
  });

  it('marks first entry field with lookup: true', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // product is first entry field
    assert.ok(code.includes("key: 'product'"));
    assert.ok(code.includes('lookup: true'));
  });

  it('includes FK reference and inputMode in addLineFields entry', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("reference: 'Product'"));
    assert.ok(code.includes("reference: 'Tax'"));
    assert.ok(code.includes("inputMode: 'selector'"));
  });

  it('emits forceCalloutFields as JSON array when declared on entry field', () => {
    const contract = {
      ...masterDetailContract,
      frontendContract: {
        ...masterDetailContract.frontendContract,
        entities: {
          ...masterDetailContract.frontendContract.entities,
          orderLine: {
            ...masterDetailContract.frontendContract.entities.orderLine,
            fields: masterDetailContract.frontendContract.entities.orderLine.fields.map(f =>
              f.name === 'product'
                ? { ...f, forceCalloutFields: ['quantity', 'tax'] }
                : f
            ),
          },
        },
      },
    };
    const code = generatePageComponent('order', 'orderLine', contract);
    assert.ok(code.includes('forceCalloutFields: ["quantity","tax"]'), `expected forceCalloutFields in generated code, got:\n${code}`);
  });

  it('omits forceCalloutFields when not declared on entry field', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('forceCalloutFields'));
  });

  it('emits excludeValueOf on the addLineFields entry when declared on a selector field', () => {
    const contract = {
      ...masterDetailContract,
      frontendContract: {
        ...masterDetailContract.frontendContract,
        entities: {
          ...masterDetailContract.frontendContract.entities,
          orderLine: {
            ...masterDetailContract.frontendContract.entities.orderLine,
            fields: [
              ...masterDetailContract.frontendContract.entities.orderLine.fields,
              { name: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'foreignKey', tsType: 'string',
                visibility: 'editable', required: true, grid: true, form: true, reference: 'Locator',
                inputMode: 'selector', excludeValueOf: 'storageBin' },
            ],
          },
        },
      },
    };
    const code = generatePageComponent('order', 'orderLine', contract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\]/);
    assert.ok(entryMatch, 'addLineFields entry array not found');
    assert.ok(
      /key: 'newStorageBin'[^}]*excludeValueOf: 'storageBin'/.test(entryMatch[1]),
      `expected excludeValueOf on newStorageBin entry field, got:\n${entryMatch[1]}`,
    );
  });

  it('omits excludeValueOf on the addLineFields entry when not declared', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('excludeValueOf'));
  });

  it('passes config props to MasterDetailPage', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('entity="order"'));
    assert.ok(code.includes('detailEntity="orderLine"'));
    assert.ok(code.includes('Form={OrderForm}'));
    assert.ok(code.includes('DetailTable={OrderLineTable}'));
    assert.ok(code.includes('summary={summary}'));
    assert.ok(code.includes('statusField={statusField}'));
    assert.ok(code.includes('processes={processes}'));
    assert.ok(code.includes('addLineFields={addLineFields}'));
    assert.ok(code.includes('catalogs={catalogs}'));
    assert.ok(code.includes('{...props}'));
    assert.ok(code.includes('Table={OrderTable}'));
  });

  it('passes entityLabel and detailLabel props', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('entityLabel="Order"'));
    assert.ok(code.includes('detailLabel="Order Line"'));
  });

  it('emits balanceFooter prop when window.balanceFooter is declared', () => {
    const contract = {
      ...masterDetailContract,
      frontendContract: {
        ...masterDetailContract.frontendContract,
        window: {
          ...masterDetailContract.frontendContract.window,
          balanceFooter: { debitField: 'amtSourceDr', creditField: 'amtSourceCr' },
        },
      },
    };
    const code = generatePageComponent('order', 'orderLine', contract);
    assert.ok(code.includes('balanceFooter={'), `expected balanceFooter prop, got:\n${code}`);
    assert.ok(code.includes('"debitField":"amtSourceDr"'));
    assert.ok(code.includes('"creditField":"amtSourceCr"'));
  });

  it('omits balanceFooter prop when not declared', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('balanceFooter={'));
  });

  it('does NOT contain inline CSS or state hooks', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('useState'));
    assert.ok(!code.includes('fetch('));
    assert.ok(!code.includes('w-2/5'));
    assert.ok(!code.includes('animate-pulse'));
    assert.ok(!code.includes('shadow-sm'));
  });

  it('preserves token for gallery detail header custom components until they migrate', () => {
    const galleryContract = {
      apiPrediction: { baseUrl: '/sws/neo/product', specName: 'product' },
      frontendContract: {
        window: { id: '101', name: 'Product', primaryEntity: 'product', category: 'reference', layoutType: 'gallery' },
        entities: {
          product: {
            fields: [
              { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: ['name'],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generatePageComponent('product', null, galleryContract);
    assert.ok(code.includes('headerContent={'), 'should render the gallery detail header slot');
    assert.ok(code.includes('token={props.token}'), 'gallery custom header should receive token for legacy compatibility');
  });

  it('preserves token for sidebar custom components until they migrate', () => {
    const sidebarContract = {
      frontendContract: {
        window: { id: '102', name: 'Contacts', primaryEntity: 'contact', category: 'crm', sidebarLayout: true },
        entities: {
          contact: {
            fields: [
              { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: ['name'],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generatePageComponent('contact', null, sidebarContract);
    assert.ok(code.includes('sidebarContent='), 'should render the sidebar slot');
    assert.ok(code.includes('token={props.token}'), 'sidebar custom component should receive token for legacy compatibility');
  });
});

// ---------------------------------------------------------------------------
// sendDocument recipient-policy override emission (ETP-4226)
// ---------------------------------------------------------------------------

describe('generatePageComponent — sendDocument recipient policy (ETP-4226)', () => {
  // A documental window (header has a non-discarded `documentNo`) enables the
  // envelope by default. `window.sendDocument` recipient-policy keys flow
  // verbatim into the emitted `sendDocument` prop so ListView/DetailView can
  // forward them to SendDocumentModal as `sendPolicy`.
  function buildDocumentalContract(sendDocument) {
    const window = { id: '1', name: 'Sales Order', primaryEntity: 'order', category: 'sales' };
    if (sendDocument !== undefined) window.sendDocument = sendDocument;
    return {
      frontendContract: {
        window,
        entities: {
          order: {
            fields: [
              { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
              { name: 'docStatus', column: 'DocStatus', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
          orderLine: {
            fields: [
              { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
  }

  it('emits a bare sendDocument prop (no value) when only the defaults apply', () => {
    const code = generatePageComponent('order', 'orderLine', buildDocumentalContract(undefined));
    // Default {enabled:true, allowEmail:true} → prop is emitted without a value...
    assert.ok(/sendDocument(?![=A-Za-z])/.test(code), 'bare sendDocument prop should be present');
    // ...and never serialized as a JSON object.
    assert.ok(!code.includes('sendDocument={{'), 'defaults must not emit a JSON sendDocument value');
  });

  it('serializes recipient-policy keys verbatim when window.sendDocument declares them', () => {
    const code = generatePageComponent(
      'order',
      'orderLine',
      buildDocumentalContract({ editableRecipients: false, cc: false, maxRecipients: 5 }),
    );
    assert.ok(
      code.includes('sendDocument={{"enabled":true,"allowEmail":true,"editableRecipients":false,"cc":false,"maxRecipients":5}}'),
      'recipient-policy keys should be emitted verbatim alongside enabled/allowEmail',
    );
  });

  it('forwards the policy to BOTH the ListView and DetailView sendDocument props', () => {
    const code = generatePageComponent(
      'order',
      'orderLine',
      buildDocumentalContract({ editableRecipients: true, maxRecipients: 10 }),
    );
    const matches = code.match(/sendDocument=\{\{[^}]*"maxRecipients":10[^}]*\}\}/g) || [];
    assert.equal(matches.length, 2, 'policy should be emitted for ListView and DetailView');
  });

  it('emits sendDocument={{"enabled":false}} when the feature is force-disabled', () => {
    // Must emit the prop explicitly so ListView receives sendDocument != null and
    // skips its documentNo auto-detection heuristic (which would re-enable the envelope).
    const code = generatePageComponent(
      'order',
      'orderLine',
      buildDocumentalContract({ enabled: false, editableRecipients: true }),
    );
    assert.ok(/sendDocument=\{.*"enabled":false/.test(code), 'force-disabled window emits sendDocument={{"enabled":false}}');
  });
});

// ---------------------------------------------------------------------------
// generateIndexComponent
// ---------------------------------------------------------------------------

describe('generateIndexComponent', () => {
  it('generates entry point with token, apiBaseUrl, and window props for master-detail', () => {
    const code = generateIndexComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('token'));
    assert.ok(code.includes('apiBaseUrl'));
    assert.ok(code.includes('window'));
    assert.ok(code.includes('export default'));
  });

  it('imports Page component for master-detail', () => {
    const code = generateIndexComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("import OrderPage from './OrderPage'"));
    assert.ok(code.includes('<OrderPage'));
  });

  it('includes windowMeta with category and name for master-detail', () => {
    const code = generateIndexComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("category: 'sales'"));
    assert.ok(code.includes("name: 'Sales Order'"));
  });

  it('generates Page-based pattern for single-entity (no detail)', () => {
    const code = generateIndexComponent('item', null, singleEntityContract);
    assert.ok(code.includes("import ItemPage from './ItemPage'"));
    assert.ok(code.includes('<ItemPage'));
    assert.ok(code.includes('windowName={windowName}'));
    assert.ok(code.includes('recordId={recordId}'));
  });

  it('passes correct props to Page for single-entity', () => {
    const code = generateIndexComponent('item', null, singleEntityContract);
    assert.ok(code.includes('token={token}'));
    assert.ok(code.includes('apiBaseUrl={apiBaseUrl}'));
    assert.ok(code.includes('{...rest}'));
  });

  it('includes windowMeta with category and name for single-entity', () => {
    const code = generateIndexComponent('item', null, singleEntityContract);
    assert.ok(code.includes("category: 'reference'"));
    assert.ok(code.includes("name: 'Simple Item'"));
  });

  it('falls back to toLabel(headerEntity) when window name is missing', () => {
    const code = generateIndexComponent('item', null, {});
    assert.ok(code.includes("name: 'Item'"));
    assert.ok(code.includes("category: 'general'"));
  });
});

// ---------------------------------------------------------------------------
// generateMockCatalogs
// ---------------------------------------------------------------------------

describe('generateMockCatalogs', () => {
  // The generator used to emit hardcoded fake FK data (e.g. "Acme Corp", "Wire Transfer").
  // That data leaked into production UIs as a flash of wrong values before real /selector
  // responses arrived. The generator now emits an empty catalog — selector data always
  // comes from the backend. The file is kept so the `import catalogs from './mockCatalogs'`
  // in HeaderPage.jsx keeps resolving.

  it('emits an empty catalogs object (no fake FK data)', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('const catalogs = {}'));
    assert.ok(!code.includes("catalogs['"), 'should not emit any hardcoded catalog entries');
  });

  it('exports catalogs as default export', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('export default catalogs'));
  });

  it('starts with an explanatory auto-generated comment', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.startsWith('// Auto-generated'));
  });

  it('does not leak known legacy fake values', () => {
    const code = generateMockCatalogs(masterDetailContract);
    for (const fake of ['Acme Corp', 'Wire Transfer', 'Laptop Pro 15', 'Main Warehouse']) {
      assert.ok(!code.includes(fake), `legacy fake "${fake}" should no longer appear`);
    }
  });

  it('emits the same empty output regardless of contract shape', () => {
    const noFkContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [{ name: 'name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true }],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    assert.equal(generateMockCatalogs(noFkContract), generateMockCatalogs(masterDetailContract));
  });
});

// ---------------------------------------------------------------------------
// generateAll (orchestrator)
// ---------------------------------------------------------------------------

describe('generateAll', () => {
  it('produces correct files for master-detail contract', () => {
    const files = generateAll(masterDetailContract);
    const names = Object.keys(files);
    assert.ok(names.includes('OrderTable.jsx'));
    assert.ok(names.includes('OrderForm.jsx'));
    assert.ok(names.includes('OrderLineTable.jsx'));
    assert.ok(names.includes('OrderLineForm.jsx'));
    assert.ok(names.includes('OrderPage.jsx'));
    assert.ok(names.includes('index.jsx'));
    assert.ok(names.includes('mockCatalogs.js'));
    assert.equal(names.length, 7);
  });

  it('produces correct files for single-entity contract', () => {
    const files = generateAll(singleEntityContract);
    const names = Object.keys(files);
    assert.ok(names.includes('ItemTable.jsx'));
    assert.ok(names.includes('ItemForm.jsx'));
    assert.ok(names.includes('index.jsx'));
    assert.ok(names.includes('mockCatalogs.js'));
    assert.ok(names.includes('ItemPage.jsx'), 'should produce Page for single entity');
    assert.equal(names.length, 5);
  });

  it('file names follow PascalCase entity + suffix convention', () => {
    const files = generateAll(masterDetailContract);
    for (const name of Object.keys(files)) {
      if (name === 'index.jsx' || name === 'mockCatalogs.js') continue;
      assert.ok(/^[A-Z][a-zA-Z]+(Table|Form|Page)\.jsx$/.test(name), `${name} should follow PascalCase+suffix convention`);
    }
  });

  it('all Table/Form/Page files import from contract-ui', () => {
    const files = generateAll(masterDetailContract);
    for (const [name, code] of Object.entries(files)) {
      if (name.endsWith('Table.jsx') || name.endsWith('Form.jsx') || name.endsWith('Page.jsx')) {
        assert.ok(code.includes('@/components/contract-ui'), `${name} should import from contract-ui`);
        assert.ok(!code.includes('@/components/ui/table'), `${name} should NOT import from ui/table directly`);
        assert.ok(!code.includes('@/components/ui/input'), `${name} should NOT import from ui/input directly`);
      }
    }
  });

  it('mockCatalogs.js has correct structure', () => {
    const files = generateAll(masterDetailContract);
    const code = files['mockCatalogs.js'];
    assert.ok(code.includes('const catalogs = {}'));
    assert.ok(code.includes('export default catalogs'));
  });

  it('index.jsx has default export', () => {
    const files = generateAll(masterDetailContract);
    assert.ok(files['index.jsx'].includes('export default'));
  });
});

// ---------------------------------------------------------------------------
// Field type mapping edge cases
// ---------------------------------------------------------------------------

describe('field type mapping edge cases', () => {
  const edgeCaseContract = {
    frontendContract: {
      window: { id: '1', name: 'Edge Case', primaryEntity: 'test', category: 'test' },
      entities: {
        test: {
          fields: [
            { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            { name: 'count', column: 'Count', type: 'integer', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true },
            { name: 'orderDate', column: 'DateOrdered', type: 'date', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true },
            { name: 'notes', column: 'Notes', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true },
            { name: 'remarks', column: 'Remarks', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true },
            { name: 'comments', column: 'Comments', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true },
            { name: 'orderStatus', column: 'OrderStatus', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true },
          ],
          searchableFields: [],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('maps integer type to number in table columns', () => {
    const code = generateTableComponent('test', edgeCaseContract);
    assert.ok(code.includes("key: 'count'"));
    assert.ok(code.includes("type: 'number'"));
  });

  it('maps date type to date in table columns', () => {
    const code = generateTableComponent('test', edgeCaseContract);
    assert.ok(code.includes("key: 'orderDate'"));
    assert.ok(code.includes("type: 'date'"));
  });

  it('maps field name containing "status" to status type in table', () => {
    const code = generateTableComponent('test', edgeCaseContract);
    assert.ok(code.includes("key: 'orderStatus', column: 'OrderStatus', type: 'status'"));
  });

  it('maps notes/remarks/comments field names to textarea in form', () => {
    const code = generateFormComponent('test', edgeCaseContract);
    // All three should be textarea
    const textareaCount = (code.match(/type: 'textarea'/g) || []).length;
    assert.equal(textareaCount, 3, 'notes, remarks, and comments should all be textarea');
  });

  it('maps date type to date in form', () => {
    const code = generateFormComponent('test', edgeCaseContract);
    assert.ok(code.includes("key: 'orderDate'"));
    assert.ok(code.includes("type: 'date'"));
  });

  it('maps plain string to text in form', () => {
    const code = generateFormComponent('test', edgeCaseContract);
    assert.ok(code.includes("key: 'name', column: 'Name', type: 'text'"));
  });
});

// ---------------------------------------------------------------------------
// addLineFields derived field separation
// ---------------------------------------------------------------------------

describe('addLineFields derived field separation', () => {
  it('puts price/tax/amount pattern fields in derived; discount stays in entry', () => {
    const contract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'header', category: 'test' },
        entities: {
          header: {
            fields: [{ name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true }],
            searchableFields: [],
            computedFields: [],
          },
          detail: {
            fields: [
              { name: 'product', column: 'M_Product_ID', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
              { name: 'unitPrice', column: 'PriceActual', type: 'amount', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true },
              { name: 'discount', column: 'Discount', type: 'number', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true },
              { name: 'netAmount', column: 'LineNetAmt', type: 'amount', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generatePageComponent('header', 'detail', contract);

    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    const derivedMatch = code.match(/derived: \[([\s\S]*?)\],/);
    assert.ok(entryMatch);
    assert.ok(derivedMatch);

    // product and discount are in entry — discount is user-editable, not auto-derived
    assert.ok(entryMatch[1].includes("key: 'product'"));
    assert.ok(entryMatch[1].includes("key: 'discount'"));
    // price/amount fields are in derived
    assert.ok(derivedMatch[1].includes("key: 'unitPrice'"));
    assert.ok(derivedMatch[1].includes("key: 'netAmount'"));
    // discount must NOT be in derived
    assert.ok(!derivedMatch[1].includes("key: 'discount'"));
  });

  it('excludes readOnly detail fields from addLineFields entirely', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // lineNetAmount is readOnly, should not appear in addLineFields
    const addLineMatch = code.match(/const addLineFields = \{([\s\S]*?)\};/);
    assert.ok(addLineMatch);
    assert.ok(!addLineMatch[1].includes("key: 'lineNetAmount'"));
  });
});

// ---------------------------------------------------------------------------
// Behavioral metadata: displayLogic, readOnlyLogic, callout
// ---------------------------------------------------------------------------

const behavioralContract = {
  frontendContract: {
    window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
    entities: {
      order: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'discount', column: 'Discount', type: 'number', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true,
            displayLogic: { raw: "@DocumentType@='SO'", js: "record.documentType === 'SO'" } },
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'readOnly', required: false, grid: true, form: true,
            readOnlyLogic: { raw: "@Posted@='Y'", js: "record.posted === true" } },
          { name: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true,
            callout: { className: 'com.example.LineNetCallout', effects: ['grandTotal'] } },
          { name: 'bothLogics', column: 'BothLogics', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true,
            displayLogic: { raw: "@Active@='Y'", js: "record.active === true" },
            readOnlyLogic: { raw: "@Processed@='Y'", js: "record.processed === true" } },
        ],
        searchableFields: ['documentNo'],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generateFormComponent - behavioral metadata', () => {
  it('includes displayLogic as arrow function when field has displayLogic.js', () => {
    const code = generateFormComponent('order', behavioralContract);
    assert.ok(code.includes("displayLogic: (record) => record.documentType === 'SO'"),
      'should emit displayLogic arrow function from displayLogic.js');
  });

  it('includes readOnlyLogic as arrow function when field has readOnlyLogic.js', () => {
    const code = generateFormComponent('order', behavioralContract);
    assert.ok(code.includes('readOnlyLogic: (record) => record.posted === true'),
      'should emit readOnlyLogic arrow function from readOnlyLogic.js');
  });

  it('does not include callout as a config property on the field line', () => {
    const code = generateFormComponent('order', behavioralContract);
    const lineNetLine = code.split('\n').find(l => l.includes("key: 'lineNetAmount'"));
    assert.ok(lineNetLine, 'lineNetAmount field should exist');
    assert.ok(!lineNetLine.includes('callout'), 'callout should not appear as field config property');
  });

  it('includes both displayLogic and readOnlyLogic on the same field', () => {
    const code = generateFormComponent('order', behavioralContract);
    // The bothLogics field should have both
    assert.ok(code.includes("key: 'bothLogics'"), 'bothLogics field should exist');
    assert.ok(code.includes('displayLogic: (record) => record.active === true'),
      'should include displayLogic on bothLogics field');
    assert.ok(code.includes('readOnlyLogic: (record) => record.processed === true'),
      'should include readOnlyLogic on bothLogics field');
  });

  it('does NOT emit displayLogic when displayLogic.js is absent', () => {
    const code = generateFormComponent('order', behavioralContract);
    // documentNo has no displayLogic at all
    const docNoLine = code.split('\n').find(l => l.includes("key: 'documentNo'"));
    assert.ok(docNoLine, 'documentNo field should exist');
    assert.ok(!docNoLine.includes('displayLogic'), 'documentNo should not have displayLogic');
  });

  it('does NOT emit readOnlyLogic when readOnlyLogic.js is absent', () => {
    const code = generateFormComponent('order', behavioralContract);
    const discountLine = code.split('\n').find(l => l.includes("key: 'discount'"));
    assert.ok(discountLine, 'discount field should exist');
    assert.ok(!discountLine.includes('readOnlyLogic'), 'discount should not have readOnlyLogic');
  });
});

// ---------------------------------------------------------------------------
// apiPrediction in Page and Index components
// ---------------------------------------------------------------------------

const contractWithApi = {
  frontendContract: {
    window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
    entities: {
      order: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'readOnly', required: false, grid: true, form: true },
          { name: 'docStatus', column: 'DocStatus', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: ['documentNo'],
        computedFields: [],
      },
      orderLine: {
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'Product', inputMode: 'search' },
          { name: 'quantity', column: 'QtyOrdered', type: 'number', tsType: 'number', visibility: 'editable', required: true, grid: true, form: true },
        ],
        searchableFields: ['product'],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
  apiPrediction: {
    specName: 'sales-order',
    baseUrl: '/sws/neo/sales-order',
    crud: {
      order: { listUrl: '/sws/neo/sales-order/order', detailUrl: '/sws/neo/sales-order/order/{id}', supportedFilters: ['documentNo'] },
    },
    selectors: [{ entity: 'order', field: 'businessPartner', url: '/sws/neo/sales-order/order/selectors/businessPartner' }],
    actions: [],
    queryParams: { pagination: { startRow: '_startRow', endRow: '_endRow' } },
  },
};

const singleEntityContractWithApi = {
  frontendContract: {
    window: { id: '1', name: 'Simple Item', primaryEntity: 'item', category: 'reference' },
    entities: {
      item: {
        fields: [
          { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
        ],
        searchableFields: ['name'],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
  apiPrediction: {
    specName: 'simple-item',
    baseUrl: '/sws/neo/simple-item',
    crud: { item: { listUrl: '/sws/neo/simple-item/item' } },
    selectors: [],
    actions: [],
    queryParams: {},
  },
};

describe('generatePageComponent - apiPrediction', () => {
  it('emits api const from apiPrediction when present', () => {
    const code = generatePageComponent('order', 'orderLine', contractWithApi);
    assert.ok(code.includes('const api ='), 'should declare api const');
    assert.ok(code.includes('"specName": "sales-order"'), 'should include specName');
    assert.ok(code.includes('"baseUrl": "/sws/neo/sales-order"'), 'should include baseUrl');
  });

  it('passes api prop to MasterDetailPage', () => {
    const code = generatePageComponent('order', 'orderLine', contractWithApi);
    assert.ok(code.includes('api={api}'), 'should pass api prop');
  });

  it('does not emit api const when apiPrediction is absent', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('const api ='), 'should not declare api const without apiPrediction');
    assert.ok(!code.includes('api={api}'), 'should not pass api prop without apiPrediction');
  });

  it('emits a frontend-only action projection', () => {
    const api = projectApiPredictionForFrontend({
      specName: 'sales-order',
      actions: [{
        name: 'documentAction',
        label: 'Process Order',
        actionType: 'documentAction',
        entity: 'order',
        column: 'DocAction',
        requiresRecord: true,
        endpoint: '/sws/neo/sales-order/order/{id}/action/documentAction',
        method: 'POST',
        url: '/sws/neo/sales-order/order/{id}/action/documentAction',
        parameters: [{ name: 'docAction', type: 'string' }],
        preconditions: [{ field: 'documentStatus', operator: 'in', values: ['DR'] }],
        effects: ['Updates document status'],
        dryRunSupported: true,
        edgeCases: ['Already processed', 'Missing lines', 'No permission'],
        provenance: 'extracted',
        processId: '104',
        processType: 'classic',
      }],
    });

    assert.deepEqual(api.actions, [{
      entity: 'order',
      column: 'DocAction',
      url: '/sws/neo/sales-order/order/{id}/action/documentAction',
      processId: '104',
      processType: 'classic',
    }]);
  });
});

describe('generateIndexComponent - apiPrediction', () => {
  it('imports api from Page component in master-detail index when apiPrediction present', () => {
    const code = generateIndexComponent('order', 'orderLine', contractWithApi);
    assert.ok(code.includes("import OrderPage, { api } from './OrderPage'"), 'should import api from Page');
    assert.ok(!code.includes('const api ='), 'should not redefine api const');
  });

  it('passes api prop in master-detail index', () => {
    const code = generateIndexComponent('order', 'orderLine', contractWithApi);
    assert.ok(code.includes('api={api}'), 'should pass api prop to Page component');
  });

  it('imports api from Page component in single-entity index when apiPrediction present', () => {
    const code = generateIndexComponent('item', null, singleEntityContractWithApi);
    assert.ok(code.includes("import ItemPage, { api } from './ItemPage'"), 'should import api from Page');
    assert.ok(!code.includes('const api ='), 'should not redefine api const');
  });

  it('passes api prop in single-entity index', () => {
    const code = generateIndexComponent('item', null, singleEntityContractWithApi);
    assert.ok(code.includes('api={api}'), 'should pass api prop to SingleEntityPage');
  });

  it('does not emit api const when apiPrediction is absent', () => {
    const code = generateIndexComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('const api ='), 'should not declare api const');
  });

  it('does not emit api const for empty contract', () => {
    const code = generateIndexComponent('item', null, {});
    assert.ok(!code.includes('const api ='), 'should not declare api const for empty contract');
  });
});

// ---------------------------------------------------------------------------
// TODO comments for callout and onChangeFunction
// ---------------------------------------------------------------------------

const todoContract = {
  frontendContract: {
    window: { id: '1', name: 'Test TODO', primaryEntity: 'invoice', category: 'test' },
    entities: {
      invoice: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
          { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'BusinessPartner', inputMode: 'search',
            callout: { className: 'org.openbravo.erpCommon.ad_callouts.SE_Invoice_BPartner' } },
          { name: 'paidOut', column: 'paid_out', type: 'number', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true,
            onChangeFunction: { name: 'OB.APRM.AddPayment.glItemAmountOnChange' } },
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true,
            callout: { className: 'org.openbravo.erpCommon.ad_callouts.SL_Order_Amt' },
            onChangeFunction: { name: 'OB.APRM.AddPayment.totalOnChange' } },
        ],
        searchableFields: [],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generateFormComponent - callout and onChangeFunction are not emitted as field config', () => {
  it('field with callout does not have callout in the field config line', () => {
    const code = generateFormComponent('invoice', todoContract);
    const bpLine = code.split('\n').find(l => l.includes("key: 'businessPartner'"));
    assert.ok(bpLine, 'businessPartner field should exist');
    assert.ok(!bpLine.includes('callout'), 'callout should not appear as field config property');
  });

  it('field with onChangeFunction does not have onchange in the field config line', () => {
    const code = generateFormComponent('invoice', todoContract);
    const glLine = code.split('\n').find(l => l.includes("key: 'paidOut'"));
    assert.ok(glLine, 'paidOut field should exist');
    assert.ok(!glLine.includes('onChange'), 'onChangeFunction should not appear as field config property');
  });

  it('no @sf-custom-slot comments are emitted', () => {
    const code = generateFormComponent('invoice', todoContract);
    assert.ok(!code.includes('// @sf-custom-slot'),
      'no @sf-custom-slot comments should be in generated output');
  });
});

// ---------------------------------------------------------------------------
// UI Hints in generated frontend code
// ---------------------------------------------------------------------------

const uiHintsContract = {
  frontendContract: {
    window: { id: '600', name: 'UI Hints', primaryEntity: 'order', category: 'test' },
    entities: {
      order: {
        fields: [
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number', visibility: 'editable', required: true, grid: true, form: true,
            defaultValue: '0', help: 'Total amount including tax', fieldGroup: 'Amounts', precision: 2, isSelectionColumn: true },
          { name: 'dateOrdered', column: 'DateOrdered', type: 'date', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true,
            fieldGroup: 'Dates' },
          { name: 'plainField', column: 'PlainCol', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true },
          { name: 'escapedHelp', column: 'EscapedCol', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true,
            defaultValue: "it's a test", help: "don't forget" },
        ],
        searchableFields: [],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generateFormComponent - UI hints', () => {
  it('field with defaultValue emits defaultValue in output', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes("defaultValue: '0'"), 'should emit defaultValue');
  });

  it('field with help emits help in output', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes("help: 'Total amount including tax'"), 'should emit help text');
  });

  it('field with fieldGroup emits fieldGroup in output', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes("fieldGroup: 'Amounts'"), 'should emit fieldGroup');
  });

  it('field with precision emits precision in output', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes('precision: 2'), 'should emit precision');
  });

  it('field groups comment is generated when fieldGroup fields exist', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes('// Field groups: Amounts, Dates'), 'should emit field groups comment');
  });

  it('fields without hints have no hint attributes in output', () => {
    const code = generateFormComponent('order', uiHintsContract);
    const plainLine = code.split('\n').find(l => l.includes("key: 'plainField'"));
    assert.ok(plainLine, 'plainField should exist');
    assert.ok(!plainLine.includes('defaultValue'), 'plainField should not have defaultValue');
    assert.ok(!plainLine.includes('help'), 'plainField should not have help');
    assert.ok(!plainLine.includes('fieldGroup'), 'plainField should not have fieldGroup');
    assert.ok(!plainLine.includes('precision'), 'plainField should not have precision');
  });

  it('escapes single quotes in defaultValue and help', () => {
    const code = generateFormComponent('order', uiHintsContract);
    assert.ok(code.includes("defaultValue: 'it\\'s a test'"), 'should escape single quotes in defaultValue');
    assert.ok(code.includes("help: 'don\\'t forget'"), 'should escape single quotes in help');
  });

  it('field groups comment is not generated when no fieldGroup fields exist', () => {
    const noGroupContract = {
      frontendContract: {
        window: { id: '1', name: 'No Groups', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [
              { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            ],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generateFormComponent('test', noGroupContract);
    assert.ok(!code.includes('// Field groups:'), 'should not emit field groups comment');
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent - newRecordComponent (state-based modal)
// ---------------------------------------------------------------------------

const newRecordContract = {
  frontendContract: {
    window: {
      id: '900',
      name: 'Payment In',
      primaryEntity: 'finPayment',
      category: 'finance',
      customComponents: { newRecordComponent: 'NewPaymentModal' },
    },
    entities: {
      finPayment: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'status', column: 'Status', type: 'string', tsType: 'string', visibility: 'readOnly', required: false, grid: true, form: true },
        ],
        tabName: 'Fin Payment',
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generatePageComponent - newRecordComponent', () => {
  it('imports useState when newRecordComponent is configured', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes("import { useState, useEffect } from 'react'"), 'should import useState');
  });

  it('declares showNewModal state hook', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('const [showNewModal, setShowNewModal] = useState(false)'), 'should declare showNewModal state');
  });

  it('uses plain if (recordId) without new check', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(!code.includes("recordId !== 'new'"), 'should not check for new in recordId condition');
    assert.ok(code.includes('if (recordId)'), 'should have plain recordId check');
  });

  it('passes onNew prop to ListView', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('onNew={() => setShowNewModal(true)}'), 'should pass onNew to ListView');
  });

  it('renders modal based on showNewModal state, not recordId', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('{showNewModal && <NewPaymentModal'), 'should render modal based on showNewModal state');
    assert.ok(!code.includes("recordId === 'new'"), 'should not reference recordId for modal rendering');
  });

  it('passes onClose prop to the modal component', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('onClose={() => setShowNewModal(false)}'), 'should pass onClose to close the modal');
  });

  it('passes token, apiBaseUrl, and windowName to modal', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('token={props.token}'), 'should pass token for legacy compatibility');
    assert.ok(code.includes('apiBaseUrl={props.apiBaseUrl}'), 'should pass apiBaseUrl');
    assert.ok(code.includes('windowName={windowName}'), 'should pass windowName');
  });

  it('wraps ListView and modal in Fragment', () => {
    const code = generatePageComponent('finPayment', null, newRecordContract);
    assert.ok(code.includes('<>'), 'should open Fragment');
    assert.ok(code.includes('</>'), 'should close Fragment');
  });

  it('does NOT add useState or onNew when newRecordComponent is absent', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('useState'), 'should not import useState');
    assert.ok(!code.includes('onNew'), 'should not pass onNew');
    assert.ok(!code.includes('showNewModal'), 'should not have showNewModal state');
  });
});

describe('generateTableComponent - isSelectionColumn hint', () => {
  it('field with isSelectionColumn emits isSelectionColumn in grid columns', () => {
    const code = generateTableComponent('order', uiHintsContract);
    assert.ok(code.includes('isSelectionColumn: true'), 'should emit isSelectionColumn');
  });

  it('field without isSelectionColumn does not emit the attribute', () => {
    const code = generateTableComponent('order', uiHintsContract);
    const plainLine = code.split('\n').find(l => l.includes("key: 'plainField'"));
    assert.ok(plainLine, 'plainField should exist');
    assert.ok(!plainLine.includes('isSelectionColumn'), 'plainField should not have isSelectionColumn');
  });
});

// ---------------------------------------------------------------------------
// menuActions — visibleWhenFieldFalse
// ---------------------------------------------------------------------------

const makeMenuContract = (menuActions) => ({
  frontendContract: {
    window: { id: '1', name: 'Test', primaryEntity: 'header', category: 'sales', menuActions },
    entities: {
      header: {
        fields: [
          { name: 'docStatus', column: 'DocStatus', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: [],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
});

describe('generatePageComponent — menuActions visibleWhenFieldFalse', () => {
  it('uses ({ status }) params when no action has visibleWhenFieldFalse', () => {
    const contract = makeMenuContract([
      { key: 'cancel', label: 'Cancel', destructive: true, visibleWhenStatus: 'CO' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(code.includes('({ status }) =>'), 'should use ({ status }) when no field condition');
    assert.ok(!code.includes('({ data, status }) =>'), 'should NOT destructure data when not needed');
  });

  it('uses ({ data, status }) params when any action has visibleWhenFieldFalse', () => {
    const contract = makeMenuContract([
      { key: 'reactivate', label: 'Reactivate', visibleWhenStatus: 'CO', visibleWhenFieldFalse: 'hasLinkedDocuments', documentAction: 'RE' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(code.includes('({ data, status }) =>'), 'should destructure data when field condition is used');
  });

  it('generates compound condition when both visibleWhenStatus and visibleWhenFieldFalse are set', () => {
    const contract = makeMenuContract([
      { key: 'reactivate', label: 'Reactivate', visibleWhenStatus: 'CO', visibleWhenFieldFalse: 'hasLinkedDocuments', documentAction: 'RE' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(
      code.includes("visible: status === 'CO' && !(data?.hasLinkedDocuments === 'Y' || data?.hasLinkedDocuments === true)"),
      'should combine status check and Y/N-aware field check with &&',
    );
  });

  it('generates only field condition when visibleWhenStatus is absent', () => {
    const contract = makeMenuContract([
      { key: 'duplicate', label: 'Duplicate', visibleWhenFieldFalse: 'isDraft' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(
      code.includes("visible: !(data?.isDraft === 'Y' || data?.isDraft === true)"),
      'should emit only the Y/N-aware field condition when no status filter',
    );
    assert.ok(!code.includes('status ==='), 'should not include status check when visibleWhenStatus is absent');
  });

  it('other actions in the same list keep their original condition unaffected', () => {
    const contract = makeMenuContract([
      { key: 'cancel', label: 'Cancel', destructive: true, visibleWhenStatus: 'CO' },
      { key: 'reactivate', label: 'Reactivate', visibleWhenStatus: 'CO', visibleWhenFieldFalse: 'hasLinkedDocuments', documentAction: 'RE' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(
      code.includes("visible: status === 'CO' && !(data?.hasLinkedDocuments === 'Y' || data?.hasLinkedDocuments === true)"),
      'reactivate should have compound condition',
    );
    assert.ok(
      code.includes("key: 'cancel'"),
      'cancel action should still be present',
    );
    // Cancel has only visibleWhenStatus, its condition should NOT include data?.
    const cancelLine = code.split('\n').find(l => l.includes("key: 'cancel'"));
    assert.ok(cancelLine, 'cancel line must exist');
    assert.ok(!cancelLine.includes('data?.'), 'cancel should not reference data field');
  });

  it('generates documentAction prop when set', () => {
    const contract = makeMenuContract([
      { key: 'reactivate', label: 'Reactivate', visibleWhenStatus: 'CO', visibleWhenFieldFalse: 'hasLinkedDocuments', documentAction: 'RE', successKey: 'actionCompleted' },
    ]);
    const code = generatePageComponent('header', null, contract);
    assert.ok(code.includes("documentAction: 'RE'"), 'should emit documentAction');
    assert.ok(code.includes("successKey: 'actionCompleted'"), 'should emit successKey');
  });
});

// ---------------------------------------------------------------------------
// linesLayout — inline-editable lines flag
// ---------------------------------------------------------------------------

const inlineEditableContract = {
  frontendContract: {
    window: { id: '200', name: 'Sales Quotation', primaryEntity: 'order', category: 'sales', linesLayout: 'inlineEditable' },
    entities: {
      order: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable', required: true, grid: true, form: true, inputMode: 'search' },
          { name: 'grandTotal', column: 'GrandTotal', type: 'amount', visibility: 'readOnly', required: false, grid: true, form: true },
          { name: 'docStatus', column: 'DocStatus', type: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: ['documentNo', 'businessPartner'],
        computedFields: [],
      },
      orderLine: {
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey', visibility: 'editable', required: true, grid: true, form: true, inputMode: 'search', lookup: true },
          { name: 'quantity', column: 'QtyOrdered', type: 'number', visibility: 'editable', required: true, grid: true, form: true },
          { name: 'lineAmount', column: 'LineNetAmt', type: 'amount', visibility: 'readOnly', required: false, grid: true, form: true },
        ],
        searchableFields: [],
        computedFields: [],
        addLineFields: { entry: [{ key: 'product', required: true, lookup: true }, { key: 'quantity', defaultValue: 1 }], derived: [] },
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generatePageComponent — linesLayout', () => {
  it('emits linesLayout="inlineEditable" on DetailView when window declares it', () => {
    const code = generatePageComponent('order', 'orderLine', inlineEditableContract);
    assert.ok(code.includes('linesLayout="inlineEditable"'), 'DetailView must receive linesLayout prop');
  });

  it('does NOT emit linesLayout prop for classic layout (default)', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('linesLayout='), 'classic layout must not emit any linesLayout prop');
  });

  it('generated table component uses forwardRef for inline-editable windows', () => {
    const code = generateTableComponent('orderLine', inlineEditableContract);
    assert.ok(code.includes('forwardRef'), 'table must use forwardRef so DetailView can call flushPendingEdits');
    assert.ok(code.includes('InlineLinesPanel'), 'table must render InlineLinesPanel when linesLayout is active');
  });

  it('generated table falls back to DataTable when linesLayout is classic', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes('DataTable'), 'classic table must render DataTable');
    assert.ok(code.includes('InlineLinesPanel'), 'classic table still imports InlineLinesPanel (dual-mode render)');
  });
});

// ---------------------------------------------------------------------------
// F3 refactor — lookupDrawer / lookupTitle / onSelectMappings / displayFromCatalog
// (emission in generated addLineFields entry array — primary + secondary-tab paths)
// ---------------------------------------------------------------------------

const drawerOnSelect = [
  { from: 'M_Locator_ID', to: 'storageBin' },
  { from: 'M_Product_ID', to: 'product' },
];

// Primary path (master-detail addLineFields, ~line 659): replicate masterDetailContract
// with drawer/title/mappings/displayFromCatalog on the orderLine product field.
const drawerMasterDetailContract = {
  ...masterDetailContract,
  frontendContract: {
    ...masterDetailContract.frontendContract,
    entities: {
      ...masterDetailContract.frontendContract.entities,
      orderLine: {
        ...masterDetailContract.frontendContract.entities.orderLine,
        fields: masterDetailContract.frontendContract.entities.orderLine.fields.map(f => {
          if (f.name === 'product') {
            return {
              ...f,
              lookupDrawer: 'internal-consumption-product',
              lookupTitle: 'Product + Warehouse',
              onSelectMappings: drawerOnSelect,
              displayFromCatalog: true,
            };
          }
          return f;
        }),
      },
    },
  },
};

describe('generatePageComponent — F3 drawer + display emission (primary addLineFields)', () => {
  it('emits lookupDrawer in addLineFields entry for the first search field', () => {
    const code = generatePageComponent('order', 'orderLine', drawerMasterDetailContract);
    assert.ok(
      code.includes("lookupDrawer: 'internal-consumption-product'"),
      'expected lookupDrawer literal in generated addLineFields entry',
    );
  });

  it('emits lookupTitle in addLineFields entry for the first search field', () => {
    const code = generatePageComponent('order', 'orderLine', drawerMasterDetailContract);
    assert.ok(
      code.includes("lookupTitle: 'Product + Warehouse'"),
      'expected lookupTitle literal in generated addLineFields entry',
    );
  });

  it('emits onSelectMappings as JSON array in addLineFields entry', () => {
    const code = generatePageComponent('order', 'orderLine', drawerMasterDetailContract);
    assert.ok(
      code.includes(`onSelectMappings: ${JSON.stringify(drawerOnSelect)}`),
      'expected onSelectMappings JSON in generated addLineFields entry',
    );
  });

  it('emits displayFromCatalog: true in addLineFields entry', () => {
    const code = generatePageComponent('order', 'orderLine', drawerMasterDetailContract);
    assert.ok(
      code.includes('displayFromCatalog: true'),
      'expected displayFromCatalog: true in generated addLineFields entry',
    );
  });

  it('omits all four keys when no field declares them (negative)', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('lookupDrawer:'), 'lookupDrawer should NOT appear');
    assert.ok(!code.includes('lookupTitle:'), 'lookupTitle should NOT appear');
    assert.ok(!code.includes('onSelectMappings:'), 'onSelectMappings should NOT appear');
    assert.ok(!code.includes('displayFromCatalog:'), 'displayFromCatalog should NOT appear');
  });
});

// Secondary-tab path (~line 789): supplied via window.secondaryTabs declarative config.
// Use a header-only window with a sibling entity referenced as a secondary tab.
const secondaryTabContract = {
  frontendContract: {
    window: {
      id: '800',
      name: 'Internal Consumption',
      primaryEntity: 'internalConsumption',
      category: 'inventory',
      secondaryTabs: {
        internalConsumptionLine: {
          label: 'Lines',
          tabOrder: 1,
          addLineFields: ['product', 'displayedProduct', 'plain'],
        },
      },
    },
    entities: {
      internalConsumption: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string',
            visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: ['documentNo'],
        computedFields: [],
      },
      internalConsumptionLine: {
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string',
            visibility: 'editable', required: true, grid: true, form: true,
            reference: 'Product', inputMode: 'search',
            lookupDrawer: 'internal-consumption-product',
            lookupTitle: 'Product + Warehouse',
            onSelectMappings: drawerOnSelect },
          { name: 'displayedProduct', column: 'EM_DisplayedProduct', type: 'string', tsType: 'string',
            visibility: 'editable', required: false, grid: true, form: true,
            displayFromCatalog: true },
          { name: 'plain', column: 'PlainCol', type: 'string', tsType: 'string',
            visibility: 'editable', required: false, grid: true, form: true },
        ],
        searchableFields: [],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generatePageComponent — F3 drawer + display emission (secondary-tab addLineFields)', () => {
  it('emits lookupDrawer for product in secondary-tab addLineFields entry', () => {
    const code = generatePageComponent('internalConsumption', null, secondaryTabContract);
    assert.ok(
      code.includes("lookupDrawer: 'internal-consumption-product'"),
      'expected lookupDrawer literal in secondary-tab addLineFields entry',
    );
  });

  it('emits lookupTitle for product in secondary-tab addLineFields entry', () => {
    const code = generatePageComponent('internalConsumption', null, secondaryTabContract);
    assert.ok(
      code.includes("lookupTitle: 'Product + Warehouse'"),
      'expected lookupTitle literal in secondary-tab addLineFields entry',
    );
  });

  it('emits onSelectMappings JSON for product in secondary-tab addLineFields entry', () => {
    const code = generatePageComponent('internalConsumption', null, secondaryTabContract);
    assert.ok(
      code.includes(`onSelectMappings: ${JSON.stringify(drawerOnSelect)}`),
      'expected onSelectMappings JSON in secondary-tab addLineFields entry',
    );
  });

  it('emits displayFromCatalog: true for displayedProduct in secondary-tab addLineFields entry', () => {
    const code = generatePageComponent('internalConsumption', null, secondaryTabContract);
    assert.ok(
      code.includes('displayFromCatalog: true'),
      'expected displayFromCatalog: true in secondary-tab addLineFields entry',
    );
  });

  it('omits all four keys for a plain field in secondary-tab addLineFields entry (negative)', () => {
    const code = generatePageComponent('internalConsumption', null, secondaryTabContract);
    // Extract just the plain-field entry chunk to assert keys are absent on it.
    const plainEntry = code.match(/\{\s*key:\s*'plain'[^}]*\}/);
    assert.ok(plainEntry, 'expected the plain entry to be emitted');
    assert.ok(!plainEntry[0].includes('lookupDrawer'), 'plain entry must not include lookupDrawer');
    assert.ok(!plainEntry[0].includes('lookupTitle'), 'plain entry must not include lookupTitle');
    assert.ok(!plainEntry[0].includes('onSelectMappings'), 'plain entry must not include onSelectMappings');
    assert.ok(!plainEntry[0].includes('displayFromCatalog'), 'plain entry must not include displayFromCatalog');
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — clearsField and labels in secondary-tab addLineFields
// ---------------------------------------------------------------------------

const clearsFieldTabContract = {
  frontendContract: {
    window: {
      id: '810',
      name: 'G/L Journal',
      primaryEntity: 'glJournal',
      category: 'accounting',
      secondaryTabs: {
        glJournalLine: {
          label: 'Lines',
          tabOrder: 1,
          addLineFields: ['debit', 'credit'],
        },
      },
    },
    entities: {
      glJournal: {
        fields: [
          { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string',
            visibility: 'readOnly', required: true, grid: true, form: true },
        ],
        searchableFields: ['documentNo'],
        computedFields: [],
      },
      glJournalLine: {
        fields: [
          { name: 'debit', column: 'AmtSourceDr', type: 'amount', tsType: 'number',
            visibility: 'editable', required: false, grid: true, form: true,
            clearsField: 'credit',
            labels: { zero: 'DR', positive: 'Debit' } },
          { name: 'credit', column: 'AmtSourceCr', type: 'amount', tsType: 'number',
            visibility: 'editable', required: false, grid: true, form: true,
            clearsField: 'debit' },
        ],
        searchableFields: [],
        computedFields: [],
      },
    },
  },
  backendContract: { processEndpoints: [] },
};

describe('generatePageComponent — clearsField and labels in secondary-tab addLineFields', () => {
  it('emits clearsField for a field that declares it', () => {
    const code = generatePageComponent('glJournal', null, clearsFieldTabContract);
    assert.ok(
      code.includes("clearsField: 'credit'"),
      `expected clearsField: 'credit' in addLineFields entry`,
    );
  });

  it('emits labels dict for a field that declares labels', () => {
    const code = generatePageComponent('glJournal', null, clearsFieldTabContract);
    assert.ok(
      code.includes('"zero":"DR"') || code.includes('"zero": "DR"'),
      `expected labels dict with zero key in addLineFields entry`,
    );
  });

  it('does NOT emit clearsField for a field that lacks it', () => {
    // Build a contract where only debit has clearsField — verify credit entry omits it
    const codeWithOneSide = (() => {
      const oneSide = JSON.parse(JSON.stringify(clearsFieldTabContract));
      oneSide.frontendContract.entities.glJournalLine.fields[1].clearsField = undefined;
      return generatePageComponent('glJournal', null, oneSide);
    })();
    const creditEntry = codeWithOneSide.match(/\{\s*key:\s*'credit'[^}]*\}/);
    assert.ok(creditEntry, 'expected credit entry to be emitted');
    assert.ok(!creditEntry[0].includes('clearsField'), 'credit entry must not include clearsField when not declared');
  });
});

describe('fragmentIf', () => {
  it('returns the string when the condition is truthy', () => {
    assert.equal(fragmentIf(true, ', required: true'), ', required: true');
  });

  it('returns an empty string when the condition is falsy', () => {
    assert.equal(fragmentIf(false, ', required: true'), '');
  });

  it('treats undefined and null conditions as falsy', () => {
    assert.equal(fragmentIf(undefined, ', toggle: true'), '');
    assert.equal(fragmentIf(null, ', toggle: true'), '');
  });

  it('treats 0 and empty string as falsy', () => {
    assert.equal(fragmentIf(0, ', min: 0'), '');
    assert.equal(fragmentIf('', ', label'), '');
  });

  it('accepts truthy non-boolean conditions (e.g. compound expressions)', () => {
    const f = { badge: true, cellType: undefined };
    assert.equal(fragmentIf(f.badge && !f.cellType, ', badge: true'), ', badge: true');
  });

  it('does not coerce the returned fragment — returns it verbatim', () => {
    assert.equal(fragmentIf(1, ', isSelectionColumn: true'), ', isSelectionColumn: true');
  });
});

describe('wrapIf', () => {
  it('wraps a truthy value between prefix and suffix', () => {
    assert.equal(wrapIf('\n  notesField="', 'comment', '"'), '\n  notesField="comment"');
  });

  it('returns an empty string when the value is falsy', () => {
    assert.equal(wrapIf('\n  notesField="', '', '"'), '');
    assert.equal(wrapIf('\n  notesField="', null, '"'), '');
    assert.equal(wrapIf('\n  notesField="', undefined, '"'), '');
    assert.equal(wrapIf(', precision: ', 0), '');
  });

  it('defaults the suffix to an empty string', () => {
    assert.equal(wrapIf(', precision: ', 4), ', precision: 4');
    assert.equal(wrapIf(', lineConfig={', 'INVOICE_LINE_CONFIG', '}'), ', lineConfig={INVOICE_LINE_CONFIG}');
  });

  it('injects the value verbatim — no serialization', () => {
    assert.equal(wrapIf('={', 'rawExpr', '}'), '={rawExpr}');
  });

  it('gates on an explicit cond while still injecting value (emits falsy values)', () => {
    // detailTabIndex={0} must be emitted even though 0 is falsy
    assert.equal(wrapIf('={', 0, '}', 0 != null), '={0}');
    assert.equal(wrapIf('={', false, '}', false !== undefined), '={false}');
  });

  it('suppresses output when an explicit cond is falsy, regardless of value', () => {
    assert.equal(wrapIf('="', 'classic', '"', false), '');
  });
});

describe('jsonWrapIf', () => {
  it('serializes a truthy value with JSON.stringify between prefix and suffix', () => {
    assert.equal(
      jsonWrapIf('\n  listViewOptions={', { density: 'compact' }, '}'),
      '\n  listViewOptions={{"density":"compact"}}'
    );
  });

  it('serializes arrays', () => {
    assert.equal(jsonWrapIf('={', ['a', 'b'], '}'), '={["a","b"]}');
  });

  it('returns an empty string when the value is falsy', () => {
    assert.equal(jsonWrapIf('={', null, '}'), '');
    assert.equal(jsonWrapIf('={', undefined, '}'), '');
  });

  it('treats an empty array as truthy (matches the original ternary semantics)', () => {
    assert.equal(jsonWrapIf('={', [], '}'), '={[]}');
  });

  it('gates on an explicit cond — empty array suppressed via length check', () => {
    assert.equal(jsonWrapIf('={', [], '}', [].length > 0), '');
    assert.equal(jsonWrapIf('={', ['a'], '}', ['a'].length > 0), '={["a"]}');
  });
});

describe('pick', () => {
  it('returns the first value when cond is truthy', () => {
    assert.equal(pick(true, '#10b981', '#f59e0b'), '#10b981');
    assert.equal(pick('confirm', 'draftModeWithConfirm', 'draftMode'), 'draftModeWithConfirm');
  });

  it('returns the second value when cond is falsy', () => {
    assert.equal(pick(false, '#10b981', '#f59e0b'), '#f59e0b');
    assert.equal(pick(null, 'draftModeWithConfirm', 'draftMode'), 'draftMode');
    assert.equal(pick(undefined, '({ data, status })', '({ status })'), '({ status })');
  });
});

// ---------------------------------------------------------------------------
// buildHeaderLogicMaps
// ---------------------------------------------------------------------------

describe('buildHeaderLogicMaps', () => {
  it('maps column to name for fields that have both column and name', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: {
            fields: [
              { name: 'documentNo', column: 'DocumentNo', type: 'string' },
              { name: 'grandTotal', column: 'GrandTotal', type: 'amount' },
            ],
          },
        },
      },
    };
    const { headerColumnMap } = buildHeaderLogicMaps(contract, 'header');
    assert.deepEqual(headerColumnMap, { DocumentNo: 'documentNo', GrandTotal: 'grandTotal' });
  });

  it('skips fields missing column or missing name', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: {
            fields: [
              { name: 'documentNo', column: 'DocumentNo', type: 'string' },
              { name: 'noColumn', type: 'string' },
              { column: 'NoName', type: 'string' },
            ],
          },
        },
      },
    };
    const { headerColumnMap } = buildHeaderLogicMaps(contract, 'header');
    assert.deepEqual(headerColumnMap, { DocumentNo: 'documentNo' });
    assert.ok(!('NoName' in headerColumnMap), 'field without name should be skipped');
  });

  it('collects boolean fields when tsType is boolean or type is boolean', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: {
            fields: [
              { name: 'isActive', column: 'IsActive', tsType: 'boolean' },
              { name: 'processed', column: 'Processed', type: 'boolean' },
            ],
          },
        },
      },
    };
    const { headerBooleanFields } = buildHeaderLogicMaps(contract, 'header');
    assert.ok(headerBooleanFields.includes('isActive'), 'tsType boolean should be collected');
    assert.ok(headerBooleanFields.includes('processed'), 'type boolean should be collected');
  });

  it('does not collect non-boolean fields into headerBooleanFields', () => {
    const contract = {
      frontendContract: {
        entities: {
          header: {
            fields: [
              { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string' },
              { name: 'grandTotal', column: 'GrandTotal', type: 'amount', tsType: 'number' },
            ],
          },
        },
      },
    };
    const { headerBooleanFields } = buildHeaderLogicMaps(contract, 'header');
    assert.deepEqual(headerBooleanFields, []);
  });

  it('returns empty maps without throwing when the entity is absent', () => {
    const contract = { frontendContract: { entities: {} } };
    const result = buildHeaderLogicMaps(contract, 'header');
    assert.deepEqual(result, { headerColumnMap: {}, headerBooleanFields: [] });
  });

  it('returns empty maps when the entity exists but has no fields array', () => {
    const contract = { frontendContract: { entities: { header: {} } } };
    const result = buildHeaderLogicMaps(contract, 'header');
    assert.deepEqual(result, { headerColumnMap: {}, headerBooleanFields: [] });
  });
});

// ---------------------------------------------------------------------------
// generateTableComponent — gridReadOnly
// ---------------------------------------------------------------------------

describe('generateTableComponent — gridReadOnly', () => {
  const gridReadOnlyContract = {
    frontendContract: {
      window: { id: '900', name: 'Return To Vendor', primaryEntity: 'shipment', category: 'purchasing' },
      entities: {
        shipment: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string',
              visibility: 'readOnly', required: true, grid: true, form: true },
            { name: 'quantity', column: 'Qty', type: 'number', tsType: 'number',
              visibility: 'editable', required: true, grid: true, form: true,
              gridReadOnly: true },
            { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string',
              visibility: 'editable', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('emits readOnly: true in column definition when field has gridReadOnly: true', () => {
    const code = generateTableComponent('shipment', gridReadOnlyContract);
    assert.ok(
      code.includes(", readOnly: true"),
      'column with gridReadOnly should have readOnly: true'
    );
  });

  it('does NOT emit readOnly: true for fields without gridReadOnly', () => {
    const code = generateTableComponent('shipment', gridReadOnlyContract);
    // Only the quantity field has gridReadOnly — verify that the count of
    // readOnly: true occurrences matches exactly one field
    const matches = code.match(/, readOnly: true/g) ?? [];
    assert.equal(matches.length, 1, 'exactly one column should have readOnly: true');
  });

  it('gridReadOnly field still appears as a column in the table', () => {
    const code = generateTableComponent('shipment', gridReadOnlyContract);
    assert.ok(code.includes("key: 'quantity'"), 'gridReadOnly field should still be present as a column');
  });

  it('field without gridReadOnly does NOT get readOnly: true in its column entry', () => {
    // product column should not contain readOnly
    const code = generateTableComponent('shipment', gridReadOnlyContract);
    const lines = code.split('\n');
    const productLine = lines.find(l => l.includes("key: 'product'"));
    assert.ok(productLine, 'product column should exist');
    assert.ok(!productLine.includes('readOnly: true'), 'product column should not have readOnly: true');
  });
});

// ---------------------------------------------------------------------------
// buildEntryFieldLine — skipDefault (HandleDefaults opt-out)
// ---------------------------------------------------------------------------
// A line field flagged skipDefault must surface in the add-row entry literal so
// DataTable can skip applying a backend-resolved default to it.
describe('buildEntryFieldLine — skipDefault', () => {
  const skipDefaultContract = {
    frontendContract: {
      window: { id: '900', name: 'GL Journal', primaryEntity: 'header', category: 'finance' },
      entities: {
        header: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
        line: {
          fields: [
            { name: 'account', column: 'Account_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'Account', inputMode: 'selector' },
            { name: 'note', column: 'Note', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true, skipDefault: true },
          ],
          searchableFields: ['account'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('emits skipDefault in the add-row entry literal for a flagged field', () => {
    const code = generatePageComponent('header', 'line', skipDefaultContract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    assert.ok(entryMatch, 'addLineFields.entry array present');
    assert.match(entryMatch[1], /key: 'note'[^}]*skipDefault: true/);
  });

  it('does not emit skipDefault for an unflagged field', () => {
    const code = generatePageComponent('header', 'line', skipDefaultContract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    assert.ok(entryMatch);
    const accountLine = entryMatch[1].split('\n').find(l => l.includes("key: 'account'"));
    assert.ok(accountLine, 'account entry present');
    assert.ok(!accountLine.includes('skipDefault'), 'account must not carry skipDefault');
  });
});

// ---------------------------------------------------------------------------
// ETP-4277 — max constraint in generated column and entry field literals
// ---------------------------------------------------------------------------
describe('generateTableComponent — max column prop (ETP-4277)', () => {
  const maxContract = {
    frontendContract: {
      window: { id: '901', name: 'Sales Order', primaryEntity: 'header', category: 'sales' },
      entities: {
        header: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string',
              visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
        line: {
          fields: [
            { name: 'discount', column: 'Discount', type: 'number', tsType: 'number',
              visibility: 'editable', required: false, grid: true, form: true, max: 100 },
            { name: 'quantity', column: 'QtyOrdered', type: 'number', tsType: 'number',
              visibility: 'editable', required: false, grid: true, form: true },
          ],
          searchableFields: [],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('emits max: 100 in the column entry for a field with max declared', () => {
    const code = generateTableComponent('line', maxContract);
    const lines = code.split('\n');
    const discountLine = lines.find(l => l.includes("key: 'discount'"));
    assert.ok(discountLine, 'discount column should exist');
    assert.ok(discountLine.includes(', max: 100'), 'discount column must include max: 100');
  });

  it('does not emit max in the column entry for a field without max', () => {
    const code = generateTableComponent('line', maxContract);
    const lines = code.split('\n');
    const qtyLine = lines.find(l => l.includes("key: 'quantity'"));
    assert.ok(qtyLine, 'quantity column should exist');
    assert.ok(!qtyLine.includes(', max:'), 'quantity column must not include max');
  });
});

describe('generatePageComponent — max entry prop (ETP-4277)', () => {
  const maxPageContract = {
    frontendContract: {
      window: { id: '902', name: 'Sales Order', primaryEntity: 'header', category: 'sales' },
      entities: {
        header: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string',
              visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
        line: {
          fields: [
            { name: 'discount', column: 'Discount', type: 'number', tsType: 'number',
              visibility: 'editable', required: false, grid: true, form: true, max: 100 },
            { name: 'quantity', column: 'QtyOrdered', type: 'number', tsType: 'number',
              visibility: 'editable', required: true, grid: true, form: true },
          ],
          searchableFields: [],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };

  it('emits max: 100 in the addLineFields entry literal for a field with max declared', () => {
    const code = generatePageComponent('header', 'line', maxPageContract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    assert.ok(entryMatch, 'addLineFields.entry array present');
    assert.match(entryMatch[1], /key: 'discount'[^}]*, max: 100/);
  });

  it('does not emit max in the addLineFields entry literal for a field without max', () => {
    const code = generatePageComponent('header', 'line', maxPageContract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    assert.ok(entryMatch, 'addLineFields.entry array present');
    const qtyLine = entryMatch[1].split('\n').find(l => l.includes("key: 'quantity'"));
    assert.ok(qtyLine, 'quantity entry present');
    assert.ok(!qtyLine.includes(', max:'), 'quantity entry must not include max');
  });
});
