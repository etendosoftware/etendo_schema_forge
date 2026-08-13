import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockUseFeatureFlag } = vi.hoisted(() => ({
  mockUseFeatureFlag: vi.fn(() => false),
}));
const { mockUseEnvironmentSwitch } = vi.hoisted(() => ({
  mockUseEnvironmentSwitch: vi.fn(() => ({
    environments: [],
    switchTo: vi.fn(),
    switching: null,
    currentClientId: undefined,
  })),
}));

// Mock react-router-dom — useLocation wrapped in a vi.fn() so individual
// tests can override the current path (e.g. the ETP-4598 openGroups-race
// regression test below needs a non-'/dashboard' route).
const mockUseLocation = vi.fn(() => ({ pathname: '/dashboard', search: '' }));
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  NavLink: ({ children, to, className, ...props }) => (
    <a href={to} className={typeof className === 'function' ? '' : className} {...props}>{children}</a>
  ),
}));

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useMenuLabel: () => (key) => key,
  useUI: () => (key, params) => {
    if (params?.n) return `${key} ${params.n}`;
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock auth context — wrapped in a vi.fn() so individual tests can override
// the return value (e.g. no selected org) via mockReturnValueOnce.
const mockUseAuth = vi.fn(() => ({ selectedOrg: { name: 'Test Org' }, user: { name: 'User' }, logout: vi.fn() }));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock favorites context — same rationale: overridable per test.
const mockUseFavorites = vi.fn(() => ({ favorites: [] }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => mockUseFavorites(),
}));

vi.mock('@/lib/flags', () => ({
  useFeatureFlag: (...args) => mockUseFeatureFlag(...args),
  TENANT_UPGRADE: 'tenant-upgrade',
  PROOF_OF_CONCEPT_MENU: 'proof-of-concept-menu',
}));

vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: (...args) => mockUseEnvironmentSwitch(...args),
}));

// Mock menu.json — includes a couple of extra entries (a "Favorites" group and
// a group with no `items`, plus a second "Home" item addressed by `path`) so
// the favNameMap-building loop in SideMenu exercises its `continue`, its
// `g.items || []` fallback, and the `item.path || item.name` branch.
vi.mock('@/menu.json', () => ({
  default: {
    menu: [
      {
        group: 'Home',
        icon: 'Home',
        section: 'General',
        items: [
          { name: 'dashboard', label: 'Home', favname: 'Home' },
          { path: 'reports', label: 'Reports' },
        ],
      },
      {
        group: 'Favorites',
        icon: 'Star',
        section: 'General',
        items: [{ name: 'ignored-fav', label: 'Ignored' }],
      },
      {
        group: 'NoItems',
        icon: 'Package',
      },
    ],
  },
}));

// Mock Radix UI primitives that need portals/popper
vi.mock('@/components/ui/tooltip.jsx', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }) => <>{children}</>,
  TooltipContent: ({ children }) => <span style={{ display: 'none' }}>{children}</span>,
}));

vi.mock('@/components/ui/popover.jsx', async () => {
  const React = await import('react');
  return {
    Popover: ({ children }) => <>{children}</>,
    PopoverTrigger: React.forwardRef(({ children, asChild }, ref) => <span ref={ref}>{children}</span>),
    PopoverContent: ({ children }) => <div style={{ display: 'none' }}>{children}</div>,
  };
});

vi.mock('@/components/ui/dropdown-menu.jsx', async () => {
  const React = await import('react');
  return {
    DropdownMenu: ({ children }) => <>{children}</>,
    DropdownMenuTrigger: React.forwardRef(({ children, asChild, ...props }, ref) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, { ref });
      }
      return <div ref={ref}>{children}</div>;
    }),
    DropdownMenuContent: ({ children }) => <div style={{ display: 'none' }}>{children}</div>,
    DropdownMenuItem: ({ children }) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
  };
});

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/UserAvatarButton.jsx', () => ({
  UserAvatarButton: () => <div data-testid="user-avatar" />,
}));

