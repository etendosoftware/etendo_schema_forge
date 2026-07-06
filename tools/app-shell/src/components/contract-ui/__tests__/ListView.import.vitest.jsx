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

// Mock ImportDialog
vi.mock('@etendosoftware/app-shell-core/components/import/ImportDialog.jsx', () => ({
  ImportDialog: ({ open }) => open ? <div data-testid="ImportDialog__mock" /> : null,
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
});
