// @covers tools/app-shell/src/windows/custom/shared/SiiImportDuaSection.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flag = { enabled: true };
// The feature is the `siiImportDua` capability (backend flag sii-import-dua), read off the auth map.
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => ({ siiImportDua: flag.enabled }) }));

import { createElement as h } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  isDuaDateAfterAccountingDate, isLcNumberPrefixOff, lcHintKey, LC_PREFIXES,
} from '../SiiImportDuaSection.jsx';
import SiiImportDuaSection from '../SiiImportDuaSection.jsx';

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

describe('SiiImportDuaSection — rendering', () => {
  const ui = key => key;
  function renderCard({ values = {}, ...props } = {}) {
    const onChange = vi.fn();
    const getVal = key => values[key];
    const utils = render(h(SiiImportDuaSection, {
      ui, siiTypeKey: 'F5', getVal, getDateVal: getVal, onChange, readOnly: false, ...props,
    }));
    return { ...utils, onChange };
  }

  beforeEach(() => { flag.enabled = true; });

  it('renders nothing with the flag off or a type other than F5/LC', () => {
    flag.enabled = false;
    expect(renderCard().container).toBeEmptyDOMElement();
    flag.enabled = true;
    expect(renderCard({ siiTypeKey: 'F1' }).container).toBeEmptyDOMElement();
  });

  it('F5: shows the DUA fields and the 18-char hint only for a wrong-length DUA', () => {
    const { unmount } = renderCard({ values: { aeatsiiDua: 'SHORT' } });
    expect(screen.getByTestId('SiiImportDuaSection__fields')).toBeInTheDocument();
    expect(screen.getByTestId('SiiImportDuaSection__duaCounter')).toHaveTextContent('5 / 18');
    expect(screen.getByTestId('SiiImportDuaSection__duaHint')).toBeInTheDocument();
    expect(screen.queryByTestId('SiiImportDuaSection__lcHint')).toBeNull();
    unmount();
    renderCard({ values: { aeatsiiDua: '26ES00281111111111' } });
    expect(screen.queryByTestId('SiiImportDuaSection__duaHint')).toBeNull();
  });

  it('the Múltiple DUA switch writes aeatsiiMultiDua and, when on, hides the header DUA fields', () => {
    const { onChange, unmount } = renderCard();
    fireEvent.click(screen.getByTestId('Switch__siiMultiDua'));
    expect(onChange).toHaveBeenCalledWith('aeatsiiMultiDua', true);
    unmount();
    renderCard({ values: { aeatsiiMultiDua: 'Y' } });
    expect(screen.getByTestId('Switch__siiMultiDua')).toBeInTheDocument();
    expect(screen.queryByTestId('SiiImportDuaSection__fields')).toBeNull();
  });

  it('LC: no counter; the prefix warning shows for a wrong prefix with the tax-type text', () => {
    const { unmount } = renderCard({ siiTypeKey: 'LC', siiTaxType: 'IVA', values: { aeatsiiDua: 'X123' } });
    expect(screen.queryByTestId('SiiImportDuaSection__duaCounter')).toBeNull();
    expect(screen.getByTestId('SiiImportDuaSection__lcHint')).toHaveTextContent('sifDataTabs.dua.lcHintIva');
    unmount();
    renderCard({ siiTypeKey: 'LC', siiTaxType: 'IVA', values: { aeatsiiDua: 'LC123' } });
    expect(screen.queryByTestId('SiiImportDuaSection__lcHint')).toBeNull();
  });

  it('shows the DUA-date banner only when the DUA date is after the accounting register date', () => {
    const { unmount } = renderCard({ values: { aeatsiiFechaDua: '2026-11-06', aeatsiiFechaRegCont: '2026-11-05' } });
    expect(screen.getByTestId('SiiImportDuaSection__dateHint')).toHaveTextContent('sifDataTabs.dua.dateAfterAccountingDate');
    unmount();
    renderCard({ values: { aeatsiiFechaDua: '2026-11-05', aeatsiiFechaRegCont: '2026-11-05' } });
    expect(screen.queryByTestId('SiiImportDuaSection__dateHint')).toBeNull();
  });
});
