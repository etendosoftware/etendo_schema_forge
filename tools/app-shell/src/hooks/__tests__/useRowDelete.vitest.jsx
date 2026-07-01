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
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
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
});
