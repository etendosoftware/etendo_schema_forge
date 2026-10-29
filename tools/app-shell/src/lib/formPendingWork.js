/**
 * Pending-work registry for a form instance (ETP-5680 follow-up).
 *
 * A custom form component (a `headerExtra.customForm` such as the product's
 * `ProductStockDefaultsWatcher`) sometimes starts a request whose answer is meant to become part
 * of the record the user is about to save. Until that answer lands, Save would persist the value
 * the form held BEFORE the answer — and `performSave` is closed over the render's `editing`, so it
 * cannot "wait". The fix is not to make Save await: it is to keep Save disabled while such work is
 * pending, and to say why.
 *
 * Module-level store rather than props, for the reason `lib/saveBlockSignal.js` documents:
 * `DetailView.jsx` is under a no-growth guardrail (`.claude/hooks/check-detailview-growth.mjs`)
 * and the contract-ui save buttons live in another file, so threading a value through would mean
 * growing the God Component. The scope is the object that identifies one form instance — in
 * practice `hook.handleChange` from `useEntity`, which is the same reference the form footer
 * receives as `onLocalChange` and the save buttons see on `hook`. Two forms (the main window and
 * the embedded "new record" popup) therefore never see each other's pending work.
 *
 * Free of React imports so a plain `node --test` module can load it; the React binding is
 * `hooks/useFormPendingWork.js`.
 */

/** scope object -> { count, listeners }. Weak: a form that unmounts leaves nothing behind. */
const stateByScope = new WeakMap();

const isScope = scope => (typeof scope === 'object' && scope !== null) || typeof scope === 'function';

function stateFor(scope) {
  let state = stateByScope.get(scope);
  if (!state) {
    state = { count: 0, listeners: new Set() };
    stateByScope.set(scope, state);
  }
  return state;
}

function notify(state) {
  // Copy before iterating: a listener may unsubscribe itself while being notified.
  for (const listener of [...state.listeners]) listener();
}

const noop = () => {};

/**
 * Registers one unit of pending work for `scope` SYNCHRONOUSLY and returns its release function.
 * The release is idempotent — calling it twice (a `finally` after an early return, then an
 * unmount cleanup) decrements once. A missing scope (a mocked hook, a form rendered outside a
 * DetailView) yields a no-op release, so callers never need to guard.
 */
export function registerPending(scope) {
  if (!isScope(scope)) return noop;
  const state = stateFor(scope);
  state.count += 1;
  notify(state);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    notify(state);
  };
}

/** How many units of work are pending for `scope`. The snapshot for React bindings. */
export function getPendingCount(scope) {
  if (!isScope(scope)) return 0;
  return stateByScope.get(scope)?.count ?? 0;
}

/** `true` while anything is pending for `scope`. */
export function isCalculating(scope) {
  return getPendingCount(scope) > 0;
}

/** Subscribe to count changes for `scope`. Returns the unsubscribe function. */
export function subscribePending(scope, listener) {
  if (!isScope(scope) || typeof listener !== 'function') return noop;
  const { listeners } = stateFor(scope);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
