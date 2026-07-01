import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateTemplate } from '../src/generate-report-template.js';

describe('generate-report-template', () => {
  const listingContract = {
    reportId: 'R001',
    type: 'listing',
    title: { en_US: 'Test Report' },
    columns: [
      { field: 'documentNo', label: { en_US: 'Document No' }, type: 'string', width: '25%' },
      { field: 'amount', label: { en_US: 'Amount' }, type: 'amount', width: '15%' },
      { field: 'orderDate', label: { en_US: 'Date' }, type: 'date' },
      { field: 'qty', label: { en_US: 'Quantity' }, type: 'number' },
      { field: 'isActive', label: { en_US: 'Active' }, type: 'boolean' },
    ],
  };

  const groupedContract = {
    reportId: 'R002',
    type: 'grouped-listing',
    title: { en_US: 'Grouped Report' },
    columns: [
      { field: 'documentNo', label: { en_US: 'Document No' }, type: 'string' },
      { field: 'lineTotal', label: { en_US: 'Total' }, type: 'amount' },
    ],
    groups: [
      { field: 'businessPartner', label: { en_US: 'Business Partner' } },
      { field: 'warehouse', label: { en_US: 'Warehouse' } },
    ],
  };

  describe('listing template', () => {
    it('returns template and helpers', () => {
      const result = generateTemplate(listingContract);
      assert.ok(result.template, 'should have template');
      assert.ok(result.helpers, 'should have helpers');
    });

    it('includes report ID in comment', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('R001'));
    });

    it('generates column headers', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('Document No'));
      assert.ok(template.includes('Amount'));
      assert.ok(template.includes('Date'));
    });

    it('uses formatCurrency for amount columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('formatCurrency'));
    });

    it('uses formatDate for date columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('formatDate'));
    });

    it('uses formatNumber for number columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('formatNumber'));
    });

    it('uses formatBoolean for boolean columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('formatBoolean'));
    });

    it('applies cell-amount class to amount columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('cell-amount'));
    });

    it('applies cell-boolean class to boolean columns', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('cell-boolean'));
    });

    it('includes column widths', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('width: 25%'));
      assert.ok(template.includes('width: 15%'));
    });

    it('defaults width to auto when not specified', () => {
      const { template } = generateTemplate(listingContract);
      assert.ok(template.includes('width: auto'));
    });
  });

  describe('grouped template', () => {
    it('generates group headers', () => {
      const { template } = generateTemplate(groupedContract);
      assert.ok(template.includes('isGroupBreak'));
      assert.ok(template.includes('Business Partner'));
      assert.ok(template.includes('Warehouse'));
    });

    it('includes group level classes', () => {
      const { template } = generateTemplate(groupedContract);
      assert.ok(template.includes('group-level-0'));
      assert.ok(template.includes('group-level-1'));
    });

    it('includes group header styling', () => {
      const { template } = generateTemplate(groupedContract);
      assert.ok(template.includes('group-header'));
    });
  });

  describe('helpers code', () => {
    it('includes isGroupBreak function', () => {
      const { helpers } = generateTemplate(groupedContract);
      assert.ok(helpers.includes('function isGroupBreak'));
    });

    it('includes format functions', () => {
      const { helpers } = generateTemplate(listingContract);
      assert.ok(helpers.includes('function formatDate'));
      assert.ok(helpers.includes('function formatCurrency'));
      assert.ok(helpers.includes('function formatBoolean'));
      assert.ok(helpers.includes('function formatNumber'));
    });

    it('includes ifCond helper', () => {
      const { helpers } = generateTemplate(listingContract);
      assert.ok(helpers.includes('function ifCond'));
    });
  });

  describe('empty columns', () => {
    it('handles contract with no columns', () => {
      const { template } = generateTemplate({ reportId: 'empty', type: 'listing', columns: [] });
      assert.ok(template.includes('report-table'));
    });
  });

  describe('contract enrichment', () => {
    it('enriches grouped contract with _groupHeaderFields from _allFields', () => {
      const contract = {
        ...groupedContract,
        _allFields: [
          { name: 'documentNo', type: 'string' },
          { name: 'lineTotal', type: 'amount' },
          { name: 'businessPartner', type: 'string' },
          { name: 'warehouse', type: 'string' },
          { name: 'address', type: 'string' },  // extra field → header candidate
        ],
      };
      // generateTemplate mutates the contract to add _groupHeaderFields
      generateTemplate(contract);
      assert.ok(contract._groupHeaderFields, 'should add _groupHeaderFields');
      const warehouseHeaders = contract._groupHeaderFields['warehouse'];
      assert.ok(warehouseHeaders, 'header fields should be attached to last group');
      assert.ok(warehouseHeaders.some(h => h.field === 'address'));
    });
  });
});
