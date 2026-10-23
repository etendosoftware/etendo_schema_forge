import menuConfig from '@/menu.json';
import { useCapabilitiesSafe, useWindowAccessSafe } from '@/hooks/useCapabilitiesSafe.js';
import { buildWindowIdBySlug, canCreateInSpec } from '@/lib/specWriteAccess.js';

const WINDOW_ID_BY_SLUG = buildWindowIdBySlug(menuConfig?.menu);

/**
 * ETP-5826 — whether the current role may create a record in `spec`, for inline "+ create"
 * affordances that write to ANOTHER spec than the window they live in (e.g. "+ Crear condición
 * de pago" inside an invoice writes to `payment-term`). See `canCreateInSpec` in
 * `lib/specWriteAccess.js` for the rule: write tier on the spec's window (or admin), fail closed
 * while the access map is not loaded; a spec without a window in `menu.json` is not gated.
 *
 * Tolerates a missing `AuthProvider` (unit tests) the same way `useCapabilitiesSafe` does: the
 * maps fall back to `{}`, so a gated spec resolves hidden.
 *
 * @param {string | undefined} spec
 * @returns {boolean}
 */
export function useCanCreateInSpec(spec) {
  const windowAccess = useWindowAccessSafe();
  const capabilities = useCapabilitiesSafe();
  return canCreateInSpec({
    spec,
    windowIdBySlug: WINDOW_ID_BY_SLUG,
    windowAccess,
    isAdmin: capabilities?.isAdminOrClientAdmin === true,
  });
}
