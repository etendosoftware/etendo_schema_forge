// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

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
    // A successful, empty fetch: ListView then hands the Table an emptyListContext.
    meta: { status: 0, startRow: 0, totalRows: 0 },
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

// Mock ImportDialog — exposes onImported via a button so tests can simulate the real
// component reporting { okCount, failedCount } without driving the full upload flow.
vi.mock('@etendosoftware/app-shell-core/components/import/ImportDialog.jsx', () => ({
  ImportDialog: ({ open, onImported, onOpenChange, initialFile }) => open ? (
    <div data-testid="ImportDialog__mock">
      <span data-testid="ImportDialog__mock-initialFile">{initialFile?.name ?? ''}</span>
      <button type="button" data-testid="ImportDialog__mock-close" onClick={() => onOpenChange(false)} />
      <button type="button" data-testid="ImportDialog__mock-reportSuccess" onClick={() => onImported({ okCount: 2, failedCount: 0 })} />
      <button type="button" data-testid="ImportDialog__mock-reportFailure" onClick={() => onImported({ okCount: 0, failedCount: 1 })} />
    </div>
  ) : null,
}));

// Radix's portal-based menu does not open under jsdom; a flat stub keeps the items clickable.
vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...rest }) => <button type="button" onClick={onClick} {...rest}>{children}</button>,
  DropdownMenuTrigger: ({ children }) => children,
}));

import { ListView } from '../ListView.jsx';

// A minimal Table component mock; it keeps its last props so a test can call the
// empty-list entry points ListView hands it.
let tableProps = null;
function MockTable(props) {
  tableProps = props;
  return <table data-testid="mock-table"><tbody /></table>;
}

describe('ListView — import button', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: MockTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
  };

  it('does not render the import toolbar button when the import prop is absent', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.queryByTestId('ListView__importButton')).toBeNull();
  });

  it('renders the import toolbar button when the import prop is present and enabled', () => {
    render(<ListView {...defaultProps} import={{ enabled: true, spec: 'contacts', fields: [] }} />);
    expect(screen.getByTestId('ListView__importButton')).toBeInTheDocument();
  });

  it('opens ImportDialog when the import button is clicked', () => {
    render(<ListView {...defaultProps} import={{ enabled: true, spec: 'contacts', fields: [] }} />);
    fireEvent.click(screen.getByTestId('ListView__importButton'));
    expect(screen.getByTestId('ImportDialog__mock')).toBeInTheDocument();
  });

  it('regression: keeps the dialog open when onImported reports a failure, so the review queue stays visible', () => {
    // Root cause of a real report ("tengo 500 durante el import, no veo ningun error en
    // pantalla"): this callback used to close the dialog unconditionally on every
    // onImported call. Even a batch that failed outright still unmounted the whole
    // dialog the instant it rendered the Result step's review queue, so the (correctly
    // surfaced) server error message never had a chance to be seen on screen.
    render(<ListView {...defaultProps} import={{ enabled: true, spec: 'contacts', fields: [] }} />);
    fireEvent.click(screen.getByTestId('ListView__importButton'));
    fireEvent.click(screen.getByTestId('ImportDialog__mock-reportFailure'));
    expect(screen.getByTestId('ImportDialog__mock')).toBeInTheDocument();
  });

  it('closes the dialog when onImported reports zero failures (nothing left to review)', () => {
    render(<ListView {...defaultProps} import={{ enabled: true, spec: 'contacts', fields: [] }} />);
    fireEvent.click(screen.getByTestId('ListView__importButton'));
    fireEvent.click(screen.getByTestId('ImportDialog__mock-reportSuccess'));
    expect(screen.queryByTestId('ImportDialog__mock')).toBeNull();
  });
});

describe('ListView — a newActions item that opens the import dialog', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: MockTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
    newActions: [{ key: 'import', label: 'Import', opensImportDialog: true }],
  };
  const IMPORT = { enabled: true, spec: 'contacts', fields: [] };

  it('opens ImportDialog from the split New menu', () => {
    render(<ListView {...defaultProps} import={IMPORT} />);
    fireEvent.click(screen.getByTestId('action-new-import'));
    expect(screen.getByTestId('ImportDialog__mock')).toBeInTheDocument();
  });

  it.each([
    // [case, props, menu item shown, standalone import icon shown]
    ['the menu offers the import', { import: IMPORT }, true, false],
    ['hideCreate removes the menu', { import: IMPORT, hideCreate: true }, false, true],
    ['a read-only window removes the menu', { import: IMPORT, window: { readOnly: true } }, false, true],
    ['the import is disabled', { import: { ...IMPORT, enabled: false } }, false, false],
  ])('offers the import exactly where it is reachable when %s', (_label, props, itemShown, iconShown) => {
    render(<ListView {...defaultProps} {...props} />);
    expect(screen.queryByTestId('action-new-import') !== null).toBe(itemShown);
    expect(screen.queryByTestId('ListView__importButton') !== null).toBe(iconShown);
  });

  it('drops the split chevron when the import item was its only action and the import is disabled', () => {
    render(<ListView {...defaultProps} import={{ ...IMPORT, enabled: false }} />);
    expect(screen.getByTestId('action-new')).toBeInTheDocument();
    expect(screen.queryByTestId('action-new-more')).toBeNull();
  });
});

describe('ListView — openImportDialog(file), the empty-list onImport entry point', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: MockTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
    import: { enabled: true, spec: 'contacts', fields: [] },
  };

  beforeEach(() => {
    tableProps = null;
  });

  it('starts the dialog with the handed file, and a later open after closing starts empty', () => {
    render(<ListView {...defaultProps} />);
    const file = new File(['name\nAcme'], 'contacts.csv', { type: 'text/csv' });

    act(() => tableProps.emptyListContext.onImport(file));
    expect(screen.getByTestId('ImportDialog__mock-initialFile')).toHaveTextContent('contacts.csv');

    fireEvent.click(screen.getByTestId('ImportDialog__mock-close'));
    expect(screen.queryByTestId('ImportDialog__mock')).toBeNull();

    fireEvent.click(screen.getByTestId('ListView__importButton'));
    expect(screen.getByTestId('ImportDialog__mock-initialFile')).toBeEmptyDOMElement();
  });

  it('opens the dialog empty when handed something that is not a File (e.g. a click event)', () => {
    render(<ListView {...defaultProps} />);

    act(() => tableProps.emptyListContext.onImport({ type: 'click' }));
    expect(screen.getByTestId('ImportDialog__mock-initialFile')).toBeEmptyDOMElement();
  });
});
