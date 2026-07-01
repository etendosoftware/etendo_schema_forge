import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const logoutMock = vi.fn();
const setLocaleMock = vi.fn();

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    username: 'x',
    logout: logoutMock,
    selectedRole: null,
    selectedOrg: null,
  }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: setLocaleMock }),
}));

vi.mock('@/i18n/index.js', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: setLocaleMock }),
}));

// Render dropdown content unconditionally so menu items can be asserted
// without driving Radix pointer events in jsdom.
vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div data-testid="avatar-menu-trigger">{children}</div>,
  DropdownMenuContent: ({ children }) => <div data-testid="avatar-menu-content">{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick, ...props }) => (
    <button type="button" onClick={onSelect ?? onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../ChangePasswordDialog.jsx', () => ({
  ChangePasswordDialog: ({ open, onSuccess }) =>
    open ? (
      <div data-testid="change-password-dialog">
        <button type="button" data-testid="change-password-success" onClick={onSuccess}>
          success
        </button>
      </div>
    ) : null,
}));

import { UserAvatarButton } from '../UserAvatarButton.jsx';

describe('UserAvatarButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the Change Password menu item when a platform token exists and the auth method is password', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'password');

    render(<UserAvatarButton />);

    expect(screen.getByTestId('menu-change-password')).toBeInTheDocument();
  });

  it('shows the Change Password menu item when the auth method key is absent (legacy sessions)', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');

    render(<UserAvatarButton />);

    expect(screen.getByTestId('menu-change-password')).toBeInTheDocument();
  });

  it('hides the Change Password menu item for SSO sessions', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'sso');

    render(<UserAvatarButton />);

    expect(screen.queryByTestId('menu-change-password')).not.toBeInTheDocument();
  });

  it('hides the Change Password menu item when no platform token exists', () => {
    localStorage.setItem('sf_platform_auth_method', 'password');

    render(<UserAvatarButton />);

    expect(screen.queryByTestId('menu-change-password')).not.toBeInTheDocument();
  });

  it('opens the change password dialog when the menu item is selected', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'password');

    render(<UserAvatarButton />);

    expect(screen.queryByTestId('change-password-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('menu-change-password'));
    expect(screen.getByTestId('change-password-dialog')).toBeInTheDocument();
  });

  it('sets both one-shot onboarding flags and logs out after a successful password change', async () => {
    const user = userEvent.setup();
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'password');

    render(<UserAvatarButton />);

    await user.click(screen.getByTestId('menu-change-password'));
    await user.click(screen.getByTestId('change-password-success'));

    expect(localStorage.getItem('sf_onboarding_initial_view')).toBe('login');
    expect(localStorage.getItem('sf_onboarding_notice')).toBe('password-changed');
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('switches the locale when a language option is clicked', async () => {
    const user = userEvent.setup();

    render(<UserAvatarButton />);

    await user.click(screen.getByRole('button', { name: /Español/ }));

    expect(setLocaleMock).toHaveBeenCalledWith('es_ES');
  });
});
