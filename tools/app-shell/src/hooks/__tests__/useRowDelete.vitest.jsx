import { renderHook, act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRowDelete } from '../useRowDelete';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      deleteConfirmTitle: 'Confirm Delete',
      deleteConfirmMessage: 'Are you sure?',
      cancel: 'Cancel',
      delete: 'Delete',
      recordDeleted: 'Record deleted',
      networkError: 'Network error',
    };
    return map[key] || key;
  },
}));

vi.mock('@/auth/api', () => ({
  authHeaders: (t) => ({ 'Accept-Language': 'es_ES', ...(t ? { Authorization: `Bearer ${t}` } : {}) }),
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Accept-Language': 'es_ES' }),
}));

vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: async (res, ui) => {
    try {
      const body = await res.json();
      return body.message || null;
    } catch {
      return null;
    }
  },
}));

describe('useRowDelete', () => {
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

  it('returns requestDelete function and deleteDialog JSX', () => {
    const { result } = renderHook(() => useRowDelete(defaultOpts));
    expect(typeof result.current.requestDelete).toBe('function');
    expect(result.current.deleteDialog).toBeDefined();
  });

  it('requestDelete ignores rows without id', () => {
    const { result } = renderHook(() => useRowDelete(defaultOpts));
    act(() => {
      result.current.requestDelete({});
      result.current.requestDelete(null);
    });
    // Should not throw, dialog stays closed
  });

  it('opens dialog when requestDelete is called with a valid row', () => {
    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestDelete({ id: '123' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    act(() => {
      screen.getByText('Del').click();
    });
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls DELETE endpoint on confirm and triggers onSuccess', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestDelete({ id: '456' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => {
      await user.click(screen.getByText('Del'));
    });

    await act(async () => {
      await user.click(screen.getByTestId('row-quick-action-delete-confirm'));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/456',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(defaultOpts.onSuccess).toHaveBeenCalled();
  });

  it('calls deleteFn instead of a plain DELETE when provided', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete({ ...defaultOpts, deleteFn });
      return (
        <>
          <button onClick={() => requestDelete({ id: '789', status: 'RPPC' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    await act(async () => { await user.click(screen.getByTestId('row-quick-action-delete-confirm')); });

    expect(deleteFn).toHaveBeenCalledWith({ id: '789', status: 'RPPC' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(defaultOpts.onSuccess).toHaveBeenCalled();
  });

  it('shows an error toast and does not call onSuccess when deleteFn throws', async () => {
    const { toast } = await import('sonner');
    const deleteFn = vi.fn().mockRejectedValue(new Error('Cannot remove: referenced elsewhere'));

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete({ ...defaultOpts, deleteFn });
      return (
        <>
          <button onClick={() => requestDelete({ id: '999' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    await act(async () => { await user.click(screen.getByTestId('row-quick-action-delete-confirm')); });

    expect(toast.error).toHaveBeenCalledWith('Cannot remove: referenced elsewhere');
    expect(defaultOpts.onSuccess).not.toHaveBeenCalled();
  });

  // ETP-4656 — standardized delete UX: a failed delete must close the confirm
  // dialog too (previously it stayed open on top of the error toast).
  it('closes the confirm dialog on failure too (not just on success)', async () => {
    const { toast } = await import('sonner');
    const deleteFn = vi.fn().mockRejectedValue(new Error('Cannot remove: referenced elsewhere'));

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete({ ...defaultOpts, deleteFn });
      return (
        <>
          <button onClick={() => requestDelete({ id: '999' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();

    await act(async () => { await user.click(screen.getByTestId('row-quick-action-delete-confirm')); });

    expect(toast.error).toHaveBeenCalledWith('Cannot remove: referenced elsewhere');
    // Dialog content is unmounted (Dialog's `open` prop is now false).
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-quick-action-delete-confirm')).not.toBeInTheDocument();
  });

  it('cancel button closes the dialog without deleting', async () => {
    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestDelete({ id: '111' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();

    await act(async () => { await user.click(screen.getByText('Cancel')); });

    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(defaultOpts.onSuccess).not.toHaveBeenCalled();
  });

  it('shows the server error message and closes the dialog when the plain DELETE responds not-ok', async () => {
    const { toast } = await import('sonner');
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ message: 'Referenced by an existing invoice' }),
    });

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestDelete({ id: '222' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    await act(async () => { await user.click(screen.getByTestId('row-quick-action-delete-confirm')); });

    expect(toast.error).toHaveBeenCalledWith('Referenced by an existing invoice');
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    expect(defaultOpts.onSuccess).not.toHaveBeenCalled();
  });

  it('closes the confirm dialog and calls onSuccess on a successful delete (regression)', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });

    function TestComponent() {
      const { requestDelete, deleteDialog } = useRowDelete(defaultOpts);
      return (
        <>
          <button onClick={() => requestDelete({ id: '456' })}>Del</button>
          {deleteDialog}
        </>
      );
    }

    render(<TestComponent />);
    const user = userEvent.setup();

    await act(async () => { await user.click(screen.getByText('Del')); });
    await act(async () => { await user.click(screen.getByTestId('row-quick-action-delete-confirm')); });

    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    expect(defaultOpts.onSuccess).toHaveBeenCalled();
  });
});
