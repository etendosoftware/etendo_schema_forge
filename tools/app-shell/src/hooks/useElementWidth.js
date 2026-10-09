import { useCallback, useRef, useState } from 'react';

/**
 * Track an element's rendered width (px) with a ResizeObserver.
 *
 * Returns `[ref, width]`: attach `ref` (a callback ref, so a node that mounts late or
 * is swapped is still observed) and read `width`, which is `0` until measured, while
 * `enabled` is false, and wherever there is no layout (jsdom). Callers must treat `0`
 * as "unknown" and keep their static fallback.
 *
 * The first measurement happens during commit (callback refs run in the layout
 * phase), so a layout chosen from it applies before the first paint.
 */
export function useElementWidth(enabled = true) {
  const [width, setWidth] = useState(0);
  const observerRef = useRef(null);
  const ref = useCallback((node) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!enabled || !node) return;
    const apply = (next) => setWidth(prev => (prev === next ? prev : next));
    apply(node.getBoundingClientRect?.().width ?? 0);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, [enabled]);
  return [ref, enabled ? width : 0];
}

export default useElementWidth;
