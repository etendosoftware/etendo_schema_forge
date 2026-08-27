// Vitest component tests for ActividadesIaeSection — the "Actividades del IAE"
// editable grid in the Organization window (ETP-4975).
//
// CreatableSearchSelect is stubbed as a plain button (same pattern already used for
// SelectorInput in AmortizationLinesTable.vitest.jsx) so these tests exercise the
// section's own wiring (create/update/delete/single-default) against a mocked
// fetch, not the selector's internal dropdown/search behavior (covered separately
// in CreatableSearchSelect's own test suite).

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// useActividadesIae's useApiFetch(neoBase(apiBaseUrl) + '/organization') needs no
// AuthProvider — it just needs to delegate to global.fetch (same helper the sibling
// useOrganizationData.vitest.js hook test uses).
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// Checkbox/AddLineButton re-export from @etendosoftware/app-shell-core, which is
// not resolvable in this test environment — mocked as plain native elements
// preserving the props ActividadesIaeSection actually relies on (same pattern as
// AmortizationLinesTable.vitest.jsx).
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, disabled, onChange, 'aria-label': ariaLabel, 'data-testid': testId }) => (
    <button
      type="button"
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={Boolean(checked)}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
      data-testid={testId}
    />
  ),
}));

vi.mock('@/components/ui/add-line-button', () => ({
  AddLineButton: ({ onClick, label, 'data-testid': testId }) => (
    <button type="button" data-testid={testId} onClick={onClick}>{label}</button>
  ),
}));

// Passthrough mock — Radix tooltip content only mounts on hover/focus, which these
// tests don't simulate; rendering children unconditionally lets a plain presence
// assertion on the wrapped icon stand in for "the warning is shown" (mirrors
// MovementRowKebab.vitest.jsx's identical mock).
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
}));

// Stubbed as a plain button per field — clicking it always "selects" a
// deterministic new id/label so tests can assert the resulting onChange/PATCH
// payload without depending on the selector's own dropdown/fetch behavior.
vi.mock('@/components/contract-ui/CreatableSearchSelect', () => ({
  CreatableSearchSelect: ({ field, value, displayValue, onChange }) => (
    <button
      type="button"
      data-testid={`selector-${field.key}`}
      onClick={() => onChange(`${field.key}-new-id`, `${field.key}-new-label`)}
    >
      {displayValue || value || 'empty'}
    </button>
  ),
}));

import ActividadesIaeSection from '../ActividadesIaeSection.jsx';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';
const baseProps = { token: 'tok', apiBaseUrl: API_BASE_URL, orgId: ORG_ID };

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body });
}

// Generic fetch stub: GET always returns the given (fixed) rows snapshot; POST/PATCH/
// DELETE resolve with a sane default unless overridden — sufficient because these
// tests assert on the CALL SHAPE (method/url/body), not on the DOM after a refetch.
function makeFetchMock({ rows, patchImpl, postImpl, deleteImpl } = {}) {
  return vi.fn((url, opts = {}) => {
    const method = opts.method || 'GET';
    if (method === 'GET') return jsonResponse({ response: { data: rows } });
    if (method === 'PATCH') return patchImpl ? patchImpl(url, opts) : jsonResponse({ response: { data: [{}] } });
    if (method === 'POST') return postImpl ? postImpl(url, opts) : jsonResponse({ response: { data: [{ id: 'row-new' }] } });
    if (method === 'DELETE') return deleteImpl ? deleteImpl(url, opts) : jsonResponse({});
    return jsonResponse({});
  });
}

