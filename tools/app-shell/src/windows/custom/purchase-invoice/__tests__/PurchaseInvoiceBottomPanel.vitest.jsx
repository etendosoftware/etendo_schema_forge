// Regression suite for the import-modal remount bug (ETP-4583).
//
// Component under test: artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx
// (aliased via @generated). Its statics `linesEmptyState` and
// `detailExtraActions` each render one of two import modals: receipt / order.
//
// The bug: on a NEW purchase invoice, clicking "Importar desde pedido" (order)
// calls `onSave()`; DetailView saves and navigates, which REMOUNTS the
// component and resets the internal `pendingModal` ref to its 'receipt'
// default. The requested type is re-delivered via the `forceOpen` prop — but
// the old code ignored `forceOpen`'s value and read the stale ref, so after
// the remount the GOODS RECEIPT modal opened instead of the PURCHASE ORDER
// modal (Jira ETP-4583).
//
// The fix under test (same shape as ETP-4459 on sales-invoice): the
// forceOpen effect uses the forceOpen value when it is one of the valid
// modal-type strings ('order' | 'receipt'), falling back to
// `pendingModal.current` only for the legacy boolean `true`.
//
// Note: this file lives under tools/app-shell/src (not artifacts/.../__tests__)
// so that the vitest include glob (`src/**/*.vitest.{js,jsx}`) actually runs it
// in `npx vitest run` and CI — the .vitest.jsx files under artifacts are not
// matched by any harness.

// ── Mocks (hoisted before imports) ──────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// The default export delegates to LinesBottomSection — stub it so importing the
// module doesn't pull the whole contract-ui tree.
vi.mock('@/components/contract-ui', () => ({
  LinesBottomSection: (props) => <div data-testid="lines-bottom-section" {...props} />,
}));

vi.mock('@/windows/custom/purchase-invoice/RelatedDocuments.jsx', () => ({
  default: () => <div data-testid="related-documents" />,
}));

// The two import modals — each renders a distinguishable testid so the suite
// asserts WHICH modal mounts. vi.mock keys on the resolved module id, so these
// alias paths also intercept the component's relative './ImportFrom*Modal' imports.
vi.mock('@generated/purchase-invoice/custom/ImportFromGoodsReceiptModal', () => ({
  default: () => <div data-testid="import-receipt-modal" />,
}));

vi.mock('@generated/purchase-invoice/custom/ImportFromPurchaseOrderModal', () => ({
  default: () => <div data-testid="import-order-modal" />,
}));

import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PurchaseInvoiceBottomPanel from '@generated/purchase-invoice/custom/PurchaseInvoiceBottomPanel';

const LinesEmptyState = PurchaseInvoiceBottomPanel.linesEmptyState;
const DetailExtraActions = PurchaseInvoiceBottomPanel.detailExtraActions;

// Draft regular invoice (subtype FAC) with a business partner — the shape a
// NEW "factura de compra" has right after the save-navigate remount.
const FAC_DRAFT = {
  documentStatus: 'DR',
  businessPartner: 'bp-1',
  apInvoiceSubtype: 'FAC',
};

const BASE_PROPS = {
  recordId: 'inv-1',
  token: 'test-token',
  apiBaseUrl: '/api/purchase-invoice',
};

const MODAL_IDS = ['import-receipt-modal', 'import-order-modal'];

function expectOnlyModal(expectedId) {
  for (const id of MODAL_IDS) {
    if (id === expectedId) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PurchaseInvoiceBottomPanel.linesEmptyState — import modal selection (ETP-4583)', () => {
  it("forceOpen='order' on a draft mounts the PURCHASE ORDER modal, not receipt (remount regression)", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen="order"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    // Pre-fix, the stale pendingModal ref ('receipt' default after remount)
    // won and the goods-receipt modal opened even though "Importar desde
    // pedido" was clicked.
    expectOnlyModal('import-order-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("forceOpen='receipt' on a draft mounts the RECEIPT modal", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen="receipt"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-receipt-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it('legacy forceOpen=true (boolean) falls back to the ref default (receipt) without crashing', () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen={true}
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-receipt-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("clicking the order-import button on a draft calls onSave('order') and mounts the order modal when onSave resolves truthy", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<LinesEmptyState {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    // No modal before the click.
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
    await user.click(screen.getByText('importFromPurchaseOrder'));
    // Regression guard (ETP-4583 review fix): onSave must be called WITH the
    // explicit type. DetailView's handleImportClick defaults its `modalType`
    // param to 'order' when called bare — so a bare onSave() would silently
    // make every import (including receipt) carry 'order' across the
    // save-navigate remount, opening the wrong modal on the receipt path.
    expect(onSave).toHaveBeenCalledWith('order');
    expectOnlyModal('import-order-modal');
  });

  it("does not mount any modal when onSave('order') resolves falsy (save failed)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<LinesEmptyState {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromPurchaseOrder'));
    expect(onSave).toHaveBeenCalledWith('order');
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("clicking the receipt-import button on a draft calls onSave('receipt') and mounts the receipt modal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<LinesEmptyState {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromGoodsReceipt'));
    expect(onSave).toHaveBeenCalledWith('receipt');
    expectOnlyModal('import-receipt-modal');
  });
});

describe('PurchaseInvoiceBottomPanel.detailExtraActions — import modal selection (ETP-4583)', () => {
  it("forceOpen='order' on a draft mounts the PURCHASE ORDER modal, not receipt (remount regression)", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <DetailExtraActions
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen="order"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-order-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("forceOpen='receipt' on a draft mounts the RECEIPT modal", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <DetailExtraActions
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen="receipt"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-receipt-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it('legacy forceOpen=true (boolean) falls back to the ref default (receipt) without crashing', () => {
    const onForceOpenHandled = vi.fn();
    render(
      <DetailExtraActions
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen={true}
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-receipt-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("the imperative openImportOrderModal handle calls onSave('order') and mounts the order modal", async () => {
    // The visible trigger button only opens the RECEIPT modal; the ORDER
    // modal on this component is reached via the imperative handle exposed
    // to the "+ line" menu (PurchaseInvoiceBottomPanel.lineMenuActions).
    const onSave = vi.fn().mockResolvedValue(true);
    const ref = createRef();
    render(<DetailExtraActions {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} ref={ref} />);
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
    await act(async () => { await ref.current.openImportOrderModal(); });
    // Regression guard (ETP-4583 review fix): see the linesEmptyState suite
    // above for why the explicit argument matters, not just "was called".
    expect(onSave).toHaveBeenCalledWith('order');
    expectOnlyModal('import-order-modal');
  });

  it("clicking the receipt trigger on a draft calls onSave('receipt') and mounts the receipt modal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<DetailExtraActions {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromGoodsReceipt'));
    expect(onSave).toHaveBeenCalledWith('receipt');
    expectOnlyModal('import-receipt-modal');
  });

  it("does not mount any modal when onSave('receipt') resolves falsy (save failed)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<DetailExtraActions {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromGoodsReceipt'));
    expect(onSave).toHaveBeenCalledWith('receipt');
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
  });
});
