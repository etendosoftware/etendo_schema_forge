import { describe, it, expect } from 'vitest';
import { mapDimensionRows, DIMENSION_TYPE_LABEL_KEYS } from '../mockCatalogs.js';

describe('mapDimensionRows', () => {
  it('sets/overwrites labelKey from the type map for a row with a known type', () => {
    const rows = [{ id: 'row-1', type: 'PJ', label: 'Project', active: true, mandatory: false }];
    const [mapped] = mapDimensionRows(rows);
    expect(mapped.labelKey).toBe('glc.dim.project');
    expect(mapped.labelKey).toBe(DIMENSION_TYPE_LABEL_KEYS.PJ);
  });

  it('drops a U1 row regardless of active state (ETP-4845 bug 4)', () => {
    const rows = [
      { id: 'row-u1-active', type: 'U1', label: 'User 1', active: true, mandatory: false },
      { id: 'row-u1-inactive', type: 'U1', label: 'User 1', active: false, mandatory: false },
    ];
    expect(mapDimensionRows(rows)).toEqual([]);
  });

  it('drops a U2 row regardless of active state (ETP-4845 bug 4)', () => {
    const rows = [
      { id: 'row-u2-active', type: 'U2', label: 'User 2', active: true, mandatory: false },
      { id: 'row-u2-inactive', type: 'U2', label: 'User 2', active: false, mandatory: false },
    ];
    expect(mapDimensionRows(rows)).toEqual([]);
  });

  it('drops any other unrecognized type not present in DIMENSION_TYPE_LABEL_KEYS', () => {
    const rows = [
      { id: 'row-known', type: 'CC', label: 'Cost Center', active: true, mandatory: false },
      { id: 'row-unknown', type: 'ZZ', label: 'Unsupported Dimension', active: true, mandatory: false },
    ];
    const mapped = mapDimensionRows(rows);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe('row-known');
  });

  it('passes through a row with no type property completely unchanged (mock-seed shape)', () => {
    const seedRow = { id: 'dim-cc', labelKey: 'glc.dim.costCenter', active: true, mandatory: true, caption: 'Obligatorio' };
    const [mapped] = mapDimensionRows([seedRow]);
    expect(mapped).toBe(seedRow);
    expect(mapped.labelKey).toBe('glc.dim.costCenter');
  });

  it('returns non-array input unchanged (null/undefined guard)', () => {
    expect(mapDimensionRows(null)).toBe(null);
    expect(mapDimensionRows(undefined)).toBe(undefined);
  });

  it('preserves other fields (id, active, mandatory, caption) for a row that gets labelKey set', () => {
    const row = {
      id: 'row-pj', type: 'PJ', label: 'Project', active: true, mandatory: false, caption: 'Optional · All documents',
    };
    const [mapped] = mapDimensionRows([row]);
    expect(mapped).toEqual({
      id: 'row-pj',
      type: 'PJ',
      label: 'Project',
      active: true,
      mandatory: false,
      caption: 'Optional · All documents',
      labelKey: 'glc.dim.project',
    });
  });
});
