import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

// ETP-5302 — the identity translator every pre-existing test relies on
// (`bulkCompletion`, `confirm`, `accept`, … render as their own key), EXCEPT for the
// two bulk-result message keys, which carry `{ok}`/`{omitted}`/`{failed}`
// placeholders the toast fills in. Mapping only those two leaves every existing
// assertion untouched while letting the new toast tests assert the real counts
// instead of a bare key. Declared through vi.hoisted because vi.mock factories are
// hoisted above every import (a plain const would be in the TDZ when it runs).
const { UI_MESSAGES } = vi.hoisted(() => ({
  UI_MESSAGES: {
    processExecuted: '{ok} ok, {failed} failed',
    processExecutedWithOmitted: '{ok} ok, {omitted} omitted, {failed} failed',
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => UI_MESSAGES[key] ?? key,
}));

// ETP-5302 — the new in-place path shows the result toast synchronously (the old
// one persisted it to sessionStorage and let the post-reload mount of
// `useBulkActionToast` render it), so `sonner` is now an observable collaborator
// of this component and has to be mocked to be asserted on.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// ETP-5302 — promoted from an inline `vi.fn()` (a NEW spy on every render, so nothing
// could be asserted on it) to a stable hoisted mock. The pre-unpost tests at the bottom
// of this file need to prove the ORDER of two calls that go through two DIFFERENT
// executors: the unpost runs on `useNeoAction`, the document action on
// `useDocumentAction`. Its resolved value ({}, a success) is re-armed in the file-level
// beforeEach below, exactly matching the old inline behaviour every pre-existing test
// relies on.
const { mockDocExecute } = vi.hoisted(() => ({ mockDocExecute: vi.fn() }));
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: mockDocExecute }),
}));

// ETP-5302 — the pre-unpost failure message reaches the user through
// `translateBackendError` ("Factura contabilizada" → the localized wording), so the
// translator is now an observable collaborator. Spread over the real module so every
// other export stays genuine; the default implementation is the identity function, which
// leaves every pre-existing assertion in this file untouched.
const { mockTranslateBackendError } = vi.hoisted(() => ({
  mockTranslateBackendError: vi.fn((msg) => msg),
}));
vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({
  ...(await importOriginal()),
  translateBackendError: (...args) => mockTranslateBackendError(...args),
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

import BulkDocumentAction, {
  buildInOutActions, buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter,
} from '../BulkDocumentAction.jsx';

// ETP-5302 — the dialog's confirm button moved from `done` to `accept`. `done` renders
// "Completado" in es_ES, which is the name of a document STATUS, so the button read as if
// it would mark the selected documents as completed; it now reads "Aceptar"/"Accept".
// (`done` itself is untouched — RecordCreateModal still uses it.) The mocked useUI is the
// identity function, so the rendered text IS the key: centralized here so the next rename
// is a one-line change instead of ten.
const CONFIRM_BUTTON = 'accept';

// File-level: re-arms the two hoisted mocks' default behaviour before EVERY test, so a
// per-test override (a rejection, a deferred promise, a `{ success: false }`) can never
// leak into the next one. Runs before any nested beforeEach, and `vi.clearAllMocks()`
// (used by several blocks below) only clears recorded calls, never implementations.
beforeEach(() => {
  mockDocExecute.mockReset();
  mockDocExecute.mockResolvedValue({});
  mockTranslateBackendError.mockReset();
  mockTranslateBackendError.mockImplementation((msg) => msg);
});

// ETP-5302 — the DR→CO dropdown option is labelled with the `confirm` key
// ("Confirmar" in es_ES), NOT `book`. `book` also resolves to "Procesar" in
// es_ES, which is the label the *button* that opens this dialog now carries
// (`labelKey="process"` at every call site), so the old wiring rendered a
// "Procesar" button whose only dropdown option was also "Procesar" — the two
// halves of the same dialog said the same word and neither said "Confirmar".
describe('buildInOutActions', () => {
  it('returns CO action when rows have draft status', () => {
    const rows = [{ documentStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'confirm' }]);
  });

  it('returns empty array when no draft rows', () => {
    const rows = [{ documentStatus: 'CO' }];
    expect(buildInOutActions(rows)).toEqual([]);
  });

  it('checks docStatus fallback', () => {
    const rows = [{ docStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'confirm' }]);
  });

  it('never labels the CO action with the legacy book key (ETP-5302)', () => {
    const rows = [{ documentStatus: 'DR' }, { docStatus: 'DR' }];
    expect(buildInOutActions(rows).map((a) => a.labelKey)).not.toContain('book');
  });
});

