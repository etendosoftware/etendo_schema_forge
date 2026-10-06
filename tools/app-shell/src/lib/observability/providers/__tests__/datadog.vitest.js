// @covers tools/app-shell/src/lib/observability/providers/datadog.js
import { describe, expect, it, vi } from 'vitest';
import { createDatadogProvider } from '../datadog.js';

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
