// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
/**
 * ListView — idle toolbar layout (ETP-5509).
 *
 * The idle list bar is ONE row with no bottom border (ETP-5601: 56px per Figma,
 * 8px padding around 40px controls), in the pre-ETP-5509 order:
 * [subset tabs][quick filters, slot, filters, view toggle] … [actions].
 * The subset tabs open that row while everything fits and move — alone, as the
 * same element, by CSS — to a line of their own below it when it does not:
 *
 *   list-toolbar                  container, 8px padding, no bottom border
 *   └─ list-toolbar-main-row        flex-wrap row; `data-tabs-placement` =
 *      │                            inline | wrapped (only with subset tabs)
 *      ├─ list-toolbar-tabs         the subset tabs (order-last + full basis
 *      │                            when wrapped)
 *      ├─ list-toolbar-filters      quick filters, Table.ToolbarQuickFilter, the
 *      │                            filters section, the view toggle
 *      └─ list-toolbar-actions      the main actions
 *
 * The fit decision is a measurement (`useListToolbarTabsFit`). jsdom has no layout,
 * so these tests feed it widths through a `getBoundingClientRect` stub keyed by
 * test id (`useLayout`): `NARROW` forces the wrap, `WIDE` keeps the tabs inline,
 * and no layout at all (every width 0) keeps the default — inline, one row.
 * Structure is asserted through the stable test ids documented in
 * `docs/list-filters.md` ("Toolbar layout (ETP-5509)") and the placement marker;
 * class strings only where the class IS the behaviour (the borderless 8px-padded
 * box, the CSS move). The pure decision is covered in `useListToolbarTabsFit.vitest.js`.
 *
 * `hasListToolbarTabs` is module-private, so its truth table is covered through
 * rendering (see "tab group gating").
 */
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers tools/app-shell/src/components/contract-ui/useListToolbarTabsFit.js
import { act, render, screen, within } from '@testing-library/react';
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
// The props ListView hands the filter bar: `flowInParent` is how its controls become
// items of the filters cluster, which is what the fit measures.
let capturedFilterBarProps = null;
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: (props) => {
    capturedFilterBarProps = props;
    return <div data-testid="list-filter-bar" />;
  },
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
const tabGroup = () => screen.getByTestId('list-toolbar-tabs');
const queryTabGroup = () => screen.queryByTestId('list-toolbar-tabs');
const filtersCluster = () => screen.getByTestId('list-toolbar-filters');
const actionsCluster = () => screen.getByTestId('list-toolbar-actions');
const placement = () => mainRow().getAttribute('data-tabs-placement');
// The subset segmented control and the quick-filter cluster are both
// `role="group"`; counting them detects an empty group left behind.
const groupsIn = (element) => within(element).queryAllByRole('group');

// ─── Layout stub ────────────────────────────────────────────────────────────
// Widths (px) by data-testid; anything not listed measures 0. The main row is
// the available width; tabs + actions alone decide the fit in these fixtures.
const NARROW = { 'list-toolbar-main-row': 600, 'list-toolbar-tabs': 300, 'list-toolbar-actions': 400 };
const WIDE = { 'list-toolbar-main-row': 1600, 'list-toolbar-tabs': 300, 'list-toolbar-actions': 400 };

let layoutWidths = {};
const useLayout = (widths) => { layoutWidths = { ...widths }; };