// ETP-5209 — buildPostActions/postRowFilter back the row-hover kebab and the
// second bulk BulkDocumentAction instance added to purchase-invoice, sales-invoice,
// goods-receipt and goods-shipment. Unlike buildInOutActions (and the
// matched-purchase-invoices post/unpost pair), this gate offers only 'post' and requires
// a row to be BOTH processed (completed) AND not yet posted. The bulk UNPOST counterpart
// is a separate pair (buildUnpostActions/unpostRowFilter, added by ETP-5302 and covered
// below), mounted only by goods-receipt and goods-shipment.
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

// ETP-5302 — bulk "Descontabilizar". A SEPARATE pair from buildPostActions/postRowFilter
// on purpose: goods-receipt and goods-shipment mount both, while sales-invoice and
// purchase-invoice mount only the post pair — on an invoice the accounting reversal is a
// step INSIDE Reactivar (see `preUnpostActions` at the bottom of this file), never a
// standalone user action. Keeping the two pairs separate is what makes that difference
// expressible per window instead of a flag inside one shared helper.
describe('buildUnpostActions', () => {
  it('offers unpost when at least one selected row is posted', () => {
    expect(buildUnpostActions([{ posted: 'Y' }])).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
  });

  it('returns empty array when no selected row is posted', () => {
    expect(buildUnpostActions([{ posted: 'N' }, { posted: 'N' }])).toEqual([]);
  });

  it('offers unpost for a mixed selection (at least one posted row is enough)', () => {
    const rows = [{ posted: 'N' }, { processed: 'Y', posted: 'Y' }, {}];
    expect(buildUnpostActions(rows)).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
  });

  it('treats a real boolean true/false the same as Y/N', () => {
    expect(buildUnpostActions([{ posted: true }])).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
    expect(buildUnpostActions([{ posted: false }])).toEqual([]);
  });

  it('returns empty array for an empty selection (the button never renders)', () => {
    expect(buildUnpostActions([])).toEqual([]);
  });

  // Unlike buildPostActions, this gate deliberately does NOT look at `processed`: a
  // posted document is by definition already completed, so adding the check would only
  // hide the action on rows whose `processed` flag the list happens not to carry.
  it('does not require the processed flag — being posted is enough', () => {
    expect(buildUnpostActions([{ posted: 'Y' }])).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
  });
});

