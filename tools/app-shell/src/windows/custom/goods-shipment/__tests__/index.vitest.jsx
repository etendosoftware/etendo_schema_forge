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
    headers: { Authorization: 'Bearer tkn' },
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

vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: ({ entity, labelKey }) => (
    <div data-testid="bulk-document-action" data-entity={entity} data-label-key={labelKey} />
  ),
  buildInOutActions: vi.fn(() => []),
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
import GoodsShipmentWindow from '../index.jsx';

describe('GoodsShipmentWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    lastPageProps = null;
    rowDeleteConfig = null;
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
    expect(screen.getByTestId('bulk-document-action')).toHaveAttribute('data-entity', 'goodsShipment');
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
    });
    expect(lastPageProps.hideMoreMenu({ data: { documentStatus: 'DR' } })).toBe(true);
    expect(lastPageProps.hideMoreMenu({ data: { documentStatus: 'CO' } })).toBe(false);

    lastPageProps.draftMode.onConfirm();
    expect(events).toEqual(['open']);
  });
});
