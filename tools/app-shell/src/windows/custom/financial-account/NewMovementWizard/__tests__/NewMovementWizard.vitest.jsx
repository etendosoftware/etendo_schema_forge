// Vitest render tests for NewMovementWizard/index.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks (before imports) ──────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  X: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  ChevronDown: (p) => <span {...p} />,
  Wallet: (p) => <span {...p} />,
  Percent: (p) => <span {...p} />,
  Info: (p) => <span {...p} />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, className }) => <div data-testid="dialog-content" className={className}>{children}</div>,
  DialogTitle: ({ children, asChild }) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children, asChild }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useCreateMovement', () => ({
  useCreateMovement: () => ({ createMovement: vi.fn().mockResolvedValue({}), creating: false }),
  useCreatePayment: () => ({ createPayment: vi.fn().mockResolvedValue({}), creating: false }),
}));

vi.mock('@/hooks/useDimensionValues', () => ({
  useDimensionValues: () => ({ optionsByDim: {} }),
}));

vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ items: [], loading: false }),
}));

vi.mock('@/components/forms/fields', () => ({
  Field: ({ children, label }) => <div data-testid="field">{label}{children}</div>,
  ReadOnly: ({ children }) => <span>{children}</span>,
  Select: ({ label, value, onChange, options }) => (
    <select data-testid={`select-${label}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  DateInput: ({ label }) => <input data-testid={`date-${label}`} />,
  AmountInput: ({ label, currency }) => <input data-testid={`amount-${label}`} data-currency={currency ?? ''} />,
  SectionLabel: ({ children }) => <div>{children}</div>,
  LookupPicker: ({ placeholder }) => <div data-testid="lookup-picker">{placeholder}</div>,
}));

vi.mock('@/components/payment/PaymentForm', () => ({
  PaymentForm: ({ currency }) => <div data-testid="payment-form" data-currency={currency ?? ''}>PaymentForm</div>,
}));

vi.mock('../movementWizardData', () => ({
  parseAmount: (v) => parseFloat(v) || 0,
  todayISO: () => '2026-01-15',
  DIM_META: {
    organization: { labelKey: 'dimOrg', required: true },
    bpartner: { labelKey: 'dimBP' },
  },
  DIM_ORDER: ['organization', 'bpartner'],
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, fireEvent } from '@testing-library/react';
import { NewMovementWizard } from '../index.jsx';

// ── Helpers ─────────────────────────────────────────────────────────────────

const defaultProps = {
  open: true,
  accountId: 'acc-1',
  accountCurrency: { id: 'cur-1', iso: 'EUR' },
  dimensions: ['organization', 'bpartner'],
  trxTypes: [
    { value: 'BPD', label: 'Cobro' },
    { value: 'BPW', label: 'Pago' },
  ],
  defaultOrgId: null,
  paymentMethods: [],
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('NewMovementWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open=true', () => {
    render(<NewMovementWizard {...defaultProps} />);
    expect(screen.getByTestId('dialog')).toBeTruthy();
  });

  it('does not render dialog when open=false', () => {
    render(<NewMovementWizard {...defaultProps} open={false} />);
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('shows the title', () => {
    render(<NewMovementWizard {...defaultProps} />);
    expect(screen.getByTestId('dialog-title')).toBeTruthy();
  });

  it('renders stepper with two steps', () => {
    render(<NewMovementWizard {...defaultProps} />);
    const body = document.body.textContent;
    expect(body).toContain('financeAccountMovementsWizardStep1');
    expect(body).toContain('financeAccountMovementsWizardStep2');
  });

  it('shows stage 1 content by default (MovementBasics)', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Stage 1 has a textarea for description
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  it('shows Cancel and Next buttons on stage 1', () => {
    render(<NewMovementWizard {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find((b) => b.textContent.includes('financeAccountMovementsNewCancel'));
    const nextBtn = btns.find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    expect(cancelBtn).toBeTruthy();
    expect(nextBtn).toBeTruthy();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<NewMovementWizard {...defaultProps} onClose={onClose} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find((b) => b.textContent.includes('financeAccountMovementsNewCancel'));
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('advances to stage 2 when Next is clicked', () => {
    render(<NewMovementWizard {...defaultProps} />);
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);
    // Stage 2 shows choice cards question
    expect(document.body.textContent).toContain('financeAccountMovementsWizardReconcileQuestion');
  });

  it('shows choice cards on stage 2 when no choice is selected', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Go to stage 2
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);

    expect(document.body.textContent).toContain('financeAccountMovementsWizardChoicePayTitle');
    expect(document.body.textContent).toContain('financeAccountMovementsWizardChoiceGlTitle');
  });

  it('shows Back button on stage 2', () => {
    render(<NewMovementWizard {...defaultProps} />);
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);
    const backBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardBack'));
    expect(backBtn).toBeTruthy();
  });

  it('goes back to stage 1 when Back is clicked', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Advance to stage 2
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);
    // Click Back
    const backBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardBack'));
    fireEvent.click(backBtn);
    // Should see stage 1 textarea
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  it('shows GLItemBlock when GL choice is selected', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Advance to stage 2
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);
    // Click the GL choice card
    const glCard = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardChoiceGlTitle'));
    fireEvent.click(glCard);
    // LookupPicker should appear
    expect(screen.getByTestId('lookup-picker')).toBeTruthy();
  });

  it('shows PaymentForm when payment choice is selected', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Advance to stage 2
    const nextBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
    fireEvent.click(nextBtn);
    // Click the payment choice card
    const payCard = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('financeAccountMovementsWizardChoicePayTitle'));
    fireEvent.click(payCard);
    expect(screen.getByTestId('payment-form')).toBeTruthy();
  });

  it('renders currency read-only field in MovementBasics', () => {
    render(<NewMovementWizard {...defaultProps} />);
    expect(document.body.textContent).toContain('EUR');
  });

  it('renders dimension selects when dimensions are provided', () => {
    render(<NewMovementWizard {...defaultProps} />);
    expect(document.body.textContent).toContain('financeAccountMovementsWizardDimensions');
  });

  // ETP-4314 — deposit/withdrawal AmountInputs and the embedded PaymentForm used
  // to always show '€' regardless of the account's real currency. They now
  // receive `currency={form.currencyIso}` / `currency={accountCurrency?.iso}`.
  describe('currency propagation (ETP-4314)', () => {
    const usdProps = { ...defaultProps, accountCurrency: { id: 'cur-usd', iso: 'USD' } };

    it('passes the account currency (USD) to the deposit AmountInput', () => {
      render(<NewMovementWizard {...usdProps} />);
      const deposit = screen.getByTestId('amount-financeAccountMovementsNewDepositAmount');
      expect(deposit).toHaveAttribute('data-currency', 'USD');
    });

    it('passes the account currency (USD) to the withdrawal AmountInput', () => {
      render(<NewMovementWizard {...usdProps} />);
      const withdrawal = screen.getByTestId('amount-financeAccountMovementsNewPaymentAmount');
      expect(withdrawal).toHaveAttribute('data-currency', 'USD');
    });

    it('defaults both AmountInputs to EUR when no accountCurrency is given', () => {
      render(<NewMovementWizard {...defaultProps} accountCurrency={undefined} />);
      const deposit = screen.getByTestId('amount-financeAccountMovementsNewDepositAmount');
      const withdrawal = screen.getByTestId('amount-financeAccountMovementsNewPaymentAmount');
      expect(deposit).toHaveAttribute('data-currency', 'EUR');
      expect(withdrawal).toHaveAttribute('data-currency', 'EUR');
    });

    it('passes the account currency (USD) to the embedded PaymentForm', () => {
      render(<NewMovementWizard {...usdProps} />);
      // Advance to stage 2 and pick "Registrar pago" to mount PaymentForm.
      const nextBtn = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));
      fireEvent.click(nextBtn);
      const payCard = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent.includes('financeAccountMovementsWizardChoicePayTitle'));
      fireEvent.click(payCard);
      expect(screen.getByTestId('payment-form')).toHaveAttribute('data-currency', 'USD');
    });
  });
});

// ── description max length (PSD-23) ───────────────────────────────────────────
//
// Third free-text description of the Financial Account window with the same defect: an
// over-long value is allowed through and the column rejects it with a 400. The limit is
// 255, published by the window contract at
//   artifacts/financial-account/contract.json
//     → frontendContract.entities.transaction.fields[].validation.maxLength
// and declared once as FINANCIAL_ACCOUNT_FIELD_LIMITS.transactionDescription in
// windows/custom/financial-account/fieldLengthValidation.js.
//
// Two structural gaps the fix has to close here, both currently absent:
//   1. the stage-1 textarea (index.jsx, inside MovementBasics) carries NO data-testid, so
//      the field is unaddressable — the fix adds `wizard-description`, plus
//      `wizard-description-error` and `wizard-description-counter`;
//   2. the stage-1 "Siguiente" button (index.jsx footer) has NO gate at all — it is a bare
//      `onClick={() => setStage(2)}` — so an invalid stage-1 form walks straight into
//      stage 2 and on to handleCreate. The fix gives it a `disabled`.
//
// The Next button is located by its i18n key rather than a testid, matching every other
// button lookup in this file, so the test holds whether or not the fix also adds one.
describe('NewMovementWizard — description max length', () => {
  const LIMIT = 255;
  const AT_LIMIT = 'x'.repeat(LIMIT);
  const OVER_LIMIT = 'x'.repeat(LIMIT + 1);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const nextButton = () => Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.includes('financeAccountMovementsWizardNext'));

  function typeDescription(value) {
    fireEvent.change(screen.getByTestId('wizard-description'), { target: { value } });
  }

  it('exposes the stage-1 description textarea under a stable testid', () => {
    render(<NewMovementWizard {...defaultProps} />);
    expect(screen.getByTestId('wizard-description')).toBeTruthy();
  });

  it('shows no error and keeps Siguiente enabled at exactly 255 characters', () => {
    render(<NewMovementWizard {...defaultProps} />);
    typeDescription(AT_LIMIT);

    expect(screen.queryByTestId('wizard-description-error')).toBeNull();
    expect(nextButton().disabled).toBe(false);
  });

  it('surfaces the max-length error and disables Siguiente at 256 characters', () => {
    render(<NewMovementWizard {...defaultProps} />);
    // Siguiente is genuinely reachable first, so the disabled state below is attributable
    // to the description length and to nothing else.
    expect(nextButton().disabled).toBe(false);

    typeDescription(OVER_LIMIT);

    // useUI is mocked as `(key, params) => key:JSON(params)`, so the shared key surfaces
    // verbatim with its interpolation payload. The key already ships in both locale files.
    expect(screen.getByTestId('wizard-description-error')).toHaveTextContent('fieldMaxLengthError');
    expect(nextButton().disabled).toBe(true);
  });

  it('does not advance to stage 2 while the description is over the limit', () => {
    render(<NewMovementWizard {...defaultProps} />);
    typeDescription(OVER_LIMIT);

    fireEvent.click(nextButton());

    // Stage 2 is identified by its reconcile question; stage 1 by the textarea.
    expect(document.body.textContent).not.toContain('financeAccountMovementsWizardReconcileQuestion');
    expect(screen.getByTestId('wizard-description')).toBeTruthy();
  });

  it('advances again once the description is trimmed back to the limit', () => {
    render(<NewMovementWizard {...defaultProps} />);
    typeDescription(OVER_LIMIT);
    fireEvent.click(nextButton());
    expect(document.body.textContent).not.toContain('financeAccountMovementsWizardReconcileQuestion');

    // The gate must be reactive, not a one-way latch.
    typeDescription(AT_LIMIT);
    expect(screen.queryByTestId('wizard-description-error')).toBeNull();
    fireEvent.click(nextButton());

    expect(document.body.textContent).toContain('financeAccountMovementsWizardReconcileQuestion');
  });

  it('renders a live character counter against the limit', () => {
    render(<NewMovementWizard {...defaultProps} />);

    typeDescription('abcde');
    expect(screen.getByTestId('wizard-description-counter')).toHaveTextContent(`5/${LIMIT}`);

    typeDescription(OVER_LIMIT);
    expect(screen.getByTestId('wizard-description-counter')).toHaveTextContent(`${LIMIT + 1}/${LIMIT}`);
  });

  it('treats an emptied description as valid (length is not a required check)', () => {
    render(<NewMovementWizard {...defaultProps} />);
    typeDescription('');

    expect(screen.queryByTestId('wizard-description-error')).toBeNull();
    expect(nextButton().disabled).toBe(false);
  });
});
