import { createObservability } from '../core.js';

function makeProvider(name = 'test', overrides = {}) {
  return {
    name,
    enabled: true,
    init: vi.fn().mockResolvedValue(undefined),
    track: vi.fn().mockResolvedValue(undefined),
    page: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn().mockResolvedValue(undefined),
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
    await obs.identify('user1', { role: 'admin' });
    expect(p.identify).toHaveBeenCalledWith('user1', { role: 'admin' }, expect.any(Object));
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

describe('captureException', () => {
  it('calls provider.captureException', async () => {
    const obs = createObservability();
    const p = makeProvider();
    await obs.initObservability({ providers: [p] });
    await obs.captureException(new Error('test'), { extra: 'info' });
    expect(p.captureException).toHaveBeenCalledWith(expect.any(Error), { extra: 'info' }, expect.any(Object));
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

  it('uses "unknown-provider" when provider has no name', async () => {
    const logger = { warn: vi.fn() };
    const obs = createObservability({ logger });
    const p = { enabled: true, track: vi.fn().mockRejectedValue(new Error('x')) };
    await obs.initObservability({ providers: [p], logger });
    await obs.track('event');
    expect(logger.warn.mock.calls[0][0]).toContain('unknown-provider');
  });

  it('handles logger without warn method', async () => {
    const obs = createObservability({ logger: {} });
    const p = makeProvider('broken', { track: vi.fn().mockRejectedValue(new Error('x')) });
    await obs.initObservability({ providers: [p], logger: {} });
    await expect(obs.track('event')).resolves.toBeUndefined();
  });
});
