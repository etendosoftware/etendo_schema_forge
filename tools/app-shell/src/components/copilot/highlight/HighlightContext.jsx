import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';

/**
 * Highlight state for the Copilot's `highlight_element` tool.
 *
 * Exactly ONE element is highlighted at a time: a second call replaces the
 * first. That is deliberate — it keeps every call atomic ("point at this, say
 * this") while letting the agent chain calls so the sequence reads as a guided
 * tour without any tour state living here.
 */
const HighlightContext = createContext(null);

/** Shared no-op so `useHighlight()` outside a provider stays referentially stable. */
const NO_HIGHLIGHT = Object.freeze({
  element: null,
  note: '',
  highlight: () => {},
  clearHighlight: () => {},
});

/**
 * Clears the highlight when the route changes: the ring would otherwise keep
 * pointing at a node of the previous screen.
 *
 * A child component (rendered only inside a Router) so HighlightProvider keeps
 * working bare, in previews and isolated tests. Keyed on pathname + search —
 * the search string selects the record and sub-tab — and not on `hash`.
 */
function HighlightRouteWatcher({ onRouteChange }) {
  const { pathname, search } = useLocation();
  const route = `${pathname}${search ?? ''}`;
  // Seeded with the current route so the first render never clears a highlight.
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
  const inRouter = useInRouterContext();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearHighlight = useCallback(() => {
    clearTimer();
    setTarget(null);
  }, [clearTimer]);

  const highlight = useCallback(({ element, note = '', durationMs } = {}) => {
    clearTimer();
    if (!element) {
      setTarget(null);
      return;
    }
    setTarget({ element, note: typeof note === 'string' ? note : '' });
    if (Number.isFinite(durationMs) && durationMs > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setTarget(null);
      }, durationMs);
    }
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({
    element: target?.element ?? null,
    note: target?.note ?? '',
    highlight,
    clearHighlight,
  }), [target, highlight, clearHighlight]);

  return (
    <HighlightContext.Provider value={value}>
      {inRouter && <HighlightRouteWatcher
        onRouteChange={clearHighlight}
        data-testid="HighlightRouteWatcher__d5ee29" />}
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
