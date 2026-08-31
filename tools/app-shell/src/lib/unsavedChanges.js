/**
 * Global "this form has unsaved changes" registry (ETP-5022).
 *
 * Two callers need to know whether it is safe to throw the current page away:
 *
 * 1. The locale switcher. Changing the language reloads the page, because translated
 *    reference data (country names, UoMs, ...) is resolved server-side per request and
 *    already-fetched GET responses keep the OLD language until they are re-fetched. A
 *    reload is the only way to guarantee every surface — data, menu, selectors, caches —
 *    comes back in the new locale.
 * 2. The browser itself, on F5 / tab close, via `beforeunload`.
 *
 * The switcher lives in the top bar and the dirty state lives deep inside DetailView, so a
 * plain module-level registry is used instead of context: any component can register, and
 * any component can ask, without threading props through the whole tree.
 *
 * Registration is keyed so several forms can be mounted at once (a record plus a modal)
 * and each clears only its own entry.
 */

const dirtyKeys = new Set();

/**
 * Set when WE are about to reload on purpose (the user already confirmed in our own
 * dialog). Without it `beforeunload` would fire a second, native prompt on top of the
 * confirmation the user just answered.
 */
let unloadPromptSuppressed = false;

/**
 * Mark or clear a form's unsaved-changes state.
 *
 * @param {string} key   stable id for the form instance
 * @param {boolean} dirty whether that form currently holds unsaved changes
 */
export function setUnsavedChanges(key, dirty) {
  if (dirty) {
    dirtyKeys.add(key);
  } else {
    dirtyKeys.delete(key);
  }
}

/**
 * Drop a form's entry entirely — call on unmount, otherwise a form that unmounts while
 * dirty would leave the app permanently "dirty" and every later reload would prompt.
 *
 * @param {string} key the key passed to {@link setUnsavedChanges}
 */
export function clearUnsavedChanges(key) {
  dirtyKeys.delete(key);
}

/** @returns {boolean} true when any mounted form holds unsaved changes. */
export function hasUnsavedChanges() {
  return dirtyKeys.size > 0;
}

/**
 * Suppress the next `beforeunload` prompt, for a reload we are performing ourselves after
 * the user confirmed. Self-clearing: it does not leak into a later, unconfirmed unload.
 */
export function suppressNextUnloadPrompt() {
  unloadPromptSuppressed = true;
}

/**
 * Install the `beforeunload` guard so F5 / tab close warns about unsaved changes.
 * The message is the browser's own — no browser lets a page choose that text.
 *
 * @returns {() => void} a cleanup that removes the listener
 */
export function installUnloadGuard() {
  const handler = (event) => {
    if (unloadPromptSuppressed) {
      unloadPromptSuppressed = false;
      return undefined;
    }
    if (!hasUnsavedChanges()) {
      return undefined;
    }
    event.preventDefault();
    // Legacy browsers only show the prompt for a NON-EMPTY returnValue. The string is never
    // displayed — no browser lets a page choose that text.
    event.returnValue = 'unsaved';
    return 'unsaved';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

/** Test-only: drop all state so cases do not leak into each other. */
export function resetUnsavedChangesForTests() {
  dirtyKeys.clear();
  unloadPromptSuppressed = false;
}
