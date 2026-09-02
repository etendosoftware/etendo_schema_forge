import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The echoed translator is a single stable function, as the real `useUI` is (it wraps its
// translate in useCallback). Handing back a fresh closure per render would change the identity of
// the page's `load` callback on every render and spin the load effect forever — an artefact of the
// mock, not of the page.
vi.mock('@/i18n', () => {
  const ui = (key) => key;
  return { useUI: () => ui };
});

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a) },
}));

const fetchAccount = vi.fn();
// Only the network call is replaced. The rest of the module stays intact because authMethodsApi
// resolves unmapped codes through the core's own AUTH_ERROR_UI_KEYS table.
vi.mock('@etendosoftware/etendo-go-core/onboarding/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAccount: (...a) => fetchAccount(...a),
}));

const removeAuthMethod = vi.fn();
// The code-to-key table is the real one: the page's job is to consult it before falling back, and
// stubbing it would hide whether it does. Its own contract is covered in authMethodsApi.vitest.js.
vi.mock('@/lib/authMethodsApi.js', async (importOriginal) => ({
  ...(await importOriginal()),
  removeAuthMethod: (...a) => removeAuthMethod(...a),
  readPlatformToken: () => 'platform-token',
}));

vi.mock('@/components/copilot/copilotApi.js', () => ({
  detectBaseUrl: () => 'https://base',
}));

const logout = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => logout,
}));

// The dialog itself is covered by ChangePasswordDialog.vitest.jsx; here it only has to be able to
// report success, which is the behaviour this page owns.
vi.mock('@/components/ChangePasswordDialog.jsx', () => ({
  ChangePasswordDialog: ({ open, onSuccess, onOpenChange }) => (open ? (
    <div data-testid="change-password-dialog">
      <button type="button" data-testid="change-password-success" onClick={onSuccess} />
      <button type="button" data-testid="change-password-close"
              onClick={() => onOpenChange?.(false)} />
    </div>
  ) : null),
}));

import AccountSettingsPage from '../AccountSettingsPage.jsx';

const BOTH_METHODS = {
  password: { enabled: true },
  identities: [{ provider: 'google', email: 'u@e.com' }],
  removable: ['password', 'google'],
};

/**
 * ETP-5115 / AUTH-05. The page loads the account's real sign-in methods from the server and hosts
 * the password form. Two behaviours are its own rather than a child's: it redraws the section from
 * the authMethods the removal response returns instead of guessing what the removal did, and it
 * signs the user out after a successful password change — the latter moved here from
 * UserAvatarButton and was untested anywhere until now.
 */
