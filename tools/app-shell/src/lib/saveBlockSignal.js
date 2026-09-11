/**
 * Save-block signal bus (ETP-5245).
 *
 * A banner that explains WHY a save is refused is only useful while the user can still see it.
 * Once banners became dismissible by default (see `components/InfoBanner.jsx`), a user could
 * close the explanation and then keep hitting the very block it described, with nothing left on
 * screen to say why. This module is the missing feedback edge: the save gate announces "I just
 * refused a save for reason X", and any banner that explains reason X can bring itself back.
 *
 * The key is the STABLE TOAST ID the save gate already passes to `reportInvalidFormatField`
 * (e.g. `'product-cost-required'`). Reusing it means there is exactly one identifier per
 * save-blocking reason, shared by the toast, the tracker in `numericValidation.js` and this bus —
 * a new blocking rule gets the reopen behaviour for free by passing its id, and can never drift
 * out of sync with the toast that announces the same refusal.
 *
 * Deliberately a module-level store rather than props: the banner is mounted through the
 * `subHeader` slot, whose generated call site (`headerContent={(data) => <Banner data={data} />}`,
 * emitted by the core generator) hands it `data` and nothing else. Threading a new argument down
 * would mean changing the slot signature in `schema_forge_core` AND republishing it, and passing
 * one more field through `DetailView.jsx` — a governed God Component that
 * `.claude/hooks/check-detailview-growth.mjs` blocks from growing. The precedent for module-level
 * save-block state is `pendingSaveBlockToastIds` in `lib/numericValidation.js`.
 *
 * Kept free of React imports so it stays loadable by a plain `node --test` module; the React
 * binding lives in `hooks/useSaveBlockSignal.js`.
 */

/** id -> number of times a save was blocked for that reason. Monotonically increasing. */
const countsById = new Map();

/** id -> subscribers to notify when that id's count changes. */
const listenersById = new Map();

/**
 * Announce that a save was just refused for the reason identified by `id`.
 * No-op for a falsy id — the email/website/phone gates block without a stable id, and a banner
 * cannot subscribe to a reason that has no name.
 */
export function notifySaveBlock(id) {
  if (!id) return;
  countsById.set(id, (countsById.get(id) ?? 0) + 1);
  const listeners = listenersById.get(id);
  if (!listeners) return;
  // Copy before iterating: a listener may unsubscribe itself while being notified.
  for (const listener of [...listeners]) listener();
}

/** How many times a save has been blocked for `id` so far. The snapshot for React bindings. */
export function getSaveBlockCount(id) {
  if (!id) return 0;
  return countsById.get(id) ?? 0;
}

/** Subscribe to blocks for `id`. Returns the unsubscribe function. */
export function subscribeSaveBlock(id, listener) {
  if (!id || typeof listener !== 'function') return () => {};
  let listeners = listenersById.get(id);
  if (!listeners) {
    listeners = new Set();
    listenersById.set(id, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersById.delete(id);
  };
}

/** Test seam: forget every count and subscriber, so one test cannot leak into the next. */
export function resetSaveBlockSignals() {
  countsById.clear();
  listenersById.clear();
}
