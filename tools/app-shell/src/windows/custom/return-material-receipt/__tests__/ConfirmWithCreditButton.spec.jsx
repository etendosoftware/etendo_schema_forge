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

vi.mock('../useReturnReceiptPdf', () => ({
  generateReturnReceiptPdf: vi.fn(),
  getReturnReceiptPdfLabels: () => ({}),
}));

import ConfirmWithCreditButton from '../ConfirmWithCreditButton.jsx';

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

  it('renders nothing when status is not DR or CO', () => {
    const { container } = render(
      <ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CL', linesCount: 2 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders process receipt button in DR status', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 2 }} />);
    expect(screen.getByTestId('action-confirm-with-credit')).toBeInTheDocument();
  });

  it('confirm button is disabled when linesCount === 0', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 0 }} />);
    const btn = screen.getByTestId('action-confirm-with-credit');
    expect(btn).toBeDisabled();
  });

  it('confirm button is enabled when linesCount > 0', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 3 }} />);
    const btn = screen.getByTestId('action-confirm-with-credit');
    expect(btn).not.toBeDisabled();
  });

  it('confirm button is enabled when linesCount is not a number', () => {
    // Non-numeric linesCount → confirmDisabled is false (condition requires typeof === number)
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: undefined }} />);
    const btn = screen.getByTestId('action-confirm-with-credit');
    expect(btn).not.toBeDisabled();
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

  it('always renders the print button regardless of status', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 1 }} />);
    expect(screen.getByText('print')).toBeInTheDocument();

    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CO', returnInvoices: [] }} />);
    expect(screen.getAllByText('print').length).toBeGreaterThan(0);
  });
});
