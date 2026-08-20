// --- Mocks (before imports) ---

const apiFetch = vi.fn();
const apiFetchBases = [];
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => { apiFetchBases.push(base); return apiFetch; },
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a) => toastError(...a) } }));

// --- Imports ---

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentRetryTransferButton from '../PaymentRetryTransferButton.jsx';

const RETRYABLE = { id: 'pay-1', status: 'ETGOERR', pisPaymentId: 'pis-9' };

function renderButton(data) {
  return render(
    <PaymentRetryTransferButton
      data={data} specName="payment-out" entity="header"
      apiBaseUrl="http://host/sws/neo/payment-out" />);
}

/**
 * The payment window's half of the retry (ETP-4895). It exists because a rejection that arrives
 * after the bank had already committed leaves a real payment behind — flagged ETGOERR and kept
 * processed — and the invoice modal is not necessarily open to report it in.
 */
describe('PaymentRetryTransferButton', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toastError.mockReset();
    vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers the retry for a payment the bank rejected', () => {
    renderButton(RETRYABLE);
    expect(screen.getByTestId('payment-retry-transfer')).toHaveTextContent('cpRetryTransfer');
  });

  it('stays hidden for a payment that is merely in progress', () => {
    // A second order on a transfer the bank has committed to would pay the invoice twice, so the
    // affordance must not exist there — only ETGOERR qualifies.
    const { container } = renderButton({ id: 'pay-1', status: 'PPM', pisPaymentId: 'pis-9' });
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden when the backend sends no attempt to retry', () => {
    const { container } = renderButton({ id: 'pay-1', status: 'ETGOERR' });
    expect(container).toBeEmptyDOMElement();
  });

  it('builds the client off the spec ROOT, not this window, or the call never reaches NEO', () => {
    // apiBaseUrl points at …/sws/neo/payment-out but the action hangs off the spec root. Passing no
    // base at all made useApiFetch fall back to the SPA's own origin, and the POST 404'd against
    // the dev server instead of the backend (ETP-4895).
    apiFetchBases.length = 0;
    renderButton(RETRYABLE);
    expect(apiFetchBases).toContain('http://host/sws/neo');
  });

  it('posts against the payment record, not an invoice, and opens the bank window', async () => {
    // The retry reuses this payment, so the payment's own id is the record the action runs on —
    // the window has no invoice context to borrow.
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { pisPaymentUrl: 'https://saltedge.example/w/2' } } }),
    });
    renderButton(RETRYABLE);

    await userEvent.click(screen.getByTestId('payment-retry-transfer'));

    expect(apiFetch).toHaveBeenCalledWith('/payment-out/header/pay-1/action/retryPisPayment',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pisPaymentId: 'pis-9' }) }));
    expect(window.open).toHaveBeenCalledWith('https://saltedge.example/w/2', 'saltEdgePisWidget',
      expect.stringContaining('popup=yes'));
  });

  it('reports a failure and opens no window when the backend refuses', async () => {
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderButton(RETRYABLE);

    await userEvent.click(screen.getByTestId('payment-retry-transfer'));

    expect(toastError).toHaveBeenCalledWith('cpRetryTransferFailed');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('reports a failure when the request throws', async () => {
    apiFetch.mockRejectedValue(new Error('network'));
    renderButton(RETRYABLE);

    await userEvent.click(screen.getByTestId('payment-retry-transfer'));

    expect(toastError).toHaveBeenCalledWith('cpRetryTransferFailed');
  });
});
