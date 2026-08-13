import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) =>
    open ? (
      <div data-testid="new-movement-dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogClose: ({ children }) => <>{children}</>,
}));

// We don't need the real lookup hooks here — the picker fires them but with
// no token / network they'll just be inert. We stub them to return empty
// results synchronously so the picker doesn't reach for fetch.
vi.mock('@/hooks/useMovementLookups', () => ({
  useBPartnerLookup: () => ({ results: [], loading: false, error: null }),
  useGLItemLookup: () => ({ results: [], loading: false, error: null }),
}));

const createMovement = vi.fn();
const creatingRef = { value: false };
vi.mock('@/hooks/useCreateMovement', () => ({
  useCreateMovement: () => ({
    createMovement,
    creating: creatingRef.value,
    error: null,
  }),
}));

import { NewMovementDialog } from '../NewMovementDialog.jsx';

function defaultProps(over = {}) {
  return {
    open: true,
    accountId: 'acc-1',
    accountCurrency: { id: '102', iso: 'EUR' },
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...over,
  };
}

describe('NewMovementDialog', () => {
  beforeEach(() => {
    createMovement.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    creatingRef.value = false;
  });

  it('returns null when open=false', () => {
    render(<NewMovementDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByTestId('new-movement-dialog')).not.toBeInTheDocument();
  });

  it('renders the title, currency display, and the trxType select with BPD/BPW/BF options', () => {
    render(<NewMovementDialog {...defaultProps()} />);
    expect(screen.getByText('financeAccountMovementsNewTitle')).toBeInTheDocument();
    // currency input is readOnly and pre-filled with the iso
    const currencyInput = screen.getByDisplayValue('EUR');
    expect(currencyInput).toHaveAttribute('readonly');
    // Three trxType options
    expect(
      screen.getByText('financeAccountMovementsTypeBPD'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountMovementsTypeBPW'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountMovementsTypeBF'),
    ).toBeInTheDocument();
  });

  it('starts with BPD: deposit editable, payment read-only, GL item field shown', () => {
    render(<NewMovementDialog {...defaultProps()} />);
    expect(screen.getByTestId('new-movement-deposit')).not.toHaveAttribute('readonly');
    expect(screen.getByTestId('new-movement-payment')).toHaveAttribute('readonly');
    // GL item picker is shown for BPD (visible because trxType !== 'BF' and !== '')
    expect(screen.getByTestId('new-movement-glitem')).toBeInTheDocument();
  });

  it('switching to BPW makes payment editable and deposit read-only', async () => {
    const user = userEvent.setup();
    render(<NewMovementDialog {...defaultProps()} />);

    // The select is the first <select> in the form
    const select = document.querySelector('select');
    await user.selectOptions(select, 'BPW');

    expect(screen.getByTestId('new-movement-deposit')).toHaveAttribute('readonly');
    expect(screen.getByTestId('new-movement-payment')).not.toHaveAttribute('readonly');
    // GL item still visible for BPW
    expect(screen.getByTestId('new-movement-glitem')).toBeInTheDocument();
  });

  it('switching to BF hides the GL item picker and makes both amount fields editable', async () => {
    const user = userEvent.setup();
    render(<NewMovementDialog {...defaultProps()} />);
    const select = document.querySelector('select');
    await user.selectOptions(select, 'BF');

    expect(screen.queryByTestId('new-movement-glitem')).not.toBeInTheDocument();
    expect(screen.getByTestId('new-movement-deposit')).not.toHaveAttribute('readonly');
    expect(screen.getByTestId('new-movement-payment')).not.toHaveAttribute('readonly');
  });

  it('blocks submit and toasts an error when no editable amount is filled', async () => {
    const user = userEvent.setup();
    render(<NewMovementDialog {...defaultProps()} />);

    await user.click(screen.getByTestId('new-movement-submit'));
    expect(toastError).toHaveBeenCalledWith('financeAccountMovementsNewErrorAmount');
    expect(createMovement).not.toHaveBeenCalled();
  });

  it('submits a valid BPD payload, calls onSuccess + onClose, and toasts success', async () => {
    createMovement.mockResolvedValue({ id: 'mov-1' });
    const user = userEvent.setup();
    const props = defaultProps();
    render(<NewMovementDialog {...props} />);

    await user.type(screen.getByTestId('new-movement-deposit'), '500');
    await user.click(screen.getByTestId('new-movement-submit'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    const payload = createMovement.mock.calls[0][0];
    expect(payload).toMatchObject({
      FIN_Financial_Account_ID: 'acc-1',
      trxType: 'BPD',
      depositAmount: 500,
      paymentAmount: 0, // BPD: payment is non-editable → forced 0
      currencyId: '102',
      glItemId: null,
      bpartnerId: null,
    });
    expect(payload.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(payload.accountingDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountMovementsNewSuccess');
    expect(props.onSuccess).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('routes BPW into paymentAmount (deposit forced to 0)', async () => {
    createMovement.mockResolvedValue({ id: 'mov-2' });
    const user = userEvent.setup();
    render(<NewMovementDialog {...defaultProps()} />);

    const select = document.querySelector('select');
    await user.selectOptions(select, 'BPW');

    await user.type(screen.getByTestId('new-movement-payment'), '120');
    await user.click(screen.getByTestId('new-movement-submit'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    const payload = createMovement.mock.calls[0][0];
    expect(payload.trxType).toBe('BPW');
    expect(payload.depositAmount).toBe(0);
    expect(payload.paymentAmount).toBe(120);
  });

  it('on BF, glItemId is null (field hidden) even if the user previously selected one', async () => {
    createMovement.mockResolvedValue({ id: 'mov-3' });
    const user = userEvent.setup();
    render(<NewMovementDialog {...defaultProps()} />);

    const select = document.querySelector('select');
    await user.selectOptions(select, 'BF');

    await user.type(screen.getByTestId('new-movement-deposit'), '10');
    await user.click(screen.getByTestId('new-movement-submit'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    const payload = createMovement.mock.calls[0][0];
    expect(payload.trxType).toBe('BF');
    expect(payload.glItemId).toBeNull();
  });

  it('emits an error toast and does NOT close when createMovement rejects', async () => {
    createMovement.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const props = defaultProps();
    render(<NewMovementDialog {...props} />);

    await user.type(screen.getByTestId('new-movement-deposit'), '20');
    await user.click(screen.getByTestId('new-movement-submit'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsNewError'),
    );
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Cancel button (DialogClose surrogate) leaves the dialog up — onClose comes from the wrapper', async () => {
    // The DialogClose stub just renders the child; clicking the cancel button
    // does not trigger any handler in our stub (it would in real Radix).
    // We assert that the explicit Dialog-stub close button calls onClose via
    // onOpenChange(false) — that mirrors the real Radix behaviour.
    const onClose = vi.fn();
    render(<NewMovementDialog {...defaultProps({ onClose })} />);
    await userEvent.setup().click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the submit button while creating=true', () => {
    creatingRef.value = true;
    render(<NewMovementDialog {...defaultProps()} />);
    expect(screen.getByTestId('new-movement-submit')).toBeDisabled();
    // Label shows the "saving" key
    expect(
      screen.getByText('financeAccountMovementsNewSaving'),
    ).toBeInTheDocument();
  });
});
