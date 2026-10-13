/**
 * ETP-5681 — how old a selector's cached first page may be before reopening the selector
 * revalidates it.
 *
 * Selector option pages share the query cache for `catalogStaleTime` (5 min, ETP-4564), so a
 * quick close/reopen reuses the page with no request. Past this age, reopening still shows the
 * cached page at once but refetches it in the background and replaces it (stale-while-
 * revalidate), so a record activated or deactivated elsewhere — another tab, another user —
 * appears or disappears on the next open instead of up to the full catalog window later.
 * Writes made in this session are handled sooner by `crossSpecCacheInvalidation.js`.
 *
 * Used by `CreatableSearchSelect` (header selectors) and `SelectorInput` (line dimensions).
 */
export const SELECTOR_REVALIDATE_AFTER_MS = 30_000;

/**
 * True when a selector's first page must be refetched on open: there is no cached copy, the
 * copy was invalidated, or it is older than {@link SELECTOR_REVALIDATE_AFTER_MS}.
 *
 * @param {{ stale?: boolean, updatedAt?: number } | null | undefined} entry cache entry, if any
 * @param {number} [now] current time in ms (injectable for tests)
 * @returns {boolean}
 */
export function needsSelectorRevalidation(entry, now = Date.now()) {
  if (!entry || entry.stale) return true;
  return now - (entry.updatedAt ?? 0) >= SELECTOR_REVALIDATE_AFTER_MS;
}
