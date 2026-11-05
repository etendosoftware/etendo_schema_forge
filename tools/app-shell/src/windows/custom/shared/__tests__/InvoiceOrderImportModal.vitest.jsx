// @covers tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/invoiceOrderImport.js
// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx
// @covers tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
//
// The order-import popup of sales and purchase invoices rendered for real (ImportLinesModal + the
// global-discount hook + the data module), one suite per data path (`importVia`). Moved here from
// useOrderGlobalDiscountImport.vitest.jsx so the component's tests sit next to it; that file keeps
// the hook's own unit tests.

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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatCurrency.js';
import InvoiceOrderImportModal from '../InvoiceOrderImportModal.jsx';

const BASE = '/sws/neo';

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
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
