// @covers tools/app-shell/src/lib/observability/core.js
import { createObservability } from '../core.js';

function makeProvider(name = 'test', overrides = {}) {
  return {
    name,
    enabled: true,
    init: vi.fn().mockResolvedValue(undefined),
    track: vi.fn().mockResolvedValue(undefined),
    page: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn().mockResolvedValue(undefined),
    group: vi.fn().mockResolvedValue(undefined),
    groupSet: vi.fn().mockResolvedValue(undefined),
    captureException: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    setContext: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createObservability', () => {
  it('creates an observability instance', () => {
    const obs = createObservability();
    expect(obs).toBeTruthy();
    expect(typeof obs.track).toBe('function');
    expect(typeof obs.page).toBe('function');
    expect(typeof obs.identify).toBe('function');
  });

  it('returns empty context before init', () => {
    const obs = createObservability();
    expect(obs.getContext()).toEqual({});
  });

  it('returns empty providers before init', () => {
    const obs = createObservability();
    expect(obs.getProviders()).toEqual([]);
  });
});

describe('initObservability', () => {
  it('initializes with providers', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    expect(p.init).toHaveBeenCalled();
    expect(obs.getProviders()).toHaveLength(1);
  });

  it('filters out disabled providers', async () => {
    const obs = createObservability();
    const enabled = makeProvider('ok');
    const disabled = makeProvider('no', { enabled: false });
    await obs.initObservability({ providers: [enabled, disabled] });
    expect(obs.getProviders()).toHaveLength(1);
    expect(obs.getProviders()[0].name).toBe('ok');
  });

  it('filters out null providers', async () => {
    const obs = createObservability();
    await obs.initObservability({ providers: [null, undefined] });
    expect(obs.getProviders()).toHaveLength(0);
  });

  it('sets initial context', async () => {
    const obs = createObservability();
    await obs.initObservability({ context: { locale: 'en' } });
    expect(obs.getContext()).toEqual({ locale: 'en' });
  });

  it('handles empty config', async () => {
    const obs = createObservability();
    await obs.initObservability();
    expect(obs.getProviders()).toEqual([]);
  });
});

describe('track', () => {
  it('calls provider.track with event name and payload', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.track('button_click', { action: 'click' });
    expect(p.track).toHaveBeenCalledWith('button_click', expect.any(Object), expect.any(Object));
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    const p = makeProvider();
    // track without init
    await obs.track('event');
    expect(p.track).not.toHaveBeenCalled();
  });

  it('does nothing with empty event name', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.track('');
    expect(p.track).not.toHaveBeenCalled();
  });

  it('does nothing with undefined event name', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.track(undefined);
    expect(p.track).not.toHaveBeenCalled();
  });

  it('handles provider.track failure gracefully', async () => {
    const obs = createObservability({ logger: { warn: vi.fn() } });
    const p = makeProvider('fail', { track: vi.fn().mockRejectedValue(new Error('boom')) });
    await obs.initObservability({ providers: [p] });
    await expect(obs.track('event')).resolves.toBeUndefined();
  });
});

describe('addFeatureFlagEvaluation', () => {
  it('forwards through the gateway to the providers that implement it', async () => {
    const obs = createObservability();
    const datadog = makeProvider('datadog', {
      addFeatureFlagEvaluation: vi.fn().mockResolvedValue(undefined),
    });
    const other = makeProvider('mixpanel');
    await obs.initObservability({ providers: [datadog, other] });

    await obs.addFeatureFlagEvaluation('sample_flag', true);

    expect(datadog.addFeatureFlagEvaluation).toHaveBeenCalledWith('sample_flag', true);
    expect(other.addFeatureFlagEvaluation).toBeUndefined();
  });

  it('holds evaluations made before initialization and sends them once it happens', async () => {
    const obs = createObservability();
    const provider = makeProvider('datadog', {
      addFeatureFlagEvaluation: vi.fn(),
    });

    await obs.addFeatureFlagEvaluation('sample_flag', false);
    await obs.addFeatureFlagEvaluation('sample_flag', true);
    expect(provider.addFeatureFlagEvaluation).not.toHaveBeenCalled();

    await obs.initObservability({ providers: [provider] });
    expect(provider.addFeatureFlagEvaluation).toHaveBeenCalledTimes(1);
    expect(provider.addFeatureFlagEvaluation).toHaveBeenCalledWith('sample_flag', true);
  });
});

