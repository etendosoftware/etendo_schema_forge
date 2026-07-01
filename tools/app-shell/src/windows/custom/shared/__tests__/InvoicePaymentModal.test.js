import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoicePaymentModal.jsx'), 'utf8');

describe('InvoicePaymentModal (step 1 — Cobros/Pagos de la factura)', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports InvoicePaymentModal as the default export', () => {
    assert.match(src, /export default function InvoicePaymentModal/);
  });

  it('exports PaymentRegisterForm as a named export (retained for back-compat)', () => {
    assert.match(src, /export function PaymentRegisterForm/);
  });

  it('accepts invoiceId, invoiceData, specName, apiBaseUrl, onClose, and onPaymentAdded props without token', () => {
    assert.match(src, /invoiceId/);
    assert.match(src, /invoiceData/);
    assert.match(src, /specName/);
    assert.match(src, /onPaymentAdded/);
    assert.doesNotMatch(src, /export default function InvoicePaymentModal\(\{[^}]*\btoken\b/s);
  });

  it('uses the centralized authenticated fetch hook instead of building Authorization locally', () => {
    assert.match(src, /useApiFetch/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer \$\{token\}`/);
  });

  // ── Step-1 redesign: header, stats, empty state, footer ─────────────────────

  it('renders the collections/payments title by direction', () => {
    assert.match(src, /ui\('cpCollectionsOfInvoice'\)/);
    assert.match(src, /ui\('cpPaymentsOfInvoice'\)/);
  });

  it('shows total and pending-balance stats', () => {
    assert.match(src, /ui\('cpTotalAmount'\)/);
    assert.match(src, /ui\('pendingBalanceLabel'\)/);
  });

  it('shows an empty state when there are no movements', () => {
    assert.match(src, /ui\('cpNoCollectionsYet'\)/);
    assert.match(src, /ui\('cpNoPaymentsYet'\)/);
  });

  it('shows a registered-count footer by direction', () => {
    assert.match(src, /ui\('cpCollectionsRegisteredCount'/);
    assert.match(src, /ui\('cpPaymentsRegisteredCount'/);
  });

  it('renders a direction badge', () => {
    assert.match(src, /import \{ DirBadge \} from '\.\/paymentModalUi\.jsx'/);
    assert.match(src, /<DirBadge /);
  });

  it('classifies a listed payment as deposited via the processed flag', () => {
    assert.match(src, /function isDeposited/);
    assert.match(src, /p\.processed/);
    assert.match(src, /ui\('cpStatusDeposited'\)/);
    assert.match(src, /ui\('cpStatusDraft'\)/);
  });

  // ── Two-step flow: opens NewPaymentEntryModal ───────────────────────────────

  it('shows the add button only for completed invoices with outstanding balance', () => {
    assert.match(src, /isCompleted/);
    assert.match(src, /outstanding\s*>\s*0/);
    assert.match(src, /ui\('cpAddCollection'\)/);
    assert.match(src, /ui\('cpAddPayment'\)/);
  });

  it('mounts NewPaymentEntryModal (step 2) when adding a payment', () => {
    assert.match(src, /import NewPaymentEntryModal from '\.\/NewPaymentEntryModal\.jsx'/);
    assert.match(src, /<NewPaymentEntryModal/);
    assert.match(src, /showNew/);
  });

  it('unmounts step 1 while the step-2 modal is open', () => {
    assert.match(src, /\{!showNew &&/);
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  it('fetches installments from the specName paymentPlan endpoint with parentId', () => {
    assert.match(src, /\$\{specName\}\/paymentPlan\?parentId=\$\{invoiceId\}/);
  });

  it('fetches payment history via the invoicePayments action', () => {
    assert.match(src, /action\/invoicePayments/);
  });

  it('fetches installments and payments on mount', () => {
    assert.match(src, /fetchInstallments/);
    assert.match(src, /fetchPayments/);
  });

  it('refreshes and notifies via onPaymentAdded after a payment is saved', () => {
    assert.match(src, /handleSaved/);
    assert.match(src, /onPaymentAdded\?\.\(\)/);
  });

  // ── Sorting / direction routing ─────────────────────────────────────────────

  it('resolves the pending schedule by due date for the new payment modal', () => {
    assert.match(src, /\.sort\(/);
    assert.match(src, /a\.dueDate/);
    assert.match(src, /b\.dueDate/);
    assert.match(src, /pendingScheduleId/);
  });

  it('routes to payment-out for purchase-invoice and payment-in otherwise', () => {
    assert.match(src, /purchase-invoice.*payment-out|payment-out.*purchase-invoice/s);
    assert.match(src, /payment-in/);
  });

  it('uses a paymentPrefix helper to resolve the direction', () => {
    assert.match(src, /function paymentPrefix/);
    assert.match(src, /paymentPrefix\(specName\)/);
  });

  // ── Cancellation ───────────────────────────────────────────────────────────

  it('closes the modal on backdrop click and stops propagation on the card', () => {
    assert.match(src, /onClick={onClose}/);
    assert.match(src, /e\.stopPropagation/);
  });

  // ── PaymentRegisterForm (retained) ─────────────────────────────────────────

  it('keeps PaymentRegisterForm posting to the registerPayment action', () => {
    assert.match(src, /action\/registerPayment/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('keeps PaymentRegisterForm fetching accounts via invoiceAccounts', () => {
    assert.match(src, /action\/invoiceAccounts/);
    assert.match(src, /fin_financial_account_id/);
  });

  it('keeps the amountExceeded guard in PaymentRegisterForm', () => {
    assert.match(src, /amountExceeded/);
  });

  // ── ETP-4005: PaymentRegisterForm submit validation (unchanged) ─────────────

  describe('ETP-4005 — PaymentRegisterForm submit validation', () => {
    it('declares an invalidField state initialized to null', () => {
      assert.match(src, /\[invalidField, setInvalidField\] = useState\(null\)/);
    });

    it('marks the date field invalid and shows paymentDateRequired when date is empty', () => {
      assert.match(src, /if \(!date\) \{[^}]*setInvalidField\('date'\)[^}]*setError\(ui\('paymentDateRequired'\)\)[^}]*return;\s*\}/);
    });

    it('marks the amount field invalid and shows paymentAmountInvalid when amount is missing or non-positive', () => {
      assert.match(src, /if \(!amount \|\| amount <= 0\) \{[^}]*setInvalidField\('amount'\)[^}]*setError\(ui\('paymentAmountInvalid'\)\)[^}]*return;\s*\}/);
    });

    it('returns silently when amount exceeds outstanding', () => {
      assert.match(src, /if \(amountExceeded\)\s*return;/);
    });

    it('marks the account field invalid and shows paymentAccountRequired when accountId is empty', () => {
      assert.match(src, /if \(!accountId\) \{[^}]*setInvalidField\('account'\)[^}]*setError\(ui\('paymentAccountRequired'\)\)[^}]*return;\s*\}/);
    });

    it('clears invalidField and error when all checks pass before posting the payment', () => {
      assert.match(src, /setInvalidField\(null\);\s*\n\s*setError\(null\);\s*\n\s*setSaving\(true\);/);
    });

    it('applies border-red-500 to the DateField wrapper when invalidField === "date"', () => {
      assert.match(src, /className=\{invalidField === 'date' \? 'border-red-500 focus-within:ring-red-500' : ''\}/);
    });

    it('shows the red asterisk after the paymentDate label (required indicator)', () => {
      assert.match(src, /ui\('paymentDate'\)\}\s*<span style=\{\{ color: '#dc2626' \}\}>\*<\/span>/);
    });

    it('disables the Confirm button when saving, amount exceeds outstanding, or date is empty', () => {
      assert.match(src, /disabled=\{saving \|\| amountExceeded \|\| !date\}/);
    });

    it('does not contain hardcoded English fallbacks for the ETP-4005 keys', () => {
      assert.doesNotMatch(src, /['"`]Payment date is required['"`]/);
      assert.doesNotMatch(src, /['"`]Select an account['"`]/);
      assert.doesNotMatch(src, /['"`]The payment could not be processed['"`]/);
    });
  });
});
