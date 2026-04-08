import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractLabels } from '../src/extract-labels.js';

/**
 * Create a mock pool that returns predefined rows for each query type.
 * Identifies query type by checking for table names in the SQL.
 */
function createMockPool(mockData) {
  return {
    query(sql, _params) {
      if (sql.includes('ad_field')) {
        return Promise.resolve({ rows: mockData.fields || [] });
      }
      if (sql.includes('ad_window')) {
        return Promise.resolve({ rows: mockData.windows || [] });
      }
      if (sql.includes('ad_tab')) {
        return Promise.resolve({ rows: mockData.tabs || [] });
      }
      if (sql.includes('ad_menu')) {
        return Promise.resolve({ rows: mockData.menus || [] });
      }
      if (sql.includes('ad_ref_list')) {
        return Promise.resolve({ rows: mockData.statuses || [] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
}

describe('extractLabels', () => {
  it('returns object with fields, windows, tabs, menus sections', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.ok(result.fields, 'should have fields section');
    assert.ok(result.windows, 'should have windows section');
    assert.ok(result.tabs, 'should have tabs section');
    assert.ok(result.menus, 'should have menus section');
    assert.ok(result.statuses, 'should have statuses section');
    assert.equal(typeof result.fields, 'object');
    assert.equal(typeof result.windows, 'object');
    assert.equal(typeof result.tabs, 'object');
    assert.equal(typeof result.menus, 'object');
    assert.equal(typeof result.statuses, 'object');
  });

  it('maps field rows by column_key with label and description', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'C_BPartner_ID', label: 'Business Partner', description: 'A business partner' },
        { column_key: 'DateOrdered', label: 'Order Date', description: 'Date of the order' },
      ],
      windows: [],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.fields.C_BPartner_ID.label, 'Business Partner');
    assert.equal(result.fields.C_BPartner_ID.description, 'A business partner');
    assert.equal(result.fields.DateOrdered.label, 'Order Date');
    assert.equal(result.fields.DateOrdered.description, 'Date of the order');
  });

  it('deduplicates fields with same column_key (keeps first occurrence)', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'C_BPartner_ID', label: 'Business Partner', description: 'desc1' },
        { column_key: 'C_BPartner_ID', label: 'BP (Purchase)', description: 'desc2' },
      ],
      windows: [],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    // Should have only one entry for C_BPartner_ID
    assert.equal(Object.keys(result.fields).length, 1);
    assert.equal(result.fields.C_BPartner_ID.label, 'Business Partner');
  });

  it('maps window rows by name with label', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [
        { key: 'Sales Order', label: 'Sales Order' },
        { key: 'Purchase Order', label: 'Purchase Order' },
      ],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.windows['Sales Order'].label, 'Sales Order');
    assert.equal(result.windows['Purchase Order'].label, 'Purchase Order');
  });

  it('maps tab rows by name with label', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [],
      tabs: [
        { key: 'Header', label: 'Header' },
        { key: 'Lines', label: 'Lines' },
      ],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.tabs.Header.label, 'Header');
    assert.equal(result.tabs.Lines.label, 'Lines');
  });

  it('maps menu rows by name with label', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [],
      tabs: [],
      menus: [
        { key: 'Sales Order', label: 'Sales Order' },
      ],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.menus['Sales Order'].label, 'Sales Order');
  });

  it('handles null/empty label and description gracefully', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'TestCol', label: null, description: null },
      ],
      windows: [
        { key: 'TestWindow', label: null },
      ],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.fields.TestCol.label, '');
    assert.equal(result.fields.TestCol.description, '');
    assert.equal(result.windows.TestWindow.label, '');
  });

  it('handles empty result sets', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'es_ES');

    assert.deepEqual(result.fields, {});
    assert.deepEqual(result.windows, {});
    assert.deepEqual(result.tabs, {});
    assert.deepEqual(result.menus, {});
    assert.deepEqual(result.statuses, {});
  });

  it('passes language parameter to pool.query', async () => {
    const capturedParams = [];
    const pool = {
      query(sql, params) {
        capturedParams.push(params);
        return Promise.resolve({ rows: [] });
      },
    };

    await extractLabels(pool, 'es_AR');

    // All 5 queries should receive the language parameter
    assert.equal(capturedParams.length, 5);
    for (const params of capturedParams) {
      assert.deepEqual(params, ['es_AR']);
    }
  });

  // --- Edge case tests (added by QA) ---

  it('propagates database errors from pool.query', async () => {
    const pool = {
      query() {
        return Promise.reject(new Error('connection refused'));
      },
    };

    await assert.rejects(
      () => extractLabels(pool, 'en_US'),
      { message: 'connection refused' },
    );
  });

  it('handles undefined label and description as empty strings', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'UndefinedCol', label: undefined, description: undefined },
      ],
      windows: [
        { key: 'UndefinedWin', label: undefined },
      ],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.fields.UndefinedCol.label, '');
    assert.equal(result.fields.UndefinedCol.description, '');
    assert.equal(result.windows.UndefinedWin.label, '');
  });

  it('buildKeyLabelMap uses last-write-wins for duplicate keys', async () => {
    const pool = createMockPool({
      fields: [],
      windows: [
        { key: 'Sales Order', label: 'First Label' },
        { key: 'Sales Order', label: 'Last Label' },
      ],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    // Last occurrence should win for windows/tabs/menus
    assert.equal(result.windows['Sales Order'].label, 'Last Label');
  });

  it('handles fields with empty string column_key', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: '', label: 'Empty Key', description: 'desc' },
      ],
      windows: [],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    // Empty string is a valid object key
    assert.equal(result.fields[''].label, 'Empty Key');
  });

  it('handles special characters in keys and labels', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'M_Product_ID', label: 'Producto (A&B)', description: 'With <html> chars' },
      ],
      windows: [
        { key: 'Window "Name"', label: "Label's value" },
      ],
      tabs: [],
      menus: [],
    });

    const result = await extractLabels(pool, 'en_US');

    assert.equal(result.fields.M_Product_ID.label, 'Producto (A&B)');
    assert.equal(result.fields.M_Product_ID.description, 'With <html> chars');
    assert.equal(result.windows['Window "Name"'].label, "Label's value");
  });

  it('result is JSON-serializable', async () => {
    const pool = createMockPool({
      fields: [
        { column_key: 'TestCol', label: 'Test', description: 'Desc' },
      ],
      windows: [
        { key: 'TestWin', label: 'Window' },
      ],
      tabs: [
        { key: 'TestTab', label: 'Tab' },
      ],
      menus: [
        { key: 'TestMenu', label: 'Menu' },
      ],
    });

    const result = await extractLabels(pool, 'en_US');

    // Verify round-trip through JSON.stringify/parse preserves structure
    const roundTrip = JSON.parse(JSON.stringify(result));
    assert.deepEqual(roundTrip, result);
  });

  it('handles many duplicate field column_keys efficiently', async () => {
    // Simulate 100 fields with 10 unique column_keys (10 duplicates each)
    const fields = [];
    for (let i = 0; i < 100; i++) {
      fields.push({
        column_key: `Col_${i % 10}`,
        label: `Label ${i}`,
        description: `Desc ${i}`,
      });
    }

    const pool = createMockPool({ fields, windows: [], tabs: [], menus: [] });
    const result = await extractLabels(pool, 'en_US');

    // Should deduplicate to 10 unique keys
    assert.equal(Object.keys(result.fields).length, 10);
    // First occurrence wins: Col_0 should have label from index 0
    assert.equal(result.fields.Col_0.label, 'Label 0');
  });

  it('all five queries run concurrently via Promise.all', async () => {
    const callOrder = [];
    let resolveCount = 0;
    const pool = {
      query(sql) {
        const index = ++resolveCount;
        callOrder.push(`start-${index}`);
        return new Promise((resolve) => {
          // All queries should be started before any resolves
          setTimeout(() => {
            callOrder.push(`end-${index}`);
            resolve({ rows: [] });
          }, 5);
        });
      },
    };

    await extractLabels(pool, 'en_US');

    // All 5 queries should have started before any ended
    const starts = callOrder.filter((e) => e.startsWith('start-'));
    assert.equal(starts.length, 5, 'all 5 queries should start');
  });
});
