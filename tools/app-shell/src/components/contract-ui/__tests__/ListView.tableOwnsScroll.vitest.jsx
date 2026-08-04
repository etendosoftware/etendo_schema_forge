/**
 * ListView — `tableOwnsScroll` / `ListTableRegion`'s `ownScroll` branch (ETP-4658).
 *
 * Extracted out of ListView into a module-level `ListTableRegion` component (to clear a
 * SonarQube duplicated-block finding on the `<Table>` props, which used to be written out
 * once per wrapper). Nothing in the suite mounted ListView with this flag set, so the whole
 * branch — the bounded flex box instead of ScrollPane, `loading` forwarded straight to the
 * Table instead of the skeleton fallback, `onReachBottom` never wired — had zero coverage.
 *
 * A custom `headerTable` that pins its own toolbar/sidebar and scrolls only its rows (e.g.
 * financial-account's AccountsHeaderTable) sets this so ListView doesn't wrap it in a SECOND,
 * outer ScrollPane.
 *
 * Also covers the gallery-view branch inside the same extracted region (the ternary right
 * next to the ownScroll one), which had the same zero-coverage gap for the same reason.
 */
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/account', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

let hookState = {};
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
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
    ...hookState,
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));
vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

let tableProps = null;
function MockTable(props) {
  tableProps = props;
  return <table data-testid="mock-table"><tbody /></table>;
}

const defaultProps = {
  entity: 'account',
  Table: MockTable,
  entityLabel: 'Account',
  windowName: 'financial-account',
  token: 'fake-token',
  apiBaseUrl: 'http://localhost/api',
};

beforeEach(() => {
  hookState = {};
  tableProps = null;
});

describe('ListView — tableOwnsScroll', () => {
  it('renders the Table inside the bounded flex region, not a ScrollPane', () => {
    render(<ListView {...defaultProps} tableOwnsScroll />);

    expect(screen.getByTestId('list-table-region')).toBeInTheDocument();
    expect(screen.queryByTestId('ScrollPane__620cbc')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  it('forwards hook.loading straight to the Table (no skeleton fallback in this mode)', () => {
    hookState = { loading: true };

    render(<ListView {...defaultProps} tableOwnsScroll />);

    expect(tableProps.loading).toBe(true);
  });

  it('still forwards data and meta to the Table in this mode', () => {
    hookState = { items: [{ id: 'acc-1' }], meta: { summary: { totalBalance: 1 } } };

    render(<ListView {...defaultProps} tableOwnsScroll />);

    expect(tableProps.data).toEqual([{ id: 'acc-1' }]);
    expect(tableProps.meta).toEqual({ summary: { totalBalance: 1 } });
  });

  it('is also settable through listViewOptions.tableOwnsScroll (the generated-page path)', () => {
    render(<ListView {...defaultProps} listViewOptions={{ tableOwnsScroll: true }} />);

    expect(screen.getByTestId('list-table-region')).toBeInTheDocument();
    expect(screen.queryByTestId('ScrollPane__620cbc')).not.toBeInTheDocument();
  });

  it('falls back to the default ScrollPane wrapper when the flag is absent', () => {
    render(<ListView {...defaultProps} />);

    expect(screen.queryByTestId('list-table-region')).not.toBeInTheDocument();
    expect(screen.getByTestId('ScrollPane__620cbc')).toBeInTheDocument();
  });
});

describe('ListView — gallery view mode (default ScrollPane wrapper only)', () => {
  // viewMode is internal state seeded from localStorage; the gallery branch only
  // engages with both a persisted 'gallery' choice AND a galleryRenderer prop.
  it('renders the gallery instead of the Table when viewMode is gallery', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(
      (key) => (key === 'viewMode:account' ? 'gallery' : null)
    );
    const galleryRenderer = ({ data }) => <div data-testid="gallery-view">{data.length} items</div>;
    hookState = { items: [{ id: 'acc-1' }, { id: 'acc-2' }] };

    render(<ListView {...defaultProps} galleryRenderer={galleryRenderer} />);

    expect(screen.getByTestId('gallery-view')).toHaveTextContent('2 items');
    expect(screen.queryByTestId('mock-table')).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
