/**
 * Tests for `dispatchProcessAction`, the pure toolbar-process-button click
 * dispatcher. Covers the `confirmModal` override added alongside the
 * `style === 'ghost-danger'` gate — a process button can now require a
 * confirmation modal without being forced into the "danger" visual style
 * (red border + undo icon) that 'ghost-danger' also carries.
 */
import { dispatchProcessAction, maybeSaveBeforeProcess } from '../DetailView.jsx';

// Mock all the heavy dependencies DetailView imports
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/', search: '' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({}), extractErrorMessage: vi.fn() }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({}) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({}) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({}) }));
vi.mock('@/hooks/useLineGrossAmount', () => ({ useLineGrossAmount: () => ({}), ORDER_LINE_CONFIG: {} }));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({}) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));
vi.mock('../DocumentStatusPill.jsx', () => ({
  DocumentStatusPill: ({ status }) => <span data-testid="doc-status-pill">{status}</span>,
  default: ({ status }) => <span data-testid="doc-status-pill">{status}</span>,
}));

function makeCallbacks() {
  return {
    processConfirmModal: () => null, // truthy — a modal component is configured
    setConfirmProcess: vi.fn(),
    setParamDialogProcess: vi.fn(),
    handleProcess: vi.fn(),
  };
}

describe('dispatchProcessAction', () => {
  it('opens the confirm modal for style: ghost-danger (existing behavior)', () => {
    const cb = makeCallbacks();
    dispatchProcessAction({ style: 'ghost-danger', name: 'Reactivate' }, cb);
    expect(cb.setConfirmProcess).toHaveBeenCalledWith({ style: 'ghost-danger', name: 'Reactivate' });
    expect(cb.handleProcess).not.toHaveBeenCalled();
  });

  it('opens the confirm modal for confirmModal: true even when style is positive', () => {
    const cb = makeCallbacks();
    const process = { style: 'positive', confirmModal: true, columnName: 'aPRMProcessPayment' };
    dispatchProcessAction(process, cb);
    expect(cb.setConfirmProcess).toHaveBeenCalledWith(process);
    expect(cb.handleProcess).not.toHaveBeenCalled();
  });

  it('does not open the confirm modal when confirmModal is unset and style is positive', () => {
    const cb = makeCallbacks();
    dispatchProcessAction({ style: 'positive', name: 'DoStuff' }, cb);
    expect(cb.setConfirmProcess).not.toHaveBeenCalled();
    expect(cb.handleProcess).toHaveBeenCalled();
  });

  it('ignores confirmModal when processConfirmModal is not configured', () => {
    const cb = { ...makeCallbacks(), processConfirmModal: null };
    dispatchProcessAction({ style: 'positive', confirmModal: true }, cb);
    expect(cb.setConfirmProcess).not.toHaveBeenCalled();
    expect(cb.handleProcess).toHaveBeenCalled();
  });

  it('opens the param dialog when the process has visible params and no confirm gate applies', () => {
    const cb = makeCallbacks();
    const process = { style: 'positive', params: [{ hidden: false }] };
    dispatchProcessAction(process, cb);
    expect(cb.setParamDialogProcess).toHaveBeenCalledWith(process);
    expect(cb.handleProcess).not.toHaveBeenCalled();
  });

  it('falls through to handleProcess when there is no confirm gate and no visible params', () => {
    const cb = makeCallbacks();
    const process = { style: 'positive', params: [{ hidden: true }] };
    dispatchProcessAction(process, cb);
    expect(cb.handleProcess).toHaveBeenCalledWith(process);
  });
});

// ETP-4542: opt-in "save before process" gate. Covers the four behaviors the
// toolbar process-button onClick relies on before calling dispatchProcessAction.
describe('maybeSaveBeforeProcess', () => {
  it('dirty + successful save → saves silently and allows the process to run', async () => {
    const handleSave = vi.fn().mockResolvedValue({ id: 'A1' });
    const proceed = await maybeSaveBeforeProcess({ saveBeforeProcesses: true, isDirty: true, handleSave });
    expect(handleSave).toHaveBeenCalledWith({ silent: true });
    expect(proceed).toBe(true);
  });

  it('dirty + failed save → aborts the process (returns false)', async () => {
    // handleSave returns null on validation/required/numeric/backend failure.
    const handleSave = vi.fn().mockResolvedValue(null);
    const proceed = await maybeSaveBeforeProcess({ saveBeforeProcesses: true, isDirty: true, handleSave });
    expect(handleSave).toHaveBeenCalledWith({ silent: true });
    expect(proceed).toBe(false);
  });

  it('not dirty → runs the process directly without saving', async () => {
    const handleSave = vi.fn();
    const proceed = await maybeSaveBeforeProcess({ saveBeforeProcesses: true, isDirty: false, handleSave });
    expect(handleSave).not.toHaveBeenCalled();
    expect(proceed).toBe(true);
  });

  it('without the saveBeforeProcesses flag → never saves, even when dirty', async () => {
    const handleSave = vi.fn();
    const proceed = await maybeSaveBeforeProcess({ saveBeforeProcesses: false, isDirty: true, handleSave });
    expect(handleSave).not.toHaveBeenCalled();
    expect(proceed).toBe(true);
  });
});