describe('AccountSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchAccount.mockResolvedValue({ authMethods: BOTH_METHODS });
  });

  describe('loading the account', () => {
    it('shows the loading line until the account has arrived', async () => {
      let resolveAccount;
      fetchAccount.mockImplementation(() => new Promise((r) => { resolveAccount = r; }));

      render(<AccountSettingsPage />);

      expect(screen.getByText('loading')).toBeInTheDocument();
      expect(screen.queryByTestId('account-security-section')).not.toBeInTheDocument();

      resolveAccount({ authMethods: BOTH_METHODS });
      expect(await screen.findByTestId('account-security-section')).toBeInTheDocument();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
    });

    it('asks the platform endpoint for the account with the stored platform token', async () => {
      render(<AccountSettingsPage />);

      await waitFor(() => expect(fetchAccount).toHaveBeenCalledTimes(1));
      expect(fetchAccount).toHaveBeenCalledWith(fetch, 'https://base', 'platform-token');
    });

    it('draws the security section from the methods the server actually reported', async () => {
      fetchAccount.mockResolvedValue({
        authMethods: {
          password: { enabled: false },
          identities: [{ provider: 'google', email: 'u@e.com' }],
          removable: [],
        },
      });

      render(<AccountSettingsPage />);

      expect(await screen.findByTestId('auth-method-row-google')).toBeInTheDocument();
      // Sole method: the server left it out of removable, so the control is locked.
      expect(screen.getByTestId('auth-method-remove-google')).toBeDisabled();
      expect(screen.queryByTestId('auth-method-remove-password')).not.toBeInTheDocument();
    });

    it('reports a failed load and still renders the section rather than staying blank', async () => {
      fetchAccount.mockRejectedValue(new Error('network down'));

      render(<AccountSettingsPage />);

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('accountMethodsLoadFailed'));
      expect(screen.getByTestId('account-security-section')).toBeInTheDocument();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
    });

    it('survives an account payload that carries no authMethods at all', async () => {
      fetchAccount.mockResolvedValue({});

      render(<AccountSettingsPage />);

      expect(await screen.findByTestId('account-security-section')).toBeInTheDocument();
      expect(toastError).not.toHaveBeenCalled();
    });
  });

  describe('removing a sign-in method', () => {
    async function confirmRemoval(user, method) {
      await user.click(await screen.findByTestId(`auth-method-remove-${method}`));
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));
    }

    it('sends the confirmed method to the server with the platform token', async () => {
      const user = userEvent.setup();
      removeAuthMethod.mockResolvedValue({ authMethods: BOTH_METHODS });

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() => expect(removeAuthMethod).toHaveBeenCalledWith(
        fetch, 'https://base', 'platform-token', 'google',
      ));
    });

    it('redraws the list from the methods the server returned, not from a local guess', async () => {
      const user = userEvent.setup();
      removeAuthMethod.mockResolvedValue({
        authMethods: { password: { enabled: true }, identities: [], removable: [] },
      });

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() =>
        expect(screen.queryByTestId('auth-method-row-google')).not.toBeInTheDocument());
      // The password is now the only method, and the server said so by omitting it from removable.
      expect(screen.getByTestId('auth-method-remove-password')).toBeDisabled();
      expect(toastSuccess).toHaveBeenCalledWith('accountMethodRemoved');
    });

    it('holds the method being removed disabled while the request is in flight', async () => {
      const user = userEvent.setup();
      let resolveRemoval;
      removeAuthMethod.mockImplementation(() => new Promise((r) => { resolveRemoval = r; }));

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() =>
        expect(screen.getByTestId('auth-method-remove-google')).toBeDisabled());
      expect(screen.getByTestId('auth-method-remove-password')).toBeEnabled();

      resolveRemoval({ authMethods: BOTH_METHODS });
      await waitFor(() =>
        expect(screen.getByTestId('auth-method-remove-google')).toBeEnabled());
    });

    it('surfaces the reason the server refused instead of failing silently', async () => {
      const user = userEvent.setup();
      // The 409 the servlet answers when this is the account's last method. The code is what the
      // UI translates; the English userMessage travelling beside it must not be what is shown.
      const refusal = new Error('refused');
      refusal.code = 'LAST_AUTH_METHOD';
      refusal.userMessage = 'This is the only way you can sign in.';
      removeAuthMethod.mockRejectedValue(refusal);

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('accountMethodLastRemaining'));
      expect(toastError).not.toHaveBeenCalledWith('This is the only way you can sign in.');
      expect(toastSuccess).not.toHaveBeenCalled();
      // The list is untouched: nothing was removed, so nothing may disappear from the screen.
      expect(screen.getByTestId('auth-method-row-google')).toBeInTheDocument();
    });

    it('translates the not-found refusal by its code as well', async () => {
      const user = userEvent.setup();
      const refusal = new Error('refused');
      refusal.code = 'AUTH_METHOD_NOT_FOUND';
      refusal.userMessage = 'That sign-in method is not enabled on this account.';
      removeAuthMethod.mockRejectedValue(refusal);

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('accountMethodNotFound'));
    });

    it('shows the server sentence when the code is one the dictionary does not know', async () => {
      const user = userEvent.setup();
      const refusal = new Error('refused');
      refusal.code = 'SOMETHING_NEW';
      refusal.userMessage = 'A reason no release of this UI has heard of.';
      removeAuthMethod.mockRejectedValue(refusal);

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('A reason no release of this UI has heard of.'));
    });

    it('falls back to the generic message when the failure carries no explanation', async () => {
      const user = userEvent.setup();
      removeAuthMethod.mockRejectedValue(new Error('boom'));

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('accountMethodRemoveFailed'));
    });

    it('releases the in-flight lock after a failure so the user can try again', async () => {
      const user = userEvent.setup();
      removeAuthMethod.mockRejectedValue(new Error('boom'));

      render(<AccountSettingsPage />);
      await confirmRemoval(user, 'google');

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(screen.getByTestId('auth-method-remove-google')).toBeEnabled();
    });
  });

  describe('hosting the password form', () => {
    it('keeps the dialog closed until the section asks for it', async () => {
      const user = userEvent.setup();

      render(<AccountSettingsPage />);
      expect(screen.queryByTestId('change-password-dialog')).not.toBeInTheDocument();

      await user.click(await screen.findByTestId('auth-method-change-password'));

      expect(screen.getByTestId('change-password-dialog')).toBeInTheDocument();
    });

    it('closes the dialog again when it reports being dismissed', async () => {
      const user = userEvent.setup();

      render(<AccountSettingsPage />);
      await user.click(await screen.findByTestId('auth-method-change-password'));
      await user.click(screen.getByTestId('change-password-close'));

      expect(screen.queryByTestId('change-password-dialog')).not.toBeInTheDocument();
    });

    // The regression this page inherited from UserAvatarButton: the server rotates the session on a
    // password change, so the token in hand is already dead. Staying put would only produce a 401
    // on the next action, and the login screen has to explain why the user is back there.
    it('signs the user out after a successful password change', async () => {
      const user = userEvent.setup();

      render(<AccountSettingsPage />);
      await user.click(await screen.findByTestId('auth-method-change-password'));
      await user.click(screen.getByTestId('change-password-success'));

      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('leaves the onboarding screen pointed at login with the password-changed notice', async () => {
      const user = userEvent.setup();

      render(<AccountSettingsPage />);
      await user.click(await screen.findByTestId('auth-method-change-password'));
      await user.click(screen.getByTestId('change-password-success'));

      expect(localStorage.getItem('sf_onboarding_initial_view')).toBe('login');
      expect(localStorage.getItem('sf_onboarding_notice')).toBe('password-changed');
    });

    it('does not sign the user out merely for opening the form', async () => {
      const user = userEvent.setup();

      render(<AccountSettingsPage />);
      await user.click(await screen.findByTestId('auth-method-change-password'));

      expect(logout).not.toHaveBeenCalled();
      expect(localStorage.getItem('sf_onboarding_notice')).toBeNull();
    });
  });

  it('renders the account page shell with its title', async () => {
    render(<AccountSettingsPage />);

    expect(screen.getByTestId('account-settings-page')).toBeInTheDocument();
    expect(screen.getByText('accountSettingsTitle')).toBeInTheDocument();
    await screen.findByTestId('account-security-section');
  });
});
