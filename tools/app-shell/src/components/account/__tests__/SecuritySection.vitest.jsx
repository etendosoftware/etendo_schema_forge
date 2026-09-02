import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Keys are echoed, as everywhere in this suite, so no English text is ever asserted. The two
// templated labels echo a placeholder alongside the key, which is what makes the {0} substitution
// observable without pinning any wording.
const TEMPLATED = new Set(['accountMethodLastChanged', 'accountMethodLastLogin']);

vi.mock('@/i18n', () => ({
  useUI: () => (key) => (TEMPLATED.has(key) ? `${key}:{0}` : key),
}));

import { SecuritySection } from '../SecuritySection.jsx';

/**
 * ETP-5115 / AUTH-05. The section draws itself entirely from the `authMethods` object the server
 * puts in /me — which methods exist, and which of them may go. These tests state that contract in
 * both directions: what a given payload must produce, and what the component must NOT decide on its
 * own. The pair around `removable` is the important one: a method the server did not list must come
 * back disabled with the reason visible, because recomputing "is this the last one?" in the browser
 * is exactly the race that could leave an account with no way in.
 */

function renderSection(authMethods, props = {}) {
  const onRemove = vi.fn();
  const onChangePassword = vi.fn();
  const utils = render(
    <SecuritySection
      authMethods={authMethods}
      onRemove={onRemove}
      onChangePassword={onChangePassword}
      {...props} />,
  );
  return { ...utils, onRemove, onChangePassword };
}

