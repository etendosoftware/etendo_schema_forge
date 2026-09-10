import { fetchAcctProcessStatus, triggerAcctProcessRun } from '../acctProcessMonitorApi.js';

// ETP-5269 — `acctProcessMonitorApi.js` is a thin pair of URL builders over the shared
// `fetchNeoWebhookJson` mechanics (already covered by `rolesApi.vitest.js`), so this file exercises
// the real shared client against a stubbed `fetch` and asserts the two things that are this
// module's own contract: the URL each function builds, and the fact that a refusal comes back as a
// PAYLOAD rather than a throw.
//
// The `Action=trigger` assertion is the load-bearing one. The whole endpoint is reachable over GET,
// so "the read never carries Action" is what keeps a prefetched or retried status poll from firing
// the accounting process — see SFAcctProcessMonitor's class javadoc.
describe('acctProcessMonitorApi', () => {
  function respondWith(payload) {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result: JSON.stringify(payload) }),
    });
  }

  function requestedUrl() {
    return String(globalThis.fetch.mock.calls[0][0]);
  }

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('fetchAcctProcessStatus', () => {
    it('reads the acctprocessmonitor endpoint and never sends an Action', async () => {
      respondWith({ error: false, history: [] });

      await fetchAcctProcessStatus(20);

      expect(requestedUrl()).toContain('/sws/neo/acctprocessmonitor');
      expect(requestedUrl()).not.toContain('Action');
    });

    it('passes the history limit through as the Limit query parameter', async () => {
      respondWith({ error: false, history: [] });

      await fetchAcctProcessStatus(20);

      expect(requestedUrl()).toContain('Limit=20');
    });

    it('omits the query string entirely when no limit is given', async () => {
      respondWith({ error: false, history: [] });

      await fetchAcctProcessStatus();

      expect(requestedUrl()).not.toContain('Limit');
      expect(requestedUrl()).not.toContain('?');
    });

    it('returns the unwrapped status payload', async () => {
      const payload = {
        error: false,
        processName: 'Accounting server process',
        scheduled: true,
        running: false,
        history: [{ id: 'run-1', status: 'SUC', startTime: '2026-09-10T09:00:00', manual: false }],
      };
      respondWith(payload);

      await expect(fetchAcctProcessStatus(20)).resolves.toEqual(payload);
    });

    it('resolves a denial as a payload rather than rejecting — the page renders a no-access state', async () => {
      respondWith({ error: true, reason: 'notAuthorized', message: 'Not authorized' });

      const data = await fetchAcctProcessStatus(20);

      expect(data.error).toBe(true);
      expect(data.reason).toBe('notAuthorized');
    });

    it('rejects when the endpoint answers a non-JSON 200 (SPA index.html fallback)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<!doctype html><html></html>',
      });

      await expect(fetchAcctProcessStatus(20)).rejects.toThrow(/non-JSON/);
    });

    it('rejects with the server message on a non-ok status', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'boom' }),
      });

      await expect(fetchAcctProcessStatus(20)).rejects.toThrow('boom');
    });
  });

  describe('triggerAcctProcessRun', () => {
    it('sends Action=trigger explicitly', async () => {
      respondWith({ error: false, triggered: { started: true, reason: 'started' }, history: [] });

      await triggerAcctProcessRun(20);

      expect(requestedUrl()).toContain('Action=trigger');
    });

    it('keeps the Limit parameter alongside the action', async () => {
      respondWith({ error: false, triggered: { started: true, reason: 'started' }, history: [] });

      await triggerAcctProcessRun(20);

      expect(requestedUrl()).toContain('Action=trigger&Limit=20');
    });

    it('still sends Action=trigger when no limit is given', async () => {
      respondWith({ error: false, triggered: { started: true, reason: 'started' }, history: [] });

      await triggerAcctProcessRun();

      expect(requestedUrl()).toContain('Action=trigger');
      expect(requestedUrl()).not.toContain('Limit');
    });

    it('returns the refreshed status plus the trigger outcome in one round trip', async () => {
      respondWith({
        error: false,
        scheduled: true,
        triggered: { started: true, reason: 'started' },
        history: [{ id: 'run-new', status: 'SCH', manual: true }],
      });

      const data = await triggerAcctProcessRun(20);

      expect(data.triggered).toEqual({ started: true, reason: 'started' });
      expect(data.history).toHaveLength(1);
    });

    it('resolves a refusal (started:false) as an ordinary payload, never a rejection', async () => {
      respondWith({
        error: false,
        triggered: { started: false, reason: 'systemClientNotScopable' },
        history: [],
      });

      const data = await triggerAcctProcessRun(20);

      expect(data.triggered.started).toBe(false);
      expect(data.triggered.reason).toBe('systemClientNotScopable');
    });
  });
});