beforeEach(() => {
  layoutWidths = {};
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function stubRect() {
    const width = layoutWidths[this.dataset?.testid] ?? 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  capturedEntityOptions = null;
  vi.clearAllMocks();
  // ListView restores the active subset / view mode from browser storage; a
  // leftover from a previous test would move the active tab.
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// ─── Item 1 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — subset tabs move to a line of their own when they do not fit', () => {
  beforeEach(() => useLayout(NARROW));

  it('renders every subset tab inside the tab group', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    for (const key of ['all', 'open', 'done']) {
      expect(within(tabGroup()).getByTestId(`filter-${key}`)).toBeInTheDocument();
    }
  });

  it('keeps the subset tabs out of the filters and the actions clusters', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    for (const key of ['all', 'open', 'done']) {
      expect(within(filtersCluster()).queryByTestId(`filter-${key}`)).not.toBeInTheDocument();
      expect(within(actionsCluster()).queryByTestId(`filter-${key}`)).not.toBeInTheDocument();
    }
    // Rendered exactly once: moved, not duplicated.
    expect(screen.getAllByTestId('filter-all')).toHaveLength(1);
  });

  it('moves the same tab group element last, on a full-width line', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(placement()).toBe('wrapped');
    expect(tabGroup()).toHaveClass('order-last', 'basis-full');
    // Still inside the toolbar's single flex-wrap row: no second row element.
    expect(mainRow()).toContainElement(tabGroup());
    expect(screen.getByTestId('list-toolbar').children).toHaveLength(1);
  });
});

// ─── Items 2, 4 and the null/undefined edge cases of item 8 ─────────────────

describe('ListView toolbar layout — tab group gating', () => {
  // Narrow on purpose: even when space is short, a window without subset tabs
  // has nothing to move and never measures.
  beforeEach(() => useLayout(NARROW));

  it('renders no tab group without subsetFilters', () => {
    renderListView();

    expect(mainRow()).toBeInTheDocument();
    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(mainRow()).not.toHaveAttribute('data-tabs-placement');
  });

  it('keeps the toolbar to a single row when there is no tab group', () => {
    renderListView();

    expect(screen.getByTestId('list-toolbar').children).toHaveLength(1);
    expect(screen.getByTestId('list-toolbar').firstElementChild).toBe(mainRow());
  });

  it('renders no tab group and no empty group for subsetFilters=[]', () => {
    renderListView({ subsetFilters: [] });

    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(groupsIn(screen.getByTestId('list-toolbar'))).toHaveLength(0);
    // An empty list has no active subset, so it must not contribute a query either.
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('treats subsetFilters=%s as no tab group', (_label, subsetFilters) => {
    renderListView({ subsetFilters });

    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(groupsIn(screen.getByTestId('list-toolbar'))).toHaveLength(0);
  });

  it('does not let quick filters alone create a tab group', () => {
    renderListView({ quickFilters: QUICK_FILTERS });

    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(within(filtersCluster()).getByTestId('quick-filter-overdue')).toBeInTheDocument();
  });

  it('does not let a galleryRenderer alone create a tab group', () => {
    renderListView({ galleryRenderer });

    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(mainRow()).not.toHaveAttribute('data-tabs-placement');
  });
});

// ─── Item 3 ─────────────────────────────────────────────────────────────────
// The list/gallery view toggle keeps its pre-ETP-5509 place: last in the filters
// cluster, after "Filtros". It is not part of the tab group and never moves.

describe('ListView toolbar layout — view toggle placement', () => {
  it('renders the view toggle last in the filters cluster, after the filters section', () => {
    useLayout(WIDE);
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    const toggle = screen.getByTestId('view-toggle');
    expect(filtersCluster().lastElementChild).toBe(toggle);
    expect(screen.getByTestId('list-filter-bar').compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabGroup()).not.toContainElement(toggle);
  });

  it('keeps the view toggle in the filters cluster when the subset tabs move away', () => {
    useLayout(NARROW);
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    expect(placement()).toBe('wrapped');
    expect(filtersCluster()).toContainElement(screen.getByTestId('view-toggle'));
    expect(tabGroup()).not.toContainElement(screen.getByTestId('view-toggle'));
  });

  it('renders the view toggle in the filters cluster for a gallery-only window', () => {
    renderListView({ galleryRenderer });

    expect(within(filtersCluster()).getByTestId('view-toggle')).toBeInTheDocument();
  });
});

// ─── Item 5 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — filters cluster contents', () => {
  beforeEach(() => useLayout(NARROW));

  it('holds the quick filters', () => {
    renderListView({ quickFilters: QUICK_FILTERS, subsetFilters: SUBSET_FILTERS });

    expect(within(filtersCluster()).getByTestId('quick-filter-overdue')).toBeInTheDocument();
    expect(within(filtersCluster()).getByTestId('quick-filter-mine')).toBeInTheDocument();
    expect(within(tabGroup()).queryByTestId('quick-filter-overdue')).not.toBeInTheDocument();
  });

  it('holds the Table.ToolbarQuickFilter slot', () => {
    renderListView({ Table: MockTableWithToolbarSlot, subsetFilters: SUBSET_FILTERS });

    expect(within(filtersCluster()).getByTestId('toolbar-quick-filter-slot')).toBeInTheDocument();
    expect(within(tabGroup()).queryByTestId('toolbar-quick-filter-slot')).not.toBeInTheDocument();
  });

  it('holds the filters section', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(within(filtersCluster()).getByTestId('list-filter-bar')).toBeInTheDocument();
    expect(within(tabGroup()).queryByTestId('list-filter-bar')).not.toBeInTheDocument();
  });

  // ETP-5593 — the Share button used to be decorative (no handler) on every list.
  it('holds the Share button in the actions cluster, which copies the current page URL', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderListView();

    const share = within(actionsCluster()).getByTestId('list-share-link');
    expect(share).toHaveAttribute('aria-label', 'copyLink');
    await userEvent.click(share);

    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('keeps the create action in the actions cluster', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(within(actionsCluster()).getByTestId('action-new')).toBeInTheDocument();
    expect(within(tabGroup()).queryByTestId('action-new')).not.toBeInTheDocument();
  });

  it('orders the filters cluster as before ETP-5509: quick filters, slot, filters section', () => {
    renderListView({ Table: MockTableWithToolbarSlot, quickFilters: QUICK_FILTERS, galleryRenderer });

    const order = ['quick-filter-overdue', 'toolbar-quick-filter-slot', 'list-filter-bar', 'view-toggle']
      .map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(filtersCluster()).toContainElement(order[i]);
    }
  });
});

