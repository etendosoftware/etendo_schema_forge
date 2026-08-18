import { useState, useEffect, useCallback } from 'react';
import { Settings, TrendingUp, FileText, Landmark, Package } from 'lucide-react';

/**
 * ETP-4907 — data module for the redesigned "Configuración > Roles" overview
 * screen (5 summary cards + a category-grouped window x role access matrix).
 *
 * **THIS IS THE ONLY FILE THAT NEEDS TO CHANGE once the real backend endpoint
 * lands.** A backend developer is building a new `com.etendoerp.go` endpoint in
 * parallel (branch `feature/ETP-4907` there) that will return, per tenant: each
 * of the 5 fixed roles' `windowCount` + `userCount`, plus the full window x role
 * matrix grouped by category with tri-state access (`full` / `readOnly` /
 * `none`). The exact path and JSON field names are NOT final yet, so this
 * module is deliberately isolated behind `fetchRolesOverviewData()` below —
 * swap ONLY that function's body for a real `fetch(...)` call (mirroring
 * `lib/rolesApi.js`'s `fetchRolesOverview()` conventions: NEO bearer token,
 * `{result: "<json-string>"}` unwrapping, non-JSON-response guard) once the
 * contract is confirmed. `useRolesOverviewData()` itself, and every component
 * that consumes its return shape (`RoleSummaryCard`, `RolesAccessMatrix`,
 * `RolesOverviewPage`), do not need to change.
 *
 * **Not the same data source as `lib/rolesApi.js`'s `fetchRolesOverview()`**
 * (`GET /sws/neo/rolesoverview`, ETP-4513) — that endpoint returns a flat
 * per-role `windows[]` list (id/name/tier) with no category grouping and no
 * `windowCount`/full-matrix shape, and is still used elsewhere (the sibling,
 * not-yet-merged `feature/ETP-4906` branch's `UserRolesTab.jsx` role-preview
 * tab). Left untouched by this ticket — do not delete or repurpose it.
 *
 * **Role display order** (cards left-to-right, matrix columns left-to-right):
 * Admin, Sales, Purchasing, Finance, Inventory — the order shown in the
 * ETP-4907 reference screenshot. This deliberately differs from the order used
 * elsewhere in the app (`SFRolesOverview.java`'s `GOCLIENT_ROLE_IDS`, and the
 * OLD version of this same page) which is Admin, Finance, Sales, Purchasing,
 * Inventory. `ROLE_ORDER` below re-sorts whatever order the mock/future
 * endpoint returns into the screenshot's order — confirm with the backend
 * developer whether the real payload should already arrive pre-sorted this
 * way, or whether the frontend re-sort here should stay.
 */
export const ROLE_ORDER = ['admin', 'sales', 'purchasing', 'finance', 'inventory'];

/**
 * Role icon per fixed role id, used by both the summary cards and the matrix's
 * column headers. `sales`/`purchasing`/`finance`/`inventory` intentionally
 * reuse the exact same 4 lucide icons (`TrendingUp`/`FileText`/`Landmark`/
 * `Package`) chosen on the sibling `feature/ETP-4906` branch for the User
 * window's own role-preview matrix (`UserRolesTab.jsx`'s `ROLE_ICONS`) — kept
 * consistent across both screens rather than picking new ones, even though
 * that branch isn't merged here yet (see this module's file-level note on
 * `feature/ETP-4906`). `admin` (`Settings`) is new — it has no equivalent
 * there since that matrix never has an admin column.
 */
export const ROLE_ICONS = {
  admin: Settings,
  sales: TrendingUp,
  purchasing: FileText,
  finance: Landmark,
  inventory: Package,
};

const ROLE_ORDER_INDEX = new Map(ROLE_ORDER.map((id, index) => [id, index]));

