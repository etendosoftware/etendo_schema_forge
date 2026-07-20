// Regression tests for the return-to-vendor-shipment import-only lines pattern
// (ETP-4462). Lines can only be created by importing from a source receipt:
// decisions.json sets window.maxDetailLines = 0, so the generated page passes
// an always-false addLineGuard and DetailView forwards canAddLine={false} to
// this panel's custom empty state. The empty state must then:
//   - hide the manual "+ add lines" button (action-add-lines-empty-state)
//   - keep the "import from receipt" secondary button
//   - switch the description to the import-only key (linesImportOnlyFromReceipt)
// Tests the live artifact copy (artifacts/return-to-vendor-shipment/custom/
// ReturnToVendorShipmentBottomPanel.jsx — the one the generated page imports)
// via the @generated alias. Harness mirrors GoodsReceiptBottomPanel.vitest.jsx.

// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLabel: () => (key) => key,
}));

// Stub LinesBottomSection (heavy generic component) but keep the REAL shared
// LinesEmptyState so the canAddLine gating is exercised end-to-end through the
// panel's custom empty state.
vi.mock('@/components/contract-ui', async () => {
  const actualEmptyState = await vi.importActual('@/components/contract-ui/LinesEmptyState.jsx');
  return {
    LinesBottomSection: (props) => (
      <div
        data-testid="lines-bottom-section"
        data-show-totals={String(props.showTotals)}
        data-has-related={String(!!props.relatedDocuments)}
      />
    ),
    LinesEmptyState: actualEmptyState.default,
  };
});

vi.mock('@generated/return-to-vendor-shipment/custom/RelatedDocuments', () => ({
  default: () => <div data-testid="related-documents" />,
}));

