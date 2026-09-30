/**
 * ListView — idle toolbar layout (ETP-5509).
 *
 * The idle list bar is a column of up to two rows closed by a separator line:
 *
 *   list-toolbar            container, carries the bottom border
 *   ├─ list-toolbar-main-row  quick filters, Table.ToolbarQuickFilter, the filters
 *   │                         section and the main actions
 *   └─ list-toolbar-tabs-row  the tab group (subset filters + list/gallery toggle),
 *                             rendered ONLY when the window has one
 *
 * These tests pin WHERE each control lives and WHEN the second row exists. They
 * assert structure through the stable test ids documented in
 * `docs/list-filters.md` ("Toolbar layout (ETP-5509)"), never through incidental
 * class strings — the one exception is the separator, where the border class IS
 * the behaviour.
 *
 * `hasListToolbarTabs` is module-private, so its truth table is covered through
 * rendering (see "second row gating").
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// The options ListView hands to the data hook are its query output: capturing
// them is how a tab click is proven to change what gets fetched.
let capturedEntityOptions = null;
vi.mock('@/hooks/useEntity', () => ({
  useEntity: (entity, id, options) => {
    capturedEntityOptions = options;
    return {
      items: [],
      meta: null,
      loading: false,
      loadingMore: false,
      hasMore: false,
      refresh: vi.fn(),
      loadMore: vi.fn(),
      sortColumn: 'creationDate',
      sortDirection: 'desc',
      setSortColumn: vi.fn(),
      setSortDirection: vi.fn(),
    };
  },
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('../ReportDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: () => <div data-testid="list-filter-bar" />,
}));

import { noOpExtractQueryParamConditions } from './testUtils/gridQueryMock.js';

vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: () => null,
  extractQueryParamConditions: noOpExtractQueryParamConditions,
}));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

function MockTable() {
  return <table data-testid="mock-table"><tbody /></table>;
}

// A custom table exposing the ETP-5188 companion toolbar slot.
function MockTableWithToolbarSlot() {
  return <table data-testid="mock-table"><tbody /></table>;
}
MockTableWithToolbarSlot.ToolbarQuickFilter = () => <div data-testid="toolbar-quick-filter-slot" />;

const defaultProps = {
  entity: 'testEntity',
  Table: MockTable,
  entityLabel: 'Test Entity',
  windowName: 'test-entity',
  token: 'fake-token',
  apiBaseUrl: 'http://localhost/api',
};

function encodeCriteria(value) {
  return `criteria=${encodeURIComponent(JSON.stringify(value))}`;
}

function criteriaOf(filterString) {
  const raw = new URLSearchParams(filterString).get('criteria');
  return raw ? JSON.parse(raw) : null;
}

const SUBSET_FILTERS = [
  { key: 'all', label: 'sfAll', filter: null },
  { key: 'open', label: 'sfOpen', filter: encodeCriteria({ fieldName: 'status', operator: 'equals', value: 'DR' }) },
  { key: 'done', label: 'sfDone', filter: encodeCriteria({ fieldName: 'status', operator: 'equals', value: 'CO' }) },
];

const QUICK_FILTERS = [
  { key: 'overdue', label: 'qfOverdue', filter: encodeCriteria({ fieldName: 'overdue', operator: 'equals', value: true }) },
  { key: 'mine', label: 'qfMine', filter: encodeCriteria({ fieldName: 'owner', operator: 'equals', value: 'me' }) },
];

const galleryRenderer = () => <div data-testid="gallery-view" />;

const renderListView = (props = {}) => render(<ListView {...defaultProps} {...props} />);

const mainRow = () => screen.getByTestId('list-toolbar-main-row');
const tabsRow = () => screen.getByTestId('list-toolbar-tabs-row');
const queryTabsRow = () => screen.queryByTestId('list-toolbar-tabs-row');
// The subset segmented control and the quick-filter cluster are both
// `role="group"`; counting them detects an empty group left behind.
const groupsIn = (element) => within(element).queryAllByRole('group');

beforeEach(() => {
  capturedEntityOptions = null;
  vi.clearAllMocks();
  // ListView restores the active subset / view mode from browser storage; a
  // leftover from a previous test would move the active tab.
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// ─── Item 1 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — subset tabs live in the second row', () => {
  it('renders every subset tab inside the tabs row', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    const row = tabsRow();
    for (const key of ['all', 'open', 'done']) {
      expect(within(row).getByTestId(`filter-${key}`)).toBeInTheDocument();
    }
  });

  it('keeps the subset tabs out of the main row', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    for (const key of ['all', 'open', 'done']) {
      expect(within(mainRow()).queryByTestId(`filter-${key}`)).not.toBeInTheDocument();
    }
    // Rendered exactly once: moved to row 2, not duplicated across rows.
    expect(screen.getAllByTestId('filter-all')).toHaveLength(1);
  });

  it('places the tabs row after the main row, both inside the toolbar', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    const toolbar = screen.getByTestId('list-toolbar');
    expect(toolbar).toContainElement(mainRow());
    expect(toolbar).toContainElement(tabsRow());
    expect(mainRow().compareDocumentPosition(tabsRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Siblings, not nested: the tabs row is a row of its own.
    expect(mainRow()).not.toContainElement(tabsRow());
  });
});

// ─── Items 2, 4 and the null/undefined edge cases of item 8 ─────────────────

describe('ListView toolbar layout — second row gating', () => {
  it('renders no tabs row without subsetFilters and without galleryRenderer', () => {
    renderListView();

    expect(mainRow()).toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
  });

  it('keeps the toolbar to a single row when there is no tab group', () => {
    renderListView();

    expect(screen.getByTestId('list-toolbar').children).toHaveLength(1);
    expect(screen.getByTestId('list-toolbar').firstElementChild).toBe(mainRow());
  });

  it('renders no tabs row and no empty group for subsetFilters=[]', () => {
    renderListView({ subsetFilters: [] });

    expect(mainRow()).toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
    expect(groupsIn(screen.getByTestId('list-toolbar'))).toHaveLength(0);
    // An empty list has no active subset, so it must not contribute a query either.
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('treats subsetFilters=%s as no tab group', (_label, subsetFilters) => {
    renderListView({ subsetFilters });

    expect(mainRow()).toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
    expect(groupsIn(screen.getByTestId('list-toolbar'))).toHaveLength(0);
  });

  it('does not let quick filters alone open the tabs row', () => {
    renderListView({ quickFilters: QUICK_FILTERS });

    expect(queryTabsRow()).not.toBeInTheDocument();
    expect(within(mainRow()).getByTestId('quick-filter-overdue')).toBeInTheDocument();
  });
});

// ─── Item 3 — ISOLATED ON PURPOSE ───────────────────────────────────────────
// Placing the list/gallery view toggle in row 2 is an interpretation of
// ETP-5509 still to be confirmed with the product owner. This describe block is
// the ONLY place that pins that placement for a gallery-only window: if the
// decision is reversed (toggle back in the main row), invert or delete this
// block and nothing else in the file needs to change.

describe('ListView toolbar layout — view toggle placement (pending confirmation)', () => {
  it('renders the view toggle inside the tabs row when only galleryRenderer is set', () => {
    renderListView({ galleryRenderer });

    expect(within(tabsRow()).getByTestId('view-toggle')).toBeInTheDocument();
    expect(within(mainRow()).queryByTestId('view-toggle')).not.toBeInTheDocument();
  });
});

// ─── Item 5 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — main row contents', () => {
  it('holds the quick filters', () => {
    renderListView({ quickFilters: QUICK_FILTERS, subsetFilters: SUBSET_FILTERS });

    expect(within(mainRow()).getByTestId('quick-filter-overdue')).toBeInTheDocument();
    expect(within(mainRow()).getByTestId('quick-filter-mine')).toBeInTheDocument();
    expect(within(tabsRow()).queryByTestId('quick-filter-overdue')).not.toBeInTheDocument();
  });

  it('holds the Table.ToolbarQuickFilter slot', () => {
    renderListView({ Table: MockTableWithToolbarSlot, subsetFilters: SUBSET_FILTERS });

    expect(within(mainRow()).getByTestId('toolbar-quick-filter-slot')).toBeInTheDocument();
    expect(within(tabsRow()).queryByTestId('toolbar-quick-filter-slot')).not.toBeInTheDocument();
  });

  it('holds the filters section', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(within(mainRow()).getByTestId('list-filter-bar')).toBeInTheDocument();
    expect(within(tabsRow()).queryByTestId('list-filter-bar')).not.toBeInTheDocument();
  });

  it('holds the create action', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(within(mainRow()).getByTestId('action-new')).toBeInTheDocument();
    expect(within(tabsRow()).queryByTestId('action-new')).not.toBeInTheDocument();
  });

  it('keeps all of them in the main row of a single-row toolbar', () => {
    renderListView({ Table: MockTableWithToolbarSlot, quickFilters: QUICK_FILTERS });

    const row = mainRow();
    expect(within(row).getByTestId('quick-filter-overdue')).toBeInTheDocument();
    expect(within(row).getByTestId('toolbar-quick-filter-slot')).toBeInTheDocument();
    expect(within(row).getByTestId('list-filter-bar')).toBeInTheDocument();
    expect(within(row).getByTestId('action-new')).toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
  });
});

// ─── Item 6 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — separator', () => {
  it('draws the bottom-border separator on the toolbar container', () => {
    renderListView();

    expect(screen.getByTestId('list-toolbar')).toHaveClass('border-b');
  });

  it('draws the separator on the container, not on a row, for a two-row toolbar', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(screen.getByTestId('list-toolbar')).toHaveClass('border-b');
    // One line closing the whole bar — a border on either row would draw a
    // second line between the rows.
    expect(mainRow()).not.toHaveClass('border-b');
    expect(tabsRow()).not.toHaveClass('border-b');
  });

  it('renders no toolbar at all when the list bar is hidden via the hideListBar prop', () => {
    renderListView({ hideListBar: true, subsetFilters: SUBSET_FILTERS, galleryRenderer });

    expect(screen.queryByTestId('list-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-toolbar-main-row')).not.toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('view-toggle')).not.toBeInTheDocument();
    // Only the bar is dropped — the table still renders.
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  it('renders no toolbar when the list bar is hidden via listViewOptions.hideListBar', () => {
    renderListView({ listViewOptions: { hideListBar: true }, subsetFilters: SUBSET_FILTERS });

    expect(screen.queryByTestId('list-toolbar')).not.toBeInTheDocument();
    expect(queryTabsRow()).not.toBeInTheDocument();
  });

  it('lets listViewOptions.hideListBar=false win over the hideListBar prop', () => {
    renderListView({ hideListBar: true, listViewOptions: { hideListBar: false } });

    expect(screen.getByTestId('list-toolbar')).toHaveClass('border-b');
  });
});

// ─── Item 7 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — tabs in the second row stay functional', () => {
  // The highlight is exposed only as a class (no aria-pressed / aria-selected
  // on the tab buttons), so the active marker is asserted the same way the
  // existing interactions suite does.
  const ACTIVE_CLASS = 'bg-card';

  it('starts with the first subset active and no subset query', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    const row = tabsRow();
    expect(within(row).getByTestId('filter-all')).toHaveClass(ACTIVE_CLASS);
    expect(within(row).getByTestId('filter-open')).not.toHaveClass(ACTIVE_CLASS);
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('moves the highlight to the clicked tab', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS });

    await user.click(within(tabsRow()).getByTestId('filter-open'));

    const row = tabsRow();
    expect(within(row).getByTestId('filter-open')).toHaveClass(ACTIVE_CLASS);
    expect(within(row).getByTestId('filter-all')).not.toHaveClass(ACTIVE_CLASS);
    expect(within(row).getByTestId('filter-done')).not.toHaveClass(ACTIVE_CLASS);
  });

  it('changes the filter passed to the data hook on each tab click', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS });

    await user.click(within(tabsRow()).getByTestId('filter-open'));
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
    ]);

    await user.click(within(tabsRow()).getByTestId('filter-done'));
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'CO' },
    ]);

    // Back to the unfiltered subset: the query is dropped, not left stale.
    await user.click(within(tabsRow()).getByTestId('filter-all'));
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('composes a row-2 tab with a row-1 quick filter', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS, quickFilters: QUICK_FILTERS });

    await user.click(within(tabsRow()).getByTestId('filter-open'));
    await user.click(within(mainRow()).getByTestId('quick-filter-mine'));

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('honours initialSubsetIndex for the tab highlighted in the second row', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, initialSubsetIndex: 2 });

    expect(within(tabsRow()).getByTestId('filter-done')).toHaveClass(ACTIVE_CLASS);
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'CO' },
    ]);
  });
});

// ─── Item 8 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — edge cases', () => {
  it('hosts subset tabs and the view toggle in one single tabs row', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    expect(screen.getAllByTestId('list-toolbar-tabs-row')).toHaveLength(1);
    expect(screen.getByTestId('list-toolbar').children).toHaveLength(2);
    expect(within(tabsRow()).getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getAllByTestId('view-toggle')).toHaveLength(1);
    expect(tabsRow()).toContainElement(screen.getByTestId('view-toggle'));
  });

  it('renders a single-entry subsetFilters as one active tab in the tabs row', () => {
    const only = [{ key: 'only', label: 'sfOnly', filter: encodeCriteria({ fieldName: 'kind', operator: 'equals', value: 'X' }) }];
    renderListView({ subsetFilters: only });

    const row = tabsRow();
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    expect(within(row).getByTestId('filter-only')).toHaveClass('bg-card');
    // Always one subset active: the single entry's filter applies from the start.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'kind', operator: 'equals', value: 'X' },
    ]);
  });

  it('derives the tab test id from the lowercased label when an entry has no key', () => {
    renderListView({ subsetFilters: [{ label: 'Drafts', filter: null }, { key: 'open', label: 'sfOpen', filter: null }] });

    expect(within(tabsRow()).getByTestId('filter-drafts')).toBeInTheDocument();
    expect(within(mainRow()).queryByTestId('filter-drafts')).not.toBeInTheDocument();
  });

  it('opens the tabs row for an empty subsetFilters when a galleryRenderer is present, without an empty group', () => {
    renderListView({ subsetFilters: [], galleryRenderer });

    const row = tabsRow();
    expect(within(row).getByTestId('view-toggle')).toBeInTheDocument();
    expect(groupsIn(row)).toHaveLength(0);
  });

  it('keeps the tab group in the second row after switching to gallery view', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    const toggleButtons = within(screen.getByTestId('view-toggle')).getAllByRole('button');
    await user.click(toggleButtons[toggleButtons.length - 1]);

    expect(screen.getByTestId('gallery-view')).toBeInTheDocument();
    expect(within(tabsRow()).getByTestId('filter-all')).toBeInTheDocument();
    expect(tabsRow()).toContainElement(screen.getByTestId('view-toggle'));
  });

  it('keeps the tabs row when the rest of the main row is stripped down', () => {
    renderListView({
      subsetFilters: SUBSET_FILTERS,
      hideCreate: true,
      hideListFilters: true,
    });

    expect(mainRow()).toBeInTheDocument();
    expect(within(mainRow()).queryByTestId('action-new')).not.toBeInTheDocument();
    expect(within(mainRow()).queryByTestId('list-filter-bar')).not.toBeInTheDocument();
    expect(within(tabsRow()).getByTestId('filter-all')).toBeInTheDocument();
  });
});
