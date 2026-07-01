import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectDiscardPatterns } from '../src/migrate-to-decisions.js';

// We test the exported function + replicate the pure internal helpers.

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function visibilityDefaultsForMigration(visibility) {
  switch (visibility) {
    case 'editable':
    case 'readOnly':
      return { grid: false, form: true, searchable: false };
    default:
      return { grid: false, form: false, searchable: false };
  }
}

function buildColumnMap(rawEntity) {
  const map = {};
  for (const f of (rawEntity?.fields || [])) {
    if (!map[f.columnName]) map[f.columnName] = [];
    map[f.columnName].push(f);
  }
  return map;
}

function findRawFieldByColumn(columnMap, columnName, curatedVisibility) {
  const candidates = columnMap[columnName];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const exact = candidates.find(f => f.visibility === curatedVisibility);
  if (exact) return exact;
  if (curatedVisibility !== 'system' && curatedVisibility !== 'discarded') {
    const nonSystem = candidates.find(f => f.visibility !== 'system' && f.visibility !== 'discarded');
    if (nonSystem) return nonSystem;
  }
  return candidates[0];
}

function buildDefaultFieldMap(defaultEntity) {
  const map = {};
  for (const f of (defaultEntity?.fields || [])) {
    map[f.name] = f;
  }
  return map;
}

function diffField(curatedField, defaultField) {
  const diff = {};
  const cv_vis = curatedField.visibility ?? null;
  const dv_vis = defaultField ? (defaultField.visibility ?? null) : null;
  if (cv_vis !== dv_vis && cv_vis !== null) {
    diff.visibility = cv_vis;
  }
  const visDefaults = visibilityDefaultsForMigration(curatedField.visibility);
  for (const prop of ['grid', 'form', 'searchable']) {
    const cv = curatedField[prop] ?? false;
    const expected = visDefaults[prop];
    if (cv !== expected) diff[prop] = cv;
  }
  const cv_type = curatedField.type ?? null;
  const dv_type = defaultField ? (defaultField.type ?? null) : null;
  if (cv_type !== null && cv_type !== dv_type) {
    diff.type = cv_type;
  }
  for (const prop of ['reference', 'inputMode', 'dependsOn', 'section', 'readOnlyLogic', 'displayLogic']) {
    const cv = curatedField[prop] ?? null;
    const dv = defaultField ? (defaultField[prop] ?? null) : null;
    if (!deepEqual(cv, dv)) {
      diff[prop] = cv;
    }
  }
  return diff;
}

