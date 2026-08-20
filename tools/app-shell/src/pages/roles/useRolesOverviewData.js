import { useState, useEffect, useCallback } from 'react';
import { Settings, TrendingUp, FileText, Landmark, Package } from 'lucide-react';
import { fetchRolesOverview } from '@/lib/rolesApi.js';

/**
 * ETP-4907 — data module for the redesigned "Configuración > Roles" overview
 * screen (5 summary cards + a category-grouped window x role access matrix).
 *
 * **Follow-up update:** the backend developer independently found (in
 * parallel with this frontend work) that no new endpoint was needed —
 * `SFRolesOverview.java` (ETP-4513, `GET /sws/neo/rolesoverview`) was the
 * right place, and was extended in place with `windowCount`/`matrix`/
 * `roleSource` (see `com.etendoerp.go`'s `feature/ETP-4907`, commit
 * `c3424a58`, not yet pushed). This module now calls the REAL
 * `fetchRolesOverview()` from `lib/rolesApi.js` (unchanged since ETP-4513 —
 * NEO bearer token, `{result: "<json-string>"}` unwrapping, non-JSON-response
 * guard) instead of returning isolated mock data. All mock fixtures moved
 * into this feature's own test files; `make dev-mock`'s fallback lives in
 * `lib/mockFetch.js`'s `handleRolesOverviewRequest()` (updated alongside this
 * module — the pre-existing convention for backend-less dev/E2E, not a
 * second ad-hoc mock).
 *
 * **Real response shape** (confirmed live against the backend):
 * ```json
 * {
 *   "roles": [
 *     { "id": "...", "name": "...", "rawDescription": "...", "isClientAdmin": bool,
 *       "roleSource": "tenant"|"systemTemplate", "userCount": n, "windowCount": n,
 *       "windows": [{ "id": "...", "name": "...", "tier": "full"|"read-only" }] }
 *   ],
 *   "matrix": { "categories": [
 *     { "name": "...", "windows": [
 *       { "id": "...", "name": "...", "access": { "<roleId>": "full"|"read-only"|"none" } }
 *     ]}
 *   ]}
 * }
 * ```
 * `adaptCards`/`adaptMatrix` below translate this into the shape this page's
 * components consume: `cards: [{id, name, isClientAdmin, roleSource,
 * windowCount, userCount}]`, `matrix: [{category, rows: [{windowId,
 * windowName, access: {[roleId]: 'full'|'readOnly'|'none'}}]}]`.
 *
 * **Tier normalization (picked once, here — not left floating as two
 * spellings across the codebase):** the backend uses hyphenated
 * `'read-only'` (matching `roles[].windows[].tier`'s pre-existing ETP-4513
 * convention). This module normalizes to camelCase `'readOnly'` in
 * `normalizeTier()` before anything reaches `AccessTierPill`/
 * `RolesAccessMatrix` — both of those were built fresh for ETP-4907 and were
 * never given a hyphenated-string contract, so the normalization happens
 * exactly once, at the adapter boundary, rather than teaching every
 * downstream consumer both spellings.
 *
 * **Role identity vs. matrix `access` keys:** `matrix.categories[].windows[].access`
 * is keyed by the SAME `id` values as `roles[].id` (real per-tenant strings,
 * not stable across tenants) — so cards keep their real `id` as React
 * key/lookup key. Icon and display-order assignment, which DO need a stable
 * identifier, go through `resolveRoleKind()` instead (isClientAdmin flag for
 * Admin — confirmed name-independent — else the fixed English `AD_Role.name`
 * for the 4 template roles, regardless of `roleSource`).
 */
export const ROLE_ORDER = ['admin', 'sales', 'purchasing', 'finance', 'inventory'];

/**
 * Role icon per role "kind" (see `resolveRoleKind`), used by both the summary
 * cards and the matrix's column headers. `sales`/`purchasing`/`finance`/
 * `inventory` intentionally reuse the exact same 4 lucide icons
 * (`TrendingUp`/`FileText`/`Landmark`/`Package`) chosen on the sibling
 * `feature/ETP-4906` branch for the User window's own role-preview matrix
 * (`UserRolesTab.jsx`'s `ROLE_ICONS`) — kept consistent across both screens
 * even though that branch isn't merged here yet. `admin` (`Settings`) is new
 * — that matrix never has an admin column.
 */
export const ROLE_ICONS = {
  admin: Settings,
  sales: TrendingUp,
  purchasing: FileText,
  finance: Landmark,
  inventory: Package,
};

const FIXED_ROLE_KIND_BY_NAME = {
  Finance: 'finance',
  Sales: 'sales',
  Purchasing: 'purchasing',
  Inventory: 'inventory',
};

