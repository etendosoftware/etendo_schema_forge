/**
 * ETP-4994 — ListView restores the grid state the user left behind.
 *
 * The round trip under test is List -> Form -> List: every documented return path
 * (breadcrumb, the form's Cancel button, the browser back button) REMOUNTS ListView,
 * so "unmount, then render again" is a faithful simulation of all three — what the
 * component sees is identical in every case.
 *
 * The module itself (storage failure modes, version handling, the sanitizers) is
 * covered in `lib/__tests__/listViewSession.test.js`; here we only assert the wiring:
 * what is written on change, and what the state/hook actually get seeded with on the
 * way back.
 *
 * The single most important assertion in this file is the "untouched list writes
 * nothing" group — a window nobody filtered must behave exactly as it did before this
 * feature existed, key absent from sessionStorage.
 */
import { render, screen, act } from '@testing-library/react';
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

// Real useState for the sort pair: the restored sort must be observable as the
// hook's LIVE state, not merely as the option it was handed.
let capturedEntityOptions = null;
const refreshMock = vi.fn();
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
        loadMore: vi.fn(),
        sortColumn,
        sortDirection,
        setSortColumn,
        setSortDirection,
      };
    },
  };
});

vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: () => ({ requestDelete: vi.fn(), deleteDialog: null }),
}));

vi.mock('@/hooks/useBulkRowDelete', () => ({
  useBulkRowDelete: () => ({ requestBulkDelete: vi.fn(), bulkDeleteDialog: null, deleting: false }),
}));

// Stubbed only so the "sessionStorage is unavailable" test isolates ListView's OWN
// persistence path: this hook reads `sessionStorage.getItem` unguarded (see
// useBulkActionToast.js), so a blocked-storage browser throws there regardless of
// ETP-4994. Reported separately; not this feature's contract.
vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: () => ({ showResult: vi.fn() }),
}));

vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: (advancedFilter) =>
    advancedFilter ? [{ fieldName: 'advField', operator: 'equals', value: advancedFilter.token }] : null,
  // ETP-5188 added this export; none of this file's fixtures declare a `toQueryParams`
  // column hook, so a plain pass-through matches extractQueryParamConditions' own
  // no-op branch (see gridQuery.js).
  extractQueryParamConditions: (advancedFilter) => ({ conditions: advancedFilter, extraParams: null }),
}));

vi.mock('@/lib/productUsageTelemetry.js', () => ({
  trackSearchPerformed: vi.fn(),
  trackWindowOpened: vi.fn(),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => {},
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SendDocumentModal.jsx', () => ({ default: () => null }));

let filterBarProps = null;
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: (props) => { filterBarProps = props; return <div data-testid="list-filter-bar" />; },
}));

vi.mock('@etendosoftware/app-shell-core/components/ui/scroll-pane.jsx', () => ({
  ScrollPane: ({ children }) => <div data-testid="scroll-pane">{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }) => <button onClick={onClick} {...rest}>{children}</button>,
  DropdownMenuTrigger: ({ children }) => children,
}));

import { ListView } from '../ListView.jsx';
import { listStateKey } from '@/lib/listViewSession.js';

const MOCK_COLUMNS = [
  { key: 'documentNo', column: 'AD_DocumentNo', label: 'Doc No' },
  { key: 'country', column: 'AD_Country', label: 'Country' },
  { key: 'creationDate', column: 'AD_CreationDate', label: 'Created' },
];

let tableProps = null;
function MockTable(props) {
  tableProps = props;
  const { onColumnsReady } = props;
  useEffect(() => { onColumnsReady?.(MOCK_COLUMNS); }, [onColumnsReady]);
  return <table data-testid="mock-table"><tbody /></table>;
}

const SortIcon = () => <span data-testid="sort-icon" />;
const RefreshIcon = () => <span data-testid="refresh-icon" />;

const WINDOW = 'sales-order';

const defaultProps = {
  entity: 'testEntity',
  Table: MockTable,
  entityLabel: 'Test Entity',
  windowName: WINDOW,
  token: 'fake-token',
  apiBaseUrl: 'http://localhost/api',
  SortIconComponent: SortIcon,
  RefreshIconComponent: RefreshIcon,
};

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

