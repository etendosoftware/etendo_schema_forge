import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'NewPaymentEntryModal.jsx'), 'utf8');

describe('NewPaymentEntryModal (step 2 — Nuevo cobro/pago)', () => {

  it('is the default export', () => {
    assert.match(src, /export default function NewPaymentEntryModal/);
  });

  it('drives the cuadre via the usePaymentBalance hook', () => {
    assert.match(src, /import \{ usePaymentBalance, formatPlain \} from '\.\/usePaymentBalance\.js'/);
    assert.match(src, /usePaymentBalance\(\{\s*total,\s*dir,\s*sources\s*\}\)/s);
  });

  it('renders the new-collection / new-payment title by direction', () => {
    assert.match(src, /ui\('cpNewCollection'\)/);
    assert.match(src, /ui\('cpNewPayment'\)/);
  });

  it('shows the four core fields (amount, date, method, account)', () => {
    assert.match(src, /data-testid="cp-amount-input"/);
    assert.match(src, /DateField/);
    assert.match(src, /ui\('cpPaymentMethod'\)/);
    assert.match(src, /ui\('account'\)/);
  });

  it('fetches accounts, methods, credit sources and the payment plan', () => {
    assert.match(src, /action\/invoiceAccounts|invoiceAccounts/);
    assert.match(src, /invoicePaymentMethods/);
    assert.match(src, /invoiceCreditSources/);
    assert.match(src, /paymentPlan/);
  });

  it('renders the credit / saldo-a-favor section as split adaptive groups', () => {
    assert.match(src, /function CreditGroup/);
    assert.match(src, /ui\('cpCreditGroupTitle'\)/);
    assert.match(src, /ui\('cpFavorGroupTitle'\)/);
    // each group only renders when it has rows
    assert.match(src, /if \(!rows\.length\) return null/);
  });

  it('only shows the credit section when there are consumable sources', () => {
    assert.match(src, /balance\.lines\.length > 0/);
  });

  it('shows a real-time balance summary with an Igualar action', () => {
    assert.match(src, /ui\('cpTotalInvoice'\)/);
    assert.match(src, /ui\('cpApplied'\)/);
    assert.match(src, /ui\('cpEqualize'\)/);
    assert.match(src, /balance\.equalize/);
  });

  it('offers credit/refund on excess for receipts and an inline error for payments', () => {
    assert.match(src, /ui\('cpLeaveCredit'\)/);
    assert.match(src, /ui\('cpGiveChange'\)/);
    assert.match(src, /ui\('cpExcessInline'/);
  });

  it('submits a draft on Guardar and a confirm on Confirmar', () => {
    assert.match(src, /submit\('draft'\)/);
    assert.match(src, /submit\('confirm'\)/);
    assert.match(src, /action\/registerPayment/);
  });

  it('sends process, creditSources and overpaymentAction in the payload', () => {
    assert.match(src, /process,/);
    assert.match(src, /creditSources:\s*balance\.consumedSources/);
    assert.match(src, /overpaymentAction:/);
  });

  it('disables Confirmar while the balance cannot be confirmed', () => {
    assert.match(src, /confirmDisabled/);
    assert.match(src, /balance\.canConfirm/);
  });
});
