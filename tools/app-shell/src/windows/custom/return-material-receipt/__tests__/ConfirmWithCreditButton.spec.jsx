// @vitest-environment jsdom
// @covers tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Probe exposing the forwarded spec/entity names and confirm label (shared helper).
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => import('../../shared/__tests__/confirmInOutModalProbe.jsx'));

// Exposes the doc this window hands the result popup: the popup derives its whole copy from `type`.
vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: ({ docs }) => (
    <div data-testid="confirm-result-modal" data-doc-type={docs?.[0]?.type} data-route={docs?.[0]?.route} />
  ),
}));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onConfirm }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button type="button" data-testid="create-invoice-confirm" onClick={() => onConfirm()} />
    </div>
  ),
}));

import ConfirmWithCreditButton, { CONFIRM_EVENT } from '../ConfirmWithCreditButton.jsx';
import { itRendersNothingOutsideDrOrCo } from '../../shared/__tests__/confirmWithCreditButtonCopyLinkTest.jsx';

const BASE_PROPS = {
  recordId: 'REC-001',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/return-material-receipt',
};

describe('ConfirmWithCreditButton', () => {
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
  // `action-save`), whose onConfirm (buildReturnDraftMode, shared/returnDraftMode.js) dispatches CONFIRM_EVENT.
  // This wrapper renders no Borrador button: it only hosts the flow the event opens.
  const fireConfirm = () => act(() => { window.dispatchEvent(new CustomEvent(CONFIRM_EVENT)); });

  it('exports a window-scoped CONFIRM_EVENT name', () => {
    expect(CONFIRM_EVENT).toBe('return-material-receipt:open-confirm-modal');
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
    expect(modal).toHaveAttribute('data-spec-name', 'return-material-receipt');
    expect(modal).toHaveAttribute('data-entity-name', 'returnMaterialReceipt');
    expect(modal).toHaveAttribute('data-confirm-label', 'processReceipt');
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
  it('does NOT render create-return-invoice button when there is already a CO invoice', () => {
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

  it('CO state shows create-return-invoice when hasReturnInvoice is false and returnInvoices is absent', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />,
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('does NOT render a print button (printing is unified in DocumentPrintDrawer)', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 1 }} />);
    expect(screen.queryByText('print')).not.toBeInTheDocument();

    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CO', returnInvoices: [] }} />);
    expect(screen.queryAllByText('print').length).toBe(0);
  });

  // ETP-4737: postConfirmButtonLabel={ui('returnReceipt.createRectificativeInvoice')}
  // is hardcoded on this wrapper — verify it actually reaches the rendered button
  // text through ConfirmWithCreditButtonBase, instead of the base's own
  // ui('createReturnInvoice') fallback.
  it('forwards ui("returnReceipt.createRectificativeInvoice") as the create-return-invoice button label', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [] }}
      />,
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('returnReceipt.createRectificativeInvoice');
  });

  it('announces the created invoice as a facturaRectificativa in the result popup', async () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ id: BASE_PROPS.recordId, documentStatus: 'CO', hasReturnInvoice: false }} />);
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));

    const result = await screen.findByTestId('confirm-result-modal');
    expect(result).toHaveAttribute('data-doc-type', 'facturaRectificativa');
    expect(result).toHaveAttribute('data-route', '/sales-invoice/INV-1');
  });
});
