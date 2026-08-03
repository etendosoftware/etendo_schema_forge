/**
 * Control-plane selection at the swap point (ETP-4691).
 *
 * `createFlagProvider` is the only function that knows which plane backs the
 * flags, and it now has three branches. This file covers the ConfigCat one and
 * the precedence between all three.
 *
 * The ConfigCat SDK is MOCKED at the import boundary — no network, and no SDK
 * key appears in this file. The real key lives only in the git-ignored
 * `.env.development.local`. Every `env` here is a literal object passed in, so
 * these tests never read the ambient environment either.
 */

const configCatCreate = vi.fn();

vi.mock('@openfeature/config-cat-web-provider', () => ({
  ConfigCatWebProvider: {
    create: (...args) => configCatCreate(...args),
  },
}));

import { OpenFeature } from '@openfeature/web-sdk';
import { createFlagProvider, resolvePollSeconds, initFeatureFlags } from '../bootstrap.js';
import { TENANT_UPGRADE } from '../flag-keys.js';
import { resetExposureCache } from '../flag-exposure.js';

vi.mock('@/lib/observability.js', () => ({ track: vi.fn() }));

/** Obviously not a credential — the real key never enters a committed file. */
const PLACEHOLDER_SDK_KEY = 'not-a-real-configcat-key-for-tests-only';

const DEFAULT_POLL_SECONDS = 60;

const silentLogger = () => ({ warn: vi.fn(), error: vi.fn() });

/** A provider shaped enough for OpenFeature to register and evaluate against. */
function fakeProvider({ name = 'configcat-web', initialize } = {}) {
  const resolved = reason => () => ({ value: false, reason });
  return {
    metadata: { name },
    runsOn: 'client',
    hooks: [],
    initialize: initialize ?? (async () => {}),
    onClose: async () => {},
    resolveBooleanEvaluation: resolved('STATIC'),
    resolveStringEvaluation: () => ({ value: '', reason: 'STATIC' }),
    resolveNumberEvaluation: () => ({ value: 0, reason: 'STATIC' }),
    resolveObjectEvaluation: () => ({ value: {}, reason: 'STATIC' }),
  };
}

async function resetOpenFeature() {
  await OpenFeature.clearProviders();
  OpenFeature.clearHooks();
  await OpenFeature.clearContexts();
  await OpenFeature.setContext({});
  resetExposureCache();
}

beforeEach(async () => {
  vi.clearAllMocks();
  configCatCreate.mockReturnValue(fakeProvider());
  await resetOpenFeature();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetOpenFeature();
});

describe('createFlagProvider — branch 3: declared defaults', () => {
  it('serves the in-memory defaults when nothing is configured', async () => {
    const provider = await createFlagProvider({ env: {}, logger: silentLogger() });
    expect(provider.metadata.name).toBe('in-memory');
  });

  it('does not reach for the ConfigCat SDK at all', async () => {
    await createFlagProvider({ env: {}, logger: silentLogger() });
    // The SDK is lazy-imported precisely so an unconfigured build never pays
    // for it; calling create would mean the import happened.
    expect(configCatCreate).not.toHaveBeenCalled();
  });
});

describe('createFlagProvider — branch 2: ConfigCat', () => {
  it('selects the ConfigCat provider when an SDK key is configured', async () => {
    const provider = await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });

    expect(configCatCreate).toHaveBeenCalledTimes(1);
    expect(provider.metadata.name).toBe('configcat-web');
  });

  it('passes the configured key through to the SDK', async () => {
    await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    expect(configCatCreate).toHaveBeenCalledWith(PLACEHOLDER_SDK_KEY, expect.any(Object));
  });

  it('polls on the default interval when none is configured', async () => {
    await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    expect(configCatCreate).toHaveBeenCalledWith(
      PLACEHOLDER_SDK_KEY,
      { pollIntervalSeconds: DEFAULT_POLL_SECONDS }
    );
  });

  it('honours a configured poll interval', async () => {
    await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY, VITE_CONFIGCAT_POLL_SECONDS: '15' },
      logger: silentLogger(),
    });
    expect(configCatCreate).toHaveBeenCalledWith(
      PLACEHOLDER_SDK_KEY,
      { pollIntervalSeconds: 15 }
    );
  });

  it('never hands the SDK an unusable interval', async () => {
    const logger = silentLogger();
    await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY, VITE_CONFIGCAT_POLL_SECONDS: 'soon' },
      logger,
    });
    expect(configCatCreate).toHaveBeenCalledWith(
      PLACEHOLDER_SDK_KEY,
      { pollIntervalSeconds: DEFAULT_POLL_SECONDS }
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('treats an empty key as no key, rather than calling the SDK with one', async () => {
    const provider = await createFlagProvider({
      env: { VITE_CONFIGCAT_SDK_KEY: '' },
      logger: silentLogger(),
    });
    expect(configCatCreate).not.toHaveBeenCalled();
    expect(provider.metadata.name).toBe('in-memory');
  });
});

