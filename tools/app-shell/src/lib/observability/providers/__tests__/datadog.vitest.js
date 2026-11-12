// @covers tools/app-shell/src/lib/observability/providers/datadog.js
import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_SESSION_CONTEXT_KEY, createDatadogProvider } from '../datadog.js';
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
  it('redacts quoted and standalone bearer credentials in automatic error text', async () => {
    const { calls, rum } = fakeRum();
    const provider = createDatadogProvider({ env, loader: vi.fn().mockResolvedValue({ datadogRum: rum }) });
    await provider.init();
    const { beforeSend } = calls.find(([method]) => method === 'init')[1];
    const message = '{"authorization":"Bearer secret-a-0123456789abcdef"} Bearer secret-b-0123456789abcdef';
    const event = { type: 'error', error: { message, stack: message } };
    expect(beforeSend(event)).toBe(true);
    for (const field of [event.error.message, event.error.stack]) {
      expect(field).not.toContain('secret-a');
      expect(field).not.toContain('secret-b');
    }
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
// out of Datadog (the core drops `track`); monitoring stays on, and the RUM global context carries
// the marker so the automatic click actions can be filtered out of the dashboards.
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
    };
    return { calls, rum, globalContext: () => globalContext };
  }

  function setup() {
    const fake = statefulRum();
    const provider = createDatadogProvider({ env, loader: vi.fn().mockResolvedValue({ datadogRum: fake.rum }) });
    const obs = createObservability({ logger: { warn: vi.fn() } });
    return { ...fake, provider, obs };
  }

  it('does not declare itself as a suppressible analytics provider', () => {
    expect(createDatadogProvider({ env }).analytics).not.toBe(true);
  });

  it('sends no product event to Datadog in a support session and sends them again after it', async () => {
    const { calls, provider, obs } = setup();
    await obs.initObservability({ providers: [provider] });

    await obs.setAnalyticsSuppressed(true);
    await obs.track('transaction_posted', { entity: 'sales_invoice' });
    expect(calls.filter(([method]) => method === 'addAction')).toEqual([]);

    await obs.setAnalyticsSuppressed(false);
    await obs.track('transaction_posted', { entity: 'sales_invoice' });
    expect(calls.filter(([method]) => method === 'addAction')).toHaveLength(1);
  });

  it('keeps reporting errors and flag evaluations in a support session', async () => {
    const { calls, provider, obs } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });

    await obs.captureException(new Error('boom'));
    await obs.addFeatureFlagEvaluation('sample_flag', true);

    expect(calls.some(([method]) => method === 'addError')).toBe(true);
    expect(calls.some(([method]) => method === 'addFeatureFlagEvaluation')).toBe(true);
  });

  it('marks the RUM global context as a support session, and unmarks it when it ends', async () => {
    const { provider, obs, globalContext } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });
    expect(globalContext()[SUPPORT_SESSION_CONTEXT_KEY]).toBe(true);

    await obs.setAnalyticsSuppressed(false);
    expect(globalContext()[SUPPORT_SESSION_CONTEXT_KEY]).toBe(false);
  });

  it('marks an already running session when support mode starts later', async () => {
    const { provider, obs, globalContext } = setup();
    await obs.initObservability({ providers: [provider] });
    expect(globalContext()[SUPPORT_SESSION_CONTEXT_KEY]).toBeUndefined();

    await obs.setAnalyticsSuppressed(true);

    expect(globalContext()[SUPPORT_SESSION_CONTEXT_KEY]).toBe(true);
  });

  it('keeps the mark across setContext and reset, which replace the whole global context', async () => {
    const { provider, obs, globalContext } = setup();
    await obs.setAnalyticsSuppressed(true);
    await obs.initObservability({ providers: [provider] });

    await obs.setContext({ app: 'app-shell' });
    expect(globalContext()).toMatchObject({ app: 'app-shell', [SUPPORT_SESSION_CONTEXT_KEY]: true });

    await obs.reset();
    expect(globalContext()[SUPPORT_SESSION_CONTEXT_KEY]).toBe(true);
  });
});
