import { useCallback, useLayoutEffect, useState } from 'react';
import { MAX_VISIBLE_TABS, computeFittingTabCount } from './detailTabStripLayout.js';

/**
 * Width-aware visible-tab count for DetailTabStrip (ETP-5515).
 *
 * `measureRef` is an invisible row holding one clone of every tab followed by a clone of the
 * "More" trigger, so natural widths are known without ever painting an overflowing layout.
 * `wrapperRef` is the strip's own box (min-w-0, so its width never depends on the tabs).
 * Re-measured in a layout effect after every render (state only changes when the count does)
 * and from a ResizeObserver on both elements, which covers window resize, sidebar open/close,
 * zoom and font loading. Without ResizeObserver or layout (jsdom) the count stays at the
 * ticket's count-only rule, MAX_VISIBLE_TABS.
 */
/**
 * Sub-pixel width: offsetWidth/clientWidth round each element to an integer, so summing five
 * rounded tabs can overshoot the real layout by a few px and evict a tab that fits. Falls back
 * to the integer width where there is no layout rect (jsdom, plain objects).
 */
function naturalWidth(el, fallback = el.offsetWidth) {
  const rectWidth = el.getBoundingClientRect?.().width;
  return rectWidth > 0 ? rectWidth : fallback;
}

export default function useFittingTabCount({ wrapperRef, measureRef, tabs, activeKey }) {
  const [count, setCount] = useState(MAX_VISIBLE_TABS);

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    const row = measureRef.current;
    if (!wrapper || !row) return;
    // The strip is clipped (overflow-hidden), so it must never stay scrolled: a focus or
    // scrollIntoView on a tab/the More trigger would otherwise leave the first tab cut off.
    if (wrapper.scrollLeft) wrapper.scrollLeft = 0;
    const widths = Array.from(row.children, (el) => naturalWidth(el));
    const moreWidth = widths.pop() ?? 0;
    setCount(computeFittingTabCount({
      widths, moreWidth, available: naturalWidth(wrapper, wrapper.clientWidth), tabs, activeKey,
    }));
  }, [wrapperRef, measureRef, tabs, activeKey]);

  useLayoutEffect(() => { measure(); });

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    if (measureRef.current) observer.observe(measureRef.current);
    return () => observer.disconnect();
  }, [measure, wrapperRef, measureRef]);

  return count;
}
