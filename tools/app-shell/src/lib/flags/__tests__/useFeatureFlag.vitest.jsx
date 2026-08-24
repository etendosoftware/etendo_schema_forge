import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Feature-flag foundation — hook + bootstrap (ETP-4686).
 *
 * Covers the three rules stated in `docs/feature-flags.md`:
 *   1. the safe default lives in code and answers whenever the control plane cannot;
 *   2. nothing here blocks rendering, and a failing provider never throws;
 *   3. the value is whatever the control plane says once it is ready.
 *
 * OpenFeature is a process-wide singleton, so every test tears the provider,
 * hooks and context back down — otherwise a registered provider leaks into the
 * next test and the "no provider" cases silently pass for the wrong reason.
 */

const trackMock = vi.fn();
vi.mock('@/lib/observability.js', () => ({
  track: (...args) => trackMock(...args),
}));

import { OpenFeature } from '@openfeature/web-sdk';
import { useFeatureFlag } from '../useFeatureFlag.js';
import {
  initFeatureFlags,
  setFeatureFlagContext,
  parseFlagConfig,
  buildInMemoryConfiguration,
  buildEvaluationContext,
  readSessionContext,
} from '../bootstrap.js';
import {
  PROOF_OF_CONCEPT_MENU,
  FLAG_DEFAULTS,
  defaultForFlag,
} from '../flag-keys.js';
import { resetExposureCache } from '../flag-exposure.js';

const FLAG_ON = JSON.stringify({ [PROOF_OF_CONCEPT_MENU]: true });
const silentLogger = { warn: vi.fn(), error: vi.fn() };

async function resetOpenFeature() {
  await OpenFeature.clearProviders();
  OpenFeature.clearHooks();
  await OpenFeature.clearContexts();
  await OpenFeature.setContext({});
  resetExposureCache();
}

beforeEach(async () => {
  vi.clearAllMocks();
  globalThis.localStorage?.clear?.();
  await resetOpenFeature();
});

afterEach(async () => {
  // Mocks first: teardown calls the same OpenFeature methods some tests stub,
  // and a stubbed rejection reached from here surfaces as an unhandled rejection.
  vi.restoreAllMocks();
  await resetOpenFeature();
});

describe('flag-keys — declared defaults', () => {
  it('declares proof-of-concept-menu as off, hiding internal tooling by default', () => {
    expect(FLAG_DEFAULTS[PROOF_OF_CONCEPT_MENU]).toBe(false);
  });

  it('resolves an unknown key to false so a typo hides the feature', () => {
    expect(defaultForFlag('no-such-flag')).toBe(false);
  });
});

describe('useFeatureFlag — GATE 1: default with the flag unset', () => {
  it('returns false when no provider has been registered', () => {
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);
  });

  it('returns false when the provider is registered but names no override', async () => {
    await act(async () => {
      await initFeatureFlags({ env: {}, logger: silentLogger });
    });
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);
  });

  it('honours an explicit default passed by the caller', () => {
    const { result } = renderHook(() => useFeatureFlag('unregistered-flag', true));
    expect(result.current).toBe(true);
  });
});

describe('useFeatureFlag — GATE 2: flag on via VITE_FEATURE_FLAGS', () => {
  it('returns true once the provider is seeded with the override', async () => {
    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
    });
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(true);
  });

  /**
   * Regression guard for the provider-ready transition (fixed in f71c231f8).
   *
   * The SDK announces readiness before the provider is actually installed, so a
   * subscriber that only re-reads synchronously observes the old value and the
   * component never updates — see the ordering note in `useFeatureFlag.js`. The
   * mount-first path is the one that breaks, so it is the one asserted here:
   * mounting after the provider settles (the next test) passes either way and
   * would not catch a regression.
   */
  it('re-renders an already-mounted component when the provider becomes ready', async () => {
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);

    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
      // The corrective notification is deliberately deferred by a microtask;
      // drain it inside `act` so the re-render it causes is captured here rather
      // than landing afterwards as an unwrapped update.
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).toBe(true), { timeout: 1000 });
  });

  it('is unaffected when it mounts after the provider is already ready', async () => {
    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
    });
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(true);
  });

  it('reports the registered provider name', async () => {
    const name = await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
    expect(name).toBe('in-memory');
  });
});

