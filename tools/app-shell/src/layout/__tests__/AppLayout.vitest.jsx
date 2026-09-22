import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import enUS from '@/locales/en_US.json';

// ETP-5202 — resolves against the REAL en_US dictionary instead of echoing the key. The
// no-access copy is assembled with `{companyName}` substitution, and a key-echoing mock has no
// placeholder to substitute, so every "did it name the company?" assertion would pass vacuously.
// Falls back to the key so any label this file does not care about still renders something
// stable and greppable.
const LABELS = enUS.genericLabels;
vi.mock('@/i18n', () => ({
  useUI: () => (key) => LABELS[key] ?? key,
}));

// NoAccessScreen now renders a logout escape hatch (ETP-4514) via useLogout(),
// which internally calls useAuth() from AuthContext. These tests never mount
// an AuthProvider, so mock useLogout directly rather than pulling in the full
// auth context just to satisfy this one hook call.
const logoutMock = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => logoutMock,
}));

// Mock react-router-dom. useSearchParams is a vi.fn() (not a plain arrow) so
// the embedded-mode test below can override it for a single render via
// mockReturnValueOnce, the same pattern already used for useRoleMenu.
// ETP-5144: useNavigate is stubbed too, because AppLayout now mounts
// WalkthroughProvider (which navigates on the user's behalf between the steps
// of a guided flow). A module-level fn keeps its identity stable across
// renders, matching what a real router hands out.
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useLocation: () => ({ pathname: '/sales-order/123' }),
  useNavigate: () => navigateMock,
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

// AppLayout now calls useRoleMenu() (ETP-4598), which internally calls useAuth().
// These 8 existing tests are about generic AppLayout structure, not role
// filtering, so the default stub is null (its "don't filter" / pre-existing
// behavior) rather than mocking fetch + AuthContext just to exercise the real
// implementation. It's a vi.fn() (not a plain arrow) so the loading-state test
// below can override it for a single render via mockReturnValueOnce.
vi.mock('@/hooks/useRoleMenu.js', () => ({
  useRoleMenu: vi.fn(() => null),
}));

// ETP-5202 — NoAccessScreen now offers to switch company, so it mounts
// useEnvironmentSwitch(). The real hook fetches /sws/go/environments and reads the platform
// token out of localStorage; what is under test here is the screen, not the hook (that one has
// its own suite in src/hooks/__tests__/useEnvironmentSwitch.vitest.jsx). The default return is
// an account with nowhere else to go, which is what every pre-existing test in this file
// assumes, so none of them change behaviour.
const switchToMock = vi.fn();
const useEnvironmentSwitchMock = vi.fn(() => ({
  environments: [],
  switchTo: switchToMock,
  switching: null,
  currentClientId: 'CLIENT-CURRENT',
}));
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => useEnvironmentSwitchMock(),
}));

// ETP-4576 — NoAccessScreen's role list now comes from the session (`useAuthOptional()?.roleList`)
// rather than from `sf_auth_rolelist` in localStorage. That key is in LEGACY_AUTH_KEYS, so
// `purgeLegacyAuthStorage` deletes it and the read answered "[]" for every user: `hasRole` was
// permanently false and the screen told everyone nobody had assigned them a role, including the
// user whose role simply grants no window — the one distinction it exists to make.
//
// These tests mount no AuthProvider, so the optional hook answers `undefined` on its own; this
// mock is what lets a case declare the session it is describing. `importOriginal` rather than a
// bare object: this barrel also publishes `apiFetch` and the header builders, and replacing it
// wholesale would take out every other module in the tree that reaches them.
const useAuthOptionalMock = vi.fn(() => null);
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => useAuthOptionalMock(),
}));

// ETP-5240 — AppLayout now also calls useWindowAccessSafe() (alongside the
// pre-existing useCapabilitiesSafe()) and threads its return value through to
// filterMenuGroupsByAccess() as the 4th arg. Both are `vi.fn()`s (not plain
// arrows) so the dedicated test below can override useWindowAccessSafe's
// return value for a single render via mockReturnValueOnce, the same pattern
// already used for useRoleMenu above. Default `{}` matches the real hook's
// own fallback (no AuthProvider / not-yet-loaded), so none of the other tests
// in this file — which never set accessWindowId on any item — change behavior.
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: vi.fn(() => ({})),
  useWindowAccessSafe: vi.fn(() => ({})),
}));