describe('createFlagProvider — branch 1: a local override beats the remote plane', () => {
  const bothConfigured = {
    VITE_FEATURE_FLAGS: JSON.stringify({ [TENANT_UPGRADE]: true }),
    VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY,
  };

  it('uses the local override even when ConfigCat is configured', async () => {
    const provider = await createFlagProvider({ env: bothConfigured, logger: silentLogger() });
    expect(provider.metadata.name).toBe('in-memory');
  });

  it('does not contact ConfigCat at all in that case', async () => {
    await createFlagProvider({ env: bothConfigured, logger: silentLogger() });
    // Determinism is the point: a shared dashboard must not be able to change
    // a developer's machine, or an e2e run, mid-debug.
    expect(configCatCreate).not.toHaveBeenCalled();
  });

  it('says out loud that the remote plane is being bypassed', async () => {
    const logger = silentLogger();
    await createFlagProvider({ env: bothConfigured, logger });
    // Silently ignoring a configured control plane would be very confusing to
    // debug, so the bypass is announced.
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('VITE_FEATURE_FLAGS'));
  });

  it('resolves the overridden value, not the provider default', async () => {
    const provider = await createFlagProvider({ env: bothConfigured, logger: silentLogger() });
    await OpenFeature.setProviderAndWait(provider);
    expect(OpenFeature.getClient().getBooleanValue(TENANT_UPGRADE, false)).toBe(true);
  });

  it('falls through to ConfigCat when the override is malformed', async () => {
    const logger = silentLogger();
    await createFlagProvider({
      env: { VITE_FEATURE_FLAGS: '{not json', VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger,
    });
    // A broken override yields no usable flags, so it must not shadow a
    // perfectly good control plane.
    expect(configCatCreate).toHaveBeenCalledTimes(1);
  });
});

describe('resolvePollSeconds', () => {
  it('defaults when unset or empty', () => {
    expect(resolvePollSeconds(undefined, silentLogger())).toBe(DEFAULT_POLL_SECONDS);
    expect(resolvePollSeconds(null, silentLogger())).toBe(DEFAULT_POLL_SECONDS);
    expect(resolvePollSeconds('', silentLogger())).toBe(DEFAULT_POLL_SECONDS);
  });

  it('accepts a positive number, as a string or a number', () => {
    expect(resolvePollSeconds('30', silentLogger())).toBe(30);
    expect(resolvePollSeconds(30, silentLogger())).toBe(30);
    expect(resolvePollSeconds('0.5', silentLogger())).toBe(0.5);
  });

  it('rejects values the SDK could not use, and warns', () => {
    for (const raw of ['abc', '0', '-5', 'Infinity', '-Infinity', {}]) {
      const logger = silentLogger();
      expect(resolvePollSeconds(raw, logger)).toBe(DEFAULT_POLL_SECONDS);
      expect(logger.warn, `expected a warning for ${JSON.stringify(raw)}`).toHaveBeenCalled();
    }
  });

  it('never returns NaN, which the SDK would take at face value', () => {
    for (const raw of [undefined, null, '', 'abc', '0', '-5', 'Infinity', {}]) {
      const seconds = resolvePollSeconds(raw, silentLogger());
      expect(Number.isFinite(seconds) && seconds > 0).toBe(true);
    }
  });
});

/**
 * The failure Dev A hit against the real project: the ConfigCat client becomes
 * ready while holding no flag data, and `initialize()` throws. Registration
 * rejects, and the app has to carry on with its declared defaults rather than
 * surfacing an error or blocking on a control plane it cannot reach.
 */
describe('a ConfigCat provider that fails to initialize', () => {
  const envWithKey = { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY };

  beforeEach(() => {
    configCatCreate.mockReturnValue(fakeProvider({
      initialize: async () => {
        throw new Error('config json is not present');
      },
    }));
  });

  it('degrades to the declared defaults instead of rejecting', async () => {
    const logger = silentLogger();
    const name = await initFeatureFlags({ env: envWithKey, logger });

    expect(name).toBe('none');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('leaves flags readable at their declared default', async () => {
    await initFeatureFlags({ env: envWithKey, logger: silentLogger() });
    // Safe default: an unreachable control plane must never reveal unfinished
    // work, so the gated feature stays hidden.
    expect(OpenFeature.getClient().getBooleanValue(TENANT_UPGRADE, false)).toBe(false);
  });

  it('never blocks startup, whatever the provider does', async () => {
    await expect(initFeatureFlags({ env: envWithKey, logger: silentLogger() })).resolves.toBeDefined();
  });

  it('degrades the same way when the lazy import itself fails', async () => {
    configCatCreate.mockImplementation(() => {
      throw new Error('chunk load failed');
    });
    const name = await initFeatureFlags({ env: envWithKey, logger: silentLogger() });
    expect(name).toBe('none');
  });
});

describe('a healthy ConfigCat provider', () => {
  it('is registered and reported by name', async () => {
    const name = await initFeatureFlags({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    expect(name).toBe('configcat-web');
    expect(configCatCreate).toHaveBeenCalledTimes(1);
  });

  it('reports "unknown" for a nameless provider, which is not a failure', async () => {
    // `metadata` itself must stay — OpenFeature refuses to register a provider
    // without it, which is a registration failure ('none'), a different case.
    configCatCreate.mockReturnValue({ ...fakeProvider(), metadata: {} });

    const name = await initFeatureFlags({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    // 'unknown' means registered but unidentified; 'none' means registration
    // failed. Collapsing the two would hide a working control plane.
    expect(name).toBe('unknown');
    expect(name).not.toBe('none');
  });
});
