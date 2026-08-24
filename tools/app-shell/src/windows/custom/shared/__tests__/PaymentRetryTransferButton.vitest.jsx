// --- Mocks (before imports) ---

const apiFetch = vi.fn();
const apiFetchBases = [];
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => { apiFetchBases.push(base); return apiFetch; },
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a) },
}));

const notifyRecordUpdated = vi.fn();
vi.mock('../useRecordRefreshSignal', () => ({
  notifyRecordUpdated: (...a) => notifyRecordUpdated(...a),
}));

// --- Imports ---

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentRetryTransferButton from '../PaymentRetryTransferButton.jsx';

const RETRYABLE = { id: 'pay-1', status: 'ETGOERR', pisPaymentId: 'pis-9' };

function renderButton(data, onRefresh) {
  return render(
    <PaymentRetryTransferButton
      data={data} specName="payment-out" entity="header"
      apiBaseUrl="http://host/sws/neo/payment-out" onRefresh={onRefresh} />);
}

/** Answers the retry with a bank URL + the new attempt, then every poll with `statuses` in turn. */
function stubRetryThenPolls(...statuses) {
  let poll = 0;
  apiFetch.mockImplementation((url) => {
    if (url.endsWith('/retryPisPayment')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: { pisPaymentUrl: 'https://saltedge.example/w/2', pisPaymentId: 'pis-10' } },
        }),
      });
    }
    const status = statuses[Math.min(poll++, statuses.length - 1)];
    return Promise.resolve({ ok: true, json: async () => ({ response: { data: { status } } }) });
  });
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
    toastSuccess.mockReset();
    notifyRecordUpdated.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A real popup handle has close(); the poll calls it once the transfer resolves.
    vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false, close: vi.fn() }));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

  // ETP-4895: nothing followed a retry started here — the invoice modal's poll belongs to the
  // modal, Salt Edge's webhook cannot reach a server that is not publicly addressable, and PSD2's
  // periodic refresh is not scheduled by default. The attempt sat at 'requested' and the payment
  // read as in progress long after the bank had executed it.
  describe('following the retry to its outcome', () => {
    it('polls the NEW attempt, not the rejected one it replaced', async () => {
      stubRetryThenPolls('requested', 'executed');
      renderButton(RETRYABLE);
      await userEvent.click(screen.getByTestId('payment-retry-transfer'));

      await vi.advanceTimersByTimeAsync(3000);

      expect(apiFetch).toHaveBeenCalledWith('/payment-out/header/pay-1/action/pisPaymentStatus',
        expect.objectContaining({ body: JSON.stringify({ pisPaymentId: 'pis-10' }) }));
    });

    it('announces the payment and refreshes the window once the bank executes it', async () => {
      const onRefresh = vi.fn();
      stubRetryThenPolls('requested', 'executed');
      renderButton(RETRYABLE, onRefresh);
      await userEvent.click(screen.getByTestId('payment-retry-transfer'));

      await vi.advanceTimersByTimeAsync(9000);

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('cpRetryTransferDone'));
      // The panels showing the applied lines and totals fetch separately and have nothing in the
      // payload to react to, so they are told directly.
      expect(notifyRecordUpdated).toHaveBeenCalledWith('pay-1');
      expect(onRefresh).toHaveBeenCalled();
    });

    it('says so when the bank rejects the retry in turn', async () => {
      stubRetryThenPolls('failed');
      renderButton(RETRYABLE);
      await userEvent.click(screen.getByTestId('payment-retry-transfer'));

      await vi.advanceTimersByTimeAsync(3000);

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('cpRetryTransferRejected'));
    });

    it('keeps waiting through a status it does not know, instead of calling it a rejection', async () => {
      // Defaulting an unknown status to failure is exactly the bug pisOutcome was written to avoid.
      stubRetryThenPolls('initiated_info_required');
      renderButton(RETRYABLE);
      await userEvent.click(screen.getByTestId('payment-retry-transfer'));

      await vi.advanceTimersByTimeAsync(12000);

      expect(toastError).not.toHaveBeenCalledWith('cpRetryTransferRejected');
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('treats a failed poll request as a blip, not as a bank answer', async () => {
      let poll = 0;
      apiFetch.mockImplementation((url) => {
        if (url.endsWith('/retryPisPayment')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              response: { data: { pisPaymentUrl: 'https://x/w', pisPaymentId: 'pis-10' } },
            }),
          });
        }
        poll += 1;
        if (poll === 1) return Promise.reject(new Error('network'));
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: { status: 'executed' } } }) });
      });
      renderButton(RETRYABLE);
      await userEvent.click(screen.getByTestId('payment-retry-transfer'));

      await vi.advanceTimersByTimeAsync(9000);

      // The blip did not end the watch: the next tick saw the real outcome.
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('cpRetryTransferDone'));
      expect(toastError).not.toHaveBeenCalled();
    });
  });
});