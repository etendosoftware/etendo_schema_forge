// @vitest-environment jsdom
// ETP-5591 — Not Posted Documents rebuilt on the shared list building blocks: quick filters in the
// URL (auto-applied), DataTable with status badges and hover actions, floating selection toolbar.
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';

// Identity translator; `{count}`-style params are echoed so a test can see which count was asked.
// Hoisted and STABLE: the page memoizes on `ui`, so a new function per render would refetch forever.
const { uiState } = vi.hoisted(() => {
  const identity = (key, params) => (params && 'count' in params ? `${key}(${params.count})` : key);
  return { uiState: { impl: identity, identity, ui: (key, params) => uiState.impl(key, params) } };
});
vi.mock('@/i18n', () => ({
  useUI: () => uiState.ui,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const BASE_URL = '/swebsf/not-posted-documents';
const TOKEN = 'test-token';

const ROWS = [
  {
    documentId: 'doc-1', documentType: 'Sales Invoice', documentTypeCode: 'SI', accountingStatus: 'E',
    description: 'INV-001', accountingDate: '2024-03-15', organization: 'Main Org', tableId: '318',
  },
  {
    documentId: 'doc-2', documentType: 'Matched Invoice', documentTypeCode: 'MI', accountingStatus: 'C',
    description: 'MI-002', accountingDate: '2024-04-20', organization: 'Branch', tableId: '472',
  },
  {
    documentId: 'doc-3', documentType: 'Transaction', documentTypeCode: 'T', accountingStatus: 'p',
    description: 'TRX-003', accountingDate: '2024-05-01', organization: 'Main Org',
    tableId: '4D8C3B3C31D1410DA046140C9F024D17', financialAccountId: 'acc-9',
  },
  {
    documentId: 'doc-5', documentType: 'Goods Receipt', documentTypeCode: 'GR', accountingStatus: 'NC',
    description: 'GR-005', accountingDate: '2024-06-02', organization: 'Main Org', tableId: '319',
  },
  {
    documentId: 'doc-4', documentType: 'Some Future Type', documentTypeCode: null, accountingStatus: null,
    description: 'FUT-004', accountingDate: '2024-06-01', organization: 'Main Org', tableId: null,
  },
];

const DOC_TYPES = [
  { value: 'SI', label: 'Factura (Cliente)' },
  { value: 'GS', label: 'Albarán (Cliente)' },
  { value: 'MI', label: 'Facturas cuadradas' },
  { value: 'T', label: 'Transacción' },
];

const json = (body, init = {}) => Promise.resolve({ ok: true, status: 200, json: async () => body, ...init });

/** Routes every request; `overrides` maps a URL fragment to a response factory. */
function mkFetch(rows = ROWS, overrides = {}) {
  return vi.fn((url) => {
    const u = String(url);
    const hit = Object.keys(overrides).find((frag) => u.includes(frag));
    if (hit) return overrides[hit](u);
    if (u.includes('_mode=filter-options')) return json({ documentTypes: DOC_TYPES, accountingStatuses: [] });
    if (u.includes('/action/bulk-post')) return json({ ok: 1, total: 1, results: [], success: true });
    if (u.includes('/action/post')) return json({ success: true });
    return json({ rows, total: rows.length });
  });
}

/** The row-list GETs (not the filter options), as URLSearchParams. */
function rowRequests() {
  return globalThis.fetch.mock.calls
    .map(([url]) => String(url))
    .filter((u) => u.includes('/header?') && !u.includes('_mode=filter-options'))
    .map((u) => new URLSearchParams(u.split('?')[1]));
}

let location;
function LocationProbe() {
  location = useLocation();
  return null;
}

function renderPage(url = '/not-posted-documents') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/not-posted-documents"
          element={(
            <>
              <NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />
              <LocationProbe />
            </>
          )} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowOf = (id) => screen.getByTestId(`row-${id}`);
const selectRow = (id) => fireEvent.click(within(rowOf(id)).getByRole('checkbox'));

beforeEach(() => {
  vi.clearAllMocks();
  uiState.impl = uiState.identity;
  globalThis.fetch = mkFetch();
});

describe('NotPostedDocumentsPage — toolbar', () => {
  it('renders the quick filters and the right-side actions, with no "Buscar" and no reset by default', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    expect(screen.getByTestId('npd-filter-document-type')).toHaveTextContent('allDocuments');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('allStatuses');
    expect(screen.getByTestId('npd-filter-date-range')).toHaveTextContent('dateRangeLast12Months');
    expect(screen.getByTestId('npd-share')).toBeInTheDocument();
    expect(screen.getByTestId('finance-refresh-button')).toBeInTheDocument();
    expect(screen.queryByTestId('npd-filter-apply')).not.toBeInTheDocument();
    expect(screen.queryByTestId('npd-reset-filters')).not.toBeInTheDocument();
  });

  it('loads the last 12 months by default, with no status or document filter', async () => {
    renderPage();
    await waitFor(() => expect(rowRequests().length).toBe(1));
    const [query] = rowRequests();
    expect(query.get('dateFrom')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(query.get('dateTo')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(query.has('accountingStatus')).toBe(false);
    expect(query.has('document')).toBe(false);
  });

  it('lists document types alphabetically under the "Tipo de documento" heading', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-filter-document-type'));
    expect(await screen.findByText('documentType', { selector: 'div' })).toBeInTheDocument();
    const options = screen.getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => ['Albarán (Cliente)', 'Factura (Cliente)', 'docTypeMatchedInvoices', 'Transacción'].includes(t));
    // "Relación albarán-factura" (MI) sorts by its OWN translated name, not core's.
    expect(options).toEqual(['Albarán (Cliente)', 'docTypeMatchedInvoices', 'Factura (Cliente)', 'Transacción']);
  });

  it('refetches as soon as a document type is picked, and puts it in the URL', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-filter-document-type'));
    fireEvent.click(await screen.findByText('Albarán (Cliente)'));

    await waitFor(() => expect(rowRequests().length).toBe(2));
    expect(rowRequests()[1].get('document')).toBe('GS');
    expect(location.search).toBe('?document=GS');
    expect(screen.getByTestId('npd-reset-filters')).toBeInTheDocument();
  });

  it('multi-selects statuses as badges, sends E and C for "Error", and counts them on the trigger', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-filter-accounting-status'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'postedStatusPeriodClosed' }));
    await waitFor(() => expect(location.search).toBe('?status=p'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'notPostedStatusError' }));

    await waitFor(() => expect(location.search).toBe('?status=p%2CE'));
    expect(rowRequests().at(-1).get('accountingStatus')).toBe('p,E,C');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('statusesCount(2)');
    // No search box in the status list.
    expect(screen.queryByPlaceholderText('searchValues')).not.toBeInTheDocument();
  });

  it('"Todos los errores" ticks every error status, reads as such on the trigger, and unticks them all', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-filter-accounting-status'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'allErrors' }));

    await waitFor(() => expect(location.search).toBe('?status=p%2Ci%2CNC%2CE'));
    expect(rowRequests().at(-1).get('accountingStatus')).toBe('p,i,NC,E,C');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('allErrors');
    expect(screen.getByRole('checkbox', { name: 'allErrors' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'notPostedStatusUnposted' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('checkbox', { name: 'allErrors' }));
    await waitFor(() => expect(location.search).toBe(''));
  });

  it('unticking one error status drops "Todos los errores" and counts the rest', async () => {
    renderPage('/not-posted-documents?status=p,i,NC,E');
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-filter-accounting-status'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'postedStatusCostNotCalculated' }));

    await waitFor(() => expect(location.search).toBe('?status=p%2Ci%2CE'));
    expect(screen.getByRole('checkbox', { name: 'allErrors' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('statusesCount(3)');
  });

  it('restores filters from the URL on load (Share / browser Back)', async () => {
    renderPage('/not-posted-documents?document=SI&status=N&date=all');
    await waitFor(() => expect(rowRequests().length).toBe(1));
    const [query] = rowRequests();
    expect(query.get('document')).toBe('SI');
    expect(query.get('accountingStatus')).toBe('N');
    expect(query.has('dateFrom')).toBe(false);
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('notPostedStatusUnposted');
  });

  it('"Limpiar filtros" returns to the defaults, including the 12-month window', async () => {
    renderPage('/not-posted-documents?document=SI&status=N&date=all');
    fireEvent.click(await screen.findByTestId('npd-reset-filters'));
    await waitFor(() => expect(location.search).toBe(''));
    expect(rowRequests().at(-1).has('dateFrom')).toBe(true);
    expect(screen.queryByTestId('npd-reset-filters')).not.toBeInTheDocument();
  });

  it('Share copies the current page URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-share')); });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(toast.success).toHaveBeenCalledWith('linkCopied');
  });

  it('Share reports a clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true,
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-share')); });
    expect(toast.error).toHaveBeenCalledWith('copyFailed');
  });

  it('Refresh refetches with the same filters', async () => {
    renderPage('/not-posted-documents?document=SI');
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    await waitFor(() => expect(rowRequests().length).toBe(2));
    expect(rowRequests()[1].toString()).toBe(rowRequests()[0].toString());
  });
});

