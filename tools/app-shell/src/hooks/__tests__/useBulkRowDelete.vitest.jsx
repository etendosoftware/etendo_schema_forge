import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBulkRowDelete } from '../useBulkRowDelete';

/**
 * ETP-4656 — grid multi-select bulk delete hook.
 * Mirrors useRowDelete.vitest.jsx's conventions (same styled confirm dialog,
 * same mock shape for @/i18n / @/auth/api / @/hooks/useEntity).
 */
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// `ui('bulkDeleteConfirmMessage', { count })` and the three outcome-toast keys
// need real interpolation to assert the rendered/toasted text — same
// param-substitution convention used across the suite (e.g. useEntity.helpers.vitest.jsx).
// Wording mirrors the ETP-4656 Confluence design doc's 3-outcome table: one
// combined toast per outcome (all-succeed / partial-failure / all-fail), not
// two stacked success+error toasts.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      bulkDeleteConfirmTitle: 'Delete records',
      bulkDeleteConfirmMessage: 'Are you sure you want to delete {count} record(s)? This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
      bulkDeleteAllSucceeded: '{count} record(s) deleted successfully.',
      bulkDeletePartialFailure: '{succeeded} of {total} record(s) deleted. {failed} could not be deleted.',
      bulkDeleteAllFailed: 'None of the {count} selected record(s) could be deleted.',
    };
    let text = map[key] || key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  },
}));

vi.mock('@/auth/api', () => ({
  authHeaders: (t) => ({ 'Accept-Language': 'es_ES', ...(t ? { Authorization: `Bearer ${t}` } : {}) }),
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Accept-Language': 'es_ES' }),
}));

vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: async (res) => {
    try {
      const body = await res.json();
      return body.message || null;
    } catch {
      return null;
    }
  },
}));

