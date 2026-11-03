// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate: _indeterminate, onChange, disabled, 'data-testid': _ignored, ...rest }) => (
    <input
      type="checkbox"
      data-testid="checkbox"
      checked={checked || false}
      disabled={disabled || false}
      onChange={onChange || (() => {})}
      {...rest}
    />
  ),
}));

import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';
import useOrderGlobalDiscountImport from '../useOrderGlobalDiscountImport.jsx';

const BASE = '/sws/neo';

const HEADER_ENDPOINT = 'purchase-invoice/header';

function hookProps() {
  return renderHook(() => useOrderGlobalDiscountImport()).result.current;
}

/** The hook as the client import path uses it: with a header endpoint, so it has afterImport. */
function clientHookProps() {
  return renderHook(() => useOrderGlobalDiscountImport({ headerEndpoint: HEADER_ENDPOINT })).result.current;
}

/**
 * A `selection` as ImportLinesModal builds it. `orders` = [{ id, pct }] (documentNo = id).
 */
function selection({ orders = [], invoicePct = null, invoiceHasLines = false, invoiceStateKnown = true, carryOn, selectedCount = 1 } = {}) {
  const docs = orders.map(o => ({ id: o.id, documentNo: o.id }));
  return {
    selectedDocuments: docs,
    selectedDocIds: new Set(docs.map(d => d.id)),
    selectedCount,
    documents: docs,
    sharedContext: {
      orderDiscountMap: Object.fromEntries(orders.map(o => [o.id, o.pct])),
      invoiceGlobalDiscount: invoicePct,
      invoiceHasLines,
      invoiceStateKnown,
    },
    extraState: carryOn === undefined ? undefined : { carryGlobalDiscount: carryOn },
    setExtraState: vi.fn(),
  };
}

function renderPanel(sel) {
  const node = hookProps().renderSelectionPanel(sel);
  render(<div data-testid="host">{node}</div>);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
});

describe('useOrderGlobalDiscountImport — document row', () => {
  it.each([
    [10, 'importGlobalDiscountTag:{"pct":"10"}'],
    [0, null],
    [undefined, null],
  ])('order at %s %% → tag %s', (pct, expected) => {
    const sel = selection({ orders: [{ id: 'SO-A', pct }] });
    render(<div data-testid="host">{hookProps().renderDocAdornment({ id: 'SO-A' }, sel)}</div>);
    const tag = screen.queryByTestId('ImportGlobalDiscount__tag');
    if (expected) {
      expect(tag).toHaveTextContent(expected);
      // The Figma pill colours, literally: a token-based background (bg-sidebar-accent, #F0F3FF)
      // disappeared against a selected row (#F1F5F9).
      expect(tag.className).toContain('bg-[#EBEFFF]');
      expect(tag.className).toContain('text-[#2B48BC]');
      expect(tag.className).not.toMatch(/(^| )bg-sidebar-accent|(^| )bg-muted/);
      // Readable in dark mode too: the light literals get dark-theme fallbacks.
      expect(tag.className).toContain('dark:bg-primary/25');
      expect(tag.className).toContain('dark:text-sidebar-accent-foreground');
    } else expect(tag).toBeNull();
  });
});