describe('SecuritySection', () => {
  describe('drawing the account from the server payload', () => {
    it('shows a password-only account as having its password set and no identity rows', () => {
      renderSection({ password: { enabled: true }, identities: [], removable: [] });

      expect(screen.getByTestId('auth-method-row-password')).toBeInTheDocument();
      expect(screen.getByText('accountMethodPasswordEnabled')).toBeInTheDocument();
      expect(screen.queryByText('accountMethodPasswordDisabled')).not.toBeInTheDocument();
      expect(screen.queryByTestId('auth-method-row-google')).not.toBeInTheDocument();
    });

    it('shows an SSO-only account as having no password, which is the AUTH-05 case', () => {
      // The account Google created: password_hash NULL. The old menu showed this user nothing at
      // all; the row now exists, says the password is not set, and offers to set one.
      renderSection({
        password: { enabled: false },
        identities: [{ provider: 'google', email: 'user@example.com' }],
        removable: [],
      });

      expect(screen.getByText('accountMethodPasswordDisabled')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-change-password')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-row-google')).toBeInTheDocument();
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    it('lists both a password and every identity when the account carries both', () => {
      renderSection({
        password: { enabled: true },
        identities: [
          { provider: 'google', email: 'user@example.com' },
          { provider: 'github', email: 'dev@example.com' },
        ],
        removable: ['password', 'google', 'github'],
      });

      expect(screen.getByTestId('auth-method-row-password')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-row-github')).toBeInTheDocument();
    });

    it('offers no remove control for a password that is not set', () => {
      // Nothing to remove, so the button would be a lie even if the server listed it.
      renderSection({
        password: { enabled: false },
        identities: [{ provider: 'google', email: 'user@example.com' }],
        removable: ['password', 'google'],
      });

      expect(screen.queryByTestId('auth-method-remove-password')).not.toBeInTheDocument();
    });

    it('renders the section on a null payload rather than crashing the page', () => {
      renderSection(null);

      expect(screen.getByTestId('account-security-section')).toBeInTheDocument();
      expect(screen.getByText('accountMethodPasswordDisabled')).toBeInTheDocument();
    });

    it('dates the password change and the last sign-in when the server sent timestamps', () => {
      renderSection({
        password: { enabled: true, lastChanged: '2026-01-15T10:00:00Z' },
        identities: [{ provider: 'google', email: 'u@e.com', lastLogin: '2026-02-20T10:00:00Z' }],
        removable: [],
      });

      const changed = new Date('2026-01-15T10:00:00Z').toLocaleDateString();
      const login = new Date('2026-02-20T10:00:00Z').toLocaleDateString();
      expect(screen.getByText(`accountMethodLastChanged:${changed}`)).toBeInTheDocument();
      expect(screen.getByText(`accountMethodLastLogin:${login}`)).toBeInTheDocument();
    });

    it('omits the date line entirely when the server sent no timestamp', () => {
      renderSection({
        password: { enabled: true },
        identities: [{ provider: 'google', email: 'u@e.com' }],
        removable: [],
      });

      expect(screen.queryByText(/accountMethodLastChanged/)).not.toBeInTheDocument();
      expect(screen.queryByText(/accountMethodLastLogin/)).not.toBeInTheDocument();
    });
  });

  describe('the removable list decides which controls are live', () => {
    it('enables the remove control for a method the server listed as removable', () => {
      renderSection({
        password: { enabled: true },
        identities: [{ provider: 'google', email: 'u@e.com' }],
        removable: ['password', 'google'],
      });

      expect(screen.getByTestId('auth-method-remove-password')).toBeEnabled();
      expect(screen.getByTestId('auth-method-remove-google')).toBeEnabled();
    });

    it('disables the remove control and explains why for a method the server left out', () => {
      // The "you cannot lock yourself out" rule. It is the server's answer, not arithmetic done
      // here: the sole method is still drawn, disabled, carrying the reason as its tooltip.
      renderSection({
        password: { enabled: true },
        identities: [],
        removable: [],
      });

      const remove = screen.getByTestId('auth-method-remove-password');
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute('title', 'accountMethodRemoveLastTooltip');
    });

    it('carries no tooltip on a control the server did allow', () => {
      renderSection({
        password: { enabled: true },
        identities: [{ provider: 'google', email: 'u@e.com' }],
        removable: ['password', 'google'],
      });

      expect(screen.getByTestId('auth-method-remove-password')).not.toHaveAttribute('title');
    });

    it('disables one method and leaves the other live when the server listed only one', () => {
      // A partial list must be honoured method by method, not collapsed into "any/none removable".
      renderSection({
        password: { enabled: true },
        identities: [{ provider: 'google', email: 'u@e.com' }],
        removable: ['google'],
      });

      expect(screen.getByTestId('auth-method-remove-password')).toBeDisabled();
      expect(screen.getByTestId('auth-method-remove-google')).toBeEnabled();
    });

    it('treats a missing removable list as nothing being removable', () => {
      renderSection({
        password: { enabled: true },
        identities: [{ provider: 'google', email: 'u@e.com' }],
      });

      expect(screen.getByTestId('auth-method-remove-password')).toBeDisabled();
      expect(screen.getByTestId('auth-method-remove-google')).toBeDisabled();
    });

    it('never opens the confirmation for a method the server did not list', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection({
        password: { enabled: true }, identities: [], removable: [],
      });

      await user.click(screen.getByTestId('auth-method-remove-password'));

      expect(screen.queryByTestId('auth-method-remove-confirm')).not.toBeInTheDocument();
      expect(onRemove).not.toHaveBeenCalled();
    });
  });

  describe('removing a method', () => {
    const bothMethods = {
      password: { enabled: true },
      identities: [{ provider: 'google', email: 'u@e.com' }],
      removable: ['password', 'google'],
    };

    it('asks for confirmation before reporting the removal upwards', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-google'));

      expect(screen.getByTestId('auth-method-remove-confirm')).toBeInTheDocument();
      expect(onRemove).not.toHaveBeenCalled();
    });

    it('reports the confirmed identity to the caller and closes the confirmation', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-google'));
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));

      // An identity needs no re-authentication, so the password argument travels empty.
      expect(onRemove).toHaveBeenCalledWith('google', '');
      expect(screen.queryByTestId('auth-method-remove-confirm')).not.toBeInTheDocument();
    });

    it('confirms the password, not the identity, when the password row asked', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.type(screen.getByTestId('auth-method-remove-current-password'), 'hunter2');
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));

      expect(onRemove).toHaveBeenCalledWith('password', 'hunter2');
    });

    it('abandons the removal when the confirmation is declined', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-google'));
      await user.click(screen.getByTestId('auth-method-remove-confirm-no'));

      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.queryByTestId('auth-method-remove-confirm')).not.toBeInTheDocument();
    });

    it('replaces the confirmation rather than stacking one when another row is asked', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-google'));
      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.type(screen.getByTestId('auth-method-remove-current-password'), 'hunter2');
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));

      expect(screen.queryAllByTestId('auth-method-remove-confirm')).toHaveLength(0);
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith('password', 'hunter2');
    });

    it('locks the method being removed while the request is in flight', async () => {
      renderSection(bothMethods, { removing: 'google' });

      expect(screen.getByTestId('auth-method-remove-google')).toBeDisabled();
      // The other method stays usable: only the one in flight is held.
      expect(screen.getByTestId('auth-method-remove-password')).toBeEnabled();
    });

    // The servlet requires the current password to remove the password, and answers 400
    // CHANGE_PASSWORD_MISSING_CREDENTIALS without it — so before the confirmation collected one,
    // that button could not succeed at all. An identity is not proved by the password, so it asks
    // for nothing.
    it('asks for the current password before removing the password', async () => {
      const user = userEvent.setup();
      renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));

      expect(screen.getByTestId('auth-method-remove-current-password')).toBeInTheDocument();
      expect(screen.getByTestId('auth-method-remove-confirm-yes')).toBeDisabled();
    });

    it('asks for nothing before removing an identity', async () => {
      const user = userEvent.setup();
      renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-google'));

      expect(screen.queryByTestId('auth-method-remove-current-password')).not.toBeInTheDocument();
      expect(screen.getByTestId('auth-method-remove-confirm-yes')).toBeEnabled();
    });

    it('releases the confirm button once a current password has been typed', async () => {
      const user = userEvent.setup();
      renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.type(screen.getByTestId('auth-method-remove-current-password'), 'h');

      expect(screen.getByTestId('auth-method-remove-confirm-yes')).toBeEnabled();
    });

    it('spends no request on an empty password field', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));

      // The server would only answer that a field the user was never shown is missing.
      expect(onRemove).not.toHaveBeenCalled();
    });

    it('discards a typed password when the confirmation is declined', async () => {
      const user = userEvent.setup();
      renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.type(screen.getByTestId('auth-method-remove-current-password'), 'hunter2');
      await user.click(screen.getByTestId('auth-method-remove-confirm-no'));
      await user.click(screen.getByTestId('auth-method-remove-password'));

      expect(screen.getByTestId('auth-method-remove-current-password')).toHaveValue('');
    });

    it('discards a typed password when the other row is asked instead', async () => {
      const user = userEvent.setup();
      const { onRemove } = renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));
      await user.type(screen.getByTestId('auth-method-remove-current-password'), 'hunter2');
      await user.click(screen.getByTestId('auth-method-remove-google'));
      await user.click(screen.getByTestId('auth-method-remove-confirm-yes'));

      // The identity removal must not carry a password the user typed for a different act.
      expect(onRemove).toHaveBeenCalledWith('google', '');
    });

    it('labels the field with the shared current-password label', async () => {
      const user = userEvent.setup();
      renderSection(bothMethods);

      await user.click(screen.getByTestId('auth-method-remove-password'));

      // Same dictionary key the change-password form uses; ui() echoes it.
      expect(screen.getByLabelText('onboardingCurrentPasswordLabel'))
        .toBe(screen.getByTestId('auth-method-remove-current-password'));
    });

    it('redraws from the payload the caller supplies after a removal succeeds', () => {
      const { rerender } = renderSection(bothMethods);
      expect(screen.getByTestId('auth-method-row-google')).toBeInTheDocument();

      // The page swaps in the authMethods the server returned; the identity is gone and the
      // password, now the only method left, comes back locked.
      rerender(
        <SecuritySection
          authMethods={{ password: { enabled: true }, identities: [], removable: [] }}
          onRemove={vi.fn()}
          onChangePassword={vi.fn()} />,
      );

      expect(screen.queryByTestId('auth-method-row-google')).not.toBeInTheDocument();
      expect(screen.getByTestId('auth-method-remove-password')).toBeDisabled();
    });
  });

  it('asks the page to open the password form when Change is pressed', async () => {
    const user = userEvent.setup();
    const { onChangePassword } = renderSection({ password: { enabled: false }, identities: [] });

    await user.click(screen.getByTestId('auth-method-change-password'));

    expect(onChangePassword).toHaveBeenCalledTimes(1);
  });
});
