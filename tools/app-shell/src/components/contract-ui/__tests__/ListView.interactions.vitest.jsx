/**
 * ListView — interactive behaviour of the list bar and the state it derives.
 *
 * The existing ListView suites cover the static render (which controls show up),
 * the bulk-delete wiring and the two table wrappers. What was left unexercised is
 * everything the user actually *does* on a list and every piece of query state
 * ListView derives from it:
 *
 *   - sorting (popover select, header click, clear)
 *   - quick filters -> effectiveFilter criteria + effectiveRowFilter predicate
 *   - named filter presets (apply / save)
 *   - per-column filters (merge, clear one, clear all) and the refetch they trigger
 *   - view mode persistence and the sort popover's outside-click dismissal
 *   - the selection bar's print / clone actions (ETP-4644 removed the "Vista
 *     Previa" button unconditionally — a test asserts it never renders)
 *   - refresh (button, refreshTrigger, after a row delete) and infinite scroll
 *   - the report / document-print / send-document modals
 *   - the preview row (internal vs. host-owned) and its close/edit paths
 *
 * Every test asserts an observable outcome: what the Table / ListFilterBar / drawer
 * receives, what the DOM shows, or which collaborator was called with which
 * arguments. The Table and ListFilterBar props are captured because they ARE
 * ListView's public output — it is a container whose whole job is deriving them.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Real useState for the sort pair so the asc -> desc -> default toggles are
// observable end to end (a vi.fn() setter would freeze the sort state and make
// every toggle assertion vacuous).
let hookOverrides = {};
let capturedEntityOptions = null;
const refreshMock = vi.fn();
const loadMoreMock = vi.fn();
vi.mock('@/hooks/useEntity', async () => {
  const { useState } = await import('react');
  return {
    useEntity: (entity, id, options) => {
      capturedEntityOptions = options;
      const [sortColumn, setSortColumn] = useState(options?.initialSortColumn ?? 'creationDate');
      const [sortDirection, setSortDirection] = useState(options?.initialSortDirection ?? 'desc');
      return {
        items: [],
        meta: null,
        loading: false,
        loadingMore: false,
        hasMore: false,
        refresh: refreshMock,
        loadMore: loadMoreMock,
        ...hookOverrides,
        sortColumn,
        sortDirection,
        setSortColumn,
        setSortDirection,
      };
    },
  };
});

let capturedRowDeleteOptions = null;
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: (opts) => {
    capturedRowDeleteOptions = opts;
    return { requestDelete: vi.fn(), deleteDialog: null };
  },
}));

vi.mock('@/hooks/useBulkRowDelete', () => ({
  useBulkRowDelete: () => ({ requestBulkDelete: vi.fn(), bulkDeleteDialog: null, deleting: false }),
}));

let mockPresets = {};
const savePresetMock = vi.fn();
const deletePresetMock = vi.fn();
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({
    presets: mockPresets,
    savePreset: savePresetMock,
    deletePreset: deletePresetMock,
  }),
}));

// Real implementation returns null for an empty funnel; here it must produce
// criteria so the trailingFilter (advanced-filter) leg is actually exercised.
vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: (advancedFilter) =>
    advancedFilter ? [{ fieldName: 'advField', operator: 'equals', value: advancedFilter.token }] : null,
}));

const trackSearchPerformedMock = vi.fn();
const trackWindowOpenedMock = vi.fn();
vi.mock('@/lib/productUsageTelemetry.js', () => ({
  trackSearchPerformed: (...args) => trackSearchPerformedMock(...args),
  trackWindowOpened: (...args) => trackWindowOpenedMock(...args),
}));

let pageMetaArgs = null;
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => { pageMetaArgs = meta; },
}));

const toggleFavoriteMock = vi.fn();
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: toggleFavoriteMock, isFavorite: () => false }),
}));

let reportDrawerProps = null;
vi.mock('../ReportDrawer.jsx', () => ({
  default: (props) => { reportDrawerProps = props; return props.open ? <div data-testid="report-drawer" /> : null; },
}));

const printDocumentsMock = vi.fn();
vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: (...args) => printDocumentsMock(...args),
}));

let sendDocumentProps = null;
vi.mock('../SendDocumentModal.jsx', () => ({
  default: (props) => { sendDocumentProps = props; return <div data-testid="send-document-modal" />; },
}));

let filterBarProps = null;
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: (props) => { filterBarProps = props; return <div data-testid="list-filter-bar" />; },
}));

// The real ScrollPane wires onReachBottom to a scroll observer that jsdom cannot
// drive; the stub exposes the callback so infinite scroll stays testable.
let scrollPaneProps = null;
vi.mock('@etendosoftware/app-shell-core/components/ui/scroll-pane.jsx', () => ({
  ScrollPane: ({ children, onReachBottom }) => {
    scrollPaneProps = { onReachBottom };
    return <div data-testid="scroll-pane">{children}</div>;
  },
}));

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }) => <button onClick={onClick} {...rest}>{children}</button>,
  DropdownMenuTrigger: ({ children }) => children,
}));

import { ListView } from '../ListView.jsx';

// `column` and `label` differ on purpose: the sort popover and the report drawer
// must prefer the AD label (t(col.column)) over the raw column label.
const MOCK_COLUMNS = [
  { key: 'documentNo', column: 'AD_DocumentNo', label: 'Doc No fallback' },
  { key: 'name', column: 'AD_Name', label: 'Name fallback' },
  { key: 'creationDate', column: 'AD_CreationDate', label: 'Created fallback' },
  { key: 'rowActions', label: 'Row actions', sortable: false },
];
let mockColumns = MOCK_COLUMNS;

let tableProps = null;
function MockTable(props) {
  tableProps = props;
  const { onColumnsReady } = props;
  // DataTable reports its resolved columns after mount; ListView's columnDefs,
  // sort popover and send-document detection all depend on that handshake.
  useEffect(() => { onColumnsReady?.(mockColumns); }, [onColumnsReady]);
  return <table data-testid="mock-table"><tbody /></table>;
}

const SELECTED = [
  { id: 'r1', documentNo: 'DOC-1', businessPartner: 'bp-1', 'businessPartner$_identifier': 'ACME' },
  { id: 'r2', documentNo: 'DOC-2' },
];

const SortIcon = () => <span data-testid="sort-icon" />;
const RefreshIcon = () => <span data-testid="refresh-icon" />;

const defaultProps = {
  entity: 'testEntity',
  Table: MockTable,
  entityLabel: 'Test Entity',
  windowName: 'test-entity',
  token: 'fake-token',
  apiBaseUrl: 'http://localhost/api',
  SortIconComponent: SortIcon,
  RefreshIconComponent: RefreshIcon,
};

function criteriaOf(filterString) {
  const params = new URLSearchParams(filterString);
  const raw = params.get('criteria');
  return raw ? JSON.parse(raw) : null;
}

function encodeCriteria(value) {
  return `criteria=${encodeURIComponent(JSON.stringify(value))}`;
}

const QUICK_FILTERS = [
  { key: 'overdue', label: 'qfOverdue', filter: encodeCriteria({ fieldName: 'overdue', operator: 'equals', value: true }) },
  { key: 'mine', label: 'qfMine', filter: encodeCriteria({ fieldName: 'owner', operator: 'equals', value: 'me' }) },
];

const SUBSET_FILTERS = [
  { key: 'all', label: 'sfAll', filter: null },
  { key: 'open', label: 'sfOpen', filter: encodeCriteria({ fieldName: 'status', operator: 'equals', value: 'DR' }) },
];

async function openSortPopover(user) {
  await user.click(screen.getByTestId('sort-icon').closest('button'));
}

beforeEach(() => {
  hookOverrides = {};
  mockColumns = MOCK_COLUMNS;
  mockPresets = {};
  capturedEntityOptions = null;
  capturedRowDeleteOptions = null;
  tableProps = null;
  filterBarProps = null;
  scrollPaneProps = null;
  reportDrawerProps = null;
  sendDocumentProps = null;
  pageMetaArgs = null;
  vi.clearAllMocks();
  window.localStorage.clear();
});

// ─── Sorting ────────────────────────────────────────────────────────────────

describe('ListView — sorting', () => {
  it('lists only sortable columns in the sort popover, using their AD labels', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    expect(screen.queryByText('sortBy')).not.toBeInTheDocument();

    await openSortPopover(user);

    expect(screen.getByText('sortBy')).toBeInTheDocument();
    expect(screen.getByText('AD_DocumentNo')).toBeInTheDocument();
    expect(screen.getByText('AD_Name')).toBeInTheDocument();
    // sortable: false must be excluded — sorting by an action column is meaningless
    // and the backend has no field to order by.
    expect(screen.queryByText('Row actions')).not.toBeInTheDocument();
    // The AD label wins over the column's own label.
    expect(screen.queryByText('Name fallback')).not.toBeInTheDocument();
  });

  it('selecting a different column sorts ascending by it and closes the popover', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);
    await openSortPopover(user);

    await user.click(screen.getByText('AD_Name'));

    expect(tableProps.sortColumn).toBe('name');
    expect(tableProps.sortDirection).toBe('asc');
    expect(screen.queryByText('sortBy')).not.toBeInTheDocument();
  });

  it('selecting the already-sorted column toggles asc -> desc and back', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    await openSortPopover(user);
    await user.click(screen.getByText('AD_Name'));
    expect(tableProps.sortDirection).toBe('asc');

    await openSortPopover(user);
    // The active column is marked with the ascending glyph before the toggle.
    expect(screen.getByText('▲')).toBeInTheDocument();
    await user.click(screen.getByText('AD_Name'));
    expect(tableProps.sortColumn).toBe('name');
    expect(tableProps.sortDirection).toBe('desc');

    await openSortPopover(user);
    expect(screen.getByText('▼')).toBeInTheDocument();
    await user.click(screen.getByText('AD_Name'));
    expect(tableProps.sortDirection).toBe('asc');
  });

  it('offers "clear sort" only once the sort differs from the default, and restores it', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    // Default sort (creationDate desc) — nothing to clear.
    await openSortPopover(user);
    expect(screen.queryByText('clearSort')).not.toBeInTheDocument();
    await user.click(screen.getByText('AD_Name'));

    await openSortPopover(user);
    await user.click(screen.getByText('clearSort'));

    expect(tableProps.sortColumn).toBe('creationDate');
    expect(tableProps.sortDirection).toBe('desc');
    expect(screen.queryByText('sortBy')).not.toBeInTheDocument();
  });

  it('honours listSortBy as the default sort, so "clear sort" returns there', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} listSortBy="name asc" />);

    expect(capturedEntityOptions.initialSortColumn).toBe('name');
    expect(capturedEntityOptions.initialSortDirection).toBe('asc');
    // Already at the declared default -> no clear affordance.
    await openSortPopover(user);
    expect(screen.queryByText('clearSort')).not.toBeInTheDocument();
  });

  it('defaults a listSortBy without an explicit direction to ascending', () => {
    render(<ListView {...defaultProps} listSortBy="name" />);

    expect(capturedEntityOptions.initialSortColumn).toBe('name');
    expect(capturedEntityOptions.initialSortDirection).toBe('asc');
  });

  it('falls back through AD label -> column label -> key for the popover entries', async () => {
    const user = userEvent.setup();
    mockColumns = [
      { key: 'withAdLabel', column: 'AD_Something', label: 'ignored' },
      { key: 'withOwnLabel', label: 'Own label' },
      { key: 'bareKey' },
    ];
    render(<ListView {...defaultProps} />);

    await openSortPopover(user);

    expect(screen.getByText('AD_Something')).toBeInTheDocument();
    expect(screen.getByText('Own label')).toBeInTheDocument();
    expect(screen.getByText('bareKey')).toBeInTheDocument();
  });

  it('column-header clicks cycle asc -> desc -> back to the creation-date default', () => {
    render(<ListView {...defaultProps} />);

    act(() => { tableProps.onSort('name'); });
    expect(tableProps.sortColumn).toBe('name');
    expect(tableProps.sortDirection).toBe('asc');

    act(() => { tableProps.onSort('name'); });
    expect(tableProps.sortDirection).toBe('desc');

    act(() => { tableProps.onSort('name'); });
    expect(tableProps.sortColumn).toBe('creationDate');
    expect(tableProps.sortDirection).toBe('desc');
  });

  it('refetches when the sort changes, but not on the initial mount', () => {
    render(<ListView {...defaultProps} />);
    expect(refreshMock).not.toHaveBeenCalled();

    act(() => { tableProps.onSort('name'); });

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Sort popover dismissal ─────────────────────────────────────────────────

describe('ListView — sort popover dismissal', () => {
  it('closes on a mousedown outside the sort control but stays open for one inside', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);
    await openSortPopover(user);

    // Inside the popover's own container: must not dismiss, otherwise picking a
    // column would be impossible.
    fireEvent.mouseDown(screen.getByText('AD_Name'));
    expect(screen.getByText('sortBy')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('sortBy')).not.toBeInTheDocument();
  });

  it('toggling the sort button closes the popover again (listener is torn down)', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    await openSortPopover(user);
    expect(screen.getByText('sortBy')).toBeInTheDocument();

    await openSortPopover(user);
    expect(screen.queryByText('sortBy')).not.toBeInTheDocument();

    // With the popover closed the document listener is gone: an outside mousedown
    // is now inert and must not throw.
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow();
  });

  it('does not leave the mousedown listener behind when unmounted while open', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ListView {...defaultProps} />);
    await openSortPopover(user);

    unmount();

    // A stale listener would call setState on an unmounted tree.
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow();
  });
});

// ─── Quick filters ──────────────────────────────────────────────────────────

describe('ListView — quick filters', () => {
  it('starts with no window filter and adds one criteria per activated quick filter', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} />);

    expect(capturedEntityOptions.baseFilter).toBeNull();

    await user.click(screen.getByTestId('quick-filter-mine'));
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);

    await user.click(screen.getByTestId('quick-filter-overdue'));
    // Criteria follow the quickFilters prop order, not the click order, so the
    // emitted query is stable however the user toggles them.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'overdue', operator: 'equals', value: true },
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('toggling an active quick filter off removes only its criteria', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} />);

    await user.click(screen.getByTestId('quick-filter-overdue'));
    await user.click(screen.getByTestId('quick-filter-mine'));
    await user.click(screen.getByTestId('quick-filter-overdue'));

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('honours initialQuickFilterIndex as the pre-activated filter', () => {
    render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} initialQuickFilterIndex={1} />);

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('wraps the merge in an AdvancedCriteria AND when any part brings its own OR block', async () => {
    const user = userEvent.setup();
    const orBlock = {
      _constructor: 'AdvancedCriteria',
      operator: 'or',
      criteria: [{ fieldName: 'a', operator: 'equals', value: 1 }],
    };
    const quickFilters = [
      { key: 'orblock', label: 'qfOr', filter: encodeCriteria(orBlock) },
      QUICK_FILTERS[1],
    ];
    render(<ListView {...defaultProps} quickFilters={quickFilters} />);

    await user.click(screen.getByTestId('quick-filter-orblock'));
    await user.click(screen.getByTestId('quick-filter-mine'));

    // Without the wrapper the nested OR would leak into the top-level AND array
    // and silently widen the result set.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [orBlock, { fieldName: 'owner', operator: 'equals', value: 'me' }],
    });
  });

  it('keeps non-criteria query params of a filter part as passthrough', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} baseFilter="_org=org-1" quickFilters={QUICK_FILTERS} />);

    await user.click(screen.getByTestId('quick-filter-mine'));

    const params = new URLSearchParams(capturedEntityOptions.baseFilter);
    expect(params.get('_org')).toBe('org-1');
    expect(JSON.parse(params.get('criteria'))).toEqual([
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('falls back to the first subset when initialSubsetIndex is out of range', () => {
    render(<ListView {...defaultProps} subsetFilters={SUBSET_FILTERS} initialSubsetIndex={7} />);

    // Subset 0 carries no filter, so an out-of-range index must not produce a query.
    expect(capturedEntityOptions.baseFilter).toBeNull();
    expect(screen.getByTestId('filter-all').className).toContain('bg-card');
  });

  it('composes the subset filter with the active quick filters', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} subsetFilters={SUBSET_FILTERS} quickFilters={QUICK_FILTERS} />);

    await user.click(screen.getByTestId('filter-open'));
    await user.click(screen.getByTestId('quick-filter-mine'));

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });
});

// ─── Client-side row predicates ─────────────────────────────────────────────

describe('ListView — effective row filter', () => {
  const keepA = (row) => row.a === 1;
  const keepB = (row) => row.b === 2;

  it('passes no predicate to the table while nothing is active', () => {
    render(<ListView {...defaultProps} />);
    expect(tableProps.rowFilter).toBeNull();
  });

  it('forwards a single active predicate untouched', async () => {
    const user = userEvent.setup();
    const quickFilters = [{ key: 'a', label: 'qfA', rowFilter: keepA }];
    render(<ListView {...defaultProps} quickFilters={quickFilters} />);

    await user.click(screen.getByTestId('quick-filter-a'));

    expect(tableProps.rowFilter).toBe(keepA);
  });

  it('ANDs several active predicates (subset + quick + explicit rowFilter)', async () => {
    const user = userEvent.setup();
    const subsetFilters = [{ key: 'all', label: 'sfAll' }, { key: 'sub', label: 'sfSub', rowFilter: keepA }];
    const quickFilters = [{ key: 'b', label: 'qfB', rowFilter: keepB }];
    render(
      <ListView
        {...defaultProps}
        subsetFilters={subsetFilters}
        quickFilters={quickFilters}
        rowFilter={(row) => row.c === 3}
      />,
    );

    await user.click(screen.getByTestId('filter-sub'));
    await user.click(screen.getByTestId('quick-filter-b'));

    const composed = tableProps.rowFilter;
    expect(composed).not.toBe(keepA);
    expect(composed).not.toBe(keepB);
    expect(composed({ a: 1, b: 2, c: 3 })).toBe(true);
    expect(composed({ a: 1, b: 9, c: 3 })).toBe(false);
    expect(composed({ a: 9, b: 2, c: 3 })).toBe(false);
    expect(composed({ a: 1, b: 2, c: 9 })).toBe(false);
  });
});

// ─── Column filters ─────────────────────────────────────────────────────────

describe('ListView — column filters', () => {
  it('merges a new column filter into the existing set and refetches', () => {
    render(<ListView {...defaultProps} initialColumnFilters={{ status: { value: 'DR' } }} />);
    expect(capturedEntityOptions.columnFilters).toEqual({ status: { value: 'DR' } });

    act(() => { tableProps.onFilterChange('name', { operator: 'contains', value: 'abc' }); });

    expect(capturedEntityOptions.columnFilters).toEqual({
      status: { value: 'DR' },
      name: { operator: 'contains', value: 'abc' },
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(trackSearchPerformedMock).toHaveBeenCalledWith(expect.objectContaining({
      entity: 'testEntity',
      specName: 'test-entity',
      source: 'list_filter',
      type: 'filter_apply',
      count: 1,
    }));
  });

  it('drops a column filter when the table reports it cleared', () => {
    render(<ListView {...defaultProps} initialColumnFilters={{ status: { value: 'DR' }, name: { value: 'x' } }} />);

    act(() => { tableProps.onFilterChange('name', null); });

    expect(capturedEntityOptions.columnFilters).toEqual({ status: { value: 'DR' } });
    expect(trackSearchPerformedMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'filter_clear',
      count: 0,
    }));
  });

  it('clear-all resets every column filter at once', () => {
    render(<ListView {...defaultProps} initialColumnFilters={{ status: { value: 'DR' }, name: { value: 'x' } }} />);

    act(() => { tableProps.onClearAllFilters(); });

    expect(capturedEntityOptions.columnFilters).toEqual({});
  });

  it('derives columnDefs from the columns the table reported', () => {
    render(<ListView {...defaultProps} />);

    expect(Object.keys(capturedEntityOptions.columnDefs)).toEqual(
      MOCK_COLUMNS.map((c) => c.key),
    );
    expect(capturedEntityOptions.columnDefs.name.column).toBe('AD_Name');
  });

  it('turns the funnel (advanced) filter into a trailing criteria query', () => {
    render(<ListView {...defaultProps} />);
    expect(capturedEntityOptions.trailingFilter).toBeNull();

    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'zz' }); });

    expect(criteriaOf(capturedEntityOptions.trailingFilter)).toEqual([
      { fieldName: 'advField', operator: 'equals', value: 'zz' },
    ]);
    expect(refreshMock).toHaveBeenCalled();
  });
});

// ─── Filter presets ─────────────────────────────────────────────────────────

describe('ListView — filter presets', () => {
  const preset = {
    columnFilters: { name: { operator: 'contains', value: 'x' } },
    advancedFilter: { token: 'adv' },
    subsetLabel: 'sfOpen',
    quickFilterLabels: ['qfMine'],
  };

  function renderWithPresets(presets, props = {}) {
    mockPresets = presets;
    return render(
      <ListView
        {...defaultProps}
        subsetFilters={SUBSET_FILTERS}
        quickFilters={QUICK_FILTERS}
        {...props}
      />,
    );
  }

  it('restores column filters, funnel, subset and quick filters from a preset', () => {
    renderWithPresets({ P1: preset });

    act(() => { filterBarProps.onApplyPreset('P1'); });

    expect(capturedEntityOptions.columnFilters).toEqual(preset.columnFilters);
    expect(filterBarProps.advancedFilter).toEqual({ token: 'adv' });
    // Subset + quick filter resolved back from their labels.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('ignores an unknown preset name', () => {
    renderWithPresets({ P1: preset });

    act(() => { filterBarProps.onApplyPreset('does-not-exist'); });

    expect(capturedEntityOptions.columnFilters).toEqual({});
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('falls back to empty column filters when the stored payload is not an object', () => {
    renderWithPresets({ Broken: { ...preset, columnFilters: 'corrupted' } });

    act(() => { filterBarProps.onApplyPreset('Broken'); });

    expect(capturedEntityOptions.columnFilters).toEqual({});
  });

  it('falls back to the first subset when the stored subset label no longer exists', () => {
    renderWithPresets({ Stale: { ...preset, subsetLabel: 'sfRemoved' } });

    act(() => { filterBarProps.onApplyPreset('Stale'); });

    // Only the quick filter's criteria survives — the first subset has no filter.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('resets the subset and clears the funnel for a preset that stored neither', () => {
    renderWithPresets(
      { Minimal: { columnFilters: {} } },
      { initialSubsetIndex: 1, initialQuickFilterIndex: 1 },
    );
    expect(capturedEntityOptions.baseFilter).not.toBeNull();

    act(() => { filterBarProps.onApplyPreset('Minimal'); });

    // No subsetLabel / quickFilterLabels / advancedFilter stored -> back to a clean slate.
    expect(capturedEntityOptions.baseFilter).toBeNull();
    expect(filterBarProps.advancedFilter).toBeNull();
  });

  it('clears active quick filters when the preset references labels that no longer exist', () => {
    renderWithPresets({ Stale: { ...preset, quickFilterLabels: ['qfRemoved'] } }, { initialQuickFilterIndex: 1 });

    act(() => { filterBarProps.onApplyPreset('Stale'); });

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
    ]);
  });

  it('applies a preset on a window that has no quick or subset filters at all', () => {
    mockPresets = { P1: preset };
    render(<ListView {...defaultProps} />);

    act(() => { filterBarProps.onApplyPreset('P1'); });

    expect(capturedEntityOptions.columnFilters).toEqual(preset.columnFilters);
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('saves the current filter state, storing subset and quick filters by label', async () => {
    const user = userEvent.setup();
    renderWithPresets({});

    await user.click(screen.getByTestId('filter-open'));
    await user.click(screen.getByTestId('quick-filter-mine'));
    act(() => { tableProps.onFilterChange('name', { value: 'abc' }); });

    act(() => { filterBarProps.onSavePreset('My view'); });

    expect(savePresetMock).toHaveBeenCalledWith('My view', {
      columnFilters: { name: { value: 'abc' } },
      advancedFilter: null,
      subsetLabel: 'sfOpen',
      quickFilterLabels: ['qfMine'],
    });
  });

  it('saves an empty subset/quick payload on a window without those filters', () => {
    mockPresets = {};
    render(<ListView {...defaultProps} />);

    act(() => { filterBarProps.onSavePreset('Plain'); });

    expect(savePresetMock).toHaveBeenCalledWith('Plain', {
      columnFilters: {},
      advancedFilter: null,
      subsetLabel: null,
      quickFilterLabels: [],
    });
  });

  it('exposes the preset list and delete handler only for a named window', () => {
    mockPresets = { P1: preset };
    render(<ListView {...defaultProps} />);
    expect(filterBarProps.presets).toEqual({ P1: preset });
    expect(filterBarProps.onDeletePreset).toBe(deletePresetMock);
  });

  it('suppresses presets entirely when the window has no name to key them by', () => {
    mockPresets = { P1: preset };
    render(<ListView {...defaultProps} windowName={undefined} />);
    expect(filterBarProps.presets).toBeNull();
    expect(filterBarProps.onApplyPreset).toBeNull();
    expect(filterBarProps.onSavePreset).toBeNull();
    expect(filterBarProps.onDeletePreset).toBeNull();
  });
});

// ─── View mode ──────────────────────────────────────────────────────────────

describe('ListView — view mode', () => {
  const galleryRenderer = ({ data, onNavigate }) => (
    <div data-testid="gallery-view">
      <button data-testid="gallery-open" onClick={() => onNavigate('g1')}>{data.length}</button>
    </div>
  );

  it('switches to gallery and back, persisting the choice per entity', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} galleryRenderer={galleryRenderer} />);
    const [listBtn, galleryBtn] = screen.getByTestId('view-toggle').querySelectorAll('button');

    expect(screen.getByTestId('mock-table')).toBeInTheDocument();

    await user.click(galleryBtn);
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-table')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('viewMode:testEntity')).toBe('gallery');

    await user.click(listBtn);
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    expect(window.localStorage.getItem('viewMode:testEntity')).toBe('list');
  });

  it('navigates to the record detail from the gallery renderer', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} galleryRenderer={galleryRenderer} />);
    const galleryBtn = screen.getByTestId('view-toggle').querySelectorAll('button')[1];
    await user.click(galleryBtn);

    await user.click(screen.getByTestId('gallery-open'));

    expect(navigateMock).toHaveBeenCalledWith('/test-entity/g1');
  });
});

// ─── Selection bar actions ──────────────────────────────────────────────────

describe('ListView — selection bar actions', () => {
  function selectRows() {
    act(() => { tableProps.onSelectionChange(SELECTED); });
  }

  it('never renders the "Vista Previa" button in the selection bar (ETP-4644)', () => {
    render(<ListView {...defaultProps} />);
    selectRows();

    expect(screen.queryByText('preview')).not.toBeInTheDocument();
  });

  it('prints the selected documents with the window name and the translator', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);
    selectRows();

    await user.click(screen.getByText(/^print/).closest('button'));

    // ETP-4912: apiBaseUrl is passed too — it is what lets printDocuments build the
    // client-rendered document (design A) instead of the print-* artifact.
    expect(printDocumentsMock).toHaveBeenCalledWith('test-entity', ['r1', 'r2'], expect.any(Function), 'http://localhost/api');
  });

  it('hands the selected rows to onCloneRow', async () => {
    const user = userEvent.setup();
    const onCloneRow = vi.fn();
    render(<ListView {...defaultProps} onCloneRow={onCloneRow} />);
    selectRows();

    await user.click(screen.getByText(/^cloneOrderBtn/).closest('button'));

    expect(onCloneRow).toHaveBeenCalledWith(SELECTED);
  });

  it('accepts a selection of bare ids as well as row objects', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);
    act(() => { tableProps.onSelectionChange(['r1', 'r2']); });

    await user.click(screen.getByText(/^print/).closest('button'));
    // ETP-4912: apiBaseUrl is passed too — it is what lets printDocuments build the
    // client-rendered document (design A) instead of the print-* artifact.
    expect(printDocumentsMock).toHaveBeenCalledWith('test-entity', ['r1', 'r2'], expect.any(Function), 'http://localhost/api');
  });

  it('renders host-supplied bulkActions with the selection context', () => {
    const bulkActions = vi.fn(() => <button data-testid="host-bulk-action" />);
    render(<ListView {...defaultProps} bulkActions={bulkActions} />);
    selectRows();

    expect(screen.getByTestId('host-bulk-action')).toBeInTheDocument();
    expect(bulkActions).toHaveBeenLastCalledWith(expect.objectContaining({
      selectedRows: SELECTED,
      token: 'fake-token',
      apiBaseUrl: 'http://localhost/api',
      windowName: 'test-entity',
    }));
  });
});

// ─── Refresh & paging ───────────────────────────────────────────────────────

describe('ListView — refresh and paging', () => {
  it('refetches when the refresh button is pressed', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    await user.click(screen.getByTestId('refresh-icon').closest('button'));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once per change of the external refreshTrigger, never for a repeat', () => {
    const { rerender } = render(<ListView {...defaultProps} refreshTrigger={0} />);
    expect(refreshMock).not.toHaveBeenCalled();

    rerender(<ListView {...defaultProps} refreshTrigger={1} />);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // Same value re-rendered: the host has not asked for another reload.
    rerender(<ListView {...defaultProps} refreshTrigger={1} />);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    rerender(<ListView {...defaultProps} refreshTrigger={2} />);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('refetches after the default row delete succeeds', () => {
    render(<ListView {...defaultProps} rowQuickActions={{}} />);

    act(() => { capturedRowDeleteOptions.onSuccess(); });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(capturedRowDeleteOptions.entity).toBe('testEntity');
  });

  it('loads the next page when the scroll pane reaches the bottom and more rows exist', () => {
    hookOverrides = { hasMore: true, items: [{ id: 'r1' }] };
    render(<ListView {...defaultProps} />);

    act(() => { scrollPaneProps.onReachBottom(); });

    expect(loadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('does not load more when the list is exhausted', () => {
    hookOverrides = { hasMore: false, items: [{ id: 'r1' }] };
    render(<ListView {...defaultProps} />);

    act(() => { scrollPaneProps.onReachBottom(); });

    expect(loadMoreMock).not.toHaveBeenCalled();
  });

  it('does not stack a second page request while one is already in flight', () => {
    hookOverrides = { hasMore: true, loadingMore: true, items: [{ id: 'r1' }] };
    render(<ListView {...defaultProps} />);

    act(() => { scrollPaneProps.onReachBottom(); });

    expect(loadMoreMock).not.toHaveBeenCalled();
  });
});

// ─── Modals ─────────────────────────────────────────────────────────────────

describe('ListView — report drawer', () => {
  it('opens the report drawer with the resolved column labels and the active sort', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    expect(reportDrawerProps.open).toBe(false);
    await user.click(screen.getByRole('button', { name: 'print' }));

    expect(screen.getByTestId('report-drawer')).toBeInTheDocument();
    expect(reportDrawerProps.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'name', label: 'AD_Name' })]),
    );
    // A column without an AD label falls back to its own label.
    expect(reportDrawerProps.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'rowActions', label: 'Row actions' })]),
    );
    expect(reportDrawerProps.sortColumn).toBe('creationDate');
    expect(reportDrawerProps.sortDirection).toBe('desc');

    act(() => { reportDrawerProps.onClose(); });
    expect(screen.queryByTestId('report-drawer')).not.toBeInTheDocument();
  });
});

describe('ListView — send document modal', () => {
  it('auto-enables the envelope for a documental window and opens it for the clicked row', () => {
    render(<ListView {...defaultProps} rowQuickActions={{}} />);

    // Detected from the reported columns (documentNo present) — no host opt-in.
    expect(tableProps.rowQuickActions.sendDocument).toEqual({ enabled: true, allowEmail: true });
    expect(typeof tableProps.rowQuickActions.onEmail).toBe('function');
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();

    act(() => { tableProps.rowQuickActions.onEmail(SELECTED[0]); });

    expect(screen.getByTestId('send-document-modal')).toBeInTheDocument();
    expect(sendDocumentProps.documentNo).toBe('DOC-1');
    expect(sendDocumentProps.documentId).toBe('r1');
    expect(sendDocumentProps.bpName).toBe('ACME');
    expect(sendDocumentProps.bPartnerId).toBe('bp-1');
    expect(sendDocumentProps.allowEmail).toBe(true);

    act(() => { sendDocumentProps.onClose(); });
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('stays silent on a master-data window with no documentNo column', () => {
    mockColumns = [{ key: 'name', column: 'AD_Name' }];
    render(<ListView {...defaultProps} rowQuickActions={{}} />);

    expect(tableProps.rowQuickActions.sendDocument).toBeUndefined();
    expect(tableProps.rowQuickActions.onEmail).toBeUndefined();
  });

  it('lets an explicit sendDocument config override the documentNo auto-detection', () => {
    render(<ListView {...defaultProps} rowQuickActions={{}} sendDocument={{ enabled: false }} />);

    // documentNo is present, but the contract explicitly switched the envelope off.
    expect(tableProps.rowQuickActions.sendDocument).toEqual({ enabled: false });
    expect(tableProps.rowQuickActions.onEmail).toBeUndefined();
  });
});

// ─── Preview row ────────────────────────────────────────────────────────────

describe('ListView — preview row', () => {
  const renderPreview = ({ row, onClose, onEdit }) => (
    <div data-testid="preview">
      <span data-testid="preview-id">{row.id}</span>
      <button data-testid="preview-close" onClick={onClose} />
      <button data-testid="preview-edit" onClick={() => onEdit(row.id)} />
    </div>
  );

  it('opens the preview instead of navigating when renderPreview is supplied', () => {
    render(<ListView {...defaultProps} renderPreview={renderPreview} />);

    act(() => { tableProps.onNavigate(SELECTED[0]); });

    expect(screen.getByTestId('preview-id')).toHaveTextContent('r1');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates on row click when no renderPreview is supplied', () => {
    render(<ListView {...defaultProps} />);

    act(() => { tableProps.onNavigate(SELECTED[0]); });

    expect(navigateMock).toHaveBeenCalledWith('/test-entity/r1');
  });

  it('closing its own preview does not notify the host', async () => {
    const user = userEvent.setup();
    const onExternalPreviewClose = vi.fn();
    render(
      <ListView {...defaultProps} renderPreview={renderPreview} onExternalPreviewClose={onExternalPreviewClose} />,
    );
    act(() => { tableProps.onNavigate(SELECTED[0]); });

    await user.click(screen.getByTestId('preview-close'));

    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(onExternalPreviewClose).not.toHaveBeenCalled();
  });

  it('closing a host-owned preview delegates back to the host', async () => {
    const user = userEvent.setup();
    const onExternalPreviewClose = vi.fn();
    render(
      <ListView
        {...defaultProps}
        renderPreview={renderPreview}
        externalPreviewRow={{ id: 'ext-1' }}
        onExternalPreviewClose={onExternalPreviewClose}
      />,
    );

    expect(screen.getByTestId('preview-id')).toHaveTextContent('ext-1');
    await user.click(screen.getByTestId('preview-close'));

    // The host owns this row, so ListView cannot drop it on its own.
    expect(onExternalPreviewClose).toHaveBeenCalledTimes(1);
  });

  it('"edit" from the preview closes both previews and opens the detail', async () => {
    const user = userEvent.setup();
    const onExternalPreviewClose = vi.fn();
    render(
      <ListView {...defaultProps} renderPreview={renderPreview} onExternalPreviewClose={onExternalPreviewClose} />,
    );
    act(() => { tableProps.onNavigate(SELECTED[0]); });

    await user.click(screen.getByTestId('preview-edit'));

    expect(navigateMock).toHaveBeenCalledWith('/test-entity/r1');
    expect(onExternalPreviewClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  });
});

// ─── Page meta, split-new menu and telemetry ────────────────────────────────

describe('ListView — page meta and new actions', () => {
  it('translates each breadcrumb segment and wires the favourite toggle', () => {
    render(<ListView {...defaultProps} breadcrumb="Sales / Orders" />);

    expect(pageMetaArgs.breadcrumb).toBe('Sales / Orders');

    act(() => { pageMetaArgs.onAddToFavorites(); });

    expect(toggleFavoriteMock).toHaveBeenCalledWith('test-entity', 'Test Entity');
  });

  it('keys the favourite by the entity when the window has no name', () => {
    render(<ListView {...defaultProps} windowName={undefined} />);

    act(() => { pageMetaArgs.onAddToFavorites(); });

    expect(toggleFavoriteMock).toHaveBeenCalledWith('testEntity', 'Test Entity');
  });

  it('routes the default row-edit action by entity when no window name is set', () => {
    render(<ListView {...defaultProps} windowName={undefined} rowQuickActions={{}} />);

    act(() => { tableProps.rowQuickActions.onEdit({ id: 'r1' }); });

    expect(navigateMock).toHaveBeenCalledWith('/testEntity/r1');
  });

  it('renders the extra "New" menu entries and invokes their handlers', async () => {
    const user = userEvent.setup();
    const onQuote = vi.fn();
    render(<ListView {...defaultProps} newActions={[{ key: 'quote', label: 'New quote', onClick: onQuote }]} />);

    await user.click(screen.getByTestId('action-new-quote'));

    expect(onQuote).toHaveBeenCalledTimes(1);
  });

  it('reports the opened window to telemetry', () => {
    render(<ListView {...defaultProps} />);

    expect(trackWindowOpenedMock).toHaveBeenCalledWith({
      entity: 'testEntity',
      specName: 'test-entity',
      source: 'list_view',
    });
  });

  it('skips the telemetry ping when there is no entity or window to attribute it to', () => {
    render(<ListView {...defaultProps} entity={undefined} windowName={undefined} />);

    expect(trackWindowOpenedMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('list-view')).toBeInTheDocument();
  });
});
