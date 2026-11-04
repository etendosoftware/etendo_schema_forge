import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { useUI } from '@/i18n';
import { translateBackendErrorBody } from '@/lib/backendErrors.js';
import {
  useDiscardPair, useDismissPair, usePendingLineCounts, useRestorePair,
} from '@/hooks/useBouncePairActions.js';
import {
  BOUNCE_STATE, DISCARDED_STATE, bouncePanelModel, countsWithDismissedPairs, dismissPairPayload,
  pendingLinesStatusParam,
  withDismissedPairs,
} from './bouncePairs.js';
import { visibleStatusCodes } from './reconciliationStatusFilter.js';
import { BouncePairPanel } from './BouncePairPanel.jsx';

/*
 * ── Bounce pairs in the reconciliation split panel (ETP-5581) ──────────────────────────────────
 * Two hooks, called by ReconciliationSplitPanel at the two points it needs them: the lines (before
 * the selection is resolved) and the right panel (once a line is selected). With the backend flag
 * `bank-bounce-suggestions` off and no discarded line, both are pass-throughs: the lines, counts and
 * filter codes come out exactly as they went in, and no panel is ever returned.
 */

const EMPTY_COUNTS = {};

/**
 * The toast text of a failed discard / restore: the coded refusal translated (its `AD_MESSAGE` key
 * travels in `error.messageKeys`), a request that got no answer by its own already-translated
 * message, or the action's fallback.
 */
function failureText(err, ui, fallbackKey) {
  return translateBackendErrorBody(err?.body, ui, null)
    || (isNetworkError(err) ? err.message : null)
    || ui(fallbackKey);
}

/**
 * Whether a `pendingLines` answer is the `status=discarded` one: its counts carry only
 * `discarded`, never the `all` every default answer has.
 */
function isDiscardedAnswer(counts) {
  return counts?.discarded != null && counts?.all == null;
}

/** Whether two per-state count objects hold the same numbers. */
function sameCounts(a, b) {
  const x = a ?? EMPTY_COUNTS;
  const y = b ?? EMPTY_COUNTS;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k]);
}

/** The id of the left-panel row of a line, as `StatementLinesPanel` renders it. */
function lineRowSelector(lineId) {
  return `[data-testid="recon-line-row-${String(lineId).replaceAll('"', '')}"]`;
}

/** Scrolls the left-panel row of a line into view, once it has rendered. */
function scrollLineIntoView(lineId) {
  const run = () => {
    const row = typeof document === 'undefined' ? null : document.querySelector(lineRowSelector(lineId));
    row?.scrollIntoView?.({ block: 'center' });
  };
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(run);
  else setTimeout(run, 0);
}

/**
 * The lines, counts and filter codes of the left panel, with the bounce pairs applied:
 * - the pairs the user dismissed ("No es un rechazo") read as plain pending lines again;
 * - while the `discarded` filter is active the panel's request asks for `status=discarded`
 *   (`pendingLinesStatusParam`, bouncePairs.js), whose counts carry only `discarded`: the other filters keep
 *   the counts of the last default answer;
 * - the filter codes include `bounce` / `discarded` only when the backend reports them.
 *
 * `review` is the host's shared review state (`useAutoMatchReview().panel`): with it, a pair
 * dismissed here is hidden in the automatch modal too. Without it the panel keeps its own.
 *
 * `refreshDefaultCounts()` re-reads the default answer's counts while "Descartadas" is shown (a
 * restore there moves lines back to the other filters); `accountId`, `dateFrom` and `dateTo` are
 * the panel's own request filters, for that read.
 *
 * @param {{ lines: Array<object>, counts: object, status: string|null,
 *   review?: object|null, accountId?: string, dateFrom?: string, dateTo?: string }} args
 */
