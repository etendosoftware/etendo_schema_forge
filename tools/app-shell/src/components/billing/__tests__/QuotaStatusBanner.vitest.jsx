// @covers tools/app-shell/src/components/billing/QuotaStatusBanner.jsx
// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
/**
 * QuotaStatusBanner — the in-environment report of the plan quotas that are near or at their
 * limit. It reads the current environment's `quotas` from the environment list (WARN/DENY items
 * only), the same source the payment banner reads `graceEndsAt` from. The item logic itself is
 * the pure `lib/planQuotas.js` (src/lib/__tests__/planQuotas.test.js); this suite pins what the
 * component renders: when it shows, who gets the CTA, the DENY/WARN tone, dismissal and the routes
 * it stays off.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Keys pass through; interpolation params are appended so what is interpolated is observable.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key),
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

import { QuotaStatusBanner } from '../QuotaStatusBanner.jsx';
import { quotaBannerDismissKey } from '@/lib/planQuotas.js';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

function quota(overrides = {}) {
  return {
    resourceKey: 'POSTED_SALES_INVOICES',
    resourceName: 'Posted sales invoices',
    unitLabel: 'Inv',
    includedQty: 100,
    enforcementMode: 'block',
    warningThreshold: 80,
    period: 'month',
    consumed: 87,
    verdict: 'WARN',
    periodStart: '2026-10-07',
    periodEnd: '2026-11-07',
    ...overrides,
  };
}

const WARN_INVOICES = quota();
const DENY_USERS = quota({
  resourceKey: 'USERS', resourceName: 'Users', unitLabel: null, includedQty: 5, consumed: 5, verdict: 'DENY',
});

function withEnvironment(overrides = {}) {
  envRef.current = [{
    clientId: 'CLIENT-1',
    ownedByAccount: true,
    quotas: [WARN_INVOICES],
    ...overrides,
  }];
}

const banner = () => screen.getByTestId('quota-status-banner');
const queryBanner = () => screen.queryByTestId('quota-status-banner');
const items = () => screen.getAllByTestId('quota-status-banner-item');

beforeEach(() => {
  navigateMock.mockReset();
  pathRef.current = '/sales-order';
  sessionStorage.clear();
  withEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('QuotaStatusBanner — data source', () => {
  it('renders the current environment\'s quotas from the environment list', () => {
    envRef.current = [
      { clientId: 'OTHER', ownedByAccount: true, quotas: [DENY_USERS] },
      { clientId: 'CLIENT-1', ownedByAccount: true, quotas: [WARN_INVOICES] },
    ];
    render(<QuotaStatusBanner />);

    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveAttribute('data-verdict', 'WARN');
    expect(items()[0]).toHaveTextContent('quotaBannerWarn|');
    expect(items()[0]).toHaveTextContent('"resource":"Posted sales invoices"');
    // The usage carries the period, so the reader knows it is a monthly quota.
    expect(items()[0]).toHaveTextContent('quotaUsageInPeriod');
    expect(items()[0]).toHaveTextContent('quotaPeriodMonth');
  });

  it.each([
    ['an empty list', { quotas: [] }],
    ['a missing field (older backend)', { quotas: undefined }],
    ['only ALLOW / not-evaluated items', { quotas: [quota({ verdict: 'ALLOW' }), quota({ verdict: null })] }],
  ])('renders nothing for %s', (_label, overrides) => {
    withEnvironment(overrides);
    render(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('renders nothing when the current client is not in the environment list', () => {
    envRef.current = [{ clientId: 'OTHER', ownedByAccount: true, quotas: [DENY_USERS] }];
    render(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('lists DENY before WARN, and reads a WARN at its limit as over', () => {
    const overWarn = quota({ resourceKey: 'ORDERS', resourceName: 'Orders', consumed: 120, verdict: 'WARN' });
    withEnvironment({ quotas: [WARN_INVOICES, overWarn, DENY_USERS] });
    render(<QuotaStatusBanner />);

    const rows = items();
    expect(rows.map((row) => row.getAttribute('data-verdict'))).toEqual(['DENY', 'WARN', 'WARN']);
    expect(rows[0]).toHaveTextContent('quotaBannerDeny|');
    expect(rows[0]).toHaveTextContent('"resource":"Users"');
    expect(rows[1]).toHaveTextContent('quotaBannerWarn|');
    expect(rows[2]).toHaveTextContent('quotaBannerOver|');
  });
});

// A catalog row an operator left unnamed still has its resource key: the banner names the quota
// by that key (`quotaResourceLabel`) rather than dropping it, and drops only an item with neither.
describe('QuotaStatusBanner — an unnamed quota', () => {
  it.each([
    ['a blank name', '  '],
    ['an empty name', ''],
    ['a missing name', null],
  ])('names an item with %s by its resource key', (_label, resourceName) => {
    withEnvironment({ quotas: [quota({ resourceKey: 'KEY_ONLY', resourceName })] });
    render(<QuotaStatusBanner />);

    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('quotaBannerWarn|');
    expect(items()[0]).toHaveTextContent('"resource":"KEY_ONLY"');
  });

  it('does not show an item with neither a name nor a key', () => {
    withEnvironment({ quotas: [quota({ resourceKey: '', resourceName: ' ' }), DENY_USERS] });
    render(<QuotaStatusBanner />);

    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('"resource":"Users"');
  });

  it('renders nothing when the only alert has neither a name nor a key', () => {
    withEnvironment({ quotas: [quota({ resourceKey: null, resourceName: '' })] });
    render(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('keys the dismissal on the resource key, so renaming the quota does not bring it back', async () => {
    const user = userEvent.setup();
    withEnvironment({ quotas: [quota({ resourceKey: 'KEY_ONLY', resourceName: '' })] });
    const { rerender } = render(<QuotaStatusBanner />);

    await user.click(screen.getByTestId('quota-status-banner-dismiss'));
    expect(sessionStorage.getItem('etendo:quota-warning-dismissed:CLIENT-1:KEY_ONLY=WARN')).toBe('1');

    withEnvironment({ quotas: [quota({ resourceKey: 'KEY_ONLY', resourceName: 'Now named' })] });
    rerender(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });
});

describe('QuotaStatusBanner — owner and member', () => {
  it('gives the owner a CTA to /account and no contact-admin hint', async () => {
    const user = userEvent.setup();
    render(<QuotaStatusBanner />);

    const cta = screen.getByTestId('quota-status-banner-cta');
    expect(cta).toHaveTextContent('quotaBannerCta');
    expect(screen.queryByTestId('quota-status-banner-member-hint')).not.toBeInTheDocument();

    await user.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/account');
  });

  it.each([
    ['an invited member', false],
    ['a backend that does not report ownership', undefined],
  ])('tells %s to contact the administrator, with no CTA', (_label, ownedByAccount) => {
    withEnvironment({ ownedByAccount });
    render(<QuotaStatusBanner />);

    expect(screen.getByTestId('quota-status-banner-member-hint'))
      .toHaveTextContent('billingPaymentFailedContactAdmin');
    expect(screen.queryByTestId('quota-status-banner-cta')).not.toBeInTheDocument();
    expect(items()).toHaveLength(1);
  });
});

describe('QuotaStatusBanner — tone', () => {
  it('renders red and as an alert when any quota is denied', () => {
    withEnvironment({ quotas: [WARN_INVOICES, DENY_USERS] });
    render(<QuotaStatusBanner />);

    expect(banner()).toHaveAttribute('data-variant', 'destructive');
    expect(banner()).toHaveAttribute('role', 'alert');
    expect(banner().className).toMatch(/destructive/);
  });

  it('renders amber and as a status when every quota is only a warning', () => {
    render(<QuotaStatusBanner />);

    expect(banner()).toHaveAttribute('data-variant', 'warning');
    expect(banner()).toHaveAttribute('role', 'status');
    expect(banner().className).toMatch(/status-warning/);
    expect(banner().className).not.toMatch(/destructive/);
  });
});

describe('QuotaStatusBanner — dismissal', () => {
  it('is dismissed for the session, across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<QuotaStatusBanner />);

    await user.click(screen.getByTestId('quota-status-banner-dismiss'));
    expect(queryBanner()).not.toBeInTheDocument();
    expect(sessionStorage.getItem(quotaBannerDismissKey('CLIENT-1', [WARN_INVOICES]))).toBe('1');

    unmount();
    render(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('comes back when a verdict changes from WARN to DENY', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QuotaStatusBanner />);
    await user.click(screen.getByTestId('quota-status-banner-dismiss'));
    expect(queryBanner()).not.toBeInTheDocument();

    withEnvironment({ quotas: [quota({ consumed: 100, verdict: 'DENY' })] });
    rerender(<QuotaStatusBanner />);
    expect(banner()).toHaveAttribute('data-variant', 'destructive');
  });

  it('comes back when another resource starts being reported', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QuotaStatusBanner />);
    await user.click(screen.getByTestId('quota-status-banner-dismiss'));

    withEnvironment({ quotas: [WARN_INVOICES, quota({ resourceKey: 'ORDERS', resourceName: 'Orders' })] });
    rerender(<QuotaStatusBanner />);
    expect(items()).toHaveLength(2);
  });

  it('still renders, and still dismisses, when sessionStorage throws', async () => {
    const user = userEvent.setup();
    const blocked = () => { throw new Error('SecurityError'); };
    const getItem = vi.fn(blocked);
    const setItem = vi.fn(blocked);
    vi.stubGlobal('sessionStorage', { getItem, setItem, clear: () => {} });
    render(<QuotaStatusBanner />);
    expect(banner()).toBeInTheDocument();

    await user.click(screen.getByTestId('quota-status-banner-dismiss'));
    expect(setItem).toHaveBeenCalled();
    expect(queryBanner()).not.toBeInTheDocument();
  });
});

describe('QuotaStatusBanner — routes', () => {
  it.each(['/account', '/account/x', '/upgrade', '/upgrade/x'])('is hidden on %s', (path) => {
    pathRef.current = path;
    withEnvironment({ quotas: [DENY_USERS] });
    render(<QuotaStatusBanner />);
    expect(queryBanner()).not.toBeInTheDocument();
  });

  it.each(['/companies', '/accounts', '/'])('is shown on %s', (path) => {
    pathRef.current = path;
    render(<QuotaStatusBanner />);
    expect(within(banner()).getByTestId('quota-status-banner-items')).toBeInTheDocument();
  });
});

describe('QuotaStatusBanner — copy in every shipped locale', () => {
  const KEYS = [
    'quotaBannerWarn', 'quotaBannerOver', 'quotaBannerDeny', 'quotaBannerCta',
    'quotaUsage', 'quotaUsageNoUnit', 'quotaIncluded', 'quotaIncludedNoUnit', 'quotaUsageInPeriod',
    'quotaPeriodMonth', 'quotaPeriodYear', 'billingPaymentFailedContactAdmin',
  ];

  it.each([
    ['en_US', enUS],
    ['es_ES', esES],
    ['es_AR', esAR],
  ])('%s defines every banner key with its placeholders', (_name, dict) => {
    const labels = dict.genericLabels;
    for (const key of KEYS) {
      expect(typeof labels?.[key], key).toBe('string');
      expect(labels[key].trim(), key).not.toBe('');
    }
    for (const key of ['quotaBannerWarn', 'quotaBannerOver', 'quotaBannerDeny']) {
      expect(labels[key], key).toContain('{resource}');
      expect(labels[key], key).toContain('{usage}');
    }
    expect(labels.quotaUsage).toMatch(/\{consumed\}.*\{included\}.*\{unit\}/);
    expect(labels.quotaUsageNoUnit).not.toContain('{unit}');
    expect(labels.quotaIncludedNoUnit).not.toContain('{unit}');
    expect(labels.quotaUsageInPeriod).toMatch(/\{usage\}.*\{period\}/);
  });
});