describe('useOrderGlobalDiscountImport — selection panel', () => {
  it('renders nothing when no selected order carries a % and the invoice has none', () => {
    expect(renderPanel(selection({ orders: [{ id: 'SO-A', pct: 0 }] }))).toBeNull();
  });

  it('renders nothing (no toggle, no warning) when the invoice header or lines could not be read', () => {
    expect(renderPanel(selection({ orders: [{ id: 'SO-A', pct: 10 }], invoiceStateKnown: false }))).toBeNull();
  });

  it.each([
    {
      name: 'mixed, invoice without %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }] },
      texts: ['importGlobalDiscountMixedTitle', 'importGlobalDiscountMixedBody'],
      // Generic body (QA): no order list, and nothing appended — one key, one line.
      absent: ['SO-A', 'SO-B', 'importGlobalDiscountMixedBodyKeepsInvoice', 'importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'mixed, invoice with %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }], invoicePct: 5 },
      texts: ['importGlobalDiscountMixedTitle', 'importGlobalDiscountMixedBodyKeepsInvoice:{"invoicePct":"5"}'],
      absent: ['SO-A', 'importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice 5 % vs orders 0 %',
      sel: { orders: [{ id: 'SO-A', pct: 0 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"0","invoicePct":"5"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice 5 % vs orders 10 %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"10","invoicePct":"5"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice without % but with lines',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoiceHasLines: true },
      texts: [
        'importGlobalDiscountInvoiceHasLinesTitle',
        'importGlobalDiscountInvoiceHasLinesBody:{"pct":"10"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
  ])('warning ($name): title and its one-key body, no toggle', ({ sel, texts, absent = [] }) => {
    renderPanel(selection(sel));
    const warning = screen.getByTestId('ImportGlobalDiscount__warning');
    for (const text of texts) expect(warning.textContent).toContain(text);
    for (const text of absent) expect(warning.textContent).not.toContain(text);
    expect(screen.queryByTestId('ImportGlobalDiscount__switch')).toBeNull();
  });

  it.each([
    { carryOn: true, invoicePct: null, subtitle: 'importGlobalDiscountCarryApplies' },
    { carryOn: true, invoicePct: 10, subtitle: 'importGlobalDiscountCarryMatchesInvoice:{"pct":"10"}' },
    { carryOn: false, invoicePct: null, subtitle: 'importGlobalDiscountCarryOff' },
    { carryOn: false, invoicePct: 10, subtitle: 'importGlobalDiscountKeepsInvoice:{"invoicePct":"10"}' },
  ])('toggle ON=$carryOn, invoice %=$invoicePct → subtitle $subtitle', ({ carryOn, invoicePct, subtitle }) => {
    renderPanel(selection({ orders: [{ id: 'SO-A', pct: 10 }], invoicePct, carryOn }));
    const toggle = screen.getByTestId('ImportGlobalDiscount__toggle');
    expect(toggle).toHaveTextContent('importGlobalDiscountCarryTitle:{"pct":"10"}');
    expect(toggle.querySelector('p')).toHaveTextContent(subtitle);
    expect(screen.getByTestId('ImportGlobalDiscount__switch')).toHaveAttribute('aria-checked', String(carryOn));
  });

  it('turning the toggle off stores carryGlobalDiscount=false in the modal extra state', () => {
    const sel = selection({ orders: [{ id: 'SO-A', pct: 10 }], carryOn: true });
    renderPanel(sel);
    fireEvent.click(screen.getByTestId('ImportGlobalDiscount__switch'));
    const updater = sel.setExtraState.mock.calls[0][0];
    expect(updater({ other: 1, carryGlobalDiscount: true })).toEqual({ other: 1, carryGlobalDiscount: false });
  });
});

// Client import path (purchases, importVia 'client', until MCP-2 is decided): restored from the
// pre-unification suite. The header % is PATCHed from the browser after the line POSTs.
describe('useOrderGlobalDiscountImport — afterImport header PATCH (client path)', () => {
  const ORDERS = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }];

  function afterImportArgs({ selected, imported, invoicePct = null, invoiceHasLines = false, invoiceStateKnown = true, carryOn = true }) {
    const sel = selection({ orders: ORDERS, invoicePct, invoiceHasLines, invoiceStateKnown, carryOn });
    return {
      documents: sel.documents,
      sharedContext: sel.sharedContext,
      selectedDocIds: new Set(selected),
      importedDocIds: new Set(imported),
      extraState: sel.extraState,
      base: BASE,
      invoiceId: 'inv-1',
    };
  }

  it.each([
    { name: 'toggle off', args: { selected: ['SO-A'], imported: ['SO-A'], carryOn: false }, result: { carried: false } },
    { name: 'invoice already at the same %', args: { selected: ['SO-A'], imported: ['SO-A'], invoicePct: 10 }, result: { carried: true, pct: 10 } },
    { name: 'invoice-has-lines warning', args: { selected: ['SO-A'], imported: ['SO-A'], invoiceHasLines: true }, result: { carried: false } },
    { name: 'mixed selection whose 0 % order failed to import (B1)', args: { selected: ['SO-A', 'SO-B'], imported: ['SO-A'] }, result: { carried: false } },
    { name: 'nothing imported', args: { selected: ['SO-A'], imported: [] }, result: { carried: false } },
    { name: 'invoice header or lines could not be read', args: { selected: ['SO-A'], imported: ['SO-A'], invoiceStateKnown: false }, result: { carried: false } },
  ])('no PATCH: $name', async ({ args, result }) => {
    expect(await clientHookProps().afterImport(afterImportArgs(args))).toEqual(result);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  const HEADER_URL = `${BASE}/${HEADER_ENDPOINT}/inv-1`;
  const headerRead = (row) => ({ ok: true, json: async () => ({ response: { data: row ? [row] : [] } }) });
  const runCarry = () => clientHookProps().afterImport(afterImportArgs({ selected: ['SO-A'], imported: ['SO-A'] }));

  it('PATCHes the header with the % when the toggle is on and the invoice has none', async () => {
    mockApiFetch
      .mockResolvedValueOnce(headerRead({ etgoTotalDiscount: null, updated: 'X' }))
      .mockResolvedValueOnce({ ok: true });
    const result = await runCarry();
    expect(result).toEqual({ carried: true, pct: 10 });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[0]).toEqual([HEADER_URL]);
    expect(mockApiFetch.mock.calls[1]).toEqual([HEADER_URL, {
      method: 'PATCH',
      body: JSON.stringify({ etgoTotalDiscount: 10, updated: 'X' }),
    }]);
  });

  it.each([
    ['0', 0],
    ['null', null],
  ])('re-read with etgoTotalDiscount %s → PATCH carries the fresh updated', async (_name, current) => {
    mockApiFetch
      .mockResolvedValueOnce(headerRead({ etgoTotalDiscount: current, updated: '2025-01-15T10:00:00Z' }))
      .mockResolvedValueOnce({ ok: true });
    expect(await runCarry()).toEqual({ carried: true, pct: 10 });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ etgoTotalDiscount: 10, updated: '2025-01-15T10:00:00Z' });
  });

  it.each([
    ['answers not ok', () => mockApiFetch.mockResolvedValueOnce({ ok: false })],
    ['throws', () => mockApiFetch.mockRejectedValueOnce(new Error('network'))],
    ['returns no row', () => mockApiFetch.mockResolvedValueOnce(headerRead(null))],
    ['shows a % set meanwhile (5)', () => mockApiFetch.mockResolvedValueOnce(headerRead({ etgoTotalDiscount: 5, updated: 'X' }))],
  ])('reports failedPct without PATCH when the header re-read %s', async (_name, arrange) => {
    arrange();
    expect(await runCarry()).toEqual({ carried: false, failedPct: 10 });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0]).toEqual([HEADER_URL]);
  });

  it.each([
    ['answers not ok', () => mockApiFetch.mockResolvedValueOnce({ ok: false })],
    ['rejects', () => mockApiFetch.mockRejectedValueOnce(new Error('network'))],
  ])('reports failedPct when the PATCH %s', async (_name, arrange) => {
    mockApiFetch.mockResolvedValueOnce(headerRead({ etgoTotalDiscount: null, updated: 'X' }));
    arrange();
    expect(await runCarry()).toEqual({ carried: false, failedPct: 10 });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[1][1].method).toBe('PATCH');
  });
});