/** Sorts role cards into the canonical ETP-4907 display order (see `ROLE_ORDER`). Unknown ids sort last, alphabetically, rather than being dropped. */
export function sortByRoleOrder(cards) {
  return [...cards].sort((a, b) => {
    const ia = ROLE_ORDER_INDEX.has(a.id) ? ROLE_ORDER_INDEX.get(a.id) : ROLE_ORDER.length;
    const ib = ROLE_ORDER_INDEX.has(b.id) ? ROLE_ORDER_INDEX.get(b.id) : ROLE_ORDER.length;
    if (ia !== ib) return ia - ib;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Composite row key for a matrix row: `${category}::${windowKey}`, NOT just
 * `windowKey` alone. The mock data below has a real duplicate-window-name edge
 * case — "Contactos" appears in BOTH the `Commercial` and `Inventory`
 * categories, with a DIFFERENT access tier per role in each (Inventory's
 * `Almacén` column is `readOnly` on the Commercial row but `full` on the
 * Inventory row). Keying by `windowKey` alone would collide the two rows
 * (whichever rendered/was stored last would silently win) — every caller that
 * needs a unique per-row identifier (React `key`, a `Map`/lookup, a
 * `data-testid`) MUST use this composite key instead.
 */
export function buildRowKey(category, windowKey) {
  return `${category}::${windowKey}`;
}

/** Flattens the category-grouped matrix into a single array of rows, each carrying its own composite `key` (see `buildRowKey`) alongside `category`/`windowKey`/`access`. Convenience for tests and any consumer that doesn't need the category grouping. */
export function flattenMatrixRows(matrix) {
  const rows = [];
  for (const group of matrix ?? []) {
    for (const row of group.rows ?? []) {
      rows.push({ ...row, category: group.category, key: buildRowKey(group.category, row.windowKey) });
    }
  }
  return rows;
}

// -- Mock data (ETP-4907 reference screenshot numbers) -----------------------
// Placeholder until the real com.etendoerp.go endpoint lands — see this
// module's file-level JSDoc for the exact swap point (`fetchRolesOverviewData`
// below) and the data-shape confirmation this report asks the backend
// developer for.

const MOCK_CARDS = [
  { id: 'admin', name: 'GOClient Admin', isClientAdmin: true, windowCount: 48, userCount: 2 },
  { id: 'sales', name: 'Sales', windowCount: 17, userCount: 13 },
  { id: 'purchasing', name: 'Purchasing', windowCount: 17, userCount: 17 },
  { id: 'finance', name: 'Finance', windowCount: 17, userCount: 9 },
  { id: 'inventory', name: 'Inventory', windowCount: 18, userCount: 126 },
];

const ALL_FULL = { admin: 'full', sales: 'full', purchasing: 'full', finance: 'full', inventory: 'full' };

const MOCK_MATRIX = [
  {
    category: 'General',
    rows: [
      { windowKey: 'rolesMatrixWindowDashboard', access: { ...ALL_FULL } },
      { windowKey: 'rolesMatrixWindowFavorites', access: { ...ALL_FULL } },
      { windowKey: 'rolesMatrixWindowCopilot', access: { ...ALL_FULL } },
    ],
  },
  {
    category: 'Commercial',
    rows: [
      {
        windowKey: 'rolesMatrixWindowContacts',
        access: { admin: 'full', sales: 'full', purchasing: 'full', finance: 'full', inventory: 'readOnly' },
      },
    ],
  },
  {
    category: 'Sales',
    rows: [
      {
        windowKey: 'rolesMatrixWindowQuotation',
        access: { admin: 'full', sales: 'full', purchasing: 'none', finance: 'readOnly', inventory: 'none' },
      },
      {
        windowKey: 'rolesMatrixWindowSalesOrder',
        access: { admin: 'full', sales: 'full', purchasing: 'none', finance: 'readOnly', inventory: 'readOnly' },
      },
      {
        windowKey: 'rolesMatrixWindowSalesShipment',
        access: { admin: 'full', sales: 'full', purchasing: 'none', finance: 'none', inventory: 'full' },
      },
      {
        windowKey: 'rolesMatrixWindowSalesInvoice',
        access: { admin: 'full', sales: 'full', purchasing: 'none', finance: 'full', inventory: 'none' },
      },
      {
        windowKey: 'rolesMatrixWindowSalesReturn',
        access: { admin: 'full', sales: 'full', purchasing: 'none', finance: 'none', inventory: 'full' },
      },
    ],
  },
  {
    // Deliberate duplicate-window-name edge case (see `buildRowKey`'s JSDoc):
    // "Contactos" again, DIFFERENT access than the Commercial category's row
    // above (inventory: 'full' here vs. 'readOnly' there).
    category: 'Inventory',
    rows: [
      { windowKey: 'rolesMatrixWindowContacts', access: { ...ALL_FULL } },
    ],
  },
];

/**
 * THE SWAP POINT — replace this function's body with a real fetch once the
 * ETP-4907 backend contract is confirmed (see file-level JSDoc). Must keep
 * returning `{ cards, matrix }` in this same shape: `cards` an array of
 * `{ id, name, isClientAdmin?, windowCount, userCount }`; `matrix` an array of
 * `{ category, rows: [{ windowKey, access: { [roleId]: 'full'|'readOnly'|'none' } }] }`.
 */
async function fetchRolesOverviewData() {
  return { cards: MOCK_CARDS, matrix: MOCK_MATRIX };
}

/**
 * Fetches + exposes the Roles-overview cards and access matrix, with
 * loading/error state and a `reload()` escape hatch — same shape as
 * `RolesOverviewPage`'s pre-ETP-4907 `fetchRolesOverview()` usage. `cards` is
 * always returned pre-sorted into `ROLE_ORDER`.
 */
export function useRolesOverviewData() {
  const [state, setState] = useState({ loading: true, error: null, cards: [], matrix: [] });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchRolesOverviewData()
      .then(({ cards, matrix }) => {
        setState({ loading: false, error: null, cards: sortByRoleOrder(cards ?? []), matrix: matrix ?? [] });
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
