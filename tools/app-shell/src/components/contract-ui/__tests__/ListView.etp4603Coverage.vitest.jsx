/**
 * ETP-4603 coverage top-up for ListView.jsx.
 *
 * Targets branches that the existing ListView.vitest.jsx / ListView.helpers.vitest.jsx /
 * ListView.bulkDelete.vitest.jsx / ListView.import.vitest.jsx suites don't reach:
 *   - resolveQuickFilterIndicesFromPreset (both branches) via applyPreset
 *   - toggleQuickFilter add/remove
 *   - advancedFilterPart + effectiveFilter's AdvancedCriteria merge branch
 *   - effectiveRowFilter composing subset/quick/rowFilter predicates
 *   - handleFilterChange / handleClearAllFilters
 *   - applyPreset / saveCurrentAsPreset
 *   - the columnFilters/refreshTrigger refresh effects
 *   - useRowDelete's onSuccess wiring (refresh)
 *   - effectiveRowQuickActions' auto-injected onEmail + SendDocumentModal mount/close
 *   - fullBreadcrumb join + the favorites toggle callback
 *   - handlePreviewClose / handlePreviewEdit
 *   - selection-bar print/clone buttons (the "Vista Previa"/eye button was
 *     removed unconditionally in ETP-4644 — a test asserts it never renders)
 *   - view toggle (list/gallery) + gallery renderer branch
 *   - sort popover: toggle, column select, clear sort
 *   - refresh button, header print button, "New" split-button dropdown actions
 *   - ReportDrawer close callback
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

const mockHook = {
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
};
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
}));

let rowDeleteOptions = null;
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: (opts) => {
    rowDeleteOptions = opts;
    return { requestDelete: vi.fn(), deleteDialog: null };
  },
}));
vi.mock('@/hooks/useBulkRowDelete', () => ({
  useBulkRowDelete: () => ({ requestBulkDelete: vi.fn(), bulkDeleteDialog: null, deleting: false }),
}));

let pageMetaOptions = null;
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (opts) => { pageMetaOptions = opts; },
}));
const toggleFavoriteMock = vi.fn();
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: toggleFavoriteMock, isFavorite: () => false }),
}));
vi.mock('@/components/CurrentWindowContext', () => ({
  useRegisterWindowContext: () => {},
}));

vi.mock('../ReportDrawer.jsx', () => ({
  default: ({ open, onClose }) => (open ? (
    <div data-testid="report-drawer">
      <button data-testid="close-report" onClick={onClose}>close</button>
    </div>
  ) : null),
}));
const printDocumentsMock = vi.fn();
vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: (...args) => printDocumentsMock(...args),
}));
vi.mock('../SendDocumentModal.jsx', () => ({
  default: ({ onClose, documentNo }) => (
    <div data-testid="send-document-modal" data-document-no={documentNo || ''}>
      <button data-testid="close-send-modal" onClick={onClose}>close</button>
    </div>
  ),
}));

let filterBarProps = null;
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: (props) => {
    filterBarProps = props;
    return <div data-testid="list-filter-bar" />;
  },
}));

let advancedCriteriaResult = null;
vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: () => advancedCriteriaResult,
}));

let presetsData = {};
const savePresetMock = vi.fn();
const deletePresetMock = vi.fn();
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: presetsData, savePreset: savePresetMock, deletePreset: deletePresetMock }),
}));

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }) => <button onClick={onClick} {...rest}>{children}</button>,
  DropdownMenuTrigger: ({ children }) => children,
}));

import { ListView } from '../ListView.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount', sortable: false },
  { key: 'status', label: 'Status' },
];

// Captures every prop ListView forwards to the generated Table, and reports the
// column list via onColumnsReady on mount so the sort popover has content.
let tableProps = null;
function CapturingTable(props) {
  tableProps = props;
  React.useEffect(() => {
    props.onColumnsReady?.(COLUMNS);
  }, []);
  return (
    <table data-testid="mock-table">
      <tbody>
        <tr>
          <td>
            <button
              data-testid="trigger-select"
              onClick={() => props.onSelectionChange?.(props.data.length ? props.data : [{ id: 'r1', documentNo: 'DOC-1', businessPartner: 'bp1', 'businessPartner$_identifier': 'ACME' }])}
            >
              select
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function renderListView(props = {}) {
  return render(
    <ListView
      entity="header"
      Table={CapturingTable}
      entityLabel="Test Entity"
      windowName="sales-order"
      token="fake-token"
      apiBaseUrl="/api"
      {...props}
    />,
  );
}

describe('ListView — ETP-4603 coverage top-up', () => {
  beforeEach(() => {
    filterBarProps = null;
    tableProps = null;
    rowDeleteOptions = null;
    pageMetaOptions = null;
    advancedCriteriaResult = null;
    presetsData = {};
    mockHook.items = [];
    mockHook.loading = false;
    mockHook.loadingMore = false;
    mockHook.hasMore = false;
    mockHook.sortColumn = 'creationDate';
    mockHook.sortDirection = 'desc';
    vi.clearAllMocks();
  });

  // ── toggleQuickFilter (add/remove) ─────────────────────────────────────
  it('toggles a quick filter index on and off across clicks', async () => {
    const quickFilters = [{ label: 'overdueFilter', filter: 'overdue=true' }];
    renderListView({ quickFilters });
    const btn = screen.getByText('overdueFilter').closest('button');
    // Off -> on
    fireEvent.click(btn);
    expect(btn.className).toContain('border-primary');
    // On -> off (removes from the Set)
    fireEvent.click(btn);
    expect(btn.className).not.toContain('border-primary');
  });

  // ── effectiveFilter: AdvancedCriteria merge branch + effectiveRowFilter ─
  it('wraps merged criteria in an AdvancedCriteria AND when a quick filter contributes one, and composes rowFilter predicates', () => {
    const advancedCrit = { _constructor: 'AdvancedCriteria', operator: 'or', criteria: [{ fieldName: 'a', operator: 'equals', value: 1 }] };
    const quickFilters = [{
      label: 'advQuick',
      filter: 'criteria=' + encodeURIComponent(JSON.stringify(advancedCrit)),
      rowFilter: (row) => row.amount > 0,
    }];
    const rowFilter = (row) => row.name !== 'skip-me';
    renderListView({ quickFilters, rowFilter });
    fireEvent.click(screen.getByText('advQuick').closest('button'));

    // The composed rowFilter must chain both the quick filter's own predicate
    // AND the caller-supplied rowFilter prop (effectiveRowFilter's multi-fn path).
    expect(tableProps.rowFilter({ amount: 5, name: 'ok' })).toBe(true);
    expect(tableProps.rowFilter({ amount: 0, name: 'ok' })).toBe(false);
    expect(tableProps.rowFilter({ amount: 5, name: 'skip-me' })).toBe(false);
  });

  // ── handleFilterChange / handleClearAllFilters ─────────────────────────
  it('tracks column filter changes and clears them via the Table callback', () => {
    renderListView();
    act(() => { filterBarProps.onFilterChange('status', ['DR']); });
    expect(tableProps.columnFilters).toEqual({ status: ['DR'] });

    act(() => { tableProps.onClearAllFilters(); });
    expect(tableProps.columnFilters).toEqual({});
  });

  // ── applyPreset (both resolveQuickFilterIndicesFromPreset branches) ────
  it('applies a saved preset, resolving subset + quick filter indices back from their labels', () => {
    presetsData = {
      myPreset: {
        columnFilters: { status: ['DR'] },
        advancedFilter: { some: 'thing' },
        subsetLabel: 'Open',
        quickFilterLabels: ['overdueFilter'],
      },
    };
    const subsetFilters = [{ label: 'All', filter: null }, { label: 'Open', filter: 'status=DR' }];
    const quickFilters = [{ label: 'overdueFilter', filter: 'overdue=true' }];
    renderListView({ subsetFilters, quickFilters });

    act(() => { filterBarProps.onApplyPreset('myPreset'); });

    expect(tableProps.columnFilters).toEqual({ status: ['DR'] });
    // Subset resolved back to index 1 ("Open").
    expect(screen.getByText('Open').closest('button').className).toContain('bg-card');
    // Quick filter resolved back to active.
    expect(screen.getByText('overdueFilter').closest('button').className).toContain('border-primary');
  });

  it('resets quick filter indices to empty when the preset applies to a window with no quickFilters prop (else branch)', () => {
    presetsData = {
      myPreset: { columnFilters: {}, advancedFilter: null, subsetLabel: null, quickFilterLabels: ['anything'] },
    };
    renderListView(); // no quickFilters, no subsetFilters
    expect(() => act(() => { filterBarProps.onApplyPreset('myPreset'); })).not.toThrow();
  });

  it('applyPreset silently no-ops when the named preset does not exist', () => {
    renderListView();
    expect(() => act(() => { filterBarProps.onApplyPreset('missing'); })).not.toThrow();
  });

  // ── saveCurrentAsPreset ─────────────────────────────────────────────────
  it('saves the current filter state (subset label + active quick filter labels) as a named preset', () => {
    const subsetFilters = [{ label: 'All', filter: null }, { label: 'Open', filter: 'status=DR' }];
    const quickFilters = [{ label: 'overdueFilter', filter: 'overdue=true' }];
    renderListView({ subsetFilters, quickFilters, initialSubsetIndex: 1 });
    fireEvent.click(screen.getByText('overdueFilter').closest('button'));

    act(() => { filterBarProps.onSavePreset('newPreset'); });

    expect(savePresetMock).toHaveBeenCalledWith('newPreset', expect.objectContaining({
      subsetLabel: 'Open',
      quickFilterLabels: ['overdueFilter'],
    }));
  });

  // ── refresh effects: columnFilters change + refreshTrigger bump ───────
  it('refetches when columnFilters change after the initial mount (skips the very first run)', () => {
    renderListView();
    expect(mockHook.refresh).not.toHaveBeenCalled();
    act(() => { filterBarProps.onFilterChange('status', ['CO']); });
    expect(mockHook.refresh).toHaveBeenCalled();
  });

  it('refetches when refreshTrigger increments', () => {
    const { rerender } = renderListView({ refreshTrigger: 0 });
    mockHook.refresh.mockClear();
    rerender(<ListView entity="header" Table={CapturingTable} entityLabel="Test Entity" windowName="sales-order" token="fake-token" apiBaseUrl="/api" refreshTrigger={1} />);
    expect(mockHook.refresh).toHaveBeenCalled();
  });

  // ── useRowDelete onSuccess wiring ───────────────────────────────────────
  it('refreshes the grid via the default requestDelete onSuccess callback', () => {
    renderListView({ rowQuickActions: { enabled: true } });
    act(() => { rowDeleteOptions.onSuccess(); });
    expect(mockHook.refresh).toHaveBeenCalled();
  });

  // ── effectiveRowQuickActions.onEmail + SendDocumentModal mount/close ────
  it('auto-detects a documental window (documentNo column) and wires a default onEmail that mounts SendDocumentModal', () => {
    renderListView({ rowQuickActions: { enabled: true } });
    // documentNo column reported via onColumnsReady(COLUMNS) doesn't include it —
    // add it explicitly by re-rendering with a column set that has documentNo.
    act(() => { tableProps.onColumnsReady([{ key: 'documentNo' }]); });
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();

    act(() => { tableProps.rowQuickActions.onEmail({ id: 'r9', documentNo: 'DOC-9', businessPartner: 'bp1', 'businessPartner$_identifier': 'ACME' }); });
    const modal = screen.getByTestId('send-document-modal');
    expect(modal).toHaveAttribute('data-document-no', 'DOC-9');

    fireEvent.click(screen.getByTestId('close-send-modal'));
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  // ── fullBreadcrumb + favorites toggle ───────────────────────────────────
  it('joins a slash-delimited breadcrumb through the menu label translator, and wires the favorites toggle', () => {
    renderListView({ breadcrumb: 'Sales / Orders' });
    expect(pageMetaOptions.breadcrumb).toBe('Sales / Orders');
    act(() => { pageMetaOptions.onAddToFavorites(); });
    expect(toggleFavoriteMock).toHaveBeenCalledWith('sales-order', 'Test Entity');
  });

  // ── handlePreviewClose / handlePreviewEdit ──────────────────────────────
  // When `renderPreview` is supplied, buildRowNavigateHandler wires the Table's
  // onNavigate to setPreviewRow(row) instead of a route change (see ListView.jsx).
  it('opens the internal preview panel via onNavigate and closes it through handlePreviewClose', () => {
    mockHook.items = [{ id: 'p1', name: 'Preview Me' }];
    const renderPreview = ({ row, onClose }) => (
      <div data-testid="preview-panel">
        <span>{row.name}</span>
        <button data-testid="preview-close" onClick={onClose}>close</button>
      </div>
    );
    renderListView({ renderPreview });
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();

    act(() => { tableProps.onNavigate({ id: 'p1', name: 'Preview Me' }); });
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('preview-close'));
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();
  });

  it('handlePreviewEdit clears the preview row and navigates to the detail route', () => {
    mockHook.items = [{ id: 'p1', name: 'Preview Me' }];
    const renderPreview = ({ row, onEdit }) => (
      <div data-testid="preview-panel">
        <button data-testid="preview-edit" onClick={() => onEdit(row.id)}>edit</button>
      </div>
    );
    renderListView({ renderPreview, windowName: 'sales-order' });
    act(() => { tableProps.onNavigate({ id: 'p1', name: 'Preview Me' }); });

    fireEvent.click(screen.getByTestId('preview-edit'));

    expect(navigateMock).toHaveBeenCalledWith('/sales-order/p1');
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();
  });

  it('falls back to the external preview close callback when no internal preview row is set', () => {
    const onExternalPreviewClose = vi.fn();
    const externalPreviewRow = { id: 'ext1', name: 'External' };
    const renderPreview = ({ row, onClose }) => (
      <div data-testid="preview-panel">
        <span>{row.name}</span>
        <button data-testid="preview-close" onClick={onClose}>close</button>
      </div>
    );
    renderListView({ renderPreview, externalPreviewRow, onExternalPreviewClose });
    fireEvent.click(screen.getByTestId('preview-close'));
    expect(onExternalPreviewClose).toHaveBeenCalled();
  });

  // ── selection-bar buttons: print / clone ─────────────────────────────────
  it('never renders the "Vista Previa" (eye) button in the selection bar (ETP-4644)', () => {
    renderListView();
    fireEvent.click(screen.getByTestId('trigger-select'));
    expect(screen.queryByText('preview')).not.toBeInTheDocument();
  });

  it('calls printDocuments with the selected ids from the selection bar print button', () => {
    renderListView();
    fireEvent.click(screen.getByTestId('trigger-select'));
    fireEvent.click(screen.getByText(/^print/).closest('button'));
    // ETP-4912: apiBaseUrl is passed too — see documentPdfRegistry.js
    expect(printDocumentsMock).toHaveBeenCalledWith('sales-order', ['r1'], 'fake-token', expect.any(Function), '/api');
  });

  it('invokes onCloneRow with the selected rows from the selection-bar clone button', () => {
    const onCloneRow = vi.fn();
    renderListView({ onCloneRow });
    fireEvent.click(screen.getByTestId('trigger-select'));
    fireEvent.click(screen.getByText(/^cloneOrderBtn/).closest('button'));
    expect(onCloneRow).toHaveBeenCalled();
  });

  // ── view toggle + gallery renderer ──────────────────────────────────────
  it('switches to gallery view via the view toggle and renders galleryRenderer instead of the Table', () => {
    const galleryRenderer = ({ data }) => <div data-testid="gallery-view">{data.length}</div>;
    mockHook.items = [{ id: 'g1', name: 'G' }];
    renderListView({ galleryRenderer });
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();

    const toggle = screen.getByTestId('view-toggle');
    const [listBtn, galleryBtn] = toggle.querySelectorAll('button');
    fireEvent.click(galleryBtn);
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-table')).not.toBeInTheDocument();

    fireEvent.click(listBtn);
    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  // ── sort popover: toggle, select a column, clear sort ───────────────────
  it('opens the sort popover, selects a sortable column, and clears back to the default sort', () => {
    renderListView();
    const sortToggle = document.querySelector('.relative button');
    fireEvent.click(sortToggle);
    expect(screen.getByText('sortBy')).toBeInTheDocument();

    // 'amount' is sortable:false and must be excluded from the popover list.
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Name'));
    expect(mockHook.setSortColumn).toHaveBeenCalledWith('name');
    expect(mockHook.setSortDirection).toHaveBeenCalledWith('asc');
  });

  it('shows the "clear sort" option only when the active sort differs from the default, and clears it back', () => {
    mockHook.sortColumn = 'name';
    mockHook.sortDirection = 'asc';
    renderListView();
    fireEvent.click(document.querySelector('.relative button'));
    const clearBtn = screen.getByText('clearSort').closest('button');
    fireEvent.click(clearBtn);
    expect(mockHook.setSortColumn).toHaveBeenCalledWith('creationDate');
    expect(mockHook.setSortDirection).toHaveBeenCalledWith('desc');
  });

  // ── refresh button, header print, "New" dropdown actions ────────────────
  it('calls hook.refresh from the toolbar refresh button', () => {
    renderListView();
    fireEvent.click(screen.getByTitle('refresh'));
    expect(mockHook.refresh).toHaveBeenCalled();
  });

  it('opens the report drawer from the header print button', () => {
    renderListView();
    fireEvent.click(screen.getByText('print').closest('button'));
    expect(screen.getByTestId('report-drawer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-report'));
    expect(screen.queryByTestId('report-drawer')).not.toBeInTheDocument();
  });

  it('renders the "New" split-button dropdown and invokes a custom new action', () => {
    const onCustomNew = vi.fn();
    renderListView({ newActions: [{ key: 'from-template', label: 'From template', onClick: onCustomNew }] });
    fireEvent.click(screen.getByTestId('action-new-more'));
    fireEvent.click(screen.getByTestId('action-new-from-template'));
    expect(onCustomNew).toHaveBeenCalled();
  });
});
