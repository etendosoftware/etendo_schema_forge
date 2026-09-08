vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node) => <div data-testid="portal">{node}</div>,
  };
});

const navigate = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams],
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: vi.fn(),
}));

let rowDeleteConfig;
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: vi.fn((config) => {
    rowDeleteConfig = config;
    return {
      requestDelete: vi.fn(),
      deleteDialog: <div data-testid="delete-dialog" />,
    };
  }),
}));

vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: {
    Provider: ({ children }) => <div data-testid="contact-provider">{children}</div>,
  },
}));

vi.mock('@/components/contract-ui/useCreateContactModal.jsx', () => ({
  useCreateContactModal: vi.fn(() => ({
    headers: { Authorization: 'Bearer tkn', 'Accept-Language': 'es_ES' },
    createContactCtxValue: { open: vi.fn() },
    contactPortal: <div data-testid="contact-portal" />,
  })),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ records, headerEntity, routePrefix, onClose, onCloned }) => (
    <div
      data-testid="clone-modal"
      data-record-count={records.length}
      data-header-entity={headerEntity}
      data-route-prefix={routePrefix}>
      <button type="button" onClick={onClose}>close clone</button>
      <button type="button" onClick={onCloned}>cloned</button>
    </div>
  ),
}));

vi.mock('@generated/goods-shipment/custom/BulkInvoiceFromShipment', () => ({
  default: () => <div data-testid="bulk-invoice" />,
}));

let bulkDocumentActionCalls = [];
vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: (props) => {
    bulkDocumentActionCalls.push(props);
    const { entity, labelKey } = props;
    return (
      <div data-testid={`bulk-document-action-${labelKey}`} data-entity={entity} data-label-key={labelKey} />
    );
  },
  buildInOutActions: vi.fn(() => []),
  buildPostActions: vi.fn(() => []),
  postRowFilter: vi.fn(),
}));

vi.mock('../GoodsShipmentPreview', () => ({
  default: ({ shipment, windowName }) => (
    <div data-testid="shipment-preview" data-id={shipment.id} data-window-name={windowName} />
  ),
}));

vi.mock('@generated/goods-shipment/generated/web/goods-shipment/GoodsShipmentTable', () => ({
  default: ({ columns }) => (
    <div data-testid="shipment-table" data-columns={columns.map((col) => col.key).join(',')} />
  ),
}));

