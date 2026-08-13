import { describe, it, expect } from 'vitest';
import { STATUSES, STATUS_COLOR, STATUS_ICON, STATUS_ORDER } from '../fiscalModelsUtils.js';

describe('STATUSES — status unification', () => {
  it('contains pending for Modelo 349 compatibility', () => {
    expect(STATUSES).toContain('pending');
  });

  it('still contains draft', () => {
    expect(STATUSES).toContain('draft');
  });

  it('STATUS_COLOR has a pending entry (orange)', () => {
    expect(STATUS_COLOR).toHaveProperty('pending', 'orange');
  });

  it('STATUS_ICON has a pending entry', () => {
    expect(STATUS_ICON).toHaveProperty('pending');
  });

  it('STATUS_ORDER mirrors STATUSES', () => {
    expect(STATUS_ORDER).toEqual(STATUSES);
  });
});
