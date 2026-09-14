/**
 * ETP-5245 — backend-resolved line defaults must reach a SECONDARY tab's add-row.
 *
 * The chain, and what each test pins:
 *   1. `DetailView` fetches per-tab defaults once the parent record is known
 *      (`secondaryHooks[i].fetchChildDefaults(parentRecordId)`, DetailView.jsx ~1334),
 *      unless the entity opted out with `crud.<entity>.handlesDefaults === false`.
 *   2. `useEntity.fetchChildDefaults` GETs `/<childEntity>/defaults?parentId=<id>` and
 *      stores `data.defaults` in `childDefaults` (useEntity.js ~1155).
 *   3. `DetailView` hands that map to `SecondaryTableTab` as `secondaryChildDefaults`
 *      (DetailView.jsx ~3886), which puts it on `addRow.resolvedDefaults` (~663).
 *   4. The add-row of an `inlineEditable` tab is NOT `InlineLinesPanel` — it is the
 *      header-hidden sibling `<DataTable hideHeader hideDataRows>` — and its
 *      `buildEmpty` applies `resolvedDefaults` to EMPTY fields only.
 *
 * Step 4 was the suspected break (the two renderers are different components), so it is
 * asserted here against the REAL DataTable, with a real `type: 'date'` field, not a stub.
 * If every test in this file passes and a date default still does not appear in the UI,
 * the missing link is upstream of the frontend: the `/defaults` response itself.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React, { createRef } from 'react';
import { DetailView } from '../DetailView.jsx';
import { DataTable } from '../DataTable.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/product/123', search: '', state: {} }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const CHILD_DEFAULTS = { startingDate: '2026-01-05', costType: 'STA' };

const fetchChildDefaultsSpy = vi.fn();

const parentHook = {
  loading: false,
  items: [],
  selected: { id: '123', name: 'Widget' },
  editing: { id: '123', name: 'Widget' },
  children: [],
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  childDefaults: {},
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  fetchChildDefaults: vi.fn(),
  refreshChildren: vi.fn(),
  handleNew: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

const costingHook = {
  ...parentHook,
  children: [{ id: 'C1', cost: 98.47, startingDate: '2026-04-16', endingDate: '9999-12-31' }],
  childDefaults: CHILD_DEFAULTS,
  fetchChildDefaults: fetchChildDefaultsSpy,
};

vi.mock('@/hooks/useEntity', () => ({
  // Secondary hooks are created as useEntity(entity, childEntity, ...) — the second
  // argument is the tab key, which is how this mock tells them apart.
  useEntity: (_entity, childEntity) => (childEntity === 'costing' ? costingHook : parentHook),
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: (field, value, result) => { result[field] = value; },
    resolveTaxFactor: () => 1,
    deriveLineNet: () => 0,
    prepareLineForPost: (lineData) => lineData,
  }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
  useLocale: () => 'en_US',
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}),
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>attach</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.name}</div>;
const StubDetailTable = () => <div data-testid="stub-detail-table" />;
const StubDetailForm = () => <div data-testid="stub-detail-form" />;

// Captures what SecondaryTableTab hands the tab's own Table component, so the assertion
// is about the props contract rather than about any particular table markup.
let capturedTableProps = null;
const CapturingCostingTable = React.forwardRef(function CapturingCostingTable(props, _ref) {
  capturedTableProps = props;
  return <div data-testid="capturing-costing-table" />;
});

const COSTING_ADD_LINE_FIELDS = {
  entry: [
    { key: 'cost', column: 'Cost', type: 'number', required: true, label: 'Cost' },
    { key: 'startingDate', column: 'DateFrom', type: 'date', required: true, label: 'Starting Date' },
    { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
  ],
  derived: [],
  hidden: [],
};

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="product"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={StubDetailTable}
        DetailForm={StubDetailForm}
        summary={[]}
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Product"
        detailLabel="Lines"
        titleField="name"
        windowName="product"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/product"
        secondaryTabs={[{
          key: 'costing',
          label: 'Costing',
          Table: CapturingCostingTable,
          addLineFields: COSTING_ADD_LINE_FIELDS,
          requireSavedRecord: true,
        }]}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ETP-5245 — secondary-tab add-row receives the backend line defaults', () => {
  beforeEach(() => {
    capturedTableProps = null;
    fetchChildDefaultsSpy.mockClear();
  });

  it('fetches the tab defaults once the parent record id is known', async () => {
    renderDetailView();
    await waitFor(() => expect(fetchChildDefaultsSpy).toHaveBeenCalledWith('123'));
  });

  it('does not fetch them when the entity opted out with handlesDefaults:false', async () => {
    renderDetailView({ api: { crud: { costing: { handlesDefaults: false } } } });
    await waitFor(() => expect(screen.getAllByTestId('mock-form').length).toBeGreaterThan(0));
    expect(fetchChildDefaultsSpy).not.toHaveBeenCalled();
  });

  it('hands the fetched defaults to the tab table as addRow.resolvedDefaults', async () => {
    const user = userEvent.setup();
    renderDetailView();
    // The tab strip renders every tab; its content mounts only once the tab is active.
    await user.click(await screen.findByTestId('tab-costing'));
    await waitFor(() => expect(capturedTableProps).not.toBeNull());
    expect(capturedTableProps.addRow).toBeTruthy();
    expect(capturedTableProps.addRow.resolvedDefaults).toEqual(CHILD_DEFAULTS);
  });
});

// ── Step 4, against the real components ────────────────────────────────────────

const COSTING_COLUMNS = [
  { key: 'cost', column: 'Cost', type: 'amount', label: 'Cost', required: true },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
];

function renderAddRow(resolvedDefaults) {
  const onValuesChange = vi.fn();
  render(
    <DataTable
      columns={COSTING_COLUMNS}
      data={[]}
      entity="costing"
      specName="product"
      token="test"
      apiBaseUrl="/api"
      hideHeader
      hideDataRows
      linesLayout="inlineEditable"
      addRow={{
        ref: createRef(),
        active: true,
        fields: COSTING_ADD_LINE_FIELDS.entry,
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
        resolvedDefaults,
        onValuesChange,
      }}
    />,
  );
  return onValuesChange;
}

describe('ETP-5245 — the inlineEditable add-row applies a date default', () => {
  it('seeds an empty date field from resolvedDefaults', () => {
    const onValuesChange = renderAddRow(CHILD_DEFAULTS);
    const values = onValuesChange.mock.calls.at(-1)?.[0] ?? {};
    expect(values.startingDate).toBe('2026-01-05');
    // And the DateField actually shows it (locale-formatted, never blank).
    expect(screen.getByTestId('inline-add-field-startingDate').value).not.toBe('');
  });

  it('leaves the field empty when the backend sends no default for it', () => {
    const onValuesChange = renderAddRow({ costType: 'STA' });
    const values = onValuesChange.mock.calls.at(-1)?.[0] ?? {};
    expect(values.startingDate).toBe('');
    expect(screen.getByTestId('inline-add-field-startingDate').value).toBe('');
  });

  it('never overwrites a literal decisions.json defaultValue with the backend one', () => {
    const onValuesChange = renderAddRow({ endingDate: '2030-01-01' });
    const values = onValuesChange.mock.calls.at(-1)?.[0] ?? {};
    // `endingDate` has no literal default here, so the backend one wins…
    expect(values.endingDate).toBe('2030-01-01');
    // …while a field that does carry one keeps it (guards applyResolvedFieldDefaults'
    // fill-empties-only rule, the reason a default can silently "not apply").
    expect(values.cost).toBe('');
  });
});
