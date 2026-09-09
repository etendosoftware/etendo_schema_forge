/**
 * Behavioral test for the window-level read-only gate on the DetailView toolbar
 * "more actions" kebab button (ETP-5116).
 *
 * A read-only window access role (decisions.json → window.readOnly, threaded to
 * the frontend as api.window.readOnly === true, or the runtime per-tier
 * `window` prop override) must never expose write actions (Reactivate, Post,
 * Void, etc.) through the kebab menu — the whole button must not render, not
 * just its item list. DetailView derives `windowReadOnly` and passes it down to
 * DetailMoreActionsMenu, which collapses both `visibleActions` and
 * `hasCustomContent` to their empty/falsy state, so the pre-existing
 * `visibleActions.length === 0 && !hasCustomContent` guard hides the button.
 *
 * Harness mirrors DetailView.windowReadOnly.vitest.jsx (ETP-4474/ETP-4520).
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

// At least one write action, so the pre-ETP-5116 baseline would render the kebab.
const menuActions = [{ key: 'reactivate', label: 'Reactivate', documentAction: 'RE' }];

// A stand-in for the real write-firing custom kebab content
// (GoodsShipmentMoreMenu/InventoryMenuContent/InternalConsumptionActions).
const CustomMenuContent = () => <div data-testid="custom-menu-content">custom action</div>;

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
        menuActions={menuActions}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView — window.readOnly "more actions" kebab gate (ETP-5116)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    currentHook = makeHook({ id: '123', documentNo: 'CR-001', status: 'DR', processed: false });
  });

  it('shows the kebab button when api.window.readOnly is absent (regression baseline)', () => {
    renderDetailView({ api: {} });
    expect(screen.queryByTestId('action-more')).toBeTruthy();
  });

  it('hides the kebab button entirely when api.window.readOnly is true', () => {
    renderDetailView({ api: { window: { readOnly: true } } });
    expect(screen.queryByTestId('action-more')).toBeNull();
  });

  // ETP-4520 pattern — the runtime per-tier override passed via the `window`
  // prop, distinct from the static api.window.readOnly case above.
  it('hides the kebab button entirely when window.readOnly is true (runtime override)', () => {
    renderDetailView({ api: {}, window: { readOnly: true } });
    expect(screen.queryByTestId('action-more')).toBeNull();
  });

  it('hides the kebab button even when customMenuContent would otherwise render content', () => {
    renderDetailView({
      api: { window: { readOnly: true } },
      menuActions: [],
      customMenuContent: CustomMenuContent,
    });
    expect(screen.queryByTestId('action-more')).toBeNull();
    expect(screen.queryByTestId('custom-menu-content')).toBeNull();
  });
});
