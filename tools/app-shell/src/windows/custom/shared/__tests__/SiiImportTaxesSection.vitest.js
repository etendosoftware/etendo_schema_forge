// @covers tools/app-shell/src/windows/custom/shared/SiiImportTaxesSection.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every backend call goes through useApiFetch (docs/request-policy.md) — mock that boundary.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

const flag = { enabled: true };
// The feature is the `siiImportDua` capability (backend flag sii-import-dua), read off the auth map.
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => ({ siiImportDua: flag.enabled }) }));
vi.mock('@/i18n', () => ({
  useLabel: () => key => key,
  useMenuLabel: () => key => key,
  useUI: () => key => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendErrorResponse: async () => 'backend-error' }));

// Child controls stubbed at their contract: the picker reports a tax, the amount input commits a
// parsed number, the delete dialog confirms.
vi.mock('@/components/contract-ui/SelectorInput.jsx', async () => {
  const { createElement } = await import('react');
  return {
    SelectorInput: ({ onChange, 'data-testid': testId }) => createElement('button', {
      type: 'button', 'data-testid': 'stub-selector-pick', 'data-root': testId,
      onClick: () => onChange('imp21', 'Importaciones 21%'),
    }, testId),
  };
});
vi.mock('@/components/forms/fields.jsx', async () => {
  const { createElement } = await import('react');
  return {
    MaskedAmountInput: ({ onCommit, 'aria-invalid': invalid, 'data-testid': testId }) => createElement('input', {
      'data-testid': testId, 'aria-invalid': invalid,
      onChange: e => onCommit(e.target.value === '' ? null : Number(e.target.value)),
    }),
  };
});
vi.mock('@/components/contract-ui/DeleteConfirmDialog.jsx', async () => {
  const { createElement } = await import('react');
  return {
    DeleteConfirmDialog: ({ open, onConfirm }) => (open
      ? createElement('button', { type: 'button', 'data-testid': 'stub-delete-confirm', onClick: onConfirm }, 'confirm')
      : null),
  };
});

import { createElement as h } from 'react';
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import SiiImportTaxesSection from '../SiiImportTaxesSection.jsx';
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

