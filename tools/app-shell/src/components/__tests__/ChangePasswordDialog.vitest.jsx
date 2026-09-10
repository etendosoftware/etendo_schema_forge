import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  // Expose the Dialog's onOpenChange handler as buttons so tests can simulate
  // Radix overlay/escape dismissal (false) and programmatic reopen (true).
  Dialog: ({ open, onOpenChange, children }) => (
    <div>
      <button
        type="button"
        data-testid="dialog-request-close"
        onClick={() => onOpenChange?.(false)}
      />
      <button
        type="button"
        data-testid="dialog-request-open"
        onClick={() => onOpenChange?.(true)}
      />
      {open ? <div data-testid="change-password-dialog">{children}</div> : null}
    </div>
  ),
  DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

const changePassword = vi.fn();
vi.mock('@etendosoftware/etendo-go-core/onboarding/api', () => ({
  changePassword: (...a) => changePassword(...a),
  // AUTH-07 / ETP-5022: the dialog resolves the backend's stable error code through this
  // table instead of showing the server's English text, so the mock must carry it.
  AUTH_ERROR_UI_KEYS: {
    WEAK_PASSWORD: 'onboardingWeakPassword',
    INVALID_CURRENT_PASSWORD: 'onboardingInvalidCurrentPassword',
    NO_LOCAL_PASSWORD: 'onboardingNoLocalPassword',
    CHANGE_PASSWORD_MISSING_CREDENTIALS: 'onboardingChangePasswordMissingCredentials',
  },
}));
vi.mock('../copilot/copilotApi.js', () => ({
  detectBaseUrl: () => 'https://base',
}));

import { ChangePasswordDialog } from '../ChangePasswordDialog.jsx';

