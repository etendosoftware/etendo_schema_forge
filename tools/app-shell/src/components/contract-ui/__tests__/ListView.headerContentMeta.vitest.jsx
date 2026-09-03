/**
 * ListView — `meta` forwarded to a functional `headerContent` (ETP-4658 Fase 0).
 *
 * `useEntity` now exposes `meta`: everything the list response carried next to the rows
 * (`totalRows`, and notably backend aggregates like the accounts list's `summary`). ListView
 * threads it into the `headerContent({ … })` render prop so a window can render
 * collection-level widgets from the same fetch that filled the grid — no second request.
 *
 * A non-functional `headerContent` (plain node) is rendered as-is and never receives it.
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

// Drives the `meta` (and `items` / `loading`) the hook hands to ListView per test.
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
import { useSetPageMeta } from '@/components/layout/PageMetaContext';

const SUMMARY = {
  totalBalance: 273853.46,
  byCurrency: [{ currencyIso: 'EUR', total: 273853.46 }],
};

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

let headerArgs = null;
const headerRenderer = (args) => {
  headerArgs = args;
  return <div data-testid="header-slot" />;
};

beforeEach(() => {
  hookState = {};
  headerArgs = null;
  tableProps = null;
  useSetPageMeta.mockClear();
});

describe('ListView — headerContent({ meta })', () => {
  it('passes the hook meta to a functional headerContent', () => {
    hookState = { meta: { totalRows: 4, summary: SUMMARY } };

    render(<ListView {...defaultProps} headerContent={headerRenderer} />);

    expect(screen.getByTestId('header-slot')).toBeInTheDocument();
    expect(headerArgs.meta).toEqual({ totalRows: 4, summary: SUMMARY });
  });

  it('passes null through when the response carried no siblings', () => {
    hookState = { meta: null };

    render(<ListView {...defaultProps} headerContent={headerRenderer} />);

    expect(headerArgs.meta).toBeNull();
  });

  it('keeps handing over the pre-existing slot arguments alongside meta', () => {
    hookState = { meta: { summary: SUMMARY }, items: [{ id: 'acc-1' }], loading: true };
    const api = { specName: 'financial-account-detail' };

    render(<ListView {...defaultProps} api={api} headerContent={headerRenderer} />);

    expect(headerArgs.api).toBe(api);
    expect(headerArgs.token).toBe('fake-token');
    expect(headerArgs.apiBaseUrl).toBe('http://localhost/api');
    expect(headerArgs.items).toEqual([{ id: 'acc-1' }]);
    expect(headerArgs.loading).toBe(true);
  });

  it('renders a non-functional headerContent as-is (no arguments involved)', () => {
    hookState = { meta: { summary: SUMMARY } };

    render(<ListView {...defaultProps} headerContent={<span data-testid="static-header" />} />);

    expect(screen.getByTestId('static-header')).toBeInTheDocument();
    expect(headerArgs).toBeNull();
  });

  it('renders no header wrapper at all when headerContent is omitted', () => {
    hookState = { meta: { summary: SUMMARY } };

    render(<ListView {...defaultProps} />);

    expect(screen.queryByTestId('header-slot')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });
});

describe('ListView — meta and the Table slot', () => {
  // `window.customComponents.headerTable` is generated as ListView's `Table` prop, NOT as
  // `headerContent`, so a custom headerTable that renders its own aggregate panel (the
  // financial-account balance sidebar, which reads `meta?.summary`) lives INSIDE the Table
  // slot and cannot read the envelope from `headerContent`. Passing meta only to
  // `headerContent` left that sidebar showing zeroes; both slots get it now. End-to-end
  // coverage: `e2e/tests/flows/financial-accounts-page.mocked.spec.js`.
  it('forwards meta to the Table slot', () => {
    hookState = { meta: { summary: SUMMARY } };

    render(<ListView {...defaultProps} />);

    expect(tableProps.meta).toEqual({ summary: SUMMARY });
  });

  it('hands the Table slot a null meta when the response carried no siblings', () => {
    hookState = { meta: null };

    render(<ListView {...defaultProps} />);

    expect(tableProps.meta).toBeNull();
  });

  it('still hands the Table slot the rows and the mutation callback', () => {
    hookState = { meta: { summary: SUMMARY }, items: [{ id: 'acc-1' }] };

    render(<ListView {...defaultProps} />);

    expect(tableProps.data).toEqual([{ id: 'acc-1' }]);
    expect(typeof tableProps.onDataMutated).toBe('function');
  });
});

// ETP-5101 §1.3 — `window.hideRecordCount` hides the record-count badge next to the
// window title for tree-view windows (e.g. chart-of-accounts) where the flat list
// item count is meaningless.
describe('ListView — recordCount (hideRecordCount)', () => {
  it('passes hook.items.length as recordCount when hideRecordCount is not set (default false)', () => {
    hookState = { items: [{ id: '1' }, { id: '2' }, { id: '3' }] };

    render(<ListView {...defaultProps} />);

    const lastCall = useSetPageMeta.mock.calls.at(-1);
    expect(lastCall[0]).toMatchObject({ recordCount: 3 });
  });

  it('passes recordCount: undefined when hideRecordCount is true, regardless of item count', () => {
    hookState = { items: [{ id: '1' }, { id: '2' }, { id: '3' }] };

    render(<ListView {...defaultProps} hideRecordCount />);

    const lastCall = useSetPageMeta.mock.calls.at(-1);
    expect(lastCall[0]).toMatchObject({ recordCount: undefined });
  });
});
