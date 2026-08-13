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
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({ archiveAccount }),
}));

import { ArchiveAccountDialog } from '../ArchiveAccountDialog.jsx';

const ACCOUNT = { id: 'acc-1', name: 'BBVA' };

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
});
