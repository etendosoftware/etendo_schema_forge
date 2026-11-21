// @covers tools/app-shell/src/lib/observability/featureUsage.js
import {
  FEATURE_HEADER, featureRequestHeaders, getActiveFeature, resetSessionCredentials,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth';
import { enterFeature, leaveFeature, resetFeatureUsageForTests } from '../featureUsage.js';
import { clearSessionIdentity, setSessionIdentity } from '../../sessionIdentity.js';

vi.mock('../../observability.js', () => ({
  track: vi.fn(() => Promise.resolve()),
  setContext: vi.fn(() => Promise.resolve()),
  page: vi.fn(),
}));

const feature = (key) => ({ key });

describe('feature usage (ETP-5646)', () => {
  let emitted;
  const emit = (event) => emitted.push(event);

  beforeEach(() => {
    emitted = [];
    resetFeatureUsageForTests();
    clearSessionIdentity();
    resetSessionCredentials();
  });

  it('counts a menu or in-app open once and ignores moves inside the same feature', () => {
    enterFeature(feature('window.sales-order'), { emit });
    enterFeature(feature('window.sales-order'), { emit });
    enterFeature(feature('window.sales-order'), { emit });
    expect(emitted).toEqual([{ featureKey: 'window.sales-order', source: 'direct_url' }]);
    enterFeature(feature('window.product'), { emit });
    expect(emitted[1]).toEqual({ featureKey: 'window.product', source: 'navigation' });
  });

  it('marks the first route of a page load as a direct URL, later ones as navigation', () => {
    enterFeature(feature('report.tax-report'), { emit });
    enterFeature(feature('custom.dashboard'), { emit });
    expect(emitted.map(e => e.source)).toEqual(['direct_url', 'navigation']);
  });

  it('counts a return to a feature after leaving it, and nothing for a non-feature route', () => {
    enterFeature(feature('window.a'), { emit });
    enterFeature(null, { emit });
    expect(getActiveFeature()).toBeNull();
    enterFeature(feature('window.a'), { emit });
    expect(emitted).toHaveLength(2);
  });

  it('attributes first-party requests to the active feature (missing context sends nothing)', () => {
    expect(featureRequestHeaders({ url: '/x' })).toEqual({});
    enterFeature(feature('window.sales-order'), { emit });
    expect(featureRequestHeaders({ url: '/x' })).toEqual({ [FEATURE_HEADER]: 'window.sales-order' });
  });

  it('on identity switch the new user is counted again and the old feature stops labelling', () => {
    setSessionIdentity({ clientId: 'A' });
    setSessionCredentials({ mode: 'cookie', accountId: 'A' });
    enterFeature(feature('window.sales-order'), { emit });
    setSessionIdentity({ clientId: 'B' });
    setSessionCredentials({ mode: 'cookie', accountId: 'B' });
    expect(featureRequestHeaders({ url: '/x', scope: 'B' })).toEqual({});
    enterFeature(feature('window.sales-order'), { emit });
    expect(emitted).toHaveLength(2);
    expect(featureRequestHeaders({ url: '/x', scope: 'B' })).toEqual({ [FEATURE_HEADER]: 'window.sales-order' });
  });

  it('direct URL, identity resolves later, then a move inside the feature: exactly one open', () => {
    enterFeature(feature('window.sales-order'), { emit });
    setSessionIdentity({ clientId: 'A' });
    setSessionCredentials({ mode: 'cookie', accountId: 'A' });
    enterFeature(feature('window.sales-order'), { emit });
    enterFeature(feature('window.sales-order'), { emit });
    expect(emitted).toHaveLength(1);
    expect(featureRequestHeaders({ url: '/x', scope: 'A' })).toEqual({ [FEATURE_HEADER]: 'window.sales-order' });
  });

  it('account changes while clientId stays the same: counted again and bound to the new account', () => {
    setSessionIdentity({ clientId: 'C' });
    setSessionCredentials({ mode: 'cookie', accountId: 'A' });
    enterFeature(feature('window.sales-order'), { emit });
    setSessionCredentials({ mode: 'cookie', accountId: 'B' });
    enterFeature(feature('window.sales-order'), { emit });
    expect(emitted).toHaveLength(2);
    expect(featureRequestHeaders({ url: '/x', scope: 'B' })).toEqual({ [FEATURE_HEADER]: 'window.sales-order' });
  });

  it('an identity change onto a route with no feature clears the RUM context too', async () => {
    const { setContext } = await import('../../observability.js');
    setSessionIdentity({ clientId: 'A' });
    enterFeature(feature('window.sales-order'), { emit });
    setSessionIdentity({ clientId: 'B' });
    enterFeature(null, { emit });
    expect(setContext).toHaveBeenLastCalledWith({ featureKey: undefined });
  });

  it('logout drops the feature', async () => {
    enterFeature(feature('window.sales-order'), { emit });
    await leaveFeature();
    expect(getActiveFeature()).toBeNull();
    enterFeature(feature('window.sales-order'), { emit });
    expect(emitted).toHaveLength(2);
  });

  it('two tabs are two module realms: each counts its own open (simulated by reset)', () => {
    enterFeature(feature('window.a'), { emit });
    resetFeatureUsageForTests();
    enterFeature(feature('window.a'), { emit });
    expect(emitted).toHaveLength(2);
  });

  it('puts the key in the observability context for RUM and clears it on leave', async () => {
    const { setContext } = await import('../../observability.js');
    enterFeature(feature('window.sales-order'), { emit });
    expect(setContext).toHaveBeenCalledWith({ featureKey: 'window.sales-order' });
    await leaveFeature();
    expect(setContext).toHaveBeenLastCalledWith({ featureKey: undefined });
  });
});
