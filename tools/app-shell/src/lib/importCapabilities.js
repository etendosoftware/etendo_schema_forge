/**
 * ETP-6206 — the session's `capabilities` map, readable from a plain import descriptor.
 *
 * `capabilities` (SFWindowAccessMap, loaded at role selection) live in the core's AuthContext and
 * are only reachable from React (`useCapabilitiesSafe`). An import descriptor and its row
 * validator are plain functions that the core `ImportDialog` calls with a fixed config
 * (`spec`, `token`, `translate`, `fkResolutions`), so a backend capability such as
 * `structuredAddressForSepa` had no way in: the Contacts import kept sending the pre-ETP-5806
 * address payload while the server, flag on, rejected it.
 *
 * This is NOT a second source of truth. `useWindowImportDialog` — the one hook every import dialog
 * is built from (ListView and First Steps) — publishes the AuthContext map here on every change,
 * and descriptors read it at call time (per row), never at module load. Outside a mounted import
 * dialog nothing reads it. Fails closed like `isCapabilityVisible`: before anything is published,
 * every capability is off.
 *
 * Follow-up worth considering: a core `getAmbientCapabilities()` next to `getAmbientToken()` would
 * make this mirror unnecessary.
 */

const EMPTY = Object.freeze({});

let current = EMPTY;

/** Called by `useWindowImportDialog` with the live AuthContext `capabilities` map. */
export function publishImportCapabilities(capabilities) {
  current = capabilities && typeof capabilities === 'object' ? capabilities : EMPTY;
}

/** Whether `key` is on for the current session. Fails closed. */
export function hasImportCapability(key) {
  return Boolean(key) && current?.[key] === true;
}

/** Test seam: forget whatever was published. */
export function resetImportCapabilitiesForTests() {
  current = EMPTY;
}
