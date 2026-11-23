// @covers tools/app-shell/src/windows/custom/shared/SiiImportTaxesSection.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every backend call goes through useApiFetch (docs/request-policy.md) — mock that boundary.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import { renderHook, waitFor } from '@testing-library/react';
import {
  selectImportTaxOptions, isImportTaxName, isCompensatoryTaxName, compensatoryBaseName,
  compensatoryNameRate, findCompensatoryTax, planCompensatoryLines, parseRate, rateLabel,
  useSiiDeferredVat,
} from '../SiiImportTaxesSection.jsx';

describe('selectImportTaxOptions — the import-tax picker offers import taxes only', () => {
  it('keeps import and compensatory taxes (accent/case-insensitive) and drops the rest, in order', () => {
    const options = [
      { id: 'a', name: 'IVA 21%' },
      { id: 'b', name: 'Importaciones 21%' },
      { id: 'c', name: 'Compras IGIC IMPORTACIÓN 7%' },
      { id: 'd', name: 'Importaciones 21%=0%' },
      { id: 'e', name: 'IVA 10%' },
    ];
    expect(selectImportTaxOptions(options).map(o => o.id)).toEqual(['b', 'c', 'd']);
  });

  it('tolerates a missing catalog and skips entries without an id', () => {
    expect(selectImportTaxOptions(undefined)).toEqual([]);
    expect(selectImportTaxOptions([{ name: 'Importaciones 21%' }])).toEqual([]);
  });
});

describe('import / compensatory tax name heuristics', () => {
  it('isImportTaxName: "import" in the name, accent/case-insensitive, compensatory excluded', () => {
    expect(isImportTaxName('Importaciones 21%')).toBe(true);
    expect(isImportTaxName('Compras IGIC IMPORTACIÓN 7%')).toBe(true);
    expect(isImportTaxName('IVA 21%')).toBe(false);
    expect(isImportTaxName('Importaciones 21% = 0 %')).toBe(false);
    expect(isImportTaxName(null)).toBe(false);
  });

  it('isCompensatoryTaxName: an import tax with the "=0%" suffix, whitespace-tolerant', () => {
    expect(isCompensatoryTaxName('Importaciones 21%=0%')).toBe(true);
    expect(isCompensatoryTaxName('Importaciones 21% =0%')).toBe(true);
    expect(isCompensatoryTaxName('Importaciones 21%')).toBe(false);
    expect(isCompensatoryTaxName('IVA 21%=0%')).toBe(false);
    expect(isCompensatoryTaxName(undefined)).toBe(false);
  });

  it('compensatoryBaseName strips "=0%" and normalizes accents, case and spaces', () => {
    expect(compensatoryBaseName('Importaciones 21%=0%')).toBe('importaciones 21%');
    expect(compensatoryBaseName('  Compras IGIC  IMPORTACIÓN 7% = 0 %')).toBe('compras igic importacion 7%');
  });

  it('compensatoryNameRate reads the rate before "=0%", decimal comma included', () => {
    expect(compensatoryNameRate('Importaciones 21%=0%')).toBe(21);
    expect(compensatoryNameRate('Importaciones 5,5 % = 0%')).toBe(5.5);
    expect(compensatoryNameRate('Importaciones 21%')).toBeNull();
  });
});

const CATALOG = [
  { id: 'imp21', name: 'Importaciones 21%' },
  { id: 'comp21', name: 'Importaciones 21%=0%' },
  { id: 'compOther10', name: 'Otras importaciones 10%=0%' },
  { id: 'ivaComp', name: 'IVA 21%=0%' },
];

describe('findCompensatoryTax', () => {
  it('matches by name without "=0%" first', () => {
    expect(findCompensatoryTax('IMPORTACIONES 21%', 21, CATALOG)?.id).toBe('comp21');
  });

  it('falls back to a compensatory tax with the same rate in its name', () => {
    expect(findCompensatoryTax('Importaciones reducido', 10, CATALOG)?.id).toBe('compOther10');
  });

  it('returns null with no name match and no (or no matching) rate, or no catalog', () => {
    expect(findCompensatoryTax('Importaciones reducido', null, CATALOG)).toBeNull();
    expect(findCompensatoryTax('Importaciones reducido', 4, CATALOG)).toBeNull();
    expect(findCompensatoryTax('Importaciones 21%', 21, undefined)).toBeNull();
  });
});

