import { describe, it, expect } from 'vitest';
import { STATUSES, STATUS_COLOR, STATUS_ICON, STATUS_ORDER } from '../fiscalModelsUtils.js';

describe('STATUSES — status unification', () => {
  it('still contains draft', () => {
    expect(STATUSES).toContain('draft');
  });

  it('STATUS_ORDER mirrors STATUSES', () => {
    expect(STATUS_ORDER).toEqual(STATUSES);
  });
});
