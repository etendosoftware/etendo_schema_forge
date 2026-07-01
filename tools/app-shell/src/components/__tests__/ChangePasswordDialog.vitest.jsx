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
vi.mock('../../pages/onboarding/onboardingApi.js', () => ({
  changePassword: (...a) => changePassword(...a),
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
});
