import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatDiffSummary } from '../src/reconcile-schema.js';

// We test the pure functions. reconcileSchema itself requires file I/O
// and migration imports, which are tested via integration.

describe('reconcile-schema', () => {
  describe('formatDiffSummary — decisions mode', () => {
    it('returns clean message when no diff', () => {
      const diff = { mode: 'decisions', hasDiff: false, entities: { unclassified: [], orphaned: [] } };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('No unclassified fields'));
    });

    it('lists unclassified fields', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [
            {
              entityKey: 'c_order',
              tableName: 'C_Order',
              tabName: 'Header',
              fields: [
                { fieldName: 'newField', columnName: 'NewField' },
                { fieldName: 'anotherField', columnName: 'AnotherField' },
              ],
            },
          ],
          orphaned: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('UNCLASSIFIED'));
      assert.ok(result.includes('Header'));
      assert.ok(result.includes('newField'));
      assert.ok(result.includes('anotherField'));
      assert.ok(result.includes('2 field(s) need decisions'));
    });

    it('lists orphaned decisions', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [],
          orphaned: [
            { entityKey: 'c_order', fieldName: 'removedField' },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('ORPHANED'));
      assert.ok(result.includes('c_order.removedField'));
      assert.ok(result.includes('1 orphaned decision(s)'));
    });

    it('shows both unclassified and orphaned', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [{
            entityKey: 'e1',
            tableName: 'T1',
            tabName: 'Tab1',
            fields: [{ fieldName: 'f1', columnName: 'F1' }],
          }],
          orphaned: [{ entityKey: 'e2', fieldName: 'f2' }],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('UNCLASSIFIED'));
      assert.ok(result.includes('ORPHANED'));
    });
  });

  describe('formatDiffSummary — curated mode', () => {
    it('returns clean message when no diff', () => {
      const diff = {
        mode: 'curated',
        hasDiff: false,
        entities: { added: [], removed: [], changed: [] },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('No structural changes'));
    });

    it('lists added entities', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [{ tabName: 'NewTab', tableName: 'NEW_TABLE', fieldCount: 5, fields: [] }],
          removed: [],
          changed: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('NEW entities'));
      assert.ok(result.includes('NewTab'));
      assert.ok(result.includes('5 fields'));
    });

    it('lists removed entities', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [{ tabName: 'OldTab', tableName: 'OLD_TABLE', fieldCount: 3 }],
          changed: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('ORPHANED entities'));
      assert.ok(result.includes('OldTab'));
    });

    it('lists changed entities with added and removed fields', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [],
          changed: [{
            entityKey: 'c_order',
            tableName: 'C_Order',
            tabName: 'Header',
            fields: {
              added: [{ columnName: 'NewCol' }],
              removed: [{ columnName: 'OldCol' }],
              unchanged: 10,
            },
          }],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('CHANGED'));
      assert.ok(result.includes('1 new field'));
      assert.ok(result.includes('1 orphaned field'));
      assert.ok(result.includes('10 field(s) unchanged'));
    });

    it('computes summary totals across entities', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [{ tabName: 'A', tableName: 'A', fieldCount: 3, fields: [] }],
          removed: [{ tabName: 'B', tableName: 'B', fieldCount: 2 }],
          changed: [{
            entityKey: 'c',
            tableName: 'C',
            tabName: 'C',
            fields: { added: [{ columnName: 'X' }], removed: [], unchanged: 5 },
          }],
        },
      };
      const result = formatDiffSummary(diff);
      // 3 from added entity + 1 from changed = 4 to classify
      assert.ok(result.includes('4 field(s) to classify'));
      // 2 from removed entity = 2 orphaned
      assert.ok(result.includes('2 orphaned field(s)'));
    });

    it('lists multiple changed entities with only additions', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [],
          changed: [
            {
              entityKey: 'c_order',
              tableName: 'C_Order',
              tabName: 'Header',
              fields: { added: [{ columnName: 'NewA' }, { columnName: 'NewB' }], removed: [], unchanged: 8 },
            },
            {
              entityKey: 'c_orderline',
              tableName: 'C_OrderLine',
              tabName: 'Lines',
              fields: { added: [{ columnName: 'NewC' }], removed: [], unchanged: 12 },
            },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('CHANGED'));
      assert.ok(result.includes('Header'));
      assert.ok(result.includes('Lines'));
      assert.ok(result.includes('2 new field(s)'));
      assert.ok(result.includes('1 new field(s)'));
      assert.ok(result.includes('8 field(s) unchanged'));
      assert.ok(result.includes('12 field(s) unchanged'));
      // total new = 2 + 1 = 3
      assert.ok(result.includes('3 field(s) to classify'));
      // total orphaned = 0
      assert.ok(result.includes('0 orphaned field(s)'));
    });

    it('lists changed entities with only removals', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [],
          changed: [{
            entityKey: 'c_invoice',
            tableName: 'C_Invoice',
            tabName: 'Invoice',
            fields: {
              added: [],
              removed: [{ columnName: 'OldX' }, { columnName: 'OldY' }],
              unchanged: 5,
            },
          }],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('2 orphaned field(s)'));
      assert.ok(result.includes('5 field(s) unchanged'));
      assert.ok(result.includes('0 field(s) to classify'));
    });

    it('handles empty entities in all three categories', () => {
      const diff = {
        mode: 'curated',
        hasDiff: false,
        entities: { added: [], removed: [], changed: [] },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('No structural changes'));
      assert.ok(!result.includes('CHANGED'));
      assert.ok(!result.includes('NEW'));
      assert.ok(!result.includes('ORPHANED'));
    });

    it('accumulates totals from all three categories', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [
            { tabName: 'T1', tableName: 'TBL1', fieldCount: 4, fields: [] },
            { tabName: 'T2', tableName: 'TBL2', fieldCount: 6, fields: [] },
          ],
          removed: [
            { tabName: 'T3', tableName: 'TBL3', fieldCount: 3 },
          ],
          changed: [
            {
              entityKey: 'e1', tableName: 'E1', tabName: 'E1',
              fields: { added: [{ columnName: 'A1' }, { columnName: 'A2' }], removed: [{ columnName: 'R1' }], unchanged: 7 },
            },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      // totalNew = 4 + 6 (added entities) + 2 (changed added) = 12
      assert.ok(result.includes('12 field(s) to classify'));
      // totalOrphaned = 3 (removed entity) + 1 (changed removed) = 4
      assert.ok(result.includes('4 orphaned field(s)'));
    });
  });

  describe('formatDiffSummary — decisions mode extra edges', () => {
    it('handles multiple unclassified entities', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [
            { entityKey: 'e1', tableName: 'T1', tabName: 'Tab1', fields: [{ fieldName: 'f1', columnName: 'F1' }, { fieldName: 'f2', columnName: 'F2' }] },
            { entityKey: 'e2', tableName: 'T2', tabName: 'Tab2', fields: [{ fieldName: 'f3', columnName: 'F3' }] },
          ],
          orphaned: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('Tab1'));
      assert.ok(result.includes('Tab2'));
      assert.ok(result.includes('f1'));
      assert.ok(result.includes('f3'));
      // total unclassified = 2 + 1 = 3
      assert.ok(result.includes('3 field(s) need decisions'));
    });

    it('handles multiple orphaned decisions', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [],
          orphaned: [
            { entityKey: 'e1', fieldName: 'removed1' },
            { entityKey: 'e1', fieldName: 'removed2' },
            { entityKey: 'e2', fieldName: 'removed3' },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('e1.removed1'));
      assert.ok(result.includes('e1.removed2'));
      assert.ok(result.includes('e2.removed3'));
      assert.ok(result.includes('3 orphaned decision(s)'));
      assert.ok(result.includes('0 field(s) need decisions'));
    });

    it('handles both unclassified and orphaned with large counts', () => {
      const unclassifiedFields = Array.from({ length: 10 }, (_, i) => ({
        fieldName: `field${i}`, columnName: `Field${i}`,
      }));
      const orphanedFields = Array.from({ length: 5 }, (_, i) => ({
        entityKey: 'big', fieldName: `old${i}`,
      }));
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [{ entityKey: 'big', tableName: 'BIG', tabName: 'Big', fields: unclassifiedFields }],
          orphaned: orphanedFields,
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('10 field(s) need decisions'));
      assert.ok(result.includes('5 orphaned decision(s)'));
    });

    it('handles many unclassified across multiple entities', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [
            { entityKey: 'e1', tableName: 'T1', tabName: 'Tab1', fields: [
              { fieldName: 'f1', columnName: 'F1' },
              { fieldName: 'f2', columnName: 'F2' },
              { fieldName: 'f3', columnName: 'F3' },
            ]},
            { entityKey: 'e2', tableName: 'T2', tabName: 'Tab2', fields: [
              { fieldName: 'f4', columnName: 'F4' },
            ]},
            { entityKey: 'e3', tableName: 'T3', tabName: 'Tab3', fields: [
              { fieldName: 'f5', columnName: 'F5' },
              { fieldName: 'f6', columnName: 'F6' },
            ]},
          ],
          orphaned: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('Tab1'));
      assert.ok(result.includes('Tab2'));
      assert.ok(result.includes('Tab3'));
      // total unclassified = 3 + 1 + 2 = 6
      assert.ok(result.includes('6 field(s) need decisions'));
      assert.ok(result.includes('0 orphaned decision(s)'));
    });

    it('handles both unclassified and orphaned in same entity', () => {
      const diff = {
        mode: 'decisions',
        hasDiff: true,
        entities: {
          unclassified: [
            { entityKey: 'shared_entity', tableName: 'T1', tabName: 'SharedTab', fields: [
              { fieldName: 'newF1', columnName: 'NewF1' },
              { fieldName: 'newF2', columnName: 'NewF2' },
            ]},
          ],
          orphaned: [
            { entityKey: 'shared_entity', fieldName: 'oldField1' },
            { entityKey: 'shared_entity', fieldName: 'oldField2' },
            { entityKey: 'shared_entity', fieldName: 'oldField3' },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('UNCLASSIFIED'));
      assert.ok(result.includes('ORPHANED'));
      assert.ok(result.includes('SharedTab'));
      assert.ok(result.includes('shared_entity.oldField1'));
      assert.ok(result.includes('shared_entity.oldField3'));
      assert.ok(result.includes('2 field(s) need decisions'));
      assert.ok(result.includes('3 orphaned decision(s)'));
    });
  });

  describe('formatDiffSummary — curated mode additional edges', () => {
    it('handles only added entities (no removed, no changed)', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [
            { tabName: 'NewTab1', tableName: 'NEW_T1', fieldCount: 8, fields: [] },
            { tabName: 'NewTab2', tableName: 'NEW_T2', fieldCount: 3, fields: [] },
          ],
          removed: [],
          changed: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('NEW entities'));
      assert.ok(result.includes('NewTab1'));
      assert.ok(result.includes('NewTab2'));
      assert.ok(result.includes('8 fields'));
      assert.ok(result.includes('3 fields'));
      // No ORPHANED or CHANGED sections
      assert.ok(!result.includes('ORPHANED'));
      assert.ok(!result.includes('CHANGED'));
      // total new = 8 + 3 = 11
      assert.ok(result.includes('11 field(s) to classify'));
      assert.ok(result.includes('0 orphaned field(s)'));
    });

    it('handles only removed entities (no added, no changed)', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [
            { tabName: 'OldTab1', tableName: 'OLD_T1', fieldCount: 5 },
            { tabName: 'OldTab2', tableName: 'OLD_T2', fieldCount: 7 },
          ],
          changed: [],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('ORPHANED entities'));
      assert.ok(result.includes('OldTab1'));
      assert.ok(result.includes('OldTab2'));
      assert.ok(!result.includes('NEW entities'));
      assert.ok(!result.includes('CHANGED'));
      assert.ok(result.includes('0 field(s) to classify'));
      // total orphaned = 5 + 7 = 12
      assert.ok(result.includes('12 orphaned field(s)'));
    });

    it('handles multiple changed entities with different field counts', () => {
      const diff = {
        mode: 'curated',
        hasDiff: true,
        entities: {
          added: [],
          removed: [],
          changed: [
            {
              entityKey: 'e1', tableName: 'T1', tabName: 'Header',
              fields: { added: [{ columnName: 'A1' }], removed: [{ columnName: 'R1' }, { columnName: 'R2' }], unchanged: 15 },
            },
            {
              entityKey: 'e2', tableName: 'T2', tabName: 'Lines',
              fields: { added: [{ columnName: 'A2' }, { columnName: 'A3' }, { columnName: 'A4' }], removed: [], unchanged: 20 },
            },
            {
              entityKey: 'e3', tableName: 'T3', tabName: 'Tax',
              fields: { added: [], removed: [{ columnName: 'R3' }], unchanged: 3 },
            },
          ],
        },
      };
      const result = formatDiffSummary(diff);
      assert.ok(result.includes('CHANGED'));
      assert.ok(result.includes('Header'));
      assert.ok(result.includes('Lines'));
      assert.ok(result.includes('Tax'));
      assert.ok(result.includes('15 field(s) unchanged'));
      assert.ok(result.includes('20 field(s) unchanged'));
      assert.ok(result.includes('3 field(s) unchanged'));
      // total new = 1 + 3 + 0 = 4
      assert.ok(result.includes('4 field(s) to classify'));
      // total orphaned = 2 + 0 + 1 = 3
      assert.ok(result.includes('3 orphaned field(s)'));
    });
  });
});
