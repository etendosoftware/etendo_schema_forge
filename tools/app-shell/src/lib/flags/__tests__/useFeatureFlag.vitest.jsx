// @covers tools/app-shell/src/lib/flags/useFeatureFlag.js
// @covers tools/app-shell/src/lib/flags/bootstrap.js
// @covers tools/app-shell/src/lib/flags/flag-keys.js
// @covers tools/app-shell/src/lib/flags/useAccountIdentity.js
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

const authState = vi.hoisted(() => ({ current: {} }));
const sessionFetch = vi.hoisted(() => vi.fn());
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => authState.current }));
vi.mock('@/hooks/useNeoResource.js', () => ({ getApiBase: () => '' }));
vi.mock('@etendosoftware/app-shell-core/auth/api', () => ({
  apiFetch: sessionFetch,
  authHeaders: token => token ? { Authorization: `Bearer ${token}` } : {},
}));
const trackMock = vi.fn();
const identifyMock = vi.fn();
const groupMock = vi.fn();
vi.mock('@/lib/observability.js', () => ({
  track: (...args) => trackMock(...args),
  addFeatureFlagEvaluation: vi.fn(),
  identify: (...args) => identifyMock(...args),
  group: (...args) => groupMock(...args),
  reset: vi.fn(),
}));

import { OpenFeature, OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/web-sdk';
import { useFeatureFlag, useNumberFlag } from '../useFeatureFlag.js';
import { useAccountIdentity } from '../useAccountIdentity.js';
import {
  initFeatureFlags,
  setFeatureFlagContext,
  parseFlagConfig,
  buildInMemoryConfiguration,
  buildEvaluationContext,
  readSessionContext,
  refreshAccountIdentity,
  clearAccountIdentity,
} from '../bootstrap.js';
import {
  PROOF_OF_CONCEPT_MENU,
  WEBMCP_AGENT_CHAT,
  IMPORT_BATCH_SIZE,
  FLAG_DEFAULTS,
  defaultForFlag,
} from '../flag-keys.js';
import { createFlagExposureHook, resetExposureCache } from '../flag-exposure.js';
import { clearSessionIdentity, setSessionIdentity } from '../../sessionIdentity.js';

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
  clearSessionIdentity();
  // Mocks first: teardown calls the same OpenFeature methods some tests stub,
  // and a stubbed rejection reached from here surfaces as an unhandled rejection.
  vi.restoreAllMocks();
  await resetOpenFeature();
});

describe('flag-keys — declared defaults', () => {
  it('declares proof-of-concept-menu as off, hiding internal tooling by default', () => {
    expect(FLAG_DEFAULTS[PROOF_OF_CONCEPT_MENU]).toBe(false);
  });

  it('declares webmcp-agent-chat as off by default', () => {
    expect(FLAG_DEFAULTS[WEBMCP_AGENT_CHAT]).toBe(false);
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

describe('refreshAccountIdentity — stale telemetry guard', () => {
  it('does not restore tenant grouping after logout during identify', async () => {
    const deferred = () => {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      return { promise, resolve };
    };
    const identifyStarted = deferred();
    const releaseIdentify = deferred();
    identifyMock.mockImplementationOnce(async () => {
      identifyStarted.resolve();
      await releaseIdentify.promise;
    });
    groupMock.mockResolvedValue(undefined);
    setSessionIdentity({ username: 'ana', clientId: 'client-1' });

    const refresh = refreshAccountIdentity({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accountId: 'ACC-1', accountEmail: 'ana@example.com' }),
      }),
      storage: globalThis.localStorage,
    });
    await identifyStarted.promise;

    clearAccountIdentity(globalThis.localStorage);
    releaseIdentify.resolve();
    await refresh;

    expect(groupMock).not.toHaveBeenCalled();
  });

  it('allows the same flag value to be reported again for a new tenant', () => {
    const hook = createFlagExposureHook();
    const context = {
      flagKey: PROOF_OF_CONCEPT_MENU,
      providerMetadata: { name: 'ConfigCatWebProvider' },
      context: { targetingKey: 'account-1' },
    };
    hook.after(context, { value: true, variant: 'on' });
    clearAccountIdentity(globalThis.localStorage);
    hook.after({ ...context, context: { targetingKey: 'account-2' } }, { value: true, variant: 'on' });

    expect(trackMock.mock.calls.filter(([name]) => name === 'feature_flag_evaluated')).toHaveLength(2);
  });
});

