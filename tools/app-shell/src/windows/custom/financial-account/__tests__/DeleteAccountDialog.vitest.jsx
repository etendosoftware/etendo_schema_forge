/**
 * DeleteAccountDialog (ETP-4871) — mirrors ArchiveAccountDialog.vitest.jsx's harness/style,
 * since the two components are deliberate siblings (see DeleteAccountDialog.jsx's doc comment).
 * Unlike Archive/Unarchive, there is only one direction here (a real, irreversible delete), and
 * the 409 case has no local conflict key — the backend's own human-readable message is shown
 * verbatim.
 */
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

const deleteAccount = vi.fn();
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({ deleteAccount }),
}));

import { DeleteAccountDialog } from '../DeleteAccountDialog.jsx';

const ACCOUNT = { id: 'acc-1', name: 'Empty Account', deletable: true };

function renderDialog(props = {}) {
  return render(
    <DeleteAccountDialog
      open
      account={ACCOUNT}
      onClose={vi.fn()}
      onDeleted={vi.fn()}
      {...props}
    />,
  );
}

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    deleteAccount.mockReset();
    deleteAccount.mockResolvedValue(true);
  });

  it('returns null (renders nothing) when no account is given', () => {
    const { container } = render(<DeleteAccountDialog open account={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the confirmation dialog', () => {
    renderDialog();
    expect(screen.getByTestId('delete-account-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('delete-account-confirm')).toBeInTheDocument();
  });

  it('deletes on confirm and calls onDeleted + onClose', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onDeleted, onClose });

    await user.click(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountsDeleteSuccess');
  });

  it('shows the backend 409 message verbatim and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const err = new Error('Cannot delete: account has 3 pending movements');
    err.status = 409;
    deleteAccount.mockRejectedValueOnce(err);
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onDeleted, onClose });

    await user.click(screen.getByTestId('delete-account-confirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Cannot delete: account has 3 pending movements'),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The dialog itself stays mounted/open — no onClose means no dismissal.
    expect(screen.getByTestId('delete-account-dialog')).toBeInTheDocument();
  });

  it('falls back to the generic error key when the failure carries no message', async () => {
    const user = userEvent.setup();
    const err = new Error();
    err.message = '';
    err.status = 500;
    deleteAccount.mockRejectedValueOnce(err);
    renderDialog();

    await user.click(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountsDeleteError'));
  });

  it('cancels without deleting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(screen.getByTestId('Button__delete-account-cancel'));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('disables both buttons while the delete is in flight', async () => {
    const user = userEvent.setup();
    let resolveDelete;
    deleteAccount.mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));
    renderDialog();

    await user.click(screen.getByTestId('delete-account-confirm'));

    expect(screen.getByTestId('delete-account-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__delete-account-cancel')).toBeDisabled();

    resolveDelete(true);
    await waitFor(() => expect(screen.getByTestId('delete-account-confirm')).not.toBeDisabled());
  });
});
