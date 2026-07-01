// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { toast } from 'sonner';

import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';

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
          response: {
            data: [
              {
                documentTypes: [{ value: 'SI', label: 'Sales Invoice' }],
                accountingStatuses: [],
              },
            ],
          },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ response: { data: rows } }),
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

  it('sends Authorization Bearer header', async () => {
    globalThis.fetch = mkFetch([]);
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
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
      Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ success: true }] } }) }),
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
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
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
        json: async () => ({ response: { data: [{ ok: 2, total: 2 }] } }),
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
        json: async () => ({ response: { data: [{ ok: 1, total: 2 }] } }),
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
        json: async () => ({ response: { data: [{ ok: 0, total: 1 }] } }),
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
        json: async () => ({ response: { data: [] } }),
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
        json: async () => ({
          response: { data: [{ success: false, message: 'Accounting period closed' }] },
        }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('npd-post-row-doc-1'));
    });

    expect(toast.error).toHaveBeenCalledWith('Accounting period closed');
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
