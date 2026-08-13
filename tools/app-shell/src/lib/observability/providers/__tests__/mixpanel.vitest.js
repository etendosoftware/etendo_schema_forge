import { createMixpanelProvider } from '../mixpanel.js';

function makeClient(overrides = {}) {
  return {
    init: vi.fn(),
    track: vi.fn((eventName, properties, extra, cb) => cb?.()),
    identify: vi.fn(),
    people: { set: vi.fn() },
    set_group: vi.fn(),
    get_group: vi.fn(() => ({ set: vi.fn() })),
    flush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createMixpanelProvider — construction', () => {
  it('defaults to disabled when no options are provided', () => {
    const provider = createMixpanelProvider();
    expect(provider.name).toBe('mixpanel');
    expect(provider.enabled).toBe(false);
  });

  it('is disabled when enabled=true but token is missing, and warns', () => {
    const logger = { warn: vi.fn() };
    const provider = createMixpanelProvider({ enabled: true, logger });
    expect(provider.enabled).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Mixpanel is enabled but VITE_MIXPANEL_TOKEN is missing'),
    );
  });

  it('does not warn when disabled and token is also missing', () => {
    const logger = { warn: vi.fn() };
    createMixpanelProvider({ enabled: false, logger });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('is enabled when enabled=true (boolean) and a token is present', () => {
    const provider = createMixpanelProvider({ enabled: true, token: 'tok' });
    expect(provider.enabled).toBe(true);
  });

  it('is enabled when enabled="true" (string) and a token is present', () => {
    const provider = createMixpanelProvider({ enabled: 'true', token: 'tok' });
    expect(provider.enabled).toBe(true);
  });

  it('is disabled when enabled is a truthy non-"true" string', () => {
    const provider = createMixpanelProvider({ enabled: 'yes', token: 'tok' });
    expect(provider.enabled).toBe(false);
  });
});

describe('createMixpanelProvider — init', () => {
  it('does nothing when the provider is disabled (loader never called)', async () => {
    const loader = vi.fn();
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.init();
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads the client and calls client.init with token + normalized options', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({
      enabled: true, token: 'tok-1', apiHost: 'https://api.mixpanel.test', debug: true, loader,
    });

    await provider.init();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledWith('tok-1', {
      debug: true,
      batch_requests: false,
      api_host: 'https://api.mixpanel.test',
    });
  });

  it('omits api_host from normalized options when not provided', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok-1', loader });

    await provider.init();

    expect(client.init).toHaveBeenCalledWith('tok-1', { debug: false, batch_requests: false });
  });

  it('caches the client across repeated calls (loader called only once)', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.init();
    await provider.track('event_a');
    await provider.flush();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('supports a loader module without a default export', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue(client); // no `.default`
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.init();

    expect(client.init).toHaveBeenCalled();
  });
});

describe('createMixpanelProvider — track', () => {
  it('does nothing when disabled', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.track('event');
    expect(client.track).not.toHaveBeenCalled();
  });

  it('calls client.track with event name, properties, and a resolving callback', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.track('button_click', { action: 'click' });

    expect(client.track).toHaveBeenCalledWith(
      'button_click', { action: 'click' }, {}, expect.any(Function),
    );
  });

  it('does nothing when the client has no track method', async () => {
    const client = makeClient({ track: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.track('event')).resolves.toBeUndefined();
  });
});

describe('createMixpanelProvider — page', () => {
  it('tracks a page_view event with route and routePattern', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.page('/sales-order/:recordId', { windowName: 'sales-order' });

    expect(client.track).toHaveBeenCalledWith('page_view', {
      windowName: 'sales-order',
      route: '/sales-order/:recordId',
      routePattern: '/sales-order/:recordId',
    });
  });

  it('does nothing when disabled', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.page('/x');
    expect(client.track).not.toHaveBeenCalled();
  });

  it('does nothing when the client has no track method', async () => {
    const client = makeClient({ track: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.page('/x')).resolves.toBeUndefined();
  });
});

describe('createMixpanelProvider — identify', () => {
  it('calls client.identify and client.people.set when both exist', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.identify('user-1', { role: 'admin' });

    expect(client.identify).toHaveBeenCalledWith('user-1');
    expect(client.people.set).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('skips people.set when the client has no people API', async () => {
    const client = makeClient({ people: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.identify('user-1')).resolves.toBeUndefined();
    expect(client.identify).toHaveBeenCalledWith('user-1');
  });

  it('skips identify() call when the client has no identify method', async () => {
    const client = makeClient({ identify: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.identify('user-1', { role: 'admin' });
    expect(client.people.set).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('does nothing when disabled', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.identify('user-1');
    expect(client.identify).not.toHaveBeenCalled();
  });
});

describe('createMixpanelProvider — group / groupSet', () => {
  it('calls client.set_group when present', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.group('account_id', 'client-1');

    expect(client.set_group).toHaveBeenCalledWith('account_id', 'client-1');
  });

  it('does nothing for group() when set_group is missing', async () => {
    const client = makeClient({ set_group: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.group('account_id', 'client-1')).resolves.toBeUndefined();
  });

  it('does nothing for group() when disabled', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.group('account_id', 'client-1');
    expect(client.set_group).not.toHaveBeenCalled();
  });

  it('calls get_group(...).set(properties) when the group object supports it', async () => {
    const groupSetFn = vi.fn();
    const client = makeClient({ get_group: vi.fn(() => ({ set: groupSetFn })) });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.groupSet('account_id', 'client-1', { plan: 'gold' });

    expect(client.get_group).toHaveBeenCalledWith('account_id', 'client-1');
    expect(groupSetFn).toHaveBeenCalledWith({ plan: 'gold' });
  });

  it('does nothing for groupSet() when get_group returns undefined', async () => {
    const client = makeClient({ get_group: vi.fn(() => undefined) });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.groupSet('account_id', 'client-1')).resolves.toBeUndefined();
  });

  it('does nothing for groupSet() when the returned group has no set method', async () => {
    const client = makeClient({ get_group: vi.fn(() => ({})) });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.groupSet('account_id', 'client-1')).resolves.toBeUndefined();
  });

  it('does nothing for groupSet() when disabled', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: false, loader });
    await provider.groupSet('account_id', 'client-1');
    expect(client.get_group).not.toHaveBeenCalled();
  });
});

describe('createMixpanelProvider — flush', () => {
  it('calls client.flush when it is a function', async () => {
    const client = makeClient();
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await provider.init();
    await provider.flush();

    expect(client.flush).toHaveBeenCalled();
  });

  it('does nothing when the client has no flush method', async () => {
    const client = makeClient({ flush: undefined });
    const loader = vi.fn().mockResolvedValue({ default: client });
    const provider = createMixpanelProvider({ enabled: true, token: 'tok', loader });

    await expect(provider.flush()).resolves.toBeUndefined();
  });

  it('does nothing when disabled (client is never loaded)', async () => {
    const loader = vi.fn();
    const provider = createMixpanelProvider({ enabled: false, loader });
    await expect(provider.flush()).resolves.toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });
});
