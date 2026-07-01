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

vi.mock('../useReturnToVendorPdf', () => ({
  generateReturnToVendorPdf: vi.fn(),
  getReturnToVendorPdfLabels: () => ({}),
}));

import ConfirmWithCreditButton from '../ConfirmWithCreditButton.jsx';

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

  it('renders nothing when status is not DR or CO', () => {
    const { container } = render(
      <ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CL', linesCount: 2 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

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

  it('renders create-return-invoice button in CO status when no CO invoice exists', () => {
    render(
      <ConfirmWithCreditButton
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', returnInvoices: [{ documentStatus: 'DR' }] }}
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

  it('always renders the print button regardless of status', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 1 }} />);
    expect(screen.getByText('print')).toBeInTheDocument();
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
});
