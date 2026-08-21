// --- Mocks (before imports) ---

const apiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetch }));

vi.mock('../ConfirmPaymentModal', () => ({
  default: ({ dir, onConfirm }) => (
    <div data-testid="ConfirmPaymentModal__stub" data-dir={dir}>
      <button type="button" data-testid="fallback-confirm" onClick={onConfirm}>ok</button>
    </div>
  ),
}));

vi.mock('../NewPaymentEntryModal.jsx', () => ({
  default: (props) => (
    <div
      data-testid="NewPaymentEntryModal__stub"
      data-spec={props.specName}
      data-invoice={props.invoiceId}
      data-outstanding={String(props.outstanding)}
      data-payment={props.payment?.id}
      data-base={props.apiBaseUrl}
    >
      <button type="button" data-testid="stub-saved" onClick={() => props.onSaved()}>save</button>
    </div>
  ),
}));

// --- Imports ---

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentEditModalLauncher from '../PaymentEditModalLauncher.jsx';

const INVOICE = { id: 'inv-1', documentNo: 'F-1', outstandingAmount: '25.00' };
const PAYMENT_ROW = { id: 'pay-1', amount: '25.00', paymentMethod: 'Transferencia' };

function mockResolved({ invoice = INVOICE, payments = [PAYMENT_ROW] } = {}) {
  apiFetch.mockImplementation(async (path) => ({
    ok: true,
    json: async () => (path.includes('/action/invoicePayments')
      ? { response: { data: payments } }
      : { response: { data: [invoice] } }),
  }));
}

function renderLauncher(record, extra = {}) {
  return render(
    <PaymentEditModalLauncher
      dir="out" record={record}
      apiBaseUrl="http://host/sws/neo/payment-out"
      onConfirm={extra.onConfirm || vi.fn()}
      onClose={extra.onClose || vi.fn()}
      onRefresh={extra.onRefresh || vi.fn()} />);
}

/**
 * Confirmar on a draft payment opens the invoice's editable modal instead of a yes/no dialog: the
 * payment window has no form of its own, so that dialog was the only thing a user who reactivated a
 * payment could reach, and it could not change anything.
 */
describe('PaymentEditModalLauncher', () => {
  beforeEach(() => apiFetch.mockReset());

  it('opens the invoice editor with everything the modal needs', async () => {
    mockResolved();
    renderLauncher({ id: 'pay-1', invoiceId: 'inv-1' });

    const modal = await screen.findByTestId('NewPaymentEntryModal__stub');
    // Purchase invoice for a payment OUT — the editor lives on the invoice window, not this one.
    expect(modal).toHaveAttribute('data-spec', 'purchase-invoice');
    expect(modal).toHaveAttribute('data-invoice', 'inv-1');
    expect(modal).toHaveAttribute('data-outstanding', '25.00');
    expect(modal).toHaveAttribute('data-payment', 'pay-1');
    expect(modal).toHaveAttribute('data-base', 'http://host/sws/neo/purchase-invoice');
  });

  it('takes the payment from invoicePayments, the only source of its editable shape', async () => {
    // That action is what carries creditSourcesUsed; the payment window's own record does not, so
    // rebuilding the object by hand would silently drop the credits the draft consumed.
    mockResolved();
    renderLauncher({ id: 'pay-1', invoiceId: 'inv-1' });

    await screen.findByTestId('NewPaymentEntryModal__stub');
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchase-invoice/header/inv-1/action/invoicePayments',
      expect.objectContaining({ method: 'POST' }));
  });

  it('uses the sales invoice for a receipt', async () => {
    mockResolved();
    render(
      <PaymentEditModalLauncher
        dir="in" record={{ id: 'pay-1', invoiceId: 'inv-1' }}
        apiBaseUrl="http://host/sws/neo/payment-in"
        onConfirm={vi.fn()} onClose={vi.fn()} onRefresh={vi.fn()} />);

    const modal = await screen.findByTestId('NewPaymentEntryModal__stub');
    expect(modal).toHaveAttribute('data-spec', 'sales-invoice');
  });

  it('falls back to the confirm dialog when the payment has no single invoice', async () => {
    // An abandoned shell with no application, or a payment split across invoices. Confirming must
    // never become impossible just because the editor cannot represent the record.
    renderLauncher({ id: 'pay-1' });

    expect(await screen.findByTestId('ConfirmPaymentModal__stub')).toHaveAttribute('data-dir', 'out');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('falls back when the invoice or the payment cannot be loaded', async () => {
    mockResolved({ payments: [] });
    renderLauncher({ id: 'pay-1', invoiceId: 'inv-1' });

    expect(await screen.findByTestId('ConfirmPaymentModal__stub')).toBeInTheDocument();
  });

  it('falls back when the server refuses the lookup, rather than leaving a dead button', async () => {
    // A 500 on either request. The thrown-exception variant behaves the same (the effect catches it
    // and flips to the fallback) but is not asserted here: React re-dispatches errors raised during
    // an effect in dev, so the harness reports the recovered throw as a test failure.
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderLauncher({ id: 'pay-1', invoiceId: 'inv-1' });

    expect(await screen.findByTestId('ConfirmPaymentModal__stub')).toBeInTheDocument();
  });

  it('the fallback still confirms through the original action', async () => {
    const onConfirm = vi.fn();
    renderLauncher({ id: 'pay-1' }, { onConfirm });

    await userEvent.click(await screen.findByTestId('fallback-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('closes and refreshes the window after saving', async () => {
    // The editor never goes through handleProcess, so nothing else would reload the record.
    mockResolved();
    const onClose = vi.fn();
    const onRefresh = vi.fn();
    renderLauncher({ id: 'pay-1', invoiceId: 'inv-1' }, { onClose, onRefresh });

    await userEvent.click(await screen.findByTestId('stub-saved'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });
});