describe('parseFlagConfig', () => {
  it('returns an empty map for an unset value', () => {
    expect(parseFlagConfig(undefined, silentLogger)).toEqual({});
    expect(parseFlagConfig('', silentLogger)).toEqual({});
  });

  it('keeps only boolean and finite-number entries (ETP-5676: numeric flags)', () => {
    const raw = JSON.stringify({ 'a-flag': true, 'b-flag': false, 'c-flag': 'yes', 'd-flag': 1 });
    expect(parseFlagConfig(raw, silentLogger)).toEqual({ 'a-flag': true, 'b-flag': false, 'd-flag': 1 });
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
  // ETP-5455 — identity used to come from the legacy `sf_auth_user` / `sf_auth_client_id` keys,
  // which nothing writes since the cookie session; it now comes from the session identity.
  it('reads identity from the session identity', () => {
    setSessionIdentity({ username: 'ada@example.com', clientId: 'client-1' });
    expect(readSessionContext()).toEqual({ username: 'ada@example.com', clientId: 'client-1' });
  });

  it('ignores the legacy sf_auth_user / sf_auth_client_id keys', () => {
    globalThis.localStorage.setItem('sf_auth_user', 'stale@example.com');
    globalThis.localStorage.setItem('sf_auth_client_id', 'stale-client');
    expect(readSessionContext()).toEqual({});
  });

  it('returns an empty context when storage throws', () => {
    expect(readSessionContext({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });

  it('omits keys with no value rather than sending empty strings', () => {
    expect(buildEvaluationContext({})).toEqual({});
    expect(buildEvaluationContext({ username: 'ada' })).toEqual({ targetingKey: 'ada' });
    expect(buildEvaluationContext({ clientId: 'c1' })).toEqual({ account_id: 'c1', clientId: 'c1' });
  });

  // ETP-5751 — Datadog targeting rules compare `email` case-sensitively against lowercase values.
  it('uses the backend account email targeting key and normalizes the email attribute', () => {
    expect(buildEvaluationContext({ accountId: 'Acc-1', accountEmail: '  Ada.Lovelace@Example.COM ' }))
      .toEqual({ targetingKey: 'Ada.Lovelace@Example.COM', accountId: 'Acc-1', email: 'ada.lovelace@example.com', Email: 'Ada.Lovelace@Example.COM' });
    expect(buildEvaluationContext({ accountEmail: '   ' })).toEqual({});
  });

  it('targets the backend account email after the account identity resolves', async () => {
    setSessionIdentity({ username: 'ada', clientId: 'c1' });
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ accountId: 'Acc-1', accountEmail: 'Ada@Example.com' }) }));
    await refreshAccountIdentity({ fetchImpl, logger: silentLogger });
    expect(OpenFeature.getContext()).toMatchObject({ targetingKey: 'Ada@Example.com', email: 'ada@example.com' });
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

// ETP-5676 — a numeric flag (`import-batch-size`) alongside the boolean ones.
describe('numeric flags', () => {
  it('declares import-batch-size with a numeric default of 0 that defaultForFlag does not turn into false', () => {
    expect(FLAG_DEFAULTS[IMPORT_BATCH_SIZE]).toBe(0);
    expect(defaultForFlag(IMPORT_BATCH_SIZE)).toBe(0);
  });

  it('parseFlagConfig keeps finite numbers next to booleans and still drops everything else', () => {
    const raw = JSON.stringify({
      [IMPORT_BATCH_SIZE]: 7, [PROOF_OF_CONCEPT_MENU]: true, text: 'x', nothing: null, list: [1],
    });
    expect(parseFlagConfig(raw, silentLogger)).toEqual({ [IMPORT_BATCH_SIZE]: 7, [PROOF_OF_CONCEPT_MENU]: true });
  });

  it('buildInMemoryConfiguration emits a numeric variant and leaves booleans on/off', () => {
    const config = buildInMemoryConfiguration({ [IMPORT_BATCH_SIZE]: 12, [PROOF_OF_CONCEPT_MENU]: true });
    expect(config[IMPORT_BATCH_SIZE].variants[config[IMPORT_BATCH_SIZE].defaultVariant]).toBe(12);
    expect(config[PROOF_OF_CONCEPT_MENU].defaultVariant).toBe('on');
    expect(buildInMemoryConfiguration()[IMPORT_BATCH_SIZE].variants.value).toBe(0);
  });

  it('useNumberFlag answers the declared default with no provider', () => {
    const { result } = renderHook(() => useNumberFlag(IMPORT_BATCH_SIZE));
    expect(result.current).toBe(0);
  });

  it('useNumberFlag reads the number once the provider is seeded, and re-renders a mounted component', async () => {
    const { result } = renderHook(() => useNumberFlag(IMPORT_BATCH_SIZE));
    await act(async () => {
      await initFeatureFlags({ env: { VITE_FEATURE_FLAGS: JSON.stringify({ [IMPORT_BATCH_SIZE]: 7 }) }, logger: silentLogger });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBe(7), { timeout: 1000 });
  });

  it('useNumberFlag keeps the default when the control plane names no override', async () => {
    await act(async () => {
      await initFeatureFlags({ env: {}, logger: silentLogger });
    });
    const { result } = renderHook(() => useNumberFlag(IMPORT_BATCH_SIZE));
    expect(result.current).toBe(0);
  });
});


/** Remote-provider boundary: context changes request assignments; reads are local. */
function contextRecordingProvider() {
  return {
    metadata: { name: 'context-recording' },
    initialize: async () => {},
    onContextChange: vi.fn(async () => {}),
    resolveBooleanEvaluation: () => ({ value: true, reason: 'TARGETING_MATCH' }),
  };
}

function deferredResult() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

describe('assignment requests follow identity changes', () => {
  const identity = { username: 'admin', clientId: 'company-a', accountId: 'account-a', accountEmail: 'ana@example.com' };

  it('does not request assignments again for an identical settled context', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    await setFeatureFlagContext(identity);
    await setFeatureFlagContext({ ...identity });
    expect(provider.onContextChange).toHaveBeenCalledTimes(1);
  });

  it('coalesces identical context updates while the assignment request is pending', async () => {
    const provider = contextRecordingProvider();
    const request = deferredResult();
    provider.onContextChange.mockImplementation(() => request.promise);
    await OpenFeature.setProviderAndWait(provider);
    const first = setFeatureFlagContext(identity);
    const second = setFeatureFlagContext({ ...identity });
    request.resolve();
    await Promise.all([first, second]);
    expect(provider.onContextChange).toHaveBeenCalledTimes(1);
  });

  it('sends the company under the clientId attribute used by backend targeting rules', () => {
    expect(buildEvaluationContext(identity)).toMatchObject({ clientId: 'company-a' });
  });

  it('makes one assignment request when the same account changes company', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    await setFeatureFlagContext(identity);
    provider.onContextChange.mockClear();
    await setFeatureFlagContext({ ...identity, clientId: 'company-b' });
    expect(provider.onContextChange).toHaveBeenCalledTimes(1);
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a', account_id: 'company-b' });
  });

  it('does not turn repeated local flag reads into assignment requests', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    await setFeatureFlagContext(identity);
    provider.onContextChange.mockClear();
    const { result, rerender } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    rerender();
    rerender();
    expect(result.current).toBe(true);
    expect(provider.onContextChange).not.toHaveBeenCalled();
  });
});

describe('account lookup across company changes', () => {
  it('ignores a late lookup response from the previous company', async () => {
    const previous = deferredResult();
    const started = deferredResult();
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    const oldLookup = refreshAccountIdentity({ fetchImpl: () => { started.resolve(); return previous.promise; }, logger: silentLogger });
    await started.promise;
    setSessionIdentity({ username: 'admin', clientId: 'company-b' });
    await refreshAccountIdentity({
      fetchImpl: async () => ({ ok: true, json: async () => ({ accountId: 'account-b', accountEmail: 'b@example.com' }) }),
      logger: silentLogger,
    });
    previous.resolve({ ok: true, json: async () => ({ accountId: 'account-a', accountEmail: 'a@example.com' }) });
    await oldLookup;
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-b', account_id: 'company-b', email: 'b@example.com' });
    expect(localStorage.getItem('sf_account_id')).toBe('account-b');
    expect(identifyMock).not.toHaveBeenCalledWith('account-a');
  });

  it('keeps the previous account and its flags cleared when lookup of the new account fails', async () => {
    let acceptedContext = {};
    const provider = contextRecordingProvider();
    provider.onContextChange.mockImplementation(async (_previous, next) => { acceptedContext = next; });
    provider.resolveBooleanEvaluation = () => ({ value: acceptedContext.accountId === 'account-a', reason: 'TARGETING_MATCH' });
    await OpenFeature.setProviderAndWait(provider);
    localStorage.setItem('sf_account_id', 'account-a');
    localStorage.setItem('sf_account_email', 'a@example.com');
    await setFeatureFlagContext({ username: 'admin', clientId: 'company-a', accountId: 'account-a', accountEmail: 'a@example.com' });
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(true);
    await clearAccountIdentity();
    setSessionIdentity({ username: 'admin', clientId: 'company-b' });
    await refreshAccountIdentity({ fetchImpl: async () => ({ ok: false }), logger: silentLogger });
    expect(OpenFeature.getContext()).toEqual({});
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(false);
    expect(localStorage.getItem('sf_account_id')).toBeNull();
    expect(identifyMock).not.toHaveBeenCalled();
  });
});

describe('provider availability changes', () => {
  it('refreshes a mounted flag to its safe default when the provider reports an evaluation failure', async () => {
    const provider = contextRecordingProvider();
    provider.events = new OpenFeatureEventEmitter();
    await OpenFeature.setProviderAndWait(provider);
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(true);
    await act(async () => {
      provider.resolveBooleanEvaluation = () => { throw new Error('assignments unavailable'); };
      provider.events.emit(ProviderEvents.Error, { message: 'assignments unavailable' });
      await Promise.resolve();
    });
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(false);
    expect(result.current).toBe(false);
  });

  it('keeps the last accepted value when the provider reports stale cached assignments', async () => {
    const provider = contextRecordingProvider();
    provider.events = new OpenFeatureEventEmitter();
    await OpenFeature.setProviderAndWait(provider);
    const { result } = renderHook(() => useFeatureFlag(PROOF_OF_CONCEPT_MENU));
    await act(async () => {
      provider.events.emit(ProviderEvents.Stale);
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
    expect(OpenFeature.getClient().getBooleanValue(PROOF_OF_CONCEPT_MENU, false)).toBe(true);
  });
});


describe('authenticated account targeting integration', () => {
  const account = { id: 'account-a', email: 'a@example.test' };

  beforeEach(() => {
    sessionFetch.mockReset();
    authState.current = { isAuthenticated: true, token: null, username: 'admin', clientId: 'company-a', account };
  });

  it('updates company assignments once without resetting the same account', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a', clientId: 'company-a' }));
    provider.onContextChange.mockClear();
    identifyMock.mockClear();
    authState.current = { ...authState.current, clientId: 'company-b' };
    hook.rerender();
    await waitFor(() => expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a', clientId: 'company-b' }));
    expect(provider.onContextChange).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('sf_account_id')).toBe('account-a');
    expect(groupMock).toHaveBeenLastCalledWith('account_id', 'company-b');
    expect(sessionFetch).not.toHaveBeenCalled();
  });

  it('replaces account and email when ERP user and company stay the same', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a' }));
    authState.current = { ...authState.current, account: { id: 'account-b', email: 'b@example.test' } };
    hook.rerender();
    await waitFor(() => expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-b', targetingKey: 'b@example.test' }));
    expect(localStorage.getItem('sf_account_email')).toBe('b@example.test');
    expect(identifyMock).toHaveBeenLastCalledWith('account-b');
  });

  it('discards a delayed legacy lookup after leaving and returning to the same company', async () => {
    const old = deferredResult();
    authState.current = { ...authState.current, account: undefined };
    sessionFetch.mockReturnValueOnce(old.promise).mockResolvedValue({ ok: true, json: async () => ({ accountId: 'fresh-account', accountEmail: 'fresh@example.test' }) });
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(sessionFetch).toHaveBeenCalledTimes(1));
    authState.current = { ...authState.current, clientId: 'company-b' };
    hook.rerender();
    await waitFor(() => expect(sessionFetch).toHaveBeenCalledTimes(2));
    authState.current = { ...authState.current, clientId: 'company-a' };
    hook.rerender();
    await waitFor(() => expect(sessionFetch).toHaveBeenCalledTimes(3));
    await act(async () => {
      old.resolve({ ok: true, json: async () => ({ accountId: 'old-account', accountEmail: 'old@example.test' }) });
      await old.promise;
    });
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'fresh-account', clientId: 'company-a' });
    expect(localStorage.getItem('sf_account_id')).toBe('fresh-account');
    expect(identifyMock).not.toHaveBeenCalledWith('old-account');
  });

  it('clears a different cached account before accepting the restored account', async () => {
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    localStorage.setItem('sf_account_id', 'previous-account');
    localStorage.setItem('sf_account_email', 'previous@example.test');
    renderHook(() => useAccountIdentity());
    await waitFor(() => expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a', targetingKey: 'a@example.test' }));
    expect(provider.onContextChange.mock.calls.some(([, next]) => Object.keys(next).length === 0)).toBe(true);
    expect(localStorage.getItem('sf_account_id')).toBe('account-a');
  });

  it('does not merge a previous account email into an incomplete new account', async () => {
    localStorage.setItem('sf_account_id', 'previous-account');
    localStorage.setItem('sf_account_email', 'previous@example.test');
    await setFeatureFlagContext({ username: 'admin', clientId: 'company-a', accountId: 'new-account' });
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'new-account' });
    expect(OpenFeature.getContext().email).toBeUndefined();
    expect(localStorage.getItem('sf_account_email')).toBeNull();
  });

  it('retries a failed context update for the same identity', async () => {
    const provider = contextRecordingProvider();
    provider.onContextChange.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
    await OpenFeature.setProviderAndWait(provider);
    const identity = { username: 'admin', clientId: 'company-a', accountId: account.id, accountEmail: account.email };
    await setFeatureFlagContext(identity, silentLogger);
    expect(OpenFeature.getProviderStatus()).toBe('ERROR');
    await setFeatureFlagContext(identity, silentLogger);
    expect(provider.onContextChange).toHaveBeenCalledTimes(2);
    expect(OpenFeature.getProviderStatus()).toBe('READY');
  });
});

