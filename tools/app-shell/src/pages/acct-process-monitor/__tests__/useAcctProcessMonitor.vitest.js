// ETP-5269 — data layer for the accounting-process monitor page: the pure helpers
// (`statusMeta`, `parseRunTimestamp`) plus the `useAcctProcessMonitor()` hook's own
// fetch/refusal/trigger/poll lifecycle. Mirrors `useRolesOverviewData.vitest.js`: the API module
// is mocked, the hook is driven through a tiny probe component, and every branch of the refusal
// mapping is asserted explicitly rather than inferred from one happy path.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/acctProcessMonitorApi.js', () => ({
  fetchAcctProcessStatus: vi.fn(),
  triggerAcctProcessRun: vi.fn(),
}));

import { fetchAcctProcessStatus, triggerAcctProcessRun } from '@/lib/acctProcessMonitorApi.js';
import {
  HISTORY_LIMIT,
  RUN_STATUS_META,
  statusMeta,
  parseRunTimestamp,
  useAcctProcessMonitor,
} from '../useAcctProcessMonitor.js';

const OK_PAYLOAD = Object.freeze({
  error: false,
  processName: 'Accounting server process',
  scheduled: true,
  running: false,
  nextRunTime: '2026-09-10T18:05:00',
  lastRun: { id: 'run-1', status: 'SUC', startTime: '2026-09-10T18:00:00', manual: false },
  history: [{ id: 'run-1', status: 'SUC', startTime: '2026-09-10T18:00:00', manual: false }],
});

// ── pure helpers ─────────────────────────────────────────────────────────────

describe('statusMeta', () => {
  it('maps every AD_PROCESS_RUN status code to a tone and an i18n key', () => {
    for (const code of Object.keys(RUN_STATUS_META)) {
      expect(statusMeta(code).labelKey).toBeTruthy();
      expect(statusMeta(code).tone).toBeTruthy();
    }
  });

  it('covers the full core code set, including PCE which the reference instance never emits', () => {
    expect(Object.keys(RUN_STATUS_META).sort()).toEqual(
      ['COM', 'ERR', 'KIL', 'MIS', 'PCE', 'PRC', 'SCH', 'SUC', 'SYR', 'UNS'],
    );
  });

  it('groups the codes into the intended tones', () => {
    expect(statusMeta('SUC').tone).toBe('success');
    expect(statusMeta('COM').tone).toBe('success');
    expect(statusMeta('PRC').tone).toBe('info');
    expect(statusMeta('SCH').tone).toBe('info');
    expect(statusMeta('ERR').tone).toBe('error');
    expect(statusMeta('KIL').tone).toBe('error');
    expect(statusMeta('MIS').tone).toBe('warning');
  });

  it('falls back to a neutral tone and NO label key for an unknown code, so the caller can show the raw code', () => {
    expect(statusMeta('ZZZ')).toEqual({ tone: 'neutral', labelKey: null });
    expect(statusMeta(undefined)).toEqual({ tone: 'neutral', labelKey: null });
    expect(statusMeta(null)).toEqual({ tone: 'neutral', labelKey: null });
  });
});

describe('parseRunTimestamp', () => {
  it('returns null for an absent value rather than an Invalid Date', () => {
    expect(parseRunTimestamp(null)).toBeNull();
    expect(parseRunTimestamp(undefined)).toBeNull();
    expect(parseRunTimestamp('')).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(parseRunTimestamp('not-a-timestamp')).toBeNull();
  });

  it('parses the zone-less server wall clock as LOCAL time, so the hour is never shifted', () => {
    // The backend emits `timestamp without time zone` as yyyy-MM-ddTHH:mm:ss. Reading it back with
    // local getters must return the same wall clock it was written with — under a negative UTC
    // offset a UTC parse would move both the hour and, near midnight, the day.
    const parsed = parseRunTimestamp('2026-09-10T23:45:07');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(10);
    expect(parsed.getHours()).toBe(23);
    expect(parsed.getMinutes()).toBe(45);
    expect(parsed.getSeconds()).toBe(7);
  });
});