// ─── Item 6 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — separator', () => {
  it('draws no bottom border on the toolbar container and pads it 8px on every side', () => {
    renderListView();

    const toolbar = screen.getByTestId('list-toolbar');
    expect(toolbar).not.toHaveClass('border-b');
    // Figma: 56px bar = 8px padding all around + 40px controls.
    expect(toolbar).toHaveClass('py-2');
    expect(toolbar).toHaveClass('px-2');
    expect(toolbar).not.toHaveClass('py-3');
  });

  it('keeps the container, the row and the moved tabs free of a border', () => {
    useLayout(NARROW);
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(screen.getByTestId('list-toolbar')).not.toHaveClass('border-b');
    expect(mainRow()).not.toHaveClass('border-b');
    expect(tabGroup()).not.toHaveClass('border-b');
  });

  it('renders the main-row controls 40px tall (h-10)', () => {
    renderListView();

    expect(within(mainRow()).getByTestId('action-new')).toHaveClass('h-10');
  });

  it('renders no toolbar at all when the list bar is hidden via the hideListBar prop', () => {
    renderListView({ hideListBar: true, subsetFilters: SUBSET_FILTERS, galleryRenderer });

    expect(screen.queryByTestId('list-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-toolbar-main-row')).not.toBeInTheDocument();
    expect(queryTabGroup()).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('view-toggle')).not.toBeInTheDocument();
    // Only the bar is dropped — the table still renders.
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  it('renders no toolbar when the list bar is hidden via listViewOptions.hideListBar', () => {
    renderListView({ listViewOptions: { hideListBar: true }, subsetFilters: SUBSET_FILTERS });

    expect(screen.queryByTestId('list-toolbar')).not.toBeInTheDocument();
    expect(queryTabGroup()).not.toBeInTheDocument();
  });

  it('lets listViewOptions.hideListBar=false win over the hideListBar prop', () => {
    renderListView({ hideListBar: true, listViewOptions: { hideListBar: false } });

    expect(screen.getByTestId('list-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('list-toolbar')).not.toHaveClass('border-b');
  });
});

// ─── Item 7 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — moved tabs stay functional', () => {
  beforeEach(() => useLayout(NARROW));

  // The highlight is exposed only as a class (no aria-pressed / aria-selected
  // on the tab buttons), so the active marker is asserted the same way the
  // existing interactions suite does.
  const ACTIVE_CLASS = 'bg-card';

  it('starts with the first subset active and no subset query', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(within(tabGroup()).getByTestId('filter-all')).toHaveClass(ACTIVE_CLASS);
    expect(within(tabGroup()).getByTestId('filter-open')).not.toHaveClass(ACTIVE_CLASS);
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('moves the highlight to the clicked tab', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS });

    await user.click(within(tabGroup()).getByTestId('filter-open'));

    expect(within(tabGroup()).getByTestId('filter-open')).toHaveClass(ACTIVE_CLASS);
    expect(within(tabGroup()).getByTestId('filter-all')).not.toHaveClass(ACTIVE_CLASS);
    expect(within(tabGroup()).getByTestId('filter-done')).not.toHaveClass(ACTIVE_CLASS);
  });

  it('changes the filter passed to the data hook on each tab click', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS });

    await user.click(within(tabGroup()).getByTestId('filter-open'));
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
    ]);

    await user.click(within(tabGroup()).getByTestId('filter-done'));
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'CO' },
    ]);

    // Back to the unfiltered subset: the query is dropped, not left stale.
    await user.click(within(tabGroup()).getByTestId('filter-all'));
    expect(capturedEntityOptions.baseFilter).toBeNull();
  });

  it('composes a moved tab with a quick filter', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS, quickFilters: QUICK_FILTERS });

    await user.click(within(tabGroup()).getByTestId('filter-open'));
    await user.click(within(filtersCluster()).getByTestId('quick-filter-mine'));

    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
      { fieldName: 'owner', operator: 'equals', value: 'me' },
    ]);
  });

  it('honours initialSubsetIndex for the highlighted tab', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, initialSubsetIndex: 2 });

    expect(within(tabGroup()).getByTestId('filter-done')).toHaveClass(ACTIVE_CLASS);
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'CO' },
    ]);
  });
});

