// Regression suite for the import-modal remount bug (ETP-4459).
//
// Component under test: artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx
// (aliased via @generated). Its statics `linesEmptyState` and
// `detailExtraActions` each render one of three import modals:
// shipment / order / return.
//
// The bug: on a NEW invoice, clicking an import button calls `await onSave(type)`;
// DetailView saves and navigates, which REMOUNTS the component and resets the
// internal `pendingModal` ref to its 'shipment' default. The requested type is
// re-delivered via the `forceOpen` prop — but the old code ignored `forceOpen`'s
// value and read the stale ref, so a return invoice's "Importar desde devolución"
// opened the SHIPMENT modal after the remount.
//
// The fix under test: (1) click handlers pass their type to `onSave`
// ('shipment' | 'order' | 'return'), (2) the forceOpen effect uses the
// forceOpen value when it is one of those strings, falling back to
// `pendingModal.current` for the legacy boolean `true`.
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

vi.mock('@generated/sales-invoice/custom/RelatedDocuments', () => ({
  default: () => <div data-testid="related-documents" />,
}));

// The three import modals — each renders a distinguishable testid so the suite
// asserts WHICH modal mounts. vi.mock keys on the resolved module id, so these
// alias paths also intercept the component's relative './ImportFrom*Modal' imports.
vi.mock('@generated/sales-invoice/custom/ImportFromShipmentModal', () => ({
  default: () => <div data-testid="import-shipment-modal" />,
}));

vi.mock('@generated/sales-invoice/custom/ImportFromOrderModal', () => ({
  default: () => <div data-testid="import-order-modal" />,
}));

vi.mock('@generated/sales-invoice/custom/ImportFromReturnShipmentModal', () => ({
  default: () => <div data-testid="import-return-modal" />,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InvoiceBottomPanel from '@generated/sales-invoice/custom/InvoiceBottomPanel';

const LinesEmptyState = InvoiceBottomPanel.linesEmptyState;
const DetailExtraActions = InvoiceBottomPanel.detailExtraActions;

// Draft return invoice (subtype DEV) with a business partner — the shape a NEW
// "factura de devolución" has right after the save-navigate remount.
const DEV_DRAFT = {
  documentStatus: 'DR',
  businessPartner: 'bp-1',
  arInvoiceSubtype: 'DEV',
};

// Draft regular invoice (subtype FAC).
const FAC_DRAFT = {
  documentStatus: 'DR',
  businessPartner: 'bp-1',
  arInvoiceSubtype: 'FAC',
};

const BASE_PROPS = {
  recordId: 'inv-1',
  token: 'test-token',
  apiBaseUrl: '/api/sales-invoice',
};

const MODAL_IDS = ['import-shipment-modal', 'import-order-modal', 'import-return-modal'];

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

describe('InvoiceBottomPanel.linesEmptyState — import modal selection (ETP-4459)', () => {
  it("forceOpen='return' on a DEV draft mounts the RETURN modal, not shipment (remount regression)", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={DEV_DRAFT}
        forceOpen="return"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    // Pre-fix, the stale pendingModal ref ('shipment' default after remount)
    // won and the shipment modal opened on a return invoice.
    expectOnlyModal('import-return-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("forceOpen='order' on a regular (FAC) draft mounts the ORDER modal", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen="order"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-order-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it('legacy forceOpen=true (boolean) falls back to the ref default (shipment) without crashing', () => {
    const onForceOpenHandled = vi.fn();
    render(
      <LinesEmptyState
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen={true}
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-shipment-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("clicking the return-import button on a DEV draft calls onSave('return') and mounts the return modal when onSave resolves truthy", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<LinesEmptyState {...BASE_PROPS} data={DEV_DRAFT} onSave={onSave} />);
    // No modal before the click.
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
    // useUI mock returns the key, so the button is labelled with the i18n key.
    await user.click(screen.getByText('importFromReturnShipment'));
    expect(onSave).toHaveBeenCalledWith('return');
    expectOnlyModal('import-return-modal');
  });

  it('does not mount any modal when onSave resolves falsy (save failed)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<LinesEmptyState {...BASE_PROPS} data={DEV_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromReturnShipment'));
    expect(onSave).toHaveBeenCalledWith('return');
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("clicking shipment/order buttons on a FAC draft passes the matching type to onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<LinesEmptyState {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromShipment'));
    expect(onSave).toHaveBeenLastCalledWith('shipment');
    expectOnlyModal('import-shipment-modal');
  });
});

describe('InvoiceBottomPanel.detailExtraActions — import modal selection (ETP-4459)', () => {
  it("forceOpen='return' on a DEV draft mounts the RETURN modal, not shipment (remount regression)", () => {
    const onForceOpenHandled = vi.fn();
    render(
      <DetailExtraActions
        {...BASE_PROPS}
        data={DEV_DRAFT}
        forceOpen="return"
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-return-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("forceOpen='order' on a regular (FAC) draft mounts the ORDER modal", () => {
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

  it('legacy forceOpen=true (boolean) falls back to the ref default (shipment) without crashing', () => {
    const onForceOpenHandled = vi.fn();
    render(
      <DetailExtraActions
        {...BASE_PROPS}
        data={FAC_DRAFT}
        forceOpen={true}
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expectOnlyModal('import-shipment-modal');
    expect(onForceOpenHandled).toHaveBeenCalled();
  });

  it("clicking the return trigger on a DEV draft calls onSave('return') and mounts the return modal when onSave resolves truthy", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<DetailExtraActions {...BASE_PROPS} data={DEV_DRAFT} onSave={onSave} />);
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
    await user.click(screen.getByText('importFromReturnShipment'));
    expect(onSave).toHaveBeenCalledWith('return');
    expectOnlyModal('import-return-modal');
  });

  it("clicking the shipment trigger on a FAC draft calls onSave('shipment')", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<DetailExtraActions {...BASE_PROPS} data={FAC_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromShipment'));
    expect(onSave).toHaveBeenCalledWith('shipment');
    expectOnlyModal('import-shipment-modal');
  });

  it('does not mount any modal when onSave resolves falsy (save failed)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<DetailExtraActions {...BASE_PROPS} data={DEV_DRAFT} onSave={onSave} />);
    await user.click(screen.getByText('importFromReturnShipment'));
    for (const id of MODAL_IDS) expect(screen.queryByTestId(id)).toBeNull();
  });
});
