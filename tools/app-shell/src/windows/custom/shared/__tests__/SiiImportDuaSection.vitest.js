// @covers tools/app-shell/src/windows/custom/shared/SiiImportDuaSection.jsx
import { describe, it, expect } from 'vitest';
import { isDuaDateAfterAccountingDate } from '../SiiImportDuaSection.jsx';

describe('isDuaDateAfterAccountingDate — DUA date vs accounting register date hint', () => {
  it('warns only when the DUA date is a later calendar day', () => {
    expect(isDuaDateAfterAccountingDate('2026-11-06', '2026-11-05')).toBe(true);
    expect(isDuaDateAfterAccountingDate('2026-11-05', '2026-11-05')).toBe(false);
    expect(isDuaDateAfterAccountingDate('2026-11-04', '2026-11-05')).toBe(false);
  });

  it('compares calendar days, ignoring a time part', () => {
    expect(isDuaDateAfterAccountingDate('2026-11-05T23:30:00Z', '2026-11-05')).toBe(false);
  });

  it('never warns when either date is empty', () => {
    expect(isDuaDateAfterAccountingDate('', '2026-11-05')).toBe(false);
    expect(isDuaDateAfterAccountingDate('2026-11-06', null)).toBe(false);
  });
});