// ─── Item 8 ─────────────────────────────────────────────────────────────────

describe('ListView toolbar layout — edge cases', () => {
  beforeEach(() => useLayout(NARROW));

  it('renders a single-entry subsetFilters as one active tab', () => {
    const only = [{ key: 'only', label: 'sfOnly', filter: encodeCriteria({ fieldName: 'kind', operator: 'equals', value: 'X' }) }];
    renderListView({ subsetFilters: only });

    expect(within(tabGroup()).getAllByRole('button')).toHaveLength(1);
    expect(within(tabGroup()).getByTestId('filter-only')).toHaveClass('bg-card');
    // Always one subset active: the single entry's filter applies from the start.
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'kind', operator: 'equals', value: 'X' },
    ]);
  });

  it('derives the tab test id from the lowercased label when an entry has no key', () => {
    renderListView({ subsetFilters: [{ label: 'Drafts', filter: null }, { key: 'open', label: 'sfOpen', filter: null }] });

    expect(within(tabGroup()).getByTestId('filter-drafts')).toBeInTheDocument();
    expect(within(filtersCluster()).queryByTestId('filter-drafts')).not.toBeInTheDocument();
  });

  it('keeps the tab group in place after switching to gallery view', async () => {
    const user = userEvent.setup();
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    const toggleButtons = within(screen.getByTestId('view-toggle')).getAllByRole('button');
    await user.click(toggleButtons[toggleButtons.length - 1]);

    expect(screen.getByTestId('gallery-view')).toBeInTheDocument();
    expect(within(tabGroup()).getByTestId('filter-all')).toBeInTheDocument();
    expect(filtersCluster()).toContainElement(screen.getByTestId('view-toggle'));
  });

  it('keeps the tab group when the rest of the main row is stripped down', () => {
    renderListView({
      subsetFilters: SUBSET_FILTERS,
      hideCreate: true,
      hideListFilters: true,
    });

    expect(within(mainRow()).queryByTestId('action-new')).not.toBeInTheDocument();
    expect(within(mainRow()).queryByTestId('list-filter-bar')).not.toBeInTheDocument();
    expect(within(tabGroup()).getByTestId('filter-all')).toBeInTheDocument();
  });
});

