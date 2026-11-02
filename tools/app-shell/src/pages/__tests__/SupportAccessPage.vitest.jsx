// @covers tools/app-shell/src/pages/SupportAccessPage.jsx
import { render, screen, waitFor } from '@testing-library/react';

const redeemPendingSupportTicket = vi.fn();
const completeSupportHandoff = vi.fn();

// Only the two calls with an effect are replaced; the failure constants stay the real ones, so
// the page is checked against the values the module actually returns.
vi.mock('@/lib/supportSession.js', async (importOriginal) => ({
  ...(await importOriginal()),
  redeemPendingSupportTicket: (...args) => redeemPendingSupportTicket(...args),
  completeSupportHandoff: (...args) => completeSupportHandoff(...args),
}));

vi.mock('@/lib/neoBaseUrl.js', () => ({
  detectBasePath: () => ({ apiBase: '/etendo', routerBase: '/go/web/com.etendoerp.go' }),
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import SupportAccessPage from '../SupportAccessPage.jsx';

/**
 * Classic's support handoff page. The redemption itself lives in lib/supportSession.js (covered
 * there); this pins what the visitor sees for each outcome and that a success enters the app.
 */
describe('SupportAccessPage', () => {
  beforeEach(() => {
    redeemPendingSupportTicket.mockReset();
    completeSupportHandoff.mockReset();
  });

  it('shows the opening state while the ticket is being redeemed', () => {
    redeemPendingSupportTicket.mockReturnValue(new Promise(() => {}));
    render(<SupportAccessPage />);

    expect(screen.getByTestId('support-access-redeeming')).toHaveTextContent('supportAccessRedeeming');
  });

  it('enters the app with the handoff answer on 200', async () => {
    const data = { status: 'success', environment: { clientId: 'CLIENT-ACME' } };
    redeemPendingSupportTicket.mockResolvedValue({ ok: true, data });
    render(<SupportAccessPage />);

    await waitFor(() => expect(completeSupportHandoff).toHaveBeenCalledTimes(1));
    expect(completeSupportHandoff).toHaveBeenCalledWith(data, { routerBase: '/go/web/com.etendoerp.go' });
    expect(screen.queryByTestId('support-access-error')).not.toBeInTheDocument();
  });

  it.each([
    ['a 401 (invalid, expired or used)', { ok: false, reason: 'rejected', code: 'support_ticket_used' }],
    ['no ticket on this load (a reload)', { ok: false, reason: 'missing' }],
  ])('tells the visitor the access expired or was used for %s', async (_label, result) => {
    redeemPendingSupportTicket.mockResolvedValue(result);
    render(<SupportAccessPage />);

    expect(await screen.findByTestId('support-access-error-message')).toHaveTextContent('supportAccessExpiredMessage');
    expect(screen.getByTestId('support-access-error-title')).toHaveTextContent('supportAccessUnavailableTitle');
    expect(completeSupportHandoff).not.toHaveBeenCalled();
  });

  it('shows the generic failure when the handoff could not be completed', async () => {
    redeemPendingSupportTicket.mockResolvedValue({ ok: false, reason: 'failed' });
    render(<SupportAccessPage />);

    expect(await screen.findByTestId('support-access-error-message')).toHaveTextContent('supportAccessFailedMessage');
    expect(completeSupportHandoff).not.toHaveBeenCalled();
  });
});
