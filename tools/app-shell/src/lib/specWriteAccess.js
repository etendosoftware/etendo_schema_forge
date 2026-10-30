/**
 * ETP-5826 — whether the current role may WRITE the window behind a spec, from the role's
 * `windowAccess` map (SFWindowAccessMap, keyed by AD_Window_ID) and the spec's `windowId` in
 * `menu.json`.
 *
 * NEO authorizes a write to a spec with the same rule SFWindowAccessMap reports: an active
 * `AD_Window_Access` row on the spec's window with `IsReadWrite = 'Y'` (tier `"full"`), or the
 * admin / client-admin bypass (`capabilities.isAdminOrClientAdmin`). So a role whose tier is
 * `"read-only"` would get a 403 — the case this gate hides an affordance for.
 *
 * Kept dependency-free (no `@/` imports, no `menu.json`) so it can be covered by a plain
 * `node --test` unit test, like `dashboardWidgetAccess.js`. The hooks feed it the menu and the
 * access maps.
 */

/** The SFWindowAccessMap tier that allows writing. */
const TIER_FULL = 'full';

/**
 * `{ [slug]: AD_Window_ID }` from `menu.json`'s groups. Entries without a `windowId` (the
 * dashboard, custom pages, reports) are skipped. A menu slug IS the spec name (kebab-case, see
 * `toSpecName`), so the map answers "which window backs spec X".
 *
 * @param {Array<{ items?: Array<{ name?: string, windowId?: string|number }> }>} menu
 * @returns {Record<string, string>}
 */
export function buildWindowIdBySlug(menu) {
  const bySlug = {};
  for (const group of menu ?? []) {
    for (const item of group?.items ?? []) {
      if (item?.name && item?.windowId) bySlug[item.name] = String(item.windowId);
    }
  }
  return bySlug;
}

/**
 * True when the role may write the window: admin / client-admin always; otherwise only a loaded
 * `"full"` tier. A missing window id, an unloaded map, a `"read-only"`/`"none"` tier or any
 * unknown value is `false` (fail closed).
 *
 * Reads one key (no enumeration): demo/mock mode supplies `windowAccess` as a Proxy that answers
 * lookups without exposing own keys (`lib/mockFetch.js`).
 *
 * @param {Record<string, string> | null | undefined} windowAccess
 * @param {string | null | undefined} windowId
 * @param {boolean} isAdmin
 * @returns {boolean}
 */
export function canWriteWindow(windowAccess, windowId, isAdmin) {
  if (isAdmin) return true;
  if (!windowId) return false;
  return windowAccess?.[windowId] === TIER_FULL;
}

/**
 * Whether an inline "+ create" affordance targeting `spec` may be shown.
 *
 * - spec backed by a known window (`windowIdBySlug[spec]`) → {@link canWriteWindow}: hidden
 *   while access is unloaded, for read-only roles, and for roles without the window;
 * - spec with NO window in the menu (e.g. `transaction-type`, created from match-rule) → shown,
 *   as before this gate existed. The SPA cannot tell which window authorizes it, so hiding it
 *   would remove the affordance from every non-admin role, including the ones the backend lets
 *   write. The backend still refuses an unauthorized POST (403), which the create modal shows.
 *   Give the spec a `menu.json` entry with its `windowId` to bring it under the gate.
 *
 * @param {{ spec?: string, windowIdBySlug: Record<string, string>, windowAccess?: object,
 *   isAdmin?: boolean }} args
 * @returns {boolean}
 */
export function canCreateInSpec({ spec, windowIdBySlug, windowAccess, isAdmin = false }) {
  if (!spec) return false;
  const windowId = Object.hasOwn(windowIdBySlug ?? {}, spec) ? windowIdBySlug[spec] : null;
  if (!windowId) return true;
  return canWriteWindow(windowAccess, windowId, isAdmin);
}
