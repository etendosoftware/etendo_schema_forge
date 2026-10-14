// @covers tools/app-shell/src/lib/flags/bootstrap.js
import { OpenFeature } from '@openfeature/web-sdk';
import {
  createFlagProvider, resolvePollSeconds, initFeatureFlags, resolveRemoteFlagProvider, buildDatadogFlagOptions,
} from '../bootstrap.js';
import { PROOF_OF_CONCEPT_MENU } from '../flag-keys.js';

vi.mock('@/lib/observability.js', () => ({ track: vi.fn(), reset: vi.fn(), identify: vi.fn(), group: vi.fn() }));
const env = { VITE_CONFIGCAT_SDK_KEY: 'configcat-sdk-1', VITE_CONFIGCAT_POLL_SECONDS: '15' };
const logger = { warn: vi.fn() };
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await OpenFeature.clearProviders(); OpenFeature.clearHooks(); await OpenFeature.setContext({}); });

const datadogEnv = {
  VITE_DATADOG_APPLICATION_ID: 'rum-app', VITE_DATADOG_CLIENT_TOKEN: 'pub-token',
  VITE_DATADOG_SITE: 'datadoghq.eu', VITE_APP_ENV: 'experimental', VITE_APP_VERSION: 'abc123',
};

function datadogLoaderStub() {
  const instances = [];
  class DatadogProvider {
    constructor(options) { this.options = options; this.metadata = { name: 'x' }; instances.push(this); }
  }
  const withTimeout = vi.fn((impl, ms) => Object.assign((...args) => impl(...args), { ms }));
  return { instances, withTimeout, loader: vi.fn(async () => ({ DatadogProvider, withTimeout })) };
}

describe('remote provider selection', () => {
  it.each([
    [{}, undefined],
    [env, 'configcat'],
    [datadogEnv, 'datadog'],
    [{ ...env, ...datadogEnv }, 'datadog'],
    [{ ...env, ...datadogEnv, VITE_FLAGS_PROVIDER: 'configcat' }, 'configcat'],
    [{ ...env, ...datadogEnv, VITE_FLAGS_PROVIDER: ' Datadog ' }, 'datadog'],
    [{ ...env, VITE_FLAGS_PROVIDER: 'datadog' }, 'configcat'],
    [{ ...datadogEnv, VITE_FLAGS_PROVIDER: 'configcat' }, 'datadog'],
    [{ ...datadogEnv, VITE_APP_ENV: '' }, undefined],
    [{ ...env, ...datadogEnv, VITE_FLAGS_PROVIDER: 'launchdarkly' }, 'datadog'],
  ])('resolves %o to %s', (input, expected) => {
    expect(resolveRemoteFlagProvider(input, logger)).toBe(expected);
  });

  it('warns on an unknown or unconfigured preference, stays quiet otherwise', () => {
    const warn = vi.fn();
    resolveRemoteFlagProvider({ ...datadogEnv, VITE_FLAGS_PROVIDER: 'datadog' }, { warn });
    expect(warn).not.toHaveBeenCalled();
    resolveRemoteFlagProvider({ VITE_FLAGS_PROVIDER: 'datadog' }, { warn });
    resolveRemoteFlagProvider({ VITE_FLAGS_PROVIDER: 'nope' }, { warn });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('builds Datadog options from the RUM variables with RUM tracking left to the exposure hook', () => {
    expect(buildDatadogFlagOptions(datadogEnv)).toEqual({
      applicationId: 'rum-app', clientToken: 'pub-token', site: 'datadoghq.eu', env: 'experimental',
      service: 'etendo-go-web', version: 'abc123',
      enableRumFeatureFlagTracking: false, enableExposureLogging: true, enableFlagEvaluationTracking: true,
    });
  });

  it('creates the Datadog provider with a bounded configuration fetch and a stable name', async () => {
    const { instances, withTimeout, loader } = datadogLoaderStub();
    const configCatLoader = vi.fn();
    const result = await createFlagProvider({ env: { ...env, ...datadogEnv }, logger, loader: configCatLoader, datadogLoader: loader });
    expect(configCatLoader).not.toHaveBeenCalled();
    expect(result).toBe(instances[0]);
    expect(result.metadata.name).toBe('datadog');
    expect(result.options).toMatchObject({ applicationId: 'rum-app', enableRumFeatureFlagTracking: false });
    expect(withTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
    expect(result.options.flagConfigurationFetch.ms).toBe(4000);
  });

  it('local overrides beat Datadog without loading its SDK', async () => {
    const { loader } = datadogLoaderStub();
    const provider = await createFlagProvider({
      env: { ...datadogEnv, VITE_FEATURE_FLAGS: JSON.stringify({ [PROOF_OF_CONCEPT_MENU]: true }) }, logger, datadogLoader: loader,
    });
    await OpenFeature.setProviderAndWait(provider);
    expect(loader).not.toHaveBeenCalled();
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(true);
  });

  it('surfaces a failing Datadog SDK import to initFeatureFlags, which degrades to defaults', async () => {
    await expect(createFlagProvider({ env: datadogEnv, logger, datadogLoader: () => Promise.reject(new Error('chunk')) }))
      .rejects.toThrow('chunk');
  });
});

describe('ConfigCat control plane selection', () => {
  it('local boolean overrides take priority without loading a remote SDK', async () => {
    const loader = vi.fn();
    const provider = await createFlagProvider({ env: { ...env, VITE_FEATURE_FLAGS: JSON.stringify({ [PROOF_OF_CONCEPT_MENU]: true }) }, loader, logger });
    await OpenFeature.setProviderAndWait(provider);
    expect(loader).not.toHaveBeenCalled();
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(true);
  });

  it('uses safe defaults when ConfigCat is not configured', async () => {
    const loader = vi.fn();
    const provider = await createFlagProvider({ env: {}, loader, logger });
    await OpenFeature.setProviderAndWait(provider);
    expect(loader).not.toHaveBeenCalled();
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(false);
  });

  it('creates ConfigCat with the SDK key and bounded polling options', async () => {
    const provider = { metadata: { name: 'minified_provider_name' } };
    const create = vi.fn(() => provider);
    const result = await createFlagProvider({ env, logger, loader: async () => ({ ConfigCatWebProvider: { create } }) });
    expect(result).toBe(provider);
    expect(result.metadata.name).toBe('ConfigCatWebProvider');
    expect(create).toHaveBeenCalledWith('configcat-sdk-1', { pollIntervalSeconds: 15, maxInitWaitTimeSeconds: 4 });
  });

  it('bounds readiness and leaves a missing flag at its safe default', async () => {
    vi.useFakeTimers();
    vi.spyOn(OpenFeature, 'setProviderAndWait').mockReturnValue(new Promise(() => {}));
    const ready = initFeatureFlags({ env: {}, logger });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await ready).toBe('none');
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(false);
  });

  it.each([undefined, '', 'bad', '0', '-1'])('uses a finite default poll interval for %s', value => {
    expect(resolvePollSeconds(value, logger)).toBe(60);
  });
  it('accepts a positive configured poll interval', () => expect(resolvePollSeconds('15', logger)).toBe(15));
});
