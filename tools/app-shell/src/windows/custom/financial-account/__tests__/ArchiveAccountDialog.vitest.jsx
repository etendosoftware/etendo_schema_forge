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

const archiveAccount = vi.fn();
const unarchiveAccount = vi.fn();
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({ archiveAccount, unarchiveAccount }),
}));

import { ArchiveAccountDialog, isUnarchiveMode } from '../ArchiveAccountDialog.jsx';

const ACCOUNT = { id: 'acc-1', name: 'BBVA' };
/** An archived account — `active === false` is what flips the dialog into restore mode. */
const ARCHIVED_ACCOUNT = { id: 'acc-2', name: 'Vieja', active: false };

function renderDialog(props = {}) {
  return render(
    <ArchiveAccountDialog
      open
      account={ACCOUNT}
      onClose={vi.fn()}
      onArchived={vi.fn()}
      {...props}
    />,
  );
}

describe('ArchiveAccountDialog', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    archiveAccount.mockReset();
    archiveAccount.mockResolvedValue(true);
    unarchiveAccount.mockReset();
    unarchiveAccount.mockResolvedValue(true);
  });

  it('returns null (renders nothing) when no account is given', () => {
    const { container } = render(<ArchiveAccountDialog open account={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the confirmation dialog', () => {
    renderDialog();
    expect(screen.getByTestId('archive-account-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('archive-account-confirm')).toBeInTheDocument();
  });

  it('archives on confirm and calls onArchived + onClose', async () => {
    const user = userEvent.setup();
    const onArchived = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onArchived, onClose });

    await user.click(screen.getByTestId('archive-account-confirm'));

    await waitFor(() => expect(archiveAccount).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(onArchived).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountsArchiveSuccess');
  });

  it('shows the open-reconciliation toast on a 409', async () => {
    const user = userEvent.setup();
    const err = new Error('open');
    err.status = 409;
    archiveAccount.mockRejectedValueOnce(err);
    const onArchived = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onArchived, onClose });

    await user.click(screen.getByTestId('archive-account-confirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountsArchiveOpenRecon'),
    );
    expect(onArchived).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('toasts the backend message for a non-409 failure', async () => {
    const user = userEvent.setup();
    const err = new Error('boom');
    err.status = 500;
    archiveAccount.mockRejectedValueOnce(err);
    renderDialog();

    await user.click(screen.getByTestId('archive-account-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
  });

  // ── Unarchive mode, derived from the record itself ──────────────────────────
  describe('unarchive mode (account.active === false)', () => {
    it('isUnarchiveMode only flips on an explicitly inactive account', () => {
      // `active` is absent on most fixtures and on freshly created accounts; only an explicit
      // `false` means archived, so a missing flag must NOT be read as "restore".
      expect(isUnarchiveMode({ active: false })).toBe(true);
      expect(isUnarchiveMode({ active: true })).toBe(false);
      expect(isUnarchiveMode({})).toBe(false);
      expect(isUnarchiveMode(null)).toBe(false);
    });

    it('shows the restore copy instead of the archive copy', () => {
      renderDialog({ account: ARCHIVED_ACCOUNT });
      expect(screen.getByText('financeAccountsUnarchiveConfirmTitle')).toBeInTheDocument();
      expect(screen.getByTestId('archive-account-confirm'))
        .toHaveTextContent('financeAccountsUnarchiveConfirm');
      expect(screen.queryByText('financeAccountsArchiveConfirmTitle')).not.toBeInTheDocument();
    });

    it('calls unarchiveAccount — never archiveAccount — on confirm', async () => {
      const user = userEvent.setup();
      const onArchived = vi.fn();
      const onClose = vi.fn();
      renderDialog({ account: ARCHIVED_ACCOUNT, onArchived, onClose });

      await user.click(screen.getByTestId('archive-account-confirm'));

      await waitFor(() => expect(unarchiveAccount).toHaveBeenCalledWith('acc-2'));
      expect(archiveAccount).not.toHaveBeenCalled();
      await waitFor(() => expect(onArchived).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsUnarchiveSuccess');
    });

    it('has no 409 special case — a conflict surfaces the backend message', async () => {
      const user = userEvent.setup();
      const err = new Error('conflict');
      err.status = 409;
      unarchiveAccount.mockRejectedValueOnce(err);
      renderDialog({ account: ARCHIVED_ACCOUNT });

      await user.click(screen.getByTestId('archive-account-confirm'));

      // The open-reconciliation guard only applies to archiving.
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('conflict'));
      expect(toastError).not.toHaveBeenCalledWith('financeAccountsArchiveOpenRecon');
    });
  });
});
