import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { advanceHighlightScript } from './highlightScript.js';

/**
 * Highlight state for the Copilot's `highlight_element` tool.
 *
 * Exactly ONE element is highlighted at a time: a second call replaces the
 * first. That single-slot rule survives the multi-step script — a script does
 * not stack rings, it moves the one ring along an ordered list of steps while
 * remembering where in the list the user is.
 *
 * Two entry points, deliberately kept apart at the API surface:
 *  - `highlight({element, note, durationMs})` — one element, resolved by the
 *    caller. Unchanged: no navigation chrome, `durationMs` honoured.
 *  - `highlightScript({steps, durationMs})` — a mini tutorial. Each step
 *    carries its own `resolve()` closure so this context stays DOM-agnostic
 *    (the Copilot hook owns the dom-N registry and the fieldKey lookup) and so
 *    resolution happens on advance, not up front.
 *
 * Internally both are the same state shape, `{element, note, index, total}`,
 * which is why the overlay needs no branch beyond "is total > 1".
 *
 * A script is SINGLE-WINDOW by design: HighlightRouteWatcher below cancels it
 * on any route change. Cross-window guided tours belong to the walkthrough
 * engine in @etendosoftware/app-shell-core, which owns navigation between
 * steps.
 */
const HighlightContext = createContext(null);

const EMPTY_SCRIPT_RESULT = Object.freeze({ total: 0, currentStep: 0, element: null, skipped: [] });

/** Shared no-op so `useHighlight()` outside a provider stays referentially stable. */
const NO_HIGHLIGHT = Object.freeze({
  element: null,
  note: '',
  stepIndex: 0,
  stepCount: 0,
  hasNext: false,
  hasPrevious: false,
  highlight: () => {},
  highlightScript: () => EMPTY_SCRIPT_RESULT,
  next: () => {},
  previous: () => {},
  clearHighlight: () => {},
});

/**
 * Clears the highlight when the user moves to another window/record.
 *
 * Why a child component instead of calling useLocation() in the provider:
 * HighlightProvider must keep working with no Router above it (previews and
 * isolated tests mount it bare, and useHighlight() is deliberately tolerant of
 * a missing provider for the same reason). Rendering this watcher only when
 * useInRouterContext() says there is a Router keeps that tolerance without
 * conditionally calling a hook. It also keeps the cleanup in the *context*
 * rather than in HighlightOverlay, so a consumer that reads the highlight
 * without rendering the overlay still gets it — and so the pending durationMs
 * timer and the element reference are actually released, which the overlay
 * (which only stops painting a disconnected node) can never do.
 *
 * Keyed on pathname + search, not pathname alone: in this app the search string
 * is what selects the record and the sub-tab (`?recordId=…`), so a search-only
 * change means the user is looking at something else even when the highlighted
 * node survives — the persisting-highlight case this fixes. The trade-off is
 * that a highlight on a header field still on screen is dismissed a little
 * eagerly; that is acceptable for a transient pointer the agent can re-issue.
 * `hash` is excluded: an in-page anchor is not a context change.
 */
function HighlightRouteWatcher({ onRouteChange }) {
  const { pathname, search } = useLocation();
  const route = `${pathname}${search ?? ''}`;
  // Seeded with the current route so the first effect run is a no-op: a
  // highlight requested before/while mounting must not be wiped by a spurious
  // first-render clear.
  const previousRoute = useRef(route);

  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    onRouteChange();
  }, [route, onRouteChange]);

  return null;
}

