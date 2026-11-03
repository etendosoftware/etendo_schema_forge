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

function hookProps() {
  return renderHook(() => useOrderGlobalDiscountImport()).result.current;
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
    if (expected) expect(tag).toHaveTextContent(expected);
    else expect(tag).toBeNull();
  });

  it.each([
    [10, 90],
    [0, 100],
  ])('order at %s %% shows a header total of %s for 100 in lines', (pct, expected) => {
    const { sharedContext } = selection({ orders: [{ id: 'SO-A', pct }] });
    expect(hookProps().getDocTotal({ doc: { id: 'SO-A' }, total: 100, sharedContext })).toBe(expected);
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
      texts: [
        'importGlobalDiscountMixedTitle',
        'importGlobalDiscountMixedBody:{"orders":"importGlobalDiscountOrderEntry:{\\"docNo\\":\\"SO-A\\",\\"pct\\":\\"10\\"} · importGlobalDiscountOrderEntry:{\\"docNo\\":\\"SO-B\\",\\"pct\\":\\"0\\"}"}',
        'importGlobalDiscountNotCarried',
      ],
    },
    {
      name: 'mixed, invoice with %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }], invoicePct: 5 },
      texts: ['importGlobalDiscountMixedTitle', 'importGlobalDiscountKeepsInvoice:{"invoicePct":"5"}'],
    },
    {
      name: 'invoice 5 % vs orders 0 %',
      sel: { orders: [{ id: 'SO-A', pct: 0 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"0","invoicePct":"5"}',
        'importGlobalDiscountKeepsInvoice:{"invoicePct":"5"}',
      ],
    },
    {
      name: 'invoice 5 % vs orders 10 %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"10","invoicePct":"5"}',
        'importGlobalDiscountKeepsInvoice:{"invoicePct":"5"}',
      ],
    },
    {
      name: 'invoice without % but with lines',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoiceHasLines: true },
      texts: [
        'importGlobalDiscountInvoiceHasLinesTitle',
        'importGlobalDiscountInvoiceHasLinesBody:{"pct":"10"}',
        'importGlobalDiscountNotCarried',
      ],
    },
  ])('warning ($name): title, body and closing sentence, no toggle', ({ sel, texts }) => {
    renderPanel(selection(sel));
    const warning = screen.getByTestId('ImportGlobalDiscount__warning');
    for (const text of texts) expect(warning.textContent).toContain(text);
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

describe('useOrderGlobalDiscountImport — success toast', () => {
  it.each([
    { name: 'carried, one line', args: { count: 1, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedOne:{"count":1,"pct":"10"}' } },
    { name: 'carried, many lines', args: { count: 2, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedMany:{"count":2,"pct":"10"}' } },
    { name: 'carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: true, pct: 10 } }, expected: null },
    { name: 'not carried', args: { count: 1, afterImportResult: { carried: false } }, expected: null },
  ])('$name', ({ args, expected }) => {
    expect(hookProps().getSuccessToast(args)).toEqual(expected);
  });
});

// The ONE order-import popup of sales and purchase invoices (InvoiceOrderImportModal), with the real
// ImportLinesModal and hook: the selection the modal computes is the one the decision runs on, and
// the import is a single server action per direction — never a line POST nor a header PATCH.
describe.each([
  { direction: 'sales', invoiceSpec: 'sales-invoice', orderSpec: 'sales-order', titleKey: 'importFromSalesOrder', successKey: 'linesImportedFromSalesOrder' },
  { direction: 'purchase', invoiceSpec: 'purchase-invoice', orderSpec: 'purchase-order', titleKey: 'importFromPurchaseOrder', successKey: 'linesImportedFromPurchaseOrder' },
])('InvoiceOrderImportModal ($direction)', ({ direction, invoiceSpec, orderSpec, titleKey, successKey }) => {
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
    // Every line is 100; the row total is shown once the eager line load has finished.
    const totals = orders.map(o => formatCurrency(undefined, o.pct > 0 ? 90 : 100));
    await waitFor(() => {
      for (const total of new Set(totals)) {
        expect(screen.getAllByText(total)).toHaveLength(totals.filter(t => t === total).length);
      }
    });
    fireEvent.click(screen.getByTestId('ImportLinesModal__selectAll'));
  }

  const importCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/importOrderLines'));
  const writeCalls = () => mockApiFetch.mock.calls.filter(([url, opts]) => (
    opts?.method === 'PATCH' || (opts?.method === 'POST' && !url.includes('/action/'))));

  it('carries a single order %: tag, discounted total, toggle in the notice area, ONE import call and the carried toast', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders });
    expect(screen.getByText(titleKey)).toBeInTheDocument();
    await selectAllOrders(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__tag')).toHaveTextContent('importGlobalDiscountTag:{"pct":"10"}');
    expect(screen.getByText(formatCurrency(undefined, 90))).toBeInTheDocument();
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
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountImportedOne:{"count":1,"pct":"10"}');
  });

  it('toggle ON by default; switched OFF the import asks the server not to carry and shows the default toast', async () => {
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
    expect(toast.success).toHaveBeenCalledWith(`${successKey}:{"count":1}`);
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
