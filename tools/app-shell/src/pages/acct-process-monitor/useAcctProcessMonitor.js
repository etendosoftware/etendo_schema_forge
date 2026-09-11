import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAcctProcessStatus,
  triggerAcctProcessRun,
} from '@/lib/acctProcessMonitorApi.js';

/**
 * ETP-5269 — data layer for the accounting-process monitor page.
 *
 * Owns the fetch/trigger lifecycle, the "is a run in flight" bookkeeping and the poll that keeps a
 * running job's outcome arriving without the admin reloading. The page component stays
 * presentational, matching `useRolesOverviewData` / `RolesOverviewPage`.
 */

/** How many history rows to show. Well under the backend's own 100 cap. */
export const HISTORY_LIMIT = 20;

/** Poll cadence while a run is in progress or awaited. Idle pages do not poll at all. */
const RUNNING_POLL_MS = 5000;

/**
 * How long to keep polling after a successful trigger while waiting for the run to become
 * observable. Generous on purpose: the accounting run itself takes well under a second, but the
 * gap being covered is scheduler latency plus one poll interval, and giving up early would put the
 * page back in the state this deadline exists to prevent — idle, with nothing having appeared.
 */
const AWAIT_RUN_MS = 60000;

/**
 * The full `AD_PROCESS_RUN.STATUS` code set, from `org.openbravo.scheduling.Process`. Mapped to a
 * visual tone and an i18n key so the UI never shows a raw three-letter code.
 *
 * `PCE` (Prevent Concurrent Executions) is included even though the reference instance has never
 * produced one: the constant exists in core, so a run can carry it, and an unmapped code would
 * otherwise fall through to the raw string.
 */
export const RUN_STATUS_META = Object.freeze({
  SUC: { tone: 'success', labelKey: 'acctProcessStatusSuccess' },
  COM: { tone: 'success', labelKey: 'acctProcessStatusComplete' },
  PRC: { tone: 'info', labelKey: 'acctProcessStatusProcessing' },
  SCH: { tone: 'info', labelKey: 'acctProcessStatusScheduled' },
  ERR: { tone: 'error', labelKey: 'acctProcessStatusError' },
  KIL: { tone: 'error', labelKey: 'acctProcessStatusKilled' },
  MIS: { tone: 'warning', labelKey: 'acctProcessStatusMisfired' },
  UNS: { tone: 'warning', labelKey: 'acctProcessStatusUnscheduled' },
  SYR: { tone: 'warning', labelKey: 'acctProcessStatusSystemRestart' },
  PCE: { tone: 'warning', labelKey: 'acctProcessStatusPreventConcurrent' },
});

/** Unknown code → neutral tone and no i18n key, so the caller falls back to the raw code. */
export function statusMeta(code) {
  return RUN_STATUS_META[code] || { tone: 'neutral', labelKey: null };
}

const EMPTY_STATE = Object.freeze({
  loading: true,
  error: null,
  denied: false,
  notInstalled: false,
  data: null,
});

/**
 * Parses a server timestamp for display.
 *
 * The backend emits `yyyy-MM-ddTHH:mm:ss` with NO zone, because the underlying columns are
 * `timestamp without time zone` — server wall-clock, which is how the rest of Etendo treats them.
 * A date-time string without an offset is parsed as LOCAL time per the language spec, so this
 * round-trips the wall clock unchanged and never shifts it.
 *
 * This is a full instant, not a calendar date, so `parseCalendarDate` from `lib/dateOnly.js`
 * deliberately does NOT apply here — that helper exists for date-only values, where a UTC-midnight
 * parse would roll the day back under a negative offset. There is no day to roll here.
 */
