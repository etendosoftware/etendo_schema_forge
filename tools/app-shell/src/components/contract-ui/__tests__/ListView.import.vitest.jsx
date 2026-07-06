import { describe, it, expect, vi } from 'vitest';
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
vi.mock('../ListFilterBar.jsx', () => ({
  ListFilterBar: () => <div data-testid="list-filter-bar" />,
}));
vi.mock('@/lib/gridQuery', () => ({
  buildAdvancedFilterCriteria: () => null,
}));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

// Mock ImportDialog — exposes onImported via a button so tests can simulate the real
// component reporting { okCount, failedCount } without driving the full upload flow.
vi.mock('@etendosoftware/app-shell-core/components/import/ImportDialog.jsx', () => ({
  ImportDialog: ({ open, onImported }) => open ? (
    <div data-testid="ImportDialog__mock">
      <button type="button" data-testid="ImportDialog__mock-reportSuccess" onClick={() => onImported({ okCount: 2, failedCount: 0 })} />
      <button type="button" data-testid="ImportDialog__mock-reportFailure" onClick={() => onImported({ okCount: 0, failedCount: 1 })} />
    </div>
  ) : null,
}));

import { ListView } from '../ListView.jsx';

// A minimal Table component mock
function MockTable() {
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
