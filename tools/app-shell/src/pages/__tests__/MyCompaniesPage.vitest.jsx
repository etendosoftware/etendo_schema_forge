// @covers tools/app-shell/src/pages/MyCompaniesPage.jsx

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyCompaniesPage from '../MyCompaniesPage.jsx';

const navigateMock = vi.fn();
const switchToMock = vi.fn();
const fetchCompanyEnvironmentsMock = vi.fn();
const fetchMyInvitationsMock = vi.fn();
const createPortalSessionMock = vi.fn();
const toastErrorMock = vi.fn();
const trackViewedMock = vi.fn();
const trackEnterClickedMock = vi.fn();
const trackEnterFailedMock = vi.fn();
let environmentSwitch = {};

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

// Interpolating identity translator: a raw key shows up as itself, so an assertion on a key proves
// the component asked for it, and `{param}` values are kept visible.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: (...args) => {
    environmentSwitch.args = args;
    return {
      switchTo: switchToMock,
      switching: null,
      currentClientId: 'own-1',
      ...environmentSwitch.overrides,
    };
  },
}));

vi.mock('@/lib/myCompanies/api.js', () => ({
  fetchCompanyEnvironments: (...args) => fetchCompanyEnvironmentsMock(...args),
  fetchMyInvitations: (...args) => fetchMyInvitationsMock(...args),
}));

vi.mock('@/lib/myCompanies/telemetry.js', () => ({
  trackMyCompaniesViewed: (...args) => trackViewedMock(...args),
  trackMyCompaniesEnterClicked: (...args) => trackEnterClickedMock(...args),
  trackMyCompaniesEnterFailed: (...args) => trackEnterFailedMock(...args),
}));

vi.mock('@/lib/upgrade/api.js', () => ({
  createPortalSession: (...args) => createPortalSessionMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args) => toastErrorMock(...args) },
}));

// Render dropdown content unconditionally so the row actions can be asserted without driving
// Radix pointer events in jsdom.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled, ...props }) => (
    <button type="button" disabled={disabled} onClick={onSelect} {...props}>{children}</button>
  ),
}));

const OWNED_PRODUCTIVE = {
  clientId: 'own-1',
  clientName: 'GOClient',
  adminUserId: 'u-1',
  relationship: 'OWNER',
  plan: 'productive',
  subscriptionStatus: 'CURRENT',
  renewalDueAt: '2026-11-01T00:00:00Z',
  userCount: 4,
};
const OWNED_DEMO = {
  clientId: 'own-2',
  clientName: 'GOClient Retail',
  adminUserId: 'u-2',
  relationship: 'OWNER',
  plan: 'free',
  trialDaysRemaining: 12,
  userCount: 2,
};
const INVITED = {
  clientId: 'inv-1',
  clientName: 'Distribuciones Norte',
  adminUserId: 'u-3',
  relationship: 'INVITED',
  plan: 'free',
  ownerName: 'Laura Morat',
  roleName: 'laura personal',
  roleIsClientAdmin: false,
  roleTemplateNames: ['Finance'],
};

beforeEach(() => {
  vi.clearAllMocks();
  environmentSwitch = {};
  fetchCompanyEnvironmentsMock.mockResolvedValue([OWNED_PRODUCTIVE, OWNED_DEMO, INVITED]);
  fetchMyInvitationsMock.mockResolvedValue([]);
});