// ── the hook ─────────────────────────────────────────────────────────────────

describe('useAcctProcessMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderHook() {
    const React = await import('react');
    const { render, waitFor, act } = await import('@testing-library/react');
    let result;
    function Probe() {
      result = useAcctProcessMonitor();
      return null;
    }
    const view = render(React.createElement(Probe));
    return { getResult: () => result, waitFor, act, view };
  }

  it('starts in a loading state with no data', async () => {
    fetchAcctProcessStatus.mockReturnValue(new Promise(() => {}));
    const { getResult } = await renderHook();
    expect(getResult().loading).toBe(true);
    expect(getResult().data).toBeNull();
    expect(getResult().denied).toBe(false);
  });

  it('requests the declared history limit', async () => {
    fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(fetchAcctProcessStatus).toHaveBeenCalledWith(HISTORY_LIMIT);
    expect(HISTORY_LIMIT).toBeLessThanOrEqual(100);
  });

  it('exposes the status payload once loaded', async () => {
    fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().data).toEqual(OK_PAYLOAD);
    expect(getResult().error).toBeNull();
    expect(getResult().running).toBe(false);
  });

  describe('refusal mapping', () => {
    it('maps notAuthorized to `denied`, not to an error', async () => {
      fetchAcctProcessStatus.mockResolvedValue({
        error: true, reason: 'notAuthorized', message: 'Not authorized',
      });
      const { getResult, waitFor } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().denied).toBe(true);
      expect(getResult().notInstalled).toBe(false);
      expect(getResult().error).toBeNull();
      expect(getResult().data).toBeNull();
    });

    it('maps notInstalled to `notInstalled`, not to `denied`', async () => {
      fetchAcctProcessStatus.mockResolvedValue({
        error: true, reason: 'notInstalled', message: 'The accounting server process is not installed.',
      });
      const { getResult, waitFor } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().notInstalled).toBe(true);
      expect(getResult().denied).toBe(false);
      expect(getResult().error).toBeNull();
    });

    it('surfaces an UNRECOGNISED reason as a generic error carrying the server message, never as denied', async () => {
      // Matching explicitly (rather than "anything that is not notInstalled is denied") is what
      // stops an older/newer backend telling an admin they lack permission for a server problem.
      fetchAcctProcessStatus.mockResolvedValue({
        error: true, reason: 'somethingNewFromANewerBackend', message: 'Server exploded',
      });
      const { getResult, waitFor } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().denied).toBe(false);
      expect(getResult().notInstalled).toBe(false);
      expect(getResult().error).toBe('Server exploded');
    });

    it('falls back to a non-empty error string when the refusal carries no message', async () => {
      fetchAcctProcessStatus.mockResolvedValue({ error: true, reason: 'mystery' });
      const { getResult, waitFor } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().error).toBe('Unknown error');
    });

    it('surfaces a rejected fetch as `error`, not a crash', async () => {
      fetchAcctProcessStatus.mockRejectedValue(new Error('network down'));
      const { getResult, waitFor } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().error).toBe('network down');
      expect(getResult().data).toBeNull();
    });
  });

  describe('reload', () => {
    it('re-fetches and clears a previous error', async () => {
      fetchAcctProcessStatus.mockRejectedValueOnce(new Error('network down'));
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().error).toBe('network down'));

      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      await act(async () => { await getResult().reload(); });

      expect(getResult().error).toBeNull();
      expect(getResult().data).toEqual(OK_PAYLOAD);
    });
  });

  describe('trigger', () => {
    it('reports the backend outcome and applies the refreshed payload', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      triggerAcctProcessRun.mockResolvedValue({
        ...OK_PAYLOAD,
        running: true,
        triggered: { started: true, reason: 'started' },
      });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));

      await act(async () => { await getResult().trigger(); });

      expect(triggerAcctProcessRun).toHaveBeenCalledWith(HISTORY_LIMIT);
      expect(getResult().triggerOutcome).toEqual({ started: true, reason: 'started' });
      expect(getResult().running).toBe(true);
      expect(getResult().triggering).toBe(false);
    });

    it('keeps `triggering` true for the whole round trip, so the button cannot double-fire', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      let resolveTrigger;
      triggerAcctProcessRun.mockReturnValue(new Promise((resolve) => { resolveTrigger = resolve; }));
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(getResult().triggering).toBe(false);

      let pending;
      await act(async () => { pending = getResult().trigger(); });
      expect(getResult().triggering).toBe(true);

      await act(async () => {
        resolveTrigger({ ...OK_PAYLOAD, triggered: { started: true, reason: 'started' } });
        await pending;
      });
      expect(getResult().triggering).toBe(false);
    });

    it('surfaces a refusal (started:false) verbatim instead of implying the run began', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      triggerAcctProcessRun.mockResolvedValue({
        ...OK_PAYLOAD,
        triggered: { started: false, reason: 'systemClientNotScopable' },
      });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));

      await act(async () => { await getResult().trigger(); });

      expect(getResult().triggerOutcome)
        .toEqual({ started: false, reason: 'systemClientNotScopable' });
    });

    it('defaults to scheduleFailed when a 200 carries no `triggered` object at all', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      triggerAcctProcessRun.mockResolvedValue({ ...OK_PAYLOAD });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));

      await act(async () => { await getResult().trigger(); });

      expect(getResult().triggerOutcome).toEqual({ started: false, reason: 'scheduleFailed' });
    });

    it('maps a rejected trigger to both an error state and a scheduleFailed outcome', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      triggerAcctProcessRun.mockRejectedValue(new Error('gateway timeout'));
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));

      await act(async () => { await getResult().trigger(); });

      expect(getResult().error).toBe('gateway timeout');
      expect(getResult().triggerOutcome).toEqual({ started: false, reason: 'scheduleFailed' });
      expect(getResult().triggering).toBe(false);
    });

    it('clears the previous outcome before the next attempt', async () => {
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      triggerAcctProcessRun.mockResolvedValue({
        ...OK_PAYLOAD, triggered: { started: false, reason: 'alreadyRunning' },
      });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      await act(async () => { await getResult().trigger(); });
      expect(getResult().triggerOutcome.reason).toBe('alreadyRunning');

      let resolveSecond;
      triggerAcctProcessRun.mockReturnValue(new Promise((resolve) => { resolveSecond = resolve; }));
      let pending;
      await act(async () => { pending = getResult().trigger(); });
      expect(getResult().triggerOutcome).toBeNull();

      await act(async () => {
        resolveSecond({ ...OK_PAYLOAD, triggered: { started: true, reason: 'started' } });
        await pending;
      });
    });
  });

  describe('polling', () => {
    it('does not poll while the process is idle', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchAcctProcessStatus.mockResolvedValue(OK_PAYLOAD);
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().loading).toBe(false));
      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
    });

    it('polls while a run is in progress, and stops as soon as it leaves PRC', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchAcctProcessStatus.mockResolvedValue({ ...OK_PAYLOAD, running: true });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().running).toBe(true));
      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

      // The run finishes on the next poll.
      fetchAcctProcessStatus.mockResolvedValue({ ...OK_PAYLOAD, running: false });
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
      expect(getResult().running).toBe(false);

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
    });

    it('polls silently — it never flips the page back into its loading skeleton', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchAcctProcessStatus.mockResolvedValue({ ...OK_PAYLOAD, running: true });
      const { getResult, waitFor, act } = await renderHook();
      await waitFor(() => expect(getResult().running).toBe(true));

      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

      expect(getResult().loading).toBe(false);
    });

    it('stops polling when the component unmounts', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchAcctProcessStatus.mockResolvedValue({ ...OK_PAYLOAD, running: true });
      const { getResult, waitFor, act, view } = await renderHook();
      await waitFor(() => expect(getResult().running).toBe(true));

      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
    });
  });
});
