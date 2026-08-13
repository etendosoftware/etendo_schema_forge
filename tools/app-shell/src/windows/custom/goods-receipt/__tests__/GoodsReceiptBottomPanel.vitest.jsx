// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLabel: () => (key) => key,
}));

// Render LinesBottomSection as a transparent passthrough so we can assert the
// props the panel forwards (relatedDocuments / showTotals) without pulling in
// the full generic component and its dependency tree.
vi.mock('@/components/contract-ui', () => ({
  LinesBottomSection: (props) => (
    <div
      data-testid="lines-bottom-section"
      data-show-totals={String(props.showTotals)}
      data-has-related={String(!!props.relatedDocuments)}
    />
  ),
}));

vi.mock('@/windows/custom/goods-receipt/RelatedDocuments', () => ({
  default: () => <div data-testid="related-documents" />,
}));

// The import modals are heavy (fetch + ImportLinesModal). Stub them so we can
// assert they get rendered (via portal) with the right props.
vi.mock('@generated/goods-receipt/custom/ImportFromPurchaseOrderModal', () => ({
  default: (props) => (
    <div data-testid="import-order-modal" data-invoice-id={props.invoiceId} data-bp={props.bpId} />
  ),
}));

vi.mock('@generated/goods-receipt/custom/ImportFromPurchaseInvoiceModal', () => ({
  default: (props) => (
    <div data-testid="import-invoice-modal" data-invoice-id={props.invoiceId} data-bp={props.bpId} />
  ),
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef } from 'react';
import GoodsReceiptBottomPanel from '@generated/goods-receipt/custom/GoodsReceiptBottomPanel';

const EmptyState = GoodsReceiptBottomPanel.linesEmptyState;
const LineActions = GoodsReceiptBottomPanel.detailExtraActions;

const draftData = { documentStatus: 'DR', businessPartner: 'bp-1' };

function renderEmptyState(overrides = {}) {
  const props = {
    data: draftData,
    onAddLine: vi.fn(),
    canAddLine: true,
    recordId: 'receipt-1',
    token: 'tok',
    apiBaseUrl: '/api/goods-receipt',
    onSave: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<EmptyState {...props} />) };
}

describe('GoodsReceiptBottomPanel (default export / static slots)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders LinesBottomSection with showTotals=false and a relatedDocuments component', () => {
    render(<GoodsReceiptBottomPanel data={draftData} />);
    const section = screen.getByTestId('lines-bottom-section');
    expect(section).toHaveAttribute('data-show-totals', 'false');
    expect(section).toHaveAttribute('data-has-related', 'true');
  });

  it('exposes showLineTotals === false as a static flag', () => {
    expect(GoodsReceiptBottomPanel.showLineTotals).toBe(false);
  });
});

