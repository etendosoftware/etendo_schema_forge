// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx
// @covers tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
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
import ImportLinesModal from '@/components/contract-ui/ImportLinesModal.jsx';
import useOrderGlobalDiscountImport from '../useOrderGlobalDiscountImport.jsx';

const HEADER_ENDPOINT = 'sales-invoice/header';
const BASE = '/sws/neo';

function hookProps() {
  return renderHook(() => useOrderGlobalDiscountImport({ headerEndpoint: HEADER_ENDPOINT })).result.current;
}

/**
 * A `selection` as ImportLinesModal builds it. `orders` = [{ id, pct }] (documentNo = id).
 */
function selection({ orders = [], invoicePct = null, invoiceHasLines = false, carryOn, selectedCount = 1 } = {}) {
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

describe('useOrderGlobalDiscountImport — footer hint', () => {
  it.each([
    { name: 'carrying, one line', sel: { orders: [{ id: 'SO-A', pct: 10 }], selectedCount: 1 }, expected: 'importGlobalDiscountSelectedOne:{"count":1,"pct":"10"}' },
    { name: 'carrying, many lines', sel: { orders: [{ id: 'SO-A', pct: 10 }], selectedCount: 3 }, expected: 'importGlobalDiscountSelectedMany:{"count":3,"pct":"10"}' },
    { name: 'toggle off', sel: { orders: [{ id: 'SO-A', pct: 10 }], carryOn: false }, expected: null },
    { name: 'warning', sel: { orders: [{ id: 'SO-A', pct: 10 }], invoiceHasLines: true }, expected: null },
  ])('$name → $expected', ({ sel, expected }) => {
    expect(hookProps().getSelectionHint(selection(sel))).toBe(expected);
  });
});

describe('useOrderGlobalDiscountImport — afterImport header PATCH', () => {
  const ORDERS = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }];

  function afterImportArgs({ selected, imported, invoicePct = null, invoiceHasLines = false, carryOn = true }) {
    const sel = selection({ orders: ORDERS, invoicePct, invoiceHasLines, carryOn });
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
  ])('no PATCH: $name', async ({ args, result }) => {
    expect(await hookProps().afterImport(afterImportArgs(args))).toEqual(result);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('PATCHes the header with the % when the toggle is on and the invoice has none', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    const result = await hookProps().afterImport(afterImportArgs({ selected: ['SO-A'], imported: ['SO-A'] }));
    expect(result).toEqual({ carried: true, pct: 10 });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(`${BASE}/${HEADER_ENDPOINT}/inv-1`, {
      method: 'PATCH',
      body: JSON.stringify({ etgoTotalDiscount: 10 }),
    });
  });

  it.each([
    ['answers not ok', () => mockApiFetch.mockResolvedValue({ ok: false })],
    ['rejects', () => mockApiFetch.mockRejectedValue(new Error('network'))],
  ])('reports failedPct when the PATCH %s', async (_name, arrange) => {
    arrange();
    const result = await hookProps().afterImport(afterImportArgs({ selected: ['SO-A'], imported: ['SO-A'] }));
    expect(result).toEqual({ carried: false, failedPct: 10 });
  });
});