describe('planCompensatoryLines', () => {
  const rateOf = row => row.serverRate;

  it('plans one negative-base line per import tax, ignoring drafts, non-import and 0% rows', () => {
    const rows = [
      { id: 'r1', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 100, serverRate: 21 },
      { id: 'r2', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 50.25, serverRate: 21 },
      { id: null, tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 999, serverRate: 21 },
      { id: 'r3', tax: 'iva21', taxLabel: 'IVA 21%', taxableAmount: 70, serverRate: 21 },
      { id: 'r4', tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: 10, serverRate: 0 },
    ];
    const plan = planCompensatoryLines(rows, rateOf, CATALOG);
    expect(plan.groups).toBe(1);
    expect(plan.missing).toEqual([]);
    expect(plan.toCreate).toEqual([
      { tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: -150.25, taxAmount: 0 },
    ]);
  });

  it('skips a group that already has its compensatory row with exactly that base', () => {
    const rows = [
      { id: 'r1', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 100, serverRate: 21 },
      { id: 'c1', tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: -100, serverRate: 0 },
    ];
    expect(planCompensatoryLines(rows, rateOf, CATALOG).toCreate).toEqual([]);
  });

  it('reports each import tax without a compensatory tax once in missing', () => {
    const rows = [
      { id: 'r1', tax: 'imp4', taxLabel: 'Importaciones 4%', taxableAmount: 10, serverRate: 4 },
      { id: 'r2', tax: 'imp4', taxLabel: 'Importaciones 4%', taxableAmount: 20, serverRate: 4 },
    ];
    const plan = planCompensatoryLines(rows, rateOf, CATALOG);
    expect(plan.toCreate).toEqual([]);
    expect(plan.missing).toEqual(['Importaciones 4%']);
  });

  it('with Multiple DUA groups per tax and DUA, each line carrying its DUA and date', () => {
    const rows = [
      { id: 'r1', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 100, serverRate: 21, aeatsiiDua: ' DUA-A ', aeatsiiFechaDua: '2026-11-01' },
      { id: 'r2', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 40, serverRate: 21, aeatsiiDua: 'DUA-B', aeatsiiFechaDua: '2026-11-02' },
      { id: 'r3', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 60, serverRate: 21, aeatsiiDua: 'DUA-B', aeatsiiFechaDua: '2026-11-02' },
      // DUA-A already compensated: same tax, same base, same DUA.
      { id: 'c1', tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: -100, serverRate: 0, aeatsiiDua: 'DUA-A' },
    ];
    const plan = planCompensatoryLines(rows, rateOf, CATALOG, true);
    expect(plan.groups).toBe(2);
    expect(plan.toCreate).toEqual([{
      tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: -100, taxAmount: 0,
      aeatsiiDua: 'DUA-B', aeatsiiFechaDua: '2026-11-02',
    }]);
  });

  it('without Multiple DUA the DUA is ignored: rows of one tax form a single group', () => {
    const rows = [
      { id: 'r1', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 100, serverRate: 21, aeatsiiDua: 'DUA-A' },
      { id: 'r2', tax: 'imp21', taxLabel: 'Importaciones 21%', taxableAmount: 40, serverRate: 21, aeatsiiDua: 'DUA-B' },
    ];
    const plan = planCompensatoryLines(rows, rateOf, CATALOG, false);
    expect(plan.groups).toBe(1);
    expect(plan.toCreate).toEqual([{ tax: 'comp21', taxLabel: 'Importaciones 21%=0%', taxableAmount: -140, taxAmount: 0 }]);
  });
});

describe('parseRate / rateLabel — the Tipo column', () => {
  it('parseRate accepts numbers and "10", "10%", "5,2 %" strings; null otherwise', () => {
    expect(parseRate(21)).toBe(21);
    expect(parseRate('10%')).toBe(10);
    expect(parseRate('5,2 %')).toBe(5.2);
    expect(parseRate('-3')).toBe(-3);
    expect(parseRate('')).toBeNull();
    expect(parseRate(null)).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate(Number.NaN)).toBeNull();
  });

  it('rateLabel prefers the selector rate, falls back to the saved rate, else a dash', () => {
    expect(rateLabel({ tax: 't1', serverRate: 7 }, { t1: '21%' })).toBe('21%');
    expect(rateLabel({ tax: 't1', serverRate: 7 }, {})).toBe('7%');
    expect(rateLabel({ tax: '', serverRate: null }, { t1: '21' })).toBe('—');
  });
});

describe('useSiiDeferredVat — the compensatory line is offered only on deferred VAT', () => {
  const jsonResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
  const props = { apiBaseUrl: '/sws/neo/purchase-invoice', recordId: 'inv 1', enabled: true, refreshKey: 'k1' };

  beforeEach(() => { mockApiFetch.mockReset(); });

  it('is false while loading, then true when the action answers deferredVat: true', async () => {
    let resolve;
    mockApiFetch.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useSiiDeferredVat(props));
    expect(result.current).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith('/header/inv%201/action/siiDeferredVat');
    resolve(jsonResponse({ deferredVat: true }));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false on a non-OK answer, a rejected request, or a non-true value', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ deferredVat: true }, false));
    const a = renderHook(() => useSiiDeferredVat(props));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(a.result.current).toBe(false);

    mockApiFetch.mockRejectedValueOnce(new Error('network'));
    const b = renderHook(() => useSiiDeferredVat(props));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(b.result.current).toBe(false);

    mockApiFetch.mockResolvedValueOnce(jsonResponse({ deferredVat: 'Y' }));
    const c = renderHook(() => useSiiDeferredVat(props));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    expect(c.result.current).toBe(false);
  });

  it('does not ask the server when disabled (not F5/LC, flag off) or the record is unsaved', () => {
    const a = renderHook(() => useSiiDeferredVat({ ...props, enabled: false }));
    const b = renderHook(() => useSiiDeferredVat({ ...props, recordId: null }));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(a.result.current).toBe(false);
    expect(b.result.current).toBe(false);
  });

  it('drops back to false when it becomes disabled, and refetches on a new refreshKey', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ deferredVat: true }));
    const { result, rerender } = renderHook(p => useSiiDeferredVat(p), { initialProps: props });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ ...props, refreshKey: 'k2' });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    rerender({ ...props, refreshKey: 'k2', enabled: false });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
