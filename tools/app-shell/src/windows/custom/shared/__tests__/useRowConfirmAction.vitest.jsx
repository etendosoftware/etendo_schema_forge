// ETP-5378 — "Confirmar" in the row-hover kebab of the two albarán windows.
//
// The case worth pinning is the refetch: both confirm modals read `linkedOrders` and
// `resolvedPriceListId`, which Goods{Shipment,Receipt}HeaderHandler enrich ONLY on a
// detail GET. Driving the modal off the grid row would read as "no linked order, no
// resolved tariff" and could create the invoice against the wrong price list — a silent
// wrong-data bug, not a visual one.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastLoading = vi.fn(() => 'toast-1');
const toastDismiss = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    loading: (...a) => toastLoading(...a),
    dismiss: (...a) => toastDismiss(...a),
  },
}));

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => apiFetchMock,
}));

const docActionExecute = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: docActionExecute, loading: false, error: null }),
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: ({ title, docs, currency }) => (
    <div
      data-testid="result-modal"
      data-title={title}
      data-currency={currency}
      data-route={docs?.[0]?.route}
      data-num={docs?.[0]?.num} />
  ),
}));

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowConfirmAction } from '../useRowConfirmAction.jsx';

// Records what the modal was handed, so the test can assert it got the REFETCHED
// record rather than the grid row.
let modalProps;
function FakeConfirmModal(props) {
  modalProps = props;
  return <div data-testid="confirm-modal" data-record-id={props.recordId} />;
}

const DETAIL = {
  id: 'ship-1',
  documentNo: '1000003',
  invoiceStatus: 0,
  linkedOrders: [{ id: 'ord-1' }],
  resolvedPriceListId: 'pl-9',
  'currency$_identifier': 'EUR',
};

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

let hook;
const onRefresh = vi.fn();
function Host(overrides = {}) {
  hook = useRowConfirmAction({
    specName: 'goods-shipment',
    entityName: 'goodsShipment',
    apiBaseUrl: '/sws/neo/goods-shipment',
    token: 'tkn',
    ConfirmModal: FakeConfirmModal,
    confirmedTitleKey: 'goodsShipment.confirmModal.confirmedTitle',
    invoiceResultTitleKey: 'soInvoiceCreated',
    invoiceDocType: 'facturaVenta',
    invoiceRoute: '/sales-invoice',
    onRefresh,
    ...overrides,
  });
  return <>{hook.confirmPortal}</>;
}

async function clickConfirm(row = { id: 'ship-1', documentStatus: 'DR' }) {
  const entry = hook.confirmMenuAction(row);
  await act(async () => { await entry.onClick({ row }); });
  return entry;
}

describe('useRowConfirmAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modalProps = null;
    apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [DETAIL] } }));
    docActionExecute.mockResolvedValue({});
    toastLoading.mockReturnValue('toast-1');
  });

  describe('confirmMenuAction', () => {
    it('offers Confirm on a draft row', () => {
      render(<Host />);
      expect(hook.confirmMenuAction({ id: 'x', documentStatus: 'DR' }))
        .toMatchObject({ key: 'confirm', label: 'confirm' });
    });

    it('returns null on any other status, so a non-draft menu is untouched', () => {
      render(<Host />);
      expect(hook.confirmMenuAction({ id: 'x', documentStatus: 'CO' })).toBeNull();
      expect(hook.confirmMenuAction({ id: 'x', documentStatus: 'VO' })).toBeNull();
      expect(hook.confirmMenuAction(undefined)).toBeNull();
    });
  });

  describe('opening the popup', () => {
    it('refetches the record and hands the modal THAT, not the grid row', async () => {
      render(<Host />);
      await clickConfirm({ id: 'ship-1', documentStatus: 'DR', documentNo: '1000003' });

      expect(apiFetchMock).toHaveBeenCalledWith('/goods-shipment/goodsShipment/ship-1');
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      // The enrichments the modal depends on exist only on the detail payload.
      expect(modalProps.data).toEqual(DETAIL);
      expect(modalProps.data.linkedOrders).toHaveLength(1);
      expect(modalProps.data.resolvedPriceListId).toBe('pl-9');
      expect(modalProps.recordId).toBe('ship-1');
    });

    it('unwraps a bare record payload too', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse(DETAIL));
      render(<Host />);
      await clickConfirm();
      expect(modalProps.data).toEqual(DETAIL);
    });

    it('reports a failed refetch and opens nothing', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, false, 500));
      render(<Host />);
      await clickConfirm();

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
      expect(toastError).toHaveBeenCalledWith('boom');
      expect(docActionExecute).not.toHaveBeenCalled();
    });

    it('skips the popup on a fully invoiced document and confirms directly', async () => {
      apiFetchMock.mockResolvedValue(jsonResponse({ response: { data: [{ ...DETAIL, invoiceStatus: 100 }] } }));
      render(<Host />);
      await clickConfirm();

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
      expect(docActionExecute).toHaveBeenCalledWith('ship-1', 'CO');
      expect(toastSuccess).toHaveBeenCalledWith('goodsShipment.confirmModal.confirmedTitle');
      expect(onRefresh).toHaveBeenCalled();
    });

    it('ignores a row with no id instead of firing a request', async () => {
      render(<Host />);
      const entry = hook.confirmMenuAction({ documentStatus: 'DR' });
      await act(async () => { await entry.onClick({ row: { documentStatus: 'DR' } }); });
      expect(apiFetchMock).not.toHaveBeenCalled();
    });
  });

  describe('after confirming', () => {
    it('shows the result popup when an invoice was created, carrying the currency', async () => {
      render(<Host />);
      await clickConfirm();
      await act(async () => {
        modalProps.onConfirmed({ invoice: { id: 'inv-7', documentNo: 'F-7', amount: 15.14 } });
      });

      const result = screen.getByTestId('result-modal');
      expect(result).toHaveAttribute('data-route', '/sales-invoice/inv-7');
      expect(result).toHaveAttribute('data-num', 'F-7');
      // Read off the confirmed record, which this same handler clears — a plain
      // `confirmRecord?.currency$_identifier` in the popup would render empty.
      expect(result).toHaveAttribute('data-currency', 'EUR');
      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
    });

    it('skips the result popup when no invoice was created and just refreshes', async () => {
      render(<Host />);
      await clickConfirm();
      await act(async () => { modalProps.onConfirmed({ invoice: null }); });

      expect(screen.queryByTestId('result-modal')).not.toBeInTheDocument();
      expect(toastSuccess).toHaveBeenCalledWith('goodsShipment.confirmModal.confirmedTitle');
      expect(onRefresh).toHaveBeenCalled();
    });

    it('treats a confirm that reports nothing at all as "no invoice"', async () => {
      render(<Host />);
      await clickConfirm();
      await act(async () => { modalProps.onConfirmed(); });

      expect(screen.queryByTestId('result-modal')).not.toBeInTheDocument();
      expect(onRefresh).toHaveBeenCalled();
    });

    it('closes without confirming when the modal is dismissed', async () => {
      render(<Host />);
      await clickConfirm();
      await act(async () => { modalProps.onClose(); });

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });
});
