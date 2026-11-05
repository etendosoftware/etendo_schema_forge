// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxCells.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxTable.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxToolbar.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxSelectionBar.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxDropZone.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxUploadTray.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxDiscardDialog.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxDiscard.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxUploadResult.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxUploadResult.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxUploadLog.js
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const mockApi = {
  fetchNextPage: vi.fn(),
  fetchCounts: vi.fn(),
  fetchRowsById: vi.fn(),
  uploadInboxFile: vi.fn(),
  discardInboxDocument: vi.fn(),
};
vi.mock('../invoiceInboxApi.js', () => ({
  fetchNextPage: (...a) => mockApi.fetchNextPage(...a),
  fetchCounts: (...a) => mockApi.fetchCounts(...a),
  fetchRowsById: (...a) => mockApi.fetchRowsById(...a),
  // The real chunker is covered in useInvoiceInboxUploadResult.vitest.jsx; here it forwards one call.
  fetchRowsByIdChunked: (api, ids) => mockApi.fetchRowsById(api, ids),
  uploadInboxFile: (...a) => mockApi.uploadInboxFile(...a),
  discardInboxDocument: (...a) => mockApi.discardInboxDocument(...a),
}));

let mockAuth = null;
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => mockAuth,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));
vi.mock('@/auth/useApiFetch.js', () => {
  const apiFetch = () => {};
  return { useApiFetch: () => apiFetch };
});
const mockSetPageMeta = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: (meta) => mockSetPageMeta(meta) }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorite: () => false }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/components/contract-ui/SelectionToolbar.jsx', () => ({
  default: ({ visible, children, 'data-testid': id }) => (visible ? <div data-testid={id}>{children}</div> : null),
}));
// A light DataTable: renders each column's cell and a checkbox only for selectable rows.
vi.mock('@/components/contract-ui', () => ({
  DataTable: function DataTable({ columns, data, loading, isRowSelectable, onSelectionChange, clearSelectionTrigger, emptyState, rowQuickActions }) {
    const [selected, setSelected] = useState([]);
    useEffect(() => { setSelected([]); onSelectionChange?.([]); }, [clearSelectionTrigger]); // eslint-disable-line react-hooks/exhaustive-deps
    const toggle = (row) => {
      const next = selected.includes(row.id) ? selected.filter((i) => i !== row.id) : [...selected, row.id];
      setSelected(next);
      onSelectionChange?.(data.filter((r) => next.includes(r.id)));
    };
    if (loading) return <div data-testid="table-loading" />;
    if (!data.length) return <div data-testid={emptyState?.testId}>{emptyState?.title}{emptyState?.description}{emptyState?.action}</div>;
    return (
      <table>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} data-testid={`row-${row.id}`}>
              <td>{isRowSelectable(row) && <input type="checkbox" data-testid={`check-${row.id}`} checked={selected.includes(row.id)} onChange={() => toggle(row)} />}</td>
              {columns.map((c) => <td key={c.key} data-col={c.key}>{c.render(row)}</td>)}
              <td data-col="actions">{rowQuickActions?.render?.(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

import { toast } from 'sonner';
import InvoiceInboxPage from '../InvoiceInboxPage.jsx';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { appendUploadLog, uploadLogKey } from '../invoiceInboxUploadLog.js';

const COUNTS = { pending: 4, error: 2, confirmed: 9, discarded: 1 };
const ROWS = [
  { id: 'p1', status: 'PROCESSING', fileName: 'proc.pdf', source: 'UPLOAD', created: '2026-08-10T09:30:00Z' },
  {
    id: 'r2', status: 'READY', fileName: 'ready.png', source: 'EMAIL', businessPartner: 'bp1', 'businessPartner$_identifier': 'ACME SL',
    'businessPartner$taxID': 'B1234', orderReference: 'F-100', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5,
    duplicateOfInvoice: 'inv1', 'duplicateOfInvoice$_identifier': 'INV-9',
  },
  { id: 'r3', status: 'PENDING_REVIEW', fileName: 'x.pdf', extractedName: 'Extracted SL', extractedTaxID: 'X999' },
  { id: 'r4', status: 'ERROR', fileName: 'bad.pdf', errorCode: 'UNREADABLE' },
  {
    id: 'r5', status: 'CONFIRMED', fileName: 'done.pdf', businessPartner: 'bp1', 'businessPartner$_identifier': 'ACME SL',
    duplicateOfInvoice: 'inv1', 'duplicateOfInvoice$_identifier': 'INV-9', 'invoice$_identifier': 'INV-77',
  },
  { id: 'r6', status: 'DISCARDED', fileName: 'gone.pdf', duplicateOfInvoice: 'inv1' },
  { id: 'r7', status: 'READY', fileName: 'nodata.pdf' },
];
const page = (rows, more = false) => ({ rows, cursor: { index: 1, offset: 0 }, more });

const AUTH = { clientId: 'C1', account: { id: 'A1' } };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAuth = AUTH;
  mockApi.fetchCounts.mockResolvedValue(COUNTS);
  mockApi.fetchNextPage.mockResolvedValue(page(ROWS));
  mockApi.fetchRowsById.mockResolvedValue([]);
});

async function renderPage() {
  const utils = render(<InvoiceInboxPage apiBaseUrl="/sws/neo/invoice-inbox" />);
  await screen.findByTestId('row-p1');
  return utils;
}

describe('InvoiceInboxPage — header, tabs and counters', () => {
  it('publishes title, breadcrumb and the pending + error counter to the top bar', async () => {
    await renderPage();
    await waitFor(() => expect(mockSetPageMeta.mock.calls.at(-1)[0].recordCount).toBe(6));
    expect(mockSetPageMeta.mock.calls.at(-1)[0]).toMatchObject({ title: 'Invoice Inbox', breadcrumb: 'Purchases / Invoice Inbox' });
  });

  it('shows one counter per tab, with all = pending + error + confirmed', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-filter-count-all')).toHaveTextContent('15'));
    expect(screen.getByTestId('invoice-inbox-filter-count-pending')).toHaveTextContent('4');
    expect(screen.getByTestId('invoice-inbox-filter-count-error')).toHaveTextContent('2');
    expect(screen.getByTestId('invoice-inbox-filter-count-confirmed')).toHaveTextContent('9');
    expect(screen.getByTestId('invoice-inbox-filter-count-discarded')).toHaveTextContent('1');
  });

  it('shows no counter (not a 0) until the counters are known', async () => {
    mockApi.fetchCounts.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(screen.queryByTestId('invoice-inbox-filter-count-all')).toBeNull();
  });

  it('a tab change reloads from the first page with that tab and clears the selection', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('check-r2'));
    expect(screen.getByTestId('invoice-inbox-selection-count')).toHaveTextContent('invoiceInboxSelectedOne');
    mockApi.fetchNextPage.mockClear();
    fireEvent.click(screen.getByTestId('invoice-inbox-filter-error'));
    await waitFor(() => expect(mockApi.fetchNextPage).toHaveBeenCalled());
    const streams = mockApi.fetchNextPage.mock.calls[0][1];
    expect(streams).toEqual([[{ fieldName: 'status', operator: 'equals', value: 'ERROR' }]]);
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-selection-bar')).toBeNull());
  });
});

describe('InvoiceInboxPage — cells', () => {
  it('vendor: linked name with tax id; extracted name when unlinked; "no data" otherwise', async () => {
    await renderPage();
    const linked = within(screen.getByTestId('row-r2'));
    expect(linked.getByText('ACME SL')).toBeInTheDocument();
    expect(linked.getByText('B1234')).toBeInTheDocument();
    const extracted = within(screen.getByTestId('row-r3'));
    expect(extracted.getByText('Extracted SL')).toBeInTheDocument();
    expect(extracted.getByText('X999')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-r7')).getByText('invoiceInboxVendorNoData')).toBeInTheDocument();
  });

  it('shows the possible-duplicate icon only while the row is not CONFIRMED or DISCARDED', async () => {
    await renderPage();
    expect(screen.getByTestId('invoice-inbox-duplicate-r2')).toHaveAttribute('aria-label', expect.stringContaining('INV-9'));
    expect(screen.queryByTestId('invoice-inbox-duplicate-r5')).toBeNull();
    expect(screen.queryByTestId('invoice-inbox-duplicate-r6')).toBeNull();
  });

  it('formats the invoice date with formatCalendarDate and the total with formatCurrency', async () => {
    await renderPage();
    const row = within(screen.getByTestId('row-r2'));
    expect(row.getByText(formatCalendarDate('2026-08-10', 'en_US'))).toBeInTheDocument();
    const squash = (t) => t.replace(/\s+/g, ' ');
    const expected = squash(formatCurrency('EUR', 1234.5));
    expect(row.getByText((_, el) => el.tagName === 'SPAN' && squash(el.textContent) === expected)).toBeInTheDocument();
    expect(formatCurrency('EUR', 1234.5)).not.toBe('1234.5');
  });

  it('translates the status and the error reason; shows the confirmed document', async () => {
    await renderPage();
    expect(within(screen.getByTestId('invoice-inbox-status-r2')).getByText('invoiceInboxStatusReady')).toBeInTheDocument();
    const err = within(screen.getByTestId('invoice-inbox-status-r4'));
    expect(err.getByText('invoiceInboxStatusError')).toBeInTheDocument();
    expect(err.getByText('invoiceInboxErrorUnreadable')).toBeInTheDocument();
    expect(within(screen.getByTestId('invoice-inbox-status-r5')).getByText(/invoiceInboxConfirmedAs.*INV-77/)).toBeInTheDocument();
  });

  it('PROCESSING rows show placeholders instead of values and cannot be selected', async () => {
    await renderPage();
    const row = within(screen.getByTestId('row-p1'));
    expect(row.getAllByTestId('Skeleton__85f13c').length).toBe(4);
    expect(row.queryByText('invoiceInboxVendorNoData')).toBeNull();
    expect(screen.queryByTestId('check-p1')).toBeNull();
    expect(screen.queryByTestId('check-r5')).toBeNull();
    expect(screen.queryByTestId('check-r6')).toBeNull();
    expect(screen.getByTestId('check-r4')).toBeInTheDocument();
  });
});

describe('InvoiceInboxPage — batch bar and upload cards', () => {
  it('the batch bar shows the count with Discard enabled, Mark for review and Confirm still disabled', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('check-r2'));
    fireEvent.click(screen.getByTestId('check-r3'));
    expect(screen.getByTestId('invoice-inbox-selection-count')).toHaveTextContent('invoiceInboxSelectedMany');
    expect(screen.getByTestId('invoice-inbox-bulk-mark-review')).toBeDisabled();
    expect(screen.getByTestId('invoice-inbox-bulk-confirm')).toBeDisabled();
    expect(screen.getByTestId('invoice-inbox-bulk-discard')).toBeEnabled();
    // Design order: Mark for review, Discard, Confirm.
    const order = ['mark-review', 'discard', 'confirm']
      .map((name) => screen.getByTestId(`invoice-inbox-bulk-${name}`));
    order.slice(1).forEach((button, i) => {
      expect(order[i].compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('the e-mail card Copy button is disabled', async () => {
    await renderPage();
    expect(screen.getByTestId('invoice-inbox-email-copy')).toBeDisabled();
  });
});

describe('InvoiceInboxPage — empty and error states', () => {
  it('first use: nothing at all received', async () => {
    mockApi.fetchNextPage.mockResolvedValue(page([]));
    mockApi.fetchCounts.mockResolvedValue({ pending: 0, error: 0, confirmed: 0, discarded: 0 });
    render(<InvoiceInboxPage apiBaseUrl="/x" />);
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-empty')).toHaveTextContent('invoiceInboxFirstUseTitle'));
  });

  it('filtered: an empty tab shows the generic empty text, not the first-use text', async () => {
    await renderPage();
    mockApi.fetchNextPage.mockResolvedValue(page([]));
    fireEvent.click(screen.getByTestId('invoice-inbox-filter-confirmed'));
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-empty')).toHaveTextContent('invoiceInboxEmptyTitle'));
    expect(screen.getByTestId('invoice-inbox-empty')).not.toHaveTextContent('invoiceInboxFirstUseTitle');
  });

  it('load error shows a message and Retry reloads', async () => {
    mockApi.fetchNextPage.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue(page(ROWS));
    render(<InvoiceInboxPage apiBaseUrl="/x" />);
    const retry = await screen.findByTestId('invoice-inbox-retry');
    expect(screen.getByTestId('invoice-inbox-load-error')).toHaveTextContent('invoiceInboxLoadError');
    fireEvent.click(retry);
    await screen.findByTestId('row-p1');
  });

  it('shows "load more" only when there are more rows and appends on click', async () => {
    mockApi.fetchNextPage.mockResolvedValueOnce(page(ROWS.slice(0, 2), true)).mockResolvedValueOnce(page(ROWS.slice(2, 4)));
    render(<InvoiceInboxPage apiBaseUrl="/x" />);
    fireEvent.click(await screen.findByTestId('invoice-inbox-load-more'));
    await screen.findByTestId('row-r4');
    expect(screen.getByTestId('row-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-load-more')).toBeNull();
  });
});

describe('InvoiceInboxPage — uploads', () => {
  const pick = (names, size = 1000) => {
    const files = names.map((n) => new File([new Uint8Array(size)], n));
    fireEvent.change(screen.getByTestId('invoice-inbox-file-input'), { target: { files } });
  };

  it('while files are sent the tray shows "X of N" and the stay notice; once all are delivered it goes away', async () => {
    const gates = [];
    mockApi.uploadInboxFile.mockImplementation(() => new Promise((resolve) => gates.push(resolve)));
    await renderPage();
    pick(['a.pdf', 'b.pdf', 'c.pdf']);
    await waitFor(() => expect(mockApi.uploadInboxFile).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('invoice-inbox-upload-progress')).toHaveTextContent('invoiceInboxUploadingProgress:{"done":0,"total":3}');
    expect(screen.getByTestId('invoice-inbox-upload-stay-notice')).toHaveTextContent('invoiceInboxUploadStayNotice:{"count":3}');
    await act(async () => { gates.splice(0).forEach((g, i) => g({ status: 'accepted', id: `U${i}` })); });
    await waitFor(() => expect(mockApi.uploadInboxFile).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('invoice-inbox-upload-progress')).toHaveTextContent('"done":2,"total":3');
    expect(screen.getByTestId('invoice-inbox-upload-stay-notice')).toHaveTextContent('"count":1');
    await act(async () => { gates.splice(0).forEach((g) => g({ status: 'accepted', id: 'U2' })); });
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-upload-tray')).toBeNull());
    expect(mockApi.uploadInboxFile).toHaveBeenCalledTimes(3);
  });

  it('mixed selection: uploads the pdf and the toast names the .webp', async () => {
    mockApi.uploadInboxFile.mockResolvedValue({ status: 'accepted', id: 'D' });
    await renderPage();
    pick(['ok.pdf', 'pic.webp']);
    await waitFor(() => expect(mockApi.uploadInboxFile).toHaveBeenCalledTimes(1));
    expect(mockApi.uploadInboxFile.mock.calls[0][1].name).toBe('ok.pdf');
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('pic.webp'));
  });

  it('21 files: warns and uploads none', async () => {
    await renderPage();
    pick(Array.from({ length: 21 }, (_, i) => `f${i}.pdf`));
    expect(toast.error).toHaveBeenCalledWith('invoiceInboxErrorTooMany');
    expect(mockApi.uploadInboxFile).not.toHaveBeenCalled();
  });

  it('refreshes the list once after accepted uploads', async () => {
    mockApi.uploadInboxFile.mockResolvedValue({ status: 'accepted', id: 'D' });
    await renderPage();
    mockApi.fetchNextPage.mockClear();
    pick(['a.pdf', 'b.pdf']);
    await waitFor(() => expect(mockApi.fetchNextPage).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('a server refusal that stops the queue shows one translated toast', async () => {
    mockApi.uploadInboxFile.mockResolvedValue({ status: 'failed', code: 'org_not_allowed' });
    await renderPage();
    pick(['a.pdf', 'b.pdf', 'c.pdf']);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('invoiceInboxUploadOrgNotAllowed'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('an upload accepted after unmount schedules no refresh', async () => {
    let finish;
    mockApi.uploadInboxFile.mockReturnValue(new Promise((r) => { finish = r; }));
    const { unmount } = await renderPage();
    pick(['a.pdf']);
    await waitFor(() => expect(mockApi.uploadInboxFile).toHaveBeenCalled());
    unmount();
    mockApi.fetchNextPage.mockClear();
    await act(async () => { finish({ status: 'accepted', id: 'D' }); });
    await new Promise((r) => setTimeout(r, 800));
    expect(mockApi.fetchNextPage).not.toHaveBeenCalled();
  });
});

describe('InvoiceInboxPage — polling of PROCESSING rows', () => {
  it('re-reads PROCESSING rows by id and swaps in the updated row', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi.fetchRowsById.mockResolvedValue([{ id: 'p1', status: 'READY', fileName: 'proc.pdf', orderReference: 'F-FRESH' }]);
      await renderPage();
      expect(within(screen.getByTestId('row-p1')).getAllByTestId('Skeleton__85f13c').length).toBe(4);
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(mockApi.fetchRowsById.mock.calls[0][1]).toEqual(['p1']);
      await waitFor(() => expect(within(screen.getByTestId('row-p1')).getByText('F-FRESH')).toBeInTheDocument());
      expect(screen.getByTestId('check-p1')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
});

describe('InvoiceInboxPage — discard', () => {
  const OKR = { status: 'discarded' };
  const selectTwo = () => {
    fireEvent.click(screen.getByTestId('check-r2'));
    fireEvent.click(screen.getByTestId('check-r3'));
  };
  const confirm = () => fireEvent.click(screen.getByTestId('invoice-inbox-discard-confirm'));

  it('batch bar Discard opens the dialog for the selection; Cancel closes it and sends nothing', async () => {
    await renderPage();
    selectTwo();
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    expect(screen.getByTestId('invoice-inbox-discard-dialog-title')).toHaveTextContent('invoiceInboxDiscardTitleMany:{"count":2}');
    fireEvent.click(screen.getByTestId('invoice-inbox-discard-cancel'));
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-discard-dialog')).toBeNull());
    expect(mockApi.discardInboxDocument).not.toHaveBeenCalled();
    expect(screen.getByTestId('invoice-inbox-selection-count')).toBeInTheDocument();
  });

  it('confirming sends one request per row, toasts, closes, clears the selection and refreshes list and counters', async () => {
    mockApi.discardInboxDocument.mockResolvedValue(OKR);
    await renderPage();
    selectTwo();
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    mockApi.fetchNextPage.mockClear();
    mockApi.fetchCounts.mockClear();
    confirm();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('invoiceInboxDiscardedMany:{"count":2}'));
    expect(mockApi.discardInboxDocument.mock.calls.map((c) => c[1]).sort()).toEqual(['r2', 'r3']);
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-discard-dialog')).toBeNull());
    expect(screen.queryByTestId('invoice-inbox-selection-bar')).toBeNull();
    await waitFor(() => expect(mockApi.fetchNextPage).toHaveBeenCalled());
    await waitFor(() => expect(mockApi.fetchCounts).toHaveBeenCalled());
  });

  it('a partial batch shows a warning with the shared reason', async () => {
    mockApi.discardInboxDocument.mockImplementation(async (_f, id) => (id === 'r3' ? { status: 'failed', code: 'not_discardable', httpStatus: 409 } : OKR));
    await renderPage();
    selectTwo();
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    confirm();
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    const msg = toast.warning.mock.calls[0][0];
    expect(msg).toContain('invoiceInboxDiscardPartial');
    expect(msg).toContain('"ok":1');
    expect(msg).toContain('"failed":1');
    expect(msg).toContain('invoiceInboxDiscardReasonNotDiscardable');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('every row failing shows an error toast', async () => {
    mockApi.discardInboxDocument.mockResolvedValue({ status: 'failed', code: 'not_discardable', httpStatus: 409 });
    await renderPage();
    selectTwo();
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    confirm();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('invoiceInboxDiscardFailed')));
  });

  it('a double click on Discard sends a single batch', async () => {
    let release;
    mockApi.discardInboxDocument.mockImplementation(() => new Promise((r) => { release = () => r(OKR); }));
    await renderPage();
    fireEvent.click(screen.getByTestId('check-r2'));
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    confirm();
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-discard-confirm')).toBeDisabled());
    confirm();
    expect(screen.getByTestId('invoice-inbox-bulk-discard')).toBeDisabled();
    expect(mockApi.discardInboxDocument).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-discard-dialog')).toBeNull());
    expect(mockApi.discardInboxDocument).toHaveBeenCalledTimes(1);
  });

  it('the row trash opens the same dialog with count 1 and discards only that row', async () => {
    mockApi.discardInboxDocument.mockResolvedValue(OKR);
    await renderPage();
    fireEvent.click(screen.getByTestId('invoice-inbox-row-discard-r4'));
    expect(screen.getByTestId('invoice-inbox-discard-dialog-title')).toHaveTextContent('invoiceInboxDiscardTitleOne');
    confirm();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('invoiceInboxDiscardedOne:{}'));
    expect(mockApi.discardInboxDocument).toHaveBeenCalledTimes(1);
    expect(mockApi.discardInboxDocument.mock.calls[0][1]).toBe('r4');
  });

  it('row actions: none on PROCESSING, trash only where discardable', async () => {
    await renderPage();
    expect(screen.queryByTestId('invoice-inbox-row-actions-p1')).toBeNull();
    for (const id of ['r2', 'r3', 'r4']) expect(screen.getByTestId(`invoice-inbox-row-discard-${id}`)).toBeInTheDocument();
    for (const id of ['r5', 'r6']) {
      expect(screen.getByTestId(`invoice-inbox-row-edit-${id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`invoice-inbox-row-discard-${id}`)).toBeNull();
    }
  });

  it('a feature_disabled refusal stops the batch with an error toast naming the reason', async () => {
    mockApi.discardInboxDocument.mockResolvedValue({ status: 'failed', code: 'feature_disabled', httpStatus: 403 });
    await renderPage();
    fireEvent.click(screen.getByTestId('check-r2'));
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    confirm();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('invoiceInboxDiscardReasonFeatureDisabled')));
  });

  it('DISCARDED rows show "Descartada el {fecha}"', async () => {
    mockApi.fetchNextPage.mockResolvedValue(page([{ id: 'd1', status: 'DISCARDED', fileName: 'g.pdf', discardedAt: '2026-08-10T09:30:00Z' }]));
    render(<InvoiceInboxPage apiBaseUrl="/x" />);
    const line = await screen.findByTestId('invoice-inbox-discarded-at-d1');
    expect(line).toHaveTextContent('invoiceInboxDiscardedAt');
    expect(line).toHaveTextContent('08/10/2026');
  });

  it('an answer after unmount shows no toast and does not refresh', async () => {
    let release;
    mockApi.discardInboxDocument.mockImplementation(() => new Promise((r) => { release = () => r(OKR); }));
    const { unmount } = await renderPage();
    fireEvent.click(screen.getByTestId('check-r2'));
    fireEvent.click(screen.getByTestId('invoice-inbox-bulk-discard'));
    confirm();
    await waitFor(() => expect(mockApi.discardInboxDocument).toHaveBeenCalled());
    unmount();
    mockApi.fetchNextPage.mockClear();
    await act(async () => { release(); });
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockApi.fetchNextPage).not.toHaveBeenCalled();
  });
});

describe('InvoiceInboxPage — upload result panel and batch filter', () => {
  const KEY = uploadLogKey('C1', 'A1');
  const T0 = Date.now() - 60_000;
  const record = (...ids) => ids.forEach((id, i) => appendUploadLog(KEY, id, T0 + i));
  const serverRows = (rows) => mockApi.fetchRowsById.mockImplementation(async (_api, ids) => rows.filter((r) => ids.includes(r.id)));
  const pickFiles = (names) => fireEvent.change(screen.getByTestId('invoice-inbox-file-input'), {
    target: { files: names.map((nm) => new File([new Uint8Array(10)], nm)) },
  });

  it('shows the panel for recorded documents and hides it while files are being sent, then shows it again', async () => {
    record('r2', 'r4');
    serverRows(ROWS);
    await renderPage();
    expect(await screen.findByTestId('invoice-inbox-result')).toBeInTheDocument();
    const gate = {};
    mockApi.uploadInboxFile.mockImplementation(() => new Promise((resolve) => { gate.resolve = resolve; }));
    pickFiles(['a.pdf']);
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-upload-tray')).toBeInTheDocument());
    expect(screen.queryByTestId('invoice-inbox-result')).toBeNull();
    await act(async () => { gate.resolve({ status: 'accepted', id: 'NEW1' }); });
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-result')).toBeInTheDocument());
    expect(screen.queryByTestId('invoice-inbox-upload-tray')).toBeNull();
  });

  it('with no recorded documents there is no panel', async () => {
    await renderPage();
    expect(screen.queryByTestId('invoice-inbox-result')).toBeNull();
  });

  it('after delivery the tray keeps only the refused lines', async () => {
    mockApi.uploadInboxFile
      .mockResolvedValueOnce({ status: 'accepted', id: 'OK1' })
      .mockResolvedValueOnce({ status: 'rejected', code: 'unsupported_type' });
    await renderPage();
    pickFiles(['good.pdf', 'bad.pdf']);
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-upload-close')).toBeInTheDocument());
    expect(screen.getAllByTestId(/^invoice-inbox-upload-item-\d+$/)).toHaveLength(1);
    expect(screen.getByTestId('invoice-inbox-upload-item-message-0')).toHaveTextContent('invoiceInboxFileUnsupportedType');
    fireEvent.click(screen.getByTestId('invoice-inbox-upload-close'));
    expect(screen.queryByTestId('invoice-inbox-upload-tray')).toBeNull();
  });

  it('the single poller also re-reads recorded pending ids that are not on the page, once each', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      record('rec1', 'rec2', 'p1');
      const pendingRows = ['rec1', 'rec2', 'p1'].map((id) => ({ id, status: 'PROCESSING', fileName: `${id}.pdf` }));
      serverRows(pendingRows);
      await renderPage();
      await waitFor(() => expect(screen.getByTestId('invoice-inbox-result-title')).toHaveTextContent('invoiceInboxResultReadingTitle'));
      mockApi.fetchRowsById.mockClear();
      await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
      expect(mockApi.fetchRowsById).toHaveBeenCalledTimes(1);
      const polled = mockApi.fetchRowsById.mock.calls[0][1];
      expect([...polled].sort()).toEqual(['p1', 'rec1', 'rec2']);
    } finally { vi.useRealTimers(); }
  });

  it('the panel has no "view" buttons and the toolbar no batch chip', async () => {
    record('r2', 'r4');
    serverRows(ROWS);
    await renderPage();
    await screen.findByTestId('invoice-inbox-result');
    expect(screen.queryByTestId('invoice-inbox-result-view-batch')).toBeNull();
    expect(screen.queryByTestId('invoice-inbox-result-view-errors')).toBeNull();
    expect(screen.queryByTestId('invoice-inbox-filter-batch-chip')).toBeNull();
  });

  it('dismissing the finished panel drops the recorded documents and hides it', async () => {
    record('r2', 'r4');
    serverRows(ROWS);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('invoice-inbox-result-title')).toHaveTextContent('invoiceInboxResultDoneWithErrors'));
    fireEvent.click(screen.getByTestId('invoice-inbox-result-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('invoice-inbox-result')).toBeNull());
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