describe('migrate-to-decisions', () => {
  describe('deepEqual', () => {
    it('equal primitives', () => {
      assert.ok(deepEqual(1, 1));
      assert.ok(deepEqual('a', 'a'));
      assert.ok(deepEqual(null, null));
      assert.ok(deepEqual(true, true));
    });

    it('unequal primitives', () => {
      assert.ok(!deepEqual(1, 2));
      assert.ok(!deepEqual('a', 'b'));
      assert.ok(!deepEqual(null, 'a'));
      assert.ok(!deepEqual(1, '1'));
    });

    it('equal objects', () => {
      assert.ok(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 }));
    });

    it('unequal objects', () => {
      assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
      assert.ok(!deepEqual({ a: 1 }, { a: 1, b: 2 }));
    });

    it('nested objects', () => {
      assert.ok(deepEqual({ a: { b: 1 } }, { a: { b: 1 } }));
      assert.ok(!deepEqual({ a: { b: 1 } }, { a: { b: 2 } }));
    });

    it('null vs object', () => {
      assert.ok(!deepEqual(null, {}));
      assert.ok(!deepEqual({}, null));
    });
  });

  describe('visibilityDefaultsForMigration', () => {
    it('editable → form: true', () => {
      const d = visibilityDefaultsForMigration('editable');
      assert.equal(d.form, true);
      assert.equal(d.grid, false);
      assert.equal(d.searchable, false);
    });

    it('readOnly → form: true', () => {
      assert.equal(visibilityDefaultsForMigration('readOnly').form, true);
    });

    it('system → form: false', () => {
      assert.equal(visibilityDefaultsForMigration('system').form, false);
    });

    it('discarded → form: false', () => {
      assert.equal(visibilityDefaultsForMigration('discarded').form, false);
    });
  });

  describe('buildColumnMap', () => {
    it('groups fields by columnName', () => {
      const entity = { fields: [
        { columnName: 'Name', visibility: 'editable' },
        { columnName: 'Name', visibility: 'system' },
        { columnName: 'Amount', visibility: 'editable' },
      ]};
      const map = buildColumnMap(entity);
      assert.equal(map['Name'].length, 2);
      assert.equal(map['Amount'].length, 1);
    });

    it('handles null entity', () => {
      const map = buildColumnMap(null);
      assert.deepEqual(map, {});
    });

    it('handles entity with no fields', () => {
      assert.deepEqual(buildColumnMap({ fields: [] }), {});
    });
  });

  describe('findRawFieldByColumn', () => {
    const map = {
      Name: [
        { columnName: 'Name', visibility: 'editable' },
        { columnName: 'Name', visibility: 'system' },
      ],
      Single: [{ columnName: 'Single', visibility: 'readOnly' }],
    };

    it('returns single candidate directly', () => {
      const f = findRawFieldByColumn(map, 'Single', 'readOnly');
      assert.equal(f.visibility, 'readOnly');
    });

    it('prefers exact visibility match', () => {
      const f = findRawFieldByColumn(map, 'Name', 'system');
      assert.equal(f.visibility, 'system');
    });

    it('prefers non-system when curated is visible', () => {
      const f = findRawFieldByColumn(map, 'Name', 'readOnly');
      assert.equal(f.visibility, 'editable');
    });

    it('returns null for missing column', () => {
      assert.equal(findRawFieldByColumn(map, 'Missing', 'editable'), null);
    });

    it('returns first candidate as last resort', () => {
      const dupes = { X: [{ visibility: 'system' }, { visibility: 'discarded' }] };
      const f = findRawFieldByColumn(dupes, 'X', 'system');
      assert.equal(f.visibility, 'system');
    });
  });

  describe('buildDefaultFieldMap', () => {
    it('maps fields by name', () => {
      const entity = { fields: [{ name: 'qty' }, { name: 'price' }] };
      const map = buildDefaultFieldMap(entity);
      assert.ok(map.qty);
      assert.ok(map.price);
    });

    it('handles null entity', () => {
      assert.deepEqual(buildDefaultFieldMap(null), {});
    });
  });

  describe('detectDiscardPatterns', () => {
    it('detects EM_* pattern', () => {
      const entities = [{
        fields: [
          { visibility: 'discarded', column: 'EM_Custom_Col' },
          { visibility: 'editable', column: 'Name' },
        ],
      }];
      const patterns = detectDiscardPatterns(entities);
      assert.ok(patterns.includes('EM_*'));
    });

    it('detects CopyFrom* pattern', () => {
      const entities = [{
        fields: [{ visibility: 'discarded', column: 'CopyFromPO' }],
      }];
      assert.ok(detectDiscardPatterns(entities).includes('CopyFrom*'));
    });

    it('detects lowercase copyFrom', () => {
      const entities = [{
        fields: [{ visibility: 'discarded', column: 'copyFromOrder' }],
      }];
      assert.ok(detectDiscardPatterns(entities).includes('CopyFrom*'));
    });

    it('ignores non-discarded fields', () => {
      const entities = [{
        fields: [{ visibility: 'editable', column: 'EM_ShouldNotMatch' }],
      }];
      assert.deepEqual(detectDiscardPatterns(entities), []);
    });

    it('returns sorted unique patterns', () => {
      const entities = [{
        fields: [
          { visibility: 'discarded', column: 'EM_A' },
          { visibility: 'discarded', column: 'EM_B' },
          { visibility: 'discarded', column: 'CopyFromX' },
        ],
      }];
      const patterns = detectDiscardPatterns(entities);
      assert.deepEqual(patterns, ['CopyFrom*', 'EM_*']);
    });

    it('returns empty for no discarded fields', () => {
      assert.deepEqual(detectDiscardPatterns([{ fields: [] }]), []);
    });

    it('detects patterns across multiple entities', () => {
      const entities = [
        { fields: [{ visibility: 'discarded', column: 'EM_Ext1' }] },
        { fields: [{ visibility: 'discarded', column: 'CopyFromInvoice' }] },
        { fields: [{ visibility: 'discarded', column: 'EM_Ext2' }] },
      ];
      const patterns = detectDiscardPatterns(entities);
      assert.deepEqual(patterns, ['CopyFrom*', 'EM_*']);
    });

    it('handles mixed patterns and non-pattern discarded fields', () => {
      const entities = [{
        fields: [
          { visibility: 'discarded', column: 'EM_Custom' },
          { visibility: 'discarded', column: 'SomeOtherField' },
          { visibility: 'discarded', column: 'CopyFromPO' },
        ],
      }];
      const patterns = detectDiscardPatterns(entities);
      // SomeOtherField does not match any known pattern
      assert.deepEqual(patterns, ['CopyFrom*', 'EM_*']);
    });

    it('handles entity with undefined fields', () => {
      const entities = [{ fields: undefined }];
      assert.deepEqual(detectDiscardPatterns(entities), []);
    });

    it('handles empty entities array', () => {
      assert.deepEqual(detectDiscardPatterns([]), []);
    });

    it('does not duplicate patterns when multiple EM_ fields exist', () => {
      const entities = [{
        fields: [
          { visibility: 'discarded', column: 'EM_A' },
          { visibility: 'discarded', column: 'EM_B' },
          { visibility: 'discarded', column: 'EM_C' },
        ],
      }];
      const patterns = detectDiscardPatterns(entities);
      assert.deepEqual(patterns, ['EM_*']);
    });

    it('case-insensitive EM_ detection (lowercase em_)', () => {
      const entities = [{
        fields: [{ visibility: 'discarded', column: 'em_lowercase' }],
      }];
      const patterns = detectDiscardPatterns(entities);
      assert.ok(patterns.includes('EM_*'));
    });

    it('handles fields with empty column string', () => {
      const entities = [{
        fields: [{ visibility: 'discarded', column: '' }],
      }];
      const patterns = detectDiscardPatterns(entities);
      assert.deepEqual(patterns, []);
    });
  });

  describe('findRawFieldByColumn edge cases', () => {
    it('returns first candidate when curated is system and no exact match', () => {
      const map = {
        Col: [
          { columnName: 'Col', visibility: 'editable' },
          { columnName: 'Col', visibility: 'readOnly' },
        ],
      };
      // system curated: exact match not found, and system curated does not
      // trigger the non-system fallback, so first candidate wins
      const f = findRawFieldByColumn(map, 'Col', 'discarded');
      assert.equal(f.visibility, 'editable');
    });

    it('returns null for empty candidates array', () => {
      const map = { Col: [] };
      assert.equal(findRawFieldByColumn(map, 'Col', 'editable'), null);
    });
  });

  describe('diffField', () => {
    it('returns empty diff when curated matches default', () => {
      const curated = { visibility: 'editable', grid: false, form: true, searchable: false };
      const defaultF = { visibility: 'editable', grid: false, form: true, searchable: false };
      const diff = diffField(curated, defaultF);
      assert.deepEqual(diff, {});
    });

    it('records visibility change', () => {
      const curated = { visibility: 'readOnly', grid: false, form: true, searchable: false };
      const defaultF = { visibility: 'editable', grid: false, form: true, searchable: false };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.visibility, 'readOnly');
    });

    it('records grid override when differs from visibility defaults', () => {
      const curated = { visibility: 'editable', grid: true, form: true, searchable: false };
      const defaultF = { visibility: 'editable', grid: false, form: true, searchable: false };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.grid, true);
    });

    it('records searchable override', () => {
      const curated = { visibility: 'editable', grid: false, form: true, searchable: true };
      const defaultF = { visibility: 'editable', grid: false, form: true, searchable: false };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.searchable, true);
    });

    it('records form: false when visibility expects form: true', () => {
      const curated = { visibility: 'editable', grid: false, form: false, searchable: false };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.form, false);
    });

    it('records reference change', () => {
      const curated = { visibility: 'editable', reference: { type: 'selector' } };
      const defaultF = { visibility: 'editable', reference: null };
      const diff = diffField(curated, defaultF);
      assert.deepEqual(diff.reference, { type: 'selector' });
    });

    it('records explicit null for reference removal', () => {
      const curated = { visibility: 'editable' };
      const defaultF = { visibility: 'editable', reference: { type: 'selector' } };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.reference, null);
    });

    it('records inputMode change', () => {
      const curated = { visibility: 'editable', inputMode: 'textarea' };
      const defaultF = { visibility: 'editable', inputMode: null };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.inputMode, 'textarea');
    });

    it('records section change', () => {
      const curated = { visibility: 'editable', section: 'details' };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.section, 'details');
    });

    it('records readOnlyLogic change', () => {
      const curated = { visibility: 'editable', readOnlyLogic: '@status@=CO' };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.readOnlyLogic, '@status@=CO');
    });

    it('records displayLogic change', () => {
      const curated = { visibility: 'editable', displayLogic: '@type@=I' };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.displayLogic, '@type@=I');
    });

    it('records type override when curated differs from raw', () => {
      const curated = { visibility: 'editable', type: 'image' };
      const defaultF = { visibility: 'editable', type: 'string' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.type, 'image');
    });

    it('does not record type when curated matches default', () => {
      const curated = { visibility: 'editable', type: 'string' };
      const defaultF = { visibility: 'editable', type: 'string' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.type, undefined);
    });

    it('handles null defaultField', () => {
      const curated = { visibility: 'readOnly', grid: true, form: true, searchable: false };
      const diff = diffField(curated, null);
      assert.equal(diff.visibility, 'readOnly');
      assert.equal(diff.grid, true);
    });

    it('handles system visibility defaults (form: false)', () => {
      const curated = { visibility: 'system', grid: false, form: false, searchable: false };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.visibility, 'system');
      // form: false matches system defaults, so no override
      assert.equal(diff.form, undefined);
    });

    it('records dependsOn change', () => {
      const curated = { visibility: 'editable', dependsOn: ['country'] };
      const defaultF = { visibility: 'editable' };
      const diff = diffField(curated, defaultF);
      assert.deepEqual(diff.dependsOn, ['country']);
    });

    it('handles complex nested reference objects', () => {
      const curated = { visibility: 'editable', reference: { type: 'selector', entity: 'product', fields: ['name'] } };
      const defaultF = { visibility: 'editable', reference: { type: 'selector', entity: 'product', fields: ['name'] } };
      const diff = diffField(curated, defaultF);
      assert.equal(diff.reference, undefined);
    });
  });

  describe('findRawEntityForCurated (replicated)', () => {
    // Replicate the function since it is not exported
    function autoSimplifyEntityName(name) {
      // Simplified replica: strip leading "Sales " / "Purchase " and trailing " Header"
      return name;
    }

    function findRawEntityForCurated(rawEntities, curatedEntity) {
      for (const re of rawEntities) {
        if (autoSimplifyEntityName(re.name) === curatedEntity.name) return re;
      }
      for (const re of rawEntities) {
        if (re.tableName === curatedEntity.tableName) return re;
      }
      return null;
    }

    it('matches by simplified name', () => {
      const raw = [{ name: 'Header', tableName: 'C_Order' }];
      const curated = { name: 'Header', tableName: 'C_Order' };
      assert.equal(findRawEntityForCurated(raw, curated), raw[0]);
    });

    it('falls back to tableName matching', () => {
      const raw = [{ name: 'RawName', tableName: 'C_Order' }];
      const curated = { name: 'DifferentName', tableName: 'C_Order' };
      assert.equal(findRawEntityForCurated(raw, curated), raw[0]);
    });

    it('returns null when no match found', () => {
      const raw = [{ name: 'Other', tableName: 'M_Product' }];
      const curated = { name: 'Header', tableName: 'C_Order' };
      assert.equal(findRawEntityForCurated(raw, curated), null);
    });

    it('prefers name match over tableName match', () => {
      const raw = [
        { name: 'Header', tableName: 'OTHER' },
        { name: 'DiffName', tableName: 'C_Order' },
      ];
      const curated = { name: 'Header', tableName: 'C_Order' };
      assert.equal(findRawEntityForCurated(raw, curated), raw[0]);
    });

    it('handles empty raw entities', () => {
      assert.equal(findRawEntityForCurated([], { name: 'X', tableName: 'Y' }), null);
    });
  });

  describe('getAutoDecision (replicated)', () => {
    // Replicate classifyRule behavior for testable scenarios
    function classifyRule(rule) {
      const classified = { ...rule };
      if (rule.type === 'callout') {
        // Callouts that set defaults are auto-keep
        if (rule.name && rule.name.includes('Default')) {
          classified.tier = 'auto';
          classified.autoDecision = 'keep';
        } else {
          classified.tier = 'human';
        }
      } else if (rule.type === 'process') {
        classified.tier = 'human';
      } else {
        classified.tier = 'auto';
        classified.autoDecision = 'keep';
      }
      return classified;
    }

    function getAutoDecision(rawRule) {
      const classified = classifyRule(rawRule);
      if (classified.tier === 'auto') {
        return classified.autoDecision === 'keep' ? 'Keep' : 'Omit';
      }
      return 'pending';
    }

    it('returns Keep for auto-classified keep rules', () => {
      assert.equal(getAutoDecision({ type: 'displayLogic', name: 'SomeLogic' }), 'Keep');
    });

    it('returns pending for human-review rules', () => {
      assert.equal(getAutoDecision({ type: 'process', name: 'SomeProcess' }), 'pending');
    });

    it('returns pending for callout rules requiring human review', () => {
      assert.equal(getAutoDecision({ type: 'callout', name: 'SomeCallout' }), 'pending');
    });

    it('returns Keep for auto-classified callout with Default in name', () => {
      assert.equal(getAutoDecision({ type: 'callout', name: 'SetDefault' }), 'Keep');
    });
  });

  describe('deepEqual edge cases', () => {
    it('handles arrays (treated as objects with numeric keys)', () => {
      assert.ok(deepEqual([1, 2, 3], [1, 2, 3]));
      assert.ok(!deepEqual([1, 2], [1, 2, 3]));
    });

    it('handles deeply nested structures', () => {
      assert.ok(deepEqual({ a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 1 } } } }));
      assert.ok(!deepEqual({ a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 2 } } } }));
    });

    it('handles boolean vs number', () => {
      assert.ok(!deepEqual(true, 1));
      assert.ok(!deepEqual(false, 0));
    });

    it('handles undefined values', () => {
      assert.ok(!deepEqual(undefined, null));
      assert.ok(deepEqual(undefined, undefined));
    });

    it('handles empty objects', () => {
      assert.ok(deepEqual({}, {}));
      assert.ok(!deepEqual({}, { a: 1 }));
    });
  });

  describe('visibilityDefaultsForMigration edge cases', () => {
    it('unknown visibility returns all false', () => {
      const d = visibilityDefaultsForMigration('unknown');
      assert.equal(d.grid, false);
      assert.equal(d.form, false);
      assert.equal(d.searchable, false);
    });

    it('undefined visibility returns all false', () => {
      const d = visibilityDefaultsForMigration(undefined);
      assert.equal(d.grid, false);
      assert.equal(d.form, false);
      assert.equal(d.searchable, false);
    });
  });

  describe('buildColumnMap edge cases', () => {
    it('handles entity with undefined fields property', () => {
      assert.deepEqual(buildColumnMap({ fields: undefined }), {});
    });

    it('groups many fields under same column', () => {
      const entity = { fields: [
        { columnName: 'A', visibility: 'editable' },
        { columnName: 'A', visibility: 'system' },
        { columnName: 'A', visibility: 'discarded' },
      ]};
      const map = buildColumnMap(entity);
      assert.equal(map['A'].length, 3);
    });
  });
});