describe('useBulkRowDelete', () => {
  const defaultOpts = {
    apiBaseUrl: 'http://localhost/api',
    entity: 'header',
    token: 'test-token',
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns requestBulkDelete, bulkDeleteDialog and deleting', () => {
    const { result } = renderHook(() => useBulkRowDelete(defaultOpts));
    expect(typeof result.current.requestBulkDelete).toBe('function');
    expect(result.current.bulkDeleteDialog).toBeDefined();
    expect(result.current.deleting).toBe(false);
  });

  it('ignores an empty selection (no id-bearing rows)', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{}, null])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('filters out rows without an id before opening the dialog', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'r1' }, {}, { id: 'r2' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    // 2 of the 3 rows have an id -> count interpolates to 2.
    expect(screen.getByText(/delete 2 record\(s\)/)).toBeInTheDocument();
  });

  it('shows the confirm dialog with the selection count interpolated', () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    act(() => { screen.getByText('Bulk').click(); });
    expect(screen.getByText('Delete records')).toBeInTheDocument();
    expect(screen.getByText(/delete 3 record\(s\)/)).toBeInTheDocument();
  });

  it('all rows succeed: issues one DELETE per row, toasts success, and reports back via onSuccess', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/a',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/b',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'a' }, { id: 'b' }],
      [],
    );
    // Dialog closes after a fully-successful batch.
    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
  });

  it('partial failure: fires ONE combined warning toast (not stacked success+error), and reports succeeded/failed separately', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/b')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'FK violation' }),
        });
      }
      return Promise.resolve({ ok: true });
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.warning).toHaveBeenCalledWith('1 of 2 record(s) deleted. 1 could not be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'a' }],
      [{ id: 'b' }],
    );
  });

  it('all rows fail: only the error toast fires and onSuccess reports every row as failed', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'FK violation' }),
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('None of the 2 selected record(s) could be deleted.');
    expect(onSuccess).toHaveBeenCalledWith(
      [],
      [{ id: 'a' }, { id: 'b' }],
    );
  });

  it('disables the confirm/cancel buttons while the batch is in flight', async () => {
    let resolveFetch;
    globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(screen.getByTestId('bulk-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__bulk-delete-cancel')).toBeDisabled();

    // Let the pending fetch resolve so the test doesn't leak into the next one.
    await act(async () => { resolveFetch({ ok: true }); });
  });

  it('closing the dialog without confirming does not issue any DELETE calls', async () => {
    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('Button__bulk-delete-cancel')); });

    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(defaultOpts.onSuccess).not.toHaveBeenCalled();
  });

  // ── ETP-4656 QA pass: single-row selection, large selections, mixed
  // network/HTTP failures, and double-submit protection ──────────────────

  it('single-row selection behaves the same as the N-row case (no special-casing divergence)', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'solo' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    // Singular count still renders through the same "{count} record(s)" copy.
    expect(screen.getByText(/delete 1 record\(s\)/)).toBeInTheDocument();
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/solo',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('1 record(s) deleted successfully.');
    expect(onSuccess).toHaveBeenCalledWith([{ id: 'solo' }], []);
  });

  it('large selection: issues one DELETE per row (no silent batching/truncation) and reports every row back', async () => {
    const ROWS = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}` }));
    globalThis.fetch.mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete(ROWS)}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(globalThis.fetch).toHaveBeenCalledTimes(60);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('60 record(s) deleted successfully.');
    expect(onSuccess).toHaveBeenCalledWith(ROWS, []);
  });

  it('preserves per-row succeeded/failed attribution when requests resolve out of order (slower row settles first)', async () => {
    // Row 'a' is deliberately the slowest to resolve, 'b' and 'c' settle
    // sooner — Promise.allSettled must still map each outcome back to the
    // correct original row by index, not by resolution order.
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/a')) {
        // Extra microtask hops (no real timers involved) so 'a' settles a
        // few ticks after 'b'/'c' without relying on wall-clock delay.
        return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(
          () => ({ ok: false, json: async () => ({ message: 'FK violation' }) }),
        );
      }
      return Promise.resolve({ ok: true });
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'b' }, { id: 'c' }],
      [{ id: 'a' }],
    );
  });

  it('mixes a thrown network error on one row with an HTTP 4xx failure on another in the same batch', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.endsWith('/a')) return Promise.reject(new Error('Network error'));
      if (url.endsWith('/b')) {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'FK violation' }) });
      }
      return Promise.resolve({ ok: true }); // 'c' succeeds
    });
    const onSuccess = vi.fn();

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete({ ...defaultOpts, onSuccess });
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }, { id: 'b' }, { id: 'c' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    await act(async () => { await user.click(screen.getByTestId('bulk-delete-confirm')); });

    const { toast } = await import('sonner');
    // Both the network-thrown row and the HTTP-4xx row land in `failed`,
    // regardless of which failure mode produced them — and still collapse into
    // the single partial-failure warning toast, not stacked success+error ones.
    expect(toast.warning).toHaveBeenCalledWith('1 of 3 record(s) deleted. 2 could not be deleted.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      [{ id: 'c' }],
      [{ id: 'a' }, { id: 'b' }],
    );
  });

  it('a rapid double-click on the confirm button while the batch is in flight only issues ONE batch of DELETE calls', async () => {
    // Regression guard for double-submit: the confirm button is disabled via
    // React state (`deleting`), which only takes effect after a render commits.
    // fireEvent dispatches synchronously and testing-library flushes the
    // resulting state update via `act` before the next event fires, so by the
    // time the second click event is dispatched the button must already be
    // disabled — the browser does not deliver click events to a disabled
    // button. This locks that behavior in against a future change (e.g.
    // switching the disabled wiring to something async) reintroducing it.
    let resolveFetch;
    globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    function TestComponent() {
      const { requestBulkDelete, bulkDeleteDialog } = useBulkRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestBulkDelete([{ id: 'a' }])}>Bulk</button>
          {bulkDeleteDialog}
        </>
      );
    }
    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Bulk')); });
    const confirmBtn = screen.getByTestId('bulk-delete-confirm');
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Let the pending fetch resolve so the test doesn't leak into the next one.
    await act(async () => { resolveFetch({ ok: true }); });
  });
});