describe('GoodsReceiptBottomPanel.linesEmptyState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null (renders nothing) when document is not draft', () => {
    const { container } = renderEmptyState({ data: { documentStatus: 'CO', businessPartner: 'bp-1' } });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Add Lines button but NOT import buttons when there is no business partner', () => {
    renderEmptyState({ data: { documentStatus: 'DR' } });
    expect(screen.getByRole('button', { name: /addLines/ })).toBeInTheDocument();
    expect(screen.queryByText('importFromPurchaseOrder')).not.toBeInTheDocument();
    expect(screen.queryByText('importFromPurchaseInvoice')).not.toBeInTheDocument();
  });

  it('renders both import buttons when a business partner is set', () => {
    renderEmptyState();
    expect(screen.getByText('importFromPurchaseOrder')).toBeInTheDocument();
    expect(screen.getByText('importFromPurchaseInvoice')).toBeInTheDocument();
  });

  it('hides the add/import action row when canAddLine is false', () => {
    renderEmptyState({ canAddLine: false });
    expect(screen.queryByText('addLines')).not.toBeInTheDocument();
    expect(screen.queryByText('importFromPurchaseOrder')).not.toBeInTheDocument();
  });

  describe('save-first flow (fixed behavior)', () => {
    it('calls onSave("order") FIRST and does NOT open the modal locally when onSave returns falsy', async () => {
      const onSave = vi.fn().mockResolvedValue(false);
      renderEmptyState({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseOrder'));
      });
      expect(onSave).toHaveBeenCalledWith('order');
      expect(screen.queryByTestId('import-order-modal')).not.toBeInTheDocument();
    });

    it('calls onSave("invoice") FIRST and does NOT open the modal locally when onSave returns falsy', async () => {
      const onSave = vi.fn().mockResolvedValue(false);
      renderEmptyState({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseInvoice'));
      });
      expect(onSave).toHaveBeenCalledWith('invoice');
      expect(screen.queryByTestId('import-invoice-modal')).not.toBeInTheDocument();
    });

    it('opens the order modal locally when onSave returns truthy (existing-record path)', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      renderEmptyState({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseOrder'));
      });
      expect(onSave).toHaveBeenCalledWith('order');
      const modal = screen.getByTestId('import-order-modal');
      expect(modal).toHaveAttribute('data-invoice-id', 'receipt-1');
      expect(modal).toHaveAttribute('data-bp', 'bp-1');
    });

    it('opens the invoice modal locally when onSave returns truthy', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      renderEmptyState({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseInvoice'));
      });
      expect(screen.getByTestId('import-invoice-modal')).toBeInTheDocument();
    });
  });

  describe('forceOpen prop (post save+navigate path)', () => {
    it('auto-opens the invoice modal when forceOpen==="invoice" and calls onForceOpenHandled', () => {
      const onForceOpenHandled = vi.fn();
      renderEmptyState({ forceOpen: 'invoice', onForceOpenHandled });
      expect(screen.getByTestId('import-invoice-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('import-order-modal')).not.toBeInTheDocument();
      expect(onForceOpenHandled).toHaveBeenCalled();
    });

    it('auto-opens the order modal for any other forceOpen value', () => {
      const onForceOpenHandled = vi.fn();
      renderEmptyState({ forceOpen: 'order', onForceOpenHandled });
      expect(screen.getByTestId('import-order-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('import-invoice-modal')).not.toBeInTheDocument();
      expect(onForceOpenHandled).toHaveBeenCalled();
    });
  });

  it('invokes onAddLine when the Add Lines button is clicked', () => {
    const onAddLine = vi.fn();
    renderEmptyState({ onAddLine });
    fireEvent.click(screen.getByRole('button', { name: /addLines/ }));
    expect(onAddLine).toHaveBeenCalled();
  });
});

describe('GoodsReceiptBottomPanel.detailExtraActions (GoodsReceiptLineActions)', () => {
  beforeEach(() => vi.clearAllMocks());

  function renderActions(overrides = {}) {
    const props = {
      data: draftData,
      recordId: 'receipt-1',
      token: 'tok',
      apiBaseUrl: '/api/goods-receipt',
      onSave: vi.fn(),
      onRefresh: vi.fn(),
      ...overrides,
    };
    return { props, ...render(<LineActions {...props} />) };
  }

  it('returns null when not draft', () => {
    const { container } = renderActions({ data: { documentStatus: 'CO', businessPartner: 'bp-1' } });
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when no business partner', () => {
    const { container } = renderActions({ data: { documentStatus: 'DR' } });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the inline trigger buttons by default', () => {
    renderActions();
    expect(screen.getByText('importFromPurchaseOrder')).toBeInTheDocument();
    expect(screen.getByText('importFromPurchaseInvoice')).toBeInTheDocument();
  });

  it('hides inline trigger buttons when hideTrigger is true', () => {
    renderActions({ hideTrigger: true });
    expect(screen.queryByText('importFromPurchaseOrder')).not.toBeInTheDocument();
    expect(screen.queryByText('importFromPurchaseInvoice')).not.toBeInTheDocument();
  });

  describe('inline trigger save-first flow', () => {
    it('calls onSave("order") and does not open modal when onSave returns falsy', async () => {
      const onSave = vi.fn().mockResolvedValue(false);
      renderActions({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseOrder'));
      });
      expect(onSave).toHaveBeenCalledWith('order');
      expect(screen.queryByTestId('import-order-modal')).not.toBeInTheDocument();
    });

    it('opens the order modal when onSave returns truthy', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      renderActions({ onSave });
      await act(async () => {
        fireEvent.click(screen.getByText('importFromPurchaseOrder'));
      });
      expect(screen.getByTestId('import-order-modal')).toBeInTheDocument();
    });
  });

  describe('imperative handle (openImportOrderModal / openImportInvoiceModal)', () => {
    function HarnessHost({ actionProps }) {
      const ref = useRef(null);
      return (
        <>
          <LineActions ref={ref} {...actionProps} />
          <button data-testid="trigger-order" onClick={() => ref.current?.openImportOrderModal?.()}>order</button>
          <button data-testid="trigger-invoice" onClick={() => ref.current?.openImportInvoiceModal?.()}>invoice</button>
        </>
      );
    }

    it('openImportOrderModal calls onSave first then opens when truthy', async () => {
      const onSave = vi.fn().mockResolvedValue(true);
      render(<HarnessHost actionProps={{ data: draftData, recordId: 'receipt-1', token: 'tok', apiBaseUrl: '/api/goods-receipt', onSave, hideTrigger: true }} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('trigger-order'));
      });
      expect(onSave).toHaveBeenCalledWith('order');
      expect(screen.getByTestId('import-order-modal')).toBeInTheDocument();
    });

    it('openImportInvoiceModal does not open when onSave returns falsy', async () => {
      const onSave = vi.fn().mockResolvedValue(false);
      render(<HarnessHost actionProps={{ data: draftData, recordId: 'receipt-1', token: 'tok', apiBaseUrl: '/api/goods-receipt', onSave, hideTrigger: true }} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('trigger-invoice'));
      });
      expect(onSave).toHaveBeenCalledWith('invoice');
      expect(screen.queryByTestId('import-invoice-modal')).not.toBeInTheDocument();
    });
  });
});

