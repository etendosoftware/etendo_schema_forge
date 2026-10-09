import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Width (px) the required width must drop below the available width before tabs that
 * were wrapped come back inline. Only the wrapped → inline direction pays it, so a width
 * change caused by the move itself (a scrollbar appearing, a rounding difference) cannot
 * flip the decision back and forth.
 */
export const LIST_TOOLBAR_TABS_HYSTERESIS_PX = 8;

/**
 * Pure fit decision for the list toolbar's subset tabs (ETP-5509).
 *
 * The main row is `[tabs] <tabsGap> [filters…] <groupGap> [actions]`. Every width it takes
 * is a NATURAL (max-content) width — what the element needs to render on one line — so the
 * decision never depends on where the tabs currently are or on whether the filters are
 * wrapping, which is what keeps it from oscillating and lets wrapped tabs come back.
 *
 * @param {object} m
 * @param {number} m.available    content width of the main row
 * @param {number} m.tabs         natural width of the subset tabs
 * @param {number} m.tabsGap      gap between the tabs and the filters cluster
 * @param {number[]} m.leftItems  natural widths of the filters cluster's flex items
 * @param {number} m.leftGap      gap between items of the filters cluster
 * @param {number} m.groupGap     minimum gap between the filters and the actions cluster
 * @param {number} m.actions      natural width of the actions cluster
 * @param {boolean} m.wasInline   the current placement, for hysteresis
 * @returns {boolean} whether the tabs fit on the main row
 */
export function computeListToolbarTabsInline({
  available, tabs, tabsGap = 0, leftItems = [], leftGap = 0, groupGap = 0, actions, wasInline = true,
}) {
  const items = leftItems.filter((w) => w > 0);
  const leftNatural = items.reduce((sum, w) => sum + w, 0) + leftGap * Math.max(items.length - 1, 0);
  const required = tabs + tabsGap + leftNatural + groupGap + actions;
  const budget = wasInline ? available : available - LIST_TOOLBAR_TABS_HYSTERESIS_PX;
  return required <= budget;
}

/**
 * The element's natural (max-content) width, whatever its current box: a filter slot that
 * grows (`flex-1`, `w-full`) or wraps its own content (`flex-wrap`, e.g. the chart of
 * accounts toolbar slot) reports its laid-out width, not what it needs on one line, so the
 * box is briefly sized to `max-content` and read. The inline style is restored before the
 * browser paints or delivers resize notifications, so nothing flickers and no observer fires.
 */
function naturalWidthOf(el) {
  const saved = el.style.cssText;
  el.style.width = 'max-content';
  el.style.maxWidth = 'none';
  el.style.flex = 'none';
  const { width } = el.getBoundingClientRect();
  el.style.cssText = saved;
  return width;
}

// The cluster's laid-out items: an element rendered with `display: contents` has no box of
// its own, so its children are the flex items (ListFilterBar flows its controls this way).
function flexItemsOf(el) {
  return Array.from(el.children).flatMap((child) => (
    getComputedStyle(child).display === 'contents' ? flexItemsOf(child) : [child]
  ));
}
const columnGapOf = (el) => Number.parseFloat(getComputedStyle(el).columnGap) || 0;
const marginLeftOf = (el) => Number.parseFloat(getComputedStyle(el).marginLeft) || 0;

/**
 * Decides, by measurement, whether the list toolbar's subset tabs fit on the main row or
 * must move to a line of their own. Returns callback refs for the four elements it measures:
 *   rowRef     the main row (its width is the space available)
 *   leftRef    the filters cluster (its flex items are summed, each at its natural width)
 *   actionsRef the actions cluster
 *   tabsRef    the subset tabs — one element, moved by CSS, never remounted
 *
 * Re-measures on any size change of those elements (ResizeObserver) and when a control is
 * added to or removed from the filters cluster, at any depth (MutationObserver). Without a
 * layout (hidden, not yet painted, jsdom) the available width is 0 and the current
 * placement is kept, so the default — tabs inline, a single row — stands.
 *
 * @param {boolean} enabled  whether the window has subset tabs at all
 */
export function useListToolbarTabsFit(enabled) {
  const [tabsInline, setTabsInline] = useState(true);
  const inlineRef = useRef(true);
  const [rowEl, rowRef] = useState(null);
  const [leftEl, leftRef] = useState(null);
  const [actionsEl, actionsRef] = useState(null);
  const [tabsEl, tabsRef] = useState(null);

  useLayoutEffect(() => {
    if (!enabled || !rowEl || !leftEl || !actionsEl || !tabsEl) return undefined;

    const measure = () => {
      const available = rowEl.getBoundingClientRect().width;
      if (available <= 0) return;
      const next = computeListToolbarTabsInline({
        available,
        tabs: naturalWidthOf(tabsEl),
        tabsGap: columnGapOf(rowEl),
        leftItems: flexItemsOf(leftEl).map(naturalWidthOf),
        leftGap: columnGapOf(leftEl),
        groupGap: columnGapOf(rowEl) + marginLeftOf(actionsEl),
        actions: naturalWidthOf(actionsEl),
        wasInline: inlineRef.current,
      });
      if (next !== inlineRef.current) {
        inlineRef.current = next;
        setTabsInline(next);
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    // Deferred to the next frame: moving the tabs resizes observed elements, and doing
    // it inside the observer callback would trip the browser's ResizeObserver loop error.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(schedule);
    const observeAll = () => {
      resizeObserver.disconnect();
      [rowEl, actionsEl, tabsEl, ...flexItemsOf(leftEl)].forEach((el) => resizeObserver.observe(el));
    };
    observeAll();
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => { observeAll(); schedule(); });
    // subtree: a control can appear inside a `display: contents` child (e.g. the status filter
    // once its column metadata loads).
    mutationObserver?.observe(leftEl, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, rowEl, leftEl, actionsEl, tabsEl]);

  return { tabsInline: enabled && tabsInline, rowRef, leftRef, actionsRef, tabsRef };
}