export function HighlightProvider({ children }) {
  const [target, setTarget] = useState(null);
  const timerRef = useRef(null);
  // The running script. Held in a ref, not in state, because the resolvers are
  // caller-owned closures: they are not rendered, and re-rendering on them
  // would only churn the overlay.
  const scriptRef = useRef(null);
  const inRouter = useInRouterContext();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(durationMs => {
    if (Number.isFinite(durationMs) && durationMs > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        scriptRef.current = null;
        setTarget(null);
      }, durationMs);
    }
  }, []);

  const clearHighlight = useCallback(() => {
    clearTimer();
    scriptRef.current = null;
    setTarget(null);
  }, [clearTimer]);

  const highlight = useCallback(({ element, note = '', durationMs } = {}) => {
    clearTimer();
    scriptRef.current = null;
    if (!element) {
      setTarget(null);
      return;
    }
    setTarget({ element, note: typeof note === 'string' ? note : '', index: 0, total: 1 });
    startTimer(durationMs);
  }, [clearTimer, startTimer]);

  /**
   * Start a mini tutorial over an ordered list of steps.
   *
   * `durationMs` is honoured only for a one-step script, where it means what it
   * has always meant. With several steps it is IGNORED on purpose: auto-advance
   * is not what was asked for (the user drives with a button), and an auto-clear
   * would yank the tutorial away mid-sentence. The tool description says so, so
   * the model is not silently disobeyed.
   *
   * @returns {{total:number, currentStep:number, element:Element|null, skipped:Array<{step:number, reason:string}>}}
   *   `currentStep` is 1-based, or 0 when not one step could be resolved.
   *   `element` is the node that ended up on screen, so the caller can report
   *   it back without resolving the same step a second time.
   */
  const highlightScript = useCallback(({ steps, durationMs } = {}) => {
    clearTimer();
    const list = (Array.isArray(steps) ? steps : []).filter(step => typeof step?.resolve === 'function');
    if (!list.length) {
      scriptRef.current = null;
      setTarget(null);
      return EMPTY_SCRIPT_RESULT;
    }
    const outcome = advanceHighlightScript(list, 0, 1);
    if (outcome.index < 0) {
      scriptRef.current = null;
      setTarget(null);
      return { total: list.length, currentStep: 0, element: null, skipped: outcome.skipped };
    }
    scriptRef.current = list;
    setTarget({ element: outcome.element, note: outcome.note, index: outcome.index, total: list.length });
    if (list.length === 1) startTimer(durationMs);
    return {
      total: list.length,
      currentStep: outcome.index + 1,
      element: outcome.element,
      skipped: outcome.skipped,
    };
  }, [clearTimer, startTimer]);

  /**
   * Move one step, resolving the destination as we go.
   *
   * Forward with nothing left resolvable ends the tutorial cleanly rather than
   * leaving a ring on a stale element. Backward keeps the current step: closing
   * the tour on Back would be a surprise, and the user can always press Escape.
   */
  const step = useCallback(direction => {
    clearTimer();
    setTarget(current => {
      const list = scriptRef.current;
      if (!list || !current) return current;
      const outcome = advanceHighlightScript(list, current.index + direction, direction);
      if (outcome.index < 0) return direction > 0 ? null : current;
      return { element: outcome.element, note: outcome.note, index: outcome.index, total: list.length };
    });
  }, [clearTimer]);

  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => {
    const stepCount = target ? target.total ?? 1 : 0;
    const stepIndex = target?.index ?? 0;
    return {
      element: target?.element ?? null,
      note: target?.note ?? '',
      stepIndex,
      stepCount,
      hasNext: stepIndex < stepCount - 1,
      hasPrevious: stepIndex > 0,
      highlight,
      highlightScript,
      next,
      previous,
      clearHighlight,
    };
  }, [target, highlight, highlightScript, next, previous, clearHighlight]);

  return (
    <HighlightContext.Provider value={value}>
      {inRouter ? <HighlightRouteWatcher onRouteChange={clearHighlight} /> : null}
      {children}
    </HighlightContext.Provider>
  );
}

/**
 * Tolerates being called outside the provider (preview mode, isolated tests)
 * by returning a no-op, mirroring useCurrentWindowContext(). A missing
 * provider must degrade the tutorial, never crash the Copilot.
 */
export function useHighlight() {
  return useContext(HighlightContext) ?? NO_HIGHLIGHT;
}