describe('NotPostedDocumentsPage — rows', () => {
  it('shows the translated type, with our own rename for MI, and the raw label when there is no code', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    expect(rowOf('doc-1')).toHaveTextContent('Factura (Cliente)');
    expect(rowOf('doc-2')).toHaveTextContent('docTypeMatchedInvoices');
    expect(rowOf('doc-3')).toHaveTextContent('Transacción');
    expect(rowOf('doc-4')).toHaveTextContent('Some Future Type');
  });

  it('renders one status badge per row; E and C both read "Error", an unknown status shows none', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    expect(screen.getByTestId('npd-status-doc-1')).toHaveTextContent('notPostedStatusError');
    expect(screen.getByTestId('npd-status-doc-2')).toHaveTextContent('notPostedStatusError');
    expect(screen.getByTestId('npd-status-doc-3')).toHaveTextContent('postedStatusPeriodClosed');
    expect(screen.getByTestId('npd-status-doc-5')).toHaveTextContent('postedStatusCostNotCalculated');
    expect(screen.queryByTestId('npd-status-doc-4')).not.toBeInTheDocument();
  });

  it('sends the bearer token and the UI locale', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES' }),
      }),
    );
  });

  it('shows the "nothing to post" empty state, with no reset action, when the defaults return nothing', async () => {
    globalThis.fetch = mkFetch([]);
    renderPage();
    const empty = await screen.findByTestId('npd-empty-none');
    expect(empty).toHaveTextContent('notPostedEmptyNoneTitle');
    expect(screen.queryByTestId('npd-empty-reset-filters')).not.toBeInTheDocument();
  });

  it('shows the "no matches" empty state with a reset action when filters return nothing', async () => {
    globalThis.fetch = mkFetch([]);
    renderPage('/not-posted-documents?status=i');
    const empty = await screen.findByTestId('npd-empty-filtered');
    expect(empty).toHaveTextContent('notPostedEmptyFilteredTitle');
    expect(empty).toHaveTextContent('notPostedEmptyFilteredDescription');
    fireEvent.click(screen.getByTestId('npd-empty-reset-filters'));
    await waitFor(() => expect(location.search).toBe(''));
  });

  // ETP-5485 (BUG-2) — a load failure never renders raw backend text.
  it('shows the translated load error, never the raw backend or HTTP text', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      'dateFrom=': () => Promise.resolve({
        ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({ message: 'Something went wrong' }),
      }),
    });
    renderPage();
    expect(await screen.findByTestId('npd-load-error')).toHaveTextContent('documentsLoadError');
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal Server Error')).not.toBeInTheDocument();
  });

  it('shows the translated load error when the request throws', async () => {
    globalThis.fetch = mkFetch(ROWS, { 'dateFrom=': () => Promise.reject(new Error('Failed to fetch')) });
    renderPage();
    expect(await screen.findByTestId('npd-load-error')).toHaveTextContent('documentsLoadError');
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  // ETP-5485 (BUG-2) — the backend answers 403 for a role without the process grant.
  it('renders the access-denied screen when the load answers 403', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      'dateFrom=': () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({ message: 'Access denied' }) }),
    });
    renderPage();
    expect(await screen.findByTestId('window-access-denied')).toHaveTextContent('windowAccessDenied');
    expect(screen.queryByTestId('npd-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Forbidden')).not.toBeInTheDocument();
  });

  it('aborts the in-flight rows request when the page unmounts', async () => {
    let rowsSignal;
    const base = mkFetch(ROWS, { 'dateFrom=': () => new Promise(() => {}) });
    globalThis.fetch = vi.fn((url, init) => {
      if (String(url).includes('dateFrom=')) rowsSignal = init?.signal;
      return base(url, init);
    });
    const { unmount } = renderPage();
    await waitFor(() => expect(rowsSignal).toBeDefined());
    expect(rowsSignal.aborted).toBe(false);
    unmount();
    expect(rowsSignal.aborted).toBe(true);
  });

  it('sorts by the translated type when its column header is clicked', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(within(screen.getAllByTestId('column-header-documentTypeLabel')[0]).getByRole('button'));
    const order = screen.getAllByTestId(/^row-doc-/).map((r) => r.getAttribute('data-testid'));
    // docTypeMatchedInvoices < Factura (Cliente) < Goods Receipt (no option, raw label)
    // < Some Future Type < Transacción
    expect(order).toEqual(['row-doc-2', 'row-doc-1', 'row-doc-5', 'row-doc-4', 'row-doc-3']);
  });
});

