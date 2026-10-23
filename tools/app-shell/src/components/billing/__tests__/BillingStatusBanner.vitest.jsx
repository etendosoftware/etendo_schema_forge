// @covers tools/app-shell/src/components/billing/BillingStatusBanner.jsx
// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
/**
 * BillingStatusBanner — the in-environment warning that the last renewal payment failed, shown
 * while the subscription is PAST_DUE and its grace period is still ahead. The decision itself is
 * the pure `paymentGraceWarning` (covered in src/lib/__tests__/environmentPresentation.test.js);
 * this suite pins what the component renders for it: who gets the CTA, how dismissal persists,
 * the escalated state, the routes it stays off, and the date it names.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Keys pass through; interpolation params are appended so the formatted date can be asserted
// without depending on the copy around it.
const localeRef = vi.hoisted(() => ({ current: 'en_US' }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: localeRef.current, setLocale: vi.fn() }),
}));

const navigateMock = vi.hoisted(() => vi.fn());
const pathRef = vi.hoisted(() => ({ current: '/sales-order' }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: pathRef.current }),
}));

const envRef = vi.hoisted(() => ({ current: [] }));
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => ({ environments: envRef.current, currentClientId: 'CLIENT-1' }),
}));

import { BillingStatusBanner } from '../BillingStatusBanner.jsx';
import { paymentGraceWarningDismissKey } from '@/lib/environmentPresentation.js';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

/** "Now" for every case: local noon on 1 Nov 2026. Only `Date` is faked, so user-event still runs. */
const NOW = new Date(2026, 10, 1, 12, 0, 0);
/** Late evening, LOCAL time, on 10 Nov — nine days out, so not escalated. */
const GRACE_FAR = new Date(2026, 10, 10, 23, 30, 0).toISOString();
/** Two days out — inside the last 3 days, so escalated. */
const GRACE_NEAR = new Date(2026, 10, 3, 12, 0, 0).toISOString();
/** A later grace window of the same client (a second failed payment). */
const GRACE_LATER = new Date(2026, 11, 20, 12, 0, 0).toISOString();

function environment(overrides = {}) {
  return {
    clientId: 'CLIENT-1',
    subscriptionStatus: 'PAST_DUE',
    graceEndsAt: GRACE_FAR,
    ownedByAccount: true,
    ...overrides,
  };
}

function withEnvironment(overrides) {
  envRef.current = [environment(overrides)];
}

