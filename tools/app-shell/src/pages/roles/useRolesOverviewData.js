import { useState, useEffect, useCallback } from 'react';
import { Settings, TrendingUp, FileText, Landmark, Package } from 'lucide-react';
import { fetchRolesOverview } from '@/lib/rolesApi.js';
import menuConfig from '../../menu.json' with { type: 'json' };

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

/**
 * ETP-5071 — `windowId -> { group, label, groupOrder }` index built from `menu.json`,
 * this app's real source of truth for category/window display (imported the same way
 * `windows/registry.js` does). The backend's `matrix.categories[]` sources its category
 * names and window labels from the classic AD menu tree instead (`SFRolesOverview.java`,
 * out of scope here) — e.g. "Product" shows under "Master Data Management" instead of
 * "Inventory". `adaptMatrix` below re-resolves both against this index.
 *
 * Flattens every `menu[].items[]` entry that carries an identity id. Same convention as
 * `windows/registry.js`'s `filterMenuGroupsByAccess()` (its own `itemIds` helper treats
 * `windowId`/`processId`/`obuiappProcessId` as equivalent/interchangeable identity keys
 * for menu-filtering) — here each item's identity resolves as `item.windowId ??
 * item.obuiappProcessId ?? item.processId` (first non-null wins; no item sets more than
 * one of these today, so precedence between them doesn't actually arise in practice, but
 * it's written defensively). This is what lets ETP-5071's 3 windowless-but-proxied menu
 * items (`fiscal-monitor`/`fiscal-models` via `windowId`, `not-posted-documents` via
 * `obuiappProcessId`) resolve through this same index like any real window.
 *
 * `groupOrder` is the index of that entry's `menu[]` group in menu.json's OWN declaration
 * order — ETP-5071's product decision is to sort categories by that declaration order,
 * not alphabetically. `itemOrder` (ETP-5071 follow-up) is that same entry's index WITHIN
 * `group.items` — `menu.json`'s `items[]` array is already in the exact order the real
 * sidebar renders them, confirmed live against the Finance group's own order, so
 * `adaptMatrix` below sorts each category's ROWS by `itemOrder` too, not just the
 * categories themselves by `groupOrder` — the backend's `matrix.categories[].windows[]`
 * order is its own alphabetical-by-raw-classic-`AD_Window.name` sort
 * (`SFRolesOverview.java`, out of scope), unrelated to the sidebar's order.
 *
 * Precedence for an id shared by 2+ items (confirmed live, today always a same-group
 * visible/hidden pair — `"123"` People: `contacts`/`business-partner`, `"117"` Finance:
 * `calendar`/`fiscal-calendar` — never cross-group, though this does not assume that can
 * never happen): prefer the entry WITHOUT `hidden: true`; if every entry for that id is
 * hidden (or the first-seen entry already isn't), keep the first one encountered.
 * `itemOrder` travels with whichever candidate wins, same as `group`/`label`. The winning
 * candidate's own `hidden` flag is therefore `true` only when EVERY menu.json entry for
 * that id is hidden (no visible alternative exists) — `adaptMatrix` uses exactly that
 * signal to drop sidebar-hidden windows from the matrix (see ETP-5071 below).
 */
export function buildMenuWindowIndex() {
  const index = new Map();
  const groups = menuConfig?.menu ?? [];
  groups.forEach((group, groupOrder) => {
    group.items?.forEach((item, itemOrder) => {
      const rawId = item?.windowId ?? item?.obuiappProcessId ?? item?.processId;
      if (rawId == null) return;
      const windowId = String(rawId);
      const candidate = { group: group.group, label: item.label, groupOrder, itemOrder, hidden: !!item.hidden };
      const existing = index.get(windowId);
      // Prefer this candidate when there's no existing entry yet, or when the
      // first-seen entry for this id was hidden but this one isn't. Any other
      // combination (existing already visible, or both hidden) keeps the
      // first-encountered entry.
      if (!existing || (existing.hidden && !candidate.hidden)) {
        index.set(windowId, candidate);
      }
    });
  });
  return index;
}

const MENU_WINDOW_INDEX = buildMenuWindowIndex();

/**
 * ETP-5071 — shared "ordered-first, then alphabetical fallback" comparator shape used by
 * both `compareCategoriesByOrder` and `compareRowsByItemOrder`: an entry with a known
 * order value always sorts before one without; two known order values sort numerically
 * between themselves; two entries with no order at all fall back to `fallbackCompare()`.
 */
function compareByOrderThenFallback(orderA, orderB, fallbackCompare) {
  if (orderA != null && orderB != null) return orderA - orderB;
  if (orderA != null) return -1;
  if (orderB != null) return 1;
  return fallbackCompare();
}

