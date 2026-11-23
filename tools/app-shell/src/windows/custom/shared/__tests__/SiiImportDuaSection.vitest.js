// @covers tools/app-shell/src/windows/custom/shared/SiiImportDuaSection.jsx
import { describe, it, expect } from 'vitest';
import {
  isDuaDateAfterAccountingDate, isLcNumberPrefixOff, lcHintKey, LC_PREFIXES,
} from '../SiiImportDuaSection.jsx';

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

describe('LC number prefix hint (Tipo factura LC)', () => {
  it('declares the accepted prefixes per tax type, frozen', () => {
    expect(LC_PREFIXES).toEqual({ IVA: ['LC', 'A01', 'A02'], IGIC: ['CLC', '599'] });
    expect(Object.isFrozen(LC_PREFIXES)).toBe(true);
  });

  it('IVA accepts LC/A01/A02 (case- and whitespace-insensitive) and flags the rest', () => {
    expect(isLcNumberPrefixOff(' lc123 ', 'IVA')).toBe(false);
    expect(isLcNumberPrefixOff('A02XYZ', 'IVA')).toBe(false);
    expect(isLcNumberPrefixOff('599123', 'IVA')).toBe(true);
    expect(isLcNumberPrefixOff('X123', 'IVA')).toBe(true);
  });

  it('IGIC accepts CLC/599 only', () => {
    expect(isLcNumberPrefixOff('CLC1', 'IGIC')).toBe(false);
    expect(isLcNumberPrefixOff('599', 'IGIC')).toBe(false);
    expect(isLcNumberPrefixOff('A01', 'IGIC')).toBe(true);
  });

  it('an unknown tax type accepts either set; an empty value never warns', () => {
    expect(isLcNumberPrefixOff('A01', null)).toBe(false);
    expect(isLcNumberPrefixOff('599', undefined)).toBe(false);
    expect(isLcNumberPrefixOff('ZZZ', null)).toBe(true);
    expect(isLcNumberPrefixOff('   ', 'IVA')).toBe(false);
    expect(isLcNumberPrefixOff(null, 'IGIC')).toBe(false);
  });

  it('lcHintKey names the hint for the tax type', () => {
    expect(lcHintKey('IVA')).toBe('sifDataTabs.dua.lcHintIva');
    expect(lcHintKey('IGIC')).toBe('sifDataTabs.dua.lcHintIgic');
    expect(lcHintKey(null)).toBe('sifDataTabs.dua.lcHintAny');
  });
});