describe('MyCompaniesPage', () => {
  it('turns off the switch hook list fetch, since the page reads its own detailed list', async () => {
    render(<MyCompaniesPage />);
    await screen.findByTestId('my-companies-owned');

    expect(environmentSwitch.args).toEqual([{ enabled: false }]);
  });

  it('lists owned companies with plan, renewal and user count', async () => {
    render(<MyCompaniesPage />);

    const productive = await screen.findByTestId('my-companies-owned-own-1');
    expect(productive).toHaveTextContent('GOClient');
    expect(productive).toHaveTextContent('environmentProductive');
    expect(productive).toHaveTextContent('4');
    expect(productive).toHaveTextContent('2026');

    const demo = screen.getByTestId('my-companies-owned-own-2');
    expect(demo).toHaveTextContent('environmentDemo');
    expect(demo).toHaveTextContent('environmentTrialDaysRemaining');
    expect(screen.getByText(/myCompaniesOwnedSection · 2/)).toBeInTheDocument();
  });

  it('marks the current company and disables entering it', async () => {
    render(<MyCompaniesPage />);
    await screen.findByTestId('my-companies-owned');

    expect(screen.getByTestId('my-companies-current-own-1')).toBeInTheDocument();
    expect(screen.queryByTestId('my-companies-current-own-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('my-companies-enter-own-1')).toBeDisabled();
    expect(screen.getByTestId('my-companies-enter-own-2')).toBeEnabled();
  });

  it('enters another company through the shared environment switch', async () => {
    switchToMock.mockResolvedValue(true);
    render(<MyCompaniesPage />);

    await userEvent.click(await screen.findByTestId('my-companies-enter-own-2'));

    expect(switchToMock).toHaveBeenCalledWith(OWNED_DEMO);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(trackEnterClickedMock).toHaveBeenCalledWith(OWNED_DEMO);
    expect(trackEnterFailedMock).not.toHaveBeenCalled();
  });

  it('tells the user when a company cannot be entered', async () => {
    switchToMock.mockResolvedValue(false);
    render(<MyCompaniesPage />);

    await userEvent.click(await screen.findByTestId('my-companies-enter-inv-1'));

    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('myCompaniesEnterError'));
    expect(trackEnterClickedMock).toHaveBeenCalledWith(INVITED);
    expect(trackEnterFailedMock).toHaveBeenCalledWith(INVITED);
  });

  it('tracks the visit once, counting the companies the account can enter', async () => {
    render(<MyCompaniesPage />);
    await screen.findByTestId('my-companies-owned');

    expect(trackViewedMock).toHaveBeenCalledTimes(1);
    expect(trackViewedMock).toHaveBeenCalledWith(3);
  });

  it('lists invited companies with the translated role and the owner', async () => {
    render(<MyCompaniesPage />);

    const row = await screen.findByTestId('my-companies-invited-inv-1');
    expect(row).toHaveTextContent('Distribuciones Norte');
    expect(row).toHaveTextContent('roleNameFinance');
    expect(row).toHaveTextContent('Laura Morat');
    expect(screen.queryByTestId('my-companies-actions-inv-1')).not.toBeInTheDocument();
  });

  it('labels a client-admin role with the localized admin label', async () => {
    fetchCompanyEnvironmentsMock.mockResolvedValue([{ ...INVITED, roleIsClientAdmin: true }]);
    render(<MyCompaniesPage />);

    expect(await screen.findByTestId('my-companies-invited-inv-1')).toHaveTextContent('roleNameAdmin');
  });

  it('offers subscription management only on the productive owned company', async () => {
    render(<MyCompaniesPage />);
    await screen.findByTestId('my-companies-owned');

    expect(screen.getByTestId('my-companies-manage-own-1')).toBeInTheDocument();
    expect(screen.queryByTestId('my-companies-manage-own-2')).not.toBeInTheDocument();
  });

  it('opens the billing portal from the subscription action', async () => {
    createPortalSessionMock.mockResolvedValue({ url: 'https://billing.example/session' });
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignMock, pathname: '/' },
    });
    try {
      render(<MyCompaniesPage />);
      await userEvent.click(await screen.findByTestId('my-companies-manage-own-1'));

      await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://billing.example/session'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('reports a portal failure instead of navigating', async () => {
    createPortalSessionMock.mockRejectedValue(new Error('provider down'));
    render(<MyCompaniesPage />);

    await userEvent.click(await screen.findByTestId('my-companies-manage-own-1'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('subscriptionManageError'));
  });

  it('shows an open invitation as a notice and not as an invited row', async () => {
    fetchCompanyEnvironmentsMock.mockResolvedValue([
      OWNED_PRODUCTIVE,
      { ...INVITED, clientId: 'inv-2', clientName: 'Ferreteria Sol' },
    ]);
    fetchMyInvitationsMock.mockResolvedValue([{
      id: 'i-1',
      clientId: 'inv-2',
      clientName: 'Ferreteria Sol',
      status: 'SENT',
      invitedAt: '2026-10-11T10:00:00Z',
      inviterName: 'Marta Sol',
    }]);
    render(<MyCompaniesPage />);

    const notice = await screen.findByTestId('my-companies-invitation-i-1');
    expect(notice).toHaveTextContent('myCompaniesInvitationTitle');
    expect(notice).toHaveTextContent('Ferreteria Sol');
    expect(notice).toHaveTextContent('Marta Sol');
    expect(notice).toHaveTextContent('myCompaniesInvitationHint');
    expect(screen.queryByTestId('my-companies-invited')).not.toBeInTheDocument();
  });

  it('still lists the companies when the invitations cannot be read', async () => {
    fetchMyInvitationsMock.mockRejectedValue(new Error('boom'));
    render(<MyCompaniesPage />);

    expect(await screen.findByTestId('my-companies-owned')).toBeInTheDocument();
    expect(screen.queryByTestId('my-companies-invitations')).not.toBeInTheDocument();
  });

  it('shows a retryable error when the companies cannot be read', async () => {
    fetchCompanyEnvironmentsMock.mockRejectedValueOnce(new Error('boom'));
    render(<MyCompaniesPage />);

    await userEvent.click(await screen.findByTestId('my-companies-retry'));

    expect(await screen.findByTestId('my-companies-owned')).toBeInTheDocument();
    expect(fetchCompanyEnvironmentsMock).toHaveBeenCalledTimes(2);
    expect(trackViewedMock).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the account has no companies', async () => {
    fetchCompanyEnvironmentsMock.mockResolvedValue([]);
    render(<MyCompaniesPage />);

    expect(await screen.findByTestId('my-companies-empty')).toBeInTheDocument();
  });

  it('starts a new company from the upgrade flow', async () => {
    render(<MyCompaniesPage />);

    await userEvent.click(screen.getByTestId('my-companies-new'));

    expect(navigateMock).toHaveBeenCalledWith('/upgrade');
  });
});
