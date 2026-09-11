import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: vi.fn().mockResolvedValue({}),
  }),
}));

// ETP-5075 — `useNeoAction` backs the `actionMode="neoAction"` path. Exposed as
// vi.fn()s (not an inline arrow) via vi.hoisted so individual tests can swap
// the resolved value / assert call args — unlike `useDocumentAction` above,
// whose fixed resolved value is fine for the pre-existing DocAction-path tests
// that never exercise `actionMode`. vi.mock factories are hoisted above every
// import, so any variable they reference must itself be declared through
// vi.hoisted (a plain `const` here would throw a TDZ ReferenceError).
const { mockNeoExecute, mockUseNeoAction } = vi.hoisted(() => {
  const mockNeoExecute = vi.fn();
  const mockUseNeoAction = vi.fn(() => ({ execute: mockNeoExecute, loading: false }));
  return { mockNeoExecute, mockUseNeoAction };
});
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: (...args) => mockUseNeoAction(...args),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, value, onValueChange }) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

import BulkDocumentAction, { buildInOutActions } from '../BulkDocumentAction.jsx';

describe('buildInOutActions', () => {
  it('returns CO action when rows have draft status', () => {
    const rows = [{ documentStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'book' }]);
  });

  it('returns empty array when no draft rows', () => {
    const rows = [{ documentStatus: 'CO' }];
    expect(buildInOutActions(rows)).toEqual([]);
  });

  it('checks docStatus fallback', () => {
    const rows = [{ docStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'book' }]);
  });
});

describe('BulkDocumentAction', () => {
  it('returns null when no rows selected', () => {
    const { container } = render(
      <BulkDocumentAction selectedRows={[]} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no valid actions for selected rows', () => {
    const rows = [{ id: '1', documentStatus: 'VO' }]; // void has no action
    const { container } = render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(container.innerHTML).toBe('');
  });

  // ETP-4972 — the button label dropped the trailing "(count)" suffix
  // (previously `{ui(labelKey)} ({selectedRows.length})`) to match the
  // Figma "Confirmar"/"Procesado masivo" button, which carries only the
  // plain label. The selection count is still shown elsewhere (the
  // SelectionToolbar's own counter segment); this button just stopped
  // duplicating it.
  it('renders button with plain label (no row-count suffix) for draft rows', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText('bulkCompletion')).toBeInTheDocument();
  });

  it('renders button for completed rows (reactivate action)', () => {
    const rows = [{ id: '1', documentStatus: 'CO' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/bulkCompletion/)).toBeInTheDocument();
  });

  it('renders with both draft and completed rows (two actions), still with the plain label', () => {
    const rows = [
      { id: '1', documentStatus: 'DR' },
      { id: '2', documentStatus: 'CO' },
    ];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText('bulkCompletion')).toBeInTheDocument();
  });

  it('opens dialog when button is clicked', async () => {
    const user = userEvent.setup();
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    await user.click(screen.getByText(/bulkCompletion/));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('documentAction')).toBeInTheDocument();
  });

  it('uses custom buildActions when provided', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    const buildActions = vi.fn().mockReturnValue([{ value: 'CUSTOM', labelKey: 'customAction' }]);
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" buildActions={buildActions} />,
    );
    expect(buildActions).toHaveBeenCalledWith(rows);
  });

  it('uses custom labelKey', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" labelKey="customLabel" />,
    );
    expect(screen.getByText(/customLabel/)).toBeInTheDocument();
  });

  it('uses docStatus when documentStatus is missing', () => {
    const rows = [{ id: '1', docStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/bulkCompletion/)).toBeInTheDocument();
  });
});

// ETP-5075 — `actionMode` retargets the per-row executor from
// `useDocumentAction` (throws on failure) to a normalising adapter around
// `useNeoAction` (resolves `{ success: false }` on failure). The adapter is
// the highest-value thing to test here: if the normalisation regressed,
// every failed row would be silently counted as a success and the toast
// would read "N ok, 0 failed" — a silent data-integrity lie. These tests
// assert on the real `sessionStorage` payload `handleDone` writes, the same
// contract the ETP-4972 floating toolbar reads to render its result toast.
describe('BulkDocumentAction — actionMode (ETP-5075)', () => {
  const STORAGE_KEY = 'bulkActionResult';
  const buildActions = () => [{ value: 'post', labelKey: 'post' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNeoAction.mockReturnValue({ execute: mockNeoExecute, loading: false });
    sessionStorage.clear();
    // handleDone calls window.location.reload() after a setTimeout — jsdom
    // throws "Not implemented: navigation" without this stub, same pattern
    // CopyRecordLinkButton.vitest.jsx uses for window.location.
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  it('a neoAction failure ({ success: false }) is reported as a FAILURE, not silently counted as ok', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: false, message: 'boom' });
    const rows = [{ id: 'row-1' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="matched-purchase-invoices"
        actionMode="neoAction"
        buildActions={buildActions}
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText('done'));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

    expect(ok).toBe(0);
    expect(failed).toEqual([{ documentNo: 'row-1', message: 'boom' }]);
    expect(mockNeoExecute).toHaveBeenCalledWith('row-1', 'post');

    // Failed rows use the longer 1500ms delay before reload — proves the
    // failure was actually detected, not just that sessionStorage happened
    // to contain the right shape.
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('neoAction happy path ({ success: true }) is counted in ok and never touches the DocAction endpoint', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    const rows = [{ id: 'row-2' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="matched-purchase-invoices"
        actionMode="neoAction"
        buildActions={buildActions}
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText('done'));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

    expect(ok).toBe(1);
    expect(failed).toEqual([]);
    // Went through useNeoAction's execute (the generic /action/{name} endpoint),
    // not useDocumentAction's execute (/action/documentAction).
    expect(mockNeoExecute).toHaveBeenCalledWith('row-2', 'post');
    expect(mockUseNeoAction).toHaveBeenCalled();
  });

  it('non-regression: default actionMode (prop omitted) still uses the DocAction path — existing windows unchanged', async () => {
    const rows = [{ id: 'row-3', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="sales-order"
        // actionMode intentionally omitted — must default to 'documentAction'
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText('done'));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

    // useDocumentAction's mocked execute (top of file) always resolves {} — a
    // success — and useNeoAction must never be invoked for the default mode.
    expect(ok).toBe(1);
    expect(failed).toEqual([]);
    expect(mockNeoExecute).not.toHaveBeenCalled();
  });
});