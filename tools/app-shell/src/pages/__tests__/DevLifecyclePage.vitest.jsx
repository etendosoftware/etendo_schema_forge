const apiFetchMock = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('@/i18n', () => ({ useUI: () => key => key }));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DevLifecyclePage from '../DevLifecyclePage.jsx';

const INITIAL_STATE = {
  trialDays: 15,
  renewalGraceDays: 7,
  environments: [{
    clientId: 'client-1',
    clientName: 'Demo tenant',
    environmentType: 'DEMO',
    trialStartedAt: '2026-09-01T10:00:00Z',
    subscriptionStatus: 'NONE',
    renewalDueAt: null,
  }],
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url, options = {}) => {
    if (options.method === 'POST') return Promise.resolve({ ok: true, json: async () => INITIAL_STATE });
    return Promise.resolve({ ok: true, json: async () => INITIAL_STATE });
  });
});

describe('DevLifecyclePage', () => {
  it('loads the configurable defaults and owned environments', async () => {
    render(<DevLifecyclePage />);

    expect(await screen.findByText('devLifecycleTitle')).toBeInTheDocument();
    expect(screen.getByLabelText('devLifecycleTrialDays')).toHaveValue(15);
    expect(screen.getByLabelText('devLifecycleGraceDays')).toHaveValue(7);
    expect(screen.getByRole('option', { name: /Demo tenant/ })).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/sws/go/dev/lifecycle');
  });

  it('submits global and selected environment lifecycle settings', async () => {
    const user = userEvent.setup();
    render(<DevLifecyclePage />);
    await screen.findByRole('option', { name: /Demo tenant/ });

    await user.clear(screen.getByLabelText('devLifecycleTrialDays'));
    await user.type(screen.getByLabelText('devLifecycleTrialDays'), '30');
    await user.selectOptions(screen.getByLabelText('devLifecycleOwnedEnvironment'), 'client-1');
    await user.selectOptions(screen.getByLabelText('devLifecycleSubscriptionStatus'), 'CURRENT');
    await user.click(screen.getByRole('button', { name: 'devLifecycleSave' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      '/sws/go/dev/lifecycle',
      expect.objectContaining({ method: 'POST' }),
    ));
    const [, request] = apiFetchMock.mock.calls.at(-1);
    expect(JSON.parse(request.body)).toMatchObject({
      trialDays: 30,
      renewalGraceDays: 7,
      clientId: 'client-1',
      type: 'DEMO',
      subscriptionStatus: 'CURRENT',
    });
  });
});
