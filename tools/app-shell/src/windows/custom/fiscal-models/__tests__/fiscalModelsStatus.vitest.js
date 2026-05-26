import { describe, it, expect } from 'vitest';
import { STATUSES, STATUS_COLOR, STATUS_ICON, STATUS_ORDER } from '../fiscalModelsUtils.js';

describe('STATUSES — status unification', () => {
  it('does not contain pendiente', () => {
    expect(STATUSES).not.toContain('pendiente');
  });

  it('still contains borrador', () => {
    expect(STATUSES).toContain('borrador');
  });

  it('STATUS_COLOR does not have a pendiente entry', () => {
    expect(STATUS_COLOR).not.toHaveProperty('pendiente');
  });

  it('STATUS_ICON does not have a pendiente entry', () => {
    expect(STATUS_ICON).not.toHaveProperty('pendiente');
  });

  it('STATUS_ORDER mirrors STATUSES', () => {
    expect(STATUS_ORDER).toEqual(STATUSES);
  });
});
