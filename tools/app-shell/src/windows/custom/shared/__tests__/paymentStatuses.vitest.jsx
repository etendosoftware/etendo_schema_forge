import { describe, it, expect } from 'vitest';

import { isPaymentProcessed, paymentDisplayState } from '../paymentStatuses';

/**
 * The four surfaces that show a payment — the invoice's payment modal, the invoice preview card,
 * the payments grid and the payment window — each used to carry its own copy of the status list.
 * That is how a single Salt Edge transfer read "Pago en progreso" in one and "Pago depositado" in
 * another at the same time (ETP-4895). These tests pin the shared rule they now all go through.
 */
describe('paymentDisplayState', () => {
  it('reads PPM as in progress: confirmed, but not withdrawn from the account yet', () => {
    // Core sets PPM when a payment is confirmed without a FIN_Finacc_Transaction. The accounts
    // Etendo Go pays from over PIS are configured without automatic withdrawal precisely so the
    // transaction only appears once Salt Edge reports the transfer executed.
    expect(paymentDisplayState({ status: 'PPM', processed: true })).toBe('inProgress');
  });

  it('reads PWNC as deposited — the withdrawal is recorded, so the money moved', () => {
    expect(paymentDisplayState({ status: 'PWNC', processed: true })).toBe('deposited');
  });

  it('trusts pisPending over the status when the backend sends it', () => {
    // Only the invoice payment-list action carries pisPending; it is the exact answer (processed,
    // initiated over PIS, no bank transaction) where the status alone can only approximate it.
    expect(paymentDisplayState({ status: 'PWNC', processed: true, pisPending: true })).toBe('inProgress');
  });

  it.each(['RPR', 'RPPC', 'RDNC', 'RPAE'])('reads %s as deposited', (status) => {
    expect(paymentDisplayState({ status, processed: true })).toBe('deposited');
  });

  it('reads a rejected bank transfer as an error, ahead of everything else', () => {
    expect(paymentDisplayState({ status: 'ETGOERR', processed: false })).toBe('error');
  });

  it.each([{ status: 'RPAP', processed: false }, {}, null])('reads %j as a draft', (payment) => {
    expect(paymentDisplayState(payment)).toBe('draft');
  });

  it('keeps "in progress" separate from "still a draft": a PPM payment is processed', () => {
    // The distinction the delete-draft button and the row-click navigation depend on. Folding PPM
    // into the draft bucket would offer to delete a payment the bank has already committed to.
    expect(isPaymentProcessed({ status: 'PPM', processed: true })).toBe(true);
    expect(isPaymentProcessed({ status: 'RPAP', processed: false })).toBe(false);
  });
});
