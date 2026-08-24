import { render, screen } from '@testing-library/react';

// Regression/coverage for ETP-4888: DetailView's new `lineRowActions` prop is a
// generic per-row action slot, forwarded verbatim to the line grid (`DetailTable`
// / InlineLinesPanel) as its own `rowActions` prop — see docs/ui-customization.md.
// First consumer: useTaxSifLineRowActions.jsx (the invoice-lines "tax needs SIF
// configuration" hover shortcut), wired via sales-invoice/purchase-invoice's
// index.jsx.
//
// This test follows the exact harness DetailView.lineHiddenColumns.vitest.jsx
// uses for the sibling `hiddenColumns` prop (same `DetailTable` probe pattern),
// scoped to just the `lineRowActions` -> `rowActions` passthrough — it does not
// re-verify hiddenColumns' own (unrelated) logic.

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

const DETAIL_ENTITY = 'sales-invoice-line';

const mockHook = {
  items: [],
  selected: null,
  editing: null,
  loading: false,
  saving: false,
  error: null,
  children: [],
  childrenLoading: false,
  fetchById: vi.fn(),
  handleSelect: vi.fn(),
  handleChange: vi.fn(),
  handleSave: vi.fn(),
  handleCreate: vi.fn(),
  handleDelete: vi.fn(),
  handleAddChild: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  refresh: vi.fn(),
  setEditing: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({ ...mockHook }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ readOnly: {}, visibility: {} }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    grossAmount: 0,
    computeGrossAmount: vi.fn(),
  }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => <div data-testid="summary-bar" />,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => <div data-testid="document-totals-panel" />,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: () => null,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));

vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { DetailView } from '../DetailView.jsx';

// Probe DetailTable: records the props it received on its most recent render.
const detailTableProps = vi.hoisted(() => ({ current: null }));
function DetailTableProbe(props) {
  detailTableProps.current = props;
  return <div data-testid="detail-table-probe" />;
}

const BASE_PROPS = {
  entity: 'sales-invoice',
  detailEntity: DETAIL_ENTITY,
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: DetailTableProbe,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  api: { window: { category: 'sales' } },
  entityLabel: 'Sales Invoice',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'sales-invoice',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

describe('DetailView — lineRowActions forwarded to the line grid as rowActions (ETP-4888)', () => {
  beforeEach(() => {
    detailTableProps.current = null;
    mockHook.selected = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.loading = false;
    mockHook.childrenLoading = false;
    // Non-empty children so the lines branch renders DetailTable, not the
    // empty-state / spinner branches (see DetailView.linesTabRender.vitest.jsx).
    mockHook.children = [{ id: 'line-1', product: 'Widget', invoicedQuantity: 10 }];
  });

  it('forwards a single-entry lineRowActions array to DetailTable.rowActions unchanged', () => {
    const taxSifAction = {
      key: 'taxSifTrigger',
      icon: () => null,
      tooltip: 'This tax is missing SIF configuration',
      show: () => true,
      onClick: () => {},
      testId: 'line-action-tax-sif',
    };

    render(<DetailView {...BASE_PROPS} lineRowActions={[taxSifAction]} />);

    expect(screen.getByTestId('detail-table-probe')).toBeInTheDocument();
    expect(detailTableProps.current.rowActions).toEqual([taxSifAction]);
    expect(detailTableProps.current.rowActions[0]).toBe(taxSifAction);
  });

  it('defaults to an empty array when lineRowActions is not passed', () => {
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.rowActions).toEqual([]);
  });

  it('forwards multiple actions and preserves their order', () => {
    const first = { key: 'a', testId: 'action-a' };
    const second = { key: 'b', testId: 'action-b' };

    render(<DetailView {...BASE_PROPS} lineRowActions={[first, second]} />);

    expect(detailTableProps.current.rowActions).toEqual([first, second]);
  });
});
