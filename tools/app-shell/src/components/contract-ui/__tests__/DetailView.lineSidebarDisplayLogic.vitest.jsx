import { render, screen, fireEvent } from '@testing-library/react';

// Regression coverage for a REVIEW finding on ETP-4529's PR: the line-detail sidebar
// (DetailForm, shown when a row is selected in a non-`inlineEditable` layout) was
// forwarded the FULL `lineDisplayLogic.visibility` map, not just the dimension-macro
// keys. Since lineDisplayLogic is evaluated against the header (representative
// context, not the actual selected line — see DetailView.lineHiddenColumns.vitest.jsx's
// ETP-4530 regression test for the same root cause), any other key's visibility (e.g.
// product, listPrice, grossAmount) could resolve to false noise and incorrectly hide
// fields in the line sidebar form that have nothing to do with the accounting-dimension
// macro. The fix filters the forwarded visibility map down to DIMENSION_MACRO_KEYS,
// mirroring the same allowlist already applied to `lineHiddenColumns`.
//
// Harness mirrors DetailView.lineHiddenColumns.vitest.jsx, with a DetailForm PROBE
// added and `onRowClick` (recorded on the DetailTable probe) invoked to select a line,
// triggering the sidebar's render branch (shouldShowDetailFormSidebar).

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

const displayLogicByEntity = vi.hoisted(() => ({
  current: {
    'sales-invoice': { readOnly: {}, visibility: {} },
    'sales-invoice-line': { readOnly: {}, visibility: {} },
  },
}));

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
  useDisplayLogic: (entity) => displayLogicByEntity.current[entity] ?? { readOnly: {}, visibility: {} },
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

const detailTableProps = vi.hoisted(() => ({ current: null }));
function DetailTableProbe(props) {
  detailTableProps.current = props;
  return (
    <div data-testid="detail-table-probe">
      {(props.data ?? []).map((row) => (
        <button key={row.id} data-testid={`row-${row.id}`} onClick={() => props.onRowClick?.(row)}>
          {row.id}
        </button>
      ))}
    </div>
  );
}

const detailFormProps = vi.hoisted(() => ({ current: null }));
function DetailFormProbe(props) {
  detailFormProps.current = props;
  return <div data-testid="detail-form-probe" />;
}

const BASE_PROPS = {
  entity: 'sales-invoice',
  detailEntity: DETAIL_ENTITY,
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: DetailTableProbe,
  DetailForm: DetailFormProbe,
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

describe('DetailView — line sidebar DetailForm displayLogic (ETP-4529 review fix)', () => {
  beforeEach(() => {
    displayLogicByEntity.current = {
      'sales-invoice': { readOnly: {}, visibility: {} },
      'sales-invoice-line': { readOnly: {}, visibility: {} },
    };
    detailTableProps.current = null;
    detailFormProps.current = null;
    mockHook.selected = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.loading = false;
    mockHook.childrenLoading = false;
    mockHook.children = [{ id: 'line-1', product: 'Widget', invoicedQuantity: 10 }];
  });

  function selectLine1() {
    render(<DetailView {...BASE_PROPS} />);
    expect(screen.getByTestId('detail-table-probe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('row-line-1'));
  }

  it('forwards only dimension-macro keys to the sidebar DetailForm, dropping non-dimension false noise', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: {
        product: false,
        listPrice: false,
        grossAmount: false,
        project: false,
        costcenter: false,
      },
    };
    selectLine1();

    expect(screen.getByTestId('detail-form-probe')).toBeInTheDocument();
    const forwarded = detailFormProps.current.displayLogic;
    expect(forwarded.visibility).toEqual({ project: false, costcenter: false });
    expect(forwarded.visibility).not.toHaveProperty('product');
    expect(forwarded.visibility).not.toHaveProperty('listPrice');
    expect(forwarded.visibility).not.toHaveProperty('grossAmount');
  });

  it('always forwards an empty readOnly map — per-row readOnlyLogic stays in control', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: { product: true },
      visibility: { project: false },
    };
    selectLine1();

    expect(detailFormProps.current.displayLogic.readOnly).toEqual({});
  });

  it('forwards businessPartner (dimension macro) when resolved false', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: { businessPartner: false, description: false },
    };
    selectLine1();

    expect(detailFormProps.current.displayLogic.visibility).toEqual({ businessPartner: false });
  });
});