describe('useOrderGlobalDiscountImport — success toast', () => {
  it.each([
    { name: 'PATCH failed', args: { count: 1, afterImportResult: { carried: false, failedPct: 10 } }, expected: { message: 'importGlobalDiscountPatchFailed:{"pct":"10"}', variant: 'warning' } },
    { name: 'PATCH failed on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: false, failedPct: 10 } }, expected: { message: 'importGlobalDiscountPatchFailed:{"pct":"10"}', variant: 'warning' } },
    { name: 'carried, one line', args: { count: 1, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedOne:{"count":1,"pct":"10"}' } },
    { name: 'carried, many lines', args: { count: 2, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedMany:{"count":2,"pct":"10"}' } },
    { name: 'carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: true, pct: 10 } }, expected: null },
    { name: 'not carried', args: { count: 1, afterImportResult: { carried: false } }, expected: null },
  ])('$name', ({ args, expected }) => {
    expect(hookProps().getSuccessToast(args)).toEqual(expected);
  });
});

// The hook wired into the real ImportLinesModal: the selection the modal computes is the one the
// decision runs on, and the PATCH / toasts happen after the per-line POST loop.
describe('useOrderGlobalDiscountImport inside ImportLinesModal', () => {
  function Harness(props) {
    const discountProps = useOrderGlobalDiscountImport({ headerEndpoint: HEADER_ENDPOINT });
    return <ImportLinesModal {...props} {...discountProps} />;
  }

  function renderModal({ orders, failingLines = [], patchOk = true }) {
    mockApiFetch.mockImplementation(async (_url, opts) => {
      if (opts.method === 'POST') return { ok: !failingLines.includes(JSON.parse(opts.body).line) };
      return { ok: patchOk };
    });
    const onSuccess = vi.fn();
    render(
      <Harness
        invoiceId="inv-1"
        bpId="bp-1"
        base={BASE}
        headers={{}}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        titleKey="importFromSalesOrder"
        searchPlaceholderKey="searchSalesOrder"
        emptyMessageKey="empty"
        noSearchResultsKey="noResults"
        successMessageKey="linesImportedFromSalesOrder"
        linesEndpoint="sales-invoice/lines"
        fetchDocuments={async () => ({
          documents: orders.map(o => ({ id: o.id, documentNo: o.id })),
          sharedContext: {
            orderDiscountMap: Object.fromEntries(orders.map(o => [o.id, o.pct])),
            invoiceGlobalDiscount: null,
            invoiceHasLines: false,
          },
        })}
        fetchLines={async ({ docId }) => [
          { id: `${docId}-l1`, _productName: `Product ${docId}`, _maxQty: 1, _unitPrice: 100, _lineNetAmount: 100 },
        ]}
        getDocDisplay={doc => ({ docNo: doc.documentNo, date: '2025-01-15' })}
        buildLineBody={async ({ line }) => ({ line: line.id })}
      />,
    );
    return { onSuccess };
  }

  async function selectAllOrdersAndImport(orders) {
    // Every line is 100; the row total is shown once the eager line load has finished.
    const totals = orders.map(o => formatCurrency(undefined, o.pct > 0 ? 90 : 100));
    await waitFor(() => {
      for (const total of new Set(totals)) {
        expect(screen.getAllByText(total)).toHaveLength(totals.filter(t => t === total).length);
      }
    });
    screen.getAllByTestId('checkbox').forEach(cb => fireEvent.click(cb));
  }

  const patchCalls = () => mockApiFetch.mock.calls.filter(([, opts]) => opts.method === 'PATCH');

  it('carries a single order %: tag, discounted total, hint, header PATCH and the carried toast', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }];
    const { onSuccess } = renderModal({ orders });
    await selectAllOrdersAndImport(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__tag')).toHaveTextContent('importGlobalDiscountTag:{"pct":"10"}');
    expect(screen.getByText(formatCurrency(undefined, 90))).toBeInTheDocument();
    expect(screen.getByText('importGlobalDiscountSelectedOne:{"count":1,"pct":"10"}')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/importSelected/).closest('button'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(patchCalls()).toEqual([[`${BASE}/${HEADER_ENDPOINT}/inv-1`, { method: 'PATCH', body: JSON.stringify({ etgoTotalDiscount: 10 }) }]]);
    expect(toast.success).toHaveBeenCalledWith('importGlobalDiscountImportedOne:{"count":1,"pct":"10"}');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('B1: orders at 10 % + 0 % show the mixed warning and never PATCH when the 0 % order fails', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }];
    const { onSuccess } = renderModal({ orders, failingLines: ['SO-B-l1'] });
    await selectAllOrdersAndImport(orders);

    expect(screen.getByTestId('ImportGlobalDiscount__warning')).toHaveTextContent('importGlobalDiscountMixedTitle');
    expect(screen.getByText('selected:{"count":2}')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/importSelected/).closest('button'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(patchCalls()).toEqual([]);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('importedLinesWithErrors:{"count":1,"errors":1}');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows both the partial-import warning and the failed-PATCH warning when lines and the PATCH fail', async () => {
    const orders = [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 10 }];
    const { onSuccess } = renderModal({ orders, failingLines: ['SO-B-l1'], patchOk: false });
    await selectAllOrdersAndImport(orders);

    fireEvent.click(screen.getByText(/importSelected/).closest('button'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(patchCalls()).toHaveLength(1);
    expect(toast.warning.mock.calls).toEqual([
      ['importedLinesWithErrors:{"count":1,"errors":1}'],
      ['importGlobalDiscountPatchFailed:{"pct":"10"}'],
    ]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