// ETP-5364 — AppLayout now MOUNTS FirstStepsProvider itself (above the allowedIds gate, so the
// checklist GET starts alongside SFListMenu instead of after it) and threads
// `useFirstStepsProgressOptional()?.dismissed` into filterMenuGroupsByAccess as the 5th arg.
// Both are stubbed here for the same reason useAccountIdentity is: the real provider calls
// useApiFetch/useAuthOptional and useTenantPlan, none of which this file's tree provides. The
// provider stub is a pass-through, so what is asserted is that AppLayout WRAPS its tree in it.
// Default `{ dismissed: false }` = "loaded, not dismissed", which leaves every other test in
// this file unchanged — none of them declares hideWhenFirstStepsDismissed on an item.
const useFirstStepsProgressOptionalMock = vi.fn(() => ({ dismissed: false }));
vi.mock('@/pages/first-steps/FirstStepsContext.jsx', () => ({
  FirstStepsProvider: ({ children }) => <div data-testid="first-steps-provider">{children}</div>,
  useFirstStepsProgressOptional: () => useFirstStepsProgressOptionalMock(),
}));

// Same situation as useRoleMenu above: AppLayout now mounts useAccountIdentity()
// (ETP-4693) to resolve the account flags are targeted on, and that hook calls
// useAuth(). Rendering AppLayout without an AuthProvider therefore throws, so the
// hook is stubbed here. What AppLayout owes the feature is that it MOUNTS the
// hook inside the authenticated shell — asserted below — not that the hook works;
// that belongs to the hook's own tests.
vi.mock('@/lib/flags/useAccountIdentity.js', () => ({
  useAccountIdentity: vi.fn(),
}));

// ETP-5402 QA follow-up — AppLayout now fires its own fetchMyReportAccess() call (not routed
// through useAuth()/AuthContext, unlike capabilities/windowAccess above) to feed
// filterMenuGroupsByAccess's report-access fallback. Left unmocked, the real (unmocked) fetch
// runs against jsdom's absent network and its rejection can surface as an unhandled rejection on
// a LATER test in this file — mocking it keeps every test in this file deterministic.
vi.mock('@/lib/rolesApi.js', () => ({
  fetchMyReportAccess: vi.fn(() => Promise.resolve({ reportAccess: {} })),
}));

// Mock layout components. menuGroups is rendered (serialized) so tests can
// assert on what AppLayout actually passed down after filtering, not just
// that SideMenu rendered.
vi.mock('@/components/layout/SideMenu', () => ({
  default: ({ expanded, menuGroups }) => (
    <div data-testid="side-menu" data-expanded={String(expanded)}>
      SideMenu
      <div data-testid="side-menu-groups">{JSON.stringify(menuGroups)}</div>
    </div>
  ),
}));

vi.mock('@/components/layout/SidebarContext', () => ({
  SidebarProvider: ({ children }) => <div data-testid="sidebar-provider">{children}</div>,
  useSidebar: () => ({ expanded: true, toggle: vi.fn() }),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  FavoritesProvider: ({ children }) => <div data-testid="favorites-provider">{children}</div>,
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  PageMetaProvider: ({ children }) => <div data-testid="page-meta-provider">{children}</div>,
  usePageMeta: () => ({
    title: 'Test',
    breadcrumb: 'Test',
    onBack: vi.fn(),
  }),
}));

vi.mock('@/components/layout/TopBar', () => ({
  default: ({ title }) => <div data-testid="top-bar">{title}</div>,
}));

vi.mock('@/components/CommandPalette.jsx', () => ({
  CommandPalette: () => <div data-testid="command-palette">CommandPalette</div>,
}));

vi.mock('@/components/CopilotContext', () => ({
  CopilotProvider: ({ children }) => <div data-testid="copilot-provider">{children}</div>,
}));

vi.mock('@/components/CopilotWidget', () => ({
  CopilotWidget: () => <div data-testid="copilot-widget">CopilotWidget</div>,
}));

vi.mock('@/components/CurrentWindowContext', () => ({
  CurrentWindowProvider: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/support/SupportChatContext.jsx', () => ({
  SupportChatProvider: ({ children }) => <div data-testid="support-chat-provider">{children}</div>,
  useSupportChat: () => ({
    state: { isOpen: false, unreadCount: 0 },
    actions: { open: vi.fn(), close: vi.fn() },
  }),
}));

vi.mock('@/components/support/SupportChatWidget.jsx', () => ({
  SupportChatWidget: () => <div data-testid="support-chat-widget">SupportChatWidget</div>,
}));

// ETP-5202 — the company switcher on the blocking screen is a Radix dropdown. Radix needs
// pointer APIs jsdom does not implement, so the primitives are replaced with the same
// always-mounted stand-ins SideMenu's suite already uses. `DropdownMenuItem` becomes a real
// <button> rather than a <div>: `disabled` has to be a genuine attribute for `toBeDisabled()`
// to mean anything, and a disabled button is exactly what must not fire `onSelect`.
vi.mock('@/components/ui/dropdown-menu.jsx', async () => {
  const React = await import('react');
  return {
    DropdownMenu: ({ children }) => <>{children}</>,
    DropdownMenuTrigger: React.forwardRef(({ children, asChild }, ref) => (
      asChild && React.isValidElement(children)
        ? React.cloneElement(children, { ref })
        : <div ref={ref}>{children}</div>
    )),
    DropdownMenuContent: ({ children }) => <div data-testid="no-access-company-menu">{children}</div>,
    DropdownMenuItem: ({ children, onSelect, disabled, ...props }) => (
      <button type="button" disabled={disabled} onClick={onSelect} {...props}>{children}</button>
    ),
  };
});