/** The raw snapshot currently in sessionStorage for a window, or null. */
function storedSnapshot(scope = WINDOW) {
  const raw = window.sessionStorage.getItem(listStateKey(scope));
  return raw ? JSON.parse(raw) : null;
}

async function openSortPopover(user) {
  await user.click(screen.getByTestId('sort-icon').closest('button'));
}

beforeEach(() => {
  window.sessionStorage.clear();
  capturedEntityOptions = null;
  tableProps = null;
  filterBarProps = null;
  vi.clearAllMocks();
});

afterEach(() => {
  window.sessionStorage.clear();
});

// ─── Acceptance case 4 (the invariant that must never regress) ──────────────

describe('ListView session state — an untouched list stores nothing', () => {
  it('writes no key at all when the user never changes anything', () => {
    render(<ListView {...defaultProps} />);

    expect(storedSnapshot()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('writes no key for a window that declares its own defaults (subsets, quick filter, sort)', () => {
    render(
      <ListView
        {...defaultProps}
        subsetFilters={SUBSET_FILTERS}
        quickFilters={QUICK_FILTERS}
        initialQuickFilterIndex={1}
        initialSubsetIndex={1}
        listSortBy="documentNo desc"
        initialColumnFilters={{ status: { value: 'DR' } }}
      />,
    );

    expect(window.sessionStorage.length).toBe(0);
  });

  it('behaves exactly as before with no stored state: the hook keeps the window default sort', () => {
    render(<ListView {...defaultProps} listSortBy="documentNo asc" />);

    expect(capturedEntityOptions.initialSortColumn).toBe('documentNo');
    expect(capturedEntityOptions.initialSortDirection).toBe('asc');
    expect(capturedEntityOptions.columnFilters).toEqual({});
    expect(filterBarProps.advancedFilter).toBeNull();
  });

  it('removes the key once the user clears the filter that created it', () => {
    render(<ListView {...defaultProps} />);

    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    expect(storedSnapshot()).not.toBeNull();

    act(() => { tableProps.onFilterChange('country', null); });

    expect(storedSnapshot()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('removes the key when the user clears the sort back to the window default', async () => {
    const user = userEvent.setup();
    render(<ListView {...defaultProps} />);

    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));
    expect(storedSnapshot().sortColumn).toBe('country');

    await openSortPopover(user);
    await user.click(screen.getByText('clearSort'));

    expect(storedSnapshot()).toBeNull();
  });
});

// ─── Acceptance case 1 — a column filter survives the round trip ────────────

describe('ListView session state — a column filter survives List -> Form -> List', () => {
  it('persists the filter and restores it on remount', () => {
    const first = render(<ListView {...defaultProps} />);

    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    expect(storedSnapshot().columnFilters).toEqual({ country: { operator: 'equals', value: 'ES' } });

    // Leaving for the form and coming back — every return path remounts ListView.
    first.unmount();
    capturedEntityOptions = null;
    render(<ListView {...defaultProps} />);

    expect(capturedEntityOptions.columnFilters).toEqual({
      country: { operator: 'equals', value: 'ES' },
    });
  });

  it('the restored filter wins over the window\'s declared initialColumnFilters', () => {
    const first = render(
      <ListView {...defaultProps} initialColumnFilters={{ status: { value: 'DR' } }} />,
    );
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    first.unmount();

    render(<ListView {...defaultProps} initialColumnFilters={{ status: { value: 'DR' } }} />);

    expect(capturedEntityOptions.columnFilters).toEqual({
      status: { value: 'DR' },
      country: { operator: 'equals', value: 'ES' },
    });
  });
});

// ─── Acceptance case 3 — several filters plus a descending sort ─────────────

describe('ListView session state — filters and sort are restored together', () => {
  it('restores column filters, the advanced filter and a descending sort in one go', async () => {
    const user = userEvent.setup();
    const first = render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} subsetFilters={SUBSET_FILTERS} />);

    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    act(() => { tableProps.onFilterChange('documentNo', { operator: 'contains', value: 'INV' }); });
    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'zz' }); });
    await user.click(screen.getByTestId('quick-filter-mine'));
    await user.click(screen.getByTestId('filter-open'));
    // asc on first pick, desc on the second (same column toggles).
    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));
    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));

    const snapshot = storedSnapshot();
    expect(snapshot.sortColumn).toBe('country');
    expect(snapshot.sortDirection).toBe('desc');
    expect(snapshot.quickFilterIndices).toEqual([1]);
    expect(snapshot.subsetIndex).toBe(1);

    first.unmount();
    capturedEntityOptions = null;
    filterBarProps = null;
    render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} subsetFilters={SUBSET_FILTERS} />);

    expect(capturedEntityOptions.columnFilters).toEqual({
      country: { operator: 'equals', value: 'ES' },
      documentNo: { operator: 'contains', value: 'INV' },
    });
    expect(capturedEntityOptions.initialSortColumn).toBe('country');
    expect(capturedEntityOptions.initialSortDirection).toBe('desc');
    expect(tableProps.sortColumn).toBe('country');
    expect(tableProps.sortDirection).toBe('desc');
    expect(filterBarProps.advancedFilter).toEqual({ token: 'zz' });
    // The restored quick filter and subset are observable in the query ListView derives.
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('owner'));
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('status'));
    expect(capturedEntityOptions.baseFilter).not.toContain(encodeURIComponent('overdue'));
  });

  it('restoring a sort does not move the window default that "clear sort" returns to', async () => {
    const user = userEvent.setup();
    const first = render(<ListView {...defaultProps} listSortBy="documentNo asc" />);

    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));
    first.unmount();

    render(<ListView {...defaultProps} listSortBy="documentNo asc" />);
    expect(tableProps.sortColumn).toBe('country');

    // The declared default is still documentNo asc — clearing must return there,
    // not to the restored sort.
    await openSortPopover(user);
    await user.click(screen.getByText('clearSort'));

    expect(tableProps.sortColumn).toBe('documentNo');
    expect(tableProps.sortDirection).toBe('asc');
    expect(storedSnapshot()).toBeNull();
  });
});

