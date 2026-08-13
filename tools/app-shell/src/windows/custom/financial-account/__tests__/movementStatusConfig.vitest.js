import { describe, it, expect } from 'vitest';
import { MOVEMENT_STATUS_CONFIG, ALL_STATUSES } from '../movementStatusConfig';

// movementStatusConfig.js is a pure data map — tests verify shape integrity.

describe('movementStatusConfig', () => {
  it('exports ALL_STATUSES as an array of 8 known search keys', () => {
    const expected = ['RPAP', 'RPAE', 'RPVOID', 'RPR', 'PPM', 'PWNC', 'RDNC', 'RPPC'];
    expect(ALL_STATUSES).toEqual(expected);
  });

  it('every status has a family and a labelKey', () => {
    for (const key of ALL_STATUSES) {
      const cfg = MOVEMENT_STATUS_CONFIG[key];
      expect(cfg, `${key} missing from MOVEMENT_STATUS_CONFIG`).toBeDefined();
      expect(typeof cfg.family, `${key}.family must be a string`).toBe('string');
      expect(typeof cfg.labelKey, `${key}.labelKey must be a string`).toBe('string');
    }
  });

  it('ALL_STATUSES length matches MOVEMENT_STATUS_CONFIG keys', () => {
    expect(ALL_STATUSES.length).toBe(Object.keys(MOVEMENT_STATUS_CONFIG).length);
  });
});
