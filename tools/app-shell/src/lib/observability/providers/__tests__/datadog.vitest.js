// @covers tools/app-shell/src/lib/observability/providers/datadog.js
import { describe, expect, it, vi } from 'vitest';
import {
  SUPPORT_SESSION_CONTEXT_KEY,
  createDatadogProvider,
  redactDatadogEvent,
  redactErrorText,
} from '../datadog.js';
import { createObservability } from '../../core.js';

const env = {
  VITE_DATADOG_ENABLED: 'true',
  VITE_DATADOG_APPLICATION_ID: 'app',
  VITE_DATADOG_CLIENT_TOKEN: 'client',
  VITE_DATADOG_SITE: 'datadoghq.eu',
  VITE_APP_ENV: 'test',
};

function fakeRum() {
  const calls = [];
  const rum = Object.fromEntries([
    'init', 'startView', 'setAccount', 'stopSession', 'clearUser', 'clearAccount',
    'setGlobalContext',
  ].map(method => [method, (...args) => calls.push([method, ...args])]));
  return { calls, rum };
}

describe('Datadog provider', () => {
  // ETP-5351 — `analytics: true` is what silences a provider in a support session. Datadog carries
  // error and performance monitoring, which stays on there, so it must not declare it.
  it('does not declare itself as a suppressible analytics provider', () => {
    expect(createDatadogProvider({ env }).analytics).not.toBe(true);
  });

  it('redacts quoted and standalone bearer credentials', () => {
    const result = redactErrorText('{"authorization":"Bearer secret-a"} Bearer secret-b');
    expect(result).toContain('"authorization": "[redacted]"');
    expect(result).toContain('Bearer [redacted]');
    expect(result).not.toContain('secret-a');
    expect(result).not.toContain('secret-b');
  });

  it('starts a new RUM view after a tenant reset and assignment', async () => {
    const { calls, rum } = fakeRum();
    const provider = createDatadogProvider({
      env,
      loader: vi.fn().mockResolvedValue({ datadogRum: rum }),
    });

    await provider.init();
    const initialViews = calls.filter(([method]) => method === 'startView').length;
    await provider.group('account_id', 'tenant-a');
    await provider.reset();
    expect(calls.filter(([method]) => method === 'startView').length).toBe(initialViews);

    await provider.group('account_id', 'tenant-b');
    expect(calls.filter(([method]) => method === 'startView').length).toBe(initialViews + 1);
    const accountIndex = calls.findLastIndex(([method, args]) => method === 'setAccount' && args.id === 'tenant-b');
    const viewIndex = calls.findLastIndex(([method]) => method === 'startView');
    expect(accountIndex).toBeLessThan(viewIndex);
  });
});

