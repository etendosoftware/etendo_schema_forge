import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  shouldKeepLocating, centerOptionInPanel, resolveSelectedIndex, hasCommittedValue,
  locatePageLimit, LOCATE_SELECTION_MAX_PAGES,
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
 * - ETP-6103, bigger pages: the walk (and the caller's first page, see `firstPageLimit`) requests
 *   `locatePageLimit` rows per page instead of the picker's own `pageSize`; the total row cap stays
 *   LOCATE_SELECTION_MAX_PAGES x `pageSize`.
 * - ETP-6103, the hold: while the committed value is being located and centred the hook returns
 *   `locating: true`. The caller then keeps its rows laid out but invisible (they must keep layout so
 *   the centring can measure them), hides its scrollbar and shows `<LocatingNotice/>`. The hold ends
 *   when the value is centred (a value among the last loaded rows stays held until one more page
 *   lands or the list ends; a page that adds no rows twice in a row also ends it, whatever `hasMore` says), when it cannot be found (the ETP-5846 pin takes over), when a page
 *   fails or the list ends, when the user types or presses a key, and on close. It never starts
 *   before the first page has landed (the caller's own loading state covers that) nor when there is
 *   no committed value. Centring and release happen in a layout effect, so the first painted frame
 *   is already centred.
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
 * @param {boolean} [p.canFetch=!!selectorUrl] whether more pages can be loaded at all (ETP-5948: a
 *   caller fed by a `loadPage` function, like SearchPopup, has no selector URL)
 * @param {Array|null} p.rows the loaded server pages, null until the first one lands
 * @param {number} [p.loadedRows=rows.length] rows fetched so far, for the page cap (ETP-5948: a
 *   caller that deduplicates its pages shows fewer rows than it fetched)
 * @param {boolean} [p.loading=false] a page is loading: the walk waits (`rows` may be stale)
 * @param {boolean} [p.panelLoading=false] the panel shows its loading state: no centring yet
 * @param {boolean} p.hasMore another page may exist
 * @param {number} p.pageSize the picker's own page size
 * @param {boolean} [p.largePages=true] request LOCATE_WALK_PAGE_SIZE rows per walk page; false keeps
 *   `pageSize` (a picker whose rows are costly to mount, like the product drawer's avatars)
 * @param {number} p.settledFetches bumped by the caller every time a page fetch has settled
 * @param {boolean} p.locateDone
 * @param {(done: boolean) => void} p.setLocateDone
 * @param {(query: string, offset: number, opts: {limit: number}) => void} p.fetchPage stable page loader;
 *   Returns `false` when the call was swallowed by the loader's own in-flight guard.
 *   `opts.limit` is the number of rows to request (a `hasMore` it infers itself must use THAT limit; an empty page ends the walk)
 * @param {{current: number}} p.offsetRef offset of the next page
 * @param {number} p.selectedIndex the committed option's index in the rendered list, -1 if absent
 * @param {number} p.renderedCount rows in the rendered list
 * @param {*} p.layoutKey changes when the panel is (re)positioned
 * @returns {{locating: boolean}} true while the caller must hold its list (see above)
 */
export function useLocateCommittedValue({
  open, query, value, excludeId = null, dropdownRef, interactedRef,
  paged = true, selectorUrl, canFetch = !!selectorUrl, rows, loadedRows = rows?.length ?? 0,
  loading = false, panelLoading = false,
  hasMore, pageSize, largePages = true, settledFetches, locateDone, setLocateDone, fetchPage, offsetRef,
  selectedIndex, renderedCount, layoutKey,
}) {
  const centeredRef = useRef(false);
  // The last page request: rows loaded and fetches settled when it was issued, and how many settles
  // since then added no rows. One such settle can belong to a fetch that was already running (the
  // opening page settles after the walk has started), so the walk only gives up on the second one.
  const lastRequestRef = useRef(null);
  const settledWithoutRows = () => {
    const last = lastRequestRef.current;
    return last != null && settledFetches > last.settled && loadedRows === last.loaded;
  };
  const stalled = () => settledWithoutRows() && lastRequestRef.current.strikes >= 1;
  // A loader whose in-flight guard swallowed the call returns false: that is not a request.
  const requestNextPage = () => {
    const strikes = settledWithoutRows() ? lastRequestRef.current.strikes + 1 : 0;
    if (fetchPage('', offsetRef.current, { limit: walkLimit }) === false) return;
    lastRequestRef.current = { loaded: loadedRows, settled: settledFetches, strikes };
  };
  const walkLimit = largePages ? locatePageLimit(pageSize, loadedRows) : pageSize;
  const [released, setReleased] = useState(false);
  const searching = query.trim() !== '';
  const walkEnabled = paged && open && hasCommittedValue(value) && canFetch && !loading && !searching;
  const found = resolveSelectedIndex(rows ?? [], value) !== -1 || (excludeId != null && value === excludeId);
  const centreBlocked = searching || panelLoading;
  // The walk is over and there is nothing to centre: not found (the pin takes over), or hidden.
  const nothingToCentre = locateDone && selectedIndex < 0;
  const locating = open && paged && canFetch && rows != null && hasCommittedValue(value) && !searching
    && !released && !nothingToCentre && !interactedRef.current;

  useLayoutEffect(() => {
    interactedRef.current = false;
    centeredRef.current = false;
    lastRequestRef.current = null;
    setReleased(false);
  }, [open, interactedRef]);

  useEffect(() => {
    if (searching && dropdownRef.current) dropdownRef.current.scrollTop = 0;
  }, [query, searching, dropdownRef]);

  useEffect(() => {
    if (!walkEnabled || locateDone || rows == null) return;
    const keepGoing = shouldKeepLocating({
      found, hasMore, loadedRows, pageSize, interacted: interactedRef.current,
    });
    if (keepGoing && !stalled()) {
      requestNextPage();
    } else setLocateDone(true);
  }, [walkEnabled, locateDone, rows, loadedRows, found, hasMore, pageSize, walkLimit, settledFetches, fetchPage, offsetRef, setLocateDone, interactedRef]);

  useLayoutEffect(() => {
    if (!open || selectedIndex < 0 || centreBlocked || centeredRef.current || interactedRef.current) return;
    // Rows from the local catalog can match before any server page landed: wait for the page.
    if (paged && canFetch && rows == null) return;
    const panel = dropdownRef.current;
    const el = panel?.querySelector(`[data-option-index="${selectedIndex}"]`);
    if (!el) return;
    if (centerOptionInPanel(panel, el) || !hasMore) {
      centeredRef.current = true;
      setReleased(true);
    } else if (paged && canFetch && loading) {
      // A page is in flight: stay held; `settledFetches` re-runs this once it has landed.
    } else if (paged && canFetch && !stalled() && loadedRows < LOCATE_SELECTION_MAX_PAGES * pageSize) {
      // Among the last loaded rows: it can only be centred once more rows exist below it.
      requestNextPage();
    } else {
      // Page cap reached or the list stopped growing: keep it where it is, never hold forever.
      centeredRef.current = true;
      setReleased(true);
    }
  }, [open, selectedIndex, centreBlocked, layoutKey, renderedCount, hasMore, loading, settledFetches, loadedRows, paged, canFetch, rows, pageSize, walkLimit, fetchPage, offsetRef, dropdownRef, interactedRef]);

  return { locating };
}
