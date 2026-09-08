import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

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

export function HighlightProvider({ children }) {
  const [target, setTarget] = useState(null);
  const timerRef = useRef(null);

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

  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

/**
 * Tolerates being called outside the provider (preview mode, isolated tests)
 * by returning a no-op, mirroring useCurrentWindowContext(). A missing
 * provider must degrade the tutorial, never crash the Copilot.
 */
export function useHighlight() {
  return useContext(HighlightContext) ?? NO_HIGHLIGHT;
}
