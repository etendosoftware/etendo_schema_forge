import { useEffect, useRef } from 'react';
import {
  shouldKeepLocating, centerOptionInPanel, resolveSelectedIndex, hasCommittedValue,
} from './selectorSelection.js';

/**
 * ETP-5903 — the reopen behaviour shared by the paged combos (InlineSearchCombo,
 * CreatableSearchSelect): locate the committed value in place and centre it in the panel.
 *
 * - Every open starts untouched (`interactedRef`) and not yet centred.
 * - AC4: a typed search shows its results from the top, even after the list was centred.
 * - The walk: while `walkEnabled`, a committed value that is not on the loaded `rows` loads the
 *   next page, one page at a time, until it shows up IN PLACE, the list ends, the user takes over,
 *   or LOCATE_SELECTION_MAX_PAGES is reached; then `setLocateDone(true)` hands over to the
 *   ETP-5846 pin. One step per settled page: `settledFetches` re-runs it once each fetch has fully
 *   finished, so the caller's in-flight guard in `fetchPage` can never swallow a step.
 * - The centring: ONCE per open, when the committed option first appears, never under a user who
 *   already typed or pressed a key. An option among the last loaded rows cannot be centred yet: it
 *   is retried when the next page lands.
 *
 * @param {object} p
 * @param {boolean} p.open
 * @param {string} p.query typed search text
 * @param {{current: HTMLElement|null}} p.dropdownRef the scrollable options panel
 * @param {{current: boolean}} p.interactedRef set by the caller when the user types or presses a key
 * @param {*} p.value the committed id
 * @param {*} [p.excludeId] an id the list hides on purpose: a value equal to it counts as found
 * @param {boolean} [p.paged=true] the list is fed by server pages (the walk only runs then)
 * @param {string} p.selectorUrl
 * @param {Array|null} p.rows the loaded server pages, null until the first one lands
 * @param {boolean} [p.loading=false] a page is loading: the walk waits (`rows` may be stale)
 * @param {boolean} [p.panelLoading=false] the panel shows its loading state: no centring yet
 * @param {boolean} p.hasMore another page may exist
 * @param {number} p.pageSize
 * @param {number} p.settledFetches bumped by the caller every time a page fetch has settled
 * @param {boolean} p.locateDone
 * @param {(done: boolean) => void} p.setLocateDone
 * @param {(query: string, offset: number) => void} p.fetchPage stable page loader
 * @param {{current: number}} p.offsetRef offset of the next page
 * @param {number} p.selectedIndex the committed option's index in the rendered list, -1 if absent
 * @param {number} p.renderedCount rows in the rendered list
 * @param {*} p.layoutKey changes when the panel is (re)positioned
 */
export function useLocateCommittedValue({
  open, query, value, excludeId = null, dropdownRef, interactedRef,
  paged = true, selectorUrl, rows, loading = false, panelLoading = false,
  hasMore, pageSize, settledFetches, locateDone, setLocateDone, fetchPage, offsetRef,
  selectedIndex, renderedCount, layoutKey,
}) {
  const centeredRef = useRef(false);
  const searching = query.trim() !== '';
  const walkEnabled = paged && open && hasCommittedValue(value) && !!selectorUrl && !loading && !searching;
  const found = resolveSelectedIndex(rows ?? [], value) !== -1 || (excludeId != null && value === excludeId);
  const centreBlocked = searching || panelLoading;

  useEffect(() => {
    interactedRef.current = false;
    centeredRef.current = false;
  }, [open, interactedRef]);

  useEffect(() => {
    if (searching && dropdownRef.current) dropdownRef.current.scrollTop = 0;
  }, [query, searching, dropdownRef]);

  useEffect(() => {
    if (!walkEnabled || locateDone || rows == null) return;
    const keepGoing = shouldKeepLocating({
      found, hasMore, loadedRows: rows.length, pageSize, interacted: interactedRef.current,
    });
    if (keepGoing) fetchPage('', offsetRef.current);
    else setLocateDone(true);
  }, [walkEnabled, locateDone, rows, found, hasMore, pageSize, settledFetches, fetchPage, offsetRef, setLocateDone, interactedRef]);

  useEffect(() => {
    if (!open || selectedIndex < 0 || centreBlocked || centeredRef.current || interactedRef.current) return;
    const panel = dropdownRef.current;
    const el = panel?.querySelector(`[data-option-index="${selectedIndex}"]`);
    if (!el) return;
    centeredRef.current = centerOptionInPanel(panel, el) || !hasMore;
  }, [open, selectedIndex, centreBlocked, layoutKey, renderedCount, hasMore, dropdownRef, interactedRef]);
}
