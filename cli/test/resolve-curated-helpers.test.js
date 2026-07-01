import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  autoSimplifyEntityName,
  WINDOW_KEY_ORDER,
  reorderKeys,
  resolveCurated,
} from '../src/resolve-curated.js';

// ---------------------------------------------------------------------------
// autoSimplifyEntityName
// ---------------------------------------------------------------------------

describe('autoSimplifyEntityName', () => {
  it('strips "c" prefix from cOrder → order', () => {
    assert.equal(autoSimplifyEntityName('cOrder'), 'order');
  });

  it('strips "c" prefix from cOrderLine → orderLine', () => {
    assert.equal(autoSimplifyEntityName('cOrderLine'), 'orderLine');
  });

  it('strips "m" prefix from mProduct → product', () => {
    assert.equal(autoSimplifyEntityName('mProduct'), 'product');
  });

  it('strips "ad" prefix from adUser → user', () => {
    assert.equal(autoSimplifyEntityName('adUser'), 'user');
  });

  it('does not strip prefixes that are not c/m/ad', () => {
    assert.equal(autoSimplifyEntityName('finPayment'), 'finPayment');
  });

  it('does not strip when prefix is not followed by uppercase', () => {
    assert.equal(autoSimplifyEntityName('calendar'), 'calendar');
  });

  it('returns null for null input', () => {
    assert.equal(autoSimplifyEntityName(null), null);
  });

  it('returns undefined for undefined input', () => {
    assert.equal(autoSimplifyEntityName(undefined), undefined);
  });

  it('returns empty string for empty string', () => {
    assert.equal(autoSimplifyEntityName(''), '');
  });

  it('converts slash-separated names to camelCase', () => {
    assert.equal(autoSimplifyEntityName('vendor/creditor'), 'vendorCreditor');
  });

  it('converts multi-slash names to camelCase', () => {
    assert.equal(autoSimplifyEntityName('a/b/c'), 'aBC');
  });

  it('strips prefix after slash conversion if result matches pattern', () => {
    // c + Something after slash conversion
    assert.equal(autoSimplifyEntityName('cOrder'), 'order');
  });

  it('handles single character after prefix', () => {
    assert.equal(autoSimplifyEntityName('cX'), 'x');
  });

  it('leaves names without matching prefix unchanged', () => {
    assert.equal(autoSimplifyEntityName('salesOrder'), 'salesOrder');
  });

  it('handles name that is just the prefix letters (no uppercase follows)', () => {
    assert.equal(autoSimplifyEntityName('mad'), 'mad');
  });
});

// ---------------------------------------------------------------------------
// WINDOW_KEY_ORDER
// ---------------------------------------------------------------------------

describe('WINDOW_KEY_ORDER', () => {
  it('is a non-empty array of strings', () => {
    assert.ok(Array.isArray(WINDOW_KEY_ORDER));
    assert.ok(WINDOW_KEY_ORDER.length > 0);
    for (const key of WINDOW_KEY_ORDER) {
      assert.equal(typeof key, 'string');
    }
  });

  it('starts with id and name', () => {
    assert.equal(WINDOW_KEY_ORDER[0], 'id');
    assert.equal(WINDOW_KEY_ORDER[1], 'name');
  });

  it('includes primaryEntity', () => {
    assert.ok(WINDOW_KEY_ORDER.includes('primaryEntity'));
  });

  it('includes category', () => {
    assert.ok(WINDOW_KEY_ORDER.includes('category'));
  });

  it('has no duplicate entries', () => {
    const unique = new Set(WINDOW_KEY_ORDER);
    assert.equal(unique.size, WINDOW_KEY_ORDER.length);
  });
});

// ---------------------------------------------------------------------------
// reorderKeys
// ---------------------------------------------------------------------------

