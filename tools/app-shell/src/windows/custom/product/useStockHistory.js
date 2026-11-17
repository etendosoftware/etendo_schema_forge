import { useEffect, useRef, useState } from 'react';
import { buildMovementsQuery } from './productMovements';
import { computePeriodRange, SIDEBAR_PERIOD_OPTIONS } from './productSidebarPeriod';

// Loads what the product side panel draws (ETP-5908): the stock rows and the product's movement
// history of the widest window the panel shows. Movements are requested newest-first, filtered on the
// window start, in pages read until one comes back short, so no row is lost to a server page cap and a
// partial read (safety cap) keeps the most recent data.

export const HISTORY_PAGE_SIZE = 500;
export const HISTORY_MAX_PAGES = 10;

const EMPTY_STATE = { stockRows: null, transactions: null, partial: false, stockFailed: false, historyFailed: false };
const WIDEST_MONTHS = Math.max(...SIDEBAR_PERIOD_OPTIONS.map(o => o.months));

/** Start of the widest window the panel can show, as a local calendar day. */
export function historyWindowStart(today = new Date()) {
  return computePeriodRange(WIDEST_MONTHS, today).start;
}

/** Path + query of one page of movements (reuses the Movements tab query builder). */
export function buildHistoryPageQuery(productId, start, offset) {
  return buildMovementsQuery({
    productId,
    filters: { dateRange: { from: start, to: null } },
    start: offset,
    pageSize: HISTORY_PAGE_SIZE,
  });
}

async function readRows(apiFetch, path, signal) {
  const res = await apiFetch(path, { signal });
  if (!res?.ok) return null;
  const json = await res.json();
  return json?.response?.data ?? [];
}

/**
 * Reads every page of movements of the window. Stops on the first page with fewer than a full page of
 * rows (totalRows is only a lower bound, so it is never used). Reaching HISTORY_MAX_PAGES full pages
 * returns `partial: true`. A failed page ends the read with what was loaded so far; when it is the
 * first page the read is `failed: true` (a failure, not an empty history).
 * @returns {Promise<{rows: object[], partial: boolean, failed: boolean}>}
 */
export async function loadMovementHistory(apiFetch, productId, start, signal) {
  const rows = [];
  for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
    const data = await readRows(apiFetch, buildHistoryPageQuery(productId, start, page * HISTORY_PAGE_SIZE), signal);
    if (!data) return { rows, partial: false, failed: page === 0 };
    rows.push(...data);
    if (data.length < HISTORY_PAGE_SIZE) return { rows, partial: false, failed: false };
  }
  return { rows, partial: true, failed: false };
}

/**
 * Stock rows + movement history of a product, fetched once per product. `apiFetch` is read through a
 * ref: its identity changes whenever the session object does (token refresh, account restore), and an
 * effect keyed on it re-fired both requests with identical results. The ref always holds the latest
 * one, which reads the live token at request time. A stale run (product changed, unmount, StrictMode
 * replay) is aborted and its answer ignored.
 * A failed read is never collapsed into an empty one: a failed `/stock` leaves `stockRows` null and sets
 * `stockFailed` (the panel shows "unavailable", not 0); a failed history sets `historyFailed` (with
 * `transactions: []`, so the read counts as finished). A legitimately empty product has `[]` and no flag.
 * @returns {{stockRows: object[]|null, transactions: object[]|null, partial: boolean, stockFailed: boolean, historyFailed: boolean}}
 */
export function useStockHistory(recordId, apiFetch) {
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    if (!recordId) return undefined;
    setState(prev => (prev === EMPTY_STATE ? prev : EMPTY_STATE));
    const controller = new AbortController();
    const { signal } = controller;
    const live = (patch) => { if (!signal.aborted) setState(prev => ({ ...prev, ...patch })); };

    readRows(apiFetchRef.current, `/stock?parentId=${recordId}&_startRow=0&_endRow=200`, signal)
      .then(rows => live(rows ? { stockRows: rows } : { stockRows: null, stockFailed: true }))
      .catch(() => live({ stockRows: null, stockFailed: true }));
    loadMovementHistory(apiFetchRef.current, recordId, historyWindowStart(), signal)
      .then(({ rows, partial, failed }) => live({ transactions: rows, partial, historyFailed: failed }))
      .catch(() => live({ transactions: [], partial: false, historyFailed: true }));

    return () => controller.abort();
  }, [recordId]);

  return state;
}
