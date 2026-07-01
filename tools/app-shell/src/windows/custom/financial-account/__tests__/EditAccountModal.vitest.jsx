import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    info: (...a) => toastInfo(...a),
  },
}));

const updateAccount = vi.fn();
const fetchDefaults = vi.fn();
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({ updateAccount, fetchDefaults }),
}));

const fetchStatus = vi.fn();
const sync = vi.fn();
const disconnect = vi.fn();
const reconnect = vi.fn();
const saveImportSettings = vi.fn();
const launchSaltEdgePopup = vi.fn();
vi.mock('@/hooks/usePsd2Actions', () => ({
  usePsd2Actions: () => ({ fetchStatus, sync, disconnect, reconnect, saveImportSettings }),
  launchSaltEdgePopup: (...a) => launchSaltEdgePopup(...a),
}));

import { EditAccountModal } from '../EditAccountModal.jsx';

const BANK_ACCOUNT = {
  id: 'acc-1',
  name: 'BBVA',
  type: 'B',
  iban: 'ES9121000418450200051332',
  currencyId: '102',
  psd2Connected: false,
};

const CONNECTED_ACCOUNT = {
  id: 'acc-9',
  name: 'BBVA PSD2',
  type: 'B',
  iban: 'ES9121000418450200051332',
  currencyIso: 'EUR',
  psd2Connected: true,
};

function renderModal(props = {}) {
  return render(
    <EditAccountModal
      open
      account={BANK_ACCOUNT}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onArchive={vi.fn()}
      onConnect={vi.fn()}
      {...props}
    />,
  );
}

describe('EditAccountModal', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    toastInfo.mockClear();
    updateAccount.mockReset();
    fetchDefaults.mockReset();
    fetchStatus.mockReset();
    sync.mockReset();
    disconnect.mockReset();
    reconnect.mockReset();
    saveImportSettings.mockReset();
    launchSaltEdgePopup.mockReset();
    fetchDefaults.mockResolvedValue({ currencies: [{ id: '102', iso: 'EUR' }] });
    updateAccount.mockResolvedValue({ id: 'acc-1', name: 'BBVA Renamed' });
    fetchStatus.mockResolvedValue({
      connected: true,
      providerName: 'BBVA',
      importFromDate: '2026-01-01',
      importToDate: '2026-02-01',
      statementGrouping: '1BD',
    });
    sync.mockResolvedValue({ status: 'OK', message: 'done' });
    saveImportSettings.mockResolvedValue({});
    disconnect.mockResolvedValue({});
  });

  it('returns null (renders nothing) when no account is given', () => {
    const { container } = render(<EditAccountModal open account={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a prefilled form for a non-connected bank account', async () => {
    renderModal();
    expect(screen.getByTestId('edit-account-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-account-name')).toHaveValue('BBVA');
    expect(screen.getByTestId('edit-account-iban')).toHaveValue('ES9121000418450200051332');
  });

  it('shows the Connect to PSD2 button for a non-connected bank account', () => {
    renderModal();
    expect(screen.getByTestId('edit-account-connect-psd2')).toBeInTheDocument();
  });

  it('hides the connection section and IBAN field for a cash account', () => {
    renderModal({ account: { id: 'acc-2', name: 'Caja', type: 'C', currencyId: '102', psd2Connected: false } });
    expect(screen.queryByTestId('edit-account-connect-psd2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-account-iban')).not.toBeInTheDocument();
  });

  it('saves with updateAccount(id, payload) of only changed fields and calls onSaved + onClose', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaved, onClose });

    const nameInput = screen.getByTestId('edit-account-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'BBVA Renamed');
    await user.click(screen.getByTestId('edit-account-save'));

    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    const [id, payload] = updateAccount.mock.calls[0];
    expect(id).toBe('acc-1');
    expect(payload).toMatchObject({ name: 'BBVA Renamed' });
    // Only changed fields are sent.
    expect(payload).not.toHaveProperty('iban');
    expect(payload).not.toHaveProperty('currencyId');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountsEditSuccess');
  });

  it('shows the inline name-exists error on a 409 and does not close', async () => {
    const user = userEvent.setup();
    const err = new Error('dup');
    err.status = 409;
    updateAccount.mockRejectedValueOnce(err);
    const onSaved = vi.fn();
    renderModal({ onSaved });

    const nameInput = screen.getByTestId('edit-account-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'BBVA Renamed');
    await user.click(screen.getByTestId('edit-account-save'));

    await waitFor(() =>
      expect(screen.getByTestId('edit-account-error')).toHaveTextContent(
        'financeAccountsNewNameExists',
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('toasts an error for a non-409 save failure', async () => {
    const user = userEvent.setup();
    const err = new Error('boom');
    err.status = 500;
    updateAccount.mockRejectedValueOnce(err);
    renderModal();

    const nameInput = screen.getByTestId('edit-account-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'BBVA Renamed');
    await user.click(screen.getByTestId('edit-account-save'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
  });

  it('calls onConnect (after onClose) when the Connect to PSD2 button is clicked', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onClose = vi.fn();
    renderModal({ onConnect, onClose });

    await user.click(screen.getByTestId('edit-account-connect-psd2'));
    expect(onClose).toHaveBeenCalled();
    expect(onConnect).toHaveBeenCalledWith(BANK_ACCOUNT);
  });

  describe('connected account', () => {
    it('renders the PSD2 panel (sync, read-only IBAN/Currency) and no Connect button', async () => {
      renderModal({ account: CONNECTED_ACCOUNT });
      await waitFor(() => expect(fetchStatus).toHaveBeenCalledWith('acc-9'));
      expect(await screen.findByTestId('psd2-edit-sync')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-connect-psd2')).not.toBeInTheDocument();
      // IBAN/Currency are read-only when connected.
      expect(screen.queryByTestId('edit-account-iban')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-currency')).not.toBeInTheDocument();
    });

    it('triggers sync and refresh on Sync now', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onSaved });
      const syncBtn = await screen.findByTestId('psd2-edit-sync');
      await user.click(syncBtn);
      await waitFor(() => expect(sync).toHaveBeenCalledWith('acc-9'));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });
  });
});
