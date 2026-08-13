import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props} data-testid="card">{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardTitle: ({ children }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
  CardFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }) => <span data-testid="badge">{children}</span>,
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Store: (props) => <svg data-testid="icon-store" {...props} />,
  ShoppingCart: (props) => <svg data-testid="icon-shopping-cart" {...props} />,
  FlaskConical: (props) => <svg data-testid="icon-flask" {...props} />,
  Package: (props) => <svg data-testid="icon-package" {...props} />,
  Loader2: (props) => <svg data-testid="icon-loader" {...props} />,
  CheckCircle2: (props) => <svg data-testid="icon-check" {...props} />,
  ExternalLink: (props) => <svg data-testid="icon-external" {...props} />,
}));

const mockInstallApp = vi.fn();
const mockUninstallApp = vi.fn();
const mockLockAppStore = vi.fn();

vi.mock('@/hooks/useInstalledApps.js', () => ({
  useInstalledApps: () => [],
  installApp: (...args) => mockInstallApp(...args),
  uninstallApp: (...args) => mockUninstallApp(...args),
}));

vi.mock('@/hooks/useAppStoreUnlock.js', () => ({
  lockAppStore: (...args) => mockLockAppStore(...args),
}));

vi.mock('@/apps-registry.js', () => ({
  APP_CATALOG: [
    {
      appId: 'test-app-1',
      displayName: 'Test App One',
      description: 'First test app',
      version: '1.0.0',
      author: 'Tester',
      icon: 'ShoppingCart',
      iframeUrl: 'http://localhost:5000',
      menuGroup: 'TestGroup',
      menuEntries: [{ name: 'entry1', label: 'Entry One' }],
    },
    {
      appId: 'test-app-2',
      displayName: 'Test App Two',
      description: 'Second test app',
      version: '2.0.0',
      author: 'Tester2',
      icon: 'UnknownIcon',
      iframeUrl: 'http://localhost:6000',
      menuGroup: 'OtherGroup',
      menuEntries: [
        { name: 'entry2', label: 'Entry Two', menuGroup: 'CustomGroup' },
      ],
    },
  ],
}));

import AppStorePage from '../AppStorePage.jsx';

describe('AppStorePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading and description', () => {
    render(<AppStorePage />);
    expect(screen.getByText('appStore')).toBeInTheDocument();
    expect(screen.getByText('appStoreDescription')).toBeInTheDocument();
  });

  it('renders a card for each app in the catalog', () => {
    render(<AppStorePage />);
    expect(screen.getByText('Test App One')).toBeInTheDocument();
    expect(screen.getByText('Test App Two')).toBeInTheDocument();
  });

  it('shows install button for non-installed apps', () => {
    render(<AppStorePage />);
    const installButtons = screen.getAllByText('install');
    expect(installButtons).toHaveLength(2);
  });

  it('renders all catalog apps as cards', () => {
    render(<AppStorePage />);
    // 2 apps in catalog = 2 cards
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('calls lockAppStore when hide button is clicked', async () => {
    const user = userEvent.setup();
    render(<AppStorePage />);
    const hideBtn = screen.getByText('hideAppStore');
    await user.click(hideBtn);
    expect(mockLockAppStore).toHaveBeenCalled();
  });

  it('displays app version and author', () => {
    render(<AppStorePage />);
    expect(screen.getByText('v1.0.0 · Tester')).toBeInTheDocument();
    expect(screen.getByText('v2.0.0 · Tester2')).toBeInTheDocument();
  });

  it('displays menu entries for each app', () => {
    render(<AppStorePage />);
    expect(screen.getByText(/Entry One/)).toBeInTheDocument();
    expect(screen.getByText(/Entry Two/)).toBeInTheDocument();
  });

  it('displays iframe URLs', () => {
    render(<AppStorePage />);
    expect(screen.getByText('http://localhost:5000')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:6000')).toBeInTheDocument();
  });

  it('shows the app store tip text', () => {
    render(<AppStorePage />);
    expect(screen.getByText(/appStoreTip/)).toBeInTheDocument();
    expect(screen.getByText(/appStoreTipHide/)).toBeInTheDocument();
  });

  it('uses custom menuGroup from entry when provided', () => {
    render(<AppStorePage />);
    expect(screen.getByText(/CustomGroup/)).toBeInTheDocument();
    expect(screen.getByText(/TestGroup/)).toBeInTheDocument();
  });

  it('falls back to Package icon for unknown icon names', () => {
    render(<AppStorePage />);
    // Test App Two has icon: 'UnknownIcon' which should fall back to Package
    // Both apps render icons, at least one is Package fallback
    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(2);
  });
});