async function fillForm(user, { current = 'old', next = 'new', confirm = 'new' } = {}) {
  await user.type(screen.getByLabelText('onboardingCurrentPasswordLabel'), current);
  await user.type(screen.getByLabelText('onboardingNewPasswordLabel'), next);
  await user.type(screen.getByLabelText('onboardingConfirmPasswordLabel'), confirm);
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    changePassword.mockReset();
    localStorage.clear();
  });

  it('changes the password with the platform token and triggers onSuccess (logout)', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    changePassword.mockResolvedValue({ token: 'rotated' });
    const onSuccess = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    await fillForm(user);
    await user.click(screen.getByTestId('change-password-submit'));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith(fetch, 'https://base', 'platform-token', {
        currentPassword: 'old',
        newPassword: 'new',
        confirmPassword: 'new',
      });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('blocks submission and shows an error when passwords do not match', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    await fillForm(user, { next: 'new', confirm: 'different' });
    await user.click(screen.getByTestId('change-password-submit'));

    expect(screen.getByText('onboardingCredentialsMustMatch')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the server error and does not log out when the change fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    changePassword.mockRejectedValue({ userMessage: 'Wrong current password' });
    const onSuccess = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    await fillForm(user, { current: 'bad' });
    await user.click(screen.getByTestId('change-password-submit'));

    expect(await screen.findByText('Wrong current password')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // AUTH-07 / ETP-5022: the backend sends a stable code AND English developer text. The code
  // must win — this is the regression that made WEAK_PASSWORD show in English despite
  // PasswordPolicy documenting it as "translate on the frontend".
  it('translates a coded error instead of showing the server English text', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    changePassword.mockRejectedValue({
      code: 'INVALID_CURRENT_PASSWORD',
      userMessage: 'The current password is not correct.',
    });

    render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    await fillForm(user, { current: 'bad' });
    await user.click(screen.getByTestId('change-password-submit'));

    // ui() is mocked to echo the key, so seeing the key proves the code was translated
    // rather than the English userMessage being rendered.
    expect(await screen.findByText('onboardingInvalidCurrentPassword')).toBeInTheDocument();
    expect(screen.queryByText('The current password is not correct.')).not.toBeInTheDocument();
  });

  it('resets the form and error when the dialog is dismissed via onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={onOpenChange} onSuccess={vi.fn()} />);

    // Produce a visible validation error first, then dismiss the dialog.
    await fillForm(user, { next: 'new', confirm: 'different' });
    await user.click(screen.getByTestId('change-password-submit'));
    expect(screen.getByText('onboardingCredentialsMustMatch')).toBeInTheDocument();

    await user.click(screen.getByTestId('dialog-request-close'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // close() reset the local state: error gone, fields back to empty.
    expect(screen.queryByText('onboardingCredentialsMustMatch')).not.toBeInTheDocument();
    expect(screen.getByLabelText('onboardingCurrentPasswordLabel')).toHaveValue('');
    expect(screen.getByLabelText('onboardingNewPasswordLabel')).toHaveValue('');
    expect(screen.getByLabelText('onboardingConfirmPasswordLabel')).toHaveValue('');
  });

  it('forwards onOpenChange(true) to the parent without resetting state', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={onOpenChange} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('onboardingCurrentPasswordLabel'), 'old');
    await user.click(screen.getByTestId('dialog-request-open'));

    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The open branch does not call close(), so the form keeps its value.
    expect(screen.getByLabelText('onboardingCurrentPasswordLabel')).toHaveValue('old');
  });

  it('keeps the dialog state while a submission is in flight (close is a no-op)', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    let resolveChange;
    changePassword.mockImplementation(
      () => new Promise((resolve) => { resolveChange = resolve; }),
    );
    const onOpenChange = vi.fn();

    render(<ChangePasswordDialog open onOpenChange={onOpenChange} onSuccess={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByTestId('change-password-submit'));

    // While loading, close() returns early: parent is never told to close.
    await user.click(screen.getByTestId('dialog-request-close'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('onboardingCurrentPasswordLabel')).toHaveValue('old');

    resolveChange({ token: 'rotated' });
    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
  });

  describe('changing an existing password (hasPassword)', () => {
    it.each([
      ['defaulted', {}],
      ['explicit', { hasPassword: true }],
    ])('renders the change flavour and requires the current password (%s)', async (_l, props) => {
      render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} {...props} />);

      expect(screen.getByText('onboardingChangePasswordTitle')).toBeInTheDocument();
      expect(screen.getByText('changePasswordLogoutNotice')).toBeInTheDocument();
      expect(screen.getByTestId('change-password-submit'))
        .toHaveTextContent('onboardingSavePasswordAction');
      expect(screen.queryByText('accountCreatePasswordTitle')).not.toBeInTheDocument();
      expect(screen.queryByText('createPasswordLogoutNotice')).not.toBeInTheDocument();

      const current = screen.getByLabelText('onboardingCurrentPasswordLabel');
      expect(current).toBeRequired();
      expect(current).toHaveAttribute('id', 'change-current-password');
      expect(current).toHaveAttribute('autocomplete', 'current-password');
    });

    it('still sends the current password when the account has one', async () => {
      const user = userEvent.setup();
      localStorage.setItem('sf_platform_token', 'platform-token');
      changePassword.mockResolvedValue({ token: 'rotated' });

      render(<ChangePasswordDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} hasPassword />);

      await fillForm(user);
      await user.click(screen.getByTestId('change-password-submit'));

      await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
      const payload = changePassword.mock.calls[0][3];
      expect(payload).toHaveProperty('currentPassword', 'old');
    });
  });

  describe('enrolling an account that has no password (hasPassword={false})', () => {
    function renderEnrolling(props = {}) {
      return render(
        <ChangePasswordDialog
          open
          onOpenChange={vi.fn()}
          onSuccess={vi.fn()}
          hasPassword={false}
          {...props} />,
      );
    }

    it('does not render the current-password field at all', () => {
      renderEnrolling();

      expect(screen.queryByLabelText('onboardingCurrentPasswordLabel')).not.toBeInTheDocument();
      expect(document.querySelector('#change-current-password')).toBeNull();
    });

    it('leaves the form submittable, which the required current password used to block', () => {
      renderEnrolling();

      const required = Array.from(document.querySelectorAll('input[required]')).map((i) => i.id);
      expect(required).toEqual(['change-new-password', 'change-confirm-password']);
    });

    it('titles, labels and warns with the create-flavoured keys', () => {
      renderEnrolling();

      expect(screen.getByText('accountCreatePasswordTitle')).toBeInTheDocument();
      expect(screen.getByText('createPasswordLogoutNotice')).toBeInTheDocument();
      expect(screen.getByTestId('change-password-submit'))
        .toHaveTextContent('accountCreatePasswordAction');
      expect(screen.queryByText('onboardingChangePasswordTitle')).not.toBeInTheDocument();
      expect(screen.queryByText('changePasswordLogoutNotice')).not.toBeInTheDocument();
      expect(screen.queryByText('onboardingSavePasswordAction')).not.toBeInTheDocument();
    });

    it('sends a payload with no currentPassword key so the server takes the enrolling branch',
      async () => {
        const user = userEvent.setup();
        localStorage.setItem('sf_platform_token', 'platform-token');
        changePassword.mockResolvedValue({ token: 'rotated' });
        const onSuccess = vi.fn();

        renderEnrolling({ onSuccess });

        await user.type(screen.getByLabelText('onboardingNewPasswordLabel'), 'brand-new');
        await user.type(screen.getByLabelText('onboardingConfirmPasswordLabel'), 'brand-new');
        await user.click(screen.getByTestId('change-password-submit'));

        await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
        const [fetchArg, baseUrl, token, payload] = changePassword.mock.calls[0];
        expect(fetchArg).toBe(fetch);
        expect(baseUrl).toBe('https://base');
        expect(token).toBe('platform-token');
        expect(payload).not.toHaveProperty('currentPassword');
        expect(payload).toEqual({ newPassword: 'brand-new', confirmPassword: 'brand-new' });
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });

    it('still refuses two different new passwords before reaching the server', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      renderEnrolling({ onSuccess });

      await user.type(screen.getByLabelText('onboardingNewPasswordLabel'), 'one');
      await user.type(screen.getByLabelText('onboardingConfirmPasswordLabel'), 'other');
      await user.click(screen.getByTestId('change-password-submit'));

      expect(screen.getByText('onboardingCredentialsMustMatch')).toBeInTheDocument();
      expect(changePassword).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('shows the translated server refusal and does not sign the user out', async () => {
      const user = userEvent.setup();
      localStorage.setItem('sf_platform_token', 'platform-token');
      changePassword.mockRejectedValue({
        code: 'WEAK_PASSWORD',
        userMessage: 'That password is too weak.',
      });
      const onSuccess = vi.fn();

      renderEnrolling({ onSuccess });

      await user.type(screen.getByLabelText('onboardingNewPasswordLabel'), 'abc');
      await user.type(screen.getByLabelText('onboardingConfirmPasswordLabel'), 'abc');
      await user.click(screen.getByTestId('change-password-submit'));

      expect(await screen.findByText('onboardingWeakPassword')).toBeInTheDocument();
      expect(screen.queryByText('That password is too weak.')).not.toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('clears the new passwords when the dialog is dismissed', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderEnrolling({ onOpenChange });

      await user.type(screen.getByLabelText('onboardingNewPasswordLabel'), 'brand-new');
      await user.click(screen.getByTestId('dialog-request-close'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.getByLabelText('onboardingNewPasswordLabel')).toHaveValue('');
      expect(screen.getByLabelText('onboardingConfirmPasswordLabel')).toHaveValue('');
    });
  });
});
