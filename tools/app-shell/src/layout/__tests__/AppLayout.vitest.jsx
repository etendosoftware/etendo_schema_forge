import { render, screen } from '@testing-library/react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useLocation: () => ({ pathname: '/sales-order/123' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

// Mock layout components
vi.mock('@/components/layout/SideMenu', () => ({
  default: ({ expanded }) => (
    <div data-testid="side-menu" data-expanded={String(expanded)}>SideMenu</div>
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
});
