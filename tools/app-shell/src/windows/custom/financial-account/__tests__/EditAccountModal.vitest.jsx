import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The Type/Currency dropdowns are Radix <Select>s, which rely on Pointer Capture
// and scrollIntoView — neither is implemented by jsdom. Polyfill them so the
// dropdown can open and an option can be picked in the "changing the Type saves
// the new value" test (ETP-4581).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

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
const finishReconnect = vi.fn();
const saveImportSettings = vi.fn();
const launchSaltEdgePopup = vi.fn();
vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({
    fetchStatus, sync, disconnect, reconnect, finishReconnect, saveImportSettings,
  }),
  launchSaltEdgePopup: (...a) => launchSaltEdgePopup(...a),
}));

// ETP-4530: Tab Contabilidad — mocked so existing suites (which don't exercise this tab) don't
// need a real AuthProvider/network round-trip just to mount the modal.
const fetchAccountingConfiguration = vi.fn().mockResolvedValue({
  id: null,
  fINAssetAcct: null,
  fINTransitoryAcct: null,
  ledgerConfigured: true,
  catalogs: { accounts: [] },
});
const saveAccountingConfiguration = vi.fn();
vi.mock('@/hooks/useFinancialAccountAccounting.js', () => ({
  useFinancialAccountAccounting: () => ({ fetchAccountingConfiguration, saveAccountingConfiguration }),
}));

// ETP-4530: showAccountingFields capability gate — defaults to `true` so every existing suite
// (written before the gate existed) keeps seeing the Accounting tab without modification. Tests
// that specifically exercise the gate override this per-test.
const hasCapability = vi.fn(() => true);
vi.mock('@/auth/AuthContext.jsx', () => ({
  useHasCapability: (key) => hasCapability(key),
  // ETP-4896: the Country field's CreatableSearchSelect reads the token directly.
  useAuth: () => ({ token: 'test-token' }),
}));

// ETP-4795: the GL Item Difference selector (General tab, every account type) is a ChipSelect
// backed by useGLItemLookup, which itself needs an AuthContext token — mocked out here so this
// suite doesn't need a real AuthProvider just to mount the modal.
vi.mock('@/hooks/useMovementLookups.js', () => ({
  useGLItemLookup: () => ({ results: [], loading: false }),
}));

import { EditAccountModal, initialEditTab, isDeleteMode } from '../EditAccountModal.jsx';

// `countryIso: 'ES'` (the STORED country) makes this account eligible for the Salt Edge
// connection, which is Spain-only since ETP-4896 — see saltEdgeEligibility.js. `countryId` is
// deliberately absent: it is what the FORM binds to, and leaving it unset keeps this fixture
// usable for the "legacy row with no country" cases. The two are independent axes here.
const BANK_ACCOUNT = {
  id: 'acc-1',
  name: 'BBVA',
  type: 'B',
  iban: 'ES9121000418450200051332',
  swiftCode: 'BBVAESMM',
  currencyId: '102',
  countryIso: 'ES',
  bankConnected: false,
};

const CONNECTED_ACCOUNT = {
  id: 'acc-9',
  name: 'BBVA Bank',
  type: 'B',
  iban: 'ES9121000418450200051332',
  currencyIso: 'EUR',
  bankConnected: true,
};

