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
import {
  createFlagProvider,
  resolvePollSeconds,
  initFeatureFlags,
  CONFIGCAT_PROVIDER_NAME,
} from '../bootstrap.js';
import { PROOF_OF_CONCEPT_MENU } from '../flag-keys.js';
import { resetExposureCache } from '../flag-exposure.js';

vi.mock('@/lib/observability.js', () => ({ track: vi.fn() }));

/** Obviously not a credential — the real key never enters a committed file. */
const PLACEHOLDER_SDK_KEY = 'not-a-real-configcat-key-for-tests-only';

const DEFAULT_POLL_SECONDS = 60;

const silentLogger = () => ({ warn: vi.fn(), error: vi.fn() });

/**
 * A provider shaped enough for OpenFeature to register and evaluate against.
 *
 * `name` stands in for whatever the upstream SDK reports about itself. It is
 * deliberately NOT what the ConfigCat branch ends up reporting: that branch pins
 * `CONFIGCAT_PROVIDER_NAME` over it, so this value should never be observable
 * downstream. See the provider-name stability tests below.
 */
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
    expect(provider.metadata.name).toBe(CONFIGCAT_PROVIDER_NAME);
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

/**
 * Provider-name stability.
 *
 * `ConfigCatWebProvider` derives its own `metadata.name` from
 * `ConfigCatWebProvider.name` — the JS class name, which a production minifier
 * renames per build. A Mixpanel board showed the same real provider arriving as
 * both "_ConfigCatWebProvider" and "ut" across deploys, fragmenting every
 * exposure metric grouped by provider. The branch therefore pins a label of its
 * own, and these tests hold that pin unconditional: whatever the SDK calls
 * itself, the reported name is stable across builds.
 */
describe('createFlagProvider — the ConfigCat branch reports a build-independent name', () => {
  const envWithKey = { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY };

  /** The unminified class name, plus two real minified renames seen in production. */
  it.each(['ConfigCatWebProvider', '_ConfigCatWebProvider', 'ut'])(
    'reports the pinned name even when the SDK calls itself "%s"',
    async upstreamName => {
      configCatCreate.mockReturnValue(fakeProvider({ name: upstreamName }));

      const provider = await createFlagProvider({ env: envWithKey, logger: silentLogger() });

      expect(provider.metadata.name).toBe(CONFIGCAT_PROVIDER_NAME);
      expect(provider.metadata.name).not.toBe(upstreamName);
    }
  );

  it('pins the name even when the SDK reports none at all', async () => {
    configCatCreate.mockReturnValue({ ...fakeProvider(), metadata: {} });

    const provider = await createFlagProvider({ env: envWithKey, logger: silentLogger() });

    expect(provider.metadata.name).toBe(CONFIGCAT_PROVIDER_NAME);
  });

  it('replaces only the name, leaving the rest of the metadata intact', async () => {
    configCatCreate.mockReturnValue({
      ...fakeProvider({ name: 'ut' }),
      metadata: { name: 'ut', domain: 'configcat-eu' },
    });

    const provider = await createFlagProvider({ env: envWithKey, logger: silentLogger() });

    expect(provider.metadata).toEqual({ name: CONFIGCAT_PROVIDER_NAME, domain: 'configcat-eu' });
  });

  it('reports the same name across two builds that minified the class differently', async () => {
    configCatCreate.mockReturnValue(fakeProvider({ name: '_ConfigCatWebProvider' }));
    const buildA = await createFlagProvider({ env: envWithKey, logger: silentLogger() });

    configCatCreate.mockReturnValue(fakeProvider({ name: 'ut' }));
    const buildB = await createFlagProvider({ env: envWithKey, logger: silentLogger() });

    // The property the Mixpanel board actually needs: one provider, one label.
    expect(buildA.metadata.name).toBe(buildB.metadata.name);
  });

  it('leaves the two in-memory branches reporting their own name', async () => {
    // The pin is scoped to the ConfigCat branch; nothing else may inherit it.
    const declaredDefaults = await createFlagProvider({ env: {}, logger: silentLogger() });
    const localOverride = await createFlagProvider({
      env: { VITE_FEATURE_FLAGS: JSON.stringify({ [PROOF_OF_CONCEPT_MENU]: true }) },
      logger: silentLogger(),
    });

    expect(declaredDefaults.metadata.name).toBe('in-memory');
    expect(localOverride.metadata.name).toBe('in-memory');
    expect(localOverride.metadata.name).not.toBe(CONFIGCAT_PROVIDER_NAME);
  });
});

describe('createFlagProvider — branch 1: a local override beats the remote plane', () => {
  const bothConfigured = {
    VITE_FEATURE_FLAGS: JSON.stringify({ [PROOF_OF_CONCEPT_MENU]: true }),
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
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(true);
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
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(false);
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
    expect(name).toBe(CONFIGCAT_PROVIDER_NAME);
    expect(configCatCreate).toHaveBeenCalledTimes(1);
  });

  it('reports the pinned name for a nameless provider, rather than "unknown"', async () => {
    // `metadata` itself must stay — OpenFeature refuses to register a provider
    // without it, which is a registration failure ('none'), a different case.
    //
    // This used to report 'unknown' (registered but unidentified). The branch now
    // pins its own name before registering, so a nameless upstream provider is no
    // longer reachable here: the whole point of the pin is that this branch has
    // exactly one identity regardless of what the SDK says about itself. What
    // still matters is the distinction this test was written to protect — a
    // registered provider must never be mistaken for a failed one.
    configCatCreate.mockReturnValue({ ...fakeProvider(), metadata: {} });

    const name = await initFeatureFlags({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    expect(name).toBe(CONFIGCAT_PROVIDER_NAME);
    // 'none' means registration failed. Reporting it for a provider that
    // registered fine would hide a working control plane.
    expect(name).not.toBe('none');
    expect(name).not.toBe('unknown');
  });

  it('resolves flags through the registered provider', async () => {
    // Proves the pinned metadata did not cost registration: a provider whose
    // `metadata` object was replaced still serves evaluations.
    await initFeatureFlags({
      env: { VITE_CONFIGCAT_SDK_KEY: PLACEHOLDER_SDK_KEY },
      logger: silentLogger(),
    });
    // `fakeProvider` resolves every boolean to false with reason STATIC.
    const details = OpenFeature.getClient().getBooleanDetails(PROOF_OF_CONCEPT_MENU, true);
    expect(details.value).toBe(false);
    expect(details.reason).toBe('STATIC');
  });
});
