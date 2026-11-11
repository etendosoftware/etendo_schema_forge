// @covers tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/invoiceOrderImport.js
// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx
// @covers tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
//
// The order-import popup of sales and purchase invoices rendered for real (ImportLinesModal + the
// global-discount hook + the data module), one suite per direction. Moved here from
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

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
// ETP-5828 QA MCP-2: purchases too (they POSTed each line and PATCHed the header % from the
// browser, and listed with `pendingBasis: 'classic'`, so they offered lines other drafts held).
describe.each([
  { direction: 'sales', invoiceSpec: 'sales-invoice', titleKey: 'importFromSalesOrder', emptyKey: 'noCompletedSalesOrdersForThisCustomer' },
  { direction: 'purchase', invoiceSpec: 'purchase-invoice', titleKey: 'importFromPurchaseOrder', emptyKey: 'noCompletedPurchaseOrdersForThisSupplier' },
])('InvoiceOrderImportModal ($direction)', ({ direction, invoiceSpec, titleKey, emptyKey }) => {
  const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

  // ETP-5828 — the server path lists through the invoice's actions only: availableOrders for the
  // orders and ONE availableOrderLines per order (price and product included); the order GETs are
  // never read, so any of them is an unexpected request here.
  // `lines` (optional): the availableOrderLines rows of each order, by order id; by default one
  // line of 1 × 100.
  function renderModal({ orders, importRes = ok({ importedCount: 1 }), ordersRes, ordersError, lines = {} }) {
    mockApiFetch.mockImplementation(async (url, opts) => {
      if (url.endsWith('/action/availableOrders')) {
        if (ordersError) throw ordersError;
        if (ordersRes) return ordersRes;
        return ok(orders.map(o => ({
          id: o.id, documentNo: o.id, businessPartner: 'bp-1', 'businessPartner$_identifier': 'BP 1',
          currency: 'EUR', globalDiscount: o.pct, date: '2026-10-30', pendingLines: o.pendingLines ?? 1, amount: 100,
        })));
      }
      if (url.includes(`/${invoiceSpec}/lines?parentId=`)) return ok([]);
      if (url.endsWith(`/${invoiceSpec}/header/inv-1`)) return ok([{ currency: 'EUR', etgoTotalDiscount: 0 }]);
      if (url.endsWith('/action/availableOrderLines')) {
        const docId = JSON.parse(opts.body).orderId;
        return ok(lines[docId] || [{ id: `${docId}-l1`, lineNo: 10, 'product$_identifier': `Product ${docId}`, pendingQuantity: 1, unitPrice: 100 }]);
      }
      if (url === `${BASE}/${invoiceSpec}/header/inv-1/action/importOrderLines`) return importRes;
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
    // One line of 1 × 100 per order; the row shows the order's undiscounted `amount` (100) before
    // its lines are read (ETP-6099, eagerLoadLines off), the order's global discount is only
    // signalled by the badge (ETP-5828, QA obs. 3).
    const total = formatCurrency(undefined, 100);
    await waitFor(() => expect(screen.getAllByText(total)).toHaveLength(orders.length));
    expect(mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/availableOrderLines'))).toHaveLength(0);
    fireEvent.click(screen.getByTestId('ImportLinesModal__selectAll'));
    // Select-all reads the lines of the orders not opened yet and selects them (one line each).
    await waitFor(() => expect(screen.getByTestId('ImportLinesModal__import'))
      .toHaveTextContent(`importSelected:{"count":" (${orders.length})"}`));
  }

  const importCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/importOrderLines'));
  const writeCalls = () => mockApiFetch.mock.calls.filter(([url, opts]) => (
    opts?.method === 'PATCH' || (opts?.method === 'POST' && !url.includes('/action/'))));

  // ETP-6099 — the lines load only when an order is opened, so the popup hides at open, from the
  // availableOrders row, an order whose remaining lines are all on this invoice. It asks `detail`,
  // under which the server leaves those lines out of pendingLines (pending is quantity-based, so a
  // line partly on this invoice still has some left); such an order comes at 0 and is not shown.
  it('lists with detail and the server rule, and hides at open an order with nothing selectable', async () => {
    renderModal({ orders: [{ id: 'SO-A', pct: 0 }, { id: 'SO-B', pct: 0, pendingLines: 0 }] });
    expect(await screen.findByText('SO-A')).toBeInTheDocument();
    expect(screen.queryByText('SO-B')).toBeNull();
    const [, opts] = mockApiFetch.mock.calls.find(([url]) => url.endsWith('/action/availableOrders'));
    expect(JSON.parse(opts.body)).toEqual({ limit: 1000, includeCovered: true, detail: true });
    expect(mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/availableOrderLines'))).toHaveLength(0);
  });

  // ETP-6099 — a failed read is told (describeLoadFailure: a request with no answer shows its own
  // message), then the empty list.
  it('a failed order read shows the load-error toast and the empty list', async () => {
    renderModal({ orders: [], ordersError: new Error('Sin conexión') });
    expect(await screen.findByText(emptyKey)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Sin conexión');
  });

  // QA UI-3 — ticking an order whose lines are not loaded yet opens it, reads its lines AND
  // selects them: one click, not one to unfold and another to select.
  it('ticking an order not opened yet loads and selects its lines in the same click', async () => {
    const twoLines = [
      { id: 'A-1', lineNo: 10, 'product$_identifier': 'Agua', pendingQuantity: 1, unitPrice: 100 },
      { id: 'A-2', lineNo: 20, 'product$_identifier': 'Pan', pendingQuantity: 1, unitPrice: 100 },
    ];
    renderModal({ orders: [{ id: 'SO-A', pct: 0 }], lines: { 'SO-A': twoLines } });
    const docRow = (await screen.findByText('SO-A')).closest('[data-testid="ImportLinesModal__docRow"]');
    fireEvent.click(within(docRow).getByTestId('checkbox'));

    await waitFor(() => expect(screen.getAllByTestId('ImportLinesModal__lineRow')
      .map(r => r.getAttribute('data-selected'))).toEqual(['true', 'true']));
    // QA UI-6 — the footer counts the selected LINES, in the plural: «2 líneas seleccionadas».
    const hint = screen.getByTestId('ImportLinesModal__selectionHint');
    expect(hint).toHaveTextContent('importLinesSelectedCountMany:{"count":2}');
    expect(hint).toHaveTextContent('importLinesSelectedSuffixMany');
    expect(screen.getByTestId('ImportLinesModal__import')).toHaveTextContent('importSelected:{"count":" (2)"}');
  });

  // QA UI-4 — a line other drafts took names the draft; one on THIS invoice keeps «ya importado».
  it('a line held by another draft invoice names it instead of «ya importado»', async () => {
    const taken = [
      { id: 'A-1', lineNo: 10, 'product$_identifier': 'Agua', pendingQuantity: 0, unitPrice: 100,
        inDraftInvoices: [{ id: 'inv-2', documentNo: 'FV1000002' }] },
      { id: 'A-2', lineNo: 20, 'product$_identifier': 'Pan', pendingQuantity: 1, unitPrice: 100 },
    ];
    renderModal({ orders: [{ id: 'SO-A', pct: 0 }], lines: { 'SO-A': taken } });
    fireEvent.click(await screen.findByText('SO-A'));
    const note = await screen.findByTestId('ImportLinesModal__importedNote');
    expect(note).toHaveTextContent('inDraftInvoiceOne:{"documentNo":"FV1000002"}');
    // QA BUG-1 — the note wraps (2 lines max) instead of being cut, and carries its full text.
    expect(note).toHaveAttribute('title', 'inDraftInvoiceOne:{"documentNo":"FV1000002"}');
    expect(note.className).toContain('line-clamp-2');
    expect(note.className).not.toContain('truncate');
  });

  // QA OBS-2 — a line another draft holds only PART of stays selectable and says so.
  it('a line partly held by another draft stays selectable and says how much and where', async () => {
    const partly = [
      { id: 'A-1', lineNo: 10, 'product$_identifier': 'Agua', pendingQuantity: 2, unitPrice: 100,
        inDraftInvoices: [{ id: 'inv-2', documentNo: 'FC1000020', quantity: 1 }] },
    ];
    renderModal({ orders: [{ id: 'SO-A', pct: 0 }], lines: { 'SO-A': partly } });
    fireEvent.click(await screen.findByText('SO-A'));
    const note = await screen.findByTestId('ImportLinesModal__lineNote');
    expect(note).toHaveTextContent('partlyInDraftInvoiceOne:{"quantity":"1","documentNo":"FC1000020"}');
    expect(note).toHaveAttribute('title');
    expect(screen.queryByTestId('ImportLinesModal__importedNote')).toBeNull();
    fireEvent.click(screen.getByTestId('ImportLinesModal__lineRow'));
    expect(screen.getByTestId('ImportLinesModal__lineRow')).toHaveAttribute('data-selected', 'true');
  });

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
    // QA UI-6 — one selected line: «1 línea seleccionada».
    expect(screen.getByTestId('ImportLinesModal__selectionHint')).toHaveTextContent('importLinesSelectedCountOne:{"count":1}');
    expect(screen.getByTestId('ImportLinesModal__selectionHint')).toHaveTextContent('importLinesSelectedSuffixOne');

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

  it('orders at 10 % + 0 % show the mixed warning, count two lines and send carryGlobalDiscount false', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }];
    const { onSuccess } = renderModal({ orders, importRes: ok({ importedCount: 2 }) });
    await selectAllOrders(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__warning')).toHaveTextContent('importGlobalDiscountMixedTitle');
    expect(screen.getByTestId('ImportLinesModal__import')).toHaveTextContent('importSelected:{"count":" (2)"}');

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