const banner = () => screen.getByTestId('billing-status-banner');
const queryBanner = () => screen.queryByTestId('billing-status-banner');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  navigateMock.mockReset();
  localeRef.current = 'en_US';
  pathRef.current = '/sales-order';
  sessionStorage.clear();
  withEnvironment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BillingStatusBanner — when it shows', () => {
  it('renders nothing for a subscription that is not PAST_DUE', () => {
    withEnvironment({ subscriptionStatus: 'CURRENT' });
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('renders nothing once the grace period has ended', () => {
    withEnvironment({ graceEndsAt: new Date(2026, 9, 30).toISOString() });
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('renders nothing when the current client is not in the environment list', () => {
    envRef.current = [environment({ clientId: 'OTHER-CLIENT' })];
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it.each(['/account', '/account/x'])('is hidden on %s, where the payment portal already is', (path) => {
    pathRef.current = path;
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  // Repro (ETP-5049 review W3): UpgradePage is a `fixed inset-0 z-50` overlay, so a banner
  // mounted under it was invisible yet still in the accessibility tree — and, escalated, an
  // announced `role="alert"` nobody could see or act on.
  it.each(['/upgrade', '/upgrade/x'])('is hidden on %s, which is a full-screen overlay', (path) => {
    pathRef.current = path;
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it.each(['/companies', '/accounting', '/'])('is shown on %s', (path) => {
    pathRef.current = path;
    render(<BillingStatusBanner />);
    expect(banner()).toBeInTheDocument();
  });
});

describe('BillingStatusBanner — owner and member', () => {
  it('gives the owner an Update payment CTA that navigates to /account', async () => {
    const user = userEvent.setup();
    render(<BillingStatusBanner />);

    const cta = screen.getByTestId('billing-status-banner-cta');
    expect(cta).toHaveTextContent('billingUpdatePaymentCta');
    expect(screen.queryByTestId('billing-status-banner-member-hint')).not.toBeInTheDocument();

    await user.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/account');
  });

  it.each([
    ['an invited member', false],
    ['a backend that does not report ownership', undefined],
  ])('tells %s to contact the administrator, with no CTA', (_label, ownedByAccount) => {
    withEnvironment({ ownedByAccount });
    render(<BillingStatusBanner />);

    expect(screen.getByTestId('billing-status-banner-member-hint'))
      .toHaveTextContent('billingPaymentFailedContactAdmin');
    expect(screen.queryByTestId('billing-status-banner-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-status-banner-message'))
      .toHaveTextContent('billingPaymentFailedBanner');
  });
});

describe('BillingStatusBanner — dismissal', () => {
  it('is dismissible before the last days, and stays dismissed across a remount in the session', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BillingStatusBanner />);
    expect(banner()).toHaveAttribute('role', 'status');
    expect(banner()).toHaveAttribute('data-variant', 'warning');

    await user.click(screen.getByTestId('billing-status-banner-dismiss'));
    expect(queryBanner()).not.toBeInTheDocument();
    expect(sessionStorage.getItem(paymentGraceWarningDismissKey('CLIENT-1', GRACE_FAR))).toBe('1');

    unmount();
    render(<BillingStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('comes back for a new grace window of the same client', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BillingStatusBanner />);
    await user.click(screen.getByTestId('billing-status-banner-dismiss'));
    expect(queryBanner()).not.toBeInTheDocument();

    withEnvironment({ graceEndsAt: GRACE_LATER });
    rerender(<BillingStatusBanner />);
    expect(banner()).toBeInTheDocument();
  });

  it('cannot be dismissed in the last 3 days, and is announced as an alert', () => {
    withEnvironment({ graceEndsAt: GRACE_NEAR });
    render(<BillingStatusBanner />);

    expect(banner()).toHaveAttribute('role', 'alert');
    expect(banner()).toHaveAttribute('data-variant', 'destructive');
    expect(screen.queryByTestId('billing-status-banner-dismiss')).not.toBeInTheDocument();
  });

  it('ignores an earlier dismissal once the warning escalates', () => {
    // Dismissed while it was still a plain warning, for the same grace window.
    sessionStorage.setItem(paymentGraceWarningDismissKey('CLIENT-1', GRACE_NEAR), '1');
    withEnvironment({ graceEndsAt: GRACE_NEAR });
    render(<BillingStatusBanner />);
    expect(banner()).toBeInTheDocument();
  });

  it('still renders, and still dismisses, when sessionStorage throws', async () => {
    const user = userEvent.setup();
    const blocked = () => { throw new Error('SecurityError'); };
    const getItem = vi.fn(blocked);
    const setItem = vi.fn(blocked);
    vi.stubGlobal('sessionStorage', { getItem, setItem, clear: () => {} });
    render(<BillingStatusBanner />);
    expect(banner()).toBeInTheDocument();
    expect(getItem).toHaveBeenCalled();

    await user.click(screen.getByTestId('billing-status-banner-dismiss'));
    expect(setItem).toHaveBeenCalled();
    expect(queryBanner()).not.toBeInTheDocument();
  });
});

describe('BillingStatusBanner — the grace end date', () => {
  it.each([
    ['en_US', 'November 10, 2026'],
    ['es_ES', '10 de noviembre de 2026'],
  ])('names the local calendar day of the instant in the %s UI locale', (locale, expected) => {
    localeRef.current = locale;
    render(<BillingStatusBanner />);
    expect(screen.getByTestId('billing-status-banner-message'))
      .toHaveTextContent(`billingPaymentFailedBanner|${JSON.stringify({ date: expected })}`);
  });
});

describe('BillingStatusBanner — copy in every shipped locale', () => {
  const KEYS = ['billingPaymentFailedBanner', 'billingUpdatePaymentCta', 'billingPaymentFailedContactAdmin'];

  it.each([
    ['en_US', enUS],
    ['es_ES', esES],
    ['es_AR', esAR],
  ])('%s defines every banner key, and the message names the date', (_name, dict) => {
    for (const key of KEYS) {
      expect(typeof dict.genericLabels?.[key], key).toBe('string');
      expect(dict.genericLabels[key].trim(), key).not.toBe('');
    }
    expect(dict.genericLabels.billingPaymentFailedBanner).toContain('{date}');
  });
});