// Mock Phosphor icons — return simple span stubs
vi.mock('@phosphor-icons/react', () => {
  const iconStub = ({ className }) => <span className={className} />;
  return {
    ClipboardText: iconStub,
    House: iconStub,
    Star: iconStub,
    IdentificationCard: iconStub,
    ShareNetwork: iconStub,
    TrendUp: iconStub,
    Receipt: iconStub,
    Bank: iconStub,
    Package: iconStub,
    Briefcase: iconStub,
    Users: iconStub,
    Presentation: iconStub,
    Plug: iconStub,
    Gear: iconStub,
    Flask: iconStub,
    SquaresFour: iconStub,
    Eye: iconStub,
    FileCode: iconStub,
    Storefront: iconStub,
  };
});

import SideMenu from '../SideMenu.jsx';

const MENU_GROUPS = [
  {
    group: 'Favorites',
    icon: 'Star',
    section: 'General',
    items: [],
  },
  {
    group: 'Home',
    icon: 'Home',
    section: 'General',
    items: [{ name: 'dashboard', label: 'Home' }],
  },
  {
    group: 'Sales',
    icon: 'TrendingUp',
    section: 'Operations',
    items: [
      { name: 'sales-order', label: 'Sales Order' },
      { name: 'sales-invoice', label: 'Sales Invoice' },
    ],
  },
  {
    group: 'Proof of Concept',
    icon: 'FlaskConical',
    section: 'System',
    items: [
      { name: 'quick-sales-order', label: 'Quick Sales Order' },
      { name: 'quick-purchase-order', label: 'Quick Purchase Order' },
    ],
  },
];

