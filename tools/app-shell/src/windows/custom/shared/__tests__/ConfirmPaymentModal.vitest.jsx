import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmPaymentModal from '../ConfirmPaymentModal.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

describe('ConfirmPaymentModal', () => {
  it('shows the collection-specific copy for dir="in"', () => {
    render(<ConfirmPaymentModal dir="in" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText('confirmarCobroTitle')).toBeInTheDocument();
    expect(screen.getByText('confirmarCobroBody')).toBeInTheDocument();
  });

  it('shows the payment-specific copy for dir="out"', () => {
    render(<ConfirmPaymentModal dir="out" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText('confirmarPagoTitle')).toBeInTheDocument();
    expect(screen.getByText('confirmarPagoBody')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmPaymentModal dir="in" onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByTestId('payment-confirm-action'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<ConfirmPaymentModal dir="in" onConfirm={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('Button__confirm-payment-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