describe('page', () => {
  it('calls provider.page with normalized route', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.page('/sales-order/123');
    expect(p.page).toHaveBeenCalledWith('/sales-order/:recordId', expect.any(Object), expect.any(Object));
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    await obs.page('/path');
  });

  it('does nothing with empty path', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.page('');
    expect(p.page).not.toHaveBeenCalled();
  });
});

describe('identify', () => {
  it('calls provider.identify with userId and traits', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.identify('user1', { status: 'active' });
    expect(p.identify).toHaveBeenCalledWith('user1', { status: 'active' }, expect.any(Object));
  });

  it('drops traits outside the host allowlist before they reach a provider (ETP-4578)', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.identify('user1', { status: 'active', role: 'admin' });
    expect(p.identify).toHaveBeenCalledWith('user1', { status: 'active' }, expect.any(Object));
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    await obs.identify('user1');
  });

  it('does nothing with empty userId', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.identify('');
    expect(p.identify).not.toHaveBeenCalled();
  });
});

describe('group', () => {
  it('calls provider.group with key, id, traits, and context', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p], context: { locale: 'es' } });
    await obs.group('account_id', 'client-1', { category: 'gold' });
    expect(p.group).toHaveBeenCalledWith(
      'account_id',
      'client-1',
      { category: 'gold' },
      expect.objectContaining({ context: expect.objectContaining({ locale: 'es' }) }),
    );
  });

  it('defaults traits to an empty object when omitted', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.group('account_id', 'client-1');
    expect(p.group).toHaveBeenCalledWith('account_id', 'client-1', {}, expect.any(Object));
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.group('account_id', 'client-1');
    expect(p.group).not.toHaveBeenCalled();
  });

  it('does nothing when groupKey is missing', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.group('', 'client-1');
    expect(p.group).not.toHaveBeenCalled();
  });

  it('does nothing when groupId is missing', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.group('account_id', '');
    expect(p.group).not.toHaveBeenCalled();
  });

  it('swallows a provider.group failure (Promise.all rejection handled by callProvider)', async () => {
    const logger = { warn: vi.fn() };
    const obs = createObservability({ logger });
    const p = makeProvider('broken', { group: vi.fn().mockRejectedValue(new Error('boom')) });
    await obs.initObservability({ providers: [p], logger });
    await expect(obs.group('account_id', 'client-1')).resolves.toBeUndefined();
  });
});

describe('groupSet', () => {
  it('calls provider.groupSet with key, id, properties, and context', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p], context: { locale: 'es' } });
    await obs.groupSet('account_id', 'client-1', { category: 'gold' });
    expect(p.groupSet).toHaveBeenCalledWith(
      'account_id',
      'client-1',
      { category: 'gold' },
      expect.objectContaining({ context: expect.objectContaining({ locale: 'es' }) }),
    );
  });

  it('does not send the organization name unless the host approves $name (ETP-4578, D6)', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.groupSet('account_id', 'client-1', { $name: 'Acme' });
    expect(p.groupSet).toHaveBeenCalledWith('account_id', 'client-1', {}, expect.any(Object));
  });

  it('sends $name when the host adds it to the allowlist', async () => {
    const obs = createObservability({ allowedKeys: ['$name'] });
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.groupSet('account_id', 'client-1', { $name: 'Acme' });
    expect(p.groupSet).toHaveBeenCalledWith('account_id', 'client-1', { $name: 'Acme' }, expect.any(Object));
  });

  it('defaults properties to an empty object when omitted', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.groupSet('account_id', 'client-1');
    expect(p.groupSet).toHaveBeenCalledWith('account_id', 'client-1', {}, expect.any(Object));
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.groupSet('account_id', 'client-1', { $name: 'Acme' });
    expect(p.groupSet).not.toHaveBeenCalled();
  });

  it('does nothing when groupKey is missing', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.groupSet('', 'client-1', {});
    expect(p.groupSet).not.toHaveBeenCalled();
  });

  it('does nothing when groupId is missing', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.groupSet('account_id', '', {});
    expect(p.groupSet).not.toHaveBeenCalled();
  });

  it('tolerates a rejecting provider via Promise.allSettled', async () => {
    const obs = createObservability({ logger: { warn: vi.fn() } });
    const p = makeProvider('broken', { groupSet: vi.fn().mockRejectedValue(new Error('boom')) });
    await obs.initObservability({ providers: [p] });
    await expect(obs.groupSet('account_id', 'client-1', { $name: 'x' })).resolves.toBeUndefined();
  });
});

