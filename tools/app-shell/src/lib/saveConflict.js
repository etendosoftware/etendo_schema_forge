/**
 * The save-conflict prompt (ETP-5073 / DOC-04).
 *
 * The server refuses an update whose `updated` no longer matches the stored row, and the user has
 * to choose: keep editing (nothing was written) or discard the pending changes and refresh.
 *
 * ## Why this is not a toast
 *
 * It was one, and it broke. sonner lays action buttons out INLINE with the message, so two labels
 * as long as these ("Cancelar guardado", "Descartar mis cambios y refrescar") took the whole width
 * and squeezed the text into a one-character-per-line column. Shortening the labels would have hid
 * the symptom while leaving the real mismatch in place: this is a blocking decision with a
 * destructive option, and a toast is a transient, dismissible surface for information the user does
 * not have to act on. A dialog is what the app already uses for exactly this shape of question —
 * see LocaleChangeConfirmDialog and UnsavedChangesNavigationDialog.
 *
 * ## Why a module-level store rather than context
 *
 * `handleSaveErrorResponse` is a plain exported function in useEntity.js, called from a save
 * handler with no access to a provider. Same reasoning as `lib/unsavedChanges.js`: a module-level
 * registry lets the code that DETECTS the condition be far from the component that RENDERS it,
 * with nothing threaded through the tree.
 */

/** The pending conflict: what to do if the user chooses to refresh. */
let pending = null;

/** The dialog host's subscriber. */
let listener = null;

/**
 * Raise the prompt. Returns whether a host was there to show it.
 *
 * The return value matters: the caller falls back to a toast when it is `false`, so a tree with no
 * host mounted (a test, an embedded view) still tells the user their save was refused instead of
 * failing silently. Silence is the one outcome this whole ticket exists to remove.
 *
 * @param {{ onRefresh?: () => void }} handlers
 * @returns {boolean} whether the prompt was shown
 */
export function openSaveConflict(handlers = {}) {
  if (!listener) return false;
  pending = handlers;
  listener(true);
  return true;
}

/**
 * Register the dialog host. One is expected; a second replaces the first.
 *
 * @param {(open: boolean) => void} fn
 * @returns {() => void} cleanup
 */
export function subscribeSaveConflict(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Close the prompt, keeping the user's edits. Nothing was written, so there is nothing to undo. */
export function dismissSaveConflict() {
  pending = null;
  listener?.(false);
}

/** Close the prompt and run the refresh, which discards the pending edits. */
export function refreshFromSaveConflict() {
  const handlers = pending;
  pending = null;
  listener?.(false);
  handlers?.onRefresh?.();
}

/** @returns {boolean} whether a refresh handler was supplied for the pending conflict. */
export function canRefreshFromSaveConflict() {
  return typeof pending?.onRefresh === 'function';
}

/** Test-only: drop all state so cases do not leak into each other. */
export function resetSaveConflictForTests() {
  pending = null;
  listener = null;
}
