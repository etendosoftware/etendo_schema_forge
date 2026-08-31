import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Regression coverage for ETP-5052: DetailView now merges a live `hasLines`
// boolean into the record object handed to HEADER `<Form>` calls (see
// buildHeaderFormData in detailViewHelpers.jsx), so a header field's
// `readOnlyLogicJs` expression (e.g. Physical Inventory's warehouse:
// `"!!record.hasLines"`, compiled to `readOnlyLogic: (record) => !!record.hasLines`)
// can lock the field once the master record has count/detail lines and unlock
// it again once the last one is removed.
//
// This test mounts the REAL EntityForm (not a stub) as DetailView's `Form`
// prop — exactly like a generated HeaderForm.jsx wrapper does — so the
// disabled/enabled assertions only pass if DetailView actually merges
// hook.children into the record before handing it to the principal Form call.
//
// Mock setup mirrors DetailView.principalDisplayLogic.vitest.jsx (proven
// minimal harness to mount the whole component with a real EntityForm child).

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

const mockHook = {
  items: [],
  selected: null,
  editing: null,
  loading: false,
  saving: false,
  isSaving: false,
  isDirtyHeader: false,
  error: null,
  children: [],
  childrenLoading: false,
  fetchById: vi.fn(),
  primeSaved: vi.fn(),
  handleSelect: vi.fn(),
  handleChange: vi.fn(),
  handleSave: vi.fn(() => Promise.resolve({ id: '123' })),
  handleSaveAndProcess: vi.fn(() => Promise.resolve({ id: '123' })),
  handleCreate: vi.fn(),
  handleDelete: vi.fn(),
  handleAddChild: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  refresh: vi.fn(),
  setEditing: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ ...mockHook }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ readOnly: {}, visibility: {} }),
}));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
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
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

// --- Extra stubs for EntityForm's own heavy children (real EntityForm is used below) ---
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => null }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => null }));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: (props) => <div data-testid={`selector-input-${props.field?.key ?? 'unknown'}`} />,
}));
vi.mock('../SelectorChip.jsx', () => ({
  SelectorChip: (props) => <span data-testid={props.testId ?? 'chip'}>{props.label}</span>,
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));

import { DetailView } from '../DetailView.jsx';
import { EntityForm } from '../EntityForm.jsx';

// Fields shaped like the real generated output for a physical-inventory-style
// window: `warehouse` locks once the record has lines (compiled from
// decisions.json's `"readOnlyLogicJs": "!!record.hasLines"`); `description`
// stays freely editable regardless of `hasLines`, so it can be used to prove
// the write path never forwards the synthetic `hasLines` key upstream.
const PRINCIPAL_FIELDS = [
  {
    key: 'warehouse',
    label: 'Warehouse',
    type: 'text',
    column: 'M_Warehouse_ID',
    section: 'principal',
    readOnlyLogic: (record) => !!record.hasLines,
  },
  {
    key: 'description',
    label: 'Description',
    type: 'text',
    column: 'Description',
    section: 'principal',
  },
];

// Mirrors a generated HeaderForm.jsx wrapper (see e.g.
// artifacts/physical-inventory/generated/web/physical-inventory/InventoryForm.jsx):
// binds the window's field list onto the shared EntityForm and forwards
// everything DetailView passes through (including `data`).
function HeaderForm(props) {
  return <EntityForm fields={PRINCIPAL_FIELDS} {...props} />;
}

const BASE_PROPS = {
  entity: 'header',
  detailEntity: 'lines',
  Form: HeaderForm,
  DetailTable: () => <div data-testid="mock-detail-table">Table</div>,
  DetailForm: null,
  summary: [],
  api: {},
  entityLabel: 'Physical Inventory',
  detailLabel: 'Lines',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'physical-inventory',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

function setRecord(fields) {
  const rec = { id: '123', documentNo: 'DOC-001', warehouse: 'W1', ...fields };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView header Form — record.hasLines lock (ETP-5052)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.children = [];
    setRecord({});
  });

  it('Given no lines, When the header renders, Then warehouse is enabled', () => {
    mockHook.children = [];
    render(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('field-warehouse')).not.toBeDisabled();
  });

  it('hook.children undefined (header-only window shape) also resolves to hasLines=false, no crash', () => {
    // A genuinely header-only window never wires a DetailTable/lines tab, so
    // DetailView's own lines-section code (which assumes hook.children is an
    // array) never runs — this isolates buildHeaderFormData's own defensive
    // guard for a caller whose hook.children is not an array.
    mockHook.children = undefined;
    render(<DetailView {...BASE_PROPS} DetailTable={null} />);

    expect(screen.getByTestId('field-warehouse')).not.toBeDisabled();
  });

  it('When a line is added (hook.children.length > 0), Then warehouse becomes read-only', () => {
    mockHook.children = [];
    const { rerender } = render(<DetailView {...BASE_PROPS} />);
    expect(screen.getByTestId('field-warehouse')).not.toBeDisabled();

    mockHook.children = [{ id: 'line-1', product: 'P1' }];
    rerender(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('field-warehouse')).toBeDisabled();
  });

  it('Given lines exist, When the last line is removed, Then warehouse re-enables', () => {
    mockHook.children = [{ id: 'line-1', product: 'P1' }];
    const { rerender } = render(<DetailView {...BASE_PROPS} />);
    expect(screen.getByTestId('field-warehouse')).toBeDisabled();

    mockHook.children = [];
    rerender(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('field-warehouse')).not.toBeDisabled();
  });
});

describe('DetailView save-path regression (ETP-5052) — hasLines never leaks upstream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.children = [{ id: 'line-1', product: 'P1' }]; // hasLines would be true
    setRecord({});
  });

  it('editing an always-editable header field only forwards (field, value) to hook.handleChange — never a hasLines key', async () => {
    const user = userEvent.setup();
    render(<DetailView {...BASE_PROPS} />);

    const descriptionInput = screen.getByTestId('field-description');
    await user.type(descriptionInput, 'x');

    expect(mockHook.handleChange).toHaveBeenCalled();
    // Every call must target a real record field, never the synthetic merge key.
    for (const call of mockHook.handleChange.mock.calls) {
      expect(call[0]).not.toBe('hasLines');
    }
    // At least one call was the field we actually edited.
    expect(mockHook.handleChange.mock.calls.some((call) => call[0] === 'description')).toBe(true);
  });
});