export function useBounceLines({
  lines, counts, status, review = null, accountId = null, dateFrom, dateTo,
}) {
  const [ownDismissed, setOwnDismissed] = useState(() => new Set());
  const ownDismiss = useCallback((groupKey) => {
    setOwnDismissed((prev) => {
      if (!groupKey || prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.add(groupKey);
      return next;
    });
  }, []);
  const dismissedKeys = review?.dismissedKeys ?? ownDismissed;
  const dismiss = review?.onDismiss ?? ownDismiss;

  // The counts of the last default answer, for the filters the discarded answer does not count.
  // Taken from each default answer (in an effect, not during render), so they hold still while the
  // discarded one is shown — until `refreshDefaultCounts` re-reads them after a restore there.
  const [defaultCounts, setDefaultCounts] = useState(counts ?? EMPTY_COUNTS);
  const discardedAnswer = isDiscardedAnswer(counts);
  useEffect(() => {
    if (discardedAnswer) return;
    // A loading resource answers a fresh `{}` on every render: keep the same object when nothing
    // changed, or this effect would re-render forever.
    setDefaultCounts((prev) => (sameCounts(prev, counts) ? prev : (counts ?? EMPTY_COUNTS)));
  }, [counts, discardedAnswer]);
  const baseCounts = useMemo(
    () => (discardedAnswer ? { ...defaultCounts, discarded: counts.discarded } : counts),
    [counts, discardedAnswer, defaultCounts],
  );

  const fetchCounts = usePendingLineCounts();
  const refreshDefaultCounts = useCallback(async () => {
    if (status !== DISCARDED_STATE || !accountId) return;
    try {
      const fresh = await fetchCounts({ financialAccountId: accountId, dateFrom, dateTo });
      if (fresh && !isDiscardedAnswer(fresh)) setDefaultCounts(fresh);
    } catch {
      // Keep the last counts: leaving "Descartadas" reloads the default answer, and with it them.
    }
  }, [status, accountId, dateFrom, dateTo, fetchCounts]);

  const shownLines = useMemo(() => withDismissedPairs(lines, dismissedKeys), [lines, dismissedKeys]);
  const shownCounts = useMemo(
    () => countsWithDismissedPairs(baseCounts, lines, dismissedKeys),
    [baseCounts, lines, dismissedKeys],
  );
  const statusCodes = useMemo(() => visibleStatusCodes(shownCounts, status), [shownCounts, status]);
  const discardedLines = useMemo(
    () => (status === DISCARDED_STATE ? lines.filter((l) => l?.state === DISCARDED_STATE) : []),
    [lines, status],
  );

  return {
    lines: shownLines, counts: shownCounts, statusCodes, discardedLines, dismiss, refreshDefaultCounts,
  };
}

/**
 * "Revisar en el panel" (ETP-5581): the host asks the panel to show the bounce line of a pair. The
 * filter moves to "Posibles rechazos" and the search is cleared; once the lines have loaded the line
 * is selected and scrolled into view. A line outside the active date range widens it to any date
 * once; a line that is still not there is given up on. Either way the request is consumed, so a
 * later visit does not replay it.
 *
 * The lines on screen are searched right away, in the same commit as the request — unless the
 * active filter is one with its own request (`Descartadas`, `status=discarded`): leaving it reloads
 * the lines, and the discarded ones on screen cannot hold the bounce line, so the search waits for
 * that reload.
 */
function useFocusRequest({
  focus, onFocusConsumed, lines, loading, status, setStatus, setSearch, dateRange, setDateRange,
  selectLine,
}) {
  const pendingRef = useRef(null);
  // `widened`: the date range was already opened once for this request. `reloaded`: a reload was
  // seen since — until then the lines on screen are still those of the narrower range.
  const widenedRef = useRef(false);
  const reloadedRef = useRef(true);

  // The active status, read when a request arrives: changing it must not, by itself, restart one.
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!focus?.lineId) return;
    pendingRef.current = focus;
    widenedRef.current = false;
    // Leaving a filter with its own request reloads the lines: wait for that reload.
    reloadedRef.current = pendingLinesStatusParam(statusRef.current) === undefined;
    setStatus(BOUNCE_STATE);
    setSearch('');
  }, [focus, setStatus, setSearch]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (loading) {
      reloadedRef.current = true;
      return;
    }
    if (!reloadedRef.current) return;
    const line = lines.find((l) => l.id === pending.lineId);
    if (line) {
      pendingRef.current = null;
      selectLine(line);
      scrollLineIntoView(line.id);
      onFocusConsumed?.();
      return;
    }
    if (!widenedRef.current && dateRange) {
      widenedRef.current = true;
      reloadedRef.current = false;
      setDateRange(null);
      return;
    }
    pendingRef.current = null;
    onFocusConsumed?.();
  }, [focus, lines, loading, dateRange, setDateRange, selectLine, onFocusConsumed]);
}

