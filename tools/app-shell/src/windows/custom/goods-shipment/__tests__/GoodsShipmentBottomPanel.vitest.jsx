// Regression tests for ETP-5066: on Sales Goods Shipment (Albarán de Venta),
// clicking "Añadir desde Factura" (import from invoice) opened the ORDER
// import modal on the first invocation instead of the invoice one.
//
// Root cause has two independent bugs in
// artifacts/goods-shipment/custom/GoodsShipmentBottomPanel.jsx:
//   1. ShipmentLinesEmptyState's handleImportOrderClick/handleImportInvoiceClick
//      call onSave() with NO argument, instead of forwarding the modalType
//      ('order'/'invoice') the generic DetailView.handleImportClick(modalType)
//      contract expects.
//   2. ShipmentLinesEmptyState's forceOpen effect ignores the actual forceOpen
//      value and ALWAYS does setShowOrderModal(true).
//   3. ShipmentLineActions has the analogous bug: a pendingModal ref that
//      resets to 'order' on every remount, and its forceOpen effect also
//      ignores the actual value.
//
// Reference for correct behavior: artifacts/goods-receipt/custom/
// GoodsReceiptBottomPanel.jsx (GoodsReceiptLinesEmptyState / GoodsReceiptLineActions),
// which forwards onSave(modalType) explicitly and branches its forceOpen effect
// on `forceOpen === 'invoice'`.
//
// Test harness mirrors ReturnMaterialReceiptBottomPanel.vitest.jsx: tests the
// live artifact copy (artifacts/goods-shipment/custom/GoodsShipmentBottomPanel.jsx
// — the one the generated page imports) via the @generated alias, from inside
// tools/app-shell/src so vitest.config.js's include glob (src/**/*.vitest.{js,jsx})
// actually collects the file (artifacts/**/__tests__/*.vitest.jsx is NOT collected
// — see docs/feedback.md ETP-4841).

// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLabel: () => (key) => key,
}));

// Stub the heavy generic LinesBottomSection — not exercised by these tests.
vi.mock('@/components/contract-ui', () => ({
  LinesBottomSection: (props) => (
    <div data-testid="lines-bottom-section" data-show-totals={String(props.showTotals)} />
  ),
}));

vi.mock('@generated/goods-shipment/custom/RelatedDocuments', () => ({
  default: () => <div data-testid="related-documents" />,
}));

// The real import modals do fetch + heavy ImportLinesModal work. Stub them so
// we can assert WHICH one gets rendered without wiring a fetch mock.
vi.mock('@generated/goods-shipment/custom/ImportFromSalesOrderModal', () => ({
  default: () => <div data-testid="mock-order-modal" />,
}));

vi.mock('@generated/goods-shipment/custom/ImportFromSalesInvoiceModal', () => ({
  default: () => <div data-testid="mock-invoice-modal" />,
}));

import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GoodsShipmentBottomPanel from '@generated/goods-shipment/custom/GoodsShipmentBottomPanel.jsx';

const ShipmentLinesEmptyState = GoodsShipmentBottomPanel.linesEmptyState;
const ShipmentLineActions = GoodsShipmentBottomPanel.detailExtraActions;

const DRAFT_WITH_BP = { id: 'SHP-1', documentStatus: 'DR', businessPartner: 'BP-1' };

const BASE_PROPS = {
  data: DRAFT_WITH_BP,
  onAddLine: vi.fn(),
  canAddLine: true,
  recordId: 'SHP-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/goods-shipment',
  onRefresh: vi.fn(),
};

describe('ShipmentLinesEmptyState (ETP-5066)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards "order" to onSave when "Añadir desde pedido" (importFromSalesOrder) is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<ShipmentLinesEmptyState {...BASE_PROPS} onSave={onSave} />);

    await user.click(screen.getByText('importFromSalesOrder'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('order');
  });

  it('forwards "invoice" to onSave when "Añadir desde Factura" (importFromSalesInvoice) is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<ShipmentLinesEmptyState {...BASE_PROPS} onSave={onSave} />);

    await user.click(screen.getByText('importFromSalesInvoice'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('invoice');
  });

  it('opens the INVOICE modal (not order) when forceOpen="invoice"', () => {
    render(<ShipmentLinesEmptyState {...BASE_PROPS} forceOpen="invoice" onForceOpenHandled={vi.fn()} />);

    expect(screen.getByTestId('mock-invoice-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-order-modal')).not.toBeInTheDocument();
  });

  it('opens the ORDER modal when forceOpen="order" (regression guard for the other branch)', () => {
    render(<ShipmentLinesEmptyState {...BASE_PROPS} forceOpen="order" onForceOpenHandled={vi.fn()} />);

    expect(screen.getByTestId('mock-order-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-invoice-modal')).not.toBeInTheDocument();
  });
});

describe('ShipmentLineActions (ETP-5066 — same class of bug)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards "order" to onSave and opens the order modal via the imperative handle', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const ref = createRef();
    render(<ShipmentLineActions {...BASE_PROPS} onSave={onSave} ref={ref} />);

    await act(async () => {
      await ref.current.openOrderModal();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('order');
    expect(screen.getByTestId('mock-order-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-invoice-modal')).not.toBeInTheDocument();
  });

  it('forwards "invoice" to onSave and opens the invoice modal (not order) via the imperative handle', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const ref = createRef();
    render(<ShipmentLineActions {...BASE_PROPS} onSave={onSave} ref={ref} />);

    await act(async () => {
      await ref.current.openInvoiceModal();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('invoice');
    expect(screen.getByTestId('mock-invoice-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-order-modal')).not.toBeInTheDocument();
  });

  it('opens the INVOICE modal (not order) when forceOpen="invoice" on mount', () => {
    render(<ShipmentLineActions {...BASE_PROPS} forceOpen="invoice" onForceOpenHandled={vi.fn()} />);

    expect(screen.getByTestId('mock-invoice-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-order-modal')).not.toBeInTheDocument();
  });

  it('opens the ORDER modal when forceOpen="order" on mount (regression guard for the other branch)', () => {
    render(<ShipmentLineActions {...BASE_PROPS} forceOpen="order" onForceOpenHandled={vi.fn()} />);

    expect(screen.getByTestId('mock-order-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-invoice-modal')).not.toBeInTheDocument();
  });
});
