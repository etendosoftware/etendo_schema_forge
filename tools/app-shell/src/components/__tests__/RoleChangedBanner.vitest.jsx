import { render, screen, fireEvent } from '@testing-library/react';

// ETP-5189 — RoleChangedBanner is a thin renderer over useRoleChangeNotice(); mock the hook
// directly rather than re-deriving it through a real AuthProvider, keeping this a focused unit
// test of the banner's own rendering logic (useRoleChangeNotice has its own test file).
const mockUseRoleChangeNotice = vi.fn();
vi.mock('@/hooks/useRoleChangeNotice.js', () => ({
  useRoleChangeNotice: () => mockUseRoleChangeNotice(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="icon-alert-triangle" />,
  X: () => <svg data-testid="icon-x" />,
}));

import { RoleChangedBanner } from '../RoleChangedBanner.jsx';

function roleChangeNotice(overrides = {}) {
  return { changed: false, dismiss: vi.fn(), ...overrides };
}

describe('RoleChangedBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when useRoleChangeNotice() returns changed: false', () => {
    mockUseRoleChangeNotice.mockReturnValue(roleChangeNotice({ changed: false }));

    const { container } = render(<RoleChangedBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('renders the banner (role=status, message) when useRoleChangeNotice() returns changed: true', () => {
    mockUseRoleChangeNotice.mockReturnValue(roleChangeNotice({ changed: true }));

    render(<RoleChangedBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('roleChangedBannerMessage')).toBeInTheDocument();
  });

  it('renders the InfoBanner dismiss button when the banner is shown', () => {
    mockUseRoleChangeNotice.mockReturnValue(roleChangeNotice({ changed: true }));

    render(<RoleChangedBanner />);

    expect(screen.getByTestId('info-banner-dismiss')).toBeInTheDocument();
  });

  it('calls the hook-provided dismiss() exactly once when the dismiss button is clicked', () => {
    const dismiss = vi.fn();
    mockUseRoleChangeNotice.mockReturnValue(roleChangeNotice({ changed: true, dismiss }));

    render(<RoleChangedBanner />);
    fireEvent.click(screen.getByTestId('info-banner-dismiss'));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('resolves its text through useUI() with the exact expected key', () => {
    mockUseRoleChangeNotice.mockReturnValue(roleChangeNotice({ changed: true }));

    render(<RoleChangedBanner />);

    // useUI is mocked to the identity function, so the rendered text IS the requested key —
    // asserting on it doubles as asserting the exact key name used.
    expect(screen.getByText('roleChangedBannerMessage')).toBeInTheDocument();
  });
});