describe('NotPostedDocumentsPage — row actions', () => {
  it('"Open document" goes to the source window record', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    fireEvent.click(screen.getByTestId('npd-open-row-doc-1'));
    expect(location.pathname).toBe('/sales-invoice/doc-1');
  });

  it('"Open document" on a transaction goes to its financial account', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-3'));
    fireEvent.click(screen.getByTestId('npd-open-row-doc-3'));
    expect(location.pathname).toBe('/financial-account/acc-9');
  });

  it('offers no "Open document" for a row without a known type', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-4'));
    expect(screen.queryByTestId('npd-open-row-doc-4')).not.toBeInTheDocument();
  });

  it('posts a row to its action URL, toasts success and reloads', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-1')); });

    const post = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/action/post'));
    expect(String(post[0])).toBe(`${BASE_URL}/header/doc-1/action/post`);
    expect(JSON.parse(post[1].body)).toEqual({ tableId: '318', recordId: 'doc-1' });
    expect(toast.success).toHaveBeenCalledWith('INV-001 — documentPosted');
    await waitFor(() => expect(rowRequests().length).toBe(2));
  });

  it('disables the row post link while its post is in flight', async () => {
    let resolvePost;
    globalThis.fetch = mkFetch(ROWS, {
      '/action/post': () => new Promise((resolve) => { resolvePost = resolve; }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    const link = screen.getByTestId('npd-post-row-doc-1');
    fireEvent.click(link);
    await waitFor(() => expect(link).toBeDisabled());
    await act(async () => { resolvePost({ ok: true, json: async () => ({ success: true }) }); });
    await waitFor(() => expect(link).not.toBeDisabled());
  });

  it('a row without tableId fails client-side without calling the backend', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-4'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-4')); });
    expect(toast.error).toHaveBeenCalledWith('postingFailed');
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/action/post'))).toBe(false);
  });

  it('a 403 on post shows the translated failure, never the status text', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      '/action/post': () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({ message: 'Access denied' }) }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-1')); });
    expect(toast.error).toHaveBeenCalledWith('postingFailed');
    expect(toast.error).not.toHaveBeenCalledWith('Forbidden');
  });

  // ETP-5175 — the Invalid-Account identity renders in the UI locale.
  it('renders an Invalid-Account failure from messageKeys + messageParams', async () => {
    const dictionary = { 'backendError.invalidAccount.base': 'BASE.', 'backendError.invalidAccount.bpOnly': '(C: {bp})' };
    uiState.impl = (key, params = {}) => Object.keys(params)
      .reduce((text, p) => text.replace(`{${p}}`, params[p]), dictionary[key] ?? key);
    globalThis.fetch = mkFetch(ROWS, {
      '/action/post': () => Promise.resolve({
        ok: false, status: 422, json: async () => ({
          success: false, message: 'backend prose',
          messageKeys: ['InvalidAccount', 'ETGO_InvalidAccountBpOnly'], messageParams: { bpName: 'Acme' },
        }),
      }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-1')); });
    expect(toast.error).toHaveBeenCalledWith('BASE. (C: Acme)');
  });

  it('a 200 with an unparseable body is not treated as success', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      '/action/post': () => Promise.resolve({ ok: true, json: async () => { throw new Error('html'); } }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-1')); });
    expect(toast.error).toHaveBeenCalledWith('postingFailed');
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('NotPostedDocumentsPage — selection and bulk post', () => {
  it('shows the floating toolbar with the count once rows are selected', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    expect(screen.queryByTestId('npd-selection-toolbar')).not.toBeInTheDocument();
    selectRow('doc-1');
    selectRow('doc-2');
    expect(screen.getByTestId('npd-selection-count')).toHaveTextContent('selected(2)');
  });

  it('bulk-posts the selected rows and shows the shared outcome toast', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      '/action/bulk-post': () => json({
        ok: 1, total: 2, success: false,
        results: [
          { recordId: 'doc-1', tableId: '318', success: true, message: 'ok' },
          { recordId: 'doc-2', tableId: '472', success: false, message: 'Boom' },
        ],
      }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    selectRow('doc-2');
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });

    const call = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/action/bulk-post'));
    expect(JSON.parse(call[1].body).rows).toEqual([
      { tableId: '318', recordId: 'doc-1', label: 'INV-001' },
      { tableId: '472', recordId: 'doc-2', label: 'MI-002' },
    ]);
    // 1 ok + 1 failed: the shared toast's mixed-outcome summary.
    expect(toast.warning).toHaveBeenCalledWith('processExecuted');
    await waitFor(() => expect(screen.queryByTestId('npd-selection-toolbar')).not.toBeInTheDocument());
  });

  it('a single failed bulk row surfaces its real backend error', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      '/action/bulk-post': () => json({
        ok: 0, total: 1, success: false,
        results: [{ recordId: 'doc-1', tableId: '318', success: false, message: 'Period closed for this date' }],
      }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });
    expect(toast.error).toHaveBeenCalledWith('Period closed for this date');
  });

  it('counts a selected row without tableId as omitted instead of dropping it', async () => {
    globalThis.fetch = mkFetch(ROWS, {
      '/action/bulk-post': () => json({ ok: 1, total: 1, success: true, results: [{ recordId: 'doc-1', success: true }] }),
    });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    selectRow('doc-4');
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });
    const call = globalThis.fetch.mock.calls.find(([u]) => String(u).includes('/action/bulk-post'));
    expect(JSON.parse(call[1].body).rows.map((r) => r.recordId)).toEqual(['doc-1']);
    // 1 ok + 1 omitted (the row that could not be sent) → mixed-outcome summary with omitted.
    expect(toast.warning).toHaveBeenCalledWith('processExecutedWithOmitted');
  });

  it('only rows without tableId: fails without calling the backend', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-4'));
    selectRow('doc-4');
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });
    expect(toast.error).toHaveBeenCalledWith('postingFailed');
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/action/bulk-post'))).toBe(false);
  });

  it('a network error on bulk post shows the failure toast', async () => {
    globalThis.fetch = mkFetch(ROWS, { '/action/bulk-post': () => Promise.reject(new Error('Failed to fetch')) });
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });
    expect(toast.error).toHaveBeenCalled();
  });

  it('clears the selection when a filter changes', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    expect(screen.getByTestId('npd-selection-toolbar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('npd-filter-document-type'));
    fireEvent.click(await screen.findByText('Albarán (Cliente)'));
    await waitFor(() => expect(screen.queryByTestId('npd-selection-toolbar')).not.toBeInTheDocument());
  });

  it('the toolbar close button clears the selection', async () => {
    renderPage();
    await waitFor(() => rowOf('doc-1'));
    selectRow('doc-1');
    const bar = screen.getByTestId('npd-selection-toolbar');
    fireEvent.click(within(bar).getByTitle('close'));
    await waitFor(() => expect(screen.queryByTestId('npd-selection-toolbar')).not.toBeInTheDocument());
  });
});
