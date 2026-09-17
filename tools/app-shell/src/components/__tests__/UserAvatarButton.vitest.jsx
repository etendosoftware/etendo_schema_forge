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

// ETP-5329: `resolveRoleDisplayName` translates a handful of fixed role-name keys
// (roleNameFinance/Sales/Purchasing/Inventory) via `ui(key)`. A plain identity `ui` mock
// (`(key) => key`) can't distinguish "translated" from "unresolved key leaked through" — both
// existing tests below would still read a plausible-looking string either way. This lookup makes
// the translated output visibly different from both the raw AD_Role name and the raw i18n key,
// so a regression that stops calling `resolveRoleDisplayName` (or a call to the wrong key) fails
// the assertions instead of passing by coincidence.
const ROLE_NAME_TRANSLATIONS = {
  roleNameFinance: 'Finanzas',
  roleNameSales: 'Ventas',
  roleNamePurchasing: 'Compras',
  roleNameInventory: 'Inventario',
};

vi.mock('@/i18n', () => ({
  useUI: () => (key) => ROLE_NAME_TRANSLATIONS[key] ?? key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: setLocaleMock, ...localeOverrides }),
}));

vi.mock('@/i18n/index.js', () => ({
  useUI: () => (key) => ROLE_NAME_TRANSLATIONS[key] ?? key,
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

  // ETP-5329. The role line wraps long joined names instead of clipping them with an ellipsis
  // (the org line below it still truncates on purpose) — a long composed role list previously
  // rendered "Ventas-Finanzas-Compras" truncated inside the fixed w-56 dropdown. Assert the class
  // itself, not just the title tooltip: the title-only assertions elsewhere in this file would
  // still pass if `break-words` regressed back to `truncate`.
  it('wraps the role line instead of truncating it, unlike the organization line', () => {
    authOverrides = {
      selectedRole: { name: 'A Very Long Role Name That Would Otherwise Overflow The Container' },
      selectedOrg: { name: 'Some Organization' },
    };

    render(<UserAvatarButton />);

    const roleLine = screen.getByText(/^role: /);
    expect(roleLine.className).toMatch(/\bbreak-words\b/);
    expect(roleLine.className).not.toMatch(/\btruncate\b/);

    const orgLine = screen.getByText(/^organization: /);
    expect(orgLine.className).toMatch(/\btruncate\b/);
  });

  // ETP-5329. The dropdown should prefer the backend-resolved composed template role names
  // (effectiveRoleNames) over the raw auto-generated personal-role name, in both the visible
  // text and the title tooltip — a prior regression fixed only the visible text and left the
  // tooltip showing the stale personal-role name. Each composed name is also translated via
  // resolveRoleDisplayName before being joined, so the expected string here is the translated
  // 'Finanzas-Ventas', not the raw 'Finance-Sales'.
  it('renders the joined, translated effective role names instead of the raw personal-role name', () => {
    authOverrides = {
      selectedRole: { name: 'Personal – x', effectiveRoleNames: ['Finance', 'Sales'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Finanzas-Ventas')).toHaveAttribute('title', 'Finanzas-Ventas');
    expect(screen.queryByText(/Personal – x/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finance-Sales/)).not.toBeInTheDocument();
  });

  // ETP-5329. A single composed role must render bare, with no stray leading/trailing
  // separator from the join('-') logic, in both the visible text and the title tooltip — and
  // translated, not the raw AD_Role name.
  it('renders a single effective role name with no stray separator', () => {
    authOverrides = {
      selectedRole: { name: 'Personal – x', effectiveRoleNames: ['Finance'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Finanzas')).toHaveAttribute('title', 'Finanzas');
  });

  // ETP-5329. Same single-role-name shape as above, exercised with a different translatable
  // name to confirm the resolution (not just the join/fallback plumbing) drives both the visible
  // text and the title tooltip — neither the raw name nor the raw i18n key should leak through.
  it('renders a single translated effective role name, including in the title tooltip', () => {
    authOverrides = {
      selectedRole: { name: 'Personal – x', effectiveRoleNames: ['Sales'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Ventas')).toHaveAttribute('title', 'Ventas');
    expect(screen.queryByText(/Sales/)).not.toBeInTheDocument();
    expect(screen.queryByText(/roleNameSales/)).not.toBeInTheDocument();
  });

  // ETP-5329. A role name outside the fixed 4-entry i18n map (e.g. a custom/admin template role)
  // must fall back to the raw, untranslated name — resolveRoleDisplayName's own fallback path.
  it('falls back to the raw name for an effective role name outside the fixed i18n map', () => {
    authOverrides = {
      selectedRole: { name: 'Personal – x', effectiveRoleNames: ['CustomTemplateRole'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: CustomTemplateRole')).toHaveAttribute(
      'title',
      'CustomTemplateRole'
    );
  });

  // ETP-5329. Resolution must happen per-item, not all-or-nothing: a translatable name and an
  // unmapped one in the same list should each resolve independently before being joined.
  it('resolves each effective role name independently, translating only the ones in the fixed map', () => {
    authOverrides = {
      selectedRole: { name: 'Personal – x', effectiveRoleNames: ['Sales', 'CustomTemplateRole'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Ventas-CustomTemplateRole')).toHaveAttribute(
      'title',
      'Ventas-CustomTemplateRole'
    );
  });

  it('falls back to the personal-role name when effectiveRoleNames is an empty array', () => {
    authOverrides = {
      selectedRole: { name: 'Personal Role', effectiveRoleNames: [] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Personal Role')).toHaveAttribute('title', 'Personal Role');
  });

  it('falls back to the personal-role name when effectiveRoleNames is absent', () => {
    authOverrides = {
      selectedRole: { name: 'Personal Role' },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('role: Personal Role')).toHaveAttribute('title', 'Personal Role');
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

  // ETP-5329. The avatar-badge initial deliberately still derives from selectedRole.name, not
  // from the joined effectiveRoleNames — it must not flip to the first composed role's initial.
  it('keeps the role-initial badge derived from the personal-role name, not the joined effective roles', () => {
    authOverrides = {
      selectedRole: { name: 'Admin', effectiveRoleNames: ['Finance', 'Sales'] },
    };

    render(<UserAvatarButton />);

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('F')).not.toBeInTheDocument();
  });

  it('hides the language section when locale switching is unavailable', () => {
    localeOverrides = { setLocale: null };

    render(<UserAvatarButton />);

    expect(screen.queryByText('language')).not.toBeInTheDocument();
  });
});
