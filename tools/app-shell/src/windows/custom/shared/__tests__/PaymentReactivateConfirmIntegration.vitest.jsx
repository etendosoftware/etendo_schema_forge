/**
 * Integration regression test for ETP-4332: clicking "Reactivar" on a
 * deposited payment's FORM/DETAIL toolbar must show a confirmation modal
 * BEFORE the reactivate process fires — never reactivate immediately.
 *
 * Context: `DetailView.dispatchProcessAction.vitest.jsx` already proves the
 * pure `dispatchProcessAction(p, ctx)` function takes the "open confirm
 * modal" branch for a `style: 'ghost-danger'` process when `processConfirmModal`
 * is truthy. That test mocks every callback directly, so it can never catch a
 * bug in how `processConfirmModal` actually gets threaded from the generated
 * page (`FinPaymentPage.jsx` / `HeaderPage.jsx`) down through the real
 * `<DetailView>` toolbar-button closure into that function at runtime.
 *
 * This suite renders the REAL generated `FinPaymentPage` (payment-in) and
 * `HeaderPage` (payment-out) — not a mock of DetailView — through the REAL
 * `DetailView` component (only its hooks are mocked, matching the existing
 * `DetailView.processesAndBadges.vitest.jsx` convention), with the REAL
 * `ReactivarConfirmModal` -> `ReactivarModal` chain, and drives an actual
 * click on the actual toolbar button.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/payment-in/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// ETP-4520 batch regen (00062c488) wired `useWindowAccess`/`WindowAccessGuard`
// into every generated Page — including payment-in/payment-out — reading them
// from `@/auth/AuthContext.jsx`. This suite renders those REAL generated pages
// with no `AuthProvider` ancestor, so the real hook throws "must be used
// within AuthProvider". Mocked here the same way
// `PurchaseInvoiceTopbar.vitest.jsx` mocks `@etendosoftware/app-shell-core/auth`
// for the identical situation — full, non-fail-closed access so the guard
// never blocks the render and the reactivate-confirm assertions are
// unaffected.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn(), windowAccess: {}, capabilities: {} }),
  useWindowAccess: () => 'full',
  useHasCapability: () => true,
  WindowAccessGuard: ({ children }) => children,
  AuthProvider: ({ children }) => children,
}));

// The payment topbar now also carries the PIS retry action (ETP-4895), which reaches for
// `useApiFetch` — and that resolves `useAuth` from the app-shell-core package, not the aliased
// path mocked above, so it throws outside an AuthProvider. Stubbed for the same reason: this suite
// is about the reactivate-confirm chain, and the retry button renders nothing for these payments.
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => vi.fn() }));

// One shared, mutable hook double per test file — mirrors the convention in
// DetailView.processesAndBadges.vitest.jsx. `handleProcess` is the spy we
// assert on: if it fires before the modal's confirm button is clicked, the
// bug is reproduced.
const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'PAY-001', status: 'RPR' },
  editing: { id: '123', documentNo: 'PAY-001', status: 'RPR' },
  children: [],
  childDefaults: {},
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn().mockResolvedValue(undefined),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refreshChildren: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set(), visibility: {}, readOnly: {} }),
}));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ computeLineGrossAmount: vi.fn(), resolveTaxFactor: () => 1, prepareLineForPost: (l) => l }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn(), loading: false }) }));
// `useUI` intentionally returns the raw key (like every other DetailView
// suite) — real i18n resolution isn't the point here, wiring is. ReactivarModal
// renders these keys as visible text, which is what we assert on below.
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
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

vi.mock('../../../../components/contract-ui/DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../../../../components/contract-ui/SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../../../../components/contract-ui/DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/contract-ui/BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/contract-ui/LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/contract-ui/DocumentStatusPill.jsx', () => ({ default: ({ label, status }) => <span data-testid="status-pill">{label ?? status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

// `EntityForm` is what FinPaymentForm/HeaderForm actually render (they're
// one-line wrappers around it). It's the heaviest leaf in the tree and
// irrelevant to the reactivate-confirm wiring, so it's stubbed here — but
// `DetailView` itself is left untouched (comes from `vi.importActual` below),
// exactly like `DetailView.processesAndBadges.vitest.jsx` does for `ListView`.
vi.mock('@/components/contract-ui', async () => {
  const actual = await vi.importActual('@/components/contract-ui');
  return {
    ...actual,
    EntityForm: ({ data }) => <div data-testid="mock-entity-form">{data?.documentNo}</div>,
  };
});

// Custom slot components (bottomSection / topbarExtra / sidePanel / customTabs /
// list Table / new-record modal) are unrelated to the reactivate-confirm flow —
// stub them so the test only has to satisfy their prop contract, not their
// full internal behavior (fetches, localStorage, etc.).
vi.mock('@generated/payment-in/custom/PaymentHeaderTable', () => ({ default: () => <div data-testid="stub-table" /> }));
vi.mock('@generated/payment-in/custom/PaymentBottomPanel', () => ({ default: () => <div data-testid="stub-bottom-section" /> }));
vi.mock('@generated/payment-in/custom/PaymentConciliadoBadge', () => ({ default: () => <div data-testid="stub-topbar-extra" /> }));
vi.mock('@generated/payment-in/custom/PaymentDetailSidebar', () => ({ default: () => <div data-testid="stub-side-panel" /> }));
vi.mock('@generated/payment-in/custom/NewPaymentModal', () => ({ default: () => null }));
vi.mock('@generated/payment-in/custom/RelatedDocuments', () => ({ default: () => <div data-testid="stub-related-documents" /> }));

vi.mock('@generated/payment-out/custom/PaymentHeaderTable', () => ({ default: () => <div data-testid="stub-table" /> }));
vi.mock('@generated/payment-out/custom/PaymentOutBottomPanel', () => ({ default: () => <div data-testid="stub-bottom-section" /> }));
vi.mock('@generated/payment-out/custom/PaymentConciliadoBadge', () => ({ default: () => <div data-testid="stub-topbar-extra" /> }));
vi.mock('@generated/payment-out/custom/PaymentDetailSidebar', () => ({ default: () => <div data-testid="stub-side-panel" /> }));

// NOTE — deliberately NOT mocked: `ReactivarConfirmModal` (payment-in/out
// custom) and its real children `PaymentLifecycleConfirmModal.jsx` /
// `LifecycleConfirmModal.jsx` / `ConfirmPaymentModal.jsx`
// (tools/app-shell/src/windows/custom/shared/). Those must render for real so
// this test actually observes the confirm modal appearing (or not).

import FinPaymentPage from '@generated/payment-in/generated/web/payment-in/FinPaymentPage';
import HeaderPage from '@generated/payment-out/generated/web/payment-out/HeaderPage';

function resetMockHook() {
  mockHook.selected = { id: '123', documentNo: 'PAY-001', status: 'RPR' };
  mockHook.editing = { id: '123', documentNo: 'PAY-001', status: 'RPR' };
  mockHook.handleProcess.mockClear();
}

async function renderDetail(Page, windowName) {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <Page windowName={windowName} recordId="123" token="test-token" apiBaseUrl={`/api/${windowName}`} />
      </MemoryRouter>,
    );
  });
  return utils;
}

describe.each([
  ['payment-in (FinPaymentPage)', FinPaymentPage, 'payment-in'],
  ['payment-out (HeaderPage)', HeaderPage, 'payment-out'],
])('Reactivar toolbar button — %s', (_label, Page, windowName) => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    resetMockHook();
  });

  it('renders the toolbar Reactivar button for a deposited (non-RPAP) payment', async () => {
    await renderDetail(Page, windowName);
    expect(screen.getByText('processReactivate')).toBeInTheDocument();
  });

  it('shows the confirmation modal on click WITHOUT calling handleProcess yet (regression guard)', async () => {
    const user = userEvent.setup();
    await renderDetail(Page, windowName);

    // Sanity: no confirm modal present before the click. Fixture record has
    // status: 'RPR' — a DEPOSITED status but NOT 'RPPC' (reconciled), so
    // under PaymentLifecycleConfirmModal's derivation reconciled is false
    // and the NON-reconciled reactivate title key is expected.
    expect(screen.queryByText('paymentConfirmReactivateTitleIn')).toBeNull();
    expect(screen.queryByText('paymentConfirmReactivateTitleOut')).toBeNull();

    const reactivateBtn = screen.getByText('processReactivate');
    await act(async () => { await user.click(reactivateBtn); });

    // THE BUG, if present: handleProcess fires immediately on click, with no
    // modal ever appearing. The correct behavior is the opposite: the modal
    // appears and handleProcess is NOT called until the user confirms.
    expect(mockHook.handleProcess).not.toHaveBeenCalled();

    const expectedTitleKey = windowName === 'payment-in' ? 'paymentConfirmReactivateTitleIn' : 'paymentConfirmReactivateTitleOut';
    await waitFor(() => {
      expect(screen.getByText(expectedTitleKey)).toBeInTheDocument();
    });
  });

  it('only calls handleProcess with the reactivate process after the modal is confirmed', async () => {
    const user = userEvent.setup();
    await renderDetail(Page, windowName);

    const reactivateBtn = screen.getByText('processReactivate');
    await act(async () => { await user.click(reactivateBtn); });

    // Confirm button label key is direction-agnostic — same key used for
    // both payment-in and payment-out (only the title differs by direction).
    const confirmBtn = await screen.findByText('paymentConfirmReactivateBtn');
    await act(async () => { await user.click(confirmBtn); });

    await waitFor(() => {
      expect(mockHook.handleProcess).toHaveBeenCalledTimes(1);
    });
    expect(mockHook.handleProcess.mock.calls[0][0]).toMatchObject({ name: 'etprReactivatePayment' });
  });

  it('closing the modal via cancel also never calls handleProcess', async () => {
    const user = userEvent.setup();
    await renderDetail(Page, windowName);

    const reactivateBtn = screen.getByText('processReactivate');
    await act(async () => { await user.click(reactivateBtn); });

    // NOTE: `screen.findByText('cancel')` is ambiguous here — DetailView's own
    // toolbar renders a "Cancel" button too (`data-testid="action-cancel"`,
    // navigates back to the list), which also resolves to the raw i18n key
    // 'cancel' under this test's `useUI` mock. `ReactivarModal` is a plain
    // fixed-position overlay (no `Dialog` wrapper, no own data-testid), so
    // filter out the toolbar's button by its testid to unambiguously target
    // the modal's own Cancel button.
    const cancelCandidates = await screen.findAllByText('cancel');
    const cancelBtn = cancelCandidates.find((el) => el.getAttribute('data-testid') !== 'action-cancel');
    expect(cancelBtn).toBeTruthy();
    await act(async () => { await user.click(cancelBtn); });

    expect(mockHook.handleProcess).not.toHaveBeenCalled();
    const expectedTitleKey = windowName === 'payment-in' ? 'paymentConfirmReactivateTitleIn' : 'paymentConfirmReactivateTitleOut';
    expect(screen.queryByText(expectedTitleKey)).toBeNull();
  });
});