// ETP-5351 — a support session ("Soporte Etendo" inside a customer's tenant). Product events stay
// out of Datadog (the core cuts `track`); monitoring stays on, and every event carries the marker
// so the automatic click actions can be filtered out of the dashboards.
describe('Datadog provider in a support session', () => {
  // A fake RUM client that keeps its global context the way the SDK does.
  function statefulRum() {
    const calls = [];
    let globalContext = {};
    const record = method => (...args) => calls.push([method, ...args]);
    const rum = {
      init: record('init'),
      startView: record('startView'),
      addAction: record('addAction'),
      addError: record('addError'),
      addFeatureFlagEvaluation: record('addFeatureFlagEvaluation'),
      setUser: record('setUser'),
      setAccount: record('setAccount'),
      stopSession: record('stopSession'),
      clearUser: record('clearUser'),
      clearAccount: record('clearAccount'),
      setGlobalContext: (context) => { calls.push(['setGlobalContext', context]); globalContext = { ...context }; },
      setGlobalContextProperty: (key, value) => {
        calls.push(['setGlobalContextProperty', key, value]);
        globalContext = { ...globalContext, [key]: value };
      },
      removeGlobalContextProperty: (key) => {
        calls.push(['removeGlobalContextProperty', key]);
        const { [key]: _removed, ...rest } = globalContext;
        globalContext = rest;
      },
    };
    return { calls, rum, globalContext: () => globalContext };
  }

  function setup() {
    const fake = statefulRum();
    const loader = vi.fn().mockResolvedValue({ datadogRum: fake.rum });
    const provider = createDatadogProvider({ env, loader });
    const obs = createObservability({ logger: { warn: vi.fn() } });
    return { ...fake, loader, provider, obs };
  }

  it('sends no product event to Datadog in a support session and sends them again after it', async () => {
    const { calls, provider, obs } = setup();
    await obs.initObservability({ providers: [provider] });

    await obs.setAnalyticsSuppressed(true);
    await obs.track('transaction_posted', { entity: 'sales_invoice' });
    expect(calls.filter(([method]) => method === 'addAction')).toEqual([]);

    await obs.setAnalyticsSuppressed(false);
    await obs.track('transaction_posted', { entity: 'sales_invoice' });
    const actions = calls.filter(([method]) => method === 'addAction');
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toBe('transaction_posted');
  });

  it('keeps reporting errors, flag evaluations and identity in a support session', async () => {
    const { calls, provider, obs } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });

    const error = new Error('boom');
    await obs.captureException(error);
    await obs.addFeatureFlagEvaluation('sample_flag', true);
    await obs.identify('account-1');
    await obs.group('account_id', 'tenant-1');

    expect(calls.find(([method]) => method === 'addError')?.[1]).toBe(error);
    expect(calls).toContainEqual(['addFeatureFlagEvaluation', 'sample_flag', true]);
    expect(calls).toContainEqual(['setUser', { id: 'account-1' }]);
    expect(calls).toContainEqual(['setAccount', { id: 'tenant-1' }]);
  });

  it('marks a support load before its first view, and removes the mark when the session ends', async () => {
    const { calls, provider, obs, globalContext } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });

    const markIndex = calls.findIndex(([method, key]) => method === 'setGlobalContextProperty' && key === SUPPORT_SESSION_CONTEXT_KEY);
    const firstViewIndex = calls.findIndex(([method]) => method === 'startView');
    expect(markIndex).toBeGreaterThanOrEqual(0);
    expect(markIndex).toBeLessThan(firstViewIndex);
    expect(globalContext()).toEqual({ [SUPPORT_SESSION_CONTEXT_KEY]: true });

    await obs.setAnalyticsSuppressed(false);
    expect(globalContext()).toEqual({});
  });

  it('marks an already running session when support mode starts later', async () => {
    const { provider, obs, globalContext } = setup();
    await obs.initObservability({ providers: [provider] });
    expect(globalContext()).toEqual({});

    await obs.setAnalyticsSuppressed(true);

    expect(globalContext()).toEqual({ [SUPPORT_SESSION_CONTEXT_KEY]: true });
  });

  it('keeps the mark across setContext and reset, which replace the whole global context', async () => {
    const { provider, obs, globalContext } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });

    await obs.setContext({ app: 'app-shell' });
    expect(globalContext()).toEqual({ app: 'app-shell', [SUPPORT_SESSION_CONTEXT_KEY]: true });

    await obs.reset();
    expect(globalContext()).toEqual({ [SUPPORT_SESSION_CONTEXT_KEY]: true });
  });

  it('does not load the SDK just to record the flag', async () => {
    const { loader, provider } = setup();

    await provider.setAnalyticsSuppressed(true);

    expect(loader).not.toHaveBeenCalled();
  });

  it('lets the mark through the beforeSend allowlist, and only as a literal true', () => {
    const event = { context: { [SUPPORT_SESSION_CONTEXT_KEY]: true, username: 'x', app: 'app-shell' } };
    redactDatadogEvent(event);
    expect(event.context).toEqual({ app: 'app-shell', [SUPPORT_SESSION_CONTEXT_KEY]: true });

    const forged = { context: { [SUPPORT_SESSION_CONTEXT_KEY]: 'private@example.com' } };
    redactDatadogEvent(forged);
    expect(forged.context).toEqual({});
  });
});
