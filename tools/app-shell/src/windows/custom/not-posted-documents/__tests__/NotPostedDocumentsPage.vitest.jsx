// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { toast } from 'sonner';

import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';
import {
  declareBearerSession,
  declareCookieSession,
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
} from '@/test/sessionContract.js';

beforeEach(() => {
  declareBearerSession();
});

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BASE_URL = '/swebsf/not-posted-documents';
const TOKEN = 'test-token';

const ROWS = [
  {
    documentId: 'doc-1',
    documentType: 'Sales Invoice',
    description: 'INV-001',
    accountingDate: '2024-03-15T00:00:00',
    organization: 'Main Org',
    tableId: 'tbl-1',
  },
  {
    documentId: 'doc-2',
    documentType: 'Purchase Invoice',
    description: 'INV-002',
    accountingDate: '2024-04-20',
    organization: 'Branch',
    tableId: 'tbl-2',
  },
];

function mkFetch(rows = []) {
  return vi.fn((url) => {
    if (url.includes('_mode=filter-options')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documentTypes: [{ value: 'SI', label: 'Sales Invoice' }],
          accountingStatuses: [],
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ rows, total: rows.length }),
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotPostedDocumentsPage', () => {
  it('renders filter controls', async () => {
    globalThis.fetch = mkFetch();
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('npd-filter-document-type')).toBeInTheDocument());
    expect(screen.getByTestId('npd-filter-apply')).toBeInTheDocument();
  });

  // Regression: MultiSelect used to drop unknown props, so data-testid never
  // reached the DOM and the accounting-status filter was unqueryable in tests
  // (and by any consumer relying on it).
  it('renders the accounting status MultiSelect with its data-testid and supports toggling an option', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('_mode=filter-options')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documentTypes: [],
            accountingStatuses: [{ value: 'N', label: 'Unposted' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ rows: [], total: 0 }) });
    });

    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    const multiSelect = await waitFor(() => screen.getByTestId('npd-filter-accounting-status'));
    expect(multiSelect).toBeInTheDocument();

    const trigger = within(multiSelect).getByRole('button');
    fireEvent.click(trigger);
    const optionCheckbox = within(multiSelect).getByRole('checkbox');
    fireEvent.click(optionCheckbox);

    expect(trigger).toHaveTextContent('Unposted');

    // Toggling the same option again must deselect it (Set delete branch)
    fireEvent.click(optionCheckbox);
    expect(trigger).toHaveTextContent('—');
  });

  it('closes the accounting status dropdown when clicking outside of it', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('_mode=filter-options')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documentTypes: [],
            accountingStatuses: [{ value: 'N', label: 'Unposted' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ rows: [], total: 0 }) });
    });

    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    const multiSelect = await waitFor(() => screen.getByTestId('npd-filter-accounting-status'));
    fireEvent.click(within(multiSelect).getByRole('button'));
    expect(within(multiSelect).getByRole('checkbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(within(multiSelect).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an ellipsis and disables the row post button while a post is in flight', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    let resolvePost;
    globalThis.fetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );

    const postButton = screen.getByTestId('npd-post-row-doc-1');
    fireEvent.click(postButton);

    await waitFor(() => expect(postButton).toHaveTextContent('…'));
    expect(postButton).toBeDisabled();

    await act(async () => {
      resolvePost({ ok: true, json: async () => ({ success: true, message: 'Document posted' }) });
    });
  });

  it('shows empty state when no rows returned', async () => {
    globalThis.fetch = mkFetch([]);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-empty-state'));
  });

  it('renders rows returned by the API', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-doc-1'));
    expect(screen.getByTestId('npd-row-doc-2')).toBeInTheDocument();
  });

  it('formats accountingDate to YYYY-MM-DD', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-doc-1'));
    expect(screen.getByText('2024-03-15')).toBeInTheDocument();
  });

  it('sends the bearer credential under the bearer scheme', async () => {
    globalThis.fetch = mkFetch([]);
    render(<NotPostedDocumentsPage apiBaseUrl={BASE_URL} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` }),
      }),
    );
  });

  // ETP-4576 — the cookie half of the pair. Same page, other scheme: no header
  // carries a credential and the CSRF proof rides along instead, because this
  // page's one header bag also drives its posting actions.
  it('sends the CSRF proof and no Authorization under the cookie scheme', async () => {
    declareCookieSession();
    globalThis.fetch = mkFetch([]);
    render(<NotPostedDocumentsPage apiBaseUrl={BASE_URL} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const init = globalThis.fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['X-Go-CSRF']).toBe(TEST_CSRF_TOKEN);
  });

  it('selecting a row reveals the bulk post button', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    expect(screen.getByTestId('npd-post-selected')).toBeInTheDocument();
  });

  it('toggling a selected row hides the bulk post button again', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    expect(screen.queryByTestId('npd-post-selected')).not.toBeInTheDocument();
  });

  it('postRow POSTs to the correct action URL', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, message: 'Document posted' }) }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-1'));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/header/doc-1/action/post`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('postRow without tableId calls toast.error', async () => {
    const rowNoTable = { ...ROWS[0], tableId: null, documentId: 'doc-3' };
    globalThis.fetch = mkFetch([rowNoTable]);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-3'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-3'));
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('shows error message from API on load failure', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('_mode=filter-options')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: false,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Something went wrong' }),
      });
    });
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByText('Something went wrong'));
  });

  it('applies filters as query params when filter button clicked', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-filter-apply'));

    fireEvent.change(screen.getByTestId('npd-filter-document-type'), { target: { value: 'SI' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-filter-apply'));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('document=SI'),
      expect.anything(),
    );
  });

  // ── AbortController cancellation path ────────────────────────────────────
  // Verifies that the filter-options fetch is aborted on unmount (cleanup fn
  // from the first useEffect), and that no React state-update-after-unmount
  // warning is thrown.
  it('aborts the filter-options fetch on unmount without throwing', async () => {
    let resolveFilterOptions;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn((url) => {
      if (url.includes('_mode=filter-options')) {
        // Stall filter-options so it is still pending at unmount time
        return new Promise((res) => {
          resolveFilterOptions = () =>
            res({ ok: true, json: async () => ({}) });
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ rows: [], total: 0 }) });
    });

    const { unmount } = render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    // Unmount while filter-options fetch is in flight
    unmount();

    // Now resolve the stalled fetch — should not cause setState after unmount
    await act(async () => {
      resolveFilterOptions?.();
    });

    // No React "Can't perform a state update on an unmounted component" error
    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('unmounted'))).toBe(false);
    consoleSpy.mockRestore();
  });

  // ── Bulk-post: all success ─────────────────────────────────────────────────
  it('shows success toast when all selected documents are posted via bulk-post', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    // Select both rows
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-2'));

    // Mock the bulk-post response: ok=total (full success)
    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: 2, total: 2, success: true }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-selected'));
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('postingComplete'));
  });

  // ── Bulk-post: partial success ────────────────────────────────────────────
  it('shows partial-success toast when only some documents were posted', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-2'));

    // ok < total → partial
    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: 1, total: 2, success: false }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-selected'));
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('postingPartial'));
  });

  // ── Bulk-post: all failed ─────────────────────────────────────────────────
  it('shows error toast when no documents were posted successfully (ok=0)', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));

    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: 0, total: 1, success: false }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-selected'));
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('postingFailed'));
  });

  // ── Bulk-post: network error ──────────────────────────────────────────────
  it('shows error toast when bulk-post fetch throws a network error', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));

    globalThis.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network failure')));

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-selected'));
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('postingFailed'));
  });

  // ── Select-all → deselect-one → indeterminate ref ────────────────────────
  it('sets indeterminate on the select-all checkbox when some but not all rows are checked', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    // Click the header checkbox to select all
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);

    // Deselect one row — this puts us into "some" state
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));

    // The header checkbox should now have indeterminate set
    expect(headerCheckbox.indeterminate).toBe(true);
  });

  // ── Filter apply clears selection ─────────────────────────────────────────
  it('clears the row selection when filter is applied', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    // Select a row
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-1'));
    expect(screen.getByTestId('npd-post-selected')).toBeInTheDocument();

    // Apply filter — this should clear the selection
    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-filter-apply'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('npd-post-selected')).not.toBeInTheDocument();
    });
  });

  // ── Empty state after explicit filter returns nothing ─────────────────────
  it('shows empty state when filter apply returns an empty array', async () => {
    // Initial fetch returns rows
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-doc-1'));

    // Apply a filter that returns no rows
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('_mode=filter-options')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: [], total: 0 }),
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-filter-apply'));
    });

    await waitFor(() => screen.getByTestId('npd-empty-state'));
  });

  // ── postRow: server returns explicit success:false (error path) ───────────
  it('shows error toast when postRow receives success:false from the server', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: false, message: 'Accounting period closed' }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-1'));
    });

    expect(toast.error).toHaveBeenCalledWith('Accounting period closed');
  });

  // ── postRow: ambiguous/unparseable body must not be treated as success ─────
  it('shows error toast when postRow gets a 200 with an unparseable body (e.g. proxy error page)', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    globalThis.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        statusText: 'OK',
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-1'));
    });

    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ── postRow: network error ────────────────────────────────────────────────
  it('shows error toast when postRow fetch throws', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    globalThis.fetch.mockImplementationOnce(() => Promise.reject(new Error('timeout')));

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-1'));
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('postingFailed'));
  });

  // ── toggleAll: select-all, then deselect-all ──────────────────────────────
  it('toggleAll deselects all rows when all are already selected', async () => {
    globalThis.fetch = mkFetch(ROWS);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-1'));

    const headerCheckbox = screen.getAllByRole('checkbox')[0];

    // Select all
    fireEvent.click(headerCheckbox);
    expect(screen.getByTestId('npd-post-selected')).toBeInTheDocument();

    // Deselect all
    fireEvent.click(headerCheckbox);
    await waitFor(() => {
      expect(screen.queryByTestId('npd-post-selected')).not.toBeInTheDocument();
    });
  });

  it('shows postingFailed toast when all selected rows lack tableId', async () => {
    const rowNoTableId = { documentId: 'doc-3', documentType: 'SI', description: 'X', accountingDate: '2024-01-01', organization: 'O' };
    globalThis.fetch = mkFetch([rowNoTableId]);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => screen.getByTestId('npd-row-checkbox-doc-3'));
    fireEvent.click(screen.getByTestId('npd-row-checkbox-doc-3'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-selected'));
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('postingFailed'));
  });
});