describe('SiiImportTaxesSection — the card', () => {
  const ui = key => key;
  const RECORD = 'inv-1';
  const SERVER_ROW = {
    id: 'tl-1', tax: 'imp21', 'tax$_identifier': 'Importaciones 21%', 'tax$rate': 21,
    taxableAmount: 100, taxAmount: 21, recalculate: false, lineNo: 20,
  };
  const AUTO_ROW = { id: 'tl-auto', tax: 'iva21', recalculate: true, lineNo: 30, taxableAmount: 5, taxAmount: 1 };
  let serverRows;
  let writeResponses;

  function respond(body, ok = true) {
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body });
  }

  function routeApi() {
    mockApiFetch.mockImplementation((url, opts = {}) => {
      const method = opts.method ?? 'GET';
      if (url.includes('/lines/selectors/tax')) {
        return respond({ items: [
          { id: 'imp21', label: 'Importaciones 21%', labelPrefix: '21%' },
          { id: 'comp21', label: 'Importaciones 21%=0%', labelPrefix: '0%' },
        ] });
      }
      if (url.startsWith('/tax?parentId=')) return respond({ response: { data: serverRows } });
      if (url === '/tax/callout') return respond({ updates: { taxAmount: { value: 21 } } });
      const custom = writeResponses[method];
      if (custom) return custom(url, opts);
      return respond({ response: { data: [{ id: 'tl-new' }] } });
    });
  }

  function renderCard(props = {}) {
    const onHeaderRefresh = vi.fn();
    const utils = render(h(SiiImportTaxesSection, {
      ui, siiTypeKey: 'F5', multiDua: false, recordId: RECORD, data: { id: RECORD }, apiBaseUrl: '/api/purchase-invoice',
      token: 't', readOnly: false, onHeaderRefresh, step: 2, ...props,
    }));
    return { ...utils, onHeaderRefresh };
  }

  const writes = method => mockApiFetch.mock.calls.filter(([, o]) => o?.method === method);

  beforeEach(() => {
    flag.enabled = true;
    serverRows = [AUTO_ROW];
    writeResponses = {};
    mockApiFetch.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    routeApi();
  });

  it('renders nothing with the flag off or a type other than F5/LC', () => {
    flag.enabled = false;
    expect(renderCard().container).toBeEmptyDOMElement();
    flag.enabled = true;
    expect(renderCard({ siiTypeKey: 'F1' }).container).toBeEmptyDOMElement();
    expect(renderCard({ siiTypeKey: 'F6' }).container).toBeEmptyDOMElement();
  });

  it('asks to save the invoice first while it is unsaved, with no request', () => {
    renderCard({ recordId: null });
    expect(screen.getByTestId('SiiImportTaxesSection__saveFirst')).toHaveTextContent('sifDataTabs.importTaxes.saveFirst');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('read-only invoice: manual rows render as text, with no inputs, add or delete', async () => {
    serverRows = [SERVER_ROW, AUTO_ROW];
    renderCard({ readOnly: true });
    expect(await screen.findByTestId('SiiImportTaxesSection__row_tl-1')).toHaveTextContent('Importaciones 21%');
    expect(screen.queryByTestId('SiiImportTaxesSection__row_tl-auto')).toBeNull();
    expect(screen.queryByTestId('SelectorInput__siiImportTax')).toBeNull();
    expect(screen.queryByTestId('MaskedAmountInput__siiImportTaxBase')).toBeNull();
    expect(screen.queryByTestId('Button__siiImportTaxAdd')).toBeNull();
    expect(screen.queryByTestId('Button__siiImportTaxDelete')).toBeNull();
  });

  it('a draft row stays local and marked until complete, then is POSTed once', async () => {
    const { onHeaderRefresh } = renderCard();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/tax\?parentId=inv-1/)));
    fireEvent.click(screen.getByTestId('Button__siiImportTaxAdd'));
    // Tax picked, base still empty: nothing is sent, the base cell is flagged.
    fireEvent.click(screen.getByTestId('stub-selector-pick'));
    await waitFor(() => expect(screen.getByTestId('MaskedAmountInput__siiImportTaxBase')).toHaveAttribute('aria-invalid', 'true'));
    expect(writes('POST').filter(([u]) => u === '/tax')).toHaveLength(0);

    serverRows = [AUTO_ROW, { ...SERVER_ROW, id: 'tl-new', lineNo: 40 }];
    fireEvent.change(screen.getByTestId('MaskedAmountInput__siiImportTaxBase'), { target: { value: '100' } });
    await waitFor(() => expect(onHeaderRefresh).toHaveBeenCalledTimes(1));
    const posts = writes('POST').filter(([u]) => u === '/tax');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toEqual({
      tax: 'imp21', taxableAmount: 100, taxAmount: 21, parentId: 'inv-1', lineNo: 40, recalculate: false,
    });
  });

  it('a saved row PATCHes only when a value really changed', async () => {
    serverRows = [SERVER_ROW, AUTO_ROW];
    const { onHeaderRefresh } = renderCard();
    const base = await screen.findByTestId('MaskedAmountInput__siiImportTaxBase');
    fireEvent.change(base, { target: { value: '100' } });
    expect(writes('PATCH')).toHaveLength(0);

    fireEvent.change(base, { target: { value: '200' } });
    await waitFor(() => expect(writes('PATCH')).toHaveLength(1));
    expect(writes('PATCH')[0][0]).toBe('/tax/tl-1');
    expect(JSON.parse(writes('PATCH')[0][1].body)).toEqual({ tax: 'imp21', taxableAmount: 200, taxAmount: 21 });
    await waitFor(() => expect(onHeaderRefresh).toHaveBeenCalledTimes(1));
  });

  it('deletes a saved row only after confirmation, then refreshes the header', async () => {
    serverRows = [SERVER_ROW, AUTO_ROW];
    const { onHeaderRefresh } = renderCard();
    fireEvent.click(await screen.findByTestId('Button__siiImportTaxDelete'));
    expect(writes('DELETE')).toHaveLength(0);
    serverRows = [AUTO_ROW];
    fireEvent.click(screen.getByTestId('stub-delete-confirm'));
    await waitFor(() => expect(onHeaderRefresh).toHaveBeenCalledTimes(1));
    expect(writes('DELETE').map(([u]) => u)).toEqual(['/tax/tl-1']);
    expect(toast.success).toHaveBeenCalledWith('sifDataTabs.importTaxes.deleted');
    await waitFor(() => expect(screen.queryByTestId('SiiImportTaxesSection__row_tl-1')).toBeNull());
  });

  it('offers the compensatory line only on deferred VAT and POSTs it with a negative base', async () => {
    serverRows = [SERVER_ROW, AUTO_ROW];
    const { unmount } = renderCard({ deferredVat: false });
    await screen.findByTestId('SiiImportTaxesSection__row_tl-1');
    expect(screen.queryByTestId('Button__siiImportTaxCompensate')).toBeNull();
    unmount();

    const { onHeaderRefresh } = renderCard({ deferredVat: true });
    const button = await screen.findByTestId('Button__siiImportTaxCompensate');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(onHeaderRefresh).toHaveBeenCalled());
    const posts = writes('POST').filter(([u]) => u === '/tax');
    expect(JSON.parse(posts[0][1].body)).toEqual({
      tax: 'comp21', taxableAmount: -100, taxAmount: 0, parentId: 'inv-1', lineNo: 40, recalculate: false,
    });
    expect(toast.success).toHaveBeenCalledWith('sifDataTabs.importTaxes.compensatoryAdded');
  });

  it('a failed compensatory POST shows the error and no success toast', async () => {
    serverRows = [SERVER_ROW, AUTO_ROW];
    writeResponses.POST = () => respond({ error: 'x' }, false);
    renderCard({ deferredVat: true });
    const button = await screen.findByTestId('Button__siiImportTaxCompensate');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('backend-error'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('Multiple DUA: warns when any row has a DUA date after the accounting register date', async () => {
    const dated = (id, date) => ({ ...SERVER_ROW, id, aeatsiiDua: `DUA-${id}`, aeatsiiFechaDua: date });
    const hint = () => screen.queryByTestId('SiiImportTaxesSection__dateHint');
    const cases = [
      { rows: [dated('a', '2026-11-04'), dated('b', '2026-11-06')], reg: '2026-11-05', shown: true },
      { rows: [dated('a', '2026-11-04'), dated('b', '2026-11-05')], reg: '2026-11-05', shown: false },
      { rows: [dated('a', '2026-11-06')], reg: null, shown: false },
      { rows: [dated('a', '')], reg: '2026-11-05', shown: false },
    ];
    for (const { rows, reg, shown } of cases) {
      serverRows = [...rows, AUTO_ROW];
      const { unmount } = renderCard({ multiDua: true, readOnly: true, accountingRegisterDate: reg });
      await screen.findByTestId('SiiImportTaxesSection__row_a');
      if (shown) expect(hint()).toHaveTextContent('sifDataTabs.dua.dateAfterAccountingDate');
      else expect(hint()).toBeNull();
      unmount();
    }
  });

  it('without Multiple DUA the per-row date warning is never shown', async () => {
    serverRows = [{ ...SERVER_ROW, id: 'a', aeatsiiFechaDua: '2026-11-06' }, AUTO_ROW];
    renderCard({ multiDua: false, readOnly: true, accountingRegisterDate: '2026-11-05' });
    await screen.findByTestId('SiiImportTaxesSection__row_a');
    expect(screen.queryByTestId('SiiImportTaxesSection__dateHint')).toBeNull();
  });
});
