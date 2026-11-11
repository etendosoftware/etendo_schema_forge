import { useCallback, useEffect, useMemo, useRef } from 'react';
import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';
import { startTiming } from '@/lib/observability/timing.js';

export const REPORT_EVENTS = Object.freeze({
  OPENED: OBSERVABILITY_EVENTS.REPORT_OPENED,
  FILTER_APPLIED: OBSERVABILITY_EVENTS.REPORT_FILTER_APPLIED,
  GROUP_TOGGLED: OBSERVABILITY_EVENTS.REPORT_GROUP_TOGGLED,
  DRILLDOWN: OBSERVABILITY_EVENTS.REPORT_DRILLDOWN,
});

/** An event with no duration. Telemetry never breaks the screen. */
export function trackReportEvent(event, properties) {
  const { name, properties: safe } = buildObservabilityEvent(event, properties);
  Promise.resolve(track(name, safe)).catch(() => {});
}

/** Starts the clock; the returned `stop(extra)` emits the event with `durationMs`, once. */
export function startReportTiming(event, properties) {
  const stop = startTiming(event, { properties });
  return (extra) => { Promise.resolve(stop(extra)).catch(() => {}); };
}

/** `{ outcome, errorCode }` of a settled request. */
export const resultOf = (errorCode) => (errorCode ? { outcome: 'error', errorCode } : { outcome: 'success' });

// The view's state keys, in the KPI's filter types. The split dimension is not a filter type.
const FILTER_TYPES = [
  ['dateFrom', 'period'], ['dateTo', 'period'], ['orgId', 'organization'],
  ['bPartnerId', 'business_partner'], ['productId', 'product'], ['compare', 'comparison'],
];
export function filterTypeOf(patch) {
  return FILTER_TYPES.find(([key]) => key in patch)?.[1] ?? null;
}

/**
 * ETP-6080 F10 — the report-session events of the interactive view (KPI analysis, PR #25).
 *
 * - A new `reportSessionId` per report: every event carries it with `specName`.
 * - `report_opened` once per session, when the first request settles (`durationMs` from mount).
 * - `report_filter_applied` for a change marked with `markFilter(type)`: timed from the params
 *   change to the result. A newer change replaces it (its request was aborted, so no event), and
 *   a params change nobody marked (the defaults, "Limpiar filtros") emits nothing.
 *
 * `settled` is `useReportQuery`'s counter: it moves once per answered request, never on abort.
 */
// randomUUID needs a secure context (https or localhost); getRandomValues works on a plain-http host too.
const newSessionId = () => globalThis.crypto.randomUUID?.()
  ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

export function useReportTelemetry(reportId, { source, paramsKey, settled, errorCode }) {
  const session = useMemo(() => ({ specName: reportId, reportSessionId: newSessionId() }), [reportId]);
  const opened = useRef(null);
  const marked = useRef(null);
  const pending = useRef(null);

  useEffect(() => {
    opened.current = startReportTiming(REPORT_EVENTS.OPENED, session);
    pending.current = null;
  }, [session]);

  useEffect(() => {
    const type = marked.current;
    marked.current = null;
    // shortcut: a marked change that leaves the params unready sends nothing, so it is timed until the next answer; rare.
    if (type) pending.current = startReportTiming(REPORT_EVENTS.FILTER_APPLIED, { ...session, type });
  }, [paramsKey, session]);

  // Only `settled` moves this: errorCode and source are read as of that answer.
  const latest = useRef({ errorCode, source });
  latest.current = { errorCode, source };
  useEffect(() => {
    if (!settled) return;
    const result = resultOf(latest.current.errorCode);
    opened.current?.({ source: latest.current.source, ...result });
    opened.current = null;
    pending.current?.(result);
    pending.current = null;
  }, [settled]);

  const markFilter = useCallback((type) => { if (type) marked.current = type; }, []);
  const emit = useCallback((event, properties) => trackReportEvent(event, { ...session, ...properties }), [session]);
  return { session, markFilter, emit };
}