// ─── Acceptance case 2 — column order (feature does not exist yet) ──────────

describe('ListView session state — unknown stored state', () => {
  // NOTE: there is NO user-facing column-reorder feature in the app today
  // (`onColumnsReady` merely echoes the columns the table resolved; the headers carry
  // no drag handlers), so there is no column order to persist and none is asserted
  // here. What this test pins instead is the property that makes adding one safe: a
  // snapshot carrying state ListView does not know about must not break the mount, and
  // must not disturb the state it does know about.
  it('mounts normally and still restores the known fields when the snapshot carries extra keys', () => {
    window.sessionStorage.setItem(listStateKey(WINDOW), JSON.stringify({
      v: 1,
      columnFilters: { country: { operator: 'equals', value: 'ES' } },
      columnOrder: ['country', 'documentNo'],
      somethingFromTheFuture: { nested: true },
      sortColumn: 'country',
      sortDirection: 'desc',
    }));

    render(<ListView {...defaultProps} />);

    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    expect(capturedEntityOptions.columnFilters).toEqual({
      country: { operator: 'equals', value: 'ES' },
    });
    expect(capturedEntityOptions.initialSortColumn).toBe('country');
    expect(capturedEntityOptions.initialSortDirection).toBe('desc');
  });
});

// ─── Edge cases at the ListView boundary ───────────────────────────────────

describe('ListView session state — hostile or stale stored state', () => {
  it('ignores corrupt JSON and mounts with the window defaults', () => {
    window.sessionStorage.setItem(listStateKey(WINDOW), '{broken');

    render(<ListView {...defaultProps} listSortBy="documentNo asc" />);

    expect(capturedEntityOptions.columnFilters).toEqual({});
    expect(capturedEntityOptions.initialSortColumn).toBe('documentNo');
  });

  it('ignores a snapshot written by a different version', () => {
    window.sessionStorage.setItem(listStateKey(WINDOW), JSON.stringify({
      v: 99,
      columnFilters: { country: { value: 'ES' } },
    }));

    render(<ListView {...defaultProps} />);

    expect(capturedEntityOptions.columnFilters).toEqual({});
  });

  it('drops stored quick-filter indices that no longer point at a live filter', () => {
    window.sessionStorage.setItem(listStateKey(WINDOW), JSON.stringify({
      v: 1,
      quickFilterIndices: [0, 7],
      columnFilters: {},
    }));

    // The window now declares only two quick filters — index 7 is gone.
    render(<ListView {...defaultProps} quickFilters={QUICK_FILTERS} />);

    // Index 0 (overdue) survives; the dangling index 7 contributes nothing.
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('overdue'));
    expect(capturedEntityOptions.baseFilter).not.toContain(encodeURIComponent('owner'));
  });

  it('falls back to the default subset when the stored index no longer exists', () => {
    window.sessionStorage.setItem(listStateKey(WINDOW), JSON.stringify({
      v: 1,
      subsetIndex: 9,
      columnFilters: {},
    }));

    render(<ListView {...defaultProps} subsetFilters={SUBSET_FILTERS} initialSubsetIndex={1} />);

    // Back to the declared default (index 1, "open") rather than a broken index.
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('status'));
    expect(window.sessionStorage.length).toBe(0);
  });

  it('does not throw when sessionStorage is unavailable', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('site data blocked'); },
    });
    try {
      expect(() => render(<ListView {...defaultProps} />)).not.toThrow();
      act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
      expect(capturedEntityOptions.columnFilters).toEqual({
        country: { operator: 'equals', value: 'ES' },
      });
    } finally {
      Object.defineProperty(window, 'sessionStorage', real);
    }
  });
});

