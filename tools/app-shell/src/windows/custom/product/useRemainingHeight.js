import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Product detail: a tab's own scroll box must be bounded by the space that is left below it, so the
// page (DetailView's content column) never scrolls and the form header + tab strip stay in place.
// DetailView's content column is `overflow-auto` and unbounded for the content, so a fixed
// `100vh - N` guess overflows it as soon as the header above (cost banner, form rows) grows.

/** Height left in the scroll column below an element, or null when it cannot be measured. */
export function computeRemainingHeight({ boxTop, containerTop, containerClientHeight, containerScrollTop, bottomGap, minHeight }) {
  if (![boxTop, containerTop, containerClientHeight].every(Number.isFinite) || containerClientHeight <= 0) return null;
  // Position of the box inside the column's content, independent of how far the column is scrolled.
  const offset = boxTop - containerTop + (containerScrollTop || 0);
  return Math.max(minHeight, Math.floor(containerClientHeight - offset - bottomGap));
}

function findScrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = globalThis.getComputedStyle?.(p)?.overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
}

/**
 * Returns `{ ref, style }` for the scroll box. `style.maxHeight` is the room left below the box in its
 * nearest scrolling ancestor (viewport when there is none), re-measured on resize and whenever a
 * sibling above it changes size (banner shown/hidden, form rows wrapping, panel collapsed).
 */
export function useRemainingHeight({ active = true, bottomGap = 20, minHeight = 200 } = {}) {
  const ref = useRef(null);
  const [maxHeight, setMaxHeight] = useState(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const container = findScrollParent(el);
    const box = el.getBoundingClientRect();
    const next = container
      ? computeRemainingHeight({
        boxTop: box.top,
        containerTop: container.getBoundingClientRect().top,
        containerClientHeight: container.clientHeight,
        containerScrollTop: container.scrollTop,
        bottomGap,
        minHeight,
      })
      : computeRemainingHeight({
        boxTop: box.top, containerTop: 0, containerClientHeight: globalThis.innerHeight, containerScrollTop: 0, bottomGap, minHeight,
      });
    if (next != null) setMaxHeight((prev) => (prev === next ? prev : next));
  }, [bottomGap, minHeight]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    measure();
    const container = findScrollParent(ref.current);
    globalThis.addEventListener?.('resize', measure);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      if (container) {
        observer.observe(container);
        Array.from(container.children).forEach((child) => observer.observe(child));
      }
    }
    return () => {
      globalThis.removeEventListener?.('resize', measure);
      observer?.disconnect();
    };
  }, [active, measure]);

  // Content above the box can change without a resize of the column (fonts, async banner): re-measure
  // on the next frame after each commit of an active tab, cheap and idempotent (setState bails out).
  useEffect(() => {
    if (!active) return undefined;
    const id = globalThis.requestAnimationFrame?.(measure);
    return () => { if (id != null) globalThis.cancelAnimationFrame?.(id); };
  });

  return { ref, style: maxHeight == null ? undefined : { maxHeight } };
}