/**
 * Flattens `matrix.categories[].windows[]`, resolving each window's category/name against
 * `menuIndex` (see `buildMenuWindowIndex`) instead of trusting the backend's
 * classic-AD-tree grouping, and buckets rows by that RESOLVED category — since two
 * different backend `category.name` buckets can map to the same menu.json `group` (or
 * vice versa), every window is flattened across all backend categories first, then
 * re-bucketed by its resolved category string.
 *
 * A window NOT found in `menuIndex` (e.g. "Roles"/"Usuario", deliberately granted to
 * none of the 4 templates and absent from `menu.json`) falls back to the backend's raw
 * `category.name`/`w.name` — it must never disappear from the matrix just because it
 * isn't in menu.json.
 *
 * ETP-5071 — a window IS excluded from the output entirely when it resolves to a
 * `menuIndex` match whose own `hidden` flag is `true` — meaning every menu.json entry for
 * that id is hidden (see `buildMenuWindowIndex`'s precedence rule: a visible alternative,
 * if one exists, always wins the index slot first). Two confirmed real cases: Match Rule
 * and Periods (`Finance`), both hidden-only in menu.json yet granted real
 * `AD_Window_Access` — an admin configuring "what can this role see" should never be
 * shown a toggle for something nobody can navigate to. This check only fires on an actual
 * match; the "never disappear" fallback above for an absent `menuIndex` entry is
 * unaffected — `match` is `undefined` in that case, not a hidden `true`.
 *
 * Also tracks, per resolved category, the smallest `groupOrder` seen among its windows
 * (that window's menu.json group's own declaration-order index) — used by
 * `compareCategoriesByOrder` to sort categories by menu.json's own declaration order
 * rather than alphabetically. Each row also carries a transient `_itemOrder` (that
 * window's index within its menu.json group, or `null` if absent from `menuIndex`), used
 * by `compareRowsByItemOrder` and stripped again by `adaptMatrix` before it returns, so
 * the shape callers see is unchanged.
 */
function bucketRowsByResolvedCategory(categories, menuIndex) {
  const rowsByCategory = new Map();
  const groupOrderByCategory = new Map();

  for (const category of categories) {
    for (const w of category.windows ?? []) {
      const match = menuIndex.get(String(w.id));
      if (match?.hidden) continue;
      const resolvedCategory = match?.group ?? category.name;
      const resolvedName = match?.label ?? w.name;
      const row = {
        windowId: w.id,
        windowName: resolvedName,
        access: Object.fromEntries(
          Object.entries(w.access ?? {}).map(([roleId, tier]) => [roleId, normalizeTier(tier)])
        ),
        _itemOrder: match?.itemOrder ?? null,
      };
      if (!rowsByCategory.has(resolvedCategory)) rowsByCategory.set(resolvedCategory, []);
      rowsByCategory.get(resolvedCategory).push(row);

      if (match?.groupOrder != null) {
        const currentBest = groupOrderByCategory.get(resolvedCategory);
        if (currentBest == null || match.groupOrder < currentBest) {
          groupOrderByCategory.set(resolvedCategory, match.groupOrder);
        }
      }
    }
  }

  return { rowsByCategory, groupOrderByCategory };
}

/**
 * Sorts resolved category names by the smallest `groupOrder` seen among that category's
 * windows (see `bucketRowsByResolvedCategory`) — menu.json's own declaration order, not
 * alphabetical. A category with no `groupOrder` at all (100% fallback windows) sorts
 * last, alphabetically among themselves.
 */
function compareCategoriesByOrder(a, b, groupOrderByCategory) {
  return compareByOrderThenFallback(groupOrderByCategory.get(a), groupOrderByCategory.get(b), () =>
    a.localeCompare(b)
  );
}

/**
 * ETP-5071 follow-up — sorts rows within a category by `_itemOrder` (see
 * `bucketRowsByResolvedCategory`): the backend's own `category.windows[]` order is just
 * an alphabetical-by-raw-classic-name sort, unrelated to the real sidebar's order, which
 * `menu.json`'s `items[]` array declaration order already matches. A row with no
 * `_itemOrder` at all (the same menu.json-absent fallback case handled above) sorts
 * AFTER every ordered row in that category, alphabetically by `windowName` among
 * themselves.
 */
function compareRowsByItemOrder(a, b) {
  return compareByOrderThenFallback(a._itemOrder, b._itemOrder, () => a.windowName.localeCompare(b.windowName));
}

/**
 * Adapts the backend's `matrix.categories[]` into this page's category-grouped row
 * shape, normalizing every cell's tier (see `normalizeTier`). Delegates: bucketing +
 * category/name resolution + hidden-window exclusion to `bucketRowsByResolvedCategory`,
 * category ordering to `compareCategoriesByOrder`, and row ordering within each category
 * to `compareRowsByItemOrder`. See those functions' JSDoc for the full ETP-5071 rules.
 */
function adaptMatrix(matrix, menuIndex) {
  const categories = matrix?.categories ?? [];
  const { rowsByCategory, groupOrderByCategory } = bucketRowsByResolvedCategory(categories, menuIndex);

  const categoryNames = [...rowsByCategory.keys()].sort((a, b) =>
    compareCategoriesByOrder(a, b, groupOrderByCategory)
  );

  return categoryNames.map((category) => {
    const rows = [...rowsByCategory.get(category)].sort(compareRowsByItemOrder);
    return {
      category,
      rows: rows.map(({ _itemOrder, ...row }) => row),
    };
  });
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
          matrix: adaptMatrix(data?.matrix, MENU_WINDOW_INDEX),
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