/**
 * Resolves a role's stable display "kind" (`admin`/`sales`/`purchasing`/
 * `finance`/`inventory`), used to look up its icon and display order.
 * `isClientAdmin: true` marks Admin regardless of the role's literal name
 * (confirmed name-independent by the backend developer). The 4 template
 * roles are matched by their fixed English `AD_Role.name`
 * (`Finance`/`Sales`/`Purchasing`/`Inventory`) regardless of `roleSource`
 * (`'tenant'` vs `'systemTemplate'` — see this module's file-level JSDoc on
 * the ETP-4852 bug this masks). Returns `null` for anything unrecognized
 * rather than guessing.
 */
export function resolveRoleKind(role) {
  if (role?.isClientAdmin) return 'admin';
  return FIXED_ROLE_KIND_BY_NAME[role?.name] ?? null;
}

const ROLE_ORDER_INDEX = new Map(ROLE_ORDER.map((kind, index) => [kind, index]));

/**
 * Sorts role cards into the canonical ETP-4907 display order (Admin, Sales,
 * Purchasing, Finance, Inventory — see `ROLE_ORDER`). The backend does NOT
 * guarantee this order (its own fixed-name order is Finance/Sales/
 * Purchasing/Inventory) — this always re-sorts client-side rather than
 * trusting API order. Unrecognized kinds sort last, by id, rather than being
 * dropped.
 */
export function sortByRoleOrder(cards) {
  return [...cards].sort((a, b) => {
    const ka = resolveRoleKind(a);
    const kb = resolveRoleKind(b);
    const ia = ROLE_ORDER_INDEX.has(ka) ? ROLE_ORDER_INDEX.get(ka) : ROLE_ORDER.length;
    const ib = ROLE_ORDER_INDEX.has(kb) ? ROLE_ORDER_INDEX.get(kb) : ROLE_ORDER.length;
    if (ia !== ib) return ia - ib;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Normalizes a raw backend tier string to this app's internal tri-state contract. Anything other than the two known backend values (including `'none'` itself, `null`, or an unrecognized string) collapses to `'none'`. */
export function normalizeTier(rawTier) {
  if (rawTier === 'full') return 'full';
  if (rawTier === 'read-only') return 'readOnly';
  return 'none';
}

/**
 * Composite row key for a matrix row: `${category}::${windowId}`, NOT
 * `${category}::${windowName}` and NOT `windowId` alone. Using the backend's
 * real per-window `id` (unique within a category, per the confirmed
 * contract) rather than its translatable `name` sidesteps the
 * duplicate-window-NAME edge case entirely (e.g. "Contactos" appearing in
 * both `Comercial` and `Inventario`) — the backend already disambiguates
 * those as two separate entries with their own `id`, one per category.
 */
export function buildRowKey(category, windowId) {
  return `${category}::${windowId}`;
}

/** Flattens the category-grouped matrix into a single array of rows, each carrying its own composite `key` (see `buildRowKey`) alongside `category`/`windowId`/`windowName`/`access`. Convenience for tests and any consumer that doesn't need the category grouping. */
export function flattenMatrixRows(matrix) {
  const rows = [];
  for (const group of matrix ?? []) {
    for (const row of group.rows ?? []) {
      rows.push({ ...row, category: group.category, key: buildRowKey(group.category, row.windowId) });
    }
  }
  return rows;
}

/** Adapts the backend's `roles[]` into this page's card shape. */
function adaptCards(roles) {
  return (roles ?? []).map((role) => ({
    id: role.id,
    name: role.name,
    isClientAdmin: !!role.isClientAdmin,
    roleSource: role.roleSource,
    windowCount: role.windowCount ?? 0,
    userCount: role.userCount ?? 0,
  }));
}

/** Adapts the backend's `matrix.categories[]` into this page's category-grouped row shape, normalizing every cell's tier (see `normalizeTier`). */
function adaptMatrix(matrix) {
  const categories = matrix?.categories ?? [];
  return categories.map((category) => ({
    category: category.name,
    rows: (category.windows ?? []).map((w) => ({
      windowId: w.id,
      windowName: w.name,
      access: Object.fromEntries(
        Object.entries(w.access ?? {}).map(([roleId, tier]) => [roleId, normalizeTier(tier)])
      ),
    })),
  }));
}

/**
 * Fetches + exposes the Roles-overview cards and access matrix, with
 * loading/error state and a `reload()` escape hatch. `cards` is always
 * returned pre-sorted into `ROLE_ORDER`.
 */
export function useRolesOverviewData() {
  const [state, setState] = useState({ loading: true, error: null, cards: [], matrix: [] });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchRolesOverview()
      .then((data) => {
        setState({
          loading: false,
          error: null,
          cards: sortByRoleOrder(adaptCards(data?.roles)),
          matrix: adaptMatrix(data?.matrix),
        });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err?.message || String(err) }));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
