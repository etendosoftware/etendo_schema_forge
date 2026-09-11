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

import BulkDocumentAction, { buildInOutActions, buildPostActions, postRowFilter } from '../BulkDocumentAction.jsx';

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

// ETP-5209 — buildPostActions/postRowFilter back the row-hover kebab and the
// second bulk BulkDocumentAction instance added to purchase-invoice, sales-invoice,
// goods-receipt and goods-shipment. Unlike buildInOutActions (and the
// matched-purchase-invoices post/unpost pair), this gate offers only 'post' — there
// is no bulk unpost for these windows — and requires a row to be BOTH processed
// (completed) AND not yet posted.
describe('buildPostActions', () => {
  it('offers post when at least one selected row is processed and not posted', () => {
    const rows = [{ processed: 'Y', posted: 'N' }];
    expect(buildPostActions(rows)).toEqual([{ value: 'post', labelKey: 'post' }]);
  });

  it('returns empty array when every row is already posted', () => {
    const rows = [{ processed: 'Y', posted: 'Y' }];
    expect(buildPostActions(rows)).toEqual([]);
  });

  it('returns empty array when no row is processed yet', () => {
    const rows = [{ processed: 'N', posted: 'N' }];
    expect(buildPostActions(rows)).toEqual([]);
  });

  it('offers post when at least one of several rows qualifies (mixed selection)', () => {
    const rows = [
      { processed: 'Y', posted: 'Y' }, // already posted
      { processed: 'N', posted: 'N' }, // not processed yet
      { processed: 'Y', posted: 'N' }, // qualifies
    ];
    expect(buildPostActions(rows)).toEqual([{ value: 'post', labelKey: 'post' }]);
  });

  it('treats a real boolean true/false the same as Y/N', () => {
    expect(buildPostActions([{ processed: true, posted: false }])).toEqual([{ value: 'post', labelKey: 'post' }]);
    expect(buildPostActions([{ processed: true, posted: true }])).toEqual([]);
  });

  it('returns empty array for an empty selection', () => {
    expect(buildPostActions([])).toEqual([]);
  });
});

// ETP-5209 — `postRowFilter` is a plain function now (not a hook-producing
// factory): `ui` is the 3rd argument, supplied by BulkDocumentAction's own
// `handleDone` at CALL time. These tests got simpler as a direct result — no
// factory setup, just call the exported function with a stub ui() translator.
describe('postRowFilter — pre-blocks rows the Post action cannot touch', () => {
  const ui = (key) => key;

  it('allows a processed, unposted row', () => {
    expect(postRowFilter({ processed: 'Y', posted: 'N' }, 'post', ui)).toBe(true);
  });

  it('blocks an already-posted row with bulkRowAlreadyPosted', () => {
    expect(postRowFilter({ processed: 'Y', posted: 'Y' }, 'post', ui)).toBe('bulkRowAlreadyPosted');
  });

  it('blocks a not-yet-processed row with bulkRowNotCompleted', () => {
    expect(postRowFilter({ processed: 'N', posted: 'N' }, 'post', ui)).toBe('bulkRowNotCompleted');
  });

  it('does not gate a different action (always true when action !== post)', () => {
    expect(postRowFilter({ processed: 'N', posted: 'Y' }, 'unpost', ui)).toBe(true);
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

// ETP-5209 — proves the `rowFilter` contract works end-to-end through a REAL
// render of BulkDocumentAction: the caller only needs to pass a plain
// `(row, action, ui) => ...` function reference (like `postRowFilter` above)
// and BulkDocumentAction supplies `ui` itself at call time, from its own safe
// `useUI()` call. This is the regression that would have caught ETP-5209 at
// the component-contract level: before the fix, `rowFilter` was built via
// `createPostRowFilter(ui)`, which required the CALLER to already hold a
// hook-derived `ui` — forcing every `bulkActions` wrapper (invoked as a plain
// function by ListView.jsx, not JSX) to call `useUI()` itself, a Rules-of-Hooks
// violation the instant the selection toolbar mounted.
describe('BulkDocumentAction — supplies ui() to rowFilter itself (ETP-5209)', () => {
  const STORAGE_KEY = 'bulkActionResult';

  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  it('calls rowFilter with (row, action, ui) — the caller never has to create its own ui()', async () => {
    const rowFilter = vi.fn(() => true);
    const rows = [{ id: 'row-1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        rowFilter={rowFilter}
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText('done'));

    await waitFor(() => expect(rowFilter).toHaveBeenCalled());
    const [row, action, ui] = rowFilter.mock.calls[0];
    expect(row).toEqual(rows[0]);
    expect(action).toBe('CO');
    // The mocked useUI() (top of file) returns the identity function — proves
    // the 3rd argument really is a usable ui() translator, not undefined.
    expect(ui).toBeInstanceOf(Function);
    expect(ui('someKey')).toBe('someKey');

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it('pre-blocks a row when rowFilter returns a rejection message (no ui needed from the caller side)', async () => {
    const rowFilter = vi.fn(() => 'bulkRowAlreadyPosted');
    const rows = [{ id: 'row-2', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        rowFilter={rowFilter}
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText('done'));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    // ETP-5209 — a row blocked by rowFilter BEFORE any API call is `omitted`,
    // never `failed`: nothing was actually attempted, let alone errored.
    const { ok, omitted, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    expect(ok).toBe(0);
    expect(failed).toEqual([]);
    expect(omitted).toEqual([{ documentNo: 'row-2', message: 'bulkRowAlreadyPosted' }]);

    // A blocked row still uses the longer 1500ms delay before reload (see
    // BulkDocumentAction.jsx's `failed.length === 0 && omitted.length === 0`
    // branch) — same pattern as the actionMode failure test above.
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
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