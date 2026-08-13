import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Render the dialog inline (no portal / pointer-events friction).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-overlay-close" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
}));

// Stub PaymentForm: expose buttons to drive the onChange snapshot so we can
// exercise the modal's "enable submit only when totals.cuadra" logic.
vi.mock('../PaymentForm', () => ({
  PaymentForm: ({ onChange, doc, requireAccount }) => (
    <div data-testid="payment-form" data-doc={doc} data-require-account={String(requireAccount)}>
      <button type="button" data-testid="emit-cuadra" onClick={() => onChange({ totals: { cuadra: true }, ref: 'x' })}>cuadra</button>
      <button type="button" data-testid="emit-no-cuadra" onClick={() => onChange({ totals: { cuadra: false } })}>no-cuadra</button>
    </div>
  ),
}));

import { AddPaymentModal } from '../AddPaymentModal.jsx';

function setup(props = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(<AddPaymentModal open onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { ...utils, onClose, onSubmit };
}

describe('AddPaymentModal — chrome', () => {
  it('does not render when closed', () => {
    render(<AddPaymentModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders the header title and footer actions', () => {
    setup();
    // "Agregar pago" appears twice: the dialog title and the submit button.
    expect(screen.getAllByText('Agregar pago').length).toBe(2);
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('shows the "Cobro" chip for doc=in', () => {
    setup({ doc: 'in' });
    expect(screen.getByText('Cobro')).toBeInTheDocument();
  });

  it('shows the "Pago" chip for doc=out', () => {
    setup({ doc: 'out' });
    expect(screen.getByText('Pago')).toBeInTheDocument();
  });

  it('renders the default subtitle and a custom one', () => {
    const { rerender } = render(<AddPaymentModal open onClose={vi.fn()} />);
    expect(screen.getByText('Registra un pago contra una transacción existente')).toBeInTheDocument();
    rerender(<AddPaymentModal open onClose={vi.fn()} subtitle="TRX-0142 · 02/05/2026" />);
    expect(screen.getByText('TRX-0142 · 02/05/2026')).toBeInTheDocument();
  });
});

describe('AddPaymentModal — account requirement passthrough', () => {
  it('requires an account when none is in context', () => {
    setup();
    expect(screen.getByTestId('payment-form')).toHaveAttribute('data-require-account', 'true');
  });

  it('does not require an account when one is provided', () => {
    setup({ account: { id: 'a', label: 'Banco' } });
    expect(screen.getByTestId('payment-form')).toHaveAttribute('data-require-account', 'false');
  });
});

describe('AddPaymentModal — submit gating', () => {
  it('disables the submit button until the payment balances', async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getAllByText('Agregar pago').find((el) => el.tagName === 'BUTTON');
    expect(submit).toBeDisabled();

    await user.click(screen.getByTestId('emit-cuadra'));
    expect(submit).toBeEnabled();
  });

  it('re-disables the submit button when the payment stops balancing', async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getAllByText('Agregar pago').find((el) => el.tagName === 'BUTTON');
    await user.click(screen.getByTestId('emit-cuadra'));
    expect(submit).toBeEnabled();
    await user.click(screen.getByTestId('emit-no-cuadra'));
    expect(submit).toBeDisabled();
  });

  it('calls onSubmit with the snapshot when balanced', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    await user.click(screen.getByTestId('emit-cuadra'));
    const submit = screen.getAllByText('Agregar pago').find((el) => el.tagName === 'BUTTON');
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ totals: { cuadra: true }, ref: 'x' });
  });
});

describe('AddPaymentModal — close handlers', () => {
  it('calls onClose from the Cancelar button', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the dialog requests close', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.click(screen.getByTestId('dialog-overlay-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
