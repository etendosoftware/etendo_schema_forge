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
  AmountInput: ({ label }) => <input data-testid={`amount-${label}`} />,
  SectionLabel: ({ children }) => <div>{children}</div>,
  LookupPicker: ({ placeholder }) => <div data-testid="lookup-picker">{placeholder}</div>,
}));

vi.mock('@/components/payment/PaymentForm', () => ({
  PaymentForm: () => <div data-testid="payment-form">PaymentForm</div>,
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
});
