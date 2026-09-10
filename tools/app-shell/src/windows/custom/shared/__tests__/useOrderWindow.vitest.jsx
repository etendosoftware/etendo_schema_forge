import { act, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node) => node,
  };
});

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const useBulkActionToast = vi.fn();
vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: () => useBulkActionToast(),
}));

let rowDeleteConfig;
const requestDelete = vi.fn();
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: vi.fn((config) => {
    rowDeleteConfig = config;
    return {
      requestDelete,
      deleteDialog: <div data-testid="delete-dialog" />,
    };
  }),
}));

const clearSavedRecord = vi.fn();
vi.mock('../useSavedPreviewRecord.js', () => ({
  useSavedPreviewRecord: () => ({
    effectiveRecord: { id: 'saved-1' },
    clearSavedRecord,
  }),
}));

const fetchOptionalJson = vi.fn();
// Partial mock: only fetchOptionalJson is stubbed. The rest must stay real because the
// module graph now reaches pdfUtils through documentPdfRegistry.js -> the movement-document
// hooks, which read COMMON_HANDLEBARS_HELPERS and the MOVEMENT_TEMPLATE_* constants at
// import time (ETP-4912). A total mock silently breaks as soon as another module in the
// graph needs one of those.
vi.mock('../pdfUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchOptionalJson: (...args) => fetchOptionalJson(...args),
}));

vi.mock('../OrderPreview.jsx', () => ({
  default: ({ order, onClose, onEdit }) => (
    <div data-testid="order-preview">
      <span>{order.id}</span>
      <button type="button" onClick={onClose}>close preview</button>
      <button type="button" onClick={onEdit}>edit preview</button>
    </div>
  ),
}));

import { toast } from 'sonner';
import { useOrderWindow } from '../useOrderWindow.jsx';

function ConfirmModal({ orderId, onClose, onConfirmed }) {
  return (
    <div data-testid="confirm-modal">
      <span>{orderId}</span>
      <button type="button" onClick={onClose}>close confirm</button>
      <button
        type="button"
        onClick={() => onConfirmed({
          shipment: { id: 'ship-1', documentNo: 'GS-1', amount: 10 },
          invoice: { id: 'inv-1', documentNo: 'SI-1', amount: 20 },
        })}
      >
        confirm docs
      </button>
    </div>
  );
}

function ConfirmResultModal({ docs, currency, navigate: modalNavigate, onClose }) {
  return (
    <div data-testid="confirm-result">
      <span>{currency}</span>
      <span>{docs.map((doc) => doc.num).join('|')}</span>
      <button type="button" onClick={() => modalNavigate('/sales-invoice/inv-1')}>go invoice</button>
      <button type="button" onClick={onClose}>close result</button>
    </div>
  );
}

function ManageDocsLauncher({ orderId, onClose, onCreated }) {
  return (
    <div data-testid="manage-docs">
      <span>{orderId}</span>
      <button type="button" onClick={onClose}>close manage</button>
      <button type="button" onClick={onCreated}>created docs</button>
    </div>
  );
}

function renderOrderHook(props = {}) {
  return renderHook(() => useOrderWindow({
    windowName: 'sales-order',
    token: 'tok',
    apiBaseUrl: '/sws/neo/sales-order',
    specName: 'sales-order',
    deliveryKey: 'deliveryStatus',
    manageLabelKeys: {
      both: 'manageBoth',
      primary: 'manageShipment',
      invoice: 'manageInvoice',
    },
    confirmLabelKey: 'confirmOrder',
    headers: { Authorization: 'Bearer tok', 'Accept-Language': 'es_ES' },
    ConfirmModal,
    ConfirmResultModal,
    ManageDocsLauncher,
    setCloneTargets: vi.fn(),
    ...props,
  }));
}