describe('captureException', () => {
  it('calls provider.captureException', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.captureException(new Error('test'), { reason: 'info' });
    expect(p.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Error', message: 'test' }),
      { reason: 'info' },
      expect.any(Object),
    );
  });

  it('hands providers a sanitized summary, never the Error itself (ETP-4578)', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    const error = new Error('boom');
    await obs.captureException(error);
    expect(p.captureException.mock.calls[0][0]).not.toBe(error);
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    await obs.captureException(new Error('test'));
  });

  it('does nothing with null error', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.captureException(null);
    expect(p.captureException).not.toHaveBeenCalled();
  });
});

describe('flush', () => {
  it('calls provider.flush', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.flush();
    expect(p.flush).toHaveBeenCalled();
  });

  it('does nothing before init', async () => {
    const obs = createObservability();
    await obs.flush(); // should not throw
  });
});

describe('setContext', () => {
  it('merges new context', async () => {
    const obs = createObservability();
    await obs.initObservability({ context: { a: 1 } });
    await obs.setContext({ b: 2 });
    expect(obs.getContext()).toEqual({ a: 1, b: 2 });
  });

  it('calls provider.setContext after init', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.setContext({ locale: 'es' });
    expect(p.setContext).toHaveBeenCalledWith(expect.objectContaining({ locale: 'es' }));
  });

  it('sets context before init without calling providers', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.setContext({ pre: true });
    expect(obs.getContext()).toEqual({ pre: true });
    expect(p.setContext).not.toHaveBeenCalled();
  });

  it('handles provider without setContext method', async () => {
    const obs = createObservability();
    const p = makeProvider('no-set', { setContext: undefined });
    await obs.initObservability({ providers: [p] });
    await expect(obs.setContext({ x: 1 })).resolves.toBeUndefined();
  });
});

describe('callProvider error handling', () => {
  it('warns via logger when provider method throws', async () => {
    const logger = { warn: vi.fn() };
    const obs = createObservability({ logger });
    const p = makeProvider('broken', { track: vi.fn().mockRejectedValue(new Error('fail')) });
    await obs.initObservability({ providers: [p], logger });
    await obs.track('event');
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.calls[0][0]).toContain('broken.track failed');
  });

  it('uses "unknown-adapter" when provider has no name', async () => {
    const logger = { warn: vi.fn() };
    const obs = createObservability({ logger });
    const p = { enabled: true, track: vi.fn().mockRejectedValue(new Error('x')) };
    await obs.initObservability({ providers: [p], logger });
    await obs.track('event');
    expect(logger.warn.mock.calls[0][0]).toContain('unknown-adapter');
  });

  it('handles logger without warn method', async () => {
    const obs = createObservability({ logger: {} });
    const p = makeProvider('broken', { track: vi.fn().mockRejectedValue(new Error('x')) });
    await obs.initObservability({ providers: [p], logger: {} });
    await expect(obs.track('event')).resolves.toBeUndefined();
  });
});

