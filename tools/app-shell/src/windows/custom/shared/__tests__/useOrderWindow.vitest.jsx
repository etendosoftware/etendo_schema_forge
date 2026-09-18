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
    // ETP-5295 — `deliveryKey` is deliberately absent: the hook no longer takes it. The manage
    // decision is read from the backend annotations on the row, not from a per-window percent
    // column, so a fixture still passing `deliveryKey` would be silently ignored and would
    // suggest a parameter that no longer exists.
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
      row: { id: 'so-4', hasLinkedDocuments: false },
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
      row: { id: 'so-5', hasLinkedDocuments: false },
      status: 'CO',
    });

    expect(actions.find((action) => action.key === 'reactivate')).toBeUndefined();
  });

  it('hides reactivate when the row has linked documents, even if showReactivate is true', () => {
    const { result } = renderOrderHook({ showReactivate: true });

    const actions = result.current.rowQuickActions.menuActions({
      row: { id: 'so-6', hasLinkedDocuments: true },
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
      row: { id: 'so-7', hasLinkedDocuments: false },
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
    // ETP-5295 — "partially fulfilled" is now stated by the backend annotations on the row
    // (shipment still pending, invoice already done), not inferred from the DeliveryStatus /
    // InvoiceStatus percent columns this fixture used to carry. Those percents no longer reach
    // any decision, so leaving them here would have asserted a dead path.
    const row = {
      id: 'so-manage',
      needsPrimaryDoc: true,
      needsInvoiceDoc: false,
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
    const row = { id: 'po-1', documentStatus: 'DR', currency$_identifier: 'USD' };

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
    const row = { id: 'po-manage', needsPrimaryDoc: true, needsInvoiceDoc: false };

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
    const row = { id: 'so-empty', needsPrimaryDoc: true, needsInvoiceDoc: false };

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
    const row = { id: 'po-shipment-only', needsPrimaryDoc: true, needsInvoiceDoc: false };

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

// ETP-5295 — the manage ("Gestionar") kebab entry: what decides whether it appears, and with
// which of the three labels.
//
// It used to be derived from the list's `DeliveryStatus` / `InvoiceStatus` percent columns, which
// answer a DIFFERENT question than the flow the entry launches: a DRAFT shipment/receipt/invoice
// already covers the pending work while the percent still reads < 100. The kebab therefore
// offered entries whose `ManageDocsLauncher` closed silently, hid entries the detail-page button
// still offered, and could promise a section ("... y factura") the modal would not render.
//
// The decision now comes from two backend annotations on the row — `needsPrimaryDoc` /
// `needsInvoiceDoc` — computed server-side with the detail form's exact formula. These tests pin
// both halves of that: the visibility AND the label, per combination.
describe('useOrderWindow — manage action derives from backend pending flags (ETP-5295)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOptionalJson.mockResolvedValue(null);
  });

  function manageActionFor(row, status = 'CO') {
    const { result } = renderOrderHook();
    return result.current.rowQuickActions
      .menuActions({ row, status })
      .find((action) => action.key === 'manage');
  }

  it('shows the primary-doc label when only the primary document is pending', () => {
    expect(manageActionFor({ id: 'r1', needsPrimaryDoc: true, needsInvoiceDoc: false })).toMatchObject({
      visible: true,
      label: 'manageShipment',
    });
  });

  it('shows the invoice label when only the invoice is pending', () => {
    expect(manageActionFor({ id: 'r2', needsPrimaryDoc: false, needsInvoiceDoc: true })).toMatchObject({
      visible: true,
      label: 'manageInvoice',
    });
  });

  it('shows the combined label when both documents are pending', () => {
    expect(manageActionFor({ id: 'r3', needsPrimaryDoc: true, needsInvoiceDoc: true })).toMatchObject({
      visible: true,
      label: 'manageBoth',
    });
  });

  it('hides the entry when both flags are false', () => {
    expect(manageActionFor({ id: 'r4', needsPrimaryDoc: false, needsInvoiceDoc: false })).toMatchObject({
      visible: false,
      label: '',
    });
  });

  // The label must be cleared, not merely hidden: an entry rendered by a consumer that reads
  // `label` without honouring `visible` would otherwise show a stale action name.
  it('emits an empty label — not a stale one — when the entry is hidden', () => {
    expect(manageActionFor({ id: 'r5', needsPrimaryDoc: false, needsInvoiceDoc: false }).label).toBe('');
  });

  it("accepts the AD string form of the annotations ('Y' / 'N')", () => {
    expect(manageActionFor({ id: 'r6', needsPrimaryDoc: 'Y', needsInvoiceDoc: 'N' })).toMatchObject({
      visible: true,
      label: 'manageShipment',
    });
    expect(manageActionFor({ id: 'r7', needsPrimaryDoc: 'N', needsInvoiceDoc: 'N' })).toMatchObject({
      visible: false,
    });
  });

  // An ABSENT annotation (legacy backend, or a spec whose handler does not annotate) hides the
  // entry. That is the deliberate choice recorded in the hook: defaulting to "pending" would
  // reinstate the reported bug — a menu entry that leads nowhere — whereas hiding it only removes
  // a shortcut, since the same flow stays reachable from the order's detail page, which derives
  // the answer from the shipments/invoices/lines it fetches itself.
  it('hides the entry when the row carries no annotation at all', () => {
    expect(manageActionFor({ id: 'r8', documentStatus: 'CO' })).toMatchObject({
      visible: false,
      label: '',
    });
  });

  it('hides the entry when only one annotation is present and it is false', () => {
    expect(manageActionFor({ id: 'r9', needsInvoiceDoc: false })).toMatchObject({ visible: false });
  });

  it('shows the entry when only one annotation is present and it is true', () => {
    expect(manageActionFor({ id: 'r10', needsInvoiceDoc: true })).toMatchObject({
      visible: true,
      label: 'manageInvoice',
    });
  });

  // The percent columns are no longer consulted anywhere. A row that still carries them (every
  // real list row does — they are real AD columns) must not influence the decision in either
  // direction, or the two sources of truth this ticket collapsed would quietly come back.
  it('ignores the legacy DeliveryStatus / InvoiceStatus percent columns entirely', () => {
    // Percents say "everything pending", annotations say nothing is → hidden.
    expect(manageActionFor({
      id: 'r11', deliveryStatus: 0, invoiceStatus: 0, needsPrimaryDoc: false, needsInvoiceDoc: false,
    })).toMatchObject({ visible: false });

    // Percents say "all done", annotations say work remains → shown.
    expect(manageActionFor({
      id: 'r12', deliveryStatus: 100, invoiceStatus: 100, needsPrimaryDoc: true, needsInvoiceDoc: true,
    })).toMatchObject({ visible: true, label: 'manageBoth' });
  });

  // The flow the entry launches only exists for a confirmed order, so the status gate stays even
  // when the backend says work is pending (a draft order's lines are still editable).
  for (const status of ['DR', 'VO', 'CL']) {
    it(`hides the entry for status ${status} even with both flags true`, () => {
      expect(manageActionFor(
        { id: `r-status-${status}`, needsPrimaryDoc: true, needsInvoiceDoc: true },
        status,
      )).toMatchObject({ visible: false, label: '' });
    });
  }

  // A row whose `documentStatus` never arrived yields `status === undefined`. Called through
  // `menuActions` directly rather than the helper above, whose `= 'CO'` default parameter would
  // silently substitute the very value under test.
  it('hides the entry when status is undefined, even with both flags true', () => {
    const { result } = renderOrderHook();
    const action = result.current.rowQuickActions
      .menuActions({ row: { id: 'r-no-status', needsPrimaryDoc: true, needsInvoiceDoc: true }, status: undefined })
      .find((entry) => entry.key === 'manage');
    expect(action).toMatchObject({ visible: false, label: '' });
  });

  it('does not throw for a row with no fields at all', () => {
    expect(() => manageActionFor({})).not.toThrow();
    expect(manageActionFor({})).toMatchObject({ visible: false });
  });

  it('uses the caller-supplied label keys, not hardcoded sales-order strings', () => {
    const { result } = renderOrderHook({
      manageLabelKeys: { both: 'poManageBoth', primary: 'poManageReceipt', invoice: 'poManageInvoice' },
    });
    const labelFor = (row) => result.current.rowQuickActions
      .menuActions({ row, status: 'CO' })
      .find((action) => action.key === 'manage').label;

    expect(labelFor({ id: 'po-a', needsPrimaryDoc: true, needsInvoiceDoc: false })).toBe('poManageReceipt');
    expect(labelFor({ id: 'po-b', needsPrimaryDoc: false, needsInvoiceDoc: true })).toBe('poManageInvoice');
    expect(labelFor({ id: 'po-c', needsPrimaryDoc: true, needsInvoiceDoc: true })).toBe('poManageBoth');
  });
});
