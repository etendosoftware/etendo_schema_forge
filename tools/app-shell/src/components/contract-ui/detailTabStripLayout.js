/**
 * Pure layout rules for the Form View secondary tab strip (ETP-5515).
 *
 * At most MAX_VISIBLE_TABS tabs are shown next to the "More" menu (so 5 buttons in total,
 * "More" included). Of those, the last one is a DYNAMIC SLOT: picking a hidden tab from the
 * menu promotes it into the slot and the tab that was there drops into the menu. Selecting
 * any fixed tab (before the slot) restores the original arrangement.
 *
 * The arrangement is DERIVED from the active tab key — no extra state — so it also stays
 * correct when the active tab changes from outside the strip (a deep link, the "active tab
 * disappeared" redirect in DetailView).
 */
export const MAX_VISIBLE_TABS = 4;

/**
 * @param {Array<{key: string}>} tabs - all tabs, in their original order
 * @param {string|null|undefined} activeKey - key of the active tab
 * @param {number} [maxVisible] - visible tabs allowed besides the menu (default MAX_VISIBLE_TABS); the
 *   width-aware strip lowers it when fewer tabs fit (see computeFittingTabCount)
 * @returns {{visible: Array<{tab: object, index: number}>, hidden: Array<{tab: object, index: number}>}}
 *   `index` is the tab's position in the ORIGINAL `tabs` array (what `setActiveTab` expects).
 */
export function resolveTabStripLayout(tabs, activeKey, maxVisible = MAX_VISIBLE_TABS) {
  const entries = tabs.map((tab, index) => ({ tab, index }));
  if (entries.length <= maxVisible) return { visible: entries, hidden: [] };

  const slotIndex = Math.max(1, maxVisible - 1);
  const fixed = entries.slice(0, slotIndex);
  const rest = entries.slice(slotIndex);
  // A hidden tab that is active owns the slot; otherwise the slot keeps its initial tab.
  const promoted = rest.find((entry) => entry.tab.key === activeKey) ?? rest[0];
  return {
    visible: [...fixed, promoted],
    hidden: rest.filter((entry) => entry !== promoted),
  };
}

/** Fewest tabs the strip keeps visible (1 fixed + the slot) before it clips instead. */
export const MIN_VISIBLE_TABS = 2;

/**
 * How many tabs (<= max) fit in `available` px, "More" trigger included whenever any tab is
 * hidden. Exact: it lays out each candidate count with resolveTabStripLayout, so the width of
 * a promoted slot tab is the one summed. Falls back to `fallback` (default `max`) while geometry is unknown
 * (zero width, no layout engine, widths not measured yet) and never goes below
 * MIN_VISIBLE_TABS — below that the strip clips rather than overlapping its neighbours.
 *
 * @param {object} p
 * @param {number[]} p.widths - measured width of every tab, in original order
 * @param {number} p.moreWidth - measured width of the "More" trigger
 * @param {number} [p.max] - ceiling of the count (the strip passes tabs.length: no fixed cap)
 * @param {number} [p.fallback] - count returned while geometry is unknown
 */
export function computeFittingTabCount({ widths, moreWidth, available, tabs, activeKey, max = MAX_VISIBLE_TABS, fallback = max }) {
  if (!Number.isFinite(available) || available <= 0 || widths.length !== tabs.length || widths.every((w) => !w)) return fallback;
  const floor = Math.min(MIN_VISIBLE_TABS, max);
  for (let n = max; n > floor; n -= 1) {
    const { visible, hidden } = resolveTabStripLayout(tabs, activeKey, n);
    const total = visible.reduce((sum, e) => sum + widths[e.index], 0) + (hidden.length ? moreWidth : 0);
    if (total <= available) return n;
  }
  return floor;
}