vi.mock('@/components/webmcp/WebMcpEtendoGoTools.jsx', () => ({
  WebMcpEtendoGoTools: () => <div data-testid="webmcp-agent-tools" />,
}));

import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import { useAccountIdentity } from '@/lib/flags/useAccountIdentity.js';
import { useCapabilitiesSafe, useWindowAccessSafe } from '@/hooks/useCapabilitiesSafe.js';
import { buildMenuGroups } from '@/windows/registry.js';
import { defaultNavigation, expectedNavigation, navigationPermissions, expectNavigation } from '@/windows/__tests__/navigationExpectations.js';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '../AppLayout.jsx';

describe('AppLayout — normal mode', () => {
  const defaultProps = {
    menuGroups: [{ label: 'Sales', items: [] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('mounts the account-identity hook, so flag targeting can resolve', () => {
    render(<AppLayout {...defaultProps} />);
    // The hook has to run inside the authenticated shell: until it resolves,
    // flags target the ERP admin username, which the backend never sees.
    expect(useAccountIdentity).toHaveBeenCalled();
  });

  it('renders SideMenu when not embedded', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('side-menu')).toBeInTheDocument();
  });

  it('renders TopBar when not embedded', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('top-bar')).toBeInTheDocument();
  });

  it('renders CommandPalette when not embedded', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('renders CopilotWidget when not embedded', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('copilot-widget')).toBeInTheDocument();
  });

  it('wraps content in providers', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('copilot-provider')).toBeInTheDocument();
    expect(screen.getByTestId('favorites-provider')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-provider')).toBeInTheDocument();
    expect(screen.getByTestId('page-meta-provider')).toBeInTheDocument();
  });

  it('renders the Outlet for child routes', () => {
    render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('applies margin-left based on expanded sidebar width (240px)', () => {
    const { container } = render(<AppLayout {...defaultProps} />);
    const mainDiv = container.querySelector('[style*="margin-left"]');
    expect(mainDiv).not.toBeNull();
    expect(mainDiv.style.marginLeft).toBe('240px');
  });

  it('renders AppLayoutLoading (not SideMenu/Outlet/menu groups) while useRoleMenu is loading (undefined), instead of the FOUC full-then-shrink behavior', () => {
    // ETP-5395 regression test: while the SFListMenu fetch is in flight,
    // useRoleMenu() returns undefined (not null). AppLayout must render the
    // blank AppLayoutLoading placeholder instead of the sidebar/Outlet tree —
    // filterMenuGroupsByAccess's stand-in empty Set only hides windowId-bearing
    // items, so an id-less item (like "dashboard" below) would otherwise still
    // slip through and become reachable before the real allowed-id Set arrives.
    vi.mocked(useRoleMenu).mockReturnValueOnce(undefined);

    const props = {
      menuGroups: [
        {
          group: 'Sales',
          items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }],
        },
        { group: 'Favorites', items: [] },
        {
          group: 'Tools',
          // No windowId/processId/obuiappProcessId — never filtered, per
          // filterMenuGroupsByAccess's own contract, yet still must not render.
          items: [{ name: 'dashboard', label: 'Dashboard' }],
        },
      ],
    };

    render(<AppLayout {...props} />);

    expect(screen.getByTestId('AppLayoutLoading__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('passes menuGroups through UNFILTERED when useRoleMenu resolves to null (fail-open contract, asserted explicitly rather than relying on the default mock value)', () => {
    // Explicit override (even though the module mock's default is already
    // `null`) so this fail-open behavior is a named, intentional assertion —
    // not an accident of the shared default across the other 8 tests in
    // this file.
    vi.mocked(useRoleMenu).mockReturnValueOnce(null);

    const props = {
      menuGroups: [
        {
          group: 'Sales',
          items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }],
        },
      ],
    };

    render(<AppLayout {...props} />);

    const groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    const sales = groups.find((g) => g.group === 'Sales');
    expect(sales).toBeDefined();
    expect(sales.items.map((i) => i.name)).toContain('sales-order');
  });

  it('threads useWindowAccessSafe()\'s return value through to filterMenuGroupsByAccess as the 4th arg (ETP-5240)', () => {
    // Default mock (see useCapabilitiesSafe.js mock above) is `{}`, so an
    // accessWindowId-gated item is hidden until this test overrides it.
    const props = {
      menuGroups: [
        {
          group: 'Reports',
          items: [{ name: 'report-viewer-finance', label: 'Informes', accessWindowId: 'AW1' }],
        },
      ],
    };

    const { rerender } = render(<AppLayout {...props} />);
    let groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    // windowAccess is the default {} -> item is hidden, group dropped.
    expect(groups.find((g) => g.group === 'Reports')).toBeUndefined();

    vi.mocked(useWindowAccessSafe).mockReturnValueOnce({ AW1: 'full' });
    rerender(<AppLayout {...props} />);
    groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    const reports = groups.find((g) => g.group === 'Reports');
    expect(reports).toBeDefined();
    expect(reports.items.map((i) => i.name)).toContain('report-viewer-finance');
  });

  it('threads the checklist dismissal through to filterMenuGroupsByAccess as the 5th arg (ETP-5364)', () => {
    const props = {
      menuGroups: [
        {
          group: 'First Steps',
          items: [{ name: 'first-steps', label: 'Primeros pasos', hideWhenFirstStepsDismissed: true }],
        },
      ],
    };

    const { rerender } = render(<AppLayout {...props} />);
    let groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    // Default mock is `{ dismissed: false }` -> the entry is offered.
    expect(groups.find((g) => g.group === 'First Steps')).toBeDefined();

    useFirstStepsProgressOptionalMock.mockReturnValueOnce({ dismissed: true });
    rerender(<AppLayout {...props} />);
    groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    expect(groups.find((g) => g.group === 'First Steps')).toBeUndefined();
  });

  it('hides the entry while the checklist state is still unknown (ETP-5364)', () => {
    // THE REGRESSION TEST for "aparece brevemente y luego se oculta". Before the fix the
    // provider was mounted BELOW the allowedIds gate, so its GET could not start until the
    // sidebar was already painting and `dismissed` was necessarily unanswered on that first
    // render. Whatever the timing, an unanswered state must not put the entry on screen.
    useFirstStepsProgressOptionalMock.mockReturnValueOnce(null);
    render(<AppLayout menuGroups={[
      { group: 'First Steps', items: [{ name: 'first-steps', hideWhenFirstStepsDismissed: true }] },
      { group: 'Home', items: [{ name: 'dashboard' }] },
    ]} />);

    const groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    expect(groups.find((g) => g.group === 'First Steps')).toBeUndefined();
    // ...and Home is never collateral damage.
    expect(groups.find((g) => g.group === 'Home')).toBeDefined();
  });
});

