/**
 * ETP-4994 — grid state that survives the round trip List -> Form -> List.
 *
 * WHY sessionStorage (and not the URL, and not a router-level context):
 *
 * The three documented return paths (breadcrumb, the form's Cancel button, and the
 * BROWSER BACK button) are not equivalent for any other option:
 *
 *  - URL / query params survive browser back and a refresh, and are shareable, but the
 *    breadcrumb and Cancel both navigate to the bare `/${windowName}` — they would have to
 *    learn to rebuild the query string, and the advanced filter would have to be serialized
 *    into a visible, user-editable URL. Three call sites to keep in sync, one of which
 *    (browser back) we do not own.
 *  - A router-level context above the Outlet (the `WalkthroughProvider` pattern) is clean and
 *    covers all three paths, but it dies on refresh and on any back that remounts the router.
 *  - sessionStorage covers all three paths uniformly (every one of them remounts ListView, and
 *    every one of them reads the same key), survives a refresh, and is scoped to the tab — so
 *    a second tab on the same window keeps its own view, and nothing leaks into tomorrow's
 *    session.
 *
 * This is a per-viewer convenience, not state anything else reads back, which is exactly the
 * case browser storage is allowed for. Every access is wrapped: a private window or blocked
 * site data must degrade to "no saved state", never to a thrown render.
 *
 * INVARIANT (acceptance case 4): a list whose state is still the window's own default stores
 * NOTHING. `persistListState` removes the key instead of writing a default snapshot, so a
 * window that was never touched behaves exactly as it did before this module existed, and a
 * user who clears their filters gets the key cleaned up rather than pinned to a stale default.
 */

const STORAGE_PREFIX = 'listState:';
const SNAPSHOT_VERSION = 1;

export function listStateKey(scope) {
  return `${STORAGE_PREFIX}${scope}`;
}

function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Accessing the accessor itself can throw when site data is blocked.
    return null;
  }
}

/**
 * Canonical form used for both storage and default-comparison, so "is this the default?"
 * is a single string equality instead of a per-field diff that drifts as fields are added.
 */
function canonical(snapshot) {
  const quick = Array.isArray(snapshot?.quickFilterIndices)
    ? [...snapshot.quickFilterIndices].sort((a, b) => a - b)
    : [];
  return JSON.stringify({
    columnFilters: snapshot?.columnFilters ?? {},
    advancedFilter: snapshot?.advancedFilter ?? null,
    subsetIndex: snapshot?.subsetIndex ?? null,
    quickFilterIndices: quick,
    sortColumn: snapshot?.sortColumn ?? null,
    sortDirection: snapshot?.sortDirection ?? null,
  });
}

export function isDefaultListState(snapshot, defaults) {
  return canonical(snapshot) === canonical(defaults);
}

/**
 * @returns {object|null} the stored snapshot, or null when there is nothing usable.
 *   Callers must treat every field as optional — a snapshot can outlive a prop change
 *   (a quick filter removed from the window, a column dropped), so indices are validated
 *   at the call site against the CURRENT props.
 */
export function readListState(scope) {
  if (!scope) return null;
  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(listStateKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Writes the snapshot, or removes the key when the snapshot is still the window's default.
 * Never throws.
 */
export function persistListState(scope, snapshot, defaults) {
  if (!scope) return;
  const store = session();
  if (!store) return;
  const key = listStateKey(scope);
  try {
    if (isDefaultListState(snapshot, defaults)) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify({
      v: SNAPSHOT_VERSION,
      columnFilters: snapshot?.columnFilters ?? {},
      advancedFilter: snapshot?.advancedFilter ?? null,
      subsetIndex: snapshot?.subsetIndex ?? null,
      quickFilterIndices: Array.isArray(snapshot?.quickFilterIndices)
        ? [...snapshot.quickFilterIndices].sort((a, b) => a - b)
        : [],
      sortColumn: snapshot?.sortColumn ?? null,
      sortDirection: snapshot?.sortDirection ?? null,
    }));
  } catch {
    // Quota exceeded or storage blocked — the grid simply won't restore. Not fatal.
  }
}

export function clearListState(scope) {
  const store = session();
  if (!store || !scope) return;
  try {
    store.removeItem(listStateKey(scope));
  } catch {
    /* ignore */
  }
}

/** The subset index ListView would pick with no stored state. Kept here so the initializer
 * and the default-comparison cannot drift apart. */
export function resolveDefaultSubsetIndex(subsetFilters, initialSubsetIndex) {
  if (!subsetFilters?.length) return null;
  return (initialSubsetIndex != null && subsetFilters[initialSubsetIndex]) ? initialSubsetIndex : 0;
}

/** The quick-filter indices ListView would pick with no stored state. */
export function resolveDefaultQuickFilterIndices(quickFilters, initialQuickFilterIndex) {
  return (initialQuickFilterIndex != null && quickFilters?.[initialQuickFilterIndex])
    ? [initialQuickFilterIndex]
    : [];
}

/** Drops indices that no longer point at a live filter (props changed since the snapshot). */
export function sanitizeFilterIndices(indices, list) {
  if (!Array.isArray(indices)) return null;
  return indices.filter((i) => Number.isInteger(i) && list?.[i]);
}