// ─── ETP-5509 acceptance: main actions stay in the first row ────────────────
// Sort, refresh, import/export, print, link and the primary "New …" button
// must NOT follow the subset tabs when they move. Every test renders WITH
// `subsetFilters` and the NARROW layout so the tabs are moved — otherwise "not in
// the tab group" would be trivially true. `ListSortPopover` and `ListExportButton` are the real
// components here (neither is mocked in this file).

describe('ListView toolbar layout — main row holds every main action', () => {
  beforeEach(() => useLayout(NARROW));

  const IMPORT_CONFIG = { enabled: true, spec: 'contacts', fields: [] };

  // Asserts the control sits in the actions cluster, never with the moved tabs.
  const expectOnlyInMainRow = (element) => {
    expect(actionsCluster()).toContainElement(element);
    expect(tabGroup()).not.toContainElement(element);
  };

  it('holds the sort trigger', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expectOnlyInMainRow(screen.getByTestId('list-sort-toggle'));
    expect(within(tabGroup()).queryByTestId('list-sort-toggle')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('list-sort-toggle')).toHaveLength(1);
  });

  it('holds the refresh button', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    // No dedicated test id: the button is identified by its `title`, which is
    // the `refresh` i18n key under the key-returning mock.
    expectOnlyInMainRow(screen.getByTitle('refresh'));
    expect(within(tabGroup()).queryByTitle('refresh')).not.toBeInTheDocument();
    expect(screen.getAllByTitle('refresh')).toHaveLength(1);
  });

  it('holds the import and export buttons when import is enabled', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, import: IMPORT_CONFIG });

    for (const testId of ['ListView__importButton', 'ListView__exportButton']) {
      expectOnlyInMainRow(screen.getByTestId(testId));
      expect(within(tabGroup()).queryByTestId(testId)).not.toBeInTheDocument();
      expect(screen.getAllByTestId(testId)).toHaveLength(1);
    }
  });

  it('renders neither import nor export without an enabled import config', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    const toolbar = screen.getByTestId('list-toolbar');
    expect(within(toolbar).queryByTestId('ListView__importButton')).not.toBeInTheDocument();
    expect(within(toolbar).queryByTestId('ListView__exportButton')).not.toBeInTheDocument();
  });

  it('holds the print button when print is not hidden', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    // No dedicated test id (generic `Button__620cbc`): located by role + name.
    expectOnlyInMainRow(within(mainRow()).getByRole('button', { name: 'print' }));
    expect(within(tabGroup()).queryByRole('button', { name: 'print' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'print' })).toHaveLength(1);
  });

  it('renders the idle print button icon-only (aria-label, no visible text, 40x40)', () => {
    renderListView();

    const print = within(mainRow()).getByRole('button', { name: 'print' });
    expect(print).toHaveAttribute('aria-label', 'print');
    expect(print).toHaveTextContent('');
    expect(print).toHaveClass('h-10');
    expect(print).toHaveClass('w-10');
  });

  it('drops the print button from the toolbar when hidePrint is set', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, hidePrint: true });

    expect(within(screen.getByTestId('list-toolbar')).queryByRole('button', { name: 'print' }))
      .not.toBeInTheDocument();
  });

  it('holds the link button when the link is not hidden', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    // The link button has no test id and no accessible name — the only hook is
    // its icon, so the button is reached through the icon's parent.
    const linkButton = screen.getByTestId('Link2__620cbc').closest('button');
    expect(linkButton).not.toBeNull();
    expectOnlyInMainRow(linkButton);
    expect(within(tabGroup()).queryByTestId('Link2__620cbc')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('Link2__620cbc')).toHaveLength(1);
  });

  it('drops the link button from the toolbar when hideLink is set', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, hideLink: true });

    expect(within(screen.getByTestId('list-toolbar')).queryByTestId('Link2__620cbc'))
      .not.toBeInTheDocument();
  });

  it('holds the split-button dropdown next to the create action when newActions are passed', () => {
    renderListView({
      subsetFilters: SUBSET_FILTERS,
      newActions: [{ key: 'fromTemplate', label: 'naFromTemplate', onClick: vi.fn() }],
    });

    const more = screen.getByTestId('action-new-more');
    expectOnlyInMainRow(more);
    expect(within(tabGroup()).queryByTestId('action-new-more')).not.toBeInTheDocument();
    // Same split button as the primary action, not a control of its own.
    expect(more.parentElement).toBe(screen.getByTestId('action-new').parentElement);
  });

  it('renders no split-button dropdown without newActions', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(screen.queryByTestId('action-new-more')).not.toBeInTheDocument();
    expect(within(mainRow()).getByTestId('action-new')).toBeInTheDocument();
  });

  it('splits the main row into the tab group, the filters cluster and the actions cluster', () => {
    renderListView({
      subsetFilters: SUBSET_FILTERS,
      quickFilters: QUICK_FILTERS,
      import: IMPORT_CONFIG,
    });

    expect(Array.from(mainRow().children)).toEqual([tabGroup(), filtersCluster(), actionsCluster()]);

    expect(within(filtersCluster()).getByTestId('list-filter-bar')).toBeInTheDocument();
    expect(within(filtersCluster()).getByTestId('quick-filter-overdue')).toBeInTheDocument();
    expect(within(filtersCluster()).queryByTestId('action-new')).not.toBeInTheDocument();

    const actions = actionsCluster();
    expect(within(actions).getByTestId('action-new')).toBeInTheDocument();
    expect(within(actions).queryByTestId('list-filter-bar')).not.toBeInTheDocument();
    // Every main action shares the right-hand cluster with the create button.
    expect(within(actions).getByTestId('list-sort-toggle')).toBeInTheDocument();
    expect(within(actions).getByTitle('refresh')).toBeInTheDocument();
    expect(within(actions).getByTestId('ListView__importButton')).toBeInTheDocument();
    expect(within(actions).getByTestId('ListView__exportButton')).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'print' })).toBeInTheDocument();
    expect(within(actions).getByTestId('Link2__620cbc')).toBeInTheDocument();
  });

  it('flows the filter bar controls into the filters cluster (flowInParent)', () => {
    capturedFilterBarProps = null;
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(capturedFilterBarProps).toMatchObject({ flowInParent: true });
  });

  // The 16px minimum between filters and actions is the row's 8px gap plus the
  // actions' 8px margin — the classes ARE the behaviour (jsdom has no layout).
  it('keeps a minimum gap of a row gap plus a margin between the filters and the actions', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS });

    expect(mainRow()).toHaveClass('gap-2');
    expect(actionsCluster()).toHaveClass('ml-2', 'shrink-0');
  });

  it('keeps two clusters on a toolbar without subset tabs', () => {
    renderListView();

    expect(Array.from(mainRow().children)).toEqual([filtersCluster(), actionsCluster()]);
    expect(within(filtersCluster()).getByTestId('list-filter-bar')).toBeInTheDocument();
    expect(within(actionsCluster()).getByTestId('action-new')).toBeInTheDocument();
  });
});

