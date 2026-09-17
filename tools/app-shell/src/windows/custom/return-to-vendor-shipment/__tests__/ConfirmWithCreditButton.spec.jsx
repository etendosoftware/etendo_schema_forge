// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: () => <div data-testid="confirm-inout-modal" />,
}));

vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: () => <div data-testid="create-invoice-confirm-modal" />,
}));

import ConfirmWithCreditButton from '../ConfirmWithCreditButton.jsx';
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

  itRendersNothingOutsideDrOrCo(ConfirmWithCreditButton, BASE_PROPS);

  it('renders confirm button in DR status', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 2 }} />);
    expect(screen.getByTestId('action-confirm-with-credit')).toBeInTheDocument();
  });

  it('confirm button is disabled when linesCount === 0', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 0 }} />);
    expect(screen.getByTestId('action-confirm-with-credit')).toBeDisabled();
  });

  it('confirm button is enabled when linesCount > 0', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 3 }} />);
    expect(screen.getByTestId('action-confirm-with-credit')).not.toBeDisabled();
  });

  // ── ETP-5381 — a DRAFT rectificative invoice already counts as "invoiced" ─────────
  // This assertion is deliberately inverted. It used to demand the button stay VISIBLE
  // while a rectificative invoice sat in DR, which is precisely how a second one got
  // created: a draft reserves nothing (C_Invoice_Post is what raises qtyinvoiced /
  // isinvoiced), so the same return document could be invoiced twice. The gate now
  // mirrors the server-side duplicate guard — any non-voided invoice hides the button.
  it('does NOT render create-return-invoice button when a DRAFT return invoice already exists', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [{ documentStatus: 'DR' }] }}
      />,
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('renders create-return-invoice button in CO status when no invoice exists at all', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [] }}
      />,
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('renders create-return-invoice button when the backend reports hasReturnInvoice: false', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />,
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('hides create-return-invoice when the backend flag is true, even if the array lists only a voided invoice (flag wins over the fallback)', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: true, returnInvoices: [{ documentStatus: 'VO' }] }}
      />,
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('array fallback uses the non-voided predicate: a VO-only list still shows the button', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [{ documentStatus: 'VO' }] }}
      />,
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

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