export function parseRunTimestamp(raw) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function useAcctProcessMonitor() {
  const [state, setState] = useState(EMPTY_STATE);
  const [triggering, setTriggering] = useState(false);
  const [triggerOutcome, setTriggerOutcome] = useState(null);
  // Timestamp after which we stop waiting for a triggered run to show up; null when not waiting.
  const [awaitingUntil, setAwaitingUntil] = useState(null);
  // The newest run id at the moment of the trigger — the baseline "a new run appeared" is measured
  // against. A ref, not state: it must be readable synchronously inside `trigger`.
  const awaitedAfterRunId = useRef(null);
  // Mirrors the newest run id for that synchronous read, since `state` is a render-time snapshot.
  const latestRunIdRef = useRef(null);
  // Guards against a poll or a late in-flight response overwriting state after unmount.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const applyPayload = useCallback((payload) => {
    if (!mounted.current) return;
    // A refusal arrives as a 200 with `error: true` (see acctProcessMonitorApi.js) — a state to
    // render, not a failure to report. `reason` separates "you may not see this" from "this
    // instance has no accounting process"; they need very different messages, so never collapse
    // them into one generic error.
    if (payload?.error) {
      // Matched explicitly, never by "anything that isn't X". An unrecognised reason — an older
      // or newer backend — falls through to the generic error state carrying the server's own
      // message, which is honest. Defaulting it to `denied` would tell an admin they lack
      // permission for what is really a server-side problem.
      setState({
        loading: false,
        error: payload.reason === 'notAuthorized' || payload.reason === 'notInstalled'
          ? null
          : (payload.message || 'Unknown error'),
        denied: payload.reason === 'notAuthorized',
        notInstalled: payload.reason === 'notInstalled',
        data: null,
      });
      return;
    }
    setState({ loading: false, error: null, denied: false, notInstalled: false, data: payload });
  }, []);

  const applyError = useCallback((err) => {
    if (!mounted.current) return;
    setState({
      loading: false,
      error: err?.message || String(err),
      denied: false,
      notInstalled: false,
      data: null,
    });
  }, []);

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) {
      setState((s) => ({ ...s, loading: true, error: null }));
    }
    return fetchAcctProcessStatus(HISTORY_LIMIT).then(applyPayload).catch(applyError);
  }, [applyPayload, applyError]);

  useEffect(() => { load(); }, [load]);

  const running = Boolean(state.data?.running);

  // Poll while EITHER the backend reports a run in progress, OR we have just started one and are
  // still waiting for it to become observable.
  //
  // `running` alone is not enough, and this is the bug that shipped: the trigger refuses outright
  // when a run is already in progress, so `running` is false in every SUCCESSFUL trigger response.
  // Worse, `ProcessMonitor` writes the AD_PROCESS_RUN row on the scheduler's own thread, so the
  // triggering response frequently predates the row entirely. Keyed on `running` alone the poll
  // never started, and the page kept promising "it will appear in the history shortly" while
  // nothing ever arrived without a manual refresh.
  const awaitingRun = awaitingUntil !== null && Date.now() < awaitingUntil;
  const shouldPoll = running || awaitingRun;
  useEffect(() => {
    if (!shouldPoll) return undefined;
    const id = setInterval(() => { load({ silent: true }); }, RUNNING_POLL_MS);
    return () => clearInterval(id);
  }, [shouldPoll, load]);

  // Stop waiting as soon as the run becomes observable — a new newest-run id, or the backend
  // reporting PRC. After that `running` alone governs, so the poll ends when the run finishes.
  // The deadline is the backstop for the outcomes that never produce either signal: a run that
  // starts AND finishes between two polls, or a job the scheduler silently dropped.
  const latestRunId = state.data?.lastRun?.id ?? null;
  useEffect(() => { latestRunIdRef.current = latestRunId; }, [latestRunId]);
  useEffect(() => {
    if (awaitingUntil === null) return undefined;
    if (running || (latestRunId !== null && latestRunId !== awaitedAfterRunId.current)) {
      setAwaitingUntil(null);
      return undefined;
    }
    // Re-evaluate once the deadline passes, so a page left open stops polling on its own.
    const remaining = awaitingUntil - Date.now();
    if (remaining <= 0) {
      setAwaitingUntil(null);
      return undefined;
    }
    const id = setTimeout(() => { if (mounted.current) setAwaitingUntil(null); }, remaining);
    return () => clearTimeout(id);
  }, [awaitingUntil, running, latestRunId]);

  const trigger = useCallback(async () => {
    setTriggering(true);
    setTriggerOutcome(null);
    // Remember which run was newest BEFORE the trigger, so "a new run appeared" is a comparison
    // rather than a guess. Captured here, not in the effect, which would race the response.
    awaitedAfterRunId.current = latestRunIdRef.current;
    try {
      const payload = await triggerAcctProcessRun(HISTORY_LIMIT);
      applyPayload(payload);
      if (mounted.current) {
        // `started: false` on a 200 is a legitimate refusal (already running, scheduler in
        // standby, …). Surface the reason rather than implying the run began.
        const outcome = payload?.triggered || { started: false, reason: 'scheduleFailed' };
        setTriggerOutcome(outcome);
        // Only a run we actually started is worth waiting for. A refusal has nothing coming.
        setAwaitingUntil(outcome.started ? Date.now() + AWAIT_RUN_MS : null);
      }
    } catch (err) {
      applyError(err);
      if (mounted.current) {
        setTriggerOutcome({ started: false, reason: 'scheduleFailed' });
        setAwaitingUntil(null);
      }
    } finally {
      if (mounted.current) setTriggering(false);
    }
  }, [applyPayload, applyError]);

  return {
    ...state,
    running,
    // True from a successful trigger until the run becomes observable or the deadline lapses. The
    // page uses it to keep the button disabled and the spinner up across that gap — otherwise the
    // UI would look idle while a run it just started was still on its way.
    awaitingRun,
    triggering,
    triggerOutcome,
    trigger,
    reload: load,
  };
}
