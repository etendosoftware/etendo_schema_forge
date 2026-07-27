import { render, screen } from '@testing-library/react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useLocation: () => ({ pathname: '/sales-order/123' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
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

// Same situation as useRoleMenu above: AppLayout now mounts useAccountIdentity()
// (ETP-4693) to resolve the account flags are targeted on, and that hook calls
// useAuth(). Rendering AppLayout without an AuthProvider therefore throws, so the
// hook is stubbed here. What AppLayout owes the feature is that it MOUNTS the
// hook inside the authenticated shell — asserted below — not that the hook works;
// that belongs to the hook's own tests.
vi.mock('@/lib/flags/useAccountIdentity.js', () => ({
  useAccountIdentity: vi.fn(),
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

import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import { useAccountIdentity } from '@/lib/flags/useAccountIdentity.js';
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

  it('filters menuGroups to empty (fail-closed) while useRoleMenu is loading (undefined), instead of the FOUC full-then-shrink behavior', () => {
    // ETP-4598 regression test: while the SFListMenu fetch is in flight,
    // useRoleMenu() returns undefined (not null). AppLayout must treat that
    // as "filter to nothing yet" so SideMenu never briefly renders the full,
    // unfiltered menu before the real allowed-id Set arrives.
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
          // filterMenuGroupsByAccess's own contract.
          items: [{ name: 'dashboard', label: 'Dashboard' }],
        },
      ],
    };

    render(<AppLayout {...props} />);

    const groups = JSON.parse(screen.getByTestId('side-menu-groups').textContent);

    // Sales had a windowId-bearing item and no allowed ids yet -> emptied,
    // and (being non-Favorites) dropped entirely.
    expect(groups.find((g) => g.group === 'Sales')).toBeUndefined();
    // Favorites always survives even while empty.
    expect(groups.find((g) => g.group === 'Favorites')).toBeDefined();
    // Tools has no windowId on its item, so it's never filtered out.
    const tools = groups.find((g) => g.group === 'Tools');
    expect(tools).toBeDefined();
    expect(tools.items).toHaveLength(1);
    expect(tools.items[0].name).toBe('dashboard');
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
});