// ETP-4553 — TabsTrigger now spreads extra props (data-testid, aria-*, etc.) onto its
// <button> (core fix, see @etendosoftware/app-shell-core's tabs.jsx), so the
// `data-testid="edit-account-tab-general/accounting"` set in EditAccountModal.jsx reaches
// the DOM. Select tabs by their real data-testid instead of the previous role+label workaround.
const TAB_TESTID_BY_LABEL = {
  financeAccountsEditTabGeneral: 'edit-account-tab-general',
  financeAccountsEditTabAccounting: 'edit-account-tab-accounting',
};
function getTab(labelKey) {
  return screen.getByTestId(TAB_TESTID_BY_LABEL[labelKey]);
}

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
    finishReconnect.mockReset();
    finishReconnect.mockResolvedValue({ connected: true });
    saveImportSettings.mockReset();
    launchSaltEdgePopup.mockReset();
    // The popup resolves to the Salt Edge connection id it relayed back; the reconnect flow needs
    // that id to ask the bridge to reactivate the connection.
    launchSaltEdgePopup.mockResolvedValue('SE-CONN-1');
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
    // Reset the accounting-config fetch/save back to the neutral default before every test so
    // a `mockResolvedValueOnce` queued by one test can never leak into the next one.
    fetchAccountingConfiguration.mockReset();
    fetchAccountingConfiguration.mockResolvedValue({
      id: null,
      fINAssetAcct: null,
      fINTransitoryAcct: null,
      ledgerConfigured: true,
      catalogs: { accounts: [] },
    });
    saveAccountingConfiguration.mockReset();
    // Reset the capability gate back to its "visible" default before every test.
    hasCapability.mockReset();
    hasCapability.mockReturnValue(true);
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

  it('shows the Connect bank button for a non-connected bank account', () => {
    renderModal();
    expect(screen.getByTestId('edit-account-connect-bank')).toBeInTheDocument();
  });

  it('hides the connection section and IBAN field for a cash account', () => {
    renderModal({ account: { id: 'acc-2', name: 'Caja', type: 'C', currencyId: '102', bankConnected: false } });
    expect(screen.queryByTestId('edit-account-connect-bank')).not.toBeInTheDocument();
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

  it('calls onConnect (after onClose) when the Connect bank button is clicked', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onClose = vi.fn();
    renderModal({ onConnect, onClose });

    await user.click(screen.getByTestId('edit-account-connect-bank'));
    expect(onClose).toHaveBeenCalled();
    expect(onConnect).toHaveBeenCalledWith(BANK_ACCOUNT);
  });

  describe('connected account', () => {
    it('renders the bank connection panel (sync, editable IBAN, read-only Currency) and no Connect button', async () => {
      renderModal({ account: CONNECTED_ACCOUNT });
      await waitFor(() => expect(fetchStatus).toHaveBeenCalledWith('acc-9'));
      expect(await screen.findByTestId('bank-connection-edit-sync')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-connect-bank')).not.toBeInTheDocument();
      // IBAN is editable even while connected (ETP-4896 follow-up); Currency stays read-only.
      expect(screen.getByTestId('edit-account-iban')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-currency')).not.toBeInTheDocument();
    });

    it('triggers sync and refresh on Sync now', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onSaved });
      const syncBtn = await screen.findByTestId('bank-connection-edit-sync');
      await user.click(syncBtn);
      await waitFor(() => expect(sync).toHaveBeenCalledWith('acc-9'));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('shows a warning toast when sync returns WARNING', async () => {
      const user = userEvent.setup();
      sync.mockResolvedValue({ status: 'WARNING', message: 'partial' });
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('bank-connection-edit-sync'));
      await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('partial'));
    });

    it('shows an error toast when sync returns ERROR', async () => {
      const user = userEvent.setup();
      sync.mockResolvedValue({ status: 'ERROR', message: 'boom' });
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('bank-connection-edit-sync'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
    });

    it('maps a BANK_CONNECTION_TIMEOUT sync failure to the timeout label', async () => {
      const user = userEvent.setup();
      sync.mockRejectedValue(new Error('BANK_CONNECTION_TIMEOUT'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('bank-connection-edit-sync'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountsBankConnectionTimeout'));
    });

    it('disables Sync now while the connection is not live', async () => {
      fetchStatus.mockResolvedValue({ connected: false, providerName: 'BBVA' });
      renderModal({ account: CONNECTED_ACCOUNT });
      const syncBtn = await screen.findByTestId('bank-connection-edit-sync');
      expect(syncBtn).toBeDisabled();
    });

    it('shows a loading note while the bank connection status is still loading', async () => {
      // Never resolve so the panel stays in loading.
      fetchStatus.mockReturnValue(new Promise(() => {}));
      renderModal({ account: CONNECTED_ACCOUNT });
      expect(await screen.findByText('financeAccountsBankConnectionLoading')).toBeInTheDocument();
      expect(screen.queryByTestId('bank-connection-edit-sync')).not.toBeInTheDocument();
    });

    it('falls back to status(null) when fetchStatus throws', async () => {
      fetchStatus.mockRejectedValue(new Error('down'));
      renderModal({ account: CONNECTED_ACCOUNT });
      // Panel renders (loading resolved) but there is no live connection ⇒ sync disabled.
      const syncBtn = await screen.findByTestId('bank-connection-edit-sync');
      expect(syncBtn).toBeDisabled();
    });

    it('renders and reconnects from the re-auth banner when consent is expiring', async () => {
      const user = userEvent.setup();
      fetchStatus.mockResolvedValue({
        connected: true,
        providerName: 'BBVA',
        consentExpiresAt: '2026-12-31',
        daysUntilExpires: 5,
      });
      renderModal({ account: CONNECTED_ACCOUNT });
      const banner = await screen.findByTestId('bank-connection-edit-reauth-banner');
      expect(banner).toBeInTheDocument();
      await user.click(screen.getByTestId('bank-connection-edit-reauth-link'));
      await waitFor(() => expect(launchSaltEdgePopup).toHaveBeenCalled());
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionReauthDone'));
    });

    it('shows the expired re-auth banner when consent has lapsed', async () => {
      fetchStatus.mockResolvedValue({
        connected: true,
        providerName: 'BBVA',
        consentExpiresAt: '2026-01-01',
        daysUntilExpires: -2,
      });
      renderModal({ account: CONNECTED_ACCOUNT });
      const banner = await screen.findByTestId('bank-connection-edit-reauth-banner');
      // The expired message key is used rather than the countdown banner.
      expect(banner).toHaveTextContent('financeAccountsBankConnectionReauthExpired');
    });

    it('toasts an error when reconnect fails', async () => {
      const user = userEvent.setup();
      fetchStatus.mockResolvedValue({
        connected: true, providerName: 'BBVA', consentExpiresAt: '2026-12-31', daysUntilExpires: 5,
      });
      launchSaltEdgePopup.mockRejectedValue(new Error('reauth-failed'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('bank-connection-edit-reauth-link'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('reauth-failed'));
    });

    it('disconnects after confirm and calls onSaved + onClose', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      const onClose = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onSaved, onClose });
      await screen.findByTestId('bank-connection-edit-sync');
      // Footer button opens the styled confirm dialog; its action button performs the disconnect.
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      await user.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));
      // The plain action is the SOFT disconnect: it deactivates the connection but keeps the link.
      await waitFor(() => expect(disconnect).toHaveBeenCalledWith('acc-9', { permanentDeletion: false }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDisconnectDone');
    });

    it('deletes the connection permanently from the split button menu', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      const onClose = vi.fn();
      disconnect.mockResolvedValue({ disconnected: true, permanent: true, reconnectable: false });
      renderModal({ account: CONNECTED_ACCOUNT, onSaved, onClose });
      await screen.findByTestId('bank-connection-edit-sync');

      await user.click(screen.getByTestId('bank-connection-disconnect-split'));
      await user.click(await screen.findByTestId('bank-connection-disconnect-menu-item'));
      // The permanent action gets the richer warning cartel, not the plain confirm dialog.
      await user.click(await screen.findByTestId('bank-connection-delete-confirm-accept'));

      await waitFor(() => expect(disconnect).toHaveBeenCalledWith('acc-9', { permanentDeletion: true }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDeleteDone');
    });

    it('does not delete until the warning cartel is accepted', async () => {
      const user = userEvent.setup();
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');

      await user.click(screen.getByTestId('bank-connection-disconnect-split'));
      await user.click(await screen.findByTestId('bank-connection-disconnect-menu-item'));
      await screen.findByTestId('bank-connection-delete-confirm-modal');
      expect(disconnect).not.toHaveBeenCalled();
    });

    // The cartel portals to <body>, i.e. outside the Radix dialog content. Without explicit
    // guards Radix treats clicks on it as outside-interactions and closes the edit modal, so
    // Cancel/X would dismiss the wrong thing and leave the cartel stuck open underneath.
    it('cancels the warning cartel without closing the edit modal', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onClose });
      await screen.findByTestId('bank-connection-edit-sync');

      await user.click(screen.getByTestId('bank-connection-disconnect-split'));
      await user.click(await screen.findByTestId('bank-connection-disconnect-menu-item'));
      await user.click(await screen.findByTestId('bank-connection-delete-confirm-cancel'));

      await waitFor(() => expect(screen.queryByTestId('bank-connection-delete-confirm-modal')).toBeNull());
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('edit-account-modal')).toBeTruthy();
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('closes the warning cartel from its X without closing the edit modal', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onClose });
      await screen.findByTestId('bank-connection-edit-sync');

      await user.click(screen.getByTestId('bank-connection-disconnect-split'));
      await user.click(await screen.findByTestId('bank-connection-disconnect-menu-item'));
      await user.click(await screen.findByTestId('bank-connection-delete-confirm-close'));

      await waitFor(() => expect(screen.queryByTestId('bank-connection-delete-confirm-modal')).toBeNull());
      expect(onClose).not.toHaveBeenCalled();
    });

    // The modal stays mounted while closed, so a cartel left open would still be showing on the
    // next open.
    it('does not reopen with the warning cartel still showing', async () => {
      const user = userEvent.setup();
      const { rerender } = renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');

      await user.click(screen.getByTestId('bank-connection-disconnect-split'));
      await user.click(await screen.findByTestId('bank-connection-disconnect-menu-item'));
      await screen.findByTestId('bank-connection-delete-confirm-modal');

      rerender(<EditAccountModal open={false} account={CONNECTED_ACCOUNT} onClose={() => {}} />);
      rerender(<EditAccountModal open account={CONNECTED_ACCOUNT} onClose={() => {}} />);

      await waitFor(() => expect(screen.queryByTestId('bank-connection-delete-confirm-modal')).toBeNull());
    });

    // The modal stays mounted while closed, so the status fetched for the connected account would
    // otherwise still be in state when it reopens on the now-unlinked one — and nothing refetches
    // for an account with no bank link, so the deleted connection would look live again.
    it('does not show a stale connection after the link is deleted', async () => {
      const { rerender } = renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');

      rerender(<EditAccountModal open={false} account={CONNECTED_ACCOUNT} onClose={() => {}} />);
      // Reopens on the same account as the list now reports it: no connection, no reconnectable link.
      const unlinked = { ...CONNECTED_ACCOUNT, bankConnected: false, bankReconnectable: false };
      rerender(<EditAccountModal open account={unlinked} onClose={() => {}} />);

      await screen.findByTestId('edit-account-connect-bank');
      expect(screen.queryByTestId('bank-connection-edit-sync')).toBeNull();
      expect(screen.queryByText('financeAccountsBankConnectionStatusConnected')).toBeNull();
    });

    it('reports a permanent deletion when the bridge overrides a soft request', async () => {
      const user = userEvent.setup();
      // A connection shared with other accounts is always unlinked, whatever was requested.
      disconnect.mockResolvedValue({ disconnected: true, permanent: true, reconnectable: false });
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      await user.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDeleteDone'));
    });

    it('does not disconnect until the confirm dialog action is clicked', async () => {
      const user = userEvent.setup();
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      // The styled confirm dialog is shown; disconnect must not run until its action is confirmed.
      await screen.findByText('financeAccountsBankConnectionDisconnectAction');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('toasts an error when disconnect fails', async () => {
      const user = userEvent.setup();
      disconnect.mockRejectedValue(new Error('disc-fail'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      await user.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('disc-fail'));
    });

  });

  // A soft-disconnected account: no live connection, but the Salt Edge link survives so the
  // existing connection can be revived instead of starting a new one from scratch (ETP-4764).
  describe('deactivated (soft-disconnected) account', () => {
    const DEACTIVATED_ACCOUNT = { ...CONNECTED_ACCOUNT, bankConnected: false, bankReconnectable: true };

    beforeEach(() => {
      fetchStatus.mockResolvedValue({ connected: false, reconnectable: true, providerName: 'BBVA' });
    });

    it('offers Reconectar instead of a from-scratch connect', async () => {
      renderModal({ account: DEACTIVATED_ACCOUNT });
      await screen.findByTestId('edit-account-reconnect-bank');
      // Connecting from scratch would create a second connection and orphan the existing one.
      expect(screen.queryByTestId('edit-account-connect-bank')).toBeNull();
    });

    it('marks the connection as deactivated and explains how to resume syncing', async () => {
      renderModal({ account: DEACTIVATED_ACCOUNT });
      expect(await screen.findByText('financeAccountsBankConnectionStatusDeactivated')).toBeTruthy();
      expect(await screen.findByTestId('edit-account-deactivated-hint')).toBeTruthy();
    });

    it('launches the reconnect flow from the Reconectar button', async () => {
      const user = userEvent.setup();
      renderModal({ account: DEACTIVATED_ACCOUNT });
      await user.click(await screen.findByTestId('edit-account-reconnect-bank'));
      await waitFor(() => expect(launchSaltEdgePopup).toHaveBeenCalled());
    });

    // Salt Edge redirects to an app route that only relays the connection id, so the SPA has to
    // finalize the reconnect itself. Skipping this leaves the connection inactive and the account
    // stuck on "deactivated" no matter how many times the user reconnects.
    it('finalizes the reconnect with the id the popup relayed back', async () => {
      const user = userEvent.setup();
      renderModal({ account: DEACTIVATED_ACCOUNT });
      await user.click(await screen.findByTestId('edit-account-reconnect-bank'));
      await waitFor(() => expect(finishReconnect).toHaveBeenCalledWith('acc-9', 'SE-CONN-1'));
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionReauthDone'));
    });

    // The modal must reflect the reconnect without being closed and reopened: it renders from the
    // connection hook's live view, not from the account record it was opened with, which still
    // says "deactivated" at this point.
    it('switches to the connected panel without reopening', async () => {
      const user = userEvent.setup();
      fetchStatus
        .mockResolvedValueOnce({ connected: false, reconnectable: true, providerName: 'BBVA' })
        .mockResolvedValueOnce({ connected: true, reconnectable: false, providerName: 'BBVA' });
      renderModal({ account: DEACTIVATED_ACCOUNT });

      await user.click(await screen.findByTestId('edit-account-reconnect-bank'));

      await screen.findByTestId('bank-connection-edit-sync');
      expect(screen.queryByTestId('edit-account-reconnect-bank')).toBeNull();
      expect(screen.queryByTestId('edit-account-deactivated-hint')).toBeNull();
      // Least obvious regression: reading a stale record made it fall through to the
      // never-connected branch and offer a from-scratch connect.
      expect(screen.queryByTestId('edit-account-connect-bank')).toBeNull();
    });

    it('does not finalize when the popup is closed without reconnecting', async () => {
      const user = userEvent.setup();
      launchSaltEdgePopup.mockResolvedValue(null);
      renderModal({ account: DEACTIVATED_ACCOUNT });
      await user.click(await screen.findByTestId('edit-account-reconnect-bank'));
      await waitFor(() => expect(launchSaltEdgePopup).toHaveBeenCalled());
      expect(finishReconnect).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalledWith('financeAccountsBankConnectionReauthDone');
    });

    // The account is still bound to one Salt Edge account, so the fields the bank owns must stay
    // locked. Editing the currency here and then reconnecting would silently desync the account
    // from the bank account it re-binds to (the link filters the bank's accounts by currency).
    it('keeps Type/Currency locked while deactivated (IBAN is editable, ETP-4896 follow-up)', async () => {
      renderModal({ account: DEACTIVATED_ACCOUNT });
      await screen.findByTestId('edit-account-reconnect-bank');

      expect(screen.getByTestId('edit-account-iban')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-type')).toBeNull();
      expect(screen.queryByTestId('edit-account-currency')).toBeNull();
    });

    it('still allows releasing the surviving link without reconnecting first', async () => {
      const user = userEvent.setup();
      disconnect.mockResolvedValue({ disconnected: true, permanent: true, reconnectable: false });
      renderModal({ account: DEACTIVATED_ACCOUNT });
      // The soft disconnect no longer applies here, so only the permanent action is offered.
      await user.click(await screen.findByTestId('bank-connection-delete-only'));
      await user.click(await screen.findByTestId('bank-connection-delete-confirm-accept'));
      await waitFor(() => expect(disconnect).toHaveBeenCalledWith('acc-9', { permanentDeletion: true }));
    });
  });

  describe('non-connected editing', () => {
    it('shows the IBAN validation error after blur on an invalid IBAN', async () => {
      const user = userEvent.setup();
      renderModal();
      const ibanInput = screen.getByTestId('edit-account-iban');
      await user.clear(ibanInput);
      await user.type(ibanInput, 'INVALID-IBAN');
      await user.tab(); // triggers onBlur → ibanTouched
      await waitFor(() =>
        expect(screen.getByTestId('edit-account-iban-error')).toHaveTextContent(
          'financeAccountsNewIbanInvalid',
        ),
      );
    });

    it('disables Save while the name is empty', async () => {
      const user = userEvent.setup();
      renderModal();
      const nameInput = screen.getByTestId('edit-account-name');
      await user.clear(nameInput);
      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
    });

    it('persists a changed reconciliation date tolerance', async () => {
      const user = userEvent.setup();
      renderModal();
      const dateTol = screen.getByTestId('recon-date-tolerance-input');
      await user.clear(dateTol);
      await user.type(dateTol, '7');
      await user.click(screen.getByTestId('edit-account-save'));
      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      const [, payload] = updateAccount.mock.calls[0];
      expect(payload).toMatchObject({ dateTolerance: 7 });
    });

    // ETP-4764 follow-up. The modal is fed by two endpoints that name these fields
    // differently: the Cuentas LIST row comes from the generic W spec (contract keys
    // `eTGODateTolerance` / `eTGOAmountTolerance`), the DETAIL record from the legacy
    // `financial-accounts-page` R spec (flat `dateTolerance` / `amountTolerance`).
    // Reading only the flat names left the list-opened modal permanently showing the
    // 3/0 defaults — which also silently swallowed a save back to the stored value,
    // since the dirty check compared against that wrong snapshot.
    it('seeds the tolerances from the W spec contract keys (list-opened modal)', () => {
      renderModal({
        account: { ...BANK_ACCOUNT, eTGODateTolerance: 9, eTGOAmountTolerance: 2.5 },
      });
      expect(screen.getByTestId('recon-date-tolerance-input')).toHaveValue(9);
      expect(screen.getByTestId('recon-amount-tolerance-input')).toHaveValue(2.5);
    });

    it('seeds the tolerances from the R spec flat keys (detail-opened modal)', () => {
      renderModal({ account: { ...BANK_ACCOUNT, dateTolerance: 5, amountTolerance: 1.5 } });
      expect(screen.getByTestId('recon-date-tolerance-input')).toHaveValue(5);
      expect(screen.getByTestId('recon-amount-tolerance-input')).toHaveValue(1.5);
    });

    it('falls back to the 3/0 defaults when the record carries neither spelling', () => {
      renderModal();
      expect(screen.getByTestId('recon-date-tolerance-input')).toHaveValue(3);
      expect(screen.getByTestId('recon-amount-tolerance-input')).toHaveValue(0);
    });

    // The regression this guards: with a wrong snapshot, typing the ALREADY-STORED value
    // reads as "not dirty" and never reaches updateAccount at all.
    it('sends a tolerance edited away from a W-spec-seeded value', async () => {
      const user = userEvent.setup();
      renderModal({ account: { ...BANK_ACCOUNT, eTGODateTolerance: 9 } });
      const dateTol = screen.getByTestId('recon-date-tolerance-input');
      await user.clear(dateTol);
      await user.type(dateTol, '4');
      await user.click(screen.getByTestId('edit-account-save'));
      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      const [, payload] = updateAccount.mock.calls[0];
      expect(payload).toMatchObject({ dateTolerance: 4 });
    });

    // The tolerance inputs hold the raw typed string, not a number. Holding a number made the
    // box impossible to clear — Number('') is 0, so deleting the last character re-rendered a
    // "0" the caret sat behind and every entry came out as "0123".
    it('lets the tolerance boxes be emptied while editing', async () => {
      const user = userEvent.setup();
      renderModal({ account: { ...BANK_ACCOUNT, eTGODateTolerance: 3, eTGOAmountTolerance: 2 } });
      const dateTol = screen.getByTestId('recon-date-tolerance-input');
      const amountTol = screen.getByTestId('recon-amount-tolerance-input');
      await user.clear(dateTol);
      await user.clear(amountTol);
      expect(dateTol).toHaveValue(null);
      expect(amountTol).toHaveValue(null);
    });

    it('types cleanly over a cleared box instead of appending behind a forced 0', async () => {
      const user = userEvent.setup();
      renderModal({ account: { ...BANK_ACCOUNT, eTGODateTolerance: 0 } });
      const dateTol = screen.getByTestId('recon-date-tolerance-input');
      await user.clear(dateTol);
      await user.type(dateTol, '123');
      expect(dateTol).toHaveValue(123);
    });

    it('persists an emptied tolerance as 0', async () => {
      const user = userEvent.setup();
      renderModal({ account: { ...BANK_ACCOUNT, eTGODateTolerance: 5 } });
      await user.clear(screen.getByTestId('recon-date-tolerance-input'));
      await user.click(screen.getByTestId('edit-account-save'));
      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      const [, payload] = updateAccount.mock.calls[0];
      expect(payload).toMatchObject({ dateTolerance: 0 });
    });

    // The amount tolerance is a PERCENTAGE of the statement line it is measured against, so
    // anything above 100 stops meaning anything (and the column is numeric(10,2), which a wild
    // value would overflow). `min`/`max` on an <input type="number"> only bound the spinner arrows
    // and native form validation — this modal saves through its own handler.
    //
    // The field REJECTS an out-of-range value visibly instead of correcting it: an earlier version
    // silently clamped 446446678787 down to 100 on blur, so the user saved without any warning and
    // found a number they never typed when they reopened the modal. Looking like the system invented
    // a value is worse than refusing the input, so the text now stands as typed, an inline error
    // appears, and Save is blocked until it is fixed.
    describe('amount tolerance out of range is rejected, not silently corrected', () => {
      const errorId = 'recon-amount-tolerance-error';

      it('keeps an over-max value as typed, shows the error and blocks Save', async () => {
        const user = userEvent.setup();
        renderModal();
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);
        await user.type(amountTol, '500');

        // Not rewritten — this is the whole point of the change.
        expect(amountTol).toHaveValue(500);
        await user.tab();
        expect(amountTol).toHaveValue(500);

        expect(screen.getByTestId(errorId)).toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();
        await user.click(screen.getByTestId('edit-account-save'));
        expect(updateAccount).not.toHaveBeenCalled();
      });

      it('keeps a negative value as typed, shows the error and blocks Save', async () => {
        const user = userEvent.setup();
        renderModal({ account: { ...BANK_ACCOUNT, eTGOAmountTolerance: 2 } });
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);
        await user.type(amountTol, '-5');

        expect(amountTol).toHaveValue(-5);
        expect(screen.getByTestId(errorId)).toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();
        await user.click(screen.getByTestId('edit-account-save'));
        expect(updateAccount).not.toHaveBeenCalled();
      });

      it('rejects the real-world overflow value that prompted the change', async () => {
        const user = userEvent.setup();
        renderModal();
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);
        await user.type(amountTol, '446446678787');

        expect(amountTol).toHaveValue(446446678787);
        expect(screen.getByTestId(errorId)).toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();
        await user.click(screen.getByTestId('edit-account-save'));
        expect(updateAccount).not.toHaveBeenCalled();
      });

      // The form must not be a dead end: correcting the value clears the error and lets the save
      // through. Without this, a rejection that never releases Save is indistinguishable from a
      // permanently broken modal.
      it('clears the error and re-enables Save once the value is corrected', async () => {
        const user = userEvent.setup();
        renderModal();
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);
        await user.type(amountTol, '500');
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();

        await user.clear(amountTol);
        await user.type(amountTol, '50');

        expect(screen.queryByTestId(errorId)).not.toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeEnabled();

        await user.click(screen.getByTestId('edit-account-save'));
        await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
        const [, payload] = updateAccount.mock.calls[0];
        expect(payload).toMatchObject({ amountTolerance: 50 });
      });

      it('shows no error for an in-range value, both bounds included', async () => {
        const user = userEvent.setup();
        renderModal();
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        for (const value of ['0', '1', '2.5', '100']) {
          await user.clear(amountTol);
          await user.type(amountTol, value);
          expect(amountTol).toHaveValue(Number(value));
          expect(screen.queryByTestId(errorId)).not.toBeInTheDocument();
        }
      });

      it('persists an in-range decimal exactly as typed', async () => {
        const user = userEvent.setup();
        renderModal();
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);
        await user.type(amountTol, '2.5');
        await user.click(screen.getByTestId('edit-account-save'));
        await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
        const [, payload] = updateAccount.mock.calls[0];
        expect(payload).toMatchObject({ amountTolerance: 2.5 });
      });

      // An empty box means "no tolerance", NOT an invalid entry — so clearing the field must never
      // raise the error or block the save. It also must stay empty (the raw-string design), rather
      // than snapping to a 0 the caret would then sit behind.
      it('treats an emptied box as valid: no error, Save stays available', async () => {
        const user = userEvent.setup();
        renderModal({ account: { ...BANK_ACCOUNT, eTGOAmountTolerance: 5 } });
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        await user.clear(amountTol);

        expect(amountTol).toHaveValue(null);
        expect(screen.queryByTestId(errorId)).not.toBeInTheDocument();
        await user.tab();
        expect(amountTol).toHaveValue(null);
        expect(screen.queryByTestId(errorId)).not.toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeEnabled();
      });

      it('still persists an emptied amount tolerance as 0', async () => {
        const user = userEvent.setup();
        renderModal({ account: { ...BANK_ACCOUNT, eTGOAmountTolerance: 5 } });
        await user.clear(screen.getByTestId('recon-amount-tolerance-input'));
        await user.click(screen.getByTestId('edit-account-save'));
        await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
        const [, payload] = updateAccount.mock.calls[0];
        expect(payload).toMatchObject({ amountTolerance: 0 });
      });

      // The dirty check compares NUMBERS, so re-typing the stored value in another shape is not a
      // change. Distinct from the rejection above: here Save is disabled because nothing changed,
      // and no error is shown.
      it('is not dirty when the stored value is re-typed in a different shape', async () => {
        const user = userEvent.setup();
        renderModal({ account: { ...BANK_ACCOUNT, eTGOAmountTolerance: 100 } });
        const amountTol = screen.getByTestId('recon-amount-tolerance-input');
        expect(amountTol).toHaveValue(100);
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();

        await user.clear(amountTol);
        await user.type(amountTol, '100.0');

        expect(screen.queryByTestId(errorId)).not.toBeInTheDocument();
        expect(screen.getByTestId('edit-account-save')).toBeDisabled();
        await user.click(screen.getByTestId('edit-account-save'));
        expect(updateAccount).not.toHaveBeenCalled();
      });
    });

    it('does not render the reconciliation section for a cash account', () => {
      renderModal({ account: { id: 'acc-c', name: 'Caja', type: 'C', bankConnected: false } });
      expect(screen.queryByTestId('reconciliation-settings-section')).not.toBeInTheDocument();
    });

    it('opens the archive dialog through the footer Archive button', async () => {
      const user = userEvent.setup();
      const onArchive = vi.fn();
      renderModal({ onArchive });
      await user.click(screen.getByText('financeAccountsBankConnectionEditArchive'));
      expect(onArchive).toHaveBeenCalledWith(BANK_ACCOUNT);
    });

    it('cancels through the footer Cancel button', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });
      await user.click(screen.getByTestId('edit-account-cancel'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── ETP-4871: the destructive footer slot is a 3-way choice ─────────────────
  // (isDeleteMode in EditAccountModal.jsx). `archived` and `!archived+!deletable` still render
  // exactly one plain button each (Desarchivar / Archivar respectively) — see EditFooter's
  // if/else-if chain, which checks `archived` before `deleteMode` so an archived-and-deletable
  // account still reads as "archived" (there is no reachable state where all three single-button
  // labels could apply at once). The `!archived+deletable` state is different: both actions are
  // genuinely available, so the footer now renders them TOGETHER via `FooterSplitButton` — Archivar
  // as the always-visible primary action, Eliminar reachable through the chevron dropdown — rather
  // than swapping one label out for the other.
  describe('destructive footer action — 3-way selection (ETP-4871)', () => {
    it.each([
      {
        description: 'plain active account (neither archived nor deletable) → Archivar',
        account: { ...BANK_ACCOUNT, active: true, deletable: false },
        expectedLabel: 'financeAccountsBankConnectionEditArchive',
        expectedCallback: 'onArchive',
      },
      {
        description: 'archived account → Desarchivar, regardless of deletable',
        account: { ...BANK_ACCOUNT, active: false, deletable: true },
        expectedLabel: 'financeAccountsMenuUnarchive',
        expectedCallback: 'onArchive',
      },
      {
        description: 'archived, non-deletable account → Desarchivar',
        account: { ...BANK_ACCOUNT, active: false, deletable: false },
        expectedLabel: 'financeAccountsMenuUnarchive',
        expectedCallback: 'onArchive',
      },
    ])('$description', async ({ account, expectedLabel, expectedCallback }) => {
      const user = userEvent.setup();
      const onArchive = vi.fn();
      const onDelete = vi.fn();
      renderModal({ account, onArchive, onDelete });

      const otherLabels = [
        'financeAccountsBankConnectionEditArchive',
        'financeAccountsMenuDelete',
        'financeAccountsMenuUnarchive',
      ].filter((label) => label !== expectedLabel);
      for (const label of otherLabels) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }

      await user.click(screen.getByText(expectedLabel));

      const callbacks = { onArchive, onDelete };
      expect(callbacks[expectedCallback]).toHaveBeenCalledWith(account);
      const other = expectedCallback === 'onArchive' ? onDelete : onArchive;
      expect(other).not.toHaveBeenCalled();
    });

    it('deletable, still-active account → split button: Archivar primary + Eliminar in dropdown, independently wired', async () => {
      const user = userEvent.setup();
      const onArchive = vi.fn();
      const onDelete = vi.fn();
      const account = { ...BANK_ACCOUNT, active: true, deletable: true };
      renderModal({ account, onArchive, onDelete });

      // Archivar is the always-visible primary action; Eliminar is not in the DOM yet — the
      // dropdown starts closed.
      const primary = screen.getByTestId('archive-account-split');
      expect(primary).toHaveTextContent('financeAccountsBankConnectionEditArchive');
      expect(screen.queryByText('financeAccountsMenuDelete')).not.toBeInTheDocument();

      // Clicking the primary action fires onArchive only — not aliased to onDelete.
      await user.click(primary);
      expect(onArchive).toHaveBeenCalledWith(account);
      expect(onDelete).not.toHaveBeenCalled();
      onArchive.mockClear();

      // Opening the chevron reveals Eliminar in the dropdown.
      await user.click(screen.getByTestId('archive-account-split-split'));
      const menuItem = screen.getByTestId('archive-account-split-menu-item');
      expect(menuItem).toHaveTextContent('financeAccountsMenuDelete');

      // Clicking the dropdown item fires onDelete only — not aliased to onArchive.
      await user.click(menuItem);
      expect(onDelete).toHaveBeenCalledWith(account);
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('an archived-and-deletable account is not reachable as delete mode (archived always wins)', () => {
      // isDeleteMode returns false whenever account.active === false, so this combination
      // can never render "Eliminar" — documented here as a regression guard in case that
      // precedence is ever inverted.
      renderModal({ account: { ...BANK_ACCOUNT, active: false, deletable: true } });
      expect(screen.queryByText('financeAccountsMenuDelete')).not.toBeInTheDocument();
      expect(screen.getByText('financeAccountsMenuUnarchive')).toBeInTheDocument();
    });

    it('isDeleteMode — pure predicate truth table', () => {
      expect(isDeleteMode({ active: true, deletable: true })).toBe(true);
      expect(isDeleteMode({ deletable: true })).toBe(true); // active absent = active
      expect(isDeleteMode({ active: false, deletable: true })).toBe(false);
      expect(isDeleteMode({ active: true, deletable: false })).toBe(false);
      expect(isDeleteMode({ active: true })).toBe(false); // deletable absent
      expect(isDeleteMode(null)).toBe(false);
    });
  });

  describe('connected read-only IBAN copy', () => {
    it('copies the IBAN to the clipboard', async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText }, configurable: true, writable: true,
      });
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');
      await user.click(screen.getByLabelText('financeAccountsCopyIban'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ES9121000418450200051332'));
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionIbanCopied');
    });
  });

  // ── ETP-4530: currencyEditable truth table ────────────────────────────────
  // currencyEditable = !bankConnected && !hasTransactions — a stricter, independent
  // condition from the IBAN/connection lock (an offline account can accumulate movements
  // without ever connecting to the bank, and must lock its currency once real history exists).
  describe('currencyEditable truth table (ETP-4530)', () => {
    it.each([
      { bankConnected: false, hasTransactions: false, editable: true },
      { bankConnected: false, hasTransactions: true, editable: false },
      { bankConnected: true, hasTransactions: false, editable: false },
      { bankConnected: true, hasTransactions: true, editable: false },
    ])(
      'currency is $editable when bankConnected=$bankConnected hasTransactions=$hasTransactions',
      async ({ bankConnected, hasTransactions, editable }) => {
        const account = {
          id: `acc-truth-${bankConnected}-${hasTransactions}`,
          name: 'Truth Table Account',
          type: 'B',
          iban: 'ES9121000418450200051332',
          currencyId: '102',
          currencyIso: 'EUR',
          bankConnected,
          hasTransactions,
        };
        renderModal({ account });

        if (editable) {
          expect(await screen.findByTestId('edit-account-currency')).toBeInTheDocument();
        } else {
          await waitFor(() =>
            expect(screen.queryByTestId('edit-account-currency')).not.toBeInTheDocument(),
          );
          // Locked currency still renders as a read-only field showing the account's ISO code.
          expect(screen.getByText('EUR')).toBeInTheDocument();
        }
      },
    );
  });

  // ── ETP-4530: assetAcctMissing gating ─────────────────────────────────────
  // assetAcctMissing = dirty && !assetAcct — required-field validation that only activates
  // once the user has actually touched (made dirty) the Contabilidad tab, so an unrelated
  // edit (name, bank connection, reconciliation) on an account that never configured accounting is not
  // silently blocked by a mandatory field belonging to a tab the user never opened.
  describe('assetAcctMissing gating (ETP-4530)', () => {
    it('does not block Save for an unrelated change when Cuenta bancaria was never touched', async () => {
      const user = userEvent.setup();
      // Default mock already resolves fINAssetAcct: null — the account never configured
      // accounting, and the Contabilidad tab is never opened in this test.
      renderModal();

      const nameInput = screen.getByTestId('edit-account-name');
      await user.clear(nameInput);
      await user.type(nameInput, 'BBVA Renamed');

      expect(screen.getByTestId('edit-account-save')).not.toBeDisabled();
    });

    it('blocks Save once Cuenta bancaria is cleared after visiting the Contabilidad tab', async () => {
      const user = userEvent.setup();
      fetchAccountingConfiguration.mockResolvedValueOnce({
        id: 'row-1',
        fINAssetAcct: 'AST1',
        'fINAssetAcct$_identifier': 'Bank Asset 1',
        fINTransitoryAcct: null,
        ledgerConfigured: true,
        catalogs: { accounts: [{ id: 'AST1', name: 'Bank Asset 1' }] },
      });
      renderModal();

      await user.click(getTab('financeAccountsEditTabAccounting'));
      await screen.findByTestId('accounting-configuration-section');
      expect(screen.getByTestId('field-fINAssetAcct-chip')).toBeInTheDocument();

      // Clear the required selection via the chip's X (clear) control.
      await user.click(screen.getByLabelText('clear'));

      await waitFor(() =>
        expect(screen.getByTestId('edit-account-asset-acct-error')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
    });
  });

  // ── ETP-4530: tab default / reset behavior ────────────────────────────────
  describe('tab default/reset behavior (ETP-4530)', () => {
    it('opens on the General tab by default', () => {
      renderModal();
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'false');
    });

    it('resets to the General tab whenever the modal (re)opens for a different account', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <EditAccountModal
          open
          account={BANK_ACCOUNT}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onArchive={vi.fn()}
          onConnect={vi.fn()}
        />,
      );

      await user.click(getTab('financeAccountsEditTabAccounting'));
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'true');

      const OTHER_ACCOUNT = { ...BANK_ACCOUNT, id: 'acc-other', name: 'Other Bank' };
      rerender(
        <EditAccountModal
          open
          account={OTHER_ACCOUNT}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onArchive={vi.fn()}
          onConnect={vi.fn()}
        />,
      );

      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'false');
    });
  });

  // ── General tab: bank connection + tolerances are non-cash-only, GL Item Difference is not ──
  // (ETP-4795). Before ETP-4795 the General tab was hidden entirely for cash accounts because it
  // had nothing to show them; it now always renders because the GL Item Difference selector
  // (used by the cash-close flow) applies to every account type.
  describe('General tab: cash accounts see only the GL Item Difference section (ETP-4795)', () => {
    const CASH_ACCOUNT = { id: 'acc-cash', name: 'Caja', type: 'C', currencyId: '102', bankConnected: false };

    it('renders the General tab trigger for a cash account and lands on it', () => {
      renderModal({ account: CASH_ACCOUNT });
      expect(getTab('financeAccountsEditTabGeneral')).toBeInTheDocument();
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
    });

    it('drops the section top margin for cash, where it is the tab\'s first section', () => {
      // mt-6 separates a section from the one above it. For cash the two preceding sections are
      // skipped, so that margin landed directly under the tab row and stacked with its pt-4 —
      // visibly more space than the Accounting tab, whose only section carries no top margin.
      renderModal({ account: CASH_ACCOUNT });
      expect(screen.getByTestId('gl-item-difference-section').className).not.toContain('mt-6');
    });

    it('keeps the section top margin for a bank account, where sections precede it', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(getTab('financeAccountsEditTabGeneral'));
      expect(screen.getByTestId('gl-item-difference-section').className).toContain('mt-6');
    });

    it('shows the GL Item Difference section but not bank connection/tolerances for cash', async () => {
      const user = userEvent.setup();
      renderModal({ account: CASH_ACCOUNT });

      await user.click(getTab('financeAccountsEditTabGeneral'));

      expect(screen.getByTestId('gl-item-difference-section')).toBeInTheDocument();
      expect(screen.queryByText('financeAccountsEditConnectionSection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reconciliation-settings-section')).not.toBeInTheDocument();
    });

    it('still renders the General tab trigger for a bank account', () => {
      renderModal();
      expect(getTab('financeAccountsEditTabGeneral')).toBeInTheDocument();
    });

    // initialEditTab is exported so the FIRST render's own computation (the useState lazy
    // initializer) can be verified directly, independent of the reset effect. React Testing
    // Library's render() flushes effects synchronously, so a render-based test cannot tell the two
    // apart, and they must agree: initializing to one tab and letting the effect correct it leaves
    // the very first paint with no active trigger and no visible content (PR #913).
    it('initialEditTab is General for every account type', () => {
      expect(initialEditTab()).toBe('general');
      // Tolerates the old isCash argument, which it now ignores.
      expect(initialEditTab(true)).toBe('general');
      expect(initialEditTab(false)).toBe('general');
    });

    it('opens a cash account on General, not on Contabilidad', () => {
      // Cash used to land on Contabilidad. ETP-4795 gave General real content for cash (the GL
      // Item Difference selector), and landing on Contabilidad put the required, empty "Cuenta
      // bancaria" field in the user's face with Save disabled — which reads as an error the modal
      // is reporting rather than a starting point. The missing-asset-account summary already
      // surfaces that on General without hijacking the tab (ETP-4530 / BUG-1, below).
      const { rerender } = renderModal();
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');

      rerender(
        <EditAccountModal
          open
          account={CASH_ACCOUNT}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onArchive={vi.fn()}
          onConnect={vi.fn()}
        />,
      );

      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'false');
    });
  });

  // ── ETP-4530 / BUG-1 regression ───────────────────────────────────────────
  // The Cuenta bancaria requirement is validated on the Contabilidad tab, but Save is
  // disabled regardless of the active tab. Before this fix the reason was invisible while
  // looking at General; a summary line now surfaces it there (and only there, to avoid a
  // duplicate message with the field-level error on the Contabilidad tab itself).
  describe('BUG-1 regression — accounting error summary across tabs (ETP-4530)', () => {
    it('shows the summary on General, hides it on Contabilidad, and clears once filled in', async () => {
      const user = userEvent.setup();
      fetchAccountingConfiguration.mockResolvedValueOnce({
        id: 'row-1',
        fINAssetAcct: 'AST1',
        'fINAssetAcct$_identifier': 'Bank Asset 1',
        fINTransitoryAcct: null,
        ledgerConfigured: true,
        catalogs: {
          accounts: [
            { id: 'AST1', name: 'Bank Asset 1' },
            { id: 'AST2', name: 'Bank Asset 2' },
          ],
        },
      });
      renderModal();

      await user.click(getTab('financeAccountsEditTabAccounting'));
      await screen.findByTestId('accounting-configuration-section');

      // Clear the required field — assetAcctMissing becomes true.
      await user.click(screen.getByLabelText('clear'));
      await waitFor(() =>
        expect(screen.getByTestId('edit-account-asset-acct-error')).toBeInTheDocument(),
      );
      // (b) No duplicate summary line while still on the Contabilidad tab itself.
      expect(screen.queryByTestId('edit-account-accounting-error-summary')).not.toBeInTheDocument();

      // (a) Switching to General surfaces the summary line instead.
      await user.click(getTab('financeAccountsEditTabGeneral'));
      expect(screen.getByTestId('edit-account-accounting-error-summary')).toHaveTextContent(
        'financeAccountsAccountingBankAssetRequiredSummary',
      );

      // (c) Filling the field back in makes the summary disappear.
      await user.click(getTab('financeAccountsEditTabAccounting'));
      await user.click(screen.getByTestId('field-fINAssetAcct'));
      await user.click(await screen.findByTestId('option-fINAssetAcct-AST2'));

      await user.click(getTab('financeAccountsEditTabGeneral'));
      await waitFor(() =>
        expect(screen.queryByTestId('edit-account-accounting-error-summary')).not.toBeInTheDocument(),
      );
    });
  });

  // ── ETP-4581: Type field editability mirrors Currency ─────────────────────
  // Type (like Currency) locks the moment real movement history exists. When
  // locked it renders as plain info text (label + value, no input box), not a
  // disabled control; when editable it renders a 3-option Select.
  describe('type field editability (ETP-4581)', () => {
    const TX_BANK_ACCOUNT = {
      id: 'acc-tx',
      name: 'Bank with movements',
      type: 'B',
      iban: 'ES9121000418450200051332',
      currencyId: '102',
      currencyIso: 'EUR',
      bankConnected: false,
      hasTransactions: true,
    };
    const NO_TX_BANK_ACCOUNT = { ...TX_BANK_ACCOUNT, id: 'acc-notx', hasTransactions: false };

    it('shows Type as plain info text (no editable control) when the account has transactions', async () => {
      renderModal({ account: TX_BANK_ACCOUNT });
      // No editable Type select is rendered…
      await waitFor(() =>
        expect(screen.queryByTestId('edit-account-type')).not.toBeInTheDocument(),
      );
      // …but the localized type label ("Banco") is shown as read-only info.
      expect(screen.getByText('financeAccountsNewTypeBank')).toBeInTheDocument();
    });

    it('shows Currency as plain info text (no editable select) when the account has transactions', async () => {
      renderModal({ account: TX_BANK_ACCOUNT });
      await waitFor(() =>
        expect(screen.queryByTestId('edit-account-currency')).not.toBeInTheDocument(),
      );
      // The locked currency renders its ISO code as read-only info text.
      expect(screen.getByText('EUR')).toBeInTheDocument();
    });

    it('renders both the Type and Currency editable selects when the account has no transactions', async () => {
      renderModal({ account: NO_TX_BANK_ACCOUNT });
      expect(await screen.findByTestId('edit-account-type')).toBeInTheDocument();
      expect(await screen.findByTestId('edit-account-currency')).toBeInTheDocument();
    });

    it('saves the new Type value via updateAccount when the account has no transactions', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      renderModal({ account: NO_TX_BANK_ACCOUNT, onSaved });

      // Open the Type dropdown and pick "Card" (CA) — a non-cash change so the
      // form layout (General tab, IBAN) doesn't reflow mid-interaction.
      await user.click(await screen.findByTestId('edit-account-type'));
      await user.click(await screen.findByRole('option', { name: 'financeAccountsNewTypeCard' }));

      await user.click(screen.getByTestId('edit-account-save'));

      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      const [id, payload] = updateAccount.mock.calls[0];
      expect(id).toBe('acc-notx');
      expect(payload).toMatchObject({ type: 'CA' });
      // Only the changed field is sent — the untouched currency stays out of the payload.
      expect(payload).not.toHaveProperty('currencyId');
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('keeps the Name field editable regardless of transactions (regression)', async () => {
      const user = userEvent.setup();
      renderModal({ account: TX_BANK_ACCOUNT });
      const nameInput = screen.getByTestId('edit-account-name');
      expect(nameInput).toBeEnabled();
      await user.clear(nameInput);
      await user.type(nameInput, 'Renamed with movements');
      expect(nameInput).toHaveValue('Renamed with movements');
    });

    it('keeps the bank-connected IBAN copyable, and now also editable (ETP-4896 follow-up)', async () => {
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('bank-connection-edit-sync');
      // The copy button survives the switch to an editable input — see EditAccountModal's own
      // doc comment on why: locking IBAN once linked made an inconsistent (IBAN, country) pair
      // on an already-linked account unfixable from this modal.
      expect(screen.getByLabelText('financeAccountsCopyIban')).toBeInTheDocument();
      expect(screen.getByTestId('edit-account-iban')).toBeInTheDocument();
      // Type/Currency, by contrast, stay locked (connected) → no editable controls.
      expect(screen.queryByTestId('edit-account-type')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-currency')).not.toBeInTheDocument();
    });
  });

  // ── ETP-4581 (follow-up): Type/Currency moved to the header status strip ───
  // Type and Currency were removed from the field grid and moved beside the modal
  // title, rendered by AccountStatusInfo inside DialogHeader. The field grid now
  // holds ONLY Name and (when applicable) IBAN. Behavior (editable vs read-only)
  // is unchanged; these tests lock the new placement.
  describe('Type/Currency header placement (ETP-4581)', () => {
    const TX_BANK_ACCOUNT = {
      id: 'acc-tx-hdr',
      name: 'Bank with movements',
      type: 'B',
      iban: 'ES9121000418450200051332',
      currencyId: '102',
      currencyIso: 'EUR',
      bankConnected: false,
      hasTransactions: true,
    };
    const NO_TX_BANK_ACCOUNT = { ...TX_BANK_ACCOUNT, id: 'acc-notx-hdr', hasTransactions: false };

    it('renders read-only Type/Currency info in the header (not the field grid) when the account has transactions', async () => {
      renderModal({ account: TX_BANK_ACCOUNT });

      const header = screen.getByTestId('DialogHeader__73027d');
      // AccountFieldsGrid doesn't forward a data-testid to its root, so scope to the
      // field grid via the Name input's nearest `.grid` ancestor (its container div).
      const grid = screen.getByTestId('edit-account-name').closest('.grid');

      // Read-only info spans live in the header status strip.
      expect(within(header).getByTestId('edit-account-type-info')).toHaveTextContent(
        'financeAccountsNewTypeBank',
      );
      expect(within(header).getByTestId('edit-account-currency-info')).toHaveTextContent('EUR');

      // The field grid holds ONLY name + iban — no Type/Currency controls or info spans.
      expect(within(grid).getByTestId('edit-account-name')).toBeInTheDocument();
      expect(within(grid).getByTestId('edit-account-iban')).toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-type')).not.toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-currency')).not.toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-type-info')).not.toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-currency-info')).not.toBeInTheDocument();
    });

    it('renders editable Type/Currency selects in the field grid (not the header) when the account has no transactions', async () => {
      renderModal({ account: NO_TX_BANK_ACCOUNT });

      // Editable selects live in the field grid, below Name/IBAN.
      const grid = screen.getByTestId('edit-account-name').closest('.grid');
      expect(within(grid).getByTestId('edit-account-type')).toBeInTheDocument();
      expect(await within(grid).findByTestId('edit-account-currency')).toBeInTheDocument();

      // The header status strip (AccountStatusInfo) is not rendered at all in the
      // editable case — no Type/Currency content anywhere in the header.
      const header = screen.getByTestId('DialogHeader__73027d');
      expect(within(header).queryByTestId('edit-account-type')).not.toBeInTheDocument();
      expect(within(header).queryByTestId('edit-account-currency')).not.toBeInTheDocument();
      expect(within(header).queryByTestId('edit-account-type-info')).not.toBeInTheDocument();
      expect(within(header).queryByTestId('edit-account-currency-info')).not.toBeInTheDocument();

      // The read-only info variants are absent everywhere while editable.
      expect(screen.queryByTestId('edit-account-type-info')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-currency-info')).not.toBeInTheDocument();
    });

    it('limits the field grid to name + iban when locked, and adds the Type/Currency selects when editable', async () => {
      // READ-ONLY case (has transactions) → Type/Currency read-only in the header,
      // so the field grid holds ONLY name + iban and no Type/Currency selects.
      const withTx = renderModal({ account: TX_BANK_ACCOUNT });
      let grid = screen.getByTestId('edit-account-name').closest('.grid');
      expect(within(grid).getByTestId('edit-account-name')).toBeInTheDocument();
      expect(within(grid).getByTestId('edit-account-iban')).toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-type')).not.toBeInTheDocument();
      expect(within(grid).queryByTestId('edit-account-currency')).not.toBeInTheDocument();
      withTx.unmount();

      // EDITABLE case (no transactions) → the grid still has name + iban AND now the
      // editable Type/Currency selects appear below them.
      renderModal({ account: NO_TX_BANK_ACCOUNT });
      grid = screen.getByTestId('edit-account-name').closest('.grid');
      expect(within(grid).getByTestId('edit-account-name')).toBeInTheDocument();
      expect(within(grid).getByTestId('edit-account-iban')).toBeInTheDocument();
      expect(within(grid).getByTestId('edit-account-type')).toBeInTheDocument();
      expect(within(grid).getByTestId('edit-account-currency')).toBeInTheDocument();
    });
  });

  // ── ETP-4530: showAccountingFields capability gate ────────────────────────
  // The Accounting tab trigger AND its panel must be entirely absent (not disabled, not
  // CSS-hidden) for a role without the `showAccountingFields` capability, and the modal must
  // never end up sitting on a blank Accounting tab if the capability turns off mid-session.
  describe('showAccountingFields capability gate (ETP-4530)', () => {
    it('shows the Accounting tab and its panel when the capability is granted', async () => {
      const user = userEvent.setup();
      renderModal();

      expect(getTab('financeAccountsEditTabAccounting')).toBeInTheDocument();
      await user.click(getTab('financeAccountsEditTabAccounting'));
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'true');
      expect(await screen.findByTestId('accounting-configuration-section')).toBeInTheDocument();
    });

    it('omits the Accounting tab trigger and panel entirely when the capability is denied', () => {
      hasCapability.mockReturnValue(false);
      renderModal();

      expect(screen.queryByTestId('edit-account-tab-accounting')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-tabpanel-accounting')).not.toBeInTheDocument();
      // A non-cash account still has General available and active.
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
    });

    it('falls back to General without erroring if the capability turns off while Accounting is active', async () => {
      const user = userEvent.setup();
      const { rerender } = renderModal();

      await user.click(getTab('financeAccountsEditTabAccounting'));
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'true');

      // Simulate a role switch mid-session that revokes the capability while the modal stays open.
      hasCapability.mockReturnValue(false);
      rerender(
        <EditAccountModal
          open
          account={BANK_ACCOUNT}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onArchive={vi.fn()}
          onConnect={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('edit-account-tab-accounting')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-tabpanel-accounting')).not.toBeInTheDocument();
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
    });

    it('falls back to General for a cash account when the Accounting capability is denied', () => {
      // Edge case: a cash account defaults to Accounting, but here the capability is denied so
      // that tab does not render. Since ETP-4795 the General tab always exists (it carries the
      // GL Item Difference selector), so editTab must settle there and its content must show —
      // before ETP-4795 this combination left the modal with no tab at all.
      hasCapability.mockReturnValue(false);
      renderModal({
        account: { id: 'acc-cash-nocap', name: 'Caja', type: 'C', currencyId: '102', bankConnected: false },
      });

      expect(screen.getByTestId('edit-account-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-account-tab-accounting')).not.toBeInTheDocument();
      expect(getTab('financeAccountsEditTabGeneral')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('gl-item-difference-section')).toBeInTheDocument();
    });
  });

  // ── ETP-4896: Country field ────────────────────────────────────────────────
  // Country is always editable — never locked the way Type/Currency are — and its picker is a
  // CreatableSearchSelect over the live C_Country_ID selector, so these tests mock `global.fetch`
  // the same way CreatableSearchSelect-serverSearch.vitest.jsx does for that component directly.
  describe('country field (ETP-4896)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function mockCountrySelectorFetch(items) {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    }

    it('renders Country as a pre-filled, editable chip', () => {
      renderModal({ account: { ...BANK_ACCOUNT, countryId: '106', countryName: 'Spain' } });
      expect(screen.getByTestId('field-edit-account-country-chip')).toHaveTextContent('Spain');
    });

    it('keeps Country in the editable grid even when Type/Currency have locked into header info', () => {
      // hasTransactions locks Type/Currency (ETP-4581) — Country must not follow them there.
      renderModal({
        account: { ...BANK_ACCOUNT, countryId: '106', countryName: 'Spain', hasTransactions: true },
      });
      expect(screen.getByTestId('edit-account-type-info')).toBeInTheDocument();
      expect(screen.getByTestId('field-edit-account-country-chip')).toHaveTextContent('Spain');
    });

    it('enables Save on a country-only change and sends updateAccount with only { countryId }', async () => {
      const user = userEvent.setup();
      mockCountrySelectorFetch([{ id: '107', label: 'Italy' }]);
      // No IBAN, so switching country has nothing to cross-check — isolates the country-only path.
      renderModal({ account: { ...BANK_ACCOUNT, iban: '', countryId: '106', countryName: 'Spain' } });

      expect(screen.getByTestId('edit-account-save')).toBeDisabled();

      await user.click(screen.getByTestId('field-edit-account-country-chip'));
      await user.click(await screen.findByTestId('option-edit-account-country-107'));

      expect(screen.getByTestId('edit-account-save')).toBeEnabled();
      await user.click(screen.getByTestId('edit-account-save'));

      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      expect(updateAccount).toHaveBeenCalledWith('acc-1', { countryId: '107' });
    });

    it('blocks Save with a country-mismatch message when the picked country does not match the stored IBAN', async () => {
      const user = userEvent.setup();
      mockCountrySelectorFetch([{ id: '107', label: 'Italy' }]);
      fetchDefaults.mockResolvedValue({
        currencies: [{ id: '102', iso: 'EUR' }],
        countryIbanRules: [
          { id: '106', iso: 'ES', name: 'Spain', ibanPrefix: 'ES', ibanLength: 24 },
          { id: '107', iso: 'IT', name: 'Italy', ibanPrefix: 'IT', ibanLength: 27 },
        ],
      });
      // BANK_ACCOUNT.iban is a real Spanish IBAN — consistent with countryId '106' at open.
      renderModal({ account: { ...BANK_ACCOUNT, countryId: '106', countryName: 'Spain' } });

      await user.click(screen.getByTestId('field-edit-account-country-chip'));
      await user.click(await screen.findByTestId('option-edit-account-country-107'));

      // Touching the IBAN field surfaces the (now recomputed) error, same gate as the plain
      // invalid-IBAN case above (`ibanTouched`).
      await user.click(screen.getByTestId('edit-account-iban'));
      await user.tab();

      expect(screen.getByTestId('edit-account-iban-error'))
        .toHaveTextContent('financeAccountsNewIbanCountryMismatch');
      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
    });

    // ETP-4896 QA follow-up: picking a country with NO IBAN metadata (the ~198 majority) is
    // rejected by C_GET_IBAN_DISPLAYED_ACCOUNT, but the frontend used to let it through and the
    // user got the backend's raw English "Argentina has no IBAN configuration…" toast.
    it('blocks Save when the picked country has no IBAN configuration', async () => {
      const user = userEvent.setup();
      mockCountrySelectorFetch([{ id: 'ar', label: 'Argentina' }]);
      fetchDefaults.mockResolvedValue({
        currencies: [{ id: '102', iso: 'EUR' }],
        // Argentina is deliberately NOT in the catalog — that IS the condition being tested.
        countryIbanRules: [
          { id: '106', iso: 'ES', name: 'Spain', ibanPrefix: 'ES', ibanLength: 24 },
        ],
      });
      renderModal({ account: { ...BANK_ACCOUNT, countryId: '106', countryName: 'Spain' } });

      await user.click(screen.getByTestId('field-edit-account-country-chip'));
      await user.click(await screen.findByTestId('option-edit-account-country-ar'));

      await user.click(screen.getByTestId('edit-account-iban'));
      await user.tab();

      expect(screen.getByTestId('edit-account-iban-error'))
        .toHaveTextContent('financeAccountsNewIbanCountryNoConfig');
      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
    });

    // The dirty guard: a legacy account already stored with an IBAN and a metadata-less country,
    // opened to change something else, must not be blocked for a pair it did not touch — mirroring
    // the backend's own no-op rule (no `country` key in the body means no re-validation).
    it('does not block an untouched legacy account whose stored country has no IBAN config', async () => {
      const user = userEvent.setup();
      fetchDefaults.mockResolvedValue({
        currencies: [{ id: '102', iso: 'EUR' }],
        countryIbanRules: [
          { id: '106', iso: 'ES', name: 'Spain', ibanPrefix: 'ES', ibanLength: 24 },
        ],
      });
      renderModal({ account: { ...BANK_ACCOUNT, countryId: 'ar', countryName: 'Argentina' } });

      await user.clear(screen.getByTestId('edit-account-name'));
      await user.type(screen.getByTestId('edit-account-name'), 'Renamed');

      expect(screen.queryByTestId('edit-account-iban-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('edit-account-save')).toBeEnabled();
    });

    it('blocks Save with a translated error when Country is cleared on a bank-linked account with a stored IBAN (regression)', async () => {
      const user = userEvent.setup();
      // CONNECTED_ACCOUNT is bank-linked — IBAN is editable here too (ETP-4896 follow-up) but the
      // user only touches Country, which alone flips `ibanInvalid`. This used to sail past every
      // frontend check and land as the backend's raw, untranslated "A bank account with an IBAN
      // must have a country." 400.
      renderModal({ account: { ...CONNECTED_ACCOUNT, countryId: '106', countryName: 'Spain' } });

      const chip = await screen.findByTestId('field-edit-account-country-chip');
      await user.click(within(chip.parentElement).getByRole('button', { name: 'clear' }));

      expect(await screen.findByTestId('edit-account-iban-error'))
        .toHaveTextContent('financeAccountsNewCountryRequiredForIban');
      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
      // The whole point is that this never reaches the backend.
      expect(updateAccount).not.toHaveBeenCalled();
    });

    // ETP-4896 Test Cases 5-7 — Salt Edge is contracted for Spain only. This modal is the surface
    // that EXPLAINS the rule (the list row and row kebab just hide their connect affordance),
    // because it is the one place where the Country field that decides it is on screen.
    it('offers the connect button enabled for a Spanish account (Test Case 5)', () => {
      renderModal({ account: { ...BANK_ACCOUNT, countryIso: 'ES' } });

      expect(screen.getByTestId('edit-account-connect-bank')).toBeEnabled();
      expect(screen.queryByTestId('edit-account-connect-country-hint')).not.toBeInTheDocument();
    });

    it('disables the connect button and explains why for a non-Spanish account (Test Case 6)', () => {
      renderModal({ account: { ...BANK_ACCOUNT, countryIso: 'IT' } });

      expect(screen.getByTestId('edit-account-connect-bank')).toBeDisabled();
      expect(screen.getByTestId('edit-account-connect-country-hint'))
        .toHaveTextContent('financeAccountsBankConnectionSpainOnly');
    });

    it('disables the connect button when the stored country is unknown', () => {
      // Pre-ETP-4896 rows carry no country. Unknown is not implicitly Spain: offering the
      // connection would only have Salt Edge reject it later.
      const { countryIso, ...noCountry } = BANK_ACCOUNT;
      renderModal({ account: noCountry });

      expect(screen.getByTestId('edit-account-connect-bank')).toBeDisabled();
    });

    it('reflects a saved country change on the next open (Test Case 7)', () => {
      // The rule keys off the STORED country, matching the acceptance criteria ("guarda el
      // cambio"). Saving closes the modal and reloads the list, so reopening is what the user
      // actually sees — modelled here as a rerender with the persisted account.
      const { rerender } = renderModal({ account: { ...BANK_ACCOUNT, countryIso: 'ES' } });
      expect(screen.getByTestId('edit-account-connect-bank')).toBeEnabled();

      rerender(
        <EditAccountModal
          open
          account={{ ...BANK_ACCOUNT, countryIso: 'FR' }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onArchive={vi.fn()}
          onConnect={vi.fn()}
        />,
      );

      expect(screen.getByTestId('edit-account-connect-bank')).toBeDisabled();
    });

    it('lets the IBAN itself be edited and saved even while bank-connected (ETP-4896 follow-up)', async () => {
      const user = userEvent.setup();
      // No country selected, so only mod-97 applies — isolates "is the field actually editable
      // and persisted" from the pair cross-check already covered by the tests above.
      renderModal({ account: { ...CONNECTED_ACCOUNT, countryId: '', countryName: '' } });
      const ibanInput = screen.getByTestId('edit-account-iban');
      expect(ibanInput).toHaveValue(CONNECTED_ACCOUNT.iban);

      await user.clear(ibanInput);
      await user.type(ibanInput, 'IT60X0542811101000000123456');
      await user.tab();

      expect(screen.getByTestId('edit-account-save')).toBeEnabled();
      await user.click(screen.getByTestId('edit-account-save'));

      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      expect(updateAccount).toHaveBeenCalledWith('acc-9', { iban: 'IT60X0542811101000000123456' });
    });

    it('does not flag a legacy account whose country was already empty, when left untouched', async () => {
      const user = userEvent.setup();
      // BANK_ACCOUNT has a real IBAN and (by default) no countryId — a common pre-ETP-4896 state.
      // Renaming it must not be blocked by a field the user never touched.
      renderModal();
      expect(screen.queryByTestId('edit-account-iban-error')).not.toBeInTheDocument();

      await user.clear(screen.getByTestId('edit-account-name'));
      await user.type(screen.getByTestId('edit-account-name'), 'BBVA Renamed');

      expect(screen.getByTestId('edit-account-save')).toBeEnabled();
      await user.click(screen.getByTestId('edit-account-save'));
      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      expect(updateAccount).toHaveBeenCalledWith('acc-1', { name: 'BBVA Renamed' });
    });
  });
  // ETP-4896 QA follow-up: BIC/SWIFT existed only on the New Account form, so it could not be
  // maintained from here at all.
  describe('BIC/SWIFT field', () => {
    it('renders pre-filled from the account record on a bank account', () => {
      renderModal();
      expect(screen.getByTestId('edit-account-bic')).toHaveValue('BBVAESMM');
    });

    it('is absent on a cash account', () => {
      renderModal({ account: { ...BANK_ACCOUNT, type: 'C', iban: '', swiftCode: '' } });
      expect(screen.queryByTestId('edit-account-bic')).not.toBeInTheDocument();
    });

    // Gated on isBankType, not !isCash — the contract's displayLogic is @Type@='B', and a card
    // account has no BIC.
    it('is absent on a card account', () => {
      renderModal({ account: { ...BANK_ACCOUNT, type: 'CA', iban: '', swiftCode: '' } });
      expect(screen.queryByTestId('edit-account-bic')).not.toBeInTheDocument();
    });

    it('renders empty without crashing when the record carries no BIC', () => {
      renderModal({ account: { ...BANK_ACCOUNT, swiftCode: undefined } });
      expect(screen.getByTestId('edit-account-bic')).toHaveValue('');
    });

    // Without swiftDirty in the `dirty` chain, Save would stay disabled here — the exact bug the
    // reconciliation tolerances hit in ETP-4764.
    it('enables Save on a BIC-only edit and sends it upper-cased', async () => {
      const user = userEvent.setup();
      renderModal();

      const bic = screen.getByTestId('edit-account-bic');
      await user.clear(bic);
      await user.type(bic, 'caixesbbxxx');
      expect(screen.getByTestId('edit-account-save')).toBeEnabled();

      await user.click(screen.getByTestId('edit-account-save'));

      expect(updateAccount).toHaveBeenCalledTimes(1);
      expect(updateAccount.mock.calls[0][1]).toEqual({ swiftCode: 'CAIXESBBXXX' });
    });

    // The detail-page path used to serve a record without swiftCode at all; an untouched field must
    // never send the key, so the backend preserves the stored value.
    it('omits swiftCode from the payload when the field is untouched', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.clear(screen.getByTestId('edit-account-name'));
      await user.type(screen.getByTestId('edit-account-name'), 'Renamed');
      await user.click(screen.getByTestId('edit-account-save'));

      expect(updateAccount).toHaveBeenCalledTimes(1);
      expect(updateAccount.mock.calls[0][1]).not.toHaveProperty('swiftCode');
    });

    it('treats re-typing the stored BIC in a different case as not dirty', async () => {
      const user = userEvent.setup();
      renderModal();

      const bic = screen.getByTestId('edit-account-bic');
      await user.clear(bic);
      await user.type(bic, 'bbvaesmm');

      expect(screen.getByTestId('edit-account-save')).toBeDisabled();
    });
  });

});
