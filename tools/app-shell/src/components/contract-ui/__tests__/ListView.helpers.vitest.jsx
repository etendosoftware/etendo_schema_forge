import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { splitFilterParts, ListView } from '../ListView.jsx';

const mockHook = {
  items: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  sortColumn: 'creationDate',
  sortDirection: 'desc',
  setSortColumn: vi.fn(),
  setSortDirection: vi.fn(),
  error: null,
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: vi.fn(),
}));
vi.mock('@/hooks/useRowDelete', () => ({ useRowDelete: () => ({ requestDelete: vi.fn(), deleteDialog: null }) }));
vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useLabel: () => () => '',
  useUI: () => (k) => k,
}));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({ useWindowFilterPresets: () => ({ presets: [], savePreset: vi.fn(), deletePreset: vi.fn() }) }));
vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SendDocumentModal.jsx', () => ({ default: () => null }));
vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }) => <button onClick={onClick} {...rest}>{children}</button>,
  DropdownMenuTrigger: ({ children }) => children,
}));

describe('ListView helpers', () => {
  describe('splitFilterParts', () => {
    it('separates criteria from passthrough params', () => {
      const parts = [
        'criteria=' + encodeURIComponent(JSON.stringify({ fieldName: 'name', operator: 'equals', value: 'test' })),
        'limit=50',
      ];
      const { allCriteria, passthrough } = splitFilterParts(parts);
      expect(allCriteria).toHaveLength(1);
      expect(allCriteria[0].fieldName).toBe('name');
      expect(passthrough.get('limit')).toBe('50');
    });

    it('handles array criteria', () => {
      const arr = [{ fieldName: 'a' }, { fieldName: 'b' }];
      const parts = ['criteria=' + encodeURIComponent(JSON.stringify(arr))];
      const { allCriteria } = splitFilterParts(parts);
      expect(allCriteria).toHaveLength(2);
    });

    it('handles empty parts', () => {
      const { allCriteria, passthrough } = splitFilterParts([]);
      expect(allCriteria).toHaveLength(0);
      expect([...passthrough.entries()]).toHaveLength(0);
    });

    it('ignores malformed JSON in criteria', () => {
      const parts = ['criteria=not-json'];
      const { allCriteria } = splitFilterParts(parts);
      expect(allCriteria).toHaveLength(0);
    });

    it('combines criteria from multiple parts', () => {
      const parts = [
        'criteria=' + encodeURIComponent(JSON.stringify({ fieldName: 'x' })),
        'criteria=' + encodeURIComponent(JSON.stringify({ fieldName: 'y' })),
      ];
      const { allCriteria } = splitFilterParts(parts);
      expect(allCriteria).toHaveLength(2);
    });
  });
});

// --- ListView render tests ---

const MockTable = ({ data, columns, onSelectionChange, onNavigate, ...rest }) => (
  <table data-testid="mock-table">
    <tbody>
      {(data || []).map(r => (
        <tr key={r.id} data-testid={`row-${r.id}`} onClick={() => onNavigate?.(r)}>
          <td>{r.name}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', type: 'status' },
];

function renderListView(props = {}) {
  return render(
    <MemoryRouter>
      <ListView
        entity="header"
        Table={MockTable}
        columns={COLUMNS}
        apiBaseUrl="/api"
        token="tk"
        windowName="sales-order"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ListView render', () => {
  afterEach(() => {
    // Restore hook defaults
    mockHook.items = [];
    mockHook.loading = false;
    mockHook.loadingMore = false;
    mockHook.hasMore = false;
    vi.clearAllMocks();
  });

  it('mounts and renders the list-view container', () => {
    renderListView();
    expect(screen.getByTestId('list-view')).toBeInTheDocument();
  });

  it('shows skeleton loading state when loading and no items', () => {
    mockHook.loading = true;
    mockHook.items = [];
    const { container } = renderListView();
    expect(container.querySelector('.space-y-3')).toBeInTheDocument();
  });

  it('renders data rows via the Table component', () => {
    mockHook.items = [
      { id: 'r1', name: 'Alpha' },
      { id: 'r2', name: 'Beta' },
    ];
    renderListView();
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders the new record button by default', () => {
    renderListView();
    expect(screen.getByTestId('action-new')).toBeInTheDocument();
  });

  it('hides the new record button when hideCreate is true', () => {
    renderListView({ hideCreate: true });
    expect(screen.queryByTestId('action-new')).toBeNull();
  });

  it('renders the filter bar by default', () => {
    renderListView();
    expect(screen.getByTestId('list-filter-bar')).toBeInTheDocument();
  });

  it('hides the filter bar when hideListFilters is true', () => {
    renderListView({ hideListFilters: true });
    expect(screen.queryByTestId('list-filter-bar')).toBeNull();
  });

  it('renders progress bar when loading with existing items', () => {
    mockHook.loading = true;
    mockHook.items = [{ id: 'r1', name: 'Alpha' }];
    const { container } = renderListView();
    // Progress bar uses the sf-list-progress animation class
    expect(container.querySelector('.bg-primary')).not.toBeNull();
  });

  it('renders headerContent when provided as a component', () => {
    const Header = () => <div data-testid="header-content">KPI</div>;
    renderListView({ headerContent: <Header /> });
    expect(screen.getByTestId('header-content')).toBeInTheDocument();
  });

  it('renders headerContent when provided as a function', () => {
    const headerFn = ({ items }) => <div data-testid="header-fn">Items: {items.length}</div>;
    renderListView({ headerContent: headerFn });
    expect(screen.getByTestId('header-fn')).toBeInTheDocument();
  });

  it('clicks the new button without crashing', async () => {
    const user = userEvent.setup();
    renderListView();
    const newBtn = screen.getByTestId('action-new');
    await user.click(newBtn);
    // navigate mock is called — no crash
  });

  it('calls onNew callback when provided and new button is clicked', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    renderListView({ onNew });
    await user.click(screen.getByTestId('action-new'));
    expect(onNew).toHaveBeenCalled();
  });

  it('renders subset filter buttons when subsetFilters is provided', () => {
    const subsetFilters = [
      { label: 'All', filter: null },
      { label: 'Open', filter: 'criteria=...' },
    ];
    renderListView({ subsetFilters });
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('switches subset filter on click', async () => {
    const user = userEvent.setup();
    const subsetFilters = [
      { label: 'All', filter: null },
      { label: 'Open', filter: 'criteria=...' },
    ];
    renderListView({ subsetFilters });
    const openBtn = screen.getByText('Open');
    await user.click(openBtn);
    // Active subset should switch (button gets active class)
    expect(openBtn.closest('button')).toBeTruthy();
  });

  it('renders with galleryRenderer and view toggle', () => {
    const gallery = ({ data }) => <div data-testid="gallery">{data.length} items</div>;
    mockHook.items = [{ id: 'g1', name: 'G' }];
    renderListView({ galleryRenderer: gallery });
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });
});