describe('AppLayout — loading gate (ETP-5395)', () => {
  const defaultProps = {
    menuGroups: [{ group: 'Sales', items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AppLayoutLoading and does not mount SideMenu or Outlet while allowedIds is undefined', () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(undefined);

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('AppLayoutLoading__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();
  });
});

describe('AppLayout shipped permission-anchor menu (ETP-5240)', () => {
  const anchors = defaultNavigation.filter(entry => entry.accessWindowId).map(entry => [entry.name, entry.accessWindowId]);

  beforeEach(() => {
    vi.mocked(useRoleMenu).mockReturnValue(undefined);
    vi.mocked(useCapabilitiesSafe).mockReturnValue({});
    vi.mocked(useWindowAccessSafe).mockReturnValue({});
  });

  afterEach(() => {
    vi.mocked(useRoleMenu).mockReturnValue(null);
    vi.mocked(useCapabilitiesSafe).mockReturnValue({});
    vi.mocked(useWindowAccessSafe).mockReturnValue({});
  });

  function expectSidebarAnchors(visible) {
    const groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);
    const names = groups.flatMap(group => group.items.map(item => item.name));
    expect(names.filter(name => anchors.some(([anchor]) => anchor === name)).sort())
      .toEqual([...visible].sort());
    expect(names).not.toContain('report-viewer-purchases');
    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();
  }

  it.each(anchors)('%s follows loading, grant and revocation with the real menu', (name, id) => {
    const menuGroups = buildMenuGroups();
    const { rerender } = render(<AppLayout menuGroups={menuGroups} />);
    // ETP-5395 — while allowedIds is undefined (SFListMenu in flight), AppLayout
    // now renders AppLayoutLoading unconditionally and mounts nothing else, so
    // no anchor can show yet regardless of the sidebar-groups check below.
    expect(screen.getByTestId('AppLayoutLoading__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();

    // The anchor map can resolve before SFListMenu (independent axes), but the
    // loading gate still blocks rendering until allowedIds itself resolves —
    // so the grant here is not yet visible.
    vi.mocked(useWindowAccessSafe).mockReturnValue({ [id]: 'read-only' });
    rerender(<AppLayout menuGroups={menuGroups} />);
    expect(screen.getByTestId('AppLayoutLoading__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();

    // User = 108 from committed core-maps/ad-menu-cache.json. Nonempty so
    // this checks sidebar permissions, not the shell-wide no-access screen.
    vi.mocked(useRoleMenu).mockReturnValue(new Set(['108']));
    rerender(<AppLayout menuGroups={menuGroups} />);
    expectSidebarAnchors([name]);

    vi.mocked(useWindowAccessSafe).mockReturnValue({});
    rerender(<AppLayout menuGroups={menuGroups} />);
    expectSidebarAnchors([]);
  });

  it.each([{}, null])('shows all anchors for admin/client-admin with map %j', windowAccess => {
    const { allowedIds, capabilities } = navigationPermissions();
    vi.mocked(useRoleMenu).mockReturnValue(allowedIds);
    vi.mocked(useCapabilitiesSafe).mockReturnValue(capabilities);
    vi.mocked(useWindowAccessSafe).mockReturnValue(windowAccess);

    render(<AppLayout menuGroups={buildMenuGroups()} />);
    expectSidebarAnchors(anchors.map(([name]) => name));
    expectNavigation(JSON.parse(screen.getByTestId('side-menu-groups').textContent), expectedNavigation({ proof: true }));
  });
});

describe('AppLayout — no-access guard (ETP-4514)', () => {
  const defaultProps = {
    menuGroups: [{ group: 'Sales', items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a logout button on the blocking screen and calls logout on click', async () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set());
    const user = userEvent.setup();

    render(<AppLayout {...defaultProps} />);

    const logoutButton = screen.getByTestId('NoAccessScreenLogout__488148');
    expect(logoutButton).toBeInTheDocument();

    await user.click(logoutButton);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('renders the blocking NoAccessScreen (and nothing else) when useRoleMenu resolves to a confirmed empty Set', () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set());

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('NoAccessScreen__488148')).toBeInTheDocument();
    expect(screen.getByTestId('no-access-title')).toBeInTheDocument();
    expect(screen.getByTestId('no-access-message')).toBeInTheDocument();

    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('top-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('renders AppLayoutLoading — neither the blocking screen nor the sidebar/Outlet — while useRoleMenu is still loading (undefined)', () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(undefined);

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('AppLayoutLoading__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
  });

  it('does NOT render the blocking screen when useRoleMenu resolves to null (unauthenticated / fail-open)', () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(null);

    render(<AppLayout {...defaultProps} />);

    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.getByTestId('side-menu')).toBeInTheDocument();
  });

  it('does NOT render the blocking screen when useRoleMenu resolves to a non-empty Set', () => {
    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set(['800166']));

    render(<AppLayout {...defaultProps} />);

    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.getByTestId('side-menu')).toBeInTheDocument();
  });

  it('still renders the blocking screen when embedded=1 (the guard is not suppressed by embedded mode)', () => {
    // `embedded` only strips chrome (SideMenu/TopBar/CommandPalette/etc.) inside
    // AppLayoutInner — the no-access guard in AppLayout sits above that branch
    // entirely and returns NoAccessScreen unconditionally. This locks in that an
    // embedded integration (e.g. an iframe pointed at a single window) still
    // gets the block message instead of silently rendering nothing / the Outlet.
    vi.mocked(useSearchParams).mockReturnValueOnce([new URLSearchParams('embedded=1'), vi.fn()]);
    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set());

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('NoAccessScreen__488148')).toBeInTheDocument();
    expect(screen.getByTestId('no-access-title')).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('switches to the blocking screen on a re-render where useRoleMenu goes from a non-empty Set to a confirmed empty Set (role revoked mid-session)', () => {
    // useRoleMenu() only refetches on isAuthenticated changes (see useRoleMenu.js),
    // but the guard itself is a plain conditional on the hook's current return
    // value — so if ANY re-render sees the Set shrink to empty (revoked role,
    // or a future refetch trigger), the block must replace the previous content
    // rather than leaving stale sidebar/Outlet content mounted alongside it.
    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set(['800166']));

    const { rerender } = render(<AppLayout {...defaultProps} />);
    expect(screen.getByTestId('side-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('NoAccessScreen__488148')).not.toBeInTheDocument();

    vi.mocked(useRoleMenu).mockReturnValueOnce(new Set());
    rerender(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('NoAccessScreen__488148')).toBeInTheDocument();
    expect(screen.queryByTestId('side-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });
});

/**
 * ETP-5202 — the way OUT of the no-access screen.
 *
 * Reaching this screen used to end the session's usefulness entirely: logout was the only
 * button, so a user whose role grants no windows in THIS tenant could not reach another company
 * of their own account, nor their account at all. Accepting an invitation lands people here
 * routinely — an invited user has no role until an admin assigns one (ETP-4830).
 *
 * This is NOT the same condition the `roleList` guard in useEnvironmentSwitch prevents, and the
 * two are not redundant: `roleList: []` is "I hold no role at all" and is refused BEFORE
 * entering, while this is "I hold a role that grants no window", which is only knowable AFTER
 * entering, when useRoleMenu answers with an empty Set. Prevention cannot cover it; an exit can.
 *
 * ETP-4514's "no menu/windows reachable" criterion is untouched by these tests on purpose: the
 * pre-existing cases below already assert the sidebar and Outlet stay unmounted, and switching
 * company is a platform action authorised by the account token rather than by the role that
 * grants nothing here.
 */
describe('AppLayout — no-access company switch (ETP-5202)', () => {
  const defaultProps = {
    menuGroups: [{ group: 'Sales', items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }] }],
  };

  const CURRENT = { clientId: 'CLIENT-CURRENT', clientName: 'Current Corp', orgName: 'Main Org' };
  const OTHER = { clientId: 'CLIENT-OTHER', clientName: 'Other Corp', orgName: 'Main Org' };

  /** `mockReturnValue`, not `…Once`: a click re-renders, and the screen must survive it. */
  function blockAccess() {
    vi.mocked(useRoleMenu).mockReturnValue(new Set());
  }

  function withEnvironments(environments, overrides = {}) {
    useEnvironmentSwitchMock.mockReturnValue({
      environments,
      switchTo: switchToMock,
      switching: null,
      currentClientId: 'CLIENT-CURRENT',
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRoleMenu).mockReturnValue(null);
    // `clearAllMocks` clears calls, not implementations, so a `mockReturnValue` left by another
    // describe would survive into these cases. Reset to "no session", which is what a tree with no
    // AuthProvider really answers.
    useAuthOptionalMock.mockReturnValue(null);
    withEnvironments([]);
  });

  it('lists the account companies, with the current one shown but not selectable', () => {
    blockAccess();
    // ETP-4576 — the trigger's "Current Corp" is read off the environment list below, matched on
    // `currentClientId`. It used to be seeded here through `sf_auth_client_name`, a legacy key the
    // purge deletes, so the trigger was really rendering the `yourCompany` fallback.
    withEnvironments([CURRENT, OTHER]);

    render(<AppLayout {...defaultProps} />);

    const block = screen.getByTestId('no-access-company-switch');
    // `toHaveTextContent` rather than `getByText`: the label is rendered twice, as the block's
    // own heading and again as the menu's label, and pinning the count here would freeze a
    // duplication this test has no opinion about.
    expect(block).toHaveTextContent(LABELS.switchCompany);
    // The trigger doubles as the answer to "which company am I stuck in?", which this screen
    // otherwise never says.
    expect(screen.getByTestId('no-access-company-trigger')).toHaveTextContent('Current Corp');

    expect(screen.getByTestId('no-access-company-CLIENT-OTHER')).toHaveTextContent('Other Corp');
    // The current tenant stays listed so the menu also reads as "where am I?", but choosing it
    // would be a destination that changes nothing.
    expect(screen.getByTestId('no-access-company-CLIENT-CURRENT')).toBeDisabled();
    expect(screen.getByTestId('no-access-company-CLIENT-OTHER')).not.toBeDisabled();
    // The escape hatch this screen already had must not be displaced by the new one.
    expect(screen.getByTestId('NoAccessScreenLogout__488148')).toBeInTheDocument();
  });

  it('switches to the chosen company', async () => {
    blockAccess();
    withEnvironments([CURRENT, OTHER]);
    const user = userEvent.setup();

    render(<AppLayout {...defaultProps} />);
    await user.click(screen.getByTestId('no-access-company-CLIENT-OTHER'));

    expect(switchToMock).toHaveBeenCalledTimes(1);
    expect(switchToMock).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'CLIENT-OTHER' }));
  });

  it('does not switch when the current company is chosen', async () => {
    blockAccess();
    withEnvironments([CURRENT, OTHER]);
    const user = userEvent.setup();

    render(<AppLayout {...defaultProps} />);
    await user.click(screen.getByTestId('no-access-company-CLIENT-CURRENT'));

    // A no-op switch would still be a full page reload back to the same dead end.
    expect(switchToMock).not.toHaveBeenCalled();
  });

  // The backend returns one environment PER ORGANIZATION, so a client with several orgs arrives
  // several times over. Listing it once per org would present the same destination repeatedly,
  // each entry indistinguishable from the next.
  it('shows a single multi-org company as nowhere to go, not as several destinations', () => {
    blockAccess();
    withEnvironments([
      { clientId: 'CLIENT-CURRENT', clientName: 'Current Corp', orgName: 'Org A' },
      { clientId: 'CLIENT-CURRENT', clientName: 'Current Corp', orgName: 'Org B' },
    ]);

    render(<AppLayout {...defaultProps} />);

    expect(screen.queryByTestId('no-access-company-switch')).not.toBeInTheDocument();
  });

  it('lists a multi-org company once', () => {
    blockAccess();
    withEnvironments([
      CURRENT,
      { clientId: 'CLIENT-OTHER', clientName: 'Other Corp', orgName: 'Org A' },
      { clientId: 'CLIENT-OTHER', clientName: 'Other Corp', orgName: 'Org B' },
    ]);

    render(<AppLayout {...defaultProps} />);

    expect(screen.getAllByTestId('no-access-company-CLIENT-OTHER')).toHaveLength(1);
    expect(screen.getAllByText('Other Corp')).toHaveLength(1);
    // …and the deduplication must not have swallowed the other entries with it.
    expect(screen.getByTestId('no-access-company-CLIENT-CURRENT')).toBeInTheDocument();
  });

  it('hides the whole block when the account owns nowhere else to go', () => {
    blockAccess();
    withEnvironments([CURRENT]);

    render(<AppLayout {...defaultProps} />);

    // Asserted on the block and the trigger, never on the items: the render condition moved
    // from "are there other companies?" to `canSwitch`, and the two agree only while the
    // deduplication holds — a single company arriving once per organization must not look like
    // somewhere to go.
    expect(screen.queryByTestId('no-access-company-switch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-access-company-trigger')).not.toBeInTheDocument();
    expect(screen.queryByText(LABELS.switchCompany)).not.toBeInTheDocument();
    // The screen is otherwise exactly the one that shipped with ETP-4514.
    expect(screen.getByTestId('no-access-title')).toBeInTheDocument();
    expect(screen.getByTestId('no-access-message')).toBeInTheDocument();
    expect(screen.getByTestId('NoAccessScreenLogout__488148')).toBeInTheDocument();
  });

  // An account with no platform token cannot list environments at all, so the hook answers
  // with an empty array. Same outcome as owning a single company, reached differently.
  it('hides the whole block when the environments cannot be listed', () => {
    blockAccess();
    withEnvironments([]);

    render(<AppLayout {...defaultProps} />);

    expect(screen.queryByTestId('no-access-company-switch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-access-company-trigger')).not.toBeInTheDocument();
    expect(screen.getByTestId('NoAccessScreenLogout__488148')).toBeInTheDocument();
  });

  // Switching is a hard page load. Leaving the entries live would let an impatient user start a
  // second switch over the first.
  it('disables every company while a switch is in flight, and spins on the one being opened', () => {
    blockAccess();
    withEnvironments(
      [CURRENT, OTHER, { clientId: 'CLIENT-THIRD', clientName: 'Third Corp' }],
      { switching: 'CLIENT-OTHER' }
    );

    render(<AppLayout {...defaultProps} />);

    // The trigger is the only thing visible with the menu shut, so it carries its own spinner —
    // otherwise a switch started and then collapsed looks like a dead screen.
    const trigger = screen.getByTestId('no-access-company-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger.querySelector('.animate-spin')).not.toBeNull();

    expect(screen.getByTestId('no-access-company-CLIENT-OTHER')).toBeDisabled();
    expect(screen.getByTestId('no-access-company-CLIENT-THIRD')).toBeDisabled();
    // Inside the menu the spinner marks WHICH one is opening; without it, three dimmed entries
    // say nothing.
    expect(
      screen.getByTestId('no-access-company-CLIENT-OTHER').querySelector('.animate-spin')
    ).not.toBeNull();
    expect(
      screen.getByTestId('no-access-company-CLIENT-THIRD').querySelector('.animate-spin')
    ).toBeNull();
  });

  // The switch belongs to the blocking screen alone: a user with access has the sidebar's own
  // switcher, and rendering a second one there would be a stray duplicate.
  it('is absent when the role does grant access', () => {
    vi.mocked(useRoleMenu).mockReturnValue(new Set(['800166']));
    withEnvironments([CURRENT, OTHER]);

    render(<AppLayout {...defaultProps} />);

    expect(screen.queryByTestId('no-access-company-switch')).not.toBeInTheDocument();
    expect(screen.getByTestId('side-menu')).toBeInTheDocument();
  });
});

/**
 * ETP-5202 — what the blocking screen SAYS.
 *
 * "No access / contact your administrator" was true and useless: it named nothing and asked for
 * nothing specific. Worse, an empty `allowedIds` has two causes that look identical from here
 * and need DIFFERENT things from an administrator — no role assigned at all (the invited user:
 * they belong to the company, nobody has given them a role yet) versus a role that grants no
 * window. Telling the first user "your role has no permissions" sends them to ask for the wrong
 * thing, and they have no way to tell that the screen guessed.
 *
 * The session's own role list is what tells the two apart.
 *
 * ETP-4576 — it used to be read out of `sf_auth_rolelist`, and the company name out of
 * `sf_auth_client_name`. Both are legacy auth keys that `purgeLegacyAuthStorage` deletes on mount,
 * so the reads answered "[]" and "": `hasRole` was permanently false and EVERY user got the
 * no-role sentence, which is the guess this screen exists not to make — and the company name was
 * always the generic fallback. The screen now takes the role list from the session and the company
 * name from the environment list `useEnvironmentSwitch` already loads, so these cases drive both
 * through those, and one of them seeds the dead keys to prove they are ignored.
 */
describe('AppLayout — no-access explanation (ETP-5202, ETP-4576)', () => {
  const defaultProps = {
    menuGroups: [{ group: 'Sales', items: [{ name: 'sales-order', label: 'Sales Order', windowId: '800166' }] }],
  };

  const ACME = { clientId: 'CLIENT-CURRENT', clientName: 'Acme Corp', orgName: 'Main Org' };

  /** The session the screen reads its role list from. `null` is a tree with no AuthProvider. */
  function withSession(session) {
    useAuthOptionalMock.mockReturnValue(session);
  }

  function withEnvironments(environments) {
    useEnvironmentSwitchMock.mockReturnValue({
      environments,
      switchTo: switchToMock,
      switching: null,
      currentClientId: 'CLIENT-CURRENT',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
    vi.mocked(useRoleMenu).mockReturnValue(new Set());
    withSession(null);
    withEnvironments([ACME]);
  });

  it('says the role grants nothing when the session holds a role', () => {
    withSession({ roleList: [{ id: 'ROLE-1', name: 'Sales' }] });

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessRoleTitle);
    const message = screen.getByTestId('no-access-message');
    expect(message).toHaveTextContent('Acme Corp');
    // A placeholder that reaches the screen is worse than no company name at all.
    expect(message.textContent).not.toContain('{companyName}');
    // The two branches must not be confusable: this user HAS a role, and telling them otherwise
    // sends them to ask an administrator for the wrong thing.
    expect(screen.getByTestId('no-access-title')).not.toHaveTextContent(LABELS.noAccessNoRoleTitle);
  });

  it('says no role has been assigned when the session holds none', () => {
    withSession({ roleList: undefined });

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessNoRoleTitle);
    const message = screen.getByTestId('no-access-message');
    expect(message).toHaveTextContent('Acme Corp');
    // This branch's copy names the company TWICE, so `String.replace(string, …)` — which
    // substitutes only the FIRST occurrence — left a literal `{companyName}` on screen. Both
    // halves are asserted: the count catches a plain `replace` sneaking back in even if the
    // second mention were dropped from the copy, and the placeholder check catches it even if
    // the count assertion were relaxed.
    expect(message.textContent.split('Acme Corp')).toHaveLength(3);
    expect(message.textContent).not.toContain('{companyName}');
  });

  it('treats an empty role list as no role', () => {
    withSession({ roleList: [] });

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessNoRoleTitle);
  });

  // The screen mounts in a tree that may have no AuthProvider above it, so the optional hook
  // answers `undefined`. Reading `.roleList` off that without the guard throws and takes the whole
  // blocking screen down — replacing "you have no access" with a blank page.
  it('survives having no session at all and falls back to no role', () => {
    withSession(null);

    expect(() => render(<AppLayout {...defaultProps} />)).not.toThrow();

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessNoRoleTitle);
    expect(screen.getByTestId('no-access-message')).toHaveTextContent('Acme Corp');
  });

  // A role list that is not an array (a bare object, a string, a number) is as unusable as none.
  // The session is decoded from a JWT the backend sent, so its shape is not this screen's to trust.
  it('falls back to no role when the session role list is not an array', () => {
    withSession({ roleList: { id: 'ROLE-1' } });

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessNoRoleTitle);
  });

  // THE regression, stated directly: the dead keys are seeded with values that contradict the
  // session, and the screen must follow the session. Before ETP-4576 this test would have read
  // both of them and produced the no-role sentence for a user who holds a role.
  it('ignores the legacy storage keys entirely, even when they say otherwise', () => {
    globalThis.localStorage.setItem('sf_auth_client_name', 'Stale Corp');
    globalThis.localStorage.setItem('sf_auth_rolelist', '[]');
    withSession({ roleList: [{ id: 'ROLE-1', name: 'Sales' }] });

    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('no-access-title')).toHaveTextContent(LABELS.noAccessRoleTitle);
    const message = screen.getByTestId('no-access-message');
    expect(message).toHaveTextContent('Acme Corp');
    expect(message.textContent).not.toContain('Stale Corp');
  });

  // The company name is resolved by matching `currentClientId` against the list, not by taking the
  // first entry: an account in several companies would otherwise be told it is stuck in whichever
  // one the backend happened to return first.
  it('names the company the session is actually in, not the first one listed', () => {
    withEnvironments([
      { clientId: 'CLIENT-OTHER', clientName: 'Other Corp', orgName: 'Main Org' },
      ACME,
    ]);
    withSession({ roleList: [{ id: 'ROLE-1' }] });

    render(<AppLayout {...defaultProps} />);

    const message = screen.getByTestId('no-access-message');
    expect(message).toHaveTextContent('Acme Corp');
    expect(message.textContent).not.toContain('Other Corp');
  });

  // Without the list — the account cannot list environments, or the current client is not in it —
  // the sentence still has to read as a sentence.
  it('falls back to the generic company wording when the current company is not listed', () => {
    withEnvironments([]);
    withSession({ roleList: [{ id: 'ROLE-1' }] });

    render(<AppLayout {...defaultProps} />);

    const message = screen.getByTestId('no-access-message');
    expect(message).toHaveTextContent(LABELS.yourCompany);
    expect(message.textContent).not.toContain('{companyName}');
  });
});
