import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const logoutMock = vi.fn();
const setLocaleMock = vi.fn();
const navigateMock = vi.fn();

// The component is always rendered inside the app router; these tests mount it
// on its own, so router context has to be supplied here.
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

let authOverrides = {};
let localeOverrides = {};

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    username: 'x',
    logout: logoutMock,
    selectedRole: null,
    selectedOrg: null,
    ...authOverrides,
  }),
}));

// ETP-5022 — the logout path runs through `useLogout`, which now reads the session with the
// core's `useAuthOptional` (so it does not throw without an AuthProvider). The rest of the
// core auth module is kept intact, since other modules in this render tree import from it.
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ logout: logoutMock, ...authOverrides }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: setLocaleMock, ...localeOverrides }),
}));

vi.mock('@/i18n/index.js', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: setLocaleMock, ...localeOverrides }),
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
    authOverrides = {};
    localeOverrides = {};
  });

  // ETP-5115. Six tests used to live here, all about a "Change Password" item this menu no longer
  // owns, and four of them pinned the very defect this change removes: whether to offer the item at
  // all was decided by reading `sf_platform_auth_method` out of localStorage, so an SSO account was
  // shown nothing — not a disabled control with a reason, simply no entry. Two of those six were
  // "hides the item when ..." assertions, which would now pass vacuously against a menu that has no
  // such item for anybody: green, and testing nothing. Replaced rather than deleted so the guess
  // cannot quietly come back.
  //
  // The password form itself, and the sign-out that follows a successful change, moved to the
  // account settings screen and are covered there.

  it('always offers the Account entry, whatever the session stashed in localStorage', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'password');

    render(<UserAvatarButton />);

    expect(screen.getByTestId('menu-account')).toBeInTheDocument();
  });

  it('offers the Account entry to an SSO session, which used to be shown nothing', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    localStorage.setItem('sf_platform_auth_method', 'sso');

    render(<UserAvatarButton />);

    expect(screen.getByTestId('menu-account')).toBeInTheDocument();
  });

  it('offers the Account entry with no platform token stashed at all', () => {
    render(<UserAvatarButton />);

    expect(screen.getByTestId('menu-account')).toBeInTheDocument();
  });

  it('navigates to the account screen when the Account entry is selected', async () => {
    const user = userEvent.setup();

    render(<UserAvatarButton />);
    await user.click(screen.getByTestId('menu-account'));

    expect(navigateMock).toHaveBeenCalledWith('/account');
  });

  it('no longer hosts the change password dialog itself', async () => {
    const user = userEvent.setup();

    render(<UserAvatarButton />);
    await user.click(screen.getByTestId('menu-account'));

    expect(screen.queryByTestId('change-password-dialog')).not.toBeInTheDocument();
  });

  it('keeps the logout label readable on hover instead of red on red', () => {
    render(<UserAvatarButton />);

    // bg-destructive at full strength sits behind text-destructive: in light mode the label
    // disappeared on hover. Dark mode was already using a 20% tint and read fine.
    const logoutItem = screen.getByTestId('user-menu-logout');
    expect(logoutItem.className).not.toMatch(/focus:bg-destructive(?![/-])/);
    expect(logoutItem.className).toMatch(/focus:bg-destructive\/10/);
  });

  it('switches the locale when a language option is clicked', async () => {
    const user = userEvent.setup();

    render(<UserAvatarButton />);

    await user.click(screen.getByRole('button', { name: /Español/ }));

    expect(setLocaleMock).toHaveBeenCalledWith('es_ES');
  });

  it('exposes the full role and organization names via title when truncated', () => {
    const longRole = 'A Very Long Role Name That Overflows The Container';
    const longOrg = 'A Very Long Organization Name That Also Overflows';
    authOverrides = {
      selectedRole: { name: longRole },
      selectedOrg: { name: longOrg },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText(`role: ${longRole}`)).toHaveAttribute('title', longRole);
    expect(screen.getByText(`organization: ${longOrg}`)).toHaveAttribute('title', longOrg);
  });

  it('renders the expanded sidebar-footer row with username and chevron', () => {
    render(<UserAvatarButton expanded />);

    const trigger = screen.getByTestId('topbar-user-menu');
    expect(trigger).toHaveTextContent('x');
    expect(screen.getByTestId('ChevronRight__9f3744')).toBeInTheDocument();
  });

  it('falls back to the account label and em dash when there is no username', () => {
    authOverrides = { username: null };

    render(<UserAvatarButton expanded />);

    expect(screen.getByTestId('topbar-user-menu')).toHaveAttribute('aria-label', 'account');
    expect(screen.getByTestId('topbar-user-menu')).toHaveTextContent('—');
  });

  it('shows the role-initial badge on the compact avatar when a role is selected', () => {
    authOverrides = { selectedRole: { name: 'Admin' } };

    render(<UserAvatarButton />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('hides the language section when locale switching is unavailable', () => {
    localeOverrides = { setLocale: null };

    render(<UserAvatarButton />);

    expect(screen.queryByText('language')).not.toBeInTheDocument();
  });
});
