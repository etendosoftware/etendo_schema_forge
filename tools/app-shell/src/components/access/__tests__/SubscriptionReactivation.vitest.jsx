// @vitest-environment jsdom
// @covers tools/app-shell/src/components/access/SubscriptionReactivation.jsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/lib/upgrade/api.js', () => ({
  createSubscriptionReactivation: vi.fn(),
  getCheckoutStatus: vi.fn(),
}));

import { createSubscriptionReactivation, getCheckoutStatus } from '@/lib/upgrade/api.js';
import {
  ReactivateSubscriptionButton,
  ReactivationPendingNotice,
} from '../SubscriptionReactivation.jsx';

const API = 'http://api.test';

describe('ReactivateSubscriptionButton (ETP-5742)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the browser to the provider checkout of the re-subscription', async () => {
    createSubscriptionReactivation.mockResolvedValue(
      { requestId: 'REQ-1', checkoutUrl: 'https://checkout.test/s' });
    const redirect = vi.fn();
    const onPaid = vi.fn();
    const user = userEvent.setup();
    render(<ReactivateSubscriptionButton apiBaseUrl={API} onPaid={onPaid} redirect={redirect} />);

    await user.click(screen.getByTestId('blocked-access-reactivate'));

    expect(createSubscriptionReactivation).toHaveBeenCalledWith(API);
    expect(redirect).toHaveBeenCalledWith('https://checkout.test/s');
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('waits for a re-subscription that is already paid instead of charging again', async () => {
    createSubscriptionReactivation.mockResolvedValue({ requestId: 'REQ-1', status: 'paid' });
    const redirect = vi.fn();
    const onPaid = vi.fn();
    const user = userEvent.setup();
    render(<ReactivateSubscriptionButton apiBaseUrl={API} onPaid={onPaid} redirect={redirect} />);

    await user.click(screen.getByTestId('blocked-access-reactivate'));

    expect(onPaid).toHaveBeenCalledWith('REQ-1');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('tells a member refused by the server to ask the owner', async () => {
    createSubscriptionReactivation.mockRejectedValue(
      Object.assign(new Error('owner'), { code: 'blockedAccessSubscriptionCanceledMemberMessage' }));
    const user = userEvent.setup();
    render(<ReactivateSubscriptionButton apiBaseUrl={API} onPaid={vi.fn()} redirect={vi.fn()} />);

    await user.click(screen.getByTestId('blocked-access-reactivate'));

    expect(await screen.findByTestId('blocked-access-reactivate-error'))
      .toHaveTextContent('blockedAccessSubscriptionCanceledMemberMessage');
  });

  it('shows a retryable failure and enables the button again for any other refusal', async () => {
    createSubscriptionReactivation.mockRejectedValue(
      Object.assign(new Error('down'), { code: 'upgradeCheckoutCreationFailed' }));
    const user = userEvent.setup();
    render(<ReactivateSubscriptionButton apiBaseUrl={API} onPaid={vi.fn()} redirect={vi.fn()} />);

    await user.click(screen.getByTestId('blocked-access-reactivate'));

    expect(await screen.findByTestId('blocked-access-reactivate-error'))
      .toHaveTextContent('blockedAccessReactivateFailed');
    expect(screen.getByTestId('blocked-access-reactivate')).not.toBeDisabled();
  });
});

describe('ReactivationPendingNotice (ETP-5742)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reloads the app on the environment once the re-subscription is applied', async () => {
    getCheckoutStatus
      .mockResolvedValueOnce({ status: 'paid' })
      .mockResolvedValueOnce({ status: 'provisioned' });
    const reload = vi.fn();
    render(<ReactivationPendingNotice apiBaseUrl={API} requestId="REQ-1" reload={reload}
      intervalMs={100} attempts={5} />);

    expect(screen.getByTestId('blocked-access-title'))
      .toHaveTextContent('blockedAccessReactivatingTitle');
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    expect(getCheckoutStatus).toHaveBeenCalledWith(API, 'REQ-1');
    expect(reload).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps waiting through a failed read', async () => {
    getCheckoutStatus
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'provisioned' });
    const reload = vi.fn();
    render(<ReactivationPendingNotice apiBaseUrl={API} requestId="REQ-1" reload={reload}
      intervalMs={100} attempts={5} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    expect(reload).toHaveBeenCalledWith('/dashboard');
  });

  it('stops after its attempts and offers a manual reload instead of spinning forever', async () => {
    getCheckoutStatus.mockResolvedValue({ status: 'paid' });
    const reload = vi.fn();
    render(<ReactivationPendingNotice apiBaseUrl={API} requestId="REQ-1" reload={reload}
      intervalMs={100} attempts={3} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(getCheckoutStatus).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('blocked-access-message'))
      .toHaveTextContent('blockedAccessReactivationSlowMessage');
    expect(reload).not.toHaveBeenCalled();
    screen.getByTestId('blocked-access-reactivating-reload').click();
    expect(reload).toHaveBeenCalledWith('/dashboard');
  });
});
