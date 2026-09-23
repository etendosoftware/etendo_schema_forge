// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Exposes the props this wrapper is responsible for forwarding (spec/entity names,
// the confirm label) so the event-driven flow can assert the wiring.
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: ({ specName, entityName, confirmLabel }) => (
    <div
      data-testid="confirm-inout-modal"
      data-spec-name={specName}
      data-entity-name={entityName}
      data-confirm-label={confirmLabel}
    />
  ),
}));

vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: () => <div data-testid="create-invoice-confirm-modal" />,
}));

import ConfirmWithCreditButton, { CONFIRM_EVENT } from '../ConfirmWithCreditButton.jsx';
import { itRendersNothingOutsideDrOrCo } from '../../shared/__tests__/confirmWithCreditButtonCopyLinkTest.jsx';

const BASE_PROPS = {
  recordId: 'RTV-001',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/return-to-vendor-shipment',
};

describe('ConfirmWithCreditButton (return-to-vendor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'INV-1', documentNo: 'FAC-1', grandTotalAmount: 100 } } }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  itRendersNothingOutsideDrOrCo(ConfirmWithCreditButton, BASE_PROPS, CONFIRM_EVENT);

  // ETP-5408 — the Borrador "Confirmar" is the GENERIC draftMode Confirm (DetailView,
  // `action-save`), whose onConfirm (index.jsx DRAFT_MODE) dispatches CONFIRM_EVENT.
  // This wrapper renders no Borrador button: it only hosts the flow the event opens.
  const fireConfirm = () => act(() => { window.dispatchEvent(new CustomEvent(CONFIRM_EVENT)); });

  it('exports a window-scoped CONFIRM_EVENT name', () => {
    expect(CONFIRM_EVENT).toBe('return-to-vendor-shipment:open-confirm-modal');
  });

  it('renders no Borrador confirm button of its own', () => {
    const { container } = render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 2 }} />);
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByTestId('action-confirm-with-credit')).not.toBeInTheDocument();
  });

  it('opens ConfirmInOutModal for this window when CONFIRM_EVENT is dispatched in Borrador', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 2 }} />);
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    fireConfirm();
    const modal = screen.getByTestId('confirm-inout-modal');
    expect(modal).toHaveAttribute('data-spec-name', 'return-to-vendor-shipment');
    expect(modal).toHaveAttribute('data-entity-name', 'returnToVendorShipment');
    expect(modal).toHaveAttribute('data-confirm-label', 'confirmReturn');
  });

  // ETP-5408: empty documents are blocked by the generic Confirm button itself
  // (draftMode.disableWhenEmpty on the live lines); the listener does not re-check the
  // header's linesCount, which can lag right after the first line is added.
  it('opens the modal even when the header linesCount is 0 (the lines gate lives in the button)', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 0 }} />);
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('does not open the modal while saveGate blocks the record', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
        saveGate={{ blocked: true, title: 'saveMissingRequired' }}
      />,
    );
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('opens the modal when linesCount is absent', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: undefined }} />);
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('does not open the confirm modal on a completed document', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CO', hasReturnInvoice: false }} />);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  // The duplicate-invoice gate (hasReturnInvoice flag vs. returnInvoices array fallback)
  // is shared behaviour — covered once in
  // shared/__tests__/ConfirmWithCreditButtonBase.vitest.jsx. What stays here is the
  // wiring this window owns: that it renders the base and forwards its own `data`.
  it('does NOT render create-return-invoice button when a CO invoice already exists', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [{ documentStatus: 'CO' }] }}
      />,
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('CO state falls back to hasReturnInvoice flag when returnInvoices is absent', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: true }}
      />,
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('does NOT render a print button (printing is unified in DocumentPrintDrawer)', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 1 }} />);
    expect(screen.queryByText('print')).not.toBeInTheDocument();
  });

  it('does NOT render a clone button', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 1 }} />);
    expect(screen.queryByTestId('action-clone')).not.toBeInTheDocument();
  });

  it('does NOT render a clone button in CO status', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [] }}
      />,
    );
    expect(screen.queryByTestId('action-clone')).not.toBeInTheDocument();
  });

  // ETP-4737: postConfirmButtonLabel={ui('returnToVendor.createCreditNote')} is
  // hardcoded on this wrapper — verify it actually reaches the rendered button
  // text through ConfirmWithCreditButtonBase, instead of the base's own
  // ui('createReturnInvoice') fallback.
  it('forwards ui("returnToVendor.createCreditNote") as the create-return-invoice button label', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [] }}
      />,
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('returnToVendor.createCreditNote');
  });
});