describe('unpostRowFilter — pre-blocks rows the Unpost action cannot touch', () => {
  const ui = (key) => key;

  it('allows a posted row', () => {
    expect(unpostRowFilter({ posted: 'Y' }, 'unpost', ui)).toBe(true);
    expect(unpostRowFilter({ posted: true }, 'unpost', ui)).toBe(true);
  });

  it('blocks a not-posted row with bulkRowNotPosted', () => {
    expect(unpostRowFilter({ posted: 'N' }, 'unpost', ui)).toBe('bulkRowNotPosted');
    expect(unpostRowFilter({}, 'unpost', ui)).toBe('bulkRowNotPosted');
  });

  it('routes the rejection through the supplied ui() translator', () => {
    const translate = vi.fn(() => 'No está contabilizado');
    expect(unpostRowFilter({ posted: 'N' }, 'unpost', translate)).toBe('No está contabilizado');
    expect(translate).toHaveBeenCalledWith('bulkRowNotPosted');
  });

  it('does not gate a different action (always true when action !== unpost)', () => {
    expect(unpostRowFilter({ posted: 'N' }, 'post', ui)).toBe(true);
    expect(unpostRowFilter({ posted: 'N' }, 'CO', ui)).toBe(true);
    expect(unpostRowFilter({ posted: 'N' }, 'RE', ui)).toBe(true);
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

  // ETP-5302 — the footer confirms with "Aceptar" (`accept`), never "Completado"
  // (`done`): the dialog operates on document ACTIONS, and "Completado" is the name
  // of a document STATUS, so the old label read as a promise to complete the
  // selected documents. `cancel` alongside it is unchanged.
  it('labels the footer confirm button with accept, not the status-like done key', async () => {
    const user = userEvent.setup();
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    await user.click(screen.getByText('bulkCompletion'));

    expect(screen.getByText(CONFIRM_BUTTON)).toBeInTheDocument();
    expect(screen.queryByText('done')).not.toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
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

// ETP-5302 — the built-in (no `buildActions` prop) action list, asserted through
// a REAL render of the dialog rather than on the useMemo's return value, because
// what regressed is what the user reads in the dropdown. The mocked `useUI` (top
// of file) is the identity function, so each `<SelectItem>` renders its own i18n
// KEY as text: seeing `confirm` here is seeing "Confirmar" in es_ES, and seeing
// `book` would be seeing "Procesar" — the same word as the button that opened
// the dialog.
describe('BulkDocumentAction — built-in action labels (ETP-5302)', () => {
  const openDialog = (rows) => {
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    // Click while 'bulkCompletion' is still unambiguous — once the dialog is
    // open the DialogTitle renders the same label as the trigger button.
    fireEvent.click(screen.getByText('bulkCompletion'));
  };

  const optionFor = (labelKey) => screen.getByText(labelKey).closest('option');

  it('labels the CO (complete) option with the confirm key, not book', () => {
    openDialog([{ id: '1', documentStatus: 'DR' }]);
    expect(optionFor('confirm')).not.toBeNull();
    expect(optionFor('confirm')).toHaveAttribute('value', 'CO');
    expect(screen.queryByText('book')).not.toBeInTheDocument();
  });

  it('keeps the RE (reactivate) option on the reactivate key — unchanged by ETP-5302', () => {
    openDialog([{ id: '1', documentStatus: 'CO' }]);
    expect(optionFor('reactivate')).toHaveAttribute('value', 'RE');
    expect(screen.queryByText('book')).not.toBeInTheDocument();
  });

  it('offers confirm + reactivate (in that order) for a mixed draft/completed selection', () => {
    openDialog([
      { id: '1', documentStatus: 'DR' },
      { id: '2', documentStatus: 'CO' },
    ]);
    // Read the options off the mocked <Select> subtree rather than by ARIA role:
    // the SelectItem stub renders a bare <option> outside any <select>, so the
    // implicit-role lookup is not something to depend on here.
    const options = [...screen.getByTestId('select').querySelectorAll('option')];
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['CO', 'RE']);
    expect(options.map((o) => o.textContent)).toEqual(['confirm', 'reactivate']);
  });

  it('applies the same confirm label through the buildInOutActions helper (receipt/shipment/return windows)', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        labelKey="process"
        buildActions={buildInOutActions}
      />,
    );
    // The button says "process" ("Procesar"); the single dropdown option must
    // say "confirm" ("Confirmar") — the two must not collapse to one word.
    fireEvent.click(screen.getByText('process'));
    expect(screen.getByText('confirm').closest('option')).toHaveAttribute('value', 'CO');
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
//
// NOTE (ETP-5302): these renders pass NO `refresh` prop, so they run the LEGACY
// FALLBACK path — persist to sessionStorage, then `window.location.reload()`. That
// is deliberate (the fallback still has to work for a host mounted outside
// ListView's `bulkActions` slot) and it is why the assertions below read the
// sessionStorage payload. The primary path is covered in the ETP-5302 describe at
// the bottom of this file.
//
// INVARIANT for every fallback-path test in this file: it MUST await its own
// `window.location.reload` before finishing. The fallback arms a real 600ms/1500ms
// timer; one that outlives its test fires inside a later test and calls that test's
// reload stub, which silently satisfies the later test's expectation early. Both
// tests below already comply.
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
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

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
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

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
//
// NOTE (ETP-5302): like the ETP-5209 block above, these renders pass NO `refresh`
// prop, so they exercise the LEGACY FALLBACK path (persist + full reload) — which
// is exactly why `sessionStorage` is still the readable record of the run here.
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
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

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
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

    expect(ok).toBe(1);
    expect(failed).toEqual([]);
    // Went through useNeoAction's execute (the generic /action/{name} endpoint),
    // not useDocumentAction's execute (/action/documentAction).
    expect(mockNeoExecute).toHaveBeenCalledWith('row-2', 'post');
    expect(mockUseNeoAction).toHaveBeenCalled();

    // HYGIENE (ETP-5302) — MANDATORY in every fallback-path test: this run armed a
    // 600ms reload timer, so await it here instead of letting it outlive the test.
    // A timer that survives its test fires inside whichever LATER test happens to be
    // waiting at that moment and calls `window.location.reload` — which by then is a
    // DIFFERENT stub object, belonging to that later test (each beforeEach in this
    // file re-stubs window.location). The later test's reload expectation is then
    // satisfied by this test's leftover timer, before its own timer has run. That is
    // exactly what made the ETP-5302 fallback test at the bottom of this file pass in
    // isolation and fail when run with its neighbours.
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
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
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

    // useDocumentAction's mocked execute (top of file) always resolves {} — a
    // success — and useNeoAction must never be invoked for the default mode.
    expect(ok).toBe(1);
    expect(failed).toEqual([]);
    expect(mockNeoExecute).not.toHaveBeenCalled();

    // HYGIENE (ETP-5302) — same rule as the test above: consume the 600ms reload
    // timer this run armed, so it cannot fire inside a later test.
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });
});

// ETP-5302 — the reported bug: running a bulk action reloaded the whole browser
// tab. The reload was never about the data — it was the transport for the result
// toast, which was persisted to sessionStorage so `useBulkActionToast`'s mount
// effect could read it back on the other side. ListView's `bulkActions` slot now
// hands down an in-place `refresh`, so the toast can be shown directly and the
// reload (with the scroll position, the active filters and the whole SPA boot it
// threw away) disappears.
//
// Every test here renders WITH a `refresh` prop — that is the primary path. The
// last test is the explicit guard that omitting it still yields the legacy
// behaviour, for a host that mounts this component outside the slot.
describe('BulkDocumentAction — refreshes the list in place instead of reloading the page (ETP-5302)', () => {
  const STORAGE_KEY = 'bulkActionResult';
  const buildPostActions = () => [{ value: 'post', labelKey: 'post' }];

  let reloadSpy;
  let originalLocationDescriptor;

  const run = (extraProps = {}) => {
    const props = {
      selectedRows: [{ id: 'row-1', documentStatus: 'DR' }],
      clearSelection: vi.fn(),
      token: 'tok',
      apiBaseUrl: '/api',
      refresh: vi.fn(),
      ...extraProps,
    };
    render(<BulkDocumentAction {...props} />);
    fireEvent.click(screen.getByText(props.labelKey || 'bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));
    return props;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Reset instead of clear: a leftover `mockResolvedValueOnce` from the ETP-5075
    // block would otherwise leak into the first test here. The base resolved value
    // is re-declared per test that needs a different one.
    mockNeoExecute.mockReset();
    mockNeoExecute.mockResolvedValue({ success: true });
    mockUseNeoAction.mockReturnValue({ execute: mockNeoExecute, loading: false });
    // jsdom throws "Not implemented: navigation" on a real reload(); the spy is the
    // only way to prove the NEGATIVE ("no reload happened") these tests are about.
    // Captured and restored so the stub does not leak out of this block.
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    }
  });

  it('refetches the list, clears the selection and never reloads the page on a clean run', async () => {
    const { refresh, clearSelection } = run();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    // The result is handed to the toast directly — nothing is parked in
    // sessionStorage waiting for a reload to pick it up.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows the success toast immediately, with the real ok/failed counts', async () => {
    const { refresh } = run();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('1 ok, 0 failed');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the error toast and STILL refetches when every row fails', async () => {
    mockNeoExecute.mockResolvedValue({ success: false, message: 'boom' });
    const { refresh } = run({
      selectedRows: [{ id: 'row-1' }],
      windowName: 'matched-purchase-invoices',
      actionMode: 'neoAction',
      buildActions: buildPostActions,
    });

    // Single-row total failure takes the ETP-5316 direct-error path — the raw
    // backend message, not the templated "0 ok, 1 failed" count.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    // The list must refresh even on a total failure: a row can fail for a reason
    // that still changed its server-side state, and a stale grid hides that.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows the warning toast and still refetches on a partial failure', async () => {
    mockNeoExecute
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: 'boom' });
    const { refresh } = run({
      selectedRows: [{ id: 'row-1' }, { id: 'row-2' }],
      windowName: 'matched-purchase-invoices',
      actionMode: 'neoAction',
      buildActions: buildPostActions,
    });

    // ETP-5316 QA rejection — a multi-record run shows ONLY the generic count summary.
    // The per-failed-row detail is never passed as a toast `description`: it does not
    // scale past a handful of rows and the raw messages are not locatable from a toast.
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('1 ok, 1 failed'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('uses the 3-count message when rowFilter omitted a row (mixed run)', async () => {
    // ETP-5209 — `omitted` (pre-blocked, never sent) stays separate from `failed`,
    // and switches the message to the "with omitted" wording. The in-place path
    // must render exactly the same toast the reload path used to.
    const rowFilter = (row) => (row.id === 'row-2' ? 'bulkRowAlreadyPosted' : true);
    const { refresh } = run({
      selectedRows: [
        { id: 'row-1', documentStatus: 'DR' },
        { id: 'row-2', documentStatus: 'DR' },
      ],
      rowFilter,
    });

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('1 ok, 1 omitted, 0 failed'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // Dynamic proof that the refresh path arms NO delayed reload. Two earlier attempts at
  // this were abandoned for good reasons, and this version avoids both:
  //   - a real sleep asserting `reloadSpy` was never called measured LEAKAGE, not this
  //     component: the fallback tests above used to arm 600ms timers and never await
  //     them, so a stray timer fired during the sleep and hit this test's reload stub
  //     (the stub is re-created per test). Fixed at the source — every fallback test in
  //     this file now awaits its own reload, so no timer outlives its test.
  //   - spying on global `setTimeout` left the clock in a state that broke the fallback
  //     test below, so the negative is asserted on OBSERVABLE effects instead.
  // The primary signal here is `clearSelection`'s CALL COUNT, which is orphan-proof: a
  // leaked timer from another test can reach the shared `window.location` stub but can
  // never reach this test's own `clearSelection`. The refresh path calls it exactly once,
  // synchronously; the fallback would call it a SECOND time from its timer.
  // The structural twin of this guarantee (no `setTimeout`/`location.reload` inside the
  // refresh branch, exactly one reload call site in the file) lives in
  // BulkDocumentAction.test.js and costs nothing to run.
  it('arms no delayed reload: nothing else happens after the refresh, even past the 600ms fallback delay', async () => {
    const { refresh, clearSelection } = run();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // 700ms > the 600ms delay a clean fallback run would use, so a reload timer armed
    // by this run would have fired by the time this resolves.
    await new Promise((resolve) => { setTimeout(resolve, 700); });

    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // ─── Fallback guard ──────────────────────────────────────────────────────
  it('FALLBACK (no refresh prop): persists the result and reloads the page, as before', async () => {
    const clearSelection = vi.fn();
    render(
      <BulkDocumentAction
        selectedRows={[{ id: 'row-1', documentStatus: 'DR' }]}
        clearSelection={clearSelection}
        token="tok"
        apiBaseUrl="/api"
        // refresh intentionally omitted — a host mounted outside ListView's
        // `bulkActions` slot has no in-place refetch to offer.
      />,
    );
    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY))).toEqual({ ok: 1, omitted: [], failed: [] });
    // The toast is NOT shown here — it is deliberately deferred to the next mount
    // of useBulkActionToast, on the other side of the reload.
    expect(toast.success).not.toHaveBeenCalled();

    // Waits on THIS test's own `clearSelection` — a mock nothing else in the file can
    // reach — and asserts the reload inside the SAME waitFor. The fallback timer runs
    // `clearSelection(); window.location.reload();` in that order, so a wait keyed on
    // the reload stub alone can be satisfied by a timer leaked from another test (the
    // stub is re-created per test, so a stray timer hits whichever one is current)
    // while this test's own timer has not run yet — and the follow-up clearSelection
    // assertion then fails with the same "expected vi.fn() to be called at least once"
    // message. Keying on the test-local mock makes the assertion immune to that even if
    // a future test forgets to await its own reload.
    await waitFor(() => {
      expect(clearSelection).toHaveBeenCalled();
      expect(reloadSpy).toHaveBeenCalled();
    }, { timeout: 3000 });
  });
});

// ETP-5302 — the reported bug. Reactivating a COMPLETED + POSTED invoice from the list's
// bulk bar failed with {"status":"error","message":"Factura contabilizada"}, while the very
// same action from the form's kebab worked. The kebab chained `unpost` → `documentAction: RE`
// (its `decisions.json` marks the action `preUnpost: true`); the bulk bar sent a bare `RE`,
// which Core rejects in C_INVOICE_POST (`IF (v_Posted='Y') THEN RAISE_APPLICATION_ERROR`).
//
// `preUnpostActions` is OPT-IN PER WINDOW, and that is the whole design: only sales-invoice
// and purchase-invoice pass `['RE']`. Orders must NOT — C_ORDER_POST1's RE branch has no
// `Posted` guard, so unposting there would be a gratuitous accounting reversal. The
// "default = never unposts" test below is the guard for that.
//
// Every test here renders WITH `refresh` (the in-place path) unless it needs to read the
// per-row failure MESSAGE, which only the fallback's persisted record carries — the toast
// itself shows counts. Those few follow this file's mandatory hygiene rule: await your own
// reload before finishing.
describe('BulkDocumentAction — preUnpostActions unposts before a bulk reactivate (ETP-5302)', () => {
  const STORAGE_KEY = 'bulkActionResult';
  const POSTED_COMPLETED = { id: 'inv-1', documentNo: 'FV-001', documentStatus: 'CO', posted: 'Y' };

  let reloadSpy;
  let originalLocationDescriptor;

  const run = (extraProps = {}) => {
    const props = {
      selectedRows: [POSTED_COMPLETED],
      clearSelection: vi.fn(),
      token: 'tok',
      apiBaseUrl: '/api',
      windowName: 'sales-invoice',
      labelKey: 'process',
      preUnpostActions: ['RE'],
      refresh: vi.fn(),
      ...extraProps,
    };
    render(<BulkDocumentAction {...props} />);
    fireEvent.click(screen.getByText(props.labelKey));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));
    return props;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockNeoExecute.mockReset();
    mockNeoExecute.mockResolvedValue({ success: true });
    mockUseNeoAction.mockReturnValue({ execute: mockNeoExecute, loading: false });
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    }
  });

  // The ORDER is the fix. Asserted causally, not just by "both were called": the unpost is
  // held on a deferred promise, and the document action must still be unfired while it is
  // pending. A regression that fires them concurrently (or in the wrong order) fails here
  // even though both calls eventually happen.
  it('unposts FIRST and dispatches the RE document action only after the unpost resolves', async () => {
    let resolveUnpost;
    mockNeoExecute.mockImplementationOnce(() => new Promise((resolve) => { resolveUnpost = resolve; }));
    const { refresh } = run();

    await waitFor(() => expect(mockNeoExecute).toHaveBeenCalledWith('inv-1', 'unpost'));
    // The document action is still gated behind the pending unpost.
    expect(mockDocExecute).not.toHaveBeenCalled();

    await act(async () => { resolveUnpost({ success: true }); });

    await waitFor(() => expect(mockDocExecute).toHaveBeenCalledWith('inv-1', 'RE'));
    expect(mockNeoExecute.mock.invocationCallOrder[0])
      .toBeLessThan(mockDocExecute.mock.invocationCallOrder[0]);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('counts the reactivated row as ok when the unpost + document action both succeed', async () => {
    const { refresh } = run();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('1 ok, 0 failed');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    expect(mockDocExecute).toHaveBeenCalledWith('inv-1', 'RE');
  });

  it('skips the unpost for a NOT-posted row and runs the document action directly', async () => {
    const { refresh } = run({
      selectedRows: [{ id: 'inv-2', documentNo: 'FV-002', documentStatus: 'CO', posted: 'N' }],
    });

    await waitFor(() => expect(mockDocExecute).toHaveBeenCalledWith('inv-2', 'RE'));
    expect(mockNeoExecute).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('1 ok, 0 failed');
  });

  // The gate is the ACTION LIST, not just the posted flag: this row IS posted, but the
  // selected action is CO (confirm), which no window ever lists in `preUnpostActions`.
  // Unposting before a confirm would be nonsense.
  it('skips the unpost for an action that is not listed in preUnpostActions (CO)', async () => {
    const { refresh } = run({
      selectedRows: [{ id: 'inv-3', documentNo: 'FV-003', documentStatus: 'DR', posted: 'Y' }],
    });

    await waitFor(() => expect(mockDocExecute).toHaveBeenCalledWith('inv-3', 'CO'));
    expect(mockNeoExecute).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  // GUARD for every window that does NOT opt in — sales-order / purchase-order and the
  // return windows included. Without `preUnpostActions`, a bulk RE must reach the backend
  // exactly as it did before ETP-5302: no accounting reversal, ever.
  it('DEFAULT (prop omitted): never unposts, even for a posted row being reactivated', async () => {
    const { refresh } = run({ preUnpostActions: undefined, windowName: 'sales-order' });

    await waitFor(() => expect(mockDocExecute).toHaveBeenCalledWith('inv-1', 'RE'));
    expect(mockNeoExecute).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('1 ok, 0 failed');
  });

  it('an empty preUnpostActions array behaves exactly like the default', async () => {
    const { refresh } = run({ preUnpostActions: [] });

    await waitFor(() => expect(mockDocExecute).toHaveBeenCalledWith('inv-1', 'RE'));
    expect(mockNeoExecute).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('a FAILED unpost fails the row and never dispatches the document action for it', async () => {
    mockNeoExecute.mockResolvedValue({ success: false, message: 'Factura contabilizada' });
    const { refresh } = run();

    // Single-row total failure takes the ETP-5316 direct-error path — the raw
    // backend message, not the templated "0 ok, 1 failed" count.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Factura contabilizada'));
    // The whole point: reactivating a still-posted document must not be attempted.
    expect(mockDocExecute).not.toHaveBeenCalled();
    // The list is still refetched — the unpost may have changed server-side state.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reports the TRANSLATED backend message for the failed row', async () => {
    const raw = 'Factura contabilizada';
    const translated = 'La factura ya está contabilizada';
    mockNeoExecute.mockResolvedValue({ success: false, message: raw });
    mockTranslateBackendError.mockImplementation((msg) => (msg === raw ? translated : msg));
    // FALLBACK path (no `refresh`): the per-row message is only readable in the persisted
    // record — the toast itself shows counts only.
    const clearSelection = vi.fn();
    render(
      <BulkDocumentAction
        selectedRows={[POSTED_COMPLETED]}
        clearSelection={clearSelection}
        token="tok"
        apiBaseUrl="/api"
        windowName="sales-invoice"
        labelKey="process"
        preUnpostActions={['RE']}
      />,
    );
    fireEvent.click(screen.getByText('process'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    expect(ok).toBe(0);
    expect(failed).toEqual([{ documentNo: 'FV-001', message: translated }]);
    expect(mockTranslateBackendError).toHaveBeenCalledWith(raw, expect.any(Function));
    expect(mockDocExecute).not.toHaveBeenCalled();

    // HYGIENE: consume this run's own reload timer, keyed on the test-local mock.
    await waitFor(() => {
      expect(clearSelection).toHaveBeenCalled();
      expect(reloadSpy).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('falls back to the generic actionFailed label when the message cannot be translated', async () => {
    mockNeoExecute.mockResolvedValue({ success: false, message: undefined });
    mockTranslateBackendError.mockImplementation(() => '');
    const clearSelection = vi.fn();
    render(
      <BulkDocumentAction
        selectedRows={[POSTED_COMPLETED]}
        clearSelection={clearSelection}
        token="tok"
        apiBaseUrl="/api"
        windowName="sales-invoice"
        labelKey="process"
        preUnpostActions={['RE']}
      />,
    );
    fireEvent.click(screen.getByText('process'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    // The mocked useUI is the identity function, so `ui('actionFailed')` renders its key.
    expect(failed).toEqual([{ documentNo: 'FV-001', message: 'actionFailed' }]);

    await waitFor(() => {
      expect(clearSelection).toHaveBeenCalled();
      expect(reloadSpy).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  // Per-row isolation: one row's failed unpost must not cancel the others. The unposted
  // row goes straight to RE and succeeds; only the posted one fails.
  it('isolates the failure per row in a mixed selection', async () => {
    mockNeoExecute.mockResolvedValue({ success: false, message: 'Factura contabilizada' });
    const { refresh } = run({
      selectedRows: [
        POSTED_COMPLETED,
        { id: 'inv-9', documentNo: 'FV-009', documentStatus: 'CO', posted: 'N' },
      ],
    });

    // ETP-5316 QA rejection — a multi-record run shows ONLY the generic count summary.
    // The per-failed-row detail is never passed as a toast `description`: it does not
    // scale past a handful of rows and the raw messages are not locatable from a toast.
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('1 ok, 1 failed'));
    // The unpost was attempted only for the posted row…
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    expect(mockNeoExecute).toHaveBeenCalledWith('inv-1', 'unpost');
    // …and the document action ran only for the row that never needed one.
    expect(mockDocExecute).toHaveBeenCalledTimes(1);
    expect(mockDocExecute).toHaveBeenCalledWith('inv-9', 'RE');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // The pre-unpost always goes through useNeoAction's generic /action/{name} endpoint,
  // even when the document action itself rides the DocAction endpoint (the invoice
  // windows' default `actionMode`). Both executors are involved in one row's run.
  it('routes the unpost through useNeoAction while the document action keeps the DocAction path', async () => {
    const { refresh } = run();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockUseNeoAction).toHaveBeenCalled();
    expect(mockNeoExecute).toHaveBeenCalledWith('inv-1', 'unpost');
    expect(mockDocExecute).toHaveBeenCalledWith('inv-1', 'RE');
  });

  // A row pre-blocked by `rowFilter` is never attempted at all — not even its unpost.
  it('does not unpost a row that rowFilter already omitted', async () => {
    const { refresh } = run({ rowFilter: () => 'cannotReactivateLinkedDocs' });

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('0 ok, 1 omitted, 0 failed'));
    expect(mockNeoExecute).not.toHaveBeenCalled();
    expect(mockDocExecute).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

// ETP-5316 — `handleDone` writes `failed[]` to sessionStorage and reloads the page;
// useBulkActionToast then replays it after the reload and renders the single-failure toast.
// The AD_MESSAGE keys therefore have to (a) be captured off the rejection in BOTH executor
// modes and (b) survive JSON.stringify → sessionStorage → JSON.parse as plain strings. If
// either half breaks, the toast silently falls back to core's own sentence — the exact
// line-number-citing text this ticket removed — with nothing failing anywhere.
describe('BulkDocumentAction — messageKeys reach the persisted failure (ETP-5316)', () => {
  const STORAGE_KEY = 'bulkActionResult';
  const CORE_SENTENCE = 'En la línea 10, 20, 30, 40, Cuando el producto no esta vacío entonces '
    + 'la cantidad movida no debe ser cero.';
  const KEYS = ['Inline', 'ProductNotNullAndMovementQtyZero'];
  const buildPost = () => [{ value: 'post', labelKey: 'post' }];

  function docActionError(message, messageKeys) {
    const err = new Error(message);
    err.messageKeys = messageKeys;
    return err;
  }

  function readStored() {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNeoAction.mockReturnValue({ execute: mockNeoExecute, loading: false });
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  it('documentAction mode: carries err.messageKeys into failed[i].messageKeys', async () => {
    mockDocExecute.mockRejectedValueOnce(docActionError(CORE_SENTENCE, KEYS));
    render(
      <BulkDocumentAction
        selectedRows={[{ id: 'row-dk1', documentNo: 'ALB-01', documentStatus: 'DR' }]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = readStored();

    expect(ok).toBe(0);
    expect(failed).toEqual([
      { documentNo: 'ALB-01', message: CORE_SENTENCE, messageKeys: KEYS },
    ]);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  // The neoAction adapter resolves `{ success: false }` and re-throws it as an Error; before
  // ETP-5316 that normalisation was the one place the keys were dropped.
  it('neoAction mode: the resolve→throw adapter does not lose the keys', async () => {
    mockNeoExecute.mockResolvedValueOnce({
      success: false, message: CORE_SENTENCE, messageKeys: KEYS,
    });
    render(
      <BulkDocumentAction
        selectedRows={[{ id: 'row-nk1', documentNo: 'ALB-02' }]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="goods-shipment"
        actionMode="neoAction"
        buildActions={buildPost}
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { ok, failed } = readStored();

    expect(ok).toBe(0);
    expect(failed).toEqual([
      { documentNo: 'ALB-02', message: CORE_SENTENCE, messageKeys: KEYS },
    ]);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('keeps per-row keys distinct across a multi-row failure', async () => {
    mockDocExecute
      .mockRejectedValueOnce(docActionError('no qty', ['ProductNotNullAndMovementQtyZero']))
      .mockRejectedValueOnce(docActionError('locked', ['lockedProduct']));
    render(
      <BulkDocumentAction
        selectedRows={[
          { id: 'row-dk2', documentNo: 'ALB-03', documentStatus: 'DR' },
          { id: 'row-dk3', documentNo: 'ALB-04', documentStatus: 'DR' },
        ]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { failed } = readStored();

    expect(failed).toEqual([
      { documentNo: 'ALB-03', message: 'no qty', messageKeys: ['ProductNotNullAndMovementQtyZero'] },
      { documentNo: 'ALB-04', message: 'locked', messageKeys: ['lockedProduct'] },
    ]);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  // Against a backend that sends no keys, `undefined` drops out of JSON.stringify by itself,
  // leaving the pre-ETP-5316 `{ documentNo, message }` shape byte-for-byte.
  it('a keyless rejection persists exactly the pre-ETP-5316 shape (no messageKeys property)', async () => {
    mockDocExecute.mockRejectedValueOnce(new Error('Document already completed'));
    render(
      <BulkDocumentAction
        selectedRows={[{ id: 'row-dk4', documentNo: 'ALB-05', documentStatus: 'DR' }]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );

    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const { failed } = readStored();

    expect(failed).toHaveLength(1);
    expect(Object.keys(failed[0]).sort()).toEqual(['documentNo', 'message']);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });
});