describe('useOrderGlobalDiscountImport — success toast', () => {
  it.each([
    { name: 'client PATCH failed', args: { count: 1, afterImportResult: { carried: false, failedPct: 10 } }, expected: { message: 'importGlobalDiscountPatchFailed:{"pct":"10"}', variant: 'warning' } },
    { name: 'client PATCH failed on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: false, failedPct: 10 } }, expected: { message: 'importGlobalDiscountPatchFailed:{"pct":"10"}', variant: 'warning' } },
    { name: 'carried, one line', args: { count: 1, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedOne:{"count":1,"pct":"10"}' } },
    { name: 'carried, many lines', args: { count: 2, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedMany:{"count":2,"pct":"10"}' } },
    { name: 'carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: true, pct: 10 } }, expected: null },
    // QA: the order import never falls back to the generic «Líneas importadas desde pedido».
    { name: 'not carried, one line', args: { count: 1, afterImportResult: { carried: false } }, expected: { message: 'importGlobalDiscountNotCarriedOne:{"count":1}' } },
    { name: 'not carried, many lines', args: { count: 3, afterImportResult: { carried: false } }, expected: { message: 'importGlobalDiscountNotCarriedMany:{"count":3}' } },
    { name: 'not carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: false } }, expected: null },
  ])('$name', ({ args, expected }) => {
    expect(hookProps().getSuccessToast(args)).toEqual(expected);
  });
});