let lastPageProps;
vi.mock('@generated/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage', () => ({
  default: (props) => {
    lastPageProps = props;
    return (
      <div data-testid="shipment-page" data-record-id={props.recordId || ''}>
        {props.Table ? <props.Table marker="table-prop" /> : null}
        {props.bulkActions ? <props.bulkActions selectedRows={[{ id: 's1' }]} /> : null}
        {props.renderPreview ? props.renderPreview({ row: { id: 'preview-1' }, onClose: vi.fn(), onEdit: vi.fn() }) : null}
      </div>
    );
  },
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import GoodsShipmentWindow from '../index.jsx';

describe('GoodsShipmentWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    lastPageProps = null;
    rowDeleteConfig = null;
    bulkDocumentActionCalls = [];
  });

  it('passes URL DocStatus into initial column filters on the list view', () => {
    searchParams = new URLSearchParams('DocStatus=CO');

    render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

    expect(lastPageProps.initialColumnFilters).toEqual({
      documentStatus: { mode: 'enumLabel', value: ['CO'] },
    });
    expect(screen.getByTestId('shipment-table')).toHaveAttribute(
      'data-columns',
      'movementDate,documentNo,businessPartner,documentStatus,posted,warehouse,invoiceStatus',
    );
  });

  it('wires bulk actions, preview rendering, row actions, and clone refresh on the list view', () => {
    render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('bulk-invoice')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-document-action-confirmBulk')).toHaveAttribute('data-entity', 'goodsShipment');
    // ETP-5209 — bulk Post button, gated to processed & not-yet-posted rows.
    expect(screen.getByTestId('bulk-document-action-post')).toHaveAttribute('data-entity', 'goodsShipment');
    expect(screen.getByTestId('shipment-preview')).toHaveAttribute('data-window-name', 'goods-shipment');
    expect(rowDeleteConfig).toMatchObject({ apiBaseUrl: '/api', entity: 'goodsShipment', token: 'tkn' });

    // ETP-4656: grid delete icon must stay visible regardless of document status —
    // hideDeleteWhenComplete must not be set on the row quick actions config.
    expect(lastPageProps.rowQuickActions.hideDeleteWhenComplete).toBeUndefined();

    // ETP-4717 — this window builds rowQuickActions by hand (bypassing the
    // generated contract's rowQuickActions.actions.email.visibleWhen), so the
    // gate must be asserted here directly. Regression: without it, the Grid
    // "Enviar" (email) quick action shows on every row regardless of status.
    expect(lastPageProps.rowQuickActions.actions.email).toEqual({
      visibleWhen: "@DocumentStatus@='CO'",
    });

    lastPageProps.rowQuickActions.onEdit({ id: 'ship-1' });
    expect(navigate).toHaveBeenCalledWith('/goods-shipment/ship-1');

    act(() => {
      lastPageProps.onCloneRow([{ id: 'ship-2' }, { id: 'ship-3' }]);
    });
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '2');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-header-entity', 'goodsShipment');
    fireEvent.click(screen.getByText('cloned'));
    expect(lastPageProps.refreshTrigger).toBe(1);
  });

  it('uses detail mode settings and dispatches the confirm modal event for records', () => {
    const events = [];
    window.addEventListener('goods-shipment:open-confirm-modal', () => events.push('open'));

    render(
      <GoodsShipmentWindow
        windowName="goods-shipment"
        recordId="ship-1"
        apiBaseUrl="/api"
        token="tkn"
      />,
    );

    expect(screen.getByTestId('contact-provider')).toBeInTheDocument();
    expect(screen.getByTestId('contact-portal')).toBeInTheDocument();
    expect(lastPageProps).toMatchObject({
      recordId: 'ship-1',
      autoSaveOnBlur: true,
      processes: [],
      refetchAfterSave: true,
    });
    expect(lastPageProps.hideMoreMenu({ data: { documentStatus: 'DR' } })).toBe(true);
    expect(lastPageProps.hideMoreMenu({ data: { documentStatus: 'CO' } })).toBe(false);

    lastPageProps.draftMode.onConfirm();
    expect(events).toEqual(['open']);
  });

  // ── ETP-5209 — Post row-kebab entry and bulk button ────────────────────────
  // The gate itself (processed + not posted) is covered exhaustively in
  // BulkDocumentAction.vitest.jsx (buildPostActions/postRowFilter) — these
  // tests only verify this window wires the shared helper through correctly.
  describe('ETP-5209 — Post row-kebab entry and bulk button', () => {
    it('offers the post menu action for a processed, unposted row', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      const actions = lastPageProps.rowQuickActions.menuActions({ row: { processed: 'Y', posted: 'N' } });
      expect(actions).toEqual([{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }]);
    });

    it('does not offer the post menu action for an already-posted row', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      const actions = lastPageProps.rowQuickActions.menuActions({ row: { processed: 'Y', posted: 'Y' } });
      expect(actions).toEqual([]);
    });

    it('bumps refreshKey when a neoAction menu action (post) completes', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      act(() => {
        lastPageProps.rowQuickActions.onMenuActionExecuted({ neoAction: 'post' });
      });
      expect(lastPageProps.refreshTrigger).toBe(1);
    });

    it('does not bump refreshKey for a menu action without a neoAction', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      act(() => {
        lastPageProps.rowQuickActions.onMenuActionExecuted({ key: 'someOtherAction' });
      });
      expect(lastPageProps.refreshTrigger).toBe(0);
    });

    it('renders both the confirmBulk (in-out) and the post bulk BulkDocumentAction instances', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      expect(screen.getByTestId('bulk-document-action-confirmBulk')).toHaveAttribute('data-entity', 'goodsShipment');
      expect(screen.getByTestId('bulk-document-action-post')).toHaveAttribute('data-entity', 'goodsShipment');
      // ETP-5209 — GoodsShipmentBulkActions passes the imported postRowFilter
      // reference straight through as rowFilter — no caller-side factory/hook
      // call needed.
      const postCall = bulkDocumentActionCalls.find((p) => p.labelKey === 'post');
      expect(postCall.rowFilter).toBe(postRowFilter);
    });

    // ETP-5209 regression: production crash root cause. ListView.jsx invokes
    // `bulkActions` as a PLAIN FUNCTION CALL inside its own render body, never
    // as JSX. GoodsShipmentPage's mock above renders it via JSX
    // (`<props.bulkActions .../>`), which is exactly why the old suite never
    // caught this: JSX invocation gives a function component its own hook
    // dispatcher, so a stray `useUI()` inside the wrapper would have passed
    // silently there. Calling the captured `bulkActions` reference directly
    // here, OUTSIDE of any React render pass, reproduces the same
    // hook-dispatcher-less context production hits — any hook call inside the
    // wrapper throws React's "Invalid hook call" error here, exactly as it
    // would crash with "Rendered more hooks than during the previous render"
    // in production the moment a row got selected.
    it('ETP-5209 regression: bulkActions wrapper is callable as a plain function (not JSX) without an Invalid Hook Call error', () => {
      render(<GoodsShipmentWindow windowName="goods-shipment" apiBaseUrl="/api" token="tkn" />);

      expect(() => lastPageProps.bulkActions({
        selectedRows: [{ id: 's1', processed: 'Y', posted: 'N' }],
        clearSelection: vi.fn(),
        token: 'tkn',
        apiBaseUrl: '/api',
        windowName: 'goods-shipment',
      })).not.toThrow();
    });
  });
});