describe('ListView session state — scoping', () => {
  it('keeps two windows independent', () => {
    const sales = render(<ListView {...defaultProps} />);
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    sales.unmount();

    capturedEntityOptions = null;
    const purchase = render(<ListView {...defaultProps} windowName="purchase-order" />);
    expect(capturedEntityOptions.columnFilters).toEqual({});
    purchase.unmount();

    capturedEntityOptions = null;
    render(<ListView {...defaultProps} />);
    expect(capturedEntityOptions.columnFilters).toEqual({
      country: { operator: 'equals', value: 'ES' },
    });
  });

  it('falls back to the entity name as the scope when the window has no name', () => {
    render(<ListView {...defaultProps} windowName={undefined} />);

    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });

    expect(storedSnapshot('testEntity')).not.toBeNull();
    expect(storedSnapshot(WINDOW)).toBeNull();
  });
});

// ─── ETP-5009 — a URL deep-link outranks the saved snapshot ─────────────────
//
// Precedence: deep-link (URL) > session snapshot > the window's declared default.
// `initialFiltersFromUrl` is the explicit signal that the `initial*` props of THIS
// render came from the URL and are therefore an intent for THIS navigation.

describe('ListView session state — a URL deep-link wins over the snapshot', () => {
  it('applies the deep-linked advanced filter although a snapshot exists', () => {
    const first = render(<ListView {...defaultProps} />);
    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'userTyped' }); });
    expect(storedSnapshot().advancedFilter).toEqual({ token: 'userTyped' });
    first.unmount();

    capturedEntityOptions = null;
    render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );

    expect(capturedEntityOptions.trailingFilter).toContain('overdue');
    expect(capturedEntityOptions.trailingFilter).not.toContain('userTyped');
  });

  it('applies the deep-link when the snapshot holds a sort but no advanced filter', () => {
    // The `?? null` variant: a snapshot that only carries sort used to blank the
    // deep-link filter entirely, showing every record with no filter at all.
    window.sessionStorage.setItem(listStateKey(WINDOW), JSON.stringify({
      v: 1,
      columnFilters: {},
      advancedFilter: null,
      sortColumn: 'documentNo',
      sortDirection: 'asc',
    }));

    render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );

    expect(capturedEntityOptions.trailingFilter).toContain('overdue');
  });

  it('behaves exactly as before when there is no snapshot at all', () => {
    // The common case: the user clicks a dashboard card on a window they never
    // filtered. `initialFiltersFromUrl` must be a no-op here, not a different path.
    render(
      <ListView
        {...defaultProps}
        quickFilters={QUICK_FILTERS}
        subsetFilters={SUBSET_FILTERS}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialColumnFilters={{ status: { value: 'CO' } }}
        initialSubsetIndex={1}
        initialQuickFilterIndex={1}
        listSortBy="documentNo asc"
        initialFiltersFromUrl
      />,
    );

    expect(capturedEntityOptions.trailingFilter).toContain('overdue');
    expect(capturedEntityOptions.columnFilters).toEqual({ status: { value: 'CO' } });
    expect(capturedEntityOptions.initialSortColumn).toBe('documentNo');
    expect(capturedEntityOptions.initialSortDirection).toBe('asc');
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('owner'));
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('status'));
    expect(filterBarProps.advancedFilter).toEqual({ token: 'overdue' });
  });

  it('uses the deep-linked column filters instead of merging the saved ones in', () => {
    const first = render(<ListView {...defaultProps} />);
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    expect(storedSnapshot().columnFilters).toEqual({ country: { operator: 'equals', value: 'ES' } });
    first.unmount();

    capturedEntityOptions = null;
    render(
      <ListView
        {...defaultProps}
        initialColumnFilters={{ documentStatus: { mode: 'enumLabel', value: ['CO'] } }}
        initialFiltersFromUrl
      />,
    );

    // The deep-link set REPLACES the saved one — no merge, or the user would land on
    // a grid filtered by a country they picked before ever seeing the dashboard.
    expect(capturedEntityOptions.columnFilters).toEqual({
      documentStatus: { mode: 'enumLabel', value: ['CO'] },
    });
    expect(capturedEntityOptions.columnFilters.country).toBeUndefined();
  });

  it('uses the declared subset and quick-filter defaults, not the saved selection', async () => {
    const user = userEvent.setup();
    const first = render(
      <ListView
        {...defaultProps}
        quickFilters={QUICK_FILTERS}
        subsetFilters={SUBSET_FILTERS}
      />,
    );
    await user.click(screen.getByTestId('quick-filter-mine'));   // index 1 — `owner`
    await user.click(screen.getByTestId('filter-open'));         // subset 1 — `status`
    expect(storedSnapshot().quickFilterIndices).toEqual([1]);
    expect(storedSnapshot().subsetIndex).toBe(1);
    first.unmount();

    capturedEntityOptions = null;
    render(
      <ListView
        {...defaultProps}
        quickFilters={QUICK_FILTERS}
        subsetFilters={SUBSET_FILTERS}
        initialQuickFilterIndex={0}
        initialSubsetIndex={0}
        initialAdvancedFilter={{ token: 'overdueLink' }}
        initialFiltersFromUrl
      />,
    );

    // Quick filter 0 (`overdue`) and subset 0 (no criteria) — the window's declared
    // defaults — win over the saved index 1 pair.
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('overdue'));
    expect(capturedEntityOptions.baseFilter).not.toContain(encodeURIComponent('owner'));
    expect(capturedEntityOptions.baseFilter).not.toContain(encodeURIComponent('status'));
  });

  it('uses the window\'s declared sort, not the saved one', async () => {
    const user = userEvent.setup();
    const first = render(<ListView {...defaultProps} listSortBy="documentNo asc" />);

    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));
    expect(storedSnapshot().sortColumn).toBe('country');
    first.unmount();

    capturedEntityOptions = null;
    tableProps = null;
    render(
      <ListView
        {...defaultProps}
        listSortBy="documentNo asc"
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );

    expect(capturedEntityOptions.initialSortColumn).toBe('documentNo');
    expect(capturedEntityOptions.initialSortDirection).toBe('asc');
    expect(tableProps.sortColumn).toBe('documentNo');
    expect(tableProps.sortDirection).toBe('asc');
  });

  it('overwrites the stale snapshot so it cannot resurface one navigation later', () => {
    const first = render(<ListView {...defaultProps} />);
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'userTyped' }); });
    expect(storedSnapshot().advancedFilter).toEqual({ token: 'userTyped' });
    first.unmount();

    render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );

    // Nothing of what the user had typed before the deep-link survives.
    const snapshot = storedSnapshot();
    expect(snapshot.advancedFilter).toEqual({ token: 'overdue' });
    expect(snapshot.columnFilters).toEqual({});
  });

  it('persists the deep-linked view, so returning from a record comes back to it', () => {
    // Breadcrumb and Cancel both navigate to the bare `/${windowName}` — the query
    // string is gone, so the deep-linked view can only survive through the snapshot.
    // That is why the persistence defaults are the EMPTY grid when the flag is set:
    // the deep-linked state must not be classified as "still at the default".
    const deepLink = render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );
    expect(storedSnapshot().advancedFilter).toEqual({ token: 'overdue' });
    deepLink.unmount();

    capturedEntityOptions = null;
    filterBarProps = null;
    // Back from the record: no query string left, hence no flag and no initial props.
    render(<ListView {...defaultProps} />);

    expect(filterBarProps.advancedFilter).toEqual({ token: 'overdue' });
    expect(capturedEntityOptions.trailingFilter).toContain('overdue');
  });

  it('stores nothing when the flag is set but the URL produced no filter', () => {
    // `initialFiltersFromUrl` on its own is not "state worth saving": the baseline it
    // switches to is the EMPTY grid, and an empty grid equals that baseline. The
    // "untouched list stores nothing" invariant survives the flag.
    render(<ListView {...defaultProps} initialFiltersFromUrl />);

    expect(storedSnapshot()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('removes a previous snapshot when the deep-link resolves to no filter', () => {
    const first = render(<ListView {...defaultProps} />);
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    expect(storedSnapshot()).not.toBeNull();
    first.unmount();

    capturedEntityOptions = null;
    render(<ListView {...defaultProps} initialFiltersFromUrl />);

    // The snapshot is neither read nor kept: the user lands on the bare list.
    expect(capturedEntityOptions.columnFilters).toEqual({});
    expect(window.sessionStorage.getItem(listStateKey(WINDOW))).toBeNull();
  });

  it('keeps saving the grid state once the user changes something after the deep-link', () => {
    render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl
      />,
    );

    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'FR' }); });

    // Persistence is not disabled by the flag — only the initial READ is skipped.
    expect(storedSnapshot().columnFilters).toEqual({ country: { operator: 'equals', value: 'FR' } });
    expect(storedSnapshot().advancedFilter).toEqual({ token: 'overdue' });
  });

  // ─── Guards: the ETP-4994 path is untouched without the flag ───────────────

  it('without the flag, the snapshot still wins over identical initial props (ETP-4994)', async () => {
    const user = userEvent.setup();
    const first = render(
      <ListView
        {...defaultProps}
        quickFilters={QUICK_FILTERS}
        subsetFilters={SUBSET_FILTERS}
        listSortBy="documentNo asc"
      />,
    );
    act(() => { tableProps.onFilterChange('country', { operator: 'equals', value: 'ES' }); });
    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'userTyped' }); });
    await user.click(screen.getByTestId('quick-filter-mine'));
    await user.click(screen.getByTestId('filter-open'));
    await openSortPopover(user);
    await user.click(screen.getByText('AD_Country'));
    first.unmount();

    capturedEntityOptions = null;
    filterBarProps = null;
    render(
      <ListView
        {...defaultProps}
        quickFilters={QUICK_FILTERS}
        subsetFilters={SUBSET_FILTERS}
        listSortBy="documentNo asc"
        initialAdvancedFilter={{ token: 'overdue' }}
        initialColumnFilters={{ documentStatus: { mode: 'enumLabel', value: ['CO'] } }}
        initialQuickFilterIndex={0}
        initialSubsetIndex={0}
      />,
    );

    // Exactly the same props as the deep-link tests above, minus the flag: everything
    // comes from the snapshot instead.
    expect(filterBarProps.advancedFilter).toEqual({ token: 'userTyped' });
    expect(capturedEntityOptions.trailingFilter).toContain('userTyped');
    // The snapshot's column filters replace the props wholesale (the first mount had
    // none declared, so nothing of the deep-link set survives).
    expect(capturedEntityOptions.columnFilters).toEqual({
      country: { operator: 'equals', value: 'ES' },
    });
    expect(capturedEntityOptions.initialSortColumn).toBe('country');
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('owner'));
    expect(capturedEntityOptions.baseFilter).toContain(encodeURIComponent('status'));
    expect(capturedEntityOptions.baseFilter).not.toContain(encodeURIComponent('overdue'));
    expect(storedSnapshot()).not.toBeNull();
  });

  it('an explicit initialFiltersFromUrl={false} is the same as omitting it', () => {
    const first = render(<ListView {...defaultProps} />);
    act(() => { filterBarProps.onAdvancedFilterChange({ token: 'userTyped' }); });
    first.unmount();

    capturedEntityOptions = null;
    filterBarProps = null;
    render(
      <ListView
        {...defaultProps}
        initialAdvancedFilter={{ token: 'overdue' }}
        initialFiltersFromUrl={false}
      />,
    );

    expect(filterBarProps.advancedFilter).toEqual({ token: 'userTyped' });
  });
});
