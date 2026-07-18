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

    it('shows a warning toast when sync returns WARNING', async () => {
      const user = userEvent.setup();
      sync.mockResolvedValue({ status: 'WARNING', message: 'partial' });
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('psd2-edit-sync'));
      await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('partial'));
    });

    it('shows an error toast when sync returns ERROR', async () => {
      const user = userEvent.setup();
      sync.mockResolvedValue({ status: 'ERROR', message: 'boom' });
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('psd2-edit-sync'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
    });

    it('maps a PSD2_TIMEOUT sync failure to the timeout label', async () => {
      const user = userEvent.setup();
      sync.mockRejectedValue(new Error('PSD2_TIMEOUT'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('psd2-edit-sync'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountsPsd2Timeout'));
    });

    it('disables Sync now while the connection is not live', async () => {
      fetchStatus.mockResolvedValue({ connected: false, providerName: 'BBVA' });
      renderModal({ account: CONNECTED_ACCOUNT });
      const syncBtn = await screen.findByTestId('psd2-edit-sync');
      expect(syncBtn).toBeDisabled();
    });

    it('shows a loading note while the PSD2 status is still loading', async () => {
      // Never resolve so the panel stays in loading.
      fetchStatus.mockReturnValue(new Promise(() => {}));
      renderModal({ account: CONNECTED_ACCOUNT });
      expect(await screen.findByText('financeAccountsPsd2Loading')).toBeInTheDocument();
      expect(screen.queryByTestId('psd2-edit-sync')).not.toBeInTheDocument();
    });

    it('falls back to status(null) when fetchStatus throws', async () => {
      fetchStatus.mockRejectedValue(new Error('down'));
      renderModal({ account: CONNECTED_ACCOUNT });
      // Panel renders (loading resolved) but there is no live connection ⇒ sync disabled.
      const syncBtn = await screen.findByTestId('psd2-edit-sync');
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
      const banner = await screen.findByTestId('psd2-edit-reauth-banner');
      expect(banner).toBeInTheDocument();
      await user.click(screen.getByTestId('psd2-edit-reauth-link'));
      await waitFor(() => expect(launchSaltEdgePopup).toHaveBeenCalled());
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsPsd2ReauthDone'));
    });

    it('shows the expired re-auth banner when consent has lapsed', async () => {
      fetchStatus.mockResolvedValue({
        connected: true,
        providerName: 'BBVA',
        consentExpiresAt: '2026-01-01',
        daysUntilExpires: -2,
      });
      renderModal({ account: CONNECTED_ACCOUNT });
      const banner = await screen.findByTestId('psd2-edit-reauth-banner');
      // The expired message key is used rather than the countdown banner.
      expect(banner).toHaveTextContent('financeAccountsPsd2ReauthExpired');
    });

    it('toasts an error when reconnect fails', async () => {
      const user = userEvent.setup();
      fetchStatus.mockResolvedValue({
        connected: true, providerName: 'BBVA', consentExpiresAt: '2026-12-31', daysUntilExpires: 5,
      });
      launchSaltEdgePopup.mockRejectedValue(new Error('reauth-failed'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await user.click(await screen.findByTestId('psd2-edit-reauth-link'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('reauth-failed'));
    });

    it('disconnects after confirm and calls onSaved + onClose', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      const onClose = vi.fn();
      renderModal({ account: CONNECTED_ACCOUNT, onSaved, onClose });
      await screen.findByTestId('psd2-edit-sync');
      // Footer button opens the styled confirm dialog; its action button performs the disconnect.
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      await user.click(await screen.findByText('financeAccountsPsd2DisconnectAction'));
      await waitFor(() => expect(disconnect).toHaveBeenCalledWith('acc-9'));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsPsd2DisconnectDone');
    });

    it('does not disconnect until the confirm dialog action is clicked', async () => {
      const user = userEvent.setup();
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('psd2-edit-sync');
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      // The styled confirm dialog is shown; disconnect must not run until its action is confirmed.
      await screen.findByText('financeAccountsPsd2DisconnectAction');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('toasts an error when disconnect fails', async () => {
      const user = userEvent.setup();
      disconnect.mockRejectedValue(new Error('disc-fail'));
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('psd2-edit-sync');
      await user.click(screen.getByText('financeAccountsMenuDisconnect'));
      await user.click(await screen.findByText('financeAccountsPsd2DisconnectAction'));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('disc-fail'));
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

    it('does not render the reconciliation section for a cash account', () => {
      renderModal({ account: { id: 'acc-c', name: 'Caja', type: 'C', psd2Connected: false } });
      expect(screen.queryByTestId('reconciliation-settings-section')).not.toBeInTheDocument();
    });

    it('opens the archive dialog through the footer Archive button', async () => {
      const user = userEvent.setup();
      const onArchive = vi.fn();
      renderModal({ onArchive });
      await user.click(screen.getByText('financeAccountsPsd2EditArchive'));
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

  describe('connected read-only IBAN copy', () => {
    it('copies the IBAN to the clipboard', async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText }, configurable: true, writable: true,
      });
      renderModal({ account: CONNECTED_ACCOUNT });
      await screen.findByTestId('psd2-edit-sync');
      await user.click(screen.getByLabelText('financeAccountsCopyIban'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ES9121000418450200051332'));
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountsPsd2IbanCopied');
    });
  });

  // ── ETP-4530: currencyEditable truth table ────────────────────────────────
  // currencyEditable = !psd2Connected && !hasTransactions — a stricter, independent
  // condition from the IBAN/connection lock (an offline account can accumulate movements
  // without ever connecting to PSD2, and must lock its currency once real history exists).
  describe('currencyEditable truth table (ETP-4530)', () => {
    it.each([
      { psd2Connected: false, hasTransactions: false, editable: true },
      { psd2Connected: false, hasTransactions: true, editable: false },
      { psd2Connected: true, hasTransactions: false, editable: false },
      { psd2Connected: true, hasTransactions: true, editable: false },
    ])(
      'currency is $editable when psd2Connected=$psd2Connected hasTransactions=$hasTransactions',
      async ({ psd2Connected, hasTransactions, editable }) => {
        const account = {
          id: `acc-truth-${psd2Connected}-${hasTransactions}`,
          name: 'Truth Table Account',
          type: 'B',
          iban: 'ES9121000418450200051332',
          currencyId: '102',
          currencyIso: 'EUR',
          psd2Connected,
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
  // edit (name, PSD2, reconciliation) on an account that never configured accounting is not
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

  // ── Manual-QA regression: General tab must not render for cash accounts ───
  // The General tab (PSD2 connection + reconciliation config) has nothing to show for a Caja
  // account — before this fix the tab trigger still rendered (with blank content once selected).
  describe('General tab hidden for cash accounts (manual QA regression)', () => {
    const CASH_ACCOUNT = { id: 'acc-cash', name: 'Caja', type: 'C', currencyId: '102', psd2Connected: false };

    it('does not render the General tab trigger for a cash account', () => {
      renderModal({ account: CASH_ACCOUNT });
      expect(screen.queryByText('financeAccountsEditTabGeneral')).not.toBeInTheDocument();
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'true');
    });

    it('still renders the General tab trigger for a bank account', () => {
      renderModal();
      expect(getTab('financeAccountsEditTabGeneral')).toBeInTheDocument();
    });

    it('defaults straight to Contabilidad when reopened for a cash account after a bank account', () => {
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

      expect(screen.queryByText('financeAccountsEditTabGeneral')).not.toBeInTheDocument();
      expect(getTab('financeAccountsEditTabAccounting')).toHaveAttribute('aria-selected', 'true');
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
});
