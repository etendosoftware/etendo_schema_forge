import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/i18n', () => ({
  useUI: () => key => key,
  getStoredLocale: () => 'es_ES',
}));
vi.mock('@/auth/api.js', () => ({ detectBaseUrl: () => '' }));

import UpgradePage from '../UpgradePage.jsx';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

function installFetch({ environments = [], checkout = {} } = {}) {
  const requests = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    if (String(url).includes('/sws/go/environments')) return jsonResponse({ environments });
    if (String(url).includes('/sws/go/checkout/sessions')) {
      requests.push({ url, init, body: JSON.parse(init.body || '{}') });
      return jsonResponse({
        requestId: 'upgrade-request-1',
        checkoutUrl: 'https://checkout.stripe.test/session-1',
        ...checkout,
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return requests;
}

async function renderUpgradePage() {
  render(<UpgradePage />);
  await waitFor(() => expect(screen.queryByTestId('upgrade-account-loading')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(PLATFORM_TOKEN_KEY, 'platform-token');
  vi.stubGlobal('location', { ...globalThis.location, assign: assignMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpgradePage — hosted checkout', () => {
  it('renders no raw card fields', async () => {
    installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-tenant-name')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cardholder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-card-number')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-expiry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cvc')).not.toBeInTheDocument();
  });

  it('creates a hosted session and redirects without card or mock-token fields', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.test/session-1'));
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({
      action: 'productive-tenant',
      clientName: 'Acme Productive',
      upgradeAction: 'create-productive',
      language: 'es_ES',
    });
    expect(JSON.stringify(requests[0].body)).not.toMatch(/card|paymentToken|mock-paid|priceId|amount/i);
  });

  it('rejects an already-owned tenant before creating a checkout session', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), ' acme trial ');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toHaveTextContent('upgradeTenantNameTaken');
    expect(requests).toHaveLength(0);
  });

  it('keeps the first tenant on the free onboarding flow', async () => {
    installFetch({ environments: [] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-first-tenant-free')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();
  });

  it('surfaces a checkout creation failure without redirecting', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse({ environments: [{ clientName: 'Acme Trial' }] }));
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse(
      { message: 'Stripe unavailable' },
      { ok: false, status: 503 }
    ));
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeCheckoutCreationFailed');
    expect(assignMock).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
});
