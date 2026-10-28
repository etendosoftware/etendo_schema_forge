// @covers tools/app-shell/src/components/layout/SupportSessionBanner.jsx
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const logoutMock = vi.fn();
const navigateMock = vi.fn();
let resolveRevoke;
const whenSessionRevokeSettles = vi.fn(() => new Promise((resolve) => { resolveRevoke = resolve; }));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/auth/useLogout.js', () => ({ useLogout: () => logoutMock }));
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  whenSessionRevokeSettles: () => whenSessionRevokeSettles(),
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { SupportSessionBanner } from '../SupportSessionBanner.jsx';
import {
  applySupportSessionFromServer,
  formatSupportExpiry,
  resetSupportSessionForTests,
} from '@/lib/supportSession.js';

const SESSION = { clientId: 'CLIENT-ACME', clientName: 'Acme Corp', expiresAt: '2026-10-05T11:00:00Z' };

/**
 * The support-mode strip. Driven by the real support-session store, so what is asserted is the
 * banner following the mode, not a mocked hook answering what the test wanted.
 */
describe('SupportSessionBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSupportSessionForTests();
    logoutMock.mockReset();
    navigateMock.mockReset();
    whenSessionRevokeSettles.mockClear();
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing outside a support session', () => {
    render(<SupportSessionBanner />);
    expect(screen.queryByTestId('support-mode-banner')).not.toBeInTheDocument();

    act(() => applySupportSessionFromServer(null, { storage: localStorage }));
    expect(screen.queryByTestId('support-mode-banner')).not.toBeInTheDocument();
  });

  it('names the company and the expiry once /me has confirmed the session', () => {
    render(<SupportSessionBanner />);
    act(() => applySupportSessionFromServer(SESSION, { storage: localStorage }));

    expect(screen.getByTestId('support-mode-banner-message'))
      .toHaveTextContent('supportModeBannerMessage {"clientName":"Acme Corp"}');
    expect(screen.getByTestId('support-mode-banner-expiry')).toHaveTextContent(
      `supportModeBannerExpiry {"time":"${formatSupportExpiry(SESSION.expiresAt, 'es_ES')}"}`,
    );
  });

  it('says support mode without a company while only the handoff marker is known', () => {
    render(<SupportSessionBanner />);
    act(() => applySupportSessionFromServer({ clientId: null, clientName: null, expiresAt: null }, { storage: localStorage }));

    expect(screen.getByTestId('support-mode-banner-message')).toHaveTextContent('supportModeBannerMessageNoClient');
    expect(screen.queryByTestId('support-mode-banner-expiry')).not.toBeInTheDocument();
  });

  it('logs out, waits for the revoke, then goes to the login and closes the tab', async () => {
    const user = userEvent.setup();
    render(<SupportSessionBanner />);
    act(() => applySupportSessionFromServer(SESSION, { storage: localStorage }));

    await user.click(screen.getByTestId('support-mode-exit'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('support-mode-exit')).toBeDisabled();
    // Nothing leaves the page before the server has revoked the session.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();

    await act(async () => resolveRevoke());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true }));
    expect(window.close).toHaveBeenCalledTimes(1);
  });
});
