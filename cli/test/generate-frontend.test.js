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
    assert.ok(code.includes("import { DataTable } from '@/components/contract-ui'"));
  });

  it('exports a named component with PascalCase entity name + Table', () => {
    const code = generateTableComponent('order', masterDetailContract);
    assert.ok(code.includes('export default function OrderTable'));
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

  it('imports header Table, Form, detail Table, and mockCatalogs', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes("import OrderTable from './OrderTable'"));
    assert.ok(code.includes("import OrderForm from './OrderForm'"));
    assert.ok(code.includes("import OrderLineTable from './OrderLineTable'"));
    assert.ok(code.includes("import catalogs from './mockCatalogs'"));
  });

  it('does NOT import DetailForm (only DetailTable)', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('OrderLineForm'));
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
    // product and quantity are entry; tax matches auto-pattern so goes to derived
    // lineNetAmount is readOnly so excluded from addLineFields entirely
    const entryMatch = code.match(/entry: \[([\s\S]*?)\]/);
    assert.ok(entryMatch);
    assert.ok(entryMatch[1].includes("key: 'product'"));
    assert.ok(entryMatch[1].includes("key: 'quantity'"));
    // tax matches /tax/ auto-pattern, so it goes to derived not entry
    assert.ok(!entryMatch[1].includes("key: 'tax'"), 'tax should be in derived, not entry');
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

  it('passes config props to DetailView and ListView branches', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // DetailView branch
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
    // ListView branch
    assert.ok(code.includes('Table={OrderTable}'));
    assert.ok(code.includes('windowName={windowName}'));
    assert.ok(code.includes('recordId={recordId}'));
  });

  it('passes entityLabel and detailLabel props', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('entityLabel="Order"'));
    assert.ok(code.includes('detailLabel="Order Line"'));
  });

  it('does NOT contain inline CSS or state hooks', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    assert.ok(!code.includes('useState'));
    assert.ok(!code.includes('fetch('));
    assert.ok(!code.includes('w-2/5'));
    assert.ok(!code.includes('animate-pulse'));
    assert.ok(!code.includes('shadow-sm'));
  });
});

// ---------------------------------------------------------------------------
// generateIndexComponent
// ---------------------------------------------------------------------------

describe('generateIndexComponent', () => {
  it('generates entry point with token, apiBaseUrl, window, windowName, recordId props for master-detail', () => {
    const code = generateIndexComponent('order', 'orderLine', masterDetailContract);
    assert.ok(code.includes('token'));
    assert.ok(code.includes('apiBaseUrl'));
    assert.ok(code.includes('window'));
    assert.ok(code.includes('windowName'));
    assert.ok(code.includes('recordId'));
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

  it('generates ListView/DetailView pattern for single-entity (no detail)', () => {
    const code = generateIndexComponent('item', null, singleEntityContract);
    assert.ok(code.includes("import { ListView, DetailView } from '@/components/contract-ui'"));
    assert.ok(code.includes("import ItemTable from './ItemTable'"));
    assert.ok(code.includes("import ItemForm from './ItemForm'"));
    assert.ok(code.includes("import catalogs from './mockCatalogs'"));
    assert.ok(code.includes('<ListView'));
    assert.ok(code.includes('<DetailView'));
  });

  it('passes correct props to ListView and DetailView branches', () => {
    const code = generateIndexComponent('item', null, singleEntityContract);
    assert.ok(code.includes('entity="item"'));
    assert.ok(code.includes('Table={ItemTable}'));
    assert.ok(code.includes('Form={ItemForm}'));
    assert.ok(code.includes('catalogs={catalogs}'));
    assert.ok(code.includes('entityLabel="Item"'));
    assert.ok(code.includes('{...props}'));
    assert.ok(code.includes('windowName={windowName}'));
    assert.ok(code.includes('recordId={recordId}'));
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
  it('generates catalog entries for all FK references in the contract', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes("catalogs['BusinessPartner']"));
    assert.ok(code.includes("catalogs['Warehouse']"));
    assert.ok(code.includes("catalogs['PriceList']"));
    assert.ok(code.includes("catalogs['Product']"));
    assert.ok(code.includes("catalogs['Tax']"));
    assert.ok(code.includes("catalogs['BusinessPartnerLocation']"));
  });

  it('exports catalogs as default export', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('export default catalogs'));
  });

  it('starts with auto-generated comment', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.startsWith('// Auto-generated mock catalogs'));
  });

  it('catalog data contains id and name fields', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('"id"'));
    assert.ok(code.includes('"name"'));
  });

  it('BusinessPartner data has bp- prefix ids', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('"bp-'));
    assert.ok(code.includes('Acme Corp'));
  });

  it('BusinessPartnerLocation data has businessPartnerId for dependent filtering', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('"businessPartnerId"'));
  });

  it('Tax data has rate property', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('"rate"'));
  });

  it('Product data has price and uomId', () => {
    const code = generateMockCatalogs(masterDetailContract);
    assert.ok(code.includes('"price"'));
    assert.ok(code.includes('"uomId"'));
  });

  it('handles contract with no FK references', () => {
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
    const code = generateMockCatalogs(noFkContract);
    assert.ok(code.includes('const catalogs = {}'));
    assert.ok(code.includes('export default catalogs'));
    // Should not contain any catalog assignments
    assert.ok(!code.includes("catalogs['"));
  });

  it('skips references not found in CATALOG_DATA', () => {
    const unknownRefContract = {
      frontendContract: {
        window: { id: '1', name: 'Test', primaryEntity: 'test', category: 'test' },
        entities: {
          test: {
            fields: [{ name: 'custom', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: false, grid: true, form: true, reference: 'UnknownEntity', inputMode: 'search' }],
            searchableFields: [],
            computedFields: [],
          },
        },
      },
      backendContract: { processEndpoints: [] },
    };
    const code = generateMockCatalogs(unknownRefContract);
    assert.ok(!code.includes("catalogs['UnknownEntity']"));
    assert.ok(code.includes('export default catalogs'));
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
    assert.ok(!names.includes('ItemPage.jsx'), 'should NOT produce Page for single entity');
    assert.equal(names.length, 4);
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
  it('puts price/tax/discount/amount pattern fields in derived array', () => {
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

    // product is in entry
    assert.ok(entryMatch[1].includes("key: 'product'"));
    // price/discount/amount fields are in derived
    assert.ok(derivedMatch[1].includes("key: 'unitPrice'"));
    assert.ok(derivedMatch[1].includes("key: 'discount'"));
    assert.ok(derivedMatch[1].includes("key: 'netAmount'"));
  });

  it('excludes readOnly detail fields from addLineFields entirely', () => {
    const code = generatePageComponent('order', 'orderLine', masterDetailContract);
    // lineNetAmount is readOnly, should not appear in addLineFields
    const addLineMatch = code.match(/const addLineFields = \{([\s\S]*?)\};/);
    assert.ok(addLineMatch);
    assert.ok(!addLineMatch[1].includes("key: 'lineNetAmount'"));
  });
});
