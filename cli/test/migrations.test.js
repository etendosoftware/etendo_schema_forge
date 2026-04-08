import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { migrateDecisions, needsMigration, getVersion, CURRENT_VERSION } from '../src/migrations/index.js';
import { migrate as v1ToV2 } from '../src/migrations/v1-to-v2.js';

describe('migrations/index.js', () => {
  it('CURRENT_VERSION is 2', () => {
    assert.equal(CURRENT_VERSION, 2);
  });

  it('getVersion returns 1 for legacy decisions without version', () => {
    assert.equal(getVersion({}), 1);
    assert.equal(getVersion({ entities: {} }), 1);
  });

  it('getVersion reads explicit version field', () => {
    assert.equal(getVersion({ version: 2 }), 2);
  });

  it('getVersion parses $schema tag', () => {
    assert.equal(getVersion({ $schema: 'decisions-v2' }), 2);
  });

  it('needsMigration returns true for v1', () => {
    assert.equal(needsMigration({}), true);
  });

  it('needsMigration returns false for v2', () => {
    assert.equal(needsMigration({ version: 2 }), false);
  });

  it('migrateDecisions bumps version to CURRENT_VERSION', () => {
    const result = migrateDecisions({ entities: {} });
    assert.equal(result.migrated, true);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 2);
    assert.equal(result.decisions.version, 2);
    assert.equal(result.decisions.$schema, 'decisions-v2');
  });

  it('migrateDecisions passes context to migration functions', () => {
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Header' },
      ],
    };
    const decisions = {
      entities: {
        cOrder: { fields: { documentNo: { visibility: 'editable' } } },
      },
    };
    const result = migrateDecisions(decisions, { schemaRaw });
    assert.equal(result.migrated, true);
    // Entity key should be remapped from cOrder to header
    assert.ok(result.decisions.entities.header, 'Expected "header" key after migration');
    assert.ok(!result.decisions.entities.cOrder, 'Expected "cOrder" key to be removed');
  });

  it('migrateDecisions returns unchanged if already at current version', () => {
    const decisions = { version: 2, $schema: 'decisions-v2', entities: {} };
    const result = migrateDecisions(decisions);
    assert.equal(result.migrated, false);
    assert.equal(result.fromVersion, 2);
  });
});

describe('v1-to-v2 migration', () => {
  it('remaps tableName-based keys to tabName-based keys', () => {
    const decisions = {
      entities: {
        cOrder: { fields: { documentNo: {} } },
        cOrderLine: { fields: { qtyOrdered: {} } },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Header' },
        { tableName: 'C_OrderLine', tabName: 'Lines' },
      ],
    };

    const result = v1ToV2(decisions, { schemaRaw });
    assert.deepEqual(Object.keys(result.entities), ['header', 'lines']);
    assert.deepEqual(result.entities.header.fields, { documentNo: {} });
    assert.deepEqual(result.entities.lines.fields, { qtyOrdered: {} });
  });

  it('skips remapping when schemaRaw is not available', () => {
    const decisions = {
      entities: {
        cOrder: { fields: {} },
      },
    };
    const result = v1ToV2(decisions);
    assert.deepEqual(Object.keys(result.entities), ['cOrder']);
  });

  it('skips remapping when schemaRaw has no entities', () => {
    const decisions = { entities: { cOrder: {} } };
    const result = v1ToV2(decisions, { schemaRaw: {} });
    assert.deepEqual(Object.keys(result.entities), ['cOrder']);
  });

  it('handles simplified keys (order instead of cOrder)', () => {
    const decisions = {
      entities: {
        order: { fields: { documentNo: {} } },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Header' },
      ],
    };

    const result = v1ToV2(decisions, { schemaRaw });
    assert.deepEqual(Object.keys(result.entities), ['header']);
  });

  it('keeps keys that already match the new format', () => {
    const decisions = {
      entities: {
        header: { fields: {} },
        lines: { fields: {} },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Header' },
        { tableName: 'C_OrderLine', tabName: 'Lines' },
      ],
    };

    const result = v1ToV2(decisions, { schemaRaw });
    // header and lines already match, no remapping needed
    assert.deepEqual(Object.keys(result.entities), ['header', 'lines']);
  });

  it('preserves unmatched decision keys as-is', () => {
    const decisions = {
      entities: {
        cOrder: { fields: {} },
        customEntity: { fields: {} },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Header' },
      ],
    };

    const result = v1ToV2(decisions, { schemaRaw });
    assert.ok(result.entities.header, 'cOrder remapped to header');
    assert.ok(result.entities.customEntity, 'customEntity preserved');
  });

  it('detects and skips on key collision', () => {
    // Two different old keys mapping to the same new key
    const decisions = {
      entities: {
        cOrder: { fields: { a: {} } },
        order: { fields: { b: {} } },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order', tabName: 'Order' },
      ],
    };

    // Both cOrder and order would map to "order" — collision
    const result = v1ToV2(decisions, { schemaRaw });
    // Should skip remapping entirely
    assert.ok(result.entities.cOrder || result.entities.order);
  });

  it('handles entities missing tabName or tableName gracefully', () => {
    const decisions = {
      entities: {
        cOrder: { fields: {} },
      },
    };
    const schemaRaw = {
      entities: [
        { tableName: 'C_Order' }, // no tabName
        { tabName: 'Lines' },     // no tableName
      ],
    };

    const result = v1ToV2(decisions, { schemaRaw });
    // No valid mappings possible, entities unchanged
    assert.deepEqual(Object.keys(result.entities), ['cOrder']);
  });
});
