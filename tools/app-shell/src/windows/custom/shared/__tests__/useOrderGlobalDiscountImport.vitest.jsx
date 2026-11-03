// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx
// @covers tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx
// @covers tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx

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

import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatCurrency.js';
import useOrderGlobalDiscountImport from '../useOrderGlobalDiscountImport.jsx';
import InvoiceOrderImportModal from '../InvoiceOrderImportModal.jsx';

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

// The ONE order-import popup of sales and purchase invoices (InvoiceOrderImportModal), with the real
// ImportLinesModal and hook: the selection the modal computes is the one the decision runs on, and
// the import is a single server action per direction — never a line POST nor a header PATCH.
// Server path (importVia 'server'): sales. Purchases go through the client path below until QA
// decides the draft-pending rule (MCP-2); flipping them back adds their row here again.
describe.each([
  { direction: 'sales', invoiceSpec: 'sales-invoice', orderSpec: 'sales-order', titleKey: 'importFromSalesOrder' },
])('InvoiceOrderImportModal ($direction, server path)', ({ direction, invoiceSpec, orderSpec, titleKey }) => {
  const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

  function renderModal({ orders, importRes = ok({ importedCount: 1 }) }) {
    mockApiFetch.mockImplementation(async (url, opts) => {
      if (url.includes(`/${orderSpec}/header?`)) {
        return ok(orders.map(o => ({
          id: o.id, documentNo: o.id, documentStatus: 'CO', businessPartner: 'bp-1', invoiceStatus: 0,
          currency: 'EUR', etgoTotalDiscount: o.pct, orderDate: '2026-10-30',
        })));
      }
      if (url.includes(`/${invoiceSpec}/lines?parentId=`)) return ok([]);
      if (url.endsWith(`/${invoiceSpec}/header/inv-1`)) return ok([{ currency: 'EUR', etgoTotalDiscount: 0 }]);
      if (url.includes(`/${orderSpec}/lines?parentId=`)) {
        const docId = new URL(url, 'http://x').searchParams.get('parentId');
        return ok([{ id: `${docId}-l1`, 'product$_identifier': `Product ${docId}`, orderedQuantity: 1, invoicedQuantity: 0, unitPrice: 100 }]);
      }
      if (url.endsWith('/action/availableOrderLines')) {
        return ok([{ id: `${JSON.parse(opts.body).orderId}-l1`, pendingQuantity: 1 }]);
      }
      if (url.endsWith('/action/importOrderLines')) return importRes;
      throw new Error(`Unexpected request ${opts?.method || 'GET'} ${url}`);
    });
    const onSuccess = vi.fn();
    render(
      <InvoiceOrderImportModal
        direction={direction}
        invoiceId="inv-1"
        bpId="bp-1"
        base={BASE}
        headers={{}}
        onClose={vi.fn()}
        onSuccess={onSuccess} />,
    );
    return { onSuccess };
  }

  async function selectAllOrders(orders) {
    // One line of 1 × 100 per order; the row shows the plain sum of its lines (100), the order's
    // global discount is only signalled by the badge (ETP-5828, QA obs. 3).
    const total = formatCurrency(undefined, 100);
    await waitFor(() => expect(screen.getAllByText(total)).toHaveLength(orders.length));
    fireEvent.click(screen.getByTestId('ImportLinesModal__selectAll'));
  }

  const importCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/importOrderLines'));
  const writeCalls = () => mockApiFetch.mock.calls.filter(([url, opts]) => (
    opts?.method === 'PATCH' || (opts?.method === 'POST' && !url.includes('/action/'))));

  it('carries a single order %: tag, undiscounted row total, toggle in the notice area, ONE import call and the carried toast', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }];
    // The toast reports the % the SERVER says it applied (12.5 here), not the popup's prediction.
    const { onSuccess } = renderModal({
      orders,
      importRes: ok({ importedCount: 1, globalDiscount: { applied: true, percent: 12.5, reason: null } }),
    });
    expect(screen.getByText(titleKey)).toBeInTheDocument();
    await selectAllOrders(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__tag')).toHaveTextContent('importGlobalDiscountTag:{"pct":"10"}');
    expect(screen.queryByText(formatCurrency(undefined, 90))).toBeNull();
    expect(screen.getByTestId('ImportLinesModal__selectionPanelSlot'))
      .toContainElement(screen.getByTestId('ImportGlobalDiscount__toggle'));
    expect(screen.getByTestId('ImportLinesModal__selectionHint')).toHaveTextContent('importOrdersSelectedCount:{"count":1}');

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(importCalls()).toHaveLength(1);
    const [url, opts] = importCalls()[0];
    expect(url).toBe(`${BASE}/${invoiceSpec}/header/inv-1/action/importOrderLines`);
    expect(JSON.parse(opts.body)).toEqual({
      orders: [{ orderId: 'SO-A', lines: [{ sourceLineId: 'SO-A-l1', quantity: 1 }] }],
      carryGlobalDiscount: true,
    });
    expect(writeCalls()).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountImportedOne:{"count":1,"pct":"12,5"}');
  });

  it('toggle ON by default; switched OFF the import asks the server not to carry and says «sin descuento global»', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders });
    await selectAllOrders(orders);

    const toggle = screen.getByTestId('ImportGlobalDiscount__switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(JSON.parse(importCalls()[0][1].body).carryGlobalDiscount).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountNotCarriedOne:{"count":1}');
  });

  it('orders at 10 % + 0 % show the mixed warning, count two orders and send carryGlobalDiscount false', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }];
    const { onSuccess } = renderModal({ orders, importRes: ok({ importedCount: 2 }) });
    await selectAllOrders(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__warning')).toHaveTextContent('importGlobalDiscountMixedTitle');
    expect(screen.getByTestId('ImportLinesModal__import')).toHaveTextContent('importSelectedOrders:{"count":" (2)"}');

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(JSON.parse(importCalls()[0][1].body)).toEqual({
      orders: [
        { orderId: 'SO-A', lines: [{ sourceLineId: 'SO-A-l1', quantity: 1 }] },
        { orderId: 'SO-B', lines: [{ sourceLineId: 'SO-B-l1', quantity: 1 }] },
      ],
      carryGlobalDiscount: false,
    });
  });

  it('a refused import keeps the popup open, shows the translated refusal and creates nothing else', async () => {
    const orders = [{ id: 'SO-A', pct: 0 }];
    const { onSuccess } = renderModal({
      orders,
      importRes: { ok: false, json: async () => ({ error: { code: 'importSomethingNew', message: 'English' } }) },
    });
    await selectAllOrders(orders);
    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('failedToImportLines'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(writeCalls()).toEqual([]);
  });
});

