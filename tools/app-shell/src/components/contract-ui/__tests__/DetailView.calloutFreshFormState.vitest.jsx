/**
 * Regression test for ETP-4600: fireCallout must send the callout endpoint a
 * formState snapshot that already includes the field change that triggered it.
 *
 * Root cause: fireCallout read `hook.editing` from its useCallback closure, which
 * is captured BEFORE the `hook.handleChange` setState (called on the line right
 * above it inside handleChangeWithCallout) commits. Since setEditing is async and
 * batched by React, every callout fired synchronously on a field change carried a
 * one-render-stale formState for that very field — e.g. selecting an FK posted
 * formState with that FK still empty, which could make the backend respond with
 * defaults that clobber other fields the user just set (observed regression:
 * toggling "Depreciar" on, saving a new asset, and the persisted record coming
 * back with depreciate=false because the assetCategory callout's stale
 * formState.assetCategory === "" caused the backend to reset depreciate).
 *
 * Fix: DetailView keeps a `pendingEditingRef` mirroring hook.editing, updated
 * synchronously in handleChangeWithCallout before firing the callout, so
 * fireCallout always reads the up-to-date snapshot instead of the stale closure.
 *
 * This test mounts the real DetailView with a Form mock that exposes onChange
 * (= handleChangeWithCallout), backed by a fake useEntity hook whose `editing`
 * comes from real useState (so it behaves like production: async/batched
 * setState, stale until the batch flushes), and asserts the callout's
 * formState reflects the field just changed — even across two changes fired
 * back-to-back in the same synchronous tick.
 */
import { useCallback, useState } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/assets/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const INITIAL_EDITING = { id: '123', documentNo: 'AST-001', documentStatus: 'DR', processed: false, assetCategory: '', depreciate: true };

const executeCallout = vi.fn();

// Faithful-enough stand-in for the real useEntity hook: `editing` comes from
// useState, and `handleChange` updates it via the async/batched functional
// setState form — exactly like production (see hooks/useEntity.js). This
// matters because it reproduces the real stale-closure hazard: within a single
// `act()` block, React batches state updates and does NOT re-render between
// them, so `hook.editing` read from a useCallback closure stays at its
// pre-batch value until the batch flushes. A naive mutable-object mock would
// hide this bug entirely (property reads would be "live"), so this hook
// mirrors the real state mechanics instead.
function useFakeEntityHook() {
  const [editing, setEditing] = useState(INITIAL_EDITING);
  const handleChange = useCallback((field, value) => {
    setEditing(prev => ({ ...prev, [field]: value }));
  }, []);
  return {
    loading: false,
    items: [],
    selected: editing,
    editing,
    children: [],
    isDirtyHeader: false,
    loadingChildren: false,
    childrenLoading: false,
    error: null,
    handleChange,
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => useFakeEntityHook(),
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout,
  }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
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
vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => v != null ? String(v) : '—' }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span data-testid="status-pill">{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

// --- Capture onChange (= handleChangeWithCallout) from the Form prop ---
const captured = { onChange: null };
const CapturingForm = ({ data, onChange }) => {
  captured.onChange = onChange;
  return <div data-testid="mock-form">{data?.documentNo}</div>;
};

const MockTable = () => <div data-testid="mock-table" />;

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={CapturingForm}
        DetailTable={MockTable}
        DetailForm={null}
        summary={[]}
        statusField="documentStatus"
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Assets"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="assets"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/assets"
        breadcrumb="Assets"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView callout formState freshness (ETP-4600 regression)', () => {
  beforeEach(() => {
    executeCallout.mockClear();
  });

  it('sends the just-changed field value in formState, not the pre-change snapshot', () => {
    renderDetailView();
    const uuid = 'A67EAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 32-char hex-ish UUID shape

    act(() => {
      captured.onChange('assetCategory', uuid);
    });

    expect(executeCallout).toHaveBeenCalledTimes(1);
    const [field, value, formState] = executeCallout.mock.calls[0];
    expect(field).toBe('assetCategory');
    expect(value).toBe(uuid);
    // This is the crux of the bug: formState must already carry the new value.
    expect(formState.assetCategory).toBe(uuid);
    // And must NOT be the stale/pre-change value.
    expect(formState.assetCategory).not.toBe('');
    // Sibling fields the user set earlier in the session must not be lost.
    expect(formState.depreciate).toBe(true);
  });

  it('keeps each field fresh across two changes fired in the same synchronous tick', () => {
    renderDetailView();
    const uuid = 'B67EAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    act(() => {
      // Simulates a selector setting the FK id and its identifier/aux sibling
      // back-to-back before React flushes state — both go through
      // handleChangeWithCallout synchronously in the same batch.
      captured.onChange('assetCategory', uuid);
      captured.onChange('someAmount', '42');
    });

    expect(executeCallout).toHaveBeenCalledTimes(2);
    const secondCallFormState = executeCallout.mock.calls[1][2];
    // The second callout's formState must see BOTH the first change (assetCategory)
    // and its own field (someAmount) — proving the snapshot isn't stuck at the
    // pre-batch render value for either field.
    expect(secondCallFormState.assetCategory).toBe(uuid);
    expect(secondCallFormState.someAmount).toBe('42');
  });
});