describe('GoodsReceiptBottomPanel.lineMenuActions', () => {
  it('returns [] when document is not draft', () => {
    expect(GoodsReceiptBottomPanel.lineMenuActions({ data: { documentStatus: 'CO', businessPartner: 'bp-1' }, importRef: { current: {} } })).toEqual([]);
  });

  it('returns [] when there is no business partner', () => {
    expect(GoodsReceiptBottomPanel.lineMenuActions({ data: { documentStatus: 'DR' }, importRef: { current: {} } })).toEqual([]);
  });

  it('returns import-order and import-invoice items when draft with a business partner', () => {
    const items = GoodsReceiptBottomPanel.lineMenuActions({ data: draftData, importRef: { current: {} } });
    expect(items.map((i) => i.key)).toEqual(['import-order', 'import-invoice']);
  });

  it('wires onClick to the imperative handle methods', () => {
    const openImportOrderModal = vi.fn();
    const openImportInvoiceModal = vi.fn();
    const importRef = { current: { openImportOrderModal, openImportInvoiceModal } };
    const [orderItem, invoiceItem] = GoodsReceiptBottomPanel.lineMenuActions({ data: draftData, importRef });
    orderItem.onClick();
    invoiceItem.onClick();
    expect(openImportOrderModal).toHaveBeenCalled();
    expect(openImportInvoiceModal).toHaveBeenCalled();
  });

  it('does not throw when importRef.current is empty', () => {
    const [orderItem] = GoodsReceiptBottomPanel.lineMenuActions({ data: draftData, importRef: { current: null } });
    expect(() => orderItem.onClick()).not.toThrow();
  });
});