describe('useFeatureFlag — GATE 3: provider down or unconfigured', () => {
  it('falls back to the declared default and never rejects when startup fails', async () => {
    vi.spyOn(OpenFeature, 'setProviderAndWait').mockRejectedValue(new Error('control plane unreachable'));
    const logger = { warn: vi.fn() };

    const name = await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger });

    expect(name).toBe('none');
    expect(logger.warn).toHaveBeenCalled();

    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);
  });

  it('renders without crashing when localStorage throws while reading identity', async () => {
    const hostileStorage = {
      getItem: () => {
        throw new Error('storage disabled');
      },
    };
    const name = await initFeatureFlags({ env: {}, logger: silentLogger, storage: hostileStorage });
    expect(name).toBe('in-memory');

    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);
  });

  it('ignores a malformed VITE_FEATURE_FLAGS instead of breaking startup', async () => {
    const logger = { warn: vi.fn() };
    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: '{not json' }, logger });
    });
    expect(logger.warn).toHaveBeenCalled();

    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(false);
  });

  it('unsubscribes its provider handlers on unmount', async () => {
    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
    });
    const { result, unmount } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    expect(result.current).toBe(true);
    expect(() => unmount()).not.toThrow();
  });
});

describe('parseFlagConfig', () => {
  it('returns an empty map for an unset value', () => {
    expect(parseFlagConfig(undefined, silentLogger)).toEqual({});
    expect(parseFlagConfig('', silentLogger)).toEqual({});
  });

  it('keeps only boolean entries', () => {
    const raw = JSON.stringify({ 'a-flag': true, 'b-flag': false, 'c-flag': 'yes', 'd-flag': 1 });
    expect(parseFlagConfig(raw, silentLogger)).toEqual({ 'a-flag': true, 'b-flag': false });
  });

  it('rejects a JSON array or null payload', () => {
    expect(parseFlagConfig('[1,2]', silentLogger)).toEqual({});
    expect(parseFlagConfig('null', silentLogger)).toEqual({});
  });

  it('warns once and degrades to defaults on invalid JSON', () => {
    const logger = { warn: vi.fn() };
    expect(parseFlagConfig('{oops', logger)).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('buildInMemoryConfiguration', () => {
  it('seeds every declared flag even when the env names none', () => {
    const config = buildInMemoryConfiguration();
    expect(config[PROOF_OF_CONCEPT_MENU]).toEqual({
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
    });
  });

  it('lets an override flip the declared default', () => {
    const config = buildInMemoryConfiguration({ [PROOF_OF_CONCEPT_MENU]: true });
    expect(config[PROOF_OF_CONCEPT_MENU].defaultVariant).toBe('on');
  });

  it('adds flags present only in the override', () => {
    const config = buildInMemoryConfiguration({ 'future-flag': true });
    expect(config['future-flag'].defaultVariant).toBe('on');
    expect(config[PROOF_OF_CONCEPT_MENU].defaultVariant).toBe('off');
  });
});

describe('evaluation context', () => {
  it('reads identity from the observability storage keys', () => {
    globalThis.localStorage.setItem('sf_auth_user', 'ada@example.com');
    globalThis.localStorage.setItem('sf_auth_client_id', 'client-1');
    expect(readSessionContext()).toEqual({ username: 'ada@example.com', clientId: 'client-1' });
  });

  it('returns an empty context when storage throws', () => {
    expect(readSessionContext({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });

  it('omits keys with no value rather than sending empty strings', () => {
    expect(buildEvaluationContext({})).toEqual({});
    expect(buildEvaluationContext({ username: 'ada' })).toEqual({ targetingKey: 'ada' });
    expect(buildEvaluationContext({ clientId: 'c1' })).toEqual({ account_id: 'c1' });
  });

  it('re-targets after sign-in without throwing', async () => {
    await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: FLAG_ON }, logger: silentLogger });
    await setFeatureFlagContext({ username: 'ada', clientId: 'c1' });
    expect(OpenFeature.getContext()).toMatchObject({ targetingKey: 'ada', account_id: 'c1' });
  });

  it('swallows a context-update failure', async () => {
    vi.spyOn(OpenFeature, 'setContext').mockRejectedValue(new Error('nope'));
    const logger = { warn: vi.fn() };
    await expect(setFeatureFlagContext({ username: 'ada' }, logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