describe('cached account ownership', () => {
  it('does not restore an unverified cached account from a session telemetry context update', async () => {
    await clearAccountIdentity();
    localStorage.setItem('sf_account_id', 'previous-account');
    localStorage.setItem('sf_account_email', 'previous@example.test');
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    await setFeatureFlagContext({ username: 'admin', clientId: 'company-a' });
    expect(OpenFeature.getContext().accountId).toBeUndefined();
    expect(OpenFeature.getContext().email).toBeUndefined();
    expect(OpenFeature.getContext().targetingKey).toBe('admin');
  });

  it('does not trust cached account fields at startup even after session metadata is present', async () => {
    await clearAccountIdentity();
    localStorage.setItem('sf_account_id', 'previous-account');
    localStorage.setItem('sf_account_email', 'previous@example.test');
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    await initFeatureFlags({ env: {}, logger: silentLogger });
    expect(OpenFeature.getContext()).toMatchObject({ targetingKey: 'admin', clientId: 'company-a' });
    expect(OpenFeature.getContext().accountId).toBeUndefined();
    expect(OpenFeature.getContext().email).toBeUndefined();
  });

  it('detects a changed cached account before a legacy lookup replaces its ownership', async () => {
    await clearAccountIdentity();
    const provider = contextRecordingProvider();
    await OpenFeature.setProviderAndWait(provider);
    localStorage.setItem('sf_account_id', 'previous-account');
    localStorage.setItem('sf_account_email', 'previous@example.test');
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    const resolved = await refreshAccountIdentity({ fetchImpl: async () => ({ ok: true, json: async () => ({ accountId: 'new-account' }) }), logger: silentLogger });
    expect(resolved).toMatchObject({ accountId: 'new-account', flagsResolved: true });
    expect(identifyMock).toHaveBeenLastCalledWith('new-account');
    expect(groupMock).toHaveBeenLastCalledWith('account_id', 'company-a');
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'new-account' });
    expect(OpenFeature.getContext().email).toBeUndefined();
    expect(localStorage.getItem('sf_account_email')).toBeNull();
    expect(provider.onContextChange.mock.calls.some(([, next]) => Object.keys(next).length === 0)).toBe(true);
  });
});

