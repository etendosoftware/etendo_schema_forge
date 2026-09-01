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

/**
 * Per-form state: whether it is dirty, and how to save it if it is.
 *
 * ETP-5073 upgraded this from a plain `Set` of keys so the navigation prompt can offer **Save**
 * and not only **Discard** — acceptance criterion 2 asks for "save or discard", and a prompt that
 * can only throw work away is a worse version of the silent loss it replaces. The saver is
 * optional: a form that registers without one still blocks navigation and still offers Discard.
 *
 * @type {Map<string, { dirty: boolean, save?: () => Promise<unknown> }>}
 */
const dirtyForms = new Map();

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
export function setUnsavedChanges(key, dirty, save) {
  if (dirty) {
    dirtyForms.set(key, { dirty: true, save });
  } else {
    dirtyForms.delete(key);
  }
}

/**
 * Drop a form's entry entirely — call on unmount, otherwise a form that unmounts while
 * dirty would leave the app permanently "dirty" and every later reload would prompt.
 *
 * @param {string} key the key passed to {@link setUnsavedChanges}
 */
export function clearUnsavedChanges(key) {
  dirtyForms.delete(key);
}

/** @returns {boolean} true when any mounted form holds unsaved changes. */
export function hasUnsavedChanges() {
  return dirtyForms.size > 0;
}

/**
 * @returns {boolean} whether the prompt can offer Save for the transition currently held: the
 * scoped transition's own saver when it has one, otherwise every dirty form having one.
 */
export function canSaveUnsavedChanges() {
  if (typeof pendingNavigation?.save === 'function') return true;
  return dirtyForms.size > 0
    && [...dirtyForms.values()].every(entry => typeof entry.save === 'function');
}

/**
 * Save every dirty form.
 *
 * Sequential, and it STOPS at the first refusal: a saver returns a falsy value when validation
 * rejected the form (`handleSave` answers `null`), and continuing past that would navigate away
 * from a form the user still has to fix — the exact data loss this guard exists to prevent.
 *
 * @returns {Promise<boolean>} whether every dirty form was saved
 */
export async function saveUnsavedChanges() {
  for (const entry of [...dirtyForms.values()]) {
    if (typeof entry.save !== 'function') return false;
    // eslint-disable-next-line no-await-in-loop -- deliberate: a failure must stop the rest.
    const saved = await entry.save();
    if (!saved) return false;
  }
  return true;
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

/* ── In-app navigation guard (ETP-5073 / DOC-08) ──────────────────────────────
 *
 * F5, tab close and the language switch were already covered (`installUnloadGuard`, the locale
 * switcher). What was not: leaving a dirty form by navigating INSIDE the app — clicking another
 * window in the side menu, or any `navigate()` call. Those changes were lost with no prompt.
 *
 * react-router's own `useBlocker` is not available to us: the app mounts a declarative
 * `<BrowserRouter>` (`AppShellRuntime`), and v7 only serves `useBlocker` from a data router
 * (`createBrowserRouter` + `RouterProvider`). Migrating the core's routing would touch every
 * route of every app that consumes it, so the interception happens at the navigation SOURCES
 * instead, all routed through this one gate.
 *
 * A module-level gate rather than context, for the same reason the dirty registry itself is one
 * (see the file header): the side menu is far from the form, and nothing should have to thread a
 * prop through the whole tree.
 */

/**
 * The transition the user asked for, held while the prompt is open, plus the saver that applies
 * to it. `save` is null for a whole-page navigation (then every dirty form is saved) and set for
 * a SCOPED transition, which must save only its own thing.
 *
 * @type {{ perform: () => void, save?: () => Promise<unknown> } | null}
 */
let pendingNavigation = null;

/** The dialog host's subscriber, notified when the prompt should open or close. */
let promptListener = null;

/**
 * Perform a navigation, or hold it and raise the prompt when a form is dirty.
 *
 * Fails OPEN: with no dialog host mounted the navigation happens immediately rather than being
 * swallowed. A missing host must never make the app unnavigable — that would be a far worse bug
 * than the one being fixed.
 *
 * @param {() => void} perform the navigation to run once it is allowed
 */
export function requestNavigation(perform) {
  requestTransition(perform);
}

/**
 * The general form of {@link requestNavigation}: perform a transition, or hold it and raise the
 * prompt when the relevant state is dirty.
 *
 * `isDirty` exists because dirtiness is not always global. Leaving the page endangers EVERY dirty
 * form, so the default is {@link hasUnsavedChanges}. But switching to another line inside a
 * document endangers only the line being edited — gating that on the global answer would prompt
 * about header edits that the switch does not touch, which trains users to click through the
 * dialog without reading it.
 *
 * `save` pairs with it: a scoped transition must save only its own thing, so it supplies its own
 * saver instead of letting the prompt save every registered form.
 *
 * Fails OPEN with no dialog host mounted — see {@link requestNavigation}.
 *
 * @param {() => void} perform the transition to run once it is allowed
 * @param {object} [options]
 * @param {() => boolean} [options.isDirty] what counts as dirty for THIS transition
 * @param {() => Promise<unknown>} [options.save] saves just what this transition endangers
 */
export function requestTransition(perform, { isDirty = hasUnsavedChanges, save } = {}) {
  if (!isDirty() || !promptListener) {
    perform();
    return;
  }
  pendingNavigation = { perform, save };
  promptListener(true);
}

/**
 * Register the dialog host. Only one is expected; a second registration replaces the first.
 *
 * @param {(open: boolean) => void} listener called with the desired prompt visibility
 * @returns {() => void} cleanup that unregisters this listener
 */
export function subscribeNavigationPrompt(listener) {
  promptListener = listener;
  return () => {
    if (promptListener === listener) promptListener = null;
  };
}

/** Run the held navigation, discarding the pending changes. */
export function confirmPendingNavigation() {
  const pending = pendingNavigation;
  pendingNavigation = null;
  promptListener?.(false);
  pending?.perform();
}

/**
 * Save every dirty form and then run the held navigation.
 *
 * On a refusal the navigation is DROPPED and the prompt closes, leaving the user on the form with
 * whatever validation error the save reported. Keeping the dialog open on top of that error would
 * hide the very message they need to read.
 *
 * @returns {Promise<boolean>} whether the save succeeded and the navigation ran
 */
export async function savePendingNavigation() {
  const pending = pendingNavigation;
  // A scoped transition saves only its own thing; a page navigation saves every dirty form.
  const saved = pending?.save ? Boolean(await pending.save()) : await saveUnsavedChanges();
  pendingNavigation = null;
  promptListener?.(false);
  if (!saved) return false;
  pending?.perform();
  return true;
}

/** Abandon the held navigation and stay put. */
export function cancelPendingNavigation() {
  pendingNavigation = null;
  promptListener?.(false);
}

/** Test-only: drop all state so cases do not leak into each other. */
export function resetUnsavedChangesForTests() {
  dirtyForms.clear();
  unloadPromptSuppressed = false;
  pendingNavigation = null;
  promptListener = null;
}
