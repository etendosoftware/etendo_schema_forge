import { render, screen } from '@testing-library/react';

// Regression coverage for ETP-4529: DetailView's "principal" section used to
// hardcode `visibility: {}` on the Form call, ignoring whatever
// useDisplayLogic() actually resolved from the NEO evaluate-display endpoint.
// That meant ANY field gated purely by server-side visibility (no
// function-based `displayLogic`, e.g. fields driven by the
// `@ACCT_DIMENSION_DISPLAY@` AD macro) rendered as always-visible in the
// principal section no matter what the evaluator said, because the real
// `displayLogic.visibility` map never reached the Form.
//
// This test mounts the REAL EntityForm (not a stub) as DetailView's `Form`
// prop — exactly like a generated HeaderForm.jsx wrapper does — so the
// hidden-field assertion only passes if DetailView actually forwards the
// live useDisplayLogic() result into the principal Form call. Against the
// old hardcoded `visibility: {}` code, the "hidden" test below would have
// failed (the field would still render).
//
// Mock setup mirrors DetailView.draftModeStatusField.vitest.jsx (minimal
// harness proven to mount the whole component) plus the extra stubs
// EntityForm.render.vitest.jsx uses for EntityForm's own heavy children.

const displayLogicState = vi.hoisted(() => ({
  current: { readOnly: {}, visibility: {} },
}));

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

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
// This is the mock under test: it stands in for the real NEO
// evaluate-display round trip. Each test swaps displayLogicState.current to
// simulate a different server answer.
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => displayLogicState.current,
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

// Field shaped exactly like the real generated output for a server-macro
// field: no `displayLogic` key at all — only the markers
// buildDisplayLogicPart() (generate-frontend.js) emits for non-evaluable raw
// AD expressions such as `@ACCT_DIMENSION_DISPLAY@`.
const PRINCIPAL_FIELDS = [
  { key: 'visibleField', label: 'Visible Field', type: 'text', column: 'VisibleField', section: 'principal' },
  {
    key: 'hiddenField',
    label: 'Hidden Field',
    type: 'text',
    column: 'HiddenField',
    section: 'principal',
    visible: null,
    visibilitySource: 'server',
    displayLogicReason: 'server-macro',
  },
];

// Mirrors a generated HeaderForm.jsx wrapper (see e.g.
// artifacts/payment-term/generated/web/payment-term/HeaderForm.jsx): binds
// the window's field list onto the shared EntityForm and forwards
// everything DetailView passes through (including `displayLogic`).
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
  entityLabel: 'Test Window',
  detailLabel: 'Lines',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'test-window',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

function setRecord(fields) {
  const rec = { id: '123', documentNo: 'DOC-001', ...fields };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView principal section — forwards real displayLogic (ETP-4529 regression)', () => {
  beforeEach(() => {
    displayLogicState.current = { readOnly: {}, visibility: {} };
    setRecord({ visibleField: 'A', hiddenField: 'B' });
  });

  it('hides a server-gated field when evaluate-display resolves visibility=false', () => {
    displayLogicState.current = { readOnly: {}, visibility: { hiddenField: false } };
    render(<DetailView {...BASE_PROPS} />);

    // Proves the live useDisplayLogic() result reached the principal Form
    // call — under the old hardcoded `visibility: {}` code this field would
    // still render because DetailView never passed the real map through.
    // (Labels resolve through the mocked useLabel(), which echoes the AD
    // column name — "VisibleField"/"HiddenField" — not the fixture's
    // human-readable `label` string, so we assert on that plus the
    // field's own `data-testid` for an unambiguous signal.)
    expect(screen.getByTestId('field-visibleField')).toBeInTheDocument();
    expect(screen.queryByText('VisibleField')).toBeInTheDocument();
    expect(screen.queryByTestId('field-hiddenField')).not.toBeInTheDocument();
    expect(screen.queryByText('HiddenField')).not.toBeInTheDocument();
  });

  it('keeps the server-gated field visible when evaluate-display resolves visibility=true', () => {
    displayLogicState.current = { readOnly: {}, visibility: { hiddenField: true } };
    render(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('field-visibleField')).toBeInTheDocument();
    expect(screen.getByTestId('field-hiddenField')).toBeInTheDocument();
  });

  it('keeps the server-gated field visible (fail-open) when its key is absent from the visibility map', () => {
    displayLogicState.current = { readOnly: {}, visibility: {} };
    render(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('field-visibleField')).toBeInTheDocument();
    expect(screen.getByTestId('field-hiddenField')).toBeInTheDocument();
  });
});