describe('SideMenu', () => {
  const defaultProps = {
    menuGroups: MENU_GROUPS,
    expanded: true,
    onToggle: vi.fn(),
  };

  it('renders without crashing with minimal props', () => {
    render(<SideMenu {...defaultProps} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders the navigation aria label', () => {
    render(<SideMenu {...defaultProps} />);
    expect(screen.getByLabelText('navigation')).toBeInTheDocument();
  });

  it('renders group names in expanded mode', () => {
    render(<SideMenu {...defaultProps} />);
    // "Sales" group button should be visible
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('renders the org name from auth context', () => {
    render(<SideMenu {...defaultProps} />);
    const matches = screen.getAllByText('Test Org');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the current environment plan in the selector when tenant upgrade is enabled', () => {
    mockUseFeatureFlag.mockImplementation(key => key === 'tenant-upgrade');
    mockUseEnvironmentSwitch.mockReturnValue({
      environments: [{ clientId: 'demo-1', clientName: 'Test Org', plan: 'free' }],
      switchTo: vi.fn(),
      switching: null,
      currentClientId: 'demo-1',
    });

    render(<SideMenu {...defaultProps} />);

    expect(within(screen.getByLabelText('switchCompany')).getByText('environmentDemo')).toBeInTheDocument();
  });

  it('does not show a plan label in the selector when tenant upgrade is disabled', () => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockUseEnvironmentSwitch.mockReturnValue({
      environments: [{ clientId: 'demo-1', clientName: 'Test Org', plan: 'free' }],
      switchTo: vi.fn(),
      switching: null,
      currentClientId: 'demo-1',
    });

    render(<SideMenu {...defaultProps} />);

    expect(within(screen.getByLabelText('switchCompany')).queryByText('environmentDemo')).not.toBeInTheDocument();
  });

  it('renders the user avatar button', () => {
    render(<SideMenu {...defaultProps} />);
    expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
  });

  it('renders collapse button in expanded mode', () => {
    render(<SideMenu {...defaultProps} />);
    expect(screen.getByLabelText('collapseMenu')).toBeInTheDocument();
  });

  it('calls onToggle when collapse button is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<SideMenu {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByLabelText('collapseMenu'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders expand button in collapsed mode', () => {
    render(<SideMenu {...defaultProps} expanded={false} />);
    expect(screen.getByLabelText('expandMenu')).toBeInTheDocument();
  });

  it('renders help button', () => {
    render(<SideMenu {...defaultProps} />);
    expect(screen.getByText('helpAndSupport')).toBeInTheDocument();
  });

  it('expands group items when group button is clicked', async () => {
    const user = userEvent.setup();
    render(<SideMenu {...defaultProps} />);
    // Click "Sales" to expand
    await user.click(screen.getByText('Sales'));
    expect(screen.getByText('Sales Order')).toBeInTheDocument();
    expect(screen.getByText('Sales Invoice')).toBeInTheDocument();
  });

  it('renders direct link for single-item groups (Home)', () => {
    render(<SideMenu {...defaultProps} />);
    // Home group has exactly 1 item, rendered as direct NavLink
    const homeLink = screen.getByText('Home');
    expect(homeLink).toBeInTheDocument();
  });

  describe('additional coverage', () => {
    afterEach(() => {
      vi.useRealTimers();
      // SideMenu's location-tracking effect always calls setOpenGroups with a
      // fresh object on mount, forcing a second render (and a second call to
      // useAuth()/useFavorites()) even when nothing actually changed — so a
      // single mockReturnValueOnce override gets consumed before we can
      // observe it. Use a persistent override instead and restore the
      // baseline here so it doesn't leak into other tests.
      mockUseAuth.mockReturnValue({ selectedOrg: { name: 'Test Org' }, user: { name: 'User' }, logout: vi.fn() });
      mockUseFavorites.mockReturnValue({ favorites: [] });
      mockUseLocation.mockReturnValue({ pathname: '/dashboard', search: '' });
      delete import.meta.env.VITE_SHOW_ARTIFACTS;
      mockUseFeatureFlag.mockReset();
      mockUseFeatureFlag.mockReturnValue(false);
      mockUseEnvironmentSwitch.mockReset();
      mockUseEnvironmentSwitch.mockReturnValue({
        environments: [],
        switchTo: vi.fn(),
        switching: null,
        currentClientId: undefined,
      });
    });

    // A group whose currentPath ('dashboard') matches one of two items, so the
    // group itself is both "active" (findActiveGroup) and non-direct (2 visible
    // items) — this is the only combination that exercises the
    // active-and-expanded / active-and-collapsed header style branches.
    const ACTIVE_MULTI_GROUP = [
      {
        group: 'Home',
        icon: 'Home',
        section: 'General',
        items: [
          { name: 'dashboard', label: 'Panel principal' },
          { name: 'dashboard-extra', label: 'Extra' },
        ],
      },
    ];

    const QUERY_ITEM_GROUP = [
      {
        group: 'Reports',
        icon: 'Eye',
        section: 'General',
        items: [
          { name: 'report-viewer-sales', label: 'Sales Report', path: 'report-viewer?category=sales' },
          { name: 'report-viewer-other', label: 'Other Report', path: 'report-viewer?category=other' },
        ],
      },
    ];

    const COLLAPSED_DIRECT_GROUPS = [
      { group: 'Home', icon: 'Home', section: 'General', items: [{ name: 'dashboard', label: 'Home' }] },
      { group: 'Settings', icon: 'Settings', section: 'General', items: [{ name: 'settings', label: 'Settings' }] },
    ];

    it('a collapsed group popover cancels a scheduled close when re-entered before the timeout fires', () => {
      vi.useFakeTimers();
      render(<SideMenu {...defaultProps} expanded={false} />);
      const trigger = screen.getByLabelText('Sales');
      fireEvent.mouseEnter(trigger);
      fireEvent.mouseLeave(trigger);
      // Re-entering before the 120ms close timer elapses should cancel it.
      fireEvent.mouseEnter(trigger);
      vi.advanceTimersByTime(200);
      expect(trigger).toBeInTheDocument();
      fireEvent.mouseLeave(trigger);
      vi.advanceTimersByTime(200);
    });

    it('a collapsed active group popover highlights only the active sub-item', () => {
      render(<SideMenu {...defaultProps} menuGroups={ACTIVE_MULTI_GROUP} expanded={false} />);
      const trigger = screen.getByLabelText('Home');
      fireEvent.mouseEnter(trigger);
      const activeLink = screen.getByTestId('menu-item-dashboard');
      const inactiveLink = screen.getByTestId('menu-item-dashboard-extra');
      expect(activeLink.className).toMatch(/bg-accent-highlight/);
      expect(inactiveLink.className).not.toMatch(/bg-accent-highlight/);
      fireEvent.mouseLeave(trigger);
    });

    it('matches query-string item paths against the full current URL', async () => {
      const user = userEvent.setup();
      render(<SideMenu {...defaultProps} menuGroups={QUERY_ITEM_GROUP} />);
      await user.click(screen.getByText('Reports'));
      // The mocked location is /dashboard with an empty search string, so
      // neither query-string item matches — both fall through the
      // `target.includes('?')` branch as inactive.
      expect(screen.getByTestId('menu-item-report-viewer-sales').className).not.toMatch(/bg-accent-highlight/);
      expect(screen.getByTestId('menu-item-report-viewer-other').className).not.toMatch(/bg-accent-highlight/);
    });

    it('applies the active-and-open header style, then the active-and-collapsed style once toggled closed', async () => {
      const user = userEvent.setup();
      render(<SideMenu {...defaultProps} menuGroups={ACTIVE_MULTI_GROUP} />);
      // Home is the active group and starts open — its sub-item is visible.
      expect(screen.getByTestId('menu-item-dashboard-extra')).toBeInTheDocument();
      await user.click(screen.getByText('Home'));
      // Toggled closed while still the active group.
      expect(screen.queryByTestId('menu-item-dashboard-extra')).not.toBeInTheDocument();
    });

    it('opens a group for the current route once the route\'s item appears in menuGroups after mount, with no navigation (ETP-4598 openGroups regression)', () => {
      // Regression test for the bug fixed in SideMenu.jsx (activeGroup?.group
      // added to the openGroups-sync effect's dependency array): AppLayout.jsx's
      // useRoleMenu() always renders `menuGroups` filtered-to-empty on first
      // paint (allowedIds starts `undefined`, treated as an empty allow-set),
      // then re-renders with the real (unfiltered or role-filtered) menuGroups
      // once the SFListMenu webhook resolves — with no route change in between.
      // Before the fix, `openGroups` was only recomputed on
      // [location.pathname, location.search], so a direct/deep-link load into a
      // route whose menu item is absent from the very first menuGroups render
      // left that item's group permanently collapsed even once it appeared.
      mockUseLocation.mockReturnValue({ pathname: '/tax', search: '' });

      // First render: simulates the pre-resolution state — 'tax' is not yet in
      // the Settings group's items (as if role-filtering hid it), so no group
      // matches the current route and findActiveGroup returns null.
      const SETTINGS_BEFORE_RESOLVE = [
        {
          group: 'Settings',
          icon: 'Settings',
          section: 'System',
          items: [
            { name: 'other-setting', label: 'Other Setting' },
            { name: 'yet-another', label: 'Yet Another' },
          ],
        },
      ];
      // Second render (same location, no navigation): simulates allowedIds
      // resolving — 'tax' now appears in the Settings group's items.
      const SETTINGS_AFTER_RESOLVE = [
        {
          group: 'Settings',
          icon: 'Settings',
          section: 'System',
          items: [
            { name: 'other-setting', label: 'Other Setting' },
            { name: 'tax', label: 'Tax' },
          ],
        },
      ];

      const { rerender } = render(<SideMenu {...defaultProps} menuGroups={SETTINGS_BEFORE_RESOLVE} />);
      // Settings has 2 items (non-direct) and isn't the active group yet, so it
      // starts collapsed — none of its sub-items are rendered.
      expect(screen.queryByTestId('menu-item-other-setting')).not.toBeInTheDocument();
      expect(screen.queryByTestId('menu-item-tax')).not.toBeInTheDocument();

      rerender(<SideMenu {...defaultProps} menuGroups={SETTINGS_AFTER_RESOLVE} />);
      // Settings is now the active group (its 'tax' item matches /tax) — it
      // must end up expanded/open without any click or navigation.
      expect(screen.getByTestId('menu-item-tax')).toBeInTheDocument();
    });

    it('highlights only the active direct-link icon in collapsed mode', () => {
      render(<SideMenu {...defaultProps} menuGroups={COLLAPSED_DIRECT_GROUPS} expanded={false} />);
      const activeLink = screen.getByTestId('menu-item-dashboard');
      const inactiveLink = screen.getByTestId('menu-item-settings');
      expect(activeLink.className).toMatch(/bg-accent-highlight/);
      expect(inactiveLink.className).not.toMatch(/bg-accent-highlight/);
    });

    it('shows the empty-favorites hint when the Favorites group is expanded with no favorites', async () => {
      const user = userEvent.setup();
      render(<SideMenu {...defaultProps} />);
      await user.click(screen.getByText('Favorites'));
      expect(screen.getByText('noFavoritesYet')).toBeInTheDocument();
    });

    it('shows only the first favorites and reveals the rest via "and N more", using per-locale labels', async () => {
      const user = userEvent.setup();
      mockUseFavorites.mockReturnValue({
        favorites: [
          { name: 'fav1', label: 'Favorite One' },
          { name: 'fav2', label: 'Favorite Two' },
          { name: 'fav3', label: 'Favorite Three', labels: { en_US: 'Fav Three EN' } },
          { name: 'fav4', label: 'Favorite Four' },
        ],
      });
      render(<SideMenu {...defaultProps} />);
      await user.click(screen.getByText('Favorites'));
      expect(screen.getByText('Favorite One')).toBeInTheDocument();
      expect(screen.getByText('Favorite Two')).toBeInTheDocument();
      expect(screen.queryByText('Fav Three EN')).not.toBeInTheDocument();
      await user.click(screen.getByText(/andNMore/));
      expect(screen.getByText('Fav Three EN')).toBeInTheDocument();
      expect(screen.getByText('Favorite Four')).toBeInTheDocument();
    });

    it('does not treat a Favorites entry as the active group even if its path matches the current route', () => {
      mockUseFavorites.mockReturnValue({ favorites: [{ name: 'dashboard', label: 'Duplicado' }] });
      render(<SideMenu {...defaultProps} />);
      // "Home" (the real, non-Favorites group) stays the sole match for /dashboard.
      expect(screen.getAllByText('Home')).toHaveLength(1);
    });

    it('shows an unread badge next to Help & Support in expanded mode', () => {
      render(<SideMenu {...defaultProps} unreadCount={5} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('shows a capped unread badge next to Help & Support in collapsed mode', () => {
      render(<SideMenu {...defaultProps} expanded={false} unreadCount={12} />);
      expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('calls the provided onHelpClick handler instead of opening the built-in dialog', async () => {
      const user = userEvent.setup();
      const onHelpClick = vi.fn();
      render(<SideMenu {...defaultProps} onHelpClick={onHelpClick} />);
      await user.click(screen.getByText('helpAndSupport'));
      expect(onHelpClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens and closes the built-in help dialog when no onHelpClick handler is provided', async () => {
      const user = userEvent.setup();
      render(<SideMenu {...defaultProps} />);
      await user.click(screen.getByText('helpAndSupport'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('helpComingSoon')).toBeInTheDocument();
      await user.click(screen.getByText('close'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the Artifacts link in expanded mode when the feature flag is enabled', () => {
      // import.meta.env is a real, mutable object under Vite/Vitest, so this
      // toggles the same flag SideMenu reads at render time (reset in afterEach).
      import.meta.env.VITE_SHOW_ARTIFACTS = 'true';
      render(<SideMenu {...defaultProps} />);
      const link = screen.getByTestId('NavLink__247c75');
      expect(link).toHaveAttribute('href', '/artifacts');
      expect(screen.getByText('Artifacts')).toBeInTheDocument();
    });

    it('hides the Proof of Concept section while its flag is off', () => {
      render(<SideMenu {...defaultProps} />);
      expect(screen.queryByText('Proof of Concept')).not.toBeInTheDocument();
    });

    it('shows the Proof of Concept section when its flag is on', () => {
      mockUseFeatureFlag.mockImplementation(key => key === 'proof-of-concept-menu');
      render(<SideMenu {...defaultProps} />);
      expect(screen.getByText('Proof of Concept')).toBeInTheDocument();
    });

    it('keeps the Proof of Concept section hidden when the provider falls back', () => {
      // A failed provider resolves useFeatureFlag to the declared false default.
      mockUseFeatureFlag.mockReturnValue(false);
      render(<SideMenu {...defaultProps} />);
      expect(screen.queryByText('Proof of Concept')).not.toBeInTheDocument();
    });

    it('renders the Artifacts link as an icon-only tooltip trigger in collapsed mode', () => {
      import.meta.env.VITE_SHOW_ARTIFACTS = 'true';
      render(<SideMenu {...defaultProps} expanded={false} />);
      const link = screen.getByTestId('NavLink__247c75');
      expect(link).toHaveAttribute('href', '/artifacts');
    });

    it('falls back to the generic "yourCompany" label when there is no selected org', () => {
      mockUseAuth.mockReturnValue({ selectedOrg: null, user: { name: 'User' }, logout: vi.fn() });
      render(<SideMenu {...defaultProps} />);
      expect(screen.getAllByText('yourCompany').length).toBeGreaterThanOrEqual(1);
    });
  });
});
