import { useSyncExternalStore } from 'react';

/**
 * chartOfAccountsTreeStore — window-local state shared by the three siblings ListView
 * mounts for the Chart of Accounts list (ETP-5593):
 *
 *   - `AccountTreeView` (the headerTable) writes the accounts, the folder ids currently
 *     shown and the selected row; it reads and writes `expanded`; it re-fetches when
 *     `savedGeneration` moves.
 *   - `ChartOfAccountsToolbarSlot` (`AccountTreeView.ToolbarQuickFilter`) reads whether
 *     any shown folder is expanded and calls `expandAll` / `collapseAll`.
 *   - `NewSubAccountCreateModal` (decisions `newRecordComponent`) reads the selected row
 *     and the accounts, and calls `notifySaved` after a save.
 *
 * They are siblings inside a generated page, so there is no common ancestor to hold
 * this state. The account-type filter and the search text are NOT here: they live in
 * the URL (`accountType`, `q`) so the toolbar's Share link reproduces the view.
 *
 * `expanded` is persisted to localStorage (per browser) so navigating away and back
 * restores the folders the user left open. Writes made while a filter is active pass
 * `{ persist: false }` (see AccountTreeView): a filter's seeded expansion is temporary.
 */

// Folder ids are `group-<ancestor-code-path>` (e.g. `group-A|A.A`), derived from stable
// account codes rather than DB record ids, so they stay valid across sessions.
export const EXPANDED_STORAGE_KEY = 'sf.chartOfAccounts.expandedFolderIds';

function loadPersistedExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

function persistExpanded(expanded) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(expanded)));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — expand/collapse still works
    // in-memory for this session, it just won't persist across reloads.
  }
}

function initialState() {
  return {
    expanded: null, // lazily loaded from localStorage on first read
    shownFolderIds: [],
    accounts: [],
    selectedRecord: null,
    savedGeneration: 0,
  };
}

let state = initialState();
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  if (state.expanded === null) state = { ...state, expanded: loadPersistedExpanded() };
  return state;
}

/** Replaces the expanded folder set. `next` may be a Set or an updater `(prev) => Set`. */
export function setExpanded(next, { persist = true } = {}) {
  const prev = getSnapshot().expanded;
  const value = typeof next === 'function' ? next(prev) : next;
  if (persist) persistExpanded(value);
  setState({ expanded: value });
}

/** Expands every folder currently shown by the tree (filtered or not). */
export function expandAll(options) {
  setExpanded(new Set(getSnapshot().shownFolderIds), options);
}

export function collapseAll(options) {
  setExpanded(new Set(), options);
}

/** Called by the tree whenever the accounts or the shown folders change. */
export function setTreeData({ accounts, shownFolderIds }) {
  setState({ accounts, shownFolderIds });
}

export function setSelectedRecord(record) {
  setState({ selectedRecord: record ?? null });
}

/** Signals the tree that a sub-account was saved, so it re-fetches the accounts. */
export function notifySaved() {
  setState({ savedGeneration: state.savedGeneration + 1 });
}

/** True when at least one folder the tree is showing right now is expanded. */
export function selectHasExpandedFolder(s) {
  return s.shownFolderIds.some((id) => s.expanded.has(id));
}

/** Subscribes a component to the store. `selector` must return a stable value. */
export function useChartOfAccountsTree(selector = (s) => s) {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()));
}

/** Test-only: drops all state (the persisted expansion is re-read on next access). */
export function resetChartOfAccountsTreeStore() {
  state = initialState();
  emit();
}