// ─── ETP-5509 review: one row when everything fits ──────────────────────────
// UX contract: the toolbar is a single row (tabs + quick filters + actions);
// the tabs move to a line of their own ONLY when they do not fit.

describe('ListView toolbar layout — subset tabs share the row while they fit', () => {
  it('opens the row with the tab group, before the filters, when it fits', () => {
    useLayout(WIDE);
    renderListView({ subsetFilters: SUBSET_FILTERS, quickFilters: QUICK_FILTERS });

    expect(placement()).toBe('inline');
    expect(mainRow().firstElementChild).toBe(tabGroup());
    expect(tabGroup()).not.toHaveClass('order-last');
    expect(screen.getByTestId('list-toolbar').children).toHaveLength(1);
  });

  it('counts the filters cluster controls in the fit', () => {
    // tabs 300 + actions 400 fit a 1000 row; a 400px filter control does not.
    const BASE_FIT = { 'list-toolbar-main-row': 1000, 'list-toolbar-tabs': 300, 'list-toolbar-actions': 400 };
    useLayout(BASE_FIT);
    const { unmount } = renderListView({ subsetFilters: SUBSET_FILTERS });
    expect(placement()).toBe('inline');
    unmount();

    useLayout({ ...BASE_FIT, 'list-filter-bar': 400 });
    renderListView({ subsetFilters: SUBSET_FILTERS });
    expect(placement()).toBe('wrapped');
  });

  it('defaults to inline when there is no layout to measure', () => {
    renderListView({ subsetFilters: SUBSET_FILTERS, galleryRenderer });

    expect(placement()).toBe('inline');
    expect(tabGroup()).not.toHaveClass('order-last');
  });

  it('switches tabs while inline', async () => {
    const user = userEvent.setup();
    useLayout(WIDE);
    renderListView({ subsetFilters: SUBSET_FILTERS });

    await user.click(within(tabGroup()).getByTestId('filter-open'));

    expect(within(tabGroup()).getByTestId('filter-open')).toHaveClass('bg-card');
    expect(criteriaOf(capturedEntityOptions.baseFilter)).toEqual([
      { fieldName: 'status', operator: 'equals', value: 'DR' },
    ]);
  });
});

