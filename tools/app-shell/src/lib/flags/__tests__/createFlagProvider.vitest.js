// @covers tools/app-shell/src/lib/flags/bootstrap.js
import { OpenFeature } from '@openfeature/web-sdk';
import { createFlagProvider, resolvePollSeconds, initFeatureFlags } from '../bootstrap.js';
import { PROOF_OF_CONCEPT_MENU } from '../flag-keys.js';

vi.mock('@/lib/observability.js', () => ({ track: vi.fn(), reset: vi.fn(), identify: vi.fn(), group: vi.fn() }));
const env = { VITE_CONFIGCAT_SDK_KEY: 'configcat-sdk-1', VITE_CONFIGCAT_POLL_SECONDS: '15' };
const logger = { warn: vi.fn() };
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await OpenFeature.clearProviders(); OpenFeature.clearHooks(); await OpenFeature.setContext({}); });

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
    const provider = { metadata: { name: 'ConfigCatWebProvider' } };
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