function methodCalls(fetchMock, method) {
  return fetchMock.mock.calls.filter(([, opts]) => (opts?.method || 'GET') === method);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render existing rows
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — renders existing rows', () => {
  it('renders one row per fetched record, with resolved selector labels and default checkbox state', async () => {
    const rows = [
      { id: 'row-1', default: true, epiaeCode: 'C1', epgrafeIAE: 'e1', 'epgrafeIAE$_identifier': 'Epigraph 1' },
      { id: 'row-2', default: false, epiaeCode: null, epgrafeIAE: 'e2', 'epgrafeIAE$_identifier': 'Epigraph 2' },
    ];
    global.fetch = makeFetchMock({ rows });
    render(<ActividadesIaeSection {...baseProps} />);

    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');
    const row2 = screen.getByTestId('ActividadesIaeSection__row-row-2');

    expect(within(row1).getByTestId('selector-epgrafeIAE')).toHaveTextContent('Epigraph 1');
    expect(within(row2).getByTestId('selector-epgrafeIAE')).toHaveTextContent('Epigraph 2');
    expect(within(row1).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect(within(row2).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  });

  it('fetches rows scoped to the given orgId via parentId', async () => {
    const fetchMock = makeFetchMock({ rows: [] });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain(`parentId=${ORG_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Loading / error / empty states
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — loading/error/empty states', () => {
  it('shows a loading spinner before the initial fetch resolves', async () => {
    let resolveFetch;
    global.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    render(<ActividadesIaeSection {...baseProps} />);

    expect(screen.getByTestId('Loader2__iaeLoading')).toBeInTheDocument();
    resolveFetch(await jsonResponse({ response: { data: [] } }));
    await waitFor(() => expect(screen.queryByTestId('Loader2__iaeLoading')).not.toBeInTheDocument());
  });

  it('shows the empty state when there are no rows', async () => {
    global.fetch = makeFetchMock({ rows: [] });
    render(<ActividadesIaeSection {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('ActividadesIaeSection__empty')).toBeInTheDocument());
  });

  it('shows an error banner with a retry action when the initial load fails, and retry re-fetches successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('ActividadesIaeSection__error')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(await jsonResponse({ response: { data: [] } }));
    fireEvent.click(screen.getByTestId('ActividadesIaeSection__retry'));
    await waitFor(() => expect(screen.getByTestId('ActividadesIaeSection__empty')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Alta de fila nueva (create)
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — add row', () => {
  it('opens a draft row, fills a selector, and Save (✓) POSTs the new row scoped to the org', async () => {
    const fetchMock = makeFetchMock({ rows: [] });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('ActividadesIaeSection__empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ActividadesIaeSection__addButton'));
    const addRow = await screen.findByTestId('ActividadesIaeSection__addRow');

    fireEvent.click(within(addRow).getByTestId('selector-epgrafeIAE'));

    fetchMock.mockClear();
    fireEvent.click(within(addRow).getByTestId('ActividadesIaeSection__saveNew'));

    await waitFor(() => expect(methodCalls(fetchMock, 'POST')).toHaveLength(1));
    const [postUrl, postOpts] = methodCalls(fetchMock, 'POST')[0];
    expect(postUrl).toContain('/actividadesDelIae');
    expect(JSON.parse(postOpts.body)).toEqual({
      epgrafeIAE: 'epgrafeIAE-new-id', epiaeType: null, epiaeCode: null, default: false, parentId: ORG_ID,
    });
    // No single-default sweep for a non-default new row.
    expect(methodCalls(fetchMock, 'PATCH')).toHaveLength(0);
    // Draft row closes and the section refetches.
    await waitFor(() => expect(screen.queryByTestId('ActividadesIaeSection__addRow')).not.toBeInTheDocument());
  });

  it('Cancel (✗) discards the draft row without posting anything', async () => {
    const fetchMock = makeFetchMock({ rows: [] });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('ActividadesIaeSection__empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ActividadesIaeSection__addButton'));
    const addRow = await screen.findByTestId('ActividadesIaeSection__addRow');

    fetchMock.mockClear();
    fireEvent.click(within(addRow).getByTestId('ActividadesIaeSection__cancelNew'));

    expect(screen.queryByTestId('ActividadesIaeSection__addRow')).not.toBeInTheDocument();
    expect(methodCalls(fetchMock, 'POST')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edición de un selector de fila existente
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — edit an existing row selector', () => {
  it('picking a new selector value PATCHes just that field and refetches', async () => {
    const rows = [{ id: 'row-1', default: false, epgrafeIAE: 'old-id', 'epgrafeIAE$_identifier': 'Old label' }];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');

    fetchMock.mockClear();
    fireEvent.click(within(row1).getByTestId('selector-epgrafeIAE'));

    await waitFor(() => expect(methodCalls(fetchMock, 'PATCH')).toHaveLength(1));
    const [patchUrl, patchOpts] = methodCalls(fetchMock, 'PATCH')[0];
    expect(patchUrl).toContain('/actividadesDelIae/row-1');
    expect(JSON.parse(patchOpts.body)).toEqual({ epgrafeIAE: 'epgrafeIAE-new-id' });

    await waitFor(() => expect(methodCalls(fetchMock, 'GET')).toHaveLength(1)); // refetch after the mockClear()
  });

  it('shows an error toast (without crashing) when the PATCH fails', async () => {
    const rows = [{ id: 'row-1', default: false }];
    const fetchMock = makeFetchMock({ rows, patchImpl: () => Promise.resolve({ ok: false, status: 500 }) });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');

    fireEvent.click(within(row1).getByTestId('selector-epgrafeIAE'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// Borrado de fila
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — delete row', () => {
  it('clicking the trash icon DELETEs the row and refetches', async () => {
    const rows = [{ id: 'row-1', default: false }];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');

    fetchMock.mockClear();
    fireEvent.click(within(row1).getByTestId('ActividadesIaeSection__delete'));

    await waitFor(() => expect(methodCalls(fetchMock, 'DELETE')).toHaveLength(1));
    expect(methodCalls(fetchMock, 'DELETE')[0][0]).toContain('/actividadesDelIae/row-1');
    await waitFor(() => expect(methodCalls(fetchMock, 'GET')).toHaveLength(1));
  });
});

// ---------------------------------------------------------------------------
// Single-default rule (the most important case — see useActividadesIae.js docstring)
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — single-default rule persists via real PATCH', () => {
  it('turning a row default ON PATCHes it true AND PATCHes every other default row false', async () => {
    const rows = [
      { id: 'row-1', default: true, epiaeCode: 'C1' },
      { id: 'row-2', default: false, epiaeCode: 'C2' },
    ];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await screen.findByTestId('ActividadesIaeSection__row-row-2');

    const row2 = screen.getByTestId('ActividadesIaeSection__row-row-2');
    fetchMock.mockClear();
    fireEvent.click(within(row2).getByRole('checkbox'));

    await waitFor(() => expect(methodCalls(fetchMock, 'PATCH')).toHaveLength(2));
    const patches = methodCalls(fetchMock, 'PATCH');
    const row2Patch = patches.find(([url]) => url.includes('/actividadesDelIae/row-2'));
    const row1Patch = patches.find(([url]) => url.includes('/actividadesDelIae/row-1'));
    expect(JSON.parse(row2Patch[1].body)).toEqual({ default: true });
    expect(JSON.parse(row1Patch[1].body)).toEqual({ default: false });
  });

  it('turning a default row OFF only PATCHes itself — no sweep against siblings', async () => {
    const rows = [
      { id: 'row-1', default: true, epiaeCode: 'C1' },
      { id: 'row-2', default: false, epiaeCode: 'C2' },
    ];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');

    fetchMock.mockClear();
    fireEvent.click(within(row1).getByRole('checkbox'));

    await waitFor(() => expect(methodCalls(fetchMock, 'PATCH')).toHaveLength(1));
    const [patchUrl, patchOpts] = methodCalls(fetchMock, 'PATCH')[0];
    expect(patchUrl).toContain('/actividadesDelIae/row-1');
    expect(JSON.parse(patchOpts.body)).toEqual({ default: false });
  });

  it('creating a new row with default checked also sweeps existing default rows to false', async () => {
    const rows = [{ id: 'row-1', default: true, epiaeCode: 'C1' }];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    await screen.findByTestId('ActividadesIaeSection__row-row-1');

    fireEvent.click(screen.getByTestId('ActividadesIaeSection__addButton'));
    const addRow = await screen.findByTestId('ActividadesIaeSection__addRow');
    fireEvent.click(within(addRow).getByRole('checkbox'));

    fetchMock.mockClear();
    fireEvent.click(within(addRow).getByTestId('ActividadesIaeSection__saveNew'));

    await waitFor(() => expect(methodCalls(fetchMock, 'POST')).toHaveLength(1));
    expect(JSON.parse(methodCalls(fetchMock, 'POST')[0][1].body)).toEqual({
      epgrafeIAE: null, epiaeType: null, epiaeCode: null, default: true, parentId: ORG_ID,
    });

    await waitFor(() => expect(methodCalls(fetchMock, 'PATCH')).toHaveLength(1));
    const [patchUrl, patchOpts] = methodCalls(fetchMock, 'PATCH')[0];
    expect(patchUrl).toContain('/actividadesDelIae/row-1');
    expect(JSON.parse(patchOpts.body)).toEqual({ default: false });
  });

  // QA (ETP-4975) — race condition NOT covered by the developer's suite: two default
  // checkboxes toggled ON in quick succession, before either PATCH round-trip (and the
  // refetch() that follows it) has resolved. Both handleDefaultToggle calls close over the
  // SAME render's `rows` snapshot from useActividadesIae — which only advances via
  // refetch()'s setState, not via updateRow() itself — so enforceSingleDefault(row) for EACH
  // click filters that same stale snapshot (both rows still `default:false` in it) and finds
  // no sibling to sweep. Result: BOTH rows persist server-side as default:true, silently
  // violating the single-default invariant the whole enforceSingleDefault mechanism exists to
  // guarantee (see useActividadesIae.js's docstring) — with no client or server signal that
  // anything went wrong. This matters concretely for this window: FmModel303Page/AeatSubmitFlow
  // trust "there is at most one default IAE row" when picking which row's epiaeCode to read for
  // the AEAT 303 filing (isMissingDefaultIaeActivity only checks "at least one", never "at most
  // one"), so two true rows leaves which one "wins" purely up to array order / DB read order.
  it('BUG: two default-ON toggles fired back-to-back (before either round-trip settles) both persist as default:true — enforceSingleDefault never sees the other in-flight row', async () => {
    const rows = [
      { id: 'row-1', default: false, epiaeCode: 'C1' },
      { id: 'row-2', default: false, epiaeCode: 'C2' },
    ];
    const fetchMock = makeFetchMock({ rows });
    global.fetch = fetchMock;
    render(<ActividadesIaeSection {...baseProps} />);
    const row1 = await screen.findByTestId('ActividadesIaeSection__row-row-1');
    const row2 = screen.getByTestId('ActividadesIaeSection__row-row-2');

    fetchMock.mockClear();
    // Both clicks fire before either awaited PATCH resolves — mirrors a user double-clicking
    // two rows' checkboxes quickly, which the UI does nothing to prevent (only the CLICKED
    // row's own checkbox is disabled while saving; every other row's stays clickable).
    fireEvent.click(within(row1).getByRole('checkbox'));
    fireEvent.click(within(row2).getByRole('checkbox'));

    await waitFor(() => expect(methodCalls(fetchMock, 'PATCH').length).toBeGreaterThanOrEqual(2));
    // Let any further queued microtasks (enforceSingleDefault sweeps, refetches) settle.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const patches = methodCalls(fetchMock, 'PATCH');
    const row1SetTrue = patches.some(([url, opts]) => url.includes('/row-1') && JSON.parse(opts.body).default === true);
    const row2SetTrue = patches.some(([url, opts]) => url.includes('/row-2') && JSON.parse(opts.body).default === true);
    const anyoneSetFalse = patches.some(([, opts]) => JSON.parse(opts.body).default === false);

    expect(row1SetTrue).toBe(true);
    expect(row2SetTrue).toBe(true);
    // EXPECTED (correct single-default behavior): once both rows are default:true, the sweep
    // must eventually PATCH one of them back to false. FAILS today — no `default:false` PATCH
    // is ever issued because enforceSingleDefault only reads the stale pre-click `rows` closure.
    expect(anyoneSetFalse).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing-code warning (only meaningful on the default row)
// ---------------------------------------------------------------------------

describe('ActividadesIaeSection — missing-code warning on the default row', () => {
  it('shows the warning icon when the default row has no epiaeCode', async () => {
    const rows = [{ id: 'row-1', default: true, epiaeCode: null }];
    global.fetch = makeFetchMock({ rows });
    render(<ActividadesIaeSection {...baseProps} />);
    await screen.findByTestId('ActividadesIaeSection__row-row-1');
    expect(screen.getByTestId('TriangleAlert__iaeMissingCode')).toBeInTheDocument();
  });

  it('hides the warning when the default row has an epiaeCode', async () => {
    const rows = [{ id: 'row-1', default: true, epiaeCode: 'C1' }];
    global.fetch = makeFetchMock({ rows });
    render(<ActividadesIaeSection {...baseProps} />);
    await screen.findByTestId('ActividadesIaeSection__row-row-1');
    expect(screen.queryByTestId('TriangleAlert__iaeMissingCode')).not.toBeInTheDocument();
  });

  it('hides the warning on a non-default row even without an epiaeCode', async () => {
    const rows = [{ id: 'row-1', default: false, epiaeCode: null }];
    global.fetch = makeFetchMock({ rows });
    render(<ActividadesIaeSection {...baseProps} />);
    await screen.findByTestId('ActividadesIaeSection__row-row-1');
    expect(screen.queryByTestId('TriangleAlert__iaeMissingCode')).not.toBeInTheDocument();
  });
});