/**
 * The right panel for the selected line when it is a line of a possible bounce pair or a discarded
 * line ({@link BouncePairPanel}), or `null` — then the split panel shows its candidate operations as
 * always. Owns the choice of original of an ambiguous pair, the discard / restore calls and their
 * toasts, and the "Revisar en el panel" focus request.
 *
 * @param {object} args
 * @returns {{ panel: JSX.Element|null }}
 */
export function useBouncePairPanel({
  accountId, currency, bcpLocale, selectedLine, lines, loading, discardedLines,
  reloadLines, onChanged, onRestored, dismiss, windowReadOnly = false,
  review = null, status = null, setStatus, setSearch, dateRange, setDateRange, selectLine,
}) {
  const ui = useUI();
  const { discardPair, loading: discarding } = useDiscardPair();
  const { restorePair, loading: restoring } = useRestorePair();
  const { dismissPair } = useDismissPair();
  // The original chosen for an ambiguous pair, remembered per bounce line.
  const [chosen, setChosen] = useState({ lineId: null, originalId: null });

  useFocusRequest({
    focus: review?.focus ?? null,
    onFocusConsumed: review?.onFocusConsumed,
    lines, loading, status, setStatus, setSearch, dateRange, setDateRange, selectLine,
  });

  const model = useMemo(() => bouncePanelModel(selectedLine, {
    discardedLines,
    chosenOriginalId: chosen.lineId === selectedLine?.id ? chosen.originalId : null,
  }), [selectedLine, discardedLines, chosen]);

  const refresh = useCallback(() => {
    reloadLines?.();
    onChanged?.();
  }, [reloadLines, onChanged]);

  const choose = useCallback((originalId) => {
    setChosen({ lineId: selectedLine?.id ?? null, originalId });
  }, [selectedLine?.id]);

  const onDismiss = useCallback(() => {
    const groupKey = selectedLine?.bouncePair?.groupKey;
    if (!groupKey) return;
    dismiss(groupKey);
    toast.success(ui('financeReconcileBounceToastDismissed'));
    // ETP-5581 — tell the backend, for its KPI event; nothing is persisted. Fire-and-forget: the
    // hide above is the whole user-visible effect, so a failure is silent. Read-only skips it.
    if (windowReadOnly) return;
    const body = dismissPairPayload(accountId, selectedLine, model);
    if (!body) return;
    try {
      Promise.resolve(dismissPair(body)).catch(() => {});
    } catch {
      // Never let the report break the dismissal.
    }
  }, [selectedLine, dismiss, ui, windowReadOnly, accountId, model, dismissPair]);

  const onDiscard = useCallback(async () => {
    if (windowReadOnly || !model?.discard) return;
    try {
      await discardPair({ financialAccountId: accountId, ...model.discard });
      toast.success(ui('financeReconcileBounceToastDiscarded'));
      refresh();
    } catch (err) {
      toast.error(failureText(err, ui, 'financeReconcileBounceToastDiscardError'));
    }
  }, [windowReadOnly, model, discardPair, accountId, ui, refresh]);

  const onRestore = useCallback(async () => {
    if (windowReadOnly || !selectedLine?.id) return;
    try {
      const result = await restorePair({ financialAccountId: accountId, lineId: selectedLine.id });
      const restored = Array.isArray(result?.restored) ? result.restored.length : 0;
      toast.success(ui(restored > 1
        ? 'financeReconcileBounceToastRestored'
        : 'financeReconcileBounceToastRestoredLine'));
      refresh();
      onRestored?.();
    } catch (err) {
      // A line discarded on its own is restored alone: its failure names the line, not a pair.
      toast.error(failureText(err, ui, model?.paired === false
        ? 'financeReconcileBounceToastRestoreLineError'
        : 'financeReconcileBounceToastRestoreError'));
    }
  }, [windowReadOnly, selectedLine, restorePair, accountId, ui, refresh, onRestored, model]);

  const panel = model ? (
    <BouncePairPanel
      model={model}
      line={selectedLine}
      currency={currency}
      bcpLocale={bcpLocale}
      onChoose={choose}
      onDismiss={onDismiss}
      onDiscard={onDiscard}
      onRestore={onRestore}
      busy={discarding || restoring}
      windowReadOnly={windowReadOnly}
      data-testid="BouncePairPanel__d0f4d5" />
  ) : null;

  return { panel };
}
