// @covers tools/app-shell/src/lib/observability.js
import { SUPPORT_SESSION_STORAGE_KEY } from '../supportSession.js';

/**
 * The telemetry gate wired at import time: a tab that starts in support mode must have analytics
 * suppressed BEFORE anything can send. Each case loads fresh copies of both modules.
 */
const MARKER = { clientId: 'C1', clientName: 'Acme', expiresAt: '2099-01-01T00:00:00Z' };

async function load() {
  vi.resetModules();
  const support = await import('../supportSession.js');
  support.bootSupportSession({ storage: localStorage, location: { pathname: '/dashboard', hash: '', search: '' }, history: null });
  const observability = await import('../observability.js');
  return { support, observability };
}

beforeEach(() => localStorage.clear());

describe('observability gate in support mode', () => {
  it('starts suppressed when the store is already in support mode', async () => {
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(MARKER));
    const { observability } = await load();
    expect(observability.isAnalyticsSuppressed()).toBe(true);
  });

  it('starts released outside support mode and follows later changes', async () => {
    const { support, observability } = await load();
    expect(observability.isAnalyticsSuppressed()).toBe(false);

    support.applySupportSessionFromServer(MARKER, { storage: localStorage });
    expect(observability.isAnalyticsSuppressed()).toBe(true);

    support.applySupportSessionFromServer(null, { storage: localStorage });
    expect(observability.isAnalyticsSuppressed()).toBe(false);
  });
});