describe('bounded cookie-context recovery', () => {
  afterEach(() => vi.useRealTimers());

  function cookieAccount(id = 'account-a') {
    return { isAuthenticated: true, token: null, username: 'admin', clientId: 'company-a', account: { id, email: `${id}@example.test` } };
  }

  it('retries a failed cookie context and stops retrying after it becomes ready', async () => {
    vi.useFakeTimers();
    const provider = contextRecordingProvider();
    provider.onContextChange.mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(undefined);
    await OpenFeature.setProviderAndWait(provider);
    authState.current = cookieAccount();
    await act(async () => { renderHook(() => useAccountIdentity()); });
    expect(provider.onContextChange).toHaveBeenCalledTimes(1);
    expect(OpenFeature.getProviderStatus()).toBe('ERROR');
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(provider.onContextChange).toHaveBeenCalledTimes(2);
    expect(OpenFeature.getProviderStatus()).toBe('READY');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(provider.onContextChange).toHaveBeenCalledTimes(2);
  });

  it('bounds an unavailable cookie context to two automatic retries', async () => {
    vi.useFakeTimers();
    const provider = contextRecordingProvider();
    provider.onContextChange.mockRejectedValue(new Error('offline'));
    await OpenFeature.setProviderAndWait(provider);
    authState.current = cookieAccount();
    await act(async () => { renderHook(() => useAccountIdentity()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(provider.onContextChange).toHaveBeenCalledTimes(3);
  });

  it('cancels retry timers from an account that has been replaced', async () => {
    vi.useFakeTimers();
    const provider = contextRecordingProvider();
    provider.onContextChange.mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(undefined);
    await OpenFeature.setProviderAndWait(provider);
    authState.current = cookieAccount();
    let hook;
    await act(async () => { hook = renderHook(() => useAccountIdentity()); });
    authState.current = cookieAccount('account-b');
    await act(async () => { hook.rerender(); });
    const callsAfterSwitch = provider.onContextChange.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(provider.onContextChange).toHaveBeenCalledTimes(callsAfterSwitch);
    expect(OpenFeature.getContext().accountId).toBe('account-b');
  });
});


describe('returning to an earlier resolved company', () => {
  it('restores company A after an unsuccessful transition to company B', async () => {
    const provider = contextRecordingProvider();
    provider.onContextChange.mockImplementation(async (_old, next) => {
      if (next.clientId === 'company-b') throw new Error('company-b unavailable');
    });
    await OpenFeature.setProviderAndWait(provider);
    authState.current = { isAuthenticated: true, token: null, username: 'admin', clientId: 'company-a', account: { id: 'account-a', email: 'a@example.test' } };
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(groupMock).toHaveBeenLastCalledWith('account_id', 'company-a'));
    authState.current = { ...authState.current, clientId: 'company-b' };
    hook.rerender();
    await waitFor(() => expect(OpenFeature.getProviderStatus()).toBe('ERROR'));
    authState.current = { ...authState.current, clientId: 'company-a' };
    hook.rerender();
    await waitFor(() => expect(OpenFeature.getContext().clientId).toBe('company-a'));
    expect(OpenFeature.getProviderStatus()).toBe('READY');
  });
});


describe('external identity epochs', () => {
  it('does not adopt a new login epoch even when it restores the same account and company', async () => {
    const started = deferredResult();
    const release = deferredResult();
    identifyMock.mockImplementationOnce(async () => { started.resolve(); await release.promise; });
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    const staleLookup = refreshAccountIdentity({
      fetchImpl: async () => ({ ok: true, json: async () => ({ accountId: 'account-a', accountEmail: 'a@example.test' }) }),
      logger: silentLogger,
    });
    await started.promise;
    await clearAccountIdentity();
    setSessionIdentity({ username: 'admin', clientId: 'company-a' });
    await setFeatureFlagContext({ username: 'admin', clientId: 'company-a', accountId: 'account-a', accountEmail: 'a@example.test' });
    release.resolve();
    expect(await staleLookup).toBeUndefined();
    expect(groupMock).not.toHaveBeenCalled();
    expect(OpenFeature.getContext()).toMatchObject({ accountId: 'account-a', clientId: 'company-a' });
  });
});
