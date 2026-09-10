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

// ── awaitingRun: polling across the gap after a trigger ──────────────────────

/**
 * The W1 regression these tests exist for: polling used to be keyed on `running` alone, and a
 * SUCCESSFUL trigger response structurally never reports `running: true` — the backend refuses
 * outright when a run is already in progress, and `ProcessMonitor` writes the `AD_PROCESS_RUN` row
 * on the scheduler's own thread, so the response usually predates the row entirely. The poll
 * therefore never started: the page said the run would appear shortly and nothing ever did without
 * a manual refresh.
 *
 * Every test below drives the clock explicitly — plain `vi.useFakeTimers()`, no
 * `shouldAdvanceTime` — because the hook's deadline is computed from `Date.now()`, and a clock
 * that also moves with wall time would make the deadline assertions depend on how long the test
 * itself took. Assertions are on the NUMBER and TIMING of `fetchAcctProcessStatus` calls, never on
 * elapsed real time.
 */
describe('useAcctProcessMonitor — awaitingRun polling', () => {
  const RUN_OLD = Object.freeze({
    id: 'run-old', status: 'SUC', startTime: '2026-09-10T18:00:00', manual: false,
  });
  /** The run the trigger creates. A DIFFERENT newest id is what makes it observable. */
  const RUN_NEW = Object.freeze({
    id: 'run-new', status: 'PRC', startTime: '2026-09-10T18:02:00', manual: true,
  });
  const STARTED = Object.freeze({ started: true, reason: 'started' });

  /** How long the hook keeps waiting, and at what cadence. Mirrors the hook's own constants. */
  const POLL_MS = 5_000;
  const DEADLINE_MS = 60_000;

  function status({ runs = [RUN_OLD], running = false, triggered } = {}) {
    const payload = {
      error: false,
      processName: 'Accounting server process',
      scheduled: true,
      nextRunTime: '2026-09-10T18:05:00',
      running,
      lastRun: runs[0] ?? null,
      history: runs,
    };
    if (triggered) payload.triggered = triggered;
    return payload;
  }

  let advance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderHook() {
    const React = await import('react');
    const { render, act } = await import('@testing-library/react');
    let result;
    function Probe() {
      result = useAcctProcessMonitor();
      return null;
    }
    let view;
    // The mount effect's fetch resolves on a microtask; act() flushes it without any timer.
    await act(async () => { view = render(React.createElement(Probe)); });
    advance = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
    return { getResult: () => result, act, view };
  }

  /** Loads once, then triggers a run the backend accepts. Leaves the hook in `awaitingRun`. */
  async function loadAndTrigger({ triggerResponse } = {}) {
    fetchAcctProcessStatus.mockResolvedValue(status());
    triggerAcctProcessRun.mockResolvedValue(triggerResponse ?? status({ triggered: STARTED }));
    const harness = await renderHook();
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
    await harness.act(async () => { await harness.getResult().trigger(); });
    return harness;
  }

  it('starts polling after a successful trigger even though the response reports running:false', async () => {
    const { getResult } = await loadAndTrigger();

    // Exactly the regression shape: the trigger succeeded, yet nothing is running and the newest
    // run is still the pre-trigger one. `running` alone would leave the hook idle here forever.
    expect(getResult().triggerOutcome).toEqual(STARTED);
    expect(getResult().running).toBe(false);
    expect(getResult().awaitingRun).toBe(true);
    // Nothing polled yet — the interval has been armed, not fired.
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

    await advance(POLL_MS);

    // 2 here, 1 under the regression. This single assertion is what W1 would fail.
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
  });

  it('does NOT start polling when the trigger was refused — there is nothing coming', async () => {
    const { getResult } = await loadAndTrigger({
      triggerResponse: status({ triggered: { started: false, reason: 'alreadyRunning' } }),
    });

    expect(getResult().awaitingRun).toBe(false);

    await advance(DEADLINE_MS);

    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
  });

  it('does NOT start polling when the trigger itself rejected', async () => {
    fetchAcctProcessStatus.mockResolvedValue(status());
    triggerAcctProcessRun.mockRejectedValue(new Error('gateway timeout'));
    const { getResult, act } = await renderHook();
    await act(async () => { await getResult().trigger(); });

    expect(getResult().awaitingRun).toBe(false);

    await advance(DEADLINE_MS);

    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
  });

  it('stops polling as soon as the started run becomes observable as a new newest run', async () => {
    const { getResult } = await loadAndTrigger();
    expect(getResult().awaitingRun).toBe(true);

    // The run started AND finished between two polls — no PRC was ever visible, only a new row.
    fetchAcctProcessStatus.mockResolvedValue(status({ runs: [RUN_NEW, RUN_OLD] }));
    await advance(POLL_MS);

    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
    expect(getResult().awaitingRun).toBe(false);
    expect(getResult().data.history[0].id).toBe(RUN_NEW.id);

    // And it really stops — not merely reports itself stopped.
    await advance(DEADLINE_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
  });

  it('hands over to the running poll when the run shows up as PRC, and stops when it finishes', async () => {
    const { getResult } = await loadAndTrigger();

    // Poll 1: the backend now reports the run in progress. `awaitingRun` has done its job.
    fetchAcctProcessStatus.mockResolvedValue(status({ running: true }));
    await advance(POLL_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);
    expect(getResult().awaitingRun).toBe(false);
    expect(getResult().running).toBe(true);

    // Poll 2: it finished. Neither flag is set any more, so the polling must end.
    fetchAcctProcessStatus.mockResolvedValue(status({ runs: [RUN_NEW, RUN_OLD] }));
    await advance(POLL_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(3);
    expect(getResult().running).toBe(false);
    expect(getResult().awaitingRun).toBe(false);

    await advance(DEADLINE_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(3);
  });

  it('gives up at the 60s deadline instead of polling forever when the run never appears', async () => {
    // The scheduler silently dropped the job: no new run, no PRC, ever. Without the deadline this
    // page would poll for as long as it stayed open.
    const { getResult } = await loadAndTrigger();

    await advance(DEADLINE_MS - POLL_MS);
    expect(getResult().awaitingRun).toBe(true);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1 + (DEADLINE_MS - POLL_MS) / POLL_MS);

    await advance(POLL_MS);
    expect(getResult().awaitingRun).toBe(false);

    const settledCallCount = fetchAcctProcessStatus.mock.calls.length;
    await advance(DEADLINE_MS * 3);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(settledCallCount);
  });

  it('polls at the 5s cadence — one request per interval, never a tight loop', async () => {
    await loadAndTrigger();
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

    await advance(POLL_MS - 1);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);

    await advance(POLL_MS - 1);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);

    await advance(1);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(3);
  });

  it('a second trigger while awaiting does not stack a second poll interval', async () => {
    const { getResult, act } = await loadAndTrigger();

    // Part-way through the first interval, fire another trigger. `shouldPoll` was already true, so
    // the effect must NOT tear down and re-arm — a stacked interval would double every poll from
    // here on, and the page would hammer the endpoint for the rest of the deadline.
    await advance(2_000);
    await act(async () => { await getResult().trigger(); });
    expect(getResult().awaitingRun).toBe(true);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);

    // t = 7000. The original interval fires once (at 5000); a second one armed at 2000 would also
    // fire here, giving 3.
    await advance(POLL_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(2);

    await advance(POLL_MS);
    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(3);
  });

  it('does not dedupe the trigger request itself — the disabled button is that guard', async () => {
    // Stated as a fact, not an omission: two `trigger()` calls DO reach the backend twice. What
    // stops a duplicate one-shot in the UI is the Run now button, which is disabled for the whole
    // `triggering || running || awaitingRun` window — asserted in AcctProcessMonitorPage.vitest.jsx.
    // The backend refuses a duplicate anyway (`alreadyRunning`, pending-one-shot guard).
    const { getResult, act } = await loadAndTrigger();

    await act(async () => { await getResult().trigger(); });

    expect(triggerAcctProcessRun).toHaveBeenCalledTimes(2);
  });

  it('stops the awaiting poll when the component unmounts mid-wait', async () => {
    const { view } = await loadAndTrigger();

    view.unmount();
    await advance(DEADLINE_MS);

    expect(fetchAcctProcessStatus).toHaveBeenCalledTimes(1);
  });
});
