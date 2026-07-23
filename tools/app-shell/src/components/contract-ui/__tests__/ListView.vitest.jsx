import { render, screen, fireEvent } from '@testing-library/react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => field ? null : key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock useEntity hook
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
    items: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    sortColumn: 'creationDate',
    sortDirection: 'desc',
    setSortColumn: vi.fn(),
    setSortDirection: vi.fn(),
  }),
}));

// Mock layout context hooks
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

// Mock sub-components
vi.mock('../ReportDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));
let capturedFilterBarColumns = null;
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: ({ columns }) => {
    capturedFilterBarColumns = columns;
    return <div data-testid="list-filter-bar" />;
  },
}));
vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: () => null,
}));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

// A minimal Table component mock that renders rows
function MockTable({ data, onNavigate, ...rest }) {
  return (
    <table data-testid="mock-table">
      <tbody>
        {data.map((row, i) => (
          <tr key={row.id ?? i} onClick={() => onNavigate?.(row)}>
            <td>{row.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A Table mock variant that lets the test drive the selection state by
// invoking the forwarded `onSelectionChange` prop. The original MockTable
// never calls it, so the selection toolbar branch stays unexercised there.
function SelectableMockTable({ data, onSelectionChange, ...rest }) {
  return (
    <table data-testid="mock-table">
      <tbody>
        <tr>
          <td>
            <button
              data-testid="trigger-select"
              onClick={() => onSelectionChange?.(data.length ? data : [{ id: 'r1' }])}
            >
              select-all
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// A Table mock that captures the forwarded rowQuickActions prop so the test
// can assert what ListView derived (e.g. the readOnly flag from api.window).
let capturedRowQuickActions = null;
function CapturingMockTable({ rowQuickActions }) {
  capturedRowQuickActions = rowQuickActions;
  return <table data-testid="mock-table"><tbody /></table>;
}

describe('ListView', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: MockTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
  };

  it('renders without crashing with minimal props', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.getByTestId('list-view')).toBeInTheDocument();
  });

  it('renders the new record button by default', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.getByTestId('action-new')).toBeInTheDocument();
    expect(screen.getByText('newRecord')).toBeInTheDocument();
  });

  it('hides the new record button when hideCreate is true', () => {
    render(<ListView {...defaultProps} hideCreate={true} />);
    expect(screen.queryByTestId('action-new')).not.toBeInTheDocument();
  });

  it('renders the table component', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  it('renders the filter bar by default', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.getByTestId('list-filter-bar')).toBeInTheDocument();
  });

  it('hides the filter bar when hideListFilters is true', () => {
    render(<ListView {...defaultProps} hideListFilters={true} />);
    expect(screen.queryByTestId('list-filter-bar')).not.toBeInTheDocument();
  });

  it('renders subset filter buttons when subsetFilters are provided', () => {
    const subsetFilters = [
      { label: 'filterAll', filter: null },
      { label: 'filterOpen', filter: 'status=DR' },
    ];
    render(<ListView {...defaultProps} subsetFilters={subsetFilters} />);
    expect(screen.getByText('filterAll')).toBeInTheDocument();
    expect(screen.getByText('filterOpen')).toBeInTheDocument();
  });

  it('renders quick filter buttons when quickFilters are provided', () => {
    const quickFilters = [
      { label: 'overdueFilter', filter: 'overdue=true' },
    ];
    render(<ListView {...defaultProps} quickFilters={quickFilters} />);
    expect(screen.getByText('overdueFilter')).toBeInTheDocument();
  });

  it('renders the selection toolbar (preview/print) when rows are selected — exercises iconSizeClass', () => {
    render(<ListView {...defaultProps} Table={SelectableMockTable} />);

    // Before selection, the selection-specific toolbar must not be present:
    // the "preview" button and the "selected {count}" label belong only to the
    // selection branch (the standalone report-print button is always present).
    expect(screen.queryByText('preview')).not.toBeInTheDocument();
    expect(screen.queryByText('selected')).not.toBeInTheDocument();

    // Drive selectedRows to be non-empty by invoking the forwarded
    // onSelectionChange prop, which switches ListView into the selection branch.
    fireEvent.click(screen.getByTestId('trigger-select'));

    // Preview + print buttons render — these contain the <Eye>/<Printer> icons
    // whose className comes from iconSizeClass(selectionBarSize).
    const previewBtn = screen.getByText('preview').closest('button');
    expect(previewBtn).toBeInTheDocument();

    // Default selectionBarSize is 'sm', so iconSizeClass returns 'h-3.5 w-3.5'
    // for the <Eye> (preview) icon in the selection bar.
    expect(previewBtn.querySelector('svg.lucide-eye')).toBeInTheDocument();
    expect(previewBtn.querySelector('.h-3\\.5.w-3\\.5')).toBeInTheDocument();

    // The selection-bar print button (<Printer> icon) is also present and sized
    // by iconSizeClass.
    const printIcon = document.querySelector('button svg.lucide-printer.h-3\\.5.w-3\\.5');
    expect(printIcon).toBeInTheDocument();
  });

  it('renders the clone button in the selection toolbar when onCloneRow is provided', () => {
    const onCloneRow = vi.fn();
    render(<ListView {...defaultProps} Table={SelectableMockTable} onCloneRow={onCloneRow} />);

    fireEvent.click(screen.getByTestId('trigger-select'));

    // Clone button only shows when onCloneRow is passed (uses the <Copy> icon
    // sized by iconSizeClass).
    const cloneBtn = screen.getByText(/^cloneOrderBtn/).closest('button');
    expect(cloneBtn).toBeInTheDocument();
    expect(cloneBtn.querySelector('.h-3\\.5.w-3\\.5')).toBeInTheDocument();
  });

  it('applies the larger icon size in the selection toolbar when selectionBarSize is not "sm"', () => {
    render(<ListView {...defaultProps} Table={SelectableMockTable} selectionBarSize="default" />);

    fireEvent.click(screen.getByTestId('trigger-select'));

    // selectionBarSize !== 'sm' → iconSizeClass returns 'h-4 w-4'.
    const previewBtn = screen.getByText('preview').closest('button');
    expect(previewBtn.querySelector('.h-4.w-4')).toBeInTheDocument();
    expect(previewBtn.querySelector('.h-3\\.5.w-3\\.5')).not.toBeInTheDocument();
  });

  it('renders both view-toggle buttons when galleryRenderer is provided — exercises ViewToggle true branch', () => {
    const galleryRenderer = () => <div data-testid="gallery" />;
    render(<ListView {...defaultProps} galleryRenderer={galleryRenderer} />);

    // ViewToggle wraps the two toggle buttons and is identified by data-testid.
    // It only renders when galleryRenderer is truthy.
    const toggleWrapper = screen.getByTestId('view-toggle');
    expect(toggleWrapper).toBeInTheDocument();

    // Two toggle buttons: list and gallery.
    const buttons = toggleWrapper.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
  });

  it('does not render the view-toggle when galleryRenderer is absent — ViewToggle false branch', () => {
    const { container } = render(<ListView {...defaultProps} />);
    const toggleWrapper = container.querySelector('.inline-flex.border.border-border.rounded-lg.overflow-hidden');
    expect(toggleWrapper).not.toBeInTheDocument();
  });

  // ── window.readOnly propagation (windowReadOnly true branch) ───────────────
  describe('window.readOnly', () => {
    beforeEach(() => { capturedRowQuickActions = null; });

    it('marks rowQuickActions readOnly and drops the write handlers when api.window.readOnly is true', () => {
      render(
        <ListView
          {...defaultProps}
          Table={CapturingMockTable}
          api={{ window: { readOnly: true }, crud: {} }}
          rowQuickActions={{}}
        />,
      );
      expect(capturedRowQuickActions.readOnly).toBe(true);
      // windowReadOnly branch leaves the default onEdit/onDelete unwired.
      expect(capturedRowQuickActions.onEdit).toBeUndefined();
      expect(capturedRowQuickActions.onDelete).toBeUndefined();
    });

    it('keeps readOnly false and wires default handlers when api.window.readOnly is absent (regression)', () => {
      render(
        <ListView
          {...defaultProps}
          Table={CapturingMockTable}
          api={{ crud: {} }}
          rowQuickActions={{}}
        />,
      );
      expect(capturedRowQuickActions.readOnly).toBe(false);
      expect(typeof capturedRowQuickActions.onEdit).toBe('function');
      expect(typeof capturedRowQuickActions.onDelete).toBe('function');
      // Invoke the default onEdit arrow so its body (navigate to detail) runs.
      // navigate is mocked (useNavigate → vi.fn()), so this is a no-op call.
      expect(() => capturedRowQuickActions.onEdit({ id: 'r1' })).not.toThrow();
      // A row without an id must not navigate (row?.id short-circuit).
      expect(() => capturedRowQuickActions.onEdit({})).not.toThrow();
    });
  });

  // ── expandMultiFieldColumns: filter-bar column expansion ───────────────
  describe('multiField column expansion for the advanced filter', () => {
    beforeEach(() => { capturedFilterBarColumns = null; });

    const MF_COLUMNS = [
      {
        key: 'name',
        type: 'multiField',
        title: 'name',
        subtitle: 'searchKey',
        parts: [
          { key: 'searchKey', type: 'string', label: 'Identifier' },
          { key: 'name', type: 'string', label: 'Name' },
        ],
      },
      { key: 'status', type: 'status', label: 'Status' },
    ];

    it('expands a multiField column into one filter field per part, dropping the parent', () => {
      render(<ListView {...defaultProps} initialColumns={MF_COLUMNS} />);
      const keys = capturedFilterBarColumns.map((c) => c.key);
      expect(keys).toEqual(['searchKey', 'name', 'status']);
      // The parent multiField column itself must not appear.
      expect(capturedFilterBarColumns.some((c) => c.type === 'multiField')).toBe(false);
    });

    it('resolves the label from the part definition, not the AD column label', () => {
      render(<ListView {...defaultProps} initialColumns={MF_COLUMNS} />);
      const searchKeyField = capturedFilterBarColumns.find((c) => c.key === 'searchKey');
      const nameField = capturedFilterBarColumns.find((c) => c.key === 'name');
      expect(searchKeyField.label).toBe('Identifier');
      expect(nameField.label).toBe('Name');
    });

    it('omits parts marked filterable: false', () => {
      const cols = [
        {
          ...MF_COLUMNS[0],
          parts: [
            { key: 'searchKey', type: 'string', label: 'Identifier', filterable: false },
            { key: 'name', type: 'string', label: 'Name' },
          ],
        },
      ];
      render(<ListView {...defaultProps} initialColumns={cols} />);
      const keys = capturedFilterBarColumns.map((c) => c.key);
      expect(keys).toEqual(['name']);
    });

    it('leaves non-multiField columns unchanged', () => {
      render(<ListView {...defaultProps} initialColumns={[{ key: 'status', type: 'status', label: 'Status' }]} />);
      expect(capturedFilterBarColumns).toEqual([{ key: 'status', type: 'status', label: 'Status' }]);
    });
  });
});