describe('flag telemetry startup and identity lifecycle', () => {
  it('replays early flag events but keeps unrelated pre-init events discarded', async () => {
    const obs = createObservability();
    const provider = makeProvider();
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true, username: 'account-a', account_id: 'company-a' });
    await obs.track('feature_flags_diagnostic', { operation: 'configuration_fetch', outcome: 'success', durationMs: 15 });
    await obs.track('unrelated_event', { action: 'click' });
    await obs.initObservability({ providers: [provider] });
    expect(provider.track.mock.calls.map(([name]) => name)).toEqual(['feature_flag_evaluated', 'feature_flags_diagnostic']);
    expect(provider.track.mock.calls[0][1]).toMatchObject({ username: 'account-a', account_id: 'company-a' });
  });

  it('holds flag events during adapter initialization and preserves capture-time company context', async () => {
    let finishInit;
    const provider = makeProvider('test', { init: vi.fn(() => new Promise(resolve => { finishInit = resolve; })) });
    const obs = createObservability();
    await obs.setContext({ account_id: 'company-a' });
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
    const init = obs.initObservability({ providers: [provider], context: { account_id: 'company-b' } });
    await obs.track('feature_flags_diagnostic', { operation: 'context_update', outcome: 'success', account_id: 'company-b' });
    expect(provider.track).not.toHaveBeenCalled();
    finishInit();
    await init;
    expect(provider.track.mock.calls[0][1]).toMatchObject({ account_id: 'company-a' });
    expect(provider.track.mock.calls[1][1]).toMatchObject({ account_id: 'company-b' });
  });

  it('bounds early flag events to the latest hundred', async () => {
    const obs = createObservability();
    const provider = makeProvider();
    for (let i = 0; i < 150; i += 1) await obs.track('feature_flags_diagnostic', { operation: 'context_update', outcome: 'success', durationMs: i });
    await obs.initObservability({ providers: [provider] });
    expect(provider.track).toHaveBeenCalledTimes(100);
    expect(provider.track.mock.calls[0][1].durationMs).toBe(50);
  });

  it('replays only the latest pending account and company before exposures', async () => {
    const obs = createObservability();
    const calls = [];
    const provider = makeProvider('test', {
      identify: vi.fn(async id => { calls.push(['identify', id]); }),
      group: vi.fn(async (key, id) => { calls.push(['group', id]); }),
      track: vi.fn(async name => { calls.push(['track', name]); }),
    });
    await obs.identify('old-account');
    await obs.identify('current-account');
    await obs.group('account_id', 'old-company');
    await obs.group('account_id', 'current-company');
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
    await obs.initObservability({ providers: [provider] });
    expect(calls).toEqual([['identify', 'current-account'], ['group', 'current-company'], ['track', 'feature_flag_evaluated']]);
  });

  it('clears pending identity, exposures and RUM evaluations on logout before initialization', async () => {
    const obs = createObservability();
    const provider = makeProvider('test', { addFeatureFlagEvaluation: vi.fn() });
    await obs.identify('old-account');
    await obs.group('account_id', 'old-company');
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
    await obs.addFeatureFlagEvaluation('sample', true);
    await obs.reset();
    await obs.initObservability({ providers: [provider] });
    expect(provider.identify).not.toHaveBeenCalled();
    expect(provider.group).not.toHaveBeenCalled();
    expect(provider.track).not.toHaveBeenCalled();
    expect(provider.addFeatureFlagEvaluation).not.toHaveBeenCalled();
  });

  it('does not restore old company grouping when logout races pending identity replay', async () => {
    let finishIdentity;
    const obs = createObservability();
    const provider = makeProvider('test', {
      identify: vi.fn(() => new Promise(resolve => { finishIdentity = resolve; })),
      reset: vi.fn(),
    });
    await obs.identify('old-account');
    await obs.group('account_id', 'old-company');
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
    const init = obs.initObservability({ providers: [provider] });
    await vi.waitFor(() => expect(provider.identify).toHaveBeenCalled());
    await obs.reset();
    finishIdentity();
    await init;
    expect(provider.group).not.toHaveBeenCalled();
    expect(provider.track).not.toHaveBeenCalled();
    expect(provider.reset).toHaveBeenCalled();
  });

  it('keeps buffered flag events behind the gateway kill switch', async () => {
    const obs = createObservability();
    const provider = makeProvider('datadog');
    await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
    await obs.initObservability({ providers: [provider], disabled: true });
    expect(provider.track).not.toHaveBeenCalled();
  });
});


describe('buffered flag event occurrence time', () => {
  it('keeps the time at evaluation instead of the later replay time', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
      const obs = createObservability();
      const provider = makeProvider();
      await obs.track('feature_flag_evaluated', { flagKey: 'sample', enabled: true });
      vi.setSystemTime(new Date('2026-11-04T12:00:10Z'));
      await obs.initObservability({ providers: [provider] });
      expect(provider.track.mock.calls[0][1].timestamp).toBe('2026-11-04T12:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});