// Client path (importVia 'client'): purchases, restored as before the unification while MCP-2 is
// open — pending from the order lines, one line POST each, then the header % PATCHed from the
// browser. Same popup, same notice and toasts as sales.
describe('InvoiceOrderImportModal (purchase, client path)', () => {
  const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

  function renderModal({ orders, patchOk = true }) {
    mockApiFetch.mockImplementation(async (url, opts) => {
      if (url.includes('/purchase-order/header?')) {
        return ok(orders.map(o => ({
          id: o.id, documentNo: o.id, documentStatus: 'CO', businessPartner: 'bp-1', invoiceStatus: 0,
          currency: 'EUR', etgoTotalDiscount: o.pct, orderDate: '2026-10-30',
        })));
      }
      if (url.includes('/purchase-invoice/lines?parentId=')) return ok([]);
      if (url.endsWith('/purchase-invoice/header/inv-1')) {
        if (opts?.method === 'PATCH') return { ok: patchOk };
        return ok([{ currency: 'EUR', etgoTotalDiscount: 0, updated: 'X' }]);
      }
      if (url.includes('/purchase-order/lines?parentId=')) {
        const docId = new URL(url, 'http://x').searchParams.get('parentId');
        // Ordered 3, invoiced 1: the client pending is 2 (no draft subtraction, no action call).
        return ok([{ id: `${docId}-l1`, 'product$_identifier': `Product ${docId}`, product: 'p1',
          orderedQuantity: 3, invoicedQuantity: 1, unitPrice: 50, listPrice: 50, tax: 't1', uOM: 'u1' }]);
      }
      if (url === '/purchase-invoice/lines' && opts?.method === 'POST') {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'new' }] } }) };
      }
      throw new Error(`Unexpected request ${opts?.method || 'GET'} ${url}`);
    });
    const onSuccess = vi.fn();
    render(
      <InvoiceOrderImportModal direction="purchase" invoiceId="inv-1" bpId="bp-1" base={BASE}
        headers={{}} onClose={vi.fn()} onSuccess={onSuccess} />,
    );
    return { onSuccess };
  }

  async function selectAllAndImport(orders) {
    const total = formatCurrency(undefined, 100); // 50 × pending 2
    await waitFor(() => expect(screen.getAllByText(total)).toHaveLength(orders.length));
    fireEvent.click(screen.getByTestId('ImportLinesModal__selectAll'));
  }

  const calls = (pred) => mockApiFetch.mock.calls.filter(pred);
  const linePosts = () => calls(([url, opts]) => url === '/purchase-invoice/lines' && opts?.method === 'POST');
  const patches = () => calls(([, opts]) => opts?.method === 'PATCH');
  const actionCalls = () => calls(([url]) => url.includes('/action/'));

  it('carries the order %: one line POST per line, then the header PATCH, and the carried toast', async () => {
    const orders = [{ id: 'PO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders });
    await selectAllAndImport(orders);
    expect(screen.getByTestId('ImportGlobalDiscount__toggle')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(actionCalls()).toEqual([]);
    expect(linePosts()).toHaveLength(1);
    expect(JSON.parse(linePosts()[0][1].body)).toMatchObject({
      parentId: 'inv-1', product: 'p1', invoicedQuantity: 2, unitPrice: 50, salesOrderLine: 'PO-A-l1',
    });
    expect(patches()).toEqual([[`${BASE}/purchase-invoice/header/inv-1`, {
      method: 'PATCH', body: JSON.stringify({ etgoTotalDiscount: 10, updated: 'X' }),
    }]]);
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountImportedOne:{"count":1,"pct":"10"}');
  });

  it('with the toggle OFF it POSTs the lines, never PATCHes, and says «sin descuento global»', async () => {
    const orders = [{ id: 'PO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders });
    await selectAllAndImport(orders);
    fireEvent.click(screen.getByTestId('ImportGlobalDiscount__switch'));

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(linePosts()).toHaveLength(1);
    expect(patches()).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountNotCarriedOne:{"count":1}');
  });

  it('a failed header PATCH keeps the lines and warns that the % was not applied', async () => {
    const orders = [{ id: 'PO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders, patchOk: false });
    await selectAllAndImport(orders);

    fireEvent.click(screen.getByTestId('ImportLinesModal__import'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(patches()).toHaveLength(1);
    expect(toast.warning).toHaveBeenCalledWith('importGlobalDiscountPatchFailed:{"pct":"10"}');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
