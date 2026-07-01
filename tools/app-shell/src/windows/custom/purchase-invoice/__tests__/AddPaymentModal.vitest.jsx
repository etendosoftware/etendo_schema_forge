import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ──
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

const mockToast = vi.fn();
vi.mock('sonner', () => ({
  toast: (...args) => mockToast(...args),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input data-testid="date-field" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import AddPaymentModal from '../AddPaymentModal.jsx';

const BASE_PROPS = {
  invoice: {
    businessPartner$_identifier: 'ACME Corp',
    documentNo: 'INV-001',
    outstandingAmount: 1500,
    grandTotalAmount: 2000,
  },
  outstanding: null,
  onClose: vi.fn(),
  onSave: vi.fn(),
};

describe('AddPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with header', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    expect(screen.getByText('newPayment')).toBeInTheDocument();
  });

  it('shows partner name and doc number', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    expect(screen.getByText(/ACME Corp/)).toBeInTheDocument();
    expect(screen.getByText(/INV-001/)).toBeInTheDocument();
  });

  it('pre-fills amount from invoice outstandingAmount', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    const input = screen.getByRole('spinbutton');
    expect(input.value).toBe('1500');
  });

  it('pre-fills amount from outstanding prop when provided', () => {
    render(<AddPaymentModal {...BASE_PROPS} outstanding={999} />);
    const input = screen.getByRole('spinbutton');
    expect(input.value).toBe('999');
  });

  it('falls back to grandTotalAmount when outstandingAmount is missing', () => {
    const invoice = { grandTotalAmount: 3000 };
    render(<AddPaymentModal {...BASE_PROPS} invoice={invoice} />);
    const input = screen.getByRole('spinbutton');
    expect(input.value).toBe('3000');
  });

  it('calls onClose when close button is clicked', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    const closeBtn = screen.getByLabelText('close');
    fireEvent.click(closeBtn);
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    const cancelBtn = screen.getByText('cancel');
    fireEvent.click(cancelBtn);
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onSave with payment data and shows toast on save', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    const saveBtn = screen.getByText('save');
    fireEvent.click(saveBtn);
    expect(BASE_PROPS.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        account: 'TEST',
      }),
    );
    expect(mockToast).toHaveBeenCalledWith('paymentRecordedLocally');
  });

  it('allows changing the amount', async () => {
    const user = userEvent.setup();
    render(<AddPaymentModal {...BASE_PROPS} />);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '750');
    const saveBtn = screen.getByText('save');
    fireEvent.click(saveBtn);
    expect(BASE_PROPS.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 750 }),
    );
  });

  it('allows changing the account', async () => {
    const user = userEvent.setup();
    render(<AddPaymentModal {...BASE_PROPS} />);
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'MAIN');
    const saveBtn = screen.getByText('save');
    fireEvent.click(saveBtn);
    expect(BASE_PROPS.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'MAIN' }),
    );
  });

  it('renders all account options', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    expect(screen.getByText('testAccount')).toBeInTheDocument();
    expect(screen.getByText('mainAccount')).toBeInTheDocument();
    expect(screen.getByText('pettyCash')).toBeInTheDocument();
  });

  it('renders field labels', () => {
    render(<AddPaymentModal {...BASE_PROPS} />);
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.getByText('date')).toBeInTheDocument();
    expect(screen.getByText('account')).toBeInTheDocument();
  });

  it('does not show partner line when businessPartner is absent', () => {
    render(<AddPaymentModal {...BASE_PROPS} invoice={{}} />);
    // No partner text rendered as a paragraph
    const paragraphs = screen.queryAllByRole('paragraph');
    // The partner paragraph should not be present
    expect(screen.queryByText(/ACME Corp/)).not.toBeInTheDocument();
  });

  it('handles null invoice gracefully', () => {
    render(<AddPaymentModal {...BASE_PROPS} invoice={null} />);
    expect(screen.getByText('newPayment')).toBeInTheDocument();
  });
});