// The import modal is heavy (fetch + ImportLinesModal). Stub it so we can
// assert it gets rendered with the right props.
vi.mock('@/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal', () => ({
  default: (props) => <div data-testid="mock-import-modal" data-target-id={props.targetId} />,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReturnToVendorShipmentBottomPanel from '@generated/return-to-vendor-shipment/custom/ReturnToVendorShipmentBottomPanel.jsx';

const ReturnToVendorLinesEmptyState = ReturnToVendorShipmentBottomPanel.linesEmptyState;

const DRAFT_WITH_BP = { id: 'SHIP-1', documentStatus: 'DR', businessPartner: 'BP-1' };

const BASE_PROPS = {
  data: DRAFT_WITH_BP,
  onAddLine: vi.fn(),
  recordId: 'SHIP-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/return-to-vendor-shipment',
  onRefresh: vi.fn(),
};

describe('ReturnToVendorShipmentBottomPanel (default export / static slots)', () => {
  it('renders LinesBottomSection with showTotals=false and a relatedDocuments component', () => {
    render(<ReturnToVendorShipmentBottomPanel data={DRAFT_WITH_BP} />);
    const section = screen.getByTestId('lines-bottom-section');
    expect(section).toHaveAttribute('data-show-totals', 'false');
    expect(section).toHaveAttribute('data-has-related', 'true');
  });

  it('exposes linesEmptyState and detailExtraActions statics', () => {
    expect(ReturnToVendorShipmentBottomPanel.linesEmptyState).toBeTypeOf('function');
    expect(ReturnToVendorShipmentBottomPanel.detailExtraActions).toBeTruthy();
  });

  it('keeps line totals hidden', () => {
    expect(ReturnToVendorShipmentBottomPanel.showLineTotals).toBe(false);
  });

  // DetailView suppresses the whole add-line area for maxDetailLines:0 windows,
  // so once a draft has lines the panel itself must re-render the import
  // trigger above LinesBottomSection (gated on lines + draft + partner).
  describe('with-lines import trigger', () => {
    const LINES = [{ id: 'line-1' }];
    const baseProps = {
      recordId: 'SHIP-1',
      token: 'test-token',
      apiBaseUrl: '/sws/neo/return-to-vendor-shipment',
    };

    it('renders the import trigger when draft with a partner and lines exist', () => {
      render(<ReturnToVendorShipmentBottomPanel {...baseProps} data={DRAFT_WITH_BP} lines={LINES} />);
      expect(screen.getByText('importFromReceipt')).toBeInTheDocument();
      // LinesBottomSection still renders below the trigger.
      expect(screen.getByTestId('lines-bottom-section')).toBeInTheDocument();
    });

    it('does NOT render the trigger when the header has no business partner', () => {
      render(
        <ReturnToVendorShipmentBottomPanel
          {...baseProps}
          data={{ id: 'SHIP-1', documentStatus: 'DR' }}
          lines={LINES}
        />
      );
      expect(screen.queryByText('importFromReceipt')).not.toBeInTheDocument();
    });

    it('does NOT render the trigger when there are no lines (empty state owns the import CTA)', () => {
      render(<ReturnToVendorShipmentBottomPanel {...baseProps} data={DRAFT_WITH_BP} lines={[]} />);
      expect(screen.queryByText('importFromReceipt')).not.toBeInTheDocument();
    });

    it('does NOT render the trigger when the document is completed', () => {
      render(
        <ReturnToVendorShipmentBottomPanel
          {...baseProps}
          data={{ id: 'SHIP-1', documentStatus: 'CO', businessPartner: 'BP-1' }}
          lines={LINES}
        />
      );
      expect(screen.queryByText('importFromReceipt')).not.toBeInTheDocument();
    });
  });
});

describe('ReturnToVendorLinesEmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('default / canAddLine=true', () => {
    it('renders the manual add button, the import button, and the manual+import description', () => {
      render(<ReturnToVendorLinesEmptyState {...BASE_PROPS} />);
      expect(screen.getByTestId('action-add-lines-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('action-import-receipt-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('lines-empty-state-description'))
        .toHaveTextContent('addLinesManuallyOrImportFromReceipt');
    });

    it('renders the same with an explicit canAddLine={true}', () => {
      render(<ReturnToVendorLinesEmptyState {...BASE_PROPS} canAddLine={true} />);
      expect(screen.getByTestId('action-add-lines-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('lines-empty-state-description'))
        .toHaveTextContent('addLinesManuallyOrImportFromReceipt');
    });
  });

  describe('import-only / canAddLine=false', () => {
    it('hides the manual add button, shows the import-only description, keeps the import button', () => {
      render(<ReturnToVendorLinesEmptyState {...BASE_PROPS} canAddLine={false} />);
      expect(screen.queryByTestId('action-add-lines-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('lines-empty-state-description'))
        .toHaveTextContent('linesImportOnlyFromReceipt');
      expect(screen.getByTestId('action-import-receipt-empty-state')).toBeInTheDocument();
    });

    it('opens ImportFromReceiptModal when import is clicked and onSave resolves truthy', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(true);
      render(<ReturnToVendorLinesEmptyState {...BASE_PROPS} canAddLine={false} onSave={onSave} />);
      expect(screen.queryByTestId('mock-import-modal')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('action-import-receipt-empty-state'));

      expect(onSave).toHaveBeenCalledTimes(1);
      const modal = await screen.findByTestId('mock-import-modal');
      expect(modal).toHaveAttribute('data-target-id', 'SHIP-1');
    });

    it('does NOT open the modal when onSave resolves falsy (save failed)', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(false);
      render(<ReturnToVendorLinesEmptyState {...BASE_PROPS} canAddLine={false} onSave={onSave} />);

      await user.click(screen.getByTestId('action-import-receipt-empty-state'));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('mock-import-modal')).not.toBeInTheDocument();
    });

    it('hides the import button when the header has no business partner yet', () => {
      render(
        <ReturnToVendorLinesEmptyState
          {...BASE_PROPS}
          canAddLine={false}
          data={{ id: 'SHIP-1', documentStatus: 'DR' }}
        />
      );
      expect(screen.queryByTestId('action-import-receipt-empty-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-add-lines-empty-state')).not.toBeInTheDocument();
    });
  });
});

describe('ReturnToVendorShipmentBottomPanel.lineMenuActions', () => {
  it('returns [] when the document is not draft', () => {
    const items = ReturnToVendorShipmentBottomPanel.lineMenuActions({
      data: { documentStatus: 'CO', businessPartner: 'BP-1' },
      importRef: { current: {} },
    });
    expect(items).toEqual([]);
  });

  it('returns [] when there is no business partner', () => {
    const items = ReturnToVendorShipmentBottomPanel.lineMenuActions({
      data: { documentStatus: 'DR' },
      importRef: { current: {} },
    });
    expect(items).toEqual([]);
  });

  it('returns the import-receipt item wired to the imperative handle when draft with a partner', () => {
    const openImportModal = vi.fn();
    const items = ReturnToVendorShipmentBottomPanel.lineMenuActions({
      data: DRAFT_WITH_BP,
      importRef: { current: { openImportModal } },
    });
    expect(items.map((i) => i.key)).toEqual(['import-receipt']);
    items[0].onClick();
    expect(openImportModal).toHaveBeenCalled();
  });
});
