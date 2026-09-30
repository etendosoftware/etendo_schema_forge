/**
 * ETP-5504 — structured breadcrumb for the TopBar.
 *
 * Producers historically publish `breadcrumb` as a plain `' / '`-joined string through PageMeta.
 * The TopBar now needs to know where each level starts and ends (to collapse the middle ones
 * behind a "⋯" menu) and, when possible, where each level leads to. So a breadcrumb may now be:
 *   - a string            → split on `' / '`, levels are labels only (not navigable)
 *   - an array of items   → each item a string or `{ label, href?, onClick? }`
 *   - any other React node → rendered as-is, no overflow handling (legacy escape hatch)
 */

/** Separator used by every string producer in the app. */
export const BREADCRUMB_SEPARATOR = ' / ';

/** UX: at most this many levels are visible; the rest collapse behind "⋯". */
export const BREADCRUMB_MAX_VISIBLE = 3;

function toItem(entry) {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const label = String(entry).trim();
    return label ? { label } : null;
  }
  if (entry && typeof entry === 'object' && entry.label != null) {
    const label = String(entry.label).trim();
    if (!label) return null;
    return { label, href: entry.href || undefined, onClick: entry.onClick || undefined };
  }
  return null;
}

/**
 * @param {unknown} breadcrumb
 * @returns {Array<{label: string, href?: string, onClick?: Function}> | null}
 *   the normalized levels, or null when the value is not a string/array (render as-is).
 */
export function normalizeBreadcrumb(breadcrumb) {
  if (typeof breadcrumb === 'string') {
    return breadcrumb.split(BREADCRUMB_SEPARATOR).map(toItem).filter(Boolean);
  }
  if (Array.isArray(breadcrumb)) {
    return breadcrumb.map(toItem).filter(Boolean);
  }
  return null;
}

/**
 * Splits the levels into what is shown and what hides behind "⋯". The current page (last level)
 * is always visible and never part of `hidden`.
 */
export function splitBreadcrumb(items, maxVisible = BREADCRUMB_MAX_VISIBLE) {
  if (items.length <= maxVisible) {
    return { head: items.slice(0, -1), hidden: [], current: items.at(-1) ?? null };
  }
  return { head: items.slice(0, 1), hidden: items.slice(1, -1), current: items.at(-1) };
}

/** Plain-text form, used for the tooltip and as a stable effect dependency. */
export function breadcrumbToText(breadcrumb) {
  const items = normalizeBreadcrumb(breadcrumb);
  if (!items) return breadcrumb;
  return items.map((item) => item.label).join(BREADCRUMB_SEPARATOR);
}

/**
 * Stable key for `useSetPageMeta` deps: an array breadcrumb is a new reference on every render,
 * and depending on it directly would re-publish the page meta in a loop.
 */
export function breadcrumbKey(breadcrumb) {
  if (!Array.isArray(breadcrumb)) return breadcrumb;
  return normalizeBreadcrumb(breadcrumb)
    .map((item) => `${item.label}\u0000${item.href ?? ''}`)
    .join('\u0001');
}
