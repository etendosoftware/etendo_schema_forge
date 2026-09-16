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
  toast: { error: vi.fn(), success: vi.fn() },
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

function ConfirmResultModal({ title, docs, currency, navigate: modalNavigate, onClose }) {
  return (
    <div data-testid="confirm-result">
      <span data-testid="confirm-result-title">{title}</span>
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
      {/* ETP-5295 — a real ManageDocsLauncher always calls onCreated with the created-docs
          object, never a raw DOM event; pass a realistic sales-order shape so this mock
          exercises the same contract useOrderWindow now depends on. */}
      <button
        type="button"
        onClick={() => onCreated({
          shipment: { id: 'ship-1', documentNo: 'GS-1', amount: 10 },
          invoice: { id: 'inv-1', documentNo: 'SI-1', amount: 20 },
        })}
      >
        created docs
      </button>
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

  it('hides reactivate entirely when showReactivate is not passed (defaults to false)', () => {
    const { result } = renderOrderHook();

    const actions = result.current.rowQuickActions.menuActions({
      row: { id: 'so-5', deliveryStatus: 100, invoiceStatus: 100, hasLinkedDocuments: false },
      status: 'CO',
    });

    expect(actions.find((action) => action.key === 'reactivate')).toBeUndefined();
  });

  it('hides reactivate when the row has linked documents, even if showReactivate is true', () => {
    const { result } = renderOrderHook({ showReactivate: true });

    const actions = result.current.rowQuickActions.menuActions({
      row: { id: 'so-6', deliveryStatus: 100, invoiceStatus: 100, hasLinkedDocuments: true },
      status: 'CO',
    });

    expect(actions.find((action) => action.key === 'reactivate')).toMatchObject({
      documentAction: 'RE',
      visible: false,
    });
  });

  it('hides reactivate when the row status is not Confirmed (CO), even if showReactivate is true', () => {
    const { result } = renderOrderHook({ showReactivate: true });

    const actions = result.current.rowQuickActions.menuActions({
      row: { id: 'so-7', deliveryStatus: 100, invoiceStatus: 100, hasLinkedDocuments: false },
      status: 'DR',
    });

    expect(actions.find((action) => action.key === 'reactivate')).toMatchObject({
      documentAction: 'RE',
      visible: false,
    });
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

  // ETP-5295 — `onCreated` now routes its `docs` into the SAME result popup the
  // "Confirmar" flow uses (previously the argument was discarded and the launcher just
  // closed + refreshed). Assert the popup renders with the docs-created title, and that
  // refreshKey only bumps once the popup itself is closed (not immediately on creation).
  it('opens manage launcher for partially fulfilled confirmed rows, shows the docs-created result, and refreshes on close', () => {
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
    expect(result.current.refreshKey).toBe(0);

    render(result.current.confirmResultPortal);
    expect(screen.getByTestId('confirm-result-title')).toHaveTextContent('soDocsCreatedTitle');
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('GS-1|SI-1');

    act(() => {
      screen.getByText('close result').click();
    });
    expect(result.current.confirmResultPortal).toBeNull();
    expect(result.current.refreshKey).toBe(1);
  });
});

// ETP-5295 — the confirm/manage result popup used to hardcode the sales-order shape
// (`confirmedDocs.shipment` + `soConfirmedTitle`) directly inside `useOrderWindow`. It is now
// parametrized via `confirmedTitleKey`/`primaryDoc`/`invoiceDoc`, and the "manage" (create-docs)
// flow routes its result into the SAME popup instead of discarding it. These tests cover the
// purchase-order shape specifically, the manage-flow-produced-a-result case, the toast fallback
// when neither document was created, and a regression guard against the old hardcoded key.
describe('useOrderWindow — parametrized confirm/manage result popup (ETP-5295)', () => {
  const PO_CONFIRMED_TITLE_KEY = 'poConfirmedTitle';
  const PO_PRIMARY_DOC = { key: 'receipt', type: 'entrada', route: 'goods-receipt' };
  const PO_INVOICE_DOC = { key: 'invoice', type: 'facturaCompra', route: 'purchase-invoice' };

  function POConfirmModal({ orderId, onClose, onConfirmed }) {
    return (
      <div data-testid="po-confirm-modal">
        <span>{orderId}</span>
        <button type="button" onClick={onClose}>close confirm</button>
        <button
          type="button"
          onClick={() => onConfirmed({
            receipt: { id: 'receipt-1', documentNo: 'GR-1', amount: 15 },
            invoice: { id: 'poinv-1', documentNo: 'PI-1', amount: 25 },
          })}
        >
          confirm po docs
        </button>
      </div>
    );
  }

  // Exposes the raw props ConfirmResultModal receives so assertions can check `type`/`route`
  // per doc instead of fighting real modal markup, per Tester convention.
  function InspectableResultModal({ title, docs, currency, onClose }) {
    return (
      <div data-testid="inspect-result">
        <span data-testid="inspect-title">{title}</span>
        <span data-testid="inspect-currency">{currency}</span>
        <pre data-testid="inspect-docs">{JSON.stringify(docs)}</pre>
        <button type="button" onClick={onClose}>close result</button>
      </div>
    );
  }

  function makeManageDocsLauncherWithDocs(docsToCreate) {
    return function InlineManageDocsLauncher({ orderId, onClose, onCreated }) {
      return (
        <div data-testid="manage-docs-inline">
          <span>{orderId}</span>
          <button type="button" onClick={onClose}>close manage</button>
          <button type="button" onClick={() => onCreated(docsToCreate)}>created docs</button>
        </div>
      );
    };
  }

  it('renders purchase-order doc shape (type/route) and poConfirmedTitle through the confirm flow', async () => {
    const { result } = renderOrderHook({
      confirmedTitleKey: PO_CONFIRMED_TITLE_KEY,
      primaryDoc: PO_PRIMARY_DOC,
      invoiceDoc: PO_INVOICE_DOC,
      ConfirmModal: POConfirmModal,
      ConfirmResultModal: InspectableResultModal,
    });
    // No orderDate → the exchange-rate lookup inside the "confirm" click handler is skipped,
    // so confirmRow is set synchronously.
    const row = { id: 'po-1', documentStatus: 'DR', deliveryStatus: 0, invoiceStatus: 0, currency$_identifier: 'USD' };

    const confirmAction = result.current.rowQuickActions.menuActions({ row, status: 'DR' })[0];
    await act(async () => {
      await confirmAction.onClick({ row });
    });

    const { unmount } = render(result.current.confirmPortal);
    act(() => {
      screen.getByText('confirm po docs').click();
    });
    unmount();

    render(result.current.confirmResultPortal);
    expect(screen.getByTestId('inspect-title')).toHaveTextContent(PO_CONFIRMED_TITLE_KEY);
    expect(JSON.parse(screen.getByTestId('inspect-docs').textContent)).toEqual([
      { type: 'entrada', num: 'GR-1', amount: 15, route: '/goods-receipt/receipt-1' },
      { type: 'facturaCompra', num: 'PI-1', amount: 25, route: '/purchase-invoice/poinv-1' },
    ]);
  });

  it('routes ManageDocsLauncher onCreated into the same result popup with the docs-created title (purchase-order)', () => {
    const { result } = renderOrderHook({
      confirmedTitleKey: PO_CONFIRMED_TITLE_KEY,
      primaryDoc: PO_PRIMARY_DOC,
      invoiceDoc: PO_INVOICE_DOC,
      ConfirmResultModal: InspectableResultModal,
      ManageDocsLauncher: makeManageDocsLauncherWithDocs({
        receipt: { id: 'receipt-9', documentNo: 'GR-9', amount: 99 },
      }),
    });
    const row = { id: 'po-manage', deliveryStatus: 50, invoiceStatus: 100 };

    const manageAction = result.current.rowQuickActions
      .menuActions({ row, status: 'CO' })
      .find((action) => action.key === 'manage');

    act(() => manageAction.onClick({ row }));
    const { unmount } = render(result.current.manageLauncher);
    act(() => {
      screen.getByText('created docs').click();
    });
    unmount();

    expect(result.current.manageLauncher).toBeNull();
    render(result.current.confirmResultPortal);
    expect(screen.getByTestId('inspect-title')).toHaveTextContent('soDocsCreatedTitle');
    expect(JSON.parse(screen.getByTestId('inspect-docs').textContent)).toEqual([
      { type: 'entrada', num: 'GR-9', amount: 99, route: '/goods-receipt/receipt-9' },
    ]);
  });

  it('falls back to a success toast and resets state when the flow created no document', () => {
    const { result } = renderOrderHook({
      ManageDocsLauncher: makeManageDocsLauncherWithDocs({ shipment: null, invoice: null }),
    });
    const row = { id: 'so-empty', deliveryStatus: 50, invoiceStatus: 100 };

    const manageAction = result.current.rowQuickActions
      .menuActions({ row, status: 'CO' })
      .find((action) => action.key === 'manage');

    act(() => manageAction.onClick({ row }));
    const { unmount } = render(result.current.manageLauncher);
    act(() => {
      screen.getByText('created docs').click();
    });
    unmount();

    expect(toast.success).toHaveBeenCalledWith('soDocsCreatedTitle');
    expect(result.current.confirmResultPortal).toBeNull();
    expect(result.current.manageLauncher).toBeNull();
    expect(result.current.refreshKey).toBe(1);

    // A subsequent render shows no leftover popup — state was fully reset.
    const { container } = render(<>{result.current.confirmResultPortal}{result.current.manageLauncher}</>);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not read confirmedDocs.shipment for purchase-order config (regression guard)', () => {
    const { result } = renderOrderHook({
      confirmedTitleKey: PO_CONFIRMED_TITLE_KEY,
      primaryDoc: PO_PRIMARY_DOC,
      invoiceDoc: PO_INVOICE_DOC,
      ConfirmResultModal: InspectableResultModal,
      // Only `.shipment` is populated — purchase-order's config reads `.receipt`/`.invoice`,
      // so this must be treated as "created nothing", never as a confirmed primary doc.
      ManageDocsLauncher: makeManageDocsLauncherWithDocs({
        shipment: { id: 'ship-only', documentNo: 'GS-X', amount: 5 },
      }),
    });
    const row = { id: 'po-shipment-only', deliveryStatus: 50, invoiceStatus: 100 };

    const manageAction = result.current.rowQuickActions
      .menuActions({ row, status: 'CO' })
      .find((action) => action.key === 'manage');

    act(() => manageAction.onClick({ row }));
    const { unmount } = render(result.current.manageLauncher);
    act(() => {
      screen.getByText('created docs').click();
    });
    unmount();

    expect(result.current.confirmResultPortal).toBeNull();
    // This came through the manage-flow, so the toast carries the manage-flow's title
    // (already set before the doc-shape check runs), not the confirm-flow's default key.
    expect(toast.success).toHaveBeenCalledWith('soDocsCreatedTitle');
  });
});