describe('reorderKeys', () => {
  it('reorders keys according to canonical order', () => {
    const obj = { z: 3, a: 1, m: 2 };
    const result = reorderKeys(obj, ['a', 'm', 'z']);
    assert.deepEqual(Object.keys(result), ['a', 'm', 'z']);
    assert.deepEqual(result, { a: 1, m: 2, z: 3 });
  });

  it('puts canonical keys first, leftover sorted alphabetically', () => {
    const obj = { z: 4, name: 'test', id: '1', extra: 'x' };
    const result = reorderKeys(obj, ['id', 'name']);
    const keys = Object.keys(result);
    assert.equal(keys[0], 'id');
    assert.equal(keys[1], 'name');
    // leftover: extra, z (alphabetical)
    assert.equal(keys[2], 'extra');
    assert.equal(keys[3], 'z');
  });

  it('handles empty canonical order (all keys are leftover)', () => {
    const obj = { b: 2, a: 1 };
    const result = reorderKeys(obj, []);
    assert.deepEqual(Object.keys(result), ['a', 'b']);
  });

  it('handles empty object', () => {
    const result = reorderKeys({}, ['a', 'b']);
    assert.deepEqual(result, {});
  });

  it('ignores canonical keys not present in obj', () => {
    const obj = { name: 'x' };
    const result = reorderKeys(obj, ['id', 'name', 'missing']);
    assert.deepEqual(Object.keys(result), ['name']);
  });

  it('preserves all values through reordering', () => {
    const obj = { c: [1, 2], b: { nested: true }, a: null };
    const result = reorderKeys(obj, ['a', 'b', 'c']);
    assert.deepEqual(result.a, null);
    assert.deepEqual(result.b, { nested: true });
    assert.deepEqual(result.c, [1, 2]);
  });

  it('handles object with only canonical keys', () => {
    const obj = { id: '1', name: 'Test' };
    const result = reorderKeys(obj, ['id', 'name']);
    assert.deepEqual(Object.keys(result), ['id', 'name']);
  });

  it('handles object with only non-canonical keys', () => {
    const obj = { zebra: 1, apple: 2 };
    const result = reorderKeys(obj, ['id', 'name']);
    assert.deepEqual(Object.keys(result), ['apple', 'zebra']);
  });

  it('handles duplicate keys in canonical order gracefully', () => {
    const obj = { a: 1, b: 2 };
    const result = reorderKeys(obj, ['a', 'a', 'b']);
    assert.deepEqual(Object.keys(result), ['a', 'b']);
    assert.deepEqual(result, { a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// resolveCurated — integration tests
// ---------------------------------------------------------------------------

describe('resolveCurated', () => {
  const minimalSchema = {
    window: { id: 'W1', name: 'Test Window' },
    entities: [{
      name: 'header',
      tableName: 'C_Order',
      tabId: 'T1',
      tabName: 'Header',
      fields: [
        { name: 'name', columnName: 'Name', label: 'Name', type: 'string', visibility: 'editable', mandatory: true },
        { name: 'status', columnName: 'Status', label: 'Status', type: 'string', visibility: 'readOnly' },
        { name: 'created', columnName: 'Created', label: 'Created', type: 'date', visibility: 'system' },
      ],
    }],
  };
  const minimalRules = { rules: [] };
  const minimalDecisions = { _version: 3, entities: {}, rules: {}, window: {} };

  it('resolves minimal schema with empty decisions', async () => {
    const result = await resolveCurated(minimalSchema, minimalRules, minimalDecisions);
    assert.ok(result.schema);
    assert.ok(result.rules);
    assert.equal(result.schema.entities.length, 1);
    assert.equal(result.schema.entities[0].name, 'header');
    assert.ok(result.schema.window.id);
  });

  it('infers category from window name', async () => {
    const schema = {
      window: { id: 'W2', name: 'Sales Invoice' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'sales');
  });

  it('infers purchase category', async () => {
    const schema = {
      window: { id: 'W3', name: 'Purchase Order' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'purchases');
  });

  it('infers inventory category', async () => {
    const schema = {
      window: { id: 'W4', name: 'Warehouse' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'inventory');
  });

  it('infers accounting category', async () => {
    const schema = {
      window: { id: 'W5', name: 'Journal Entry' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'accounting');
  });

  it('infers master category for Product', async () => {
    const schema = {
      window: { id: 'W6', name: 'Product' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'master');
  });

  it('infers project category', async () => {
    const schema = {
      window: { id: 'W7', name: 'Project' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'project');
  });

  it('defaults to general category for unknown names', async () => {
    const schema = {
      window: { id: 'W8', name: 'Configuration' },
      entities: [],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.window.category, 'general');
  });

  it('uses category from window decisions if provided', async () => {
    const decisions = { _version: 3, entities: {}, rules: {}, window: { category: 'finance' } };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    assert.equal(result.schema.window.category, 'finance');
  });

  it('applies discardPatterns to fields', async () => {
    const decisions = {
      _version: 3,
      discardPatterns: ['Created*'],
      entities: {},
      rules: {},
      window: {},
    };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    const createdField = result.schema.entities[0].fields.find(f => f.name === 'created');
    assert.equal(createdField.visibility, 'discarded');
  });

  it('excludes entities with exclude: true', async () => {
    const schema = {
      window: { id: 'W9', name: 'Test' },
      entities: [
        { name: 'header', tableName: 'T1', fields: [] },
        { name: 'lines', tableName: 'T2', fields: [] },
      ],
    };
    const decisions = {
      _version: 3,
      entities: { lines: { exclude: true } },
      rules: {},
      window: {},
    };
    const result = await resolveCurated(schema, minimalRules, decisions);
    assert.equal(result.schema.entities.length, 1);
    assert.equal(result.schema.entities[0].name, 'header');
  });

  it('resolves rules from decisions when present', async () => {
    const decisions = {
      _version: 3,
      entities: {},
      rules: {
        'SL_Amt': { type: 'callout', decision: 'Keep', description: 'Amounts' },
      },
      window: {},
    };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    assert.equal(result.rules.length, 1);
    assert.equal(result.rules[0].name, 'SL_Amt');
    assert.equal(result.rules[0].decision, 'Keep');
  });

  it('applies window name override from decisions', async () => {
    const decisions = {
      _version: 3,
      entities: {},
      rules: {},
      window: { name: 'Custom Name' },
    };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    assert.equal(result.schema.window.name, 'Custom Name');
  });

  it('sets form=true for editable fields by default', async () => {
    const result = await resolveCurated(minimalSchema, minimalRules, minimalDecisions);
    const nameField = result.schema.entities[0].fields.find(f => f.name === 'name');
    assert.equal(nameField.form, true);
  });

  it('sets form=false for system fields by default', async () => {
    const result = await resolveCurated(minimalSchema, minimalRules, minimalDecisions);
    const createdField = result.schema.entities[0].fields.find(f => f.name === 'created');
    assert.equal(createdField.form, false);
  });

  it('preserves mandatory as required', async () => {
    const result = await resolveCurated(minimalSchema, minimalRules, minimalDecisions);
    const nameField = result.schema.entities[0].fields.find(f => f.name === 'name');
    assert.equal(nameField.required, true);
    assert.equal(nameField.sourceRequired, true);
  });

  it('applies draftMode from window decisions', async () => {
    const decisions = {
      _version: 3,
      entities: {},
      rules: {},
      window: {
        draftMode: {
          enabled: true,
          processField: 'documentAction',
          processValue: 'CO',
          label: 'Complete',
          completedStatuses: ['CO', 'CL'],
        },
      },
    };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    const entity = result.schema.entities[0];
    assert.ok(entity.draftMode);
    assert.equal(entity.draftMode.enabled, true);
    assert.deepEqual(entity.draftMode.completedStatuses, ['CO', 'CL']);
  });

  it('applies foreignKey reference derivation', async () => {
    const schema = {
      window: { id: 'W10', name: 'Test' },
      entities: [{
        name: 'header',
        tableName: 'C_Order',
        tabId: 'T1',
        tabName: 'Header',
        fields: [{
          name: 'businessPartner',
          columnName: 'C_BPartner_ID',
          label: 'Business Partner',
          type: 'foreignKey',
          visibility: 'editable',
          reference: { type: 'TableDir', targetTable: 'C_BPartner' },
        }],
      }],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    const bpField = result.schema.entities[0].fields[0];
    assert.equal(bpField.reference, 'BPartner');
    assert.equal(bpField.inputMode, 'selector');
  });

  it('applies entity name simplification', async () => {
    const schema = {
      window: { id: 'W11', name: 'Test' },
      entities: [{
        name: 'cOrderLine',
        tableName: 'C_OrderLine',
        tabId: 'T2',
        tabName: 'Lines',
        fields: [],
      }],
    };
    const result = await resolveCurated(schema, minimalRules, minimalDecisions);
    assert.equal(result.schema.entities[0].name, 'orderLine');
  });

  it('appends virtual fields from decisions', async () => {
    const decisions = {
      _version: 3,
      entities: {
        header: {
          virtualFields: [{
            name: 'computed',
            label: 'Computed',
            type: 'number',
            visibility: 'readOnly',
            grid: true,
            form: true,
          }],
          fields: {},
        },
      },
      rules: {},
      window: {},
    };
    const result = await resolveCurated(minimalSchema, minimalRules, decisions);
    const virtualField = result.schema.entities[0].fields.find(f => f.name === 'computed');
    assert.ok(virtualField);
    assert.equal(virtualField.virtual, true);
    assert.equal(virtualField.type, 'number');
  });
});
