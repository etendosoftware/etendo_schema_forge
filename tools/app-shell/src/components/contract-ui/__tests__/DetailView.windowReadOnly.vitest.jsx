/**
 * Behavioral test for the window-level read-only gate on the DetailView toolbar
 * Delete button (ETP-4474).
 *
 * A GO view-only window (decisions.json → window.readOnly, threaded to the
 * frontend as api.window.readOnly === true) must never expose the toolbar
 * Delete action, even on an existing (non-new) record that would otherwise be
 * deletable. DetailView derives `windowReadOnly` and ORs it into the
 * `hideDeleteButton` argument of the exported `isDeleteButtonVisible` pure
 * function at the call site — that OR is the branch exercised here.
 *
 * Harness mirrors DetailView.deleteActionFallback.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/conversion-rates/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

function makeHook(data) {
  return {
    loading: false,
    items: [],
    selected: data,
    editing: data,
    children: [],
    isDirtyHeader: false,
    loadingChildren: false,
    childrenLoading: false,
    error: null,
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
    refreshChildren: vi.fn(),
    isSaving: false,
    primeSaved: vi.fn(),
  };
}

let currentHook = makeHook({ id: '123', documentNo: 'CR-001', status: 'DR', processed: false });

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => currentHook,
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }),
}));

vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogClose: ({ children }) => children,
}));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

import { DetailView } from '../DetailView.jsx';

const MockForm = ({ data }) => <div data-testid="mock-form"><span>{data?.documentNo}</span></div>;

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity={null}
        Form={MockForm}
        DetailTable={null}
        DetailForm={null}
        summary={[]}
        statusField="status"
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Conversion Rate"
        detailLabel="Lines"
        titleField="documentNo"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/conversion-rates"
        breadcrumb="Finance / Conversion Rates"
        windowName="conversion-rates"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView — window.readOnly toolbar Delete gate (ETP-4474)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    currentHook = makeHook({ id: '123', documentNo: 'CR-001', status: 'DR', processed: false });
  });

  it('hides the toolbar Delete button on an existing record when api.window.readOnly is true', () => {
    renderDetailView({ api: { window: { readOnly: true } } });
    expect(screen.queryByTestId('action-delete')).toBeNull();
  });

  it('shows the toolbar Delete button when api.window.readOnly is absent (regression)', () => {
    renderDetailView({ api: {} });
    expect(screen.getByTestId('action-delete')).toBeTruthy();
  });

  // ETP-4520 — the runtime per-tier override passed via the `window` prop
  // (buildWindowAccessWiring's effectiveWindow / the hand-wired custom windows'
  // equivalent), distinct from the static api.window.readOnly case above.
  it('hides the toolbar Delete button on an existing record when window.readOnly is true', () => {
    renderDetailView({ api: {}, window: { readOnly: true } });
    expect(screen.queryByTestId('action-delete')).toBeNull();
  });
});
