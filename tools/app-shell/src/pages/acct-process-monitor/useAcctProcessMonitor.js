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

/** Poll cadence while a run is in progress. Idle pages do not poll at all. */
const RUNNING_POLL_MS = 5000;

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

  // Only poll while the backend says something is actually running. An idle monitor page costs
  // nothing, and the poll stops on its own as soon as the run leaves PRC.
  const running = Boolean(state.data?.running);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => { load({ silent: true }); }, RUNNING_POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const trigger = useCallback(async () => {
    setTriggering(true);
    setTriggerOutcome(null);
    try {
      const payload = await triggerAcctProcessRun(HISTORY_LIMIT);
      applyPayload(payload);
      if (mounted.current) {
        // `started: false` on a 200 is a legitimate refusal (already running, scheduler in
        // standby, …). Surface the reason rather than implying the run began.
        setTriggerOutcome(payload?.triggered || { started: false, reason: 'scheduleFailed' });
      }
    } catch (err) {
      applyError(err);
      if (mounted.current) {
        setTriggerOutcome({ started: false, reason: 'scheduleFailed' });
      }
    } finally {
      if (mounted.current) setTriggering(false);
    }
  }, [applyPayload, applyError]);

  return {
    ...state,
    running,
    triggering,
    triggerOutcome,
    trigger,
    reload: load,
  };
}