describe('useOrderWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowDeleteConfig = null;
    fetchOptionalJson.mockResolvedValue(null);
  });

  it('wires base actions, preview rendering, delete refresh, and optional reactivate action', () => {
    const setCloneTargets = vi.fn();
    const { result } = renderOrderHook({ setCloneTargets, showReactivate: true });

    expect(useBulkActionToast).toHaveBeenCalled();
    expect(rowDeleteConfig).toMatchObject({
      apiBaseUrl: '/sws/neo/sales-order',
      entity: 'header',
      token: 'tok',
    });
    expect(result.current.effectiveRecord).toEqual({ id: 'saved-1' });
    expect(result.current.clearSavedRecord).toBe(clearSavedRecord);
    expect(result.current.deleteDialog.props['data-testid']).toBe('delete-dialog');

    result.current.rowQuickActions.onEdit({ id: 'so-1' });
    expect(navigate).toHaveBeenCalledWith('/sales-order/so-1');

    result.current.rowQuickActions.onClone({ id: 'so-2' });
    expect(setCloneTargets).toHaveBeenCalledWith([{ id: 'so-2' }]);

    result.current.rowQuickActions.onDelete({ id: 'so-3' });
    expect(requestDelete).toHaveBeenCalledWith({ id: 'so-3' });

    act(() => rowDeleteConfig.onSuccess());
    expect(result.current.refreshKey).toBe(1);

    const preview = result.current.renderPreview({ row: { id: 'so-preview' }, onClose: vi.fn(), onEdit: vi.fn() });
    render(preview);
    expect(screen.getByTestId('order-preview')).toHaveTextContent('so-preview');

    const actions = result.current.rowQuickActions.menuActions({
      row: { id: 'so-4', deliveryStatus: 100, invoiceStatus: 100, hasLinkedDocuments: false },
      status: 'CO',
    });
    expect(actions.find((action) => action.key === 'reactivate')).toMatchObject({
      documentAction: 'RE',
      visible: true,
    });

    act(() => result.current.rowQuickActions.onMenuActionExecuted({ documentAction: 'RE' }));
    expect(result.current.refreshKey).toBe(2);
  });

  // ETP-4717 — this hook builds rowQuickActions by hand (bypassing the
  // generated contract's rowQuickActions.actions.email.visibleWhen), so the
  // gate must be asserted here directly. Regression: without it, the Grid
  // "Enviar" (email) quick action shows on every row regardless of status,
  // shared by both sales-order and purchase-order.
  it('gates the row-hover email quick action to Confirmed orders (CO)', () => {
    const { result } = renderOrderHook();
    expect(result.current.rowQuickActions.actions.email).toEqual({
      visibleWhen: "@DocumentStatus@='CO'",
    });
  });

  it('blocks confirmation when exchange rate is missing, then opens confirmation and result portals', async () => {
    const { result } = renderOrderHook();
    const row = {
      id: 'so-10',
      documentStatus: 'DR',
      deliveryStatus: 0,
      invoiceStatus: 0,
      currency: 'EUR',
      currency$_identifier: 'EUR',
      orderDate: '2026-07-01',
    };

    fetchOptionalJson
      .mockResolvedValueOnce({ organization: { currency: 'USD-ID', currency$_identifier: 'USD' } })
      .mockResolvedValueOnce({ hasRate: false });

    const [confirmAction, manageAction] = result.current.rowQuickActions.menuActions({ row, status: 'DR' });
    expect(confirmAction).toMatchObject({ key: 'confirm', label: 'confirmOrder', visible: true });
    expect(manageAction.visible).toBe(false);

    await act(async () => {
      await confirmAction.onClick({ row });
    });
    expect(toast.error).toHaveBeenCalledWith('noExchangeRateAvailable');
    expect(result.current.confirmPortal).toBeNull();

    fetchOptionalJson
      .mockResolvedValueOnce({ organization: { currency: 'USD-ID', currency$_identifier: 'USD' } })
      .mockResolvedValueOnce({ hasRate: true });

    const freshConfirm = result.current.rowQuickActions.menuActions({ row, status: 'DR' })[0];
    await act(async () => {
      await freshConfirm.onClick({ row });
    });

    const { unmount } = render(result.current.confirmPortal);
    expect(screen.getByTestId('confirm-modal')).toHaveTextContent('so-10');
    act(() => {
      screen.getByText('confirm docs').click();
    });
    unmount();

    render(result.current.confirmResultPortal);
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('GS-1|SI-1');
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('EUR');
    screen.getByText('go invoice').click();
    expect(navigate).toHaveBeenCalledWith('/sales-invoice/inv-1');

    act(() => {
      screen.getByText('close result').click();
    });
    expect(result.current.confirmResultPortal).toBeNull();
    expect(result.current.refreshKey).toBe(1);
  });

  it('opens manage launcher for partially fulfilled confirmed rows and refreshes on created docs', () => {
    const { result } = renderOrderHook();
    const row = {
      id: 'so-manage',
      deliveryStatus: 50,
      invoiceStatus: 100,
    };

    const manageAction = result.current.rowQuickActions
      .menuActions({ row, status: 'CO' })
      .find((action) => action.key === 'manage');

    expect(manageAction).toMatchObject({
      label: 'manageShipment',
      visible: true,
    });

    act(() => manageAction.onClick({ row }));
    const { unmount } = render(result.current.manageLauncher);
    expect(screen.getByTestId('manage-docs')).toHaveTextContent('so-manage');

    act(() => {
      screen.getByText('created docs').click();
    });
    unmount();

    expect(result.current.manageLauncher).toBeNull();
    expect(result.current.refreshKey).toBe(1);
  });
});