describe('ListView toolbar layout — the fit is re-measured on resize', () => {
  let observers;

  beforeEach(() => {
    observers = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Fires every live observer and waits for the frame the hook defers to.
  const resizeTo = async (widths) => {
    useLayout(widths);
    await act(async () => {
      observers.forEach((o) => o.callback([]));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  };

  it('moves the tabs when the toolbar narrows and brings them back when it widens', async () => {
    useLayout(WIDE);
    renderListView({ subsetFilters: SUBSET_FILTERS });
    expect(placement()).toBe('inline');

    await resizeTo(NARROW);
    expect(placement()).toBe('wrapped');
    expect(tabGroup()).toHaveClass('order-last');

    await resizeTo(WIDE);
    expect(placement()).toBe('inline');
  });

  it('moves the same element, so a focused tab keeps its focus', async () => {
    useLayout(WIDE);
    renderListView({ subsetFilters: SUBSET_FILTERS });
    const tab = screen.getByTestId('filter-open');
    tab.focus();

    await resizeTo(NARROW);

    expect(screen.getByTestId('filter-open')).toBe(tab);
    expect(tab).toHaveFocus();
  });

  it('does not bring wrapped tabs back while they fit only within the hysteresis margin', async () => {
    // tabs 300 + actions 400 = 700 required: 704 is enough to stay inline but
    // not enough to come back from the second line (needs 700 + 8).
    const EDGE = { ...NARROW, 'list-toolbar-main-row': 704 };
    useLayout(NARROW);
    renderListView({ subsetFilters: SUBSET_FILTERS });
    expect(placement()).toBe('wrapped');

    await resizeTo(EDGE);
    expect(placement()).toBe('wrapped');
  });
});
