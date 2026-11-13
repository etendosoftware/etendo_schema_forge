import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOpenableRow, reviewNeighbors } from './invoiceInboxReviewModel.js';

/**
 * The element that opened the panel: the focused one (the pencil button), else the pencil of the
 * clicked row (a row click focuses nothing), else the row itself.
 */
function findOpener(id) {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  if (active && active !== document.body) return active;
  return document.querySelector(`[data-testid="invoice-inbox-row-edit-${id}"]`)
    ?? document.querySelector(`[data-testid="row-${id}"]`);
}

/**
 * Denominator of "n de total": with no more pages the total is exactly the loaded OPENABLE rows
 * (the server counter also counts PROCESSING rows, which cannot be opened); while more pages exist
 * it is the server counter, never less than what is loaded.
 */
function totalFor(serverTotal, hasMore, loadedOpenable) {
  if (!hasMore || !Number.isFinite(serverTotal)) return loadedOpenable;
  return Math.max(serverTotal, loadedOpenable);
}

/**
 * ETP-6050 — which document the review panel has open, and its previous / next walk.
 *
 * The walk is over the rows the list already loaded for the CURRENT filter (`rows`), skipping the
 * PROCESSING ones (`reviewNeighbors`). At the end of the loaded rows, with more pages on the
 * server (`hasMore`), "next" loads the next page (`loadMore`) and moves on to the first openable
 * row it brings; if a page holds only rows still being read it keeps loading; a failed load
 * (`loadError`) or the end of the list stops it. Nothing is requested twice at once: the walk
 * waits while `loading`.
 *
 * `onClosed(ids)` runs when the panel closes, with every document opened since it was opened (the
 * page refreshes those rows and the counters).
 *
 * `serverTotal` (the filter's counter, when the page knows it) is the denominator of "n de total"
 * only while more pages exist (`hasMore`); at the end of the list it is the loaded openable rows.
 *
 * Focus: the element that opened the panel (the row's pencil, or the pencil of the clicked row) is
 * remembered and `restoreFocus()` gives it focus when the panel closes, unless it left the DOM.
 *
 * @param {{rows: object[], hasMore: boolean, loading: boolean, loadError: boolean,
 *   loadMore: () => void, onClosed?: (ids: string[]) => void, serverTotal?: number|null}} options
 */
export function useInvoiceInboxReviewNav({
  rows, hasMore, loading, loadError, loadMore, onClosed, serverTotal = null,
}) {
  const [openId, setOpenId] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const visitedRef = useRef(new Set());
  const triggerRef = useRef(null);

  const neighbors = useMemo(() => reviewNeighbors(rows, openId), [rows, openId]);
  const { prevId, nextId } = neighbors;

  const show = useCallback((id) => {
    visitedRef.current.add(id);
    setOpenId(id);
  }, []);

  const open = useCallback((row) => {
    if (!isOpenableRow(row)) return;
    triggerRef.current = findOpener(row.id);
    show(row.id);
  }, [show]);

  const restoreFocus = useCallback(() => {
    const element = triggerRef.current;
    triggerRef.current = null;
    if (element?.isConnected) element.focus?.();
  }, []);

  // `silent`: the caller already reloads the list (a discard from the panel), so `onClosed` is skipped.
  const close = useCallback((options) => {
    const visited = [...visitedRef.current];
    visitedRef.current = new Set();
    setOpenId(null);
    setAdvancing(false);
    if (visited.length && !options?.silent) onClosed?.(visited);
  }, [onClosed]);

  const goPrev = useCallback(() => {
    if (prevId) show(prevId);
  }, [prevId, show]);

  const goNext = useCallback(() => {
    if (nextId) {
      show(nextId);
    } else if (hasMore && !loading && !advancing) {
      setAdvancing(true);
      loadMore();
    }
  }, [nextId, hasMore, loading, advancing, show, loadMore]);

  // Waiting for a page: move on once it brings an openable row, ask again while it brings none.
  useEffect(() => {
    if (!advancing) return;
    if (nextId) {
      setAdvancing(false);
      show(nextId);
    } else if (!loading) {
      if (hasMore && !loadError) loadMore();
      else setAdvancing(false);
    }
  }, [advancing, nextId, loading, hasMore, loadError, loadMore, show]);

  return {
    openId,
    open,
    close,
    goPrev,
    goNext,
    position: neighbors.index >= 0 ? neighbors.index + 1 : null,
    total: totalFor(serverTotal, hasMore, neighbors.total),
    restoreFocus,
    canPrev: Boolean(prevId),
    // "Next" is available at the end of the loaded rows when the server has more.
    canNext: Boolean(nextId) || (hasMore && neighbors.index >= 0),
    advancing,
  };
}